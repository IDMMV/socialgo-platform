-- ============================================================
-- MiZona V6.4 — mapa con límite aproximado de 500 m + Push sin teléfono
-- Ejecutar DESPUÉS de V6, V6.1, V6.2 y Fase 5.
-- ============================================================

begin;

-- Crea la alerta, valida desde servidor el radio y devuelve los eventos Push.
create or replace function public.crear_alerta_mizona_v64(
  p_categoria text,
  p_titulo text,
  p_descripcion text,
  p_distrito text,
  p_zona_referencia text default null,
  p_latitud numeric default null,
  p_longitud numeric default null,
  p_precision_ubicacion text default null,
  p_origen_latitud numeric default null,
  p_origen_longitud numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_precision text;
  v_public_lat numeric;
  v_public_lon numeric;
  v_distance numeric;
  v_broadcast_event bigint;
  v_confirmation_event bigint;
  v_body text;
begin
  if v_user is null then raise exception 'Debes iniciar sesión'; end if;
  if not public.mizona_email_confirmado() then raise exception 'Confirma tu correo antes de reportar'; end if;
  if p_categoria not in ('robo','accidente','agua','luz','persona','mascota','incendio','otro') then raise exception 'Categoría inválida'; end if;
  if char_length(trim(coalesce(p_titulo,''))) < 5 then raise exception 'El título es demasiado corto'; end if;
  if char_length(trim(coalesce(p_descripcion,''))) < 10 then raise exception 'Describe mejor lo ocurrido'; end if;
  if char_length(trim(coalesce(p_distrito,''))) < 2 then raise exception 'Indica el distrito'; end if;
  if p_latitud is null or p_longitud is null then raise exception 'Selecciona dónde ocurrió el evento'; end if;
  if p_origen_latitud is null or p_origen_longitud is null then raise exception 'Activa tu ubicación para validar el radio de seguridad'; end if;

  v_distance := public.mizona_distance_meters(p_origen_latitud,p_origen_longitud,p_latitud,p_longitud);
  -- 550 m permite una tolerancia razonable por precisión GPS, manteniendo el objetivo de 500 m.
  if v_distance is null or v_distance > 550 then
    raise exception 'El evento está a % m. Solo puedes reportar dentro de aproximadamente 500 m', round(v_distance);
  end if;

  v_precision := coalesce(nullif(p_precision_ubicacion,''), case
    when p_categoria in ('accidente','incendio','agua','luz') then 'exacta'
    when p_categoria = 'persona' then 'aprox_150m'
    else 'aprox_50m'
  end);
  if v_precision not in ('exacta','aprox_50m','aprox_150m','solo_zona') then raise exception 'Nivel de privacidad inválido'; end if;

  select c.latitud,c.longitud into v_public_lat,v_public_lon
  from public.mizona_coordenada_publica(p_latitud,p_longitud,v_precision,v_id::text)c;

  insert into public.alertas(
    id,autor_id,tipo_fuente,categoria,titulo,descripcion,distrito,
    zona_referencia,latitud,longitud,precision_ubicacion,estado
  ) values(
    v_id,v_user,'ciudadana',p_categoria,trim(p_titulo),trim(p_descripcion),trim(p_distrito),
    nullif(trim(coalesce(p_zona_referencia,'')),''),v_public_lat,v_public_lon,v_precision,'reportada'
  );

  insert into public.alerta_ubicaciones_privadas(alerta_id,autor_id,latitud_exacta,longitud_exacta)
  values(v_id,v_user,p_latitud,p_longitud);

  insert into public.alerta_actualizaciones(alerta_id,autor_id,tipo,texto,estado_nuevo)
  values(v_id,v_user,'creada','Alerta reportada por un vecino. Pendiente de verificación.','reportada');

  v_body := left(trim(p_titulo)||coalesce(' · '||nullif(trim(coalesce(p_zona_referencia,'')),''),''),220);

  -- Asegura el evento para los vecinos cercanos, incluso si el trigger antiguo no estuviera activo.
  insert into public.notification_events(
    event_type,actor_id,resource_type,resource_id,categoria,latitud,longitud,
    prioridad,titulo,cuerpo,url,payload,dedupe_key
  ) values(
    'alerta_nueva',v_user,'alerta',v_id::text,p_categoria,v_public_lat,v_public_lon,
    case when p_categoria in ('incendio','persona') then 'critical' when p_categoria in ('robo','accidente') then 'high' else 'normal' end,
    '⚠️ Nueva alerta cerca',v_body,'alerta.html?id='||v_id::text,
    jsonb_build_object('estado','reportada','distrito',trim(p_distrito),'precision',v_precision,'radio_metros',500),
    'alerta_nueva:'||v_id::text
  ) on conflict(dedupe_key) do update set
    titulo=excluded.titulo,cuerpo=excluded.cuerpo,payload=excluded.payload
  returning id into v_broadcast_event;

  -- Confirmación directa al autor. Esto permite comprobar el Push desde el mismo celular.
  insert into public.notification_events(
    event_type,actor_id,recipient_id,resource_type,resource_id,categoria,latitud,longitud,
    prioridad,titulo,cuerpo,url,payload,dedupe_key
  ) values(
    'alerta_registrada',v_user,v_user,'alerta',v_id::text,p_categoria,v_public_lat,v_public_lon,
    'normal','✅ Tu alerta fue registrada','MiZona recibió tu reporte. Permanecerá como información ciudadana hasta ser revisado.',
    'alerta.html?id='||v_id::text,
    jsonb_build_object('estado','reportada','alerta_id',v_id),
    'alerta_registrada:'||v_id::text
  ) on conflict(dedupe_key) do update set cuerpo=excluded.cuerpo
  returning id into v_confirmation_event;

  return jsonb_build_object(
    'alerta_id',v_id,
    'distancia_metros',round(v_distance),
    'event_ids',jsonb_build_array(v_broadcast_event,v_confirmation_event)
  );
end;
$$;

grant execute on function public.crear_alerta_mizona_v64(text,text,text,text,text,numeric,numeric,text,numeric,numeric) to authenticated;

commit;

select 'OK: V6.4 mapa limitado a 500 m y eventos Push sin depender del teléfono' as resultado;
