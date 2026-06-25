-- ============================================================
-- MiZona V6 — correo confirmado + OneSignal Push
-- El celular queda opcional y privado. No usa SMS ni OTP.
-- Ejecutar UNA SOLA VEZ después de la V4/V5.
-- ============================================================
begin;

alter table public.perfiles add column if not exists telefono_contacto text;

-- El celular del conductor también puede quedar vacío; la verificación se hace por correo y documentos.
do $$ begin
  alter table public.solicitudes_conductor alter column celular drop not null;
exception when undefined_table then null; end $$;

create or replace function public.mizona_usuario_email_confirmado(p_usuario uuid)
returns boolean
language sql stable security definer
set search_path=auth,public,pg_temp
as $$
  select exists(
    select 1 from auth.users u
    where u.id=p_usuario and u.email_confirmed_at is not null
  )
$$;
revoke all on function public.mizona_usuario_email_confirmado(uuid) from public;
grant execute on function public.mizona_usuario_email_confirmado(uuid) to authenticated;

create or replace function public.mizona_email_confirmado()
returns boolean
language sql stable security definer
set search_path=auth,public,pg_temp
as $$
  select auth.uid() is not null and public.mizona_usuario_email_confirmado(auth.uid())
$$;
revoke all on function public.mizona_email_confirmado() from public;
grant execute on function public.mizona_email_confirmado() to authenticated;

-- Compatibilidad: las funciones antiguas que aún llamen este nombre
-- validarán el correo confirmado, no el teléfono.
create or replace function public.mizona_requiere_telefono_verificado()
returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $$
  select public.mizona_email_confirmado()
$$;
grant execute on function public.mizona_requiere_telefono_verificado() to authenticated;

-- Guarda el celular opcional escrito durante el registro, sin enviar SMS.
create or replace function public.mizona_sync_optional_phone_metadata()
returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_digits text;
begin
  v_digits:=regexp_replace(coalesce(new.raw_user_meta_data->>'phone_pending',''),'\D','','g');
  if length(v_digits)>=9 then v_digits:=right(v_digits,9); end if;
  if v_digits ~ '^9[0-9]{8}$' then
    update public.perfiles p set telefono_contacto='+51'||v_digits
    where p.id=new.id and nullif(trim(coalesce(p.telefono_contacto,'')),'') is null;
  end if;
  return new;
end $$;

drop trigger if exists zz_mizona_optional_phone on auth.users;
create trigger zz_mizona_optional_phone
after insert or update of raw_user_meta_data on auth.users
for each row execute function public.mizona_sync_optional_phone_metadata();

-- Recupera el celular opcional de usuarios creados antes de instalar este parche.
update public.perfiles p
set telefono_contacto='+51'||right(regexp_replace(coalesce(u.raw_user_meta_data->>'phone_pending',''),'\D','','g'),9)
from auth.users u
where p.id=u.id
  and nullif(trim(coalesce(p.telefono_contacto,'')),'') is null
  and right(regexp_replace(coalesce(u.raw_user_meta_data->>'phone_pending',''),'\D','','g'),9) ~ '^9[0-9]{8}$';

create or replace function public.mizona_solicitar_contacto_confianza(p_username text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid();v_contact uuid;v_id uuid;
begin
 if v_user is null then raise exception 'Debes iniciar sesión'; end if;
 if not public.mizona_email_confirmado() then raise exception 'Confirma tu correo antes de agregar contactos de confianza'; end if;
 select id into v_contact from public.perfiles where lower(username)=lower(trim(replace(p_username,'@',''))) limit 1;
 if v_contact is null then raise exception 'No encontramos ese usuario'; end if;
 if v_contact=v_user then raise exception 'No puedes agregarte a ti mismo'; end if;
 if not public.mizona_usuario_email_confirmado(v_contact) then raise exception 'El contacto debe confirmar su correo antes de aceptar esta función'; end if;
 insert into public.contactos_confianza(propietario_id,contacto_id,estado) values(v_user,v_contact,'pendiente')
 on conflict(propietario_id,contacto_id) do update set estado='pendiente',creado_en=now(),respondido_en=null returning id into v_id;
 insert into public.notificaciones(usuario_id,actor_id,tipo) values(v_contact,v_user,'sistema');
 insert into public.notification_events(event_type,actor_id,recipient_id,resource_type,resource_id,prioridad,titulo,cuerpo,url,payload,dedupe_key)
 values('contacto_confianza_solicitud',v_user,v_contact,'contacto_confianza',v_id::text,'normal','Nueva invitación de confianza','Un vecino te invitó a ser su contacto de confianza.','contactos-confianza.html',jsonb_build_object('solicitud_id',v_id),'contacto_confianza_solicitud:'||v_id::text)
 on conflict(dedupe_key) do update set titulo=excluded.titulo,cuerpo=excluded.cuerpo,payload=excluded.payload,estado='pending',procesado_en=null,error=null;
 return v_id;
end $$;

create or replace function public.mizona_solicitar_proveedor(p_tipo text,p_nombre text,p_categoria text,p_descripcion text,p_distrito text,p_zona text,p_whatsapp text,p_ruc text,p_mensaje text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;begin
 if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
 if not public.mizona_email_confirmado() then raise exception 'Confirma tu correo antes de solicitar autorización'; end if;
 if p_tipo not in('independiente','negocio','organizacion') then raise exception 'Tipo inválido'; end if;
 if length(trim(coalesce(p_nombre,'')))<3 or length(trim(coalesce(p_descripcion,'')))<20 then raise exception 'Completa el nombre y una descripción detallada'; end if;
 select id into v_id from public.solicitudes_proveedor where usuario_id=auth.uid() and estado in('pendiente','observado','aprobado') order by creado_en desc limit 1;
 if v_id is not null then
   if exists(select 1 from public.solicitudes_proveedor where id=v_id and estado='pendiente') then raise exception 'Tu solicitud ya está en revisión'; end if;
   if exists(select 1 from public.solicitudes_proveedor where id=v_id and estado='aprobado') then raise exception 'Ya eres un proveedor aprobado'; end if;
   update public.solicitudes_proveedor set tipo=p_tipo,nombre_comercial=trim(p_nombre),categoria=trim(p_categoria),descripcion=trim(p_descripcion),distrito=trim(p_distrito),zona_atencion=nullif(trim(coalesce(p_zona,'')),''),whatsapp=nullif(trim(coalesce(p_whatsapp,'')),''),ruc=nullif(trim(coalesce(p_ruc,'')),''),mensaje_admin=nullif(trim(coalesce(p_mensaje,'')),''),estado='pendiente',observacion_admin=null,revisado_por=null,revisado_en=null,actualizado_en=now() where id=v_id;
 else
   insert into public.solicitudes_proveedor(usuario_id,tipo,nombre_comercial,categoria,descripcion,distrito,zona_atencion,whatsapp,ruc,mensaje_admin)
   values(auth.uid(),p_tipo,trim(p_nombre),trim(p_categoria),trim(p_descripcion),trim(p_distrito),nullif(trim(coalesce(p_zona,'')),''),nullif(trim(coalesce(p_whatsapp,'')),''),nullif(trim(coalesce(p_ruc,'')),''),nullif(trim(coalesce(p_mensaje,'')),'')) returning id into v_id;
 end if;
 update public.perfiles set proveedor_estado='pendiente',proveedor_tipo=p_tipo,proveedor_actualizado_en=now() where id=auth.uid(); return v_id;
end $$;

create or replace function public.mizona_solicitar_o_abrir_chat(p_otro_usuario uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_user uuid:=auth.uid();v_conversation uuid;v_request uuid;v_event bigint;v_allowed boolean:=false;v_actor text;
begin
 if v_user is null then raise exception 'Debes iniciar sesión'; end if;
 if p_otro_usuario is null or p_otro_usuario=v_user then raise exception 'Usuario inválido'; end if;
 if not public.mizona_email_confirmado() then raise exception 'Confirma tu correo antes de iniciar un chat'; end if;
 if not public.mizona_usuario_email_confirmado(p_otro_usuario) then raise exception 'Este usuario todavía no confirmó su correo'; end if;
 if exists(select 1 from public.usuarios_bloqueados where (bloqueador_id=v_user and bloqueado_id=p_otro_usuario) or (bloqueador_id=p_otro_usuario and bloqueado_id=v_user)) then raise exception 'No se puede iniciar la conversación porque existe un bloqueo'; end if;

 select c.id into v_conversation
 from public.conversaciones c
 join public.conversacion_participantes a on a.conversacion_id=c.id and a.usuario_id=v_user
 join public.conversacion_participantes b on b.conversacion_id=c.id and b.usuario_id=p_otro_usuario
 where (select count(*) from public.conversacion_participantes x where x.conversacion_id=c.id)=2
 order by c.creada_en desc limit 1;
 if v_conversation is not null then return jsonb_build_object('estado','abierta','conversation_id',v_conversation); end if;

 v_allowed:=
   exists(select 1 from public.solicitudes_amistad a where a.estado='aceptada' and ((a.solicitante_id=v_user and a.destinatario_id=p_otro_usuario) or (a.solicitante_id=p_otro_usuario and a.destinatario_id=v_user)))
   or exists(select 1 from public.contactos_confianza c where c.estado='aceptado' and ((c.propietario_id=v_user and c.contacto_id=p_otro_usuario) or (c.propietario_id=p_otro_usuario and c.contacto_id=v_user)))
   or coalesce((select proveedor_estado='aprobado' from public.perfiles where id=p_otro_usuario),false)
   or exists(select 1 from public.solicitudes_chat s where s.estado='aceptada' and ((s.solicitante_id=v_user and s.destinatario_id=p_otro_usuario) or (s.solicitante_id=p_otro_usuario and s.destinatario_id=v_user)));

 if v_allowed then
   v_conversation:=public.crear_o_obtener_conversacion(p_otro_usuario);
   return jsonb_build_object('estado','abierta','conversation_id',v_conversation);
 end if;

 select id into v_request from public.solicitudes_chat
 where estado='pendiente' and ((solicitante_id=v_user and destinatario_id=p_otro_usuario) or (solicitante_id=p_otro_usuario and destinatario_id=v_user))
 order by creado_en desc limit 1;
 if v_request is not null then return jsonb_build_object('estado','pendiente','request_id',v_request,'ya_existia',true); end if;

 insert into public.solicitudes_chat(solicitante_id,destinatario_id) values(v_user,p_otro_usuario) returning id into v_request;
 select coalesce(nullif(nombre_visible,''),nullif(username,''),'Un vecino') into v_actor from public.perfiles where id=v_user;
 insert into public.notification_events(event_type,actor_id,recipient_id,resource_type,resource_id,prioridad,titulo,cuerpo,url,payload,dedupe_key)
 values('social_solicitud_chat',v_user,p_otro_usuario,'solicitud_chat',v_request::text,'normal','Solicitud de conversación',v_actor||' quiere enviarte mensajes privados.','mensajes.html',jsonb_build_object('solicitud_id',v_request),'social_solicitud_chat:'||v_request::text)
 returning id into v_event;
 return jsonb_build_object('estado','pendiente','request_id',v_request,'event_id',v_event);
end $$;

create or replace function public.mizona_enviar_mensaje(p_conversacion uuid,p_contenido text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid();v_other uuid;v_message uuid;v_event bigint;v_actor text;begin
 if v_user is null then raise exception 'Debes iniciar sesión'; end if;
 if not public.mizona_email_confirmado() then raise exception 'Confirma tu correo para enviar mensajes'; end if;
 if length(trim(coalesce(p_contenido,''))) not between 1 and 2000 then raise exception 'Mensaje inválido'; end if;
 if not public.es_participante_conversacion(p_conversacion,v_user) then raise exception 'No perteneces a esta conversación'; end if;
 select usuario_id into v_other from public.conversacion_participantes where conversacion_id=p_conversacion and usuario_id<>v_user limit 1;
 if exists(select 1 from public.usuarios_bloqueados where (bloqueador_id=v_user and bloqueado_id=v_other) or (bloqueador_id=v_other and bloqueado_id=v_user)) then raise exception 'No se puede enviar el mensaje porque existe un bloqueo'; end if;
 insert into public.mensajes(conversacion_id,remitente_id,contenido) values(p_conversacion,v_user,trim(p_contenido)) returning id into v_message;
 select coalesce(nullif(nombre_visible,''),nullif(username,''),'Un vecino') into v_actor from public.perfiles where id=v_user;
 insert into public.notification_events(event_type,actor_id,recipient_id,resource_type,resource_id,prioridad,titulo,cuerpo,url,payload,dedupe_key)
 values('social_mensaje',v_user,v_other,'mensaje',v_message::text,'normal','Nuevo mensaje de '||v_actor,left(trim(p_contenido),160),'mensajes.html?c='||p_conversacion::text,jsonb_build_object('conversacion_id',p_conversacion,'mensaje_id',v_message),'social_mensaje:'||v_message::text)
 returning id into v_event;
 return jsonb_build_object('mensaje_id',v_message,'event_id',v_event,'destinatario_id',v_other);
end $$;

create or replace function public.crear_alerta_emergencia_mizona(
 p_tipo text,p_descripcion text,p_distrito text,p_zona text,p_lat numeric,p_lon numeric,p_precision text default 'aprox_50m',p_destino text default 'vecinos',p_radio integer default 500,p_ocurre_ahora boolean default true)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_user uuid:=auth.uid();v_categoria text;v_titulo text;v_alerta uuid:=gen_random_uuid();v_events bigint[]:=array[]::bigint[];
 r record;v_event bigint;v_name text;v_precision text;v_public_lat numeric;v_public_lon numeric;
begin
 if v_user is null then raise exception 'Debes iniciar sesión'; end if;
 if not public.mizona_email_confirmado() then raise exception 'Confirma tu correo antes de enviar una alerta'; end if;
 if p_tipo not in('robo','sospechoso','accidente','incendio','emergencia_medica','violencia','persona_desaparecida','mascota','agua','luz','via_publica','otro') then raise exception 'Selecciona un tipo de alerta válido'; end if;
 if p_destino not in('vecinos','confianza','ambos') then raise exception 'Destino inválido'; end if;
 if char_length(trim(coalesce(p_descripcion,'')))<10 then raise exception 'Describe mejor lo ocurrido'; end if;
 if char_length(trim(coalesce(p_distrito,'')))<2 then raise exception 'Indica el distrito'; end if;
 v_precision:=coalesce(nullif(p_precision,''),'aprox_50m');
 if v_precision not in('exacta','aprox_50m','aprox_150m','solo_zona') then raise exception 'Nivel de privacidad inválido'; end if;
 v_categoria:=case p_tipo when 'sospechoso' then 'robo' when 'emergencia_medica' then 'accidente' when 'violencia' then 'otro' when 'persona_desaparecida' then 'persona' when 'via_publica' then 'otro' else p_tipo end;
 v_titulo:=case p_tipo when 'robo' then 'Posible robo o asalto' when 'sospechoso' then 'Persona o vehículo sospechoso' when 'accidente' then 'Accidente de tránsito' when 'incendio' then 'Incendio o fuga de gas' when 'emergencia_medica' then 'Emergencia médica' when 'violencia' then 'Violencia o pelea' when 'persona_desaparecida' then 'Persona desaparecida' when 'mascota' then 'Mascota perdida' when 'agua' then 'Problema con el servicio de agua' when 'luz' then 'Problema con el servicio eléctrico' when 'via_publica' then 'Riesgo en la vía pública' else 'Alerta vecinal' end;
 select c.latitud,c.longitud into v_public_lat,v_public_lon from public.mizona_coordenada_publica(p_lat,p_lon,v_precision,v_alerta::text)c;
 insert into public.alertas(id,autor_id,tipo_fuente,categoria,tipo_detalle,titulo,descripcion,distrito,zona_referencia,latitud,longitud,precision_ubicacion,estado,ocurre_ahora,radio_metros,destino_alerta)
 values(v_alerta,v_user,'ciudadana',v_categoria,p_tipo,v_titulo,trim(p_descripcion),trim(p_distrito),nullif(trim(coalesce(p_zona,'')),''),v_public_lat,v_public_lon,v_precision,'reportada',p_ocurre_ahora,greatest(100,least(coalesce(p_radio,500),5000)),p_destino);
 insert into public.alerta_ubicaciones_privadas(alerta_id,autor_id,latitud_exacta,longitud_exacta) values(v_alerta,v_user,p_lat,p_lon);
 insert into public.alerta_actualizaciones(alerta_id,autor_id,tipo,texto,estado_nuevo) values(v_alerta,v_user,'creada','Alerta reportada por un vecino. Pendiente de verificación.','reportada');
 select nombre_visible into v_name from public.perfiles where id=v_user;
 if p_destino in('confianza','ambos') then
   for r in select contacto_id from public.contactos_confianza where propietario_id=v_user and estado='aceptado' and recibir_alertas loop
     insert into public.notification_events(event_type,actor_id,recipient_id,resource_type,resource_id,categoria,latitud,longitud,prioridad,titulo,cuerpo,url,payload,dedupe_key)
     values('contacto_emergencia',v_user,r.contacto_id,'alerta',v_alerta::text,v_categoria,p_lat,p_lon,'critical','🆘 '||coalesce(v_name,'Un contacto')||' solicita ayuda',v_titulo||'. Ubicación compartida temporalmente.','alerta.html?id='||v_alerta::text,jsonb_build_object('alerta_id',v_alerta,'target_user_ids',jsonb_build_array(r.contacto_id),'sin_verificar',true),'contacto_emergencia:'||v_alerta::text||':'||r.contacto_id::text) returning id into v_event;
     v_events:=array_append(v_events,v_event);
   end loop;
 end if;
 return jsonb_build_object('alerta_id',v_alerta,'event_ids',to_jsonb(v_events),'estado','reportada','verificacion','sin_verificar');
end $$;

create or replace function public.mizona_enviar_solicitud_conductor(
  p_nombres text,p_celular text,p_dni text,p_licencia_numero text,p_licencia_categoria text,
  p_licencia_vencimiento date,p_vehiculo_marca text,p_vehiculo_modelo text,p_vehiculo_anio integer,
  p_vehiculo_color text,p_placa text,p_soat_vencimiento date,p_revision_vencimiento date
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  if not public.mizona_email_confirmado() then raise exception 'Confirma tu correo antes de enviar la solicitud'; end if;
  if length(trim(coalesce(p_nombres,'')))<5 then raise exception 'Completa tus nombres'; end if;
  if length(regexp_replace(coalesce(p_dni,''),'\D','','g'))<>8 then raise exception 'El DNI debe tener 8 dígitos'; end if;
  if length(trim(coalesce(p_placa,'')))<5 then raise exception 'Escribe una placa válida'; end if;

  insert into public.solicitudes_conductor(
    usuario_id,nombres,celular,dni,licencia_numero,licencia_categoria,licencia_vencimiento,
    vehiculo_marca,vehiculo_modelo,vehiculo_anio,vehiculo_color,placa,soat_vencimiento,revision_vencimiento,
    estado,observacion_admin,actualizado_en
  ) values(
    auth.uid(),trim(p_nombres),nullif(trim(coalesce(p_celular,'')),''),regexp_replace(p_dni,'\D','','g'),upper(trim(p_licencia_numero)),upper(trim(p_licencia_categoria)),p_licencia_vencimiento,
    trim(p_vehiculo_marca),trim(p_vehiculo_modelo),p_vehiculo_anio,trim(coalesce(p_vehiculo_color,'')),upper(trim(p_placa)),p_soat_vencimiento,p_revision_vencimiento,
    'pendiente',null,now()
  )
  on conflict(usuario_id) do update set
    nombres=excluded.nombres,celular=excluded.celular,dni=excluded.dni,
    licencia_numero=excluded.licencia_numero,licencia_categoria=excluded.licencia_categoria,licencia_vencimiento=excluded.licencia_vencimiento,
    vehiculo_marca=excluded.vehiculo_marca,vehiculo_modelo=excluded.vehiculo_modelo,vehiculo_anio=excluded.vehiculo_anio,
    vehiculo_color=excluded.vehiculo_color,placa=excluded.placa,soat_vencimiento=excluded.soat_vencimiento,
    revision_vencimiento=excluded.revision_vencimiento,estado='pendiente',observacion_admin=null,revisado_por=null,revisado_en=null,actualizado_en=now()
  returning id into v_id;
  return v_id;
end $$;

grant execute on function public.mizona_solicitar_contacto_confianza(text) to authenticated;
grant execute on function public.mizona_solicitar_proveedor(text,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.mizona_solicitar_o_abrir_chat(uuid) to authenticated;
grant execute on function public.mizona_enviar_mensaje(uuid,text) to authenticated;
grant execute on function public.crear_alerta_emergencia_mizona(text,text,text,text,numeric,numeric,text,text,integer,boolean) to authenticated;
grant execute on function public.mizona_enviar_solicitud_conductor(text,text,text,text,text,date,text,text,integer,text,text,date,date) to authenticated;

-- Evidencias de alertas: cuenta con correo confirmado.
drop policy if exists "Usuarios verificados aportan evidencia" on public.alerta_aportes;
drop policy if exists "Usuarios con correo confirmado aportan evidencia" on public.alerta_aportes;
create policy "Usuarios con correo confirmado aportan evidencia" on public.alerta_aportes
for insert to authenticated with check (
  usuario_id=auth.uid() and public.mizona_email_confirmado()
);

-- Vista administrativa: el celular es opcional, no verificado.
create or replace view public.solicitudes_proveedor_admin with(security_invoker=true) as
select s.*,p.username,p.nombre_visible,p.avatar_url,p.telefono_verificado,p.telefono_contacto
from public.solicitudes_proveedor s join public.perfiles p on p.id=s.usuario_id;
grant select on public.solicitudes_proveedor_admin to authenticated;

-- El distintivo público queda reservado para proveedores e instituciones aprobadas.
create or replace view public.perfiles_publicos
with(security_invoker=true) as
select
  p.id,p.username,p.nombre_visible,p.biografia,p.avatar_url,p.portada_url,p.ultima_actividad,
  p.tipo_perfil,p.privacidad_perfil,p.permitir_seguidores,p.mostrar_distrito_publico,
  case when p.mostrar_distrito_publico then p.distrito else null end as distrito,
  p.creado_en,(p.proveedor_estado='aprobado' or p.tipo_perfil in('institucion','organizacion')) as verificado,p.proveedor_estado,p.proveedor_tipo,
  (select count(*) from public.seguidores s where s.seguido_id=p.id) total_seguidores,
  (select count(*) from public.seguidores s where s.seguidor_id=p.id) total_seguidos,
  exists(select 1 from public.seguidores s where s.seguidor_id=auth.uid() and s.seguido_id=p.id) siguiendo,
  exists(select 1 from public.solicitudes_seguimiento ss where ss.solicitante_id=auth.uid() and ss.destinatario_id=p.id and ss.estado='pendiente') seguimiento_pendiente,
  (select sa.estado from public.solicitudes_amistad sa
    where ((sa.solicitante_id=auth.uid() and sa.destinatario_id=p.id) or (sa.solicitante_id=p.id and sa.destinatario_id=auth.uid()))
      and sa.estado in('pendiente','aceptada') order by sa.creado_en desc limit 1) estado_amistad
from public.perfiles p where p.estado='activo';
grant select on public.perfiles_publicos to anon,authenticated;

commit;
select 'OK: MiZona usa correo confirmado + OneSignal Push; celular opcional' as resultado;
