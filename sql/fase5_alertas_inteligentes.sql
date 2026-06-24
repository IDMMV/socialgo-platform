-- =====================================================================
-- MiZona.pe · Fase 5 · Alertas inteligentes y participación vecinal
-- Ejecutar una sola vez en Supabase → SQL Editor.
-- Requiere las fases anteriores (perfiles, alertas y notificaciones).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Nuevos datos de seguridad, moderación y participación
-- ---------------------------------------------------------------------
alter table public.alertas
  add column if not exists precision_ubicacion text not null default 'exacta',
  add column if not exists motivo_moderacion text,
  add column if not exists moderada_por uuid references public.perfiles(id) on delete set null,
  add column if not exists moderada_en timestamptz,
  add column if not exists version integer not null default 1,
  add column if not exists total_seguidores integer not null default 0,
  add column if not exists total_util_si integer not null default 0,
  add column if not exists total_util_no integer not null default 0,
  add column if not exists resolucion_estado text not null default 'ninguna';

do $$ begin
  alter table public.alertas add constraint alertas_precision_ubicacion_check
    check (precision_ubicacion in ('exacta','aprox_50m','aprox_150m','solo_zona'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.alertas add constraint alertas_resolucion_estado_check
    check (resolucion_estado in ('ninguna','propuesta','confirmada','rechazada'));
exception when duplicate_object then null; end $$;

create table if not exists public.alerta_ubicaciones_privadas (
  alerta_id uuid primary key references public.alertas(id) on delete cascade,
  autor_id uuid not null references auth.users(id) on delete cascade,
  latitud_exacta numeric(10,7),
  longitud_exacta numeric(10,7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alerta_seguimientos (
  alerta_id uuid not null references public.alertas(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(alerta_id, usuario_id)
);

create table if not exists public.alerta_utilidad (
  alerta_id uuid not null references public.alertas(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  util boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(alerta_id, usuario_id)
);

create table if not exists public.alerta_actualizaciones (
  id bigint generated always as identity primary key,
  alerta_id uuid not null references public.alertas(id) on delete cascade,
  autor_id uuid references auth.users(id) on delete set null,
  tipo text not null default 'actualizacion'
    check (tipo in ('creada','actualizacion','moderacion','correccion','resolucion','estado')),
  texto text not null check (char_length(texto) between 2 and 1000),
  estado_nuevo text,
  visible boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists alerta_actualizaciones_alerta_idx
  on public.alerta_actualizaciones(alerta_id, created_at desc);

create table if not exists public.alerta_resoluciones (
  alerta_id uuid primary key references public.alertas(id) on delete cascade,
  propuesta_por uuid not null references auth.users(id) on delete cascade,
  descripcion text not null check (char_length(descripcion) between 5 and 1000),
  evidencia_url text,
  estado text not null default 'propuesta'
    check (estado in ('propuesta','confirmada','rechazada')),
  total_confirmaciones integer not null default 0,
  moderada_por uuid references auth.users(id) on delete set null,
  moderada_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alerta_resolucion_confirmaciones (
  alerta_id uuid not null references public.alerta_resoluciones(alerta_id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(alerta_id, usuario_id)
);

create table if not exists public.sugerencias_mizona (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references auth.users(id) on delete set null,
  tipo text not null default 'mejora'
    check (tipo in ('mejora','problema','seguridad','negocios','mapa','otro')),
  area text not null default 'general',
  titulo text not null check (char_length(titulo) between 5 and 120),
  descripcion text not null check (char_length(descripcion) between 10 and 2000),
  pagina_origen text,
  estado text not null default 'recibida'
    check (estado in ('recibida','en_revision','planificada','implementada','descartada')),
  respuesta_admin text,
  revisada_por uuid references auth.users(id) on delete set null,
  revisada_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sugerencias_mizona_estado_idx
  on public.sugerencias_mizona(estado, created_at desc);

-- Preferencias adicionales. Si la fase push no está instalada, estas líneas
-- simplemente se omiten mediante el bloque condicional.
do $$
begin
  if to_regclass('public.notification_preferences') is not null then
    alter table public.notification_preferences
      add column if not exists solo_verificadas boolean not null default false,
      add column if not exists alertas_seguidas boolean not null default true,
      add column if not exists cambios_estado_alerta boolean not null default true;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Funciones geográficas y protección de la ubicación exacta
-- ---------------------------------------------------------------------
create or replace function public.mizona_distance_meters(
  p_lat1 numeric, p_lon1 numeric, p_lat2 numeric, p_lon2 numeric
)
returns numeric
language sql
immutable
as $$
  select case
    when p_lat1 is null or p_lon1 is null or p_lat2 is null or p_lon2 is null then null
    else 6371000 * 2 * asin(
      sqrt(
        power(sin(radians((p_lat2 - p_lat1) / 2)), 2) +
        cos(radians(p_lat1)) * cos(radians(p_lat2)) *
        power(sin(radians((p_lon2 - p_lon1) / 2)), 2)
      )
    )
  end;
$$;

create or replace function public.mizona_coordenada_publica(
  p_latitud numeric,
  p_longitud numeric,
  p_precision text,
  p_semilla text
)
returns table(latitud numeric, longitud numeric)
language plpgsql
immutable
set search_path = public
as $$
declare
  v_radio numeric := 0;
  v_hash bytea;
  v_angulo numeric;
  v_factor numeric;
  v_lat_delta numeric;
  v_lon_delta numeric;
begin
  if p_latitud is null or p_longitud is null then
    return query select null::numeric, null::numeric;
    return;
  end if;

  if p_precision = 'exacta' then
    return query select round(p_latitud,7), round(p_longitud,7);
    return;
  elsif p_precision = 'aprox_50m' then
    v_radio := 50;
  elsif p_precision = 'aprox_150m' then
    v_radio := 150;
  else
    v_radio := 450;
  end if;

  v_hash := digest(coalesce(p_semilla,'mizona'),'sha256');
  v_angulo := (get_byte(v_hash,0)::numeric / 255) * 2 * pi();
  v_factor := 0.65 + (get_byte(v_hash,1)::numeric / 255) * 0.35;
  v_lat_delta := (v_radio * v_factor / 111320) * sin(v_angulo);
  v_lon_delta := (v_radio * v_factor / greatest(111320 * abs(cos(radians(p_latitud))), 1000)) * cos(v_angulo);

  return query select
    round((p_latitud + v_lat_delta)::numeric,7),
    round((p_longitud + v_lon_delta)::numeric,7);
end;
$$;

-- Guardar las coordenadas existentes como privadas antes de aplicar
-- privacidad a los eventos antiguos.
insert into public.alerta_ubicaciones_privadas(alerta_id, autor_id, latitud_exacta, longitud_exacta)
select id, autor_id, latitud, longitud
from public.alertas
where latitud is not null and longitud is not null
on conflict (alerta_id) do nothing;

update public.alertas
set precision_ubicacion = case
  when categoria in ('accidente','incendio','agua','luz') then 'exacta'
  when categoria = 'persona' then 'aprox_150m'
  when categoria in ('robo','mascota','otro') then 'aprox_50m'
  else 'aprox_50m'
end
where precision_ubicacion is null or precision_ubicacion = 'exacta';

-- Recalcula coordenadas públicas de eventos antiguos según la categoría.
update public.alertas a
set latitud = c.latitud,
    longitud = c.longitud
from public.alerta_ubicaciones_privadas p,
lateral public.mizona_coordenada_publica(
  p.latitud_exacta, p.longitud_exacta, a.precision_ubicacion, a.id::text
) c
where p.alerta_id = a.id;

-- ---------------------------------------------------------------------
-- 3. Crear una alerta mediante RPC (única vía de publicación)
-- ---------------------------------------------------------------------
create or replace function public.crear_alerta_mizona(
  p_categoria text,
  p_titulo text,
  p_descripcion text,
  p_distrito text,
  p_zona_referencia text default null,
  p_latitud numeric default null,
  p_longitud numeric default null,
  p_precision_ubicacion text default null
)
returns uuid
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
begin
  if v_user is null then raise exception 'Debes iniciar sesión'; end if;
  if p_categoria not in ('robo','accidente','agua','luz','persona','mascota','incendio','otro') then
    raise exception 'Categoría inválida';
  end if;
  if char_length(trim(coalesce(p_titulo,''))) < 5 then raise exception 'El título es demasiado corto'; end if;
  if char_length(trim(coalesce(p_descripcion,''))) < 10 then raise exception 'Describe mejor lo ocurrido'; end if;
  if char_length(trim(coalesce(p_distrito,''))) < 2 then raise exception 'Indica el distrito'; end if;

  v_precision := coalesce(nullif(p_precision_ubicacion,''), case
    when p_categoria in ('accidente','incendio','agua','luz') then 'exacta'
    when p_categoria = 'persona' then 'aprox_150m'
    else 'aprox_50m'
  end);

  if v_precision not in ('exacta','aprox_50m','aprox_150m','solo_zona') then
    raise exception 'Nivel de privacidad inválido';
  end if;

  select c.latitud, c.longitud into v_public_lat, v_public_lon
  from public.mizona_coordenada_publica(p_latitud,p_longitud,v_precision,v_id::text) c;

  insert into public.alertas(
    id, autor_id, tipo_fuente, categoria, titulo, descripcion, distrito,
    zona_referencia, latitud, longitud, precision_ubicacion, estado
  ) values (
    v_id, v_user, 'ciudadana', p_categoria, trim(p_titulo), trim(p_descripcion),
    trim(p_distrito), nullif(trim(coalesce(p_zona_referencia,'')),''),
    v_public_lat, v_public_lon, v_precision, 'reportada'
  );

  insert into public.alerta_ubicaciones_privadas(
    alerta_id, autor_id, latitud_exacta, longitud_exacta
  ) values (v_id, v_user, p_latitud, p_longitud);

  insert into public.alerta_actualizaciones(alerta_id,autor_id,tipo,texto,estado_nuevo)
  values(v_id,v_user,'creada','Alerta reportada por un vecino.','reportada');

  return v_id;
end;
$$;

grant execute on function public.crear_alerta_mizona(text,text,text,text,text,numeric,numeric,text) to authenticated;

-- Impide saltarse la privacidad mediante inserciones o actualizaciones directas.
drop policy if exists "usuarios crean alertas" on public.alertas;
drop policy if exists "autor actualiza alerta" on public.alertas;
revoke insert, update on public.alertas from authenticated;

-- El autor y el administrador pueden ver también sus alertas retiradas.
drop policy if exists "alertas visibles" on public.alertas;
create policy "alertas visibles" on public.alertas
for select to anon,authenticated
using (
  estado not in ('ocultada','falsa')
  or autor_id = auth.uid()
  or public.is_admin()
);

-- Vista exclusiva de moderación con la coordenada exacta.
create or replace view public.alertas_admin_moderacion as
select a.*,p.latitud_exacta,p.longitud_exacta
from public.alertas a
left join public.alerta_ubicaciones_privadas p on p.alerta_id=a.id
where public.is_admin();

grant select on public.alertas_admin_moderacion to authenticated;

-- ---------------------------------------------------------------------
-- 4. Detección de alertas similares
-- ---------------------------------------------------------------------
create or replace function public.detectar_alertas_similares(
  p_categoria text,
  p_latitud numeric,
  p_longitud numeric,
  p_radio_metros integer default 350,
  p_horas integer default 24
)
returns table(
  id uuid,
  titulo text,
  zona_referencia text,
  estado text,
  total_confirmaciones integer,
  distancia_metros numeric,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id, a.titulo, a.zona_referencia, a.estado, a.total_confirmaciones,
    public.mizona_distance_meters(
      p_latitud,p_longitud,p.latitud_exacta,p.longitud_exacta
    )::numeric as distancia_metros,
    a.created_at
  from public.alertas a
  join public.alerta_ubicaciones_privadas p on p.alerta_id = a.id
  where a.categoria = p_categoria
    and a.estado in ('reportada','en_revision','verificada')
    and a.created_at >= now() - make_interval(hours => greatest(1,least(p_horas,168)))
    and p.latitud_exacta is not null and p.longitud_exacta is not null
    and public.mizona_distance_meters(
      p_latitud,p_longitud,p.latitud_exacta,p.longitud_exacta
    ) <= greatest(50,least(p_radio_metros,2000))
  order by distancia_metros asc, a.created_at desc
  limit 6;
$$;

grant execute on function public.detectar_alertas_similares(text,numeric,numeric,integer,integer) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Confirmar, seguir y valorar utilidad
-- ---------------------------------------------------------------------
create or replace function public.sincronizar_total_confirmaciones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_alerta uuid;
begin
  v_alerta := coalesce(new.alerta_id, old.alerta_id);
  update public.alertas
  set total_confirmaciones = (
    select count(*) from public.alerta_confirmaciones where alerta_id = v_alerta
  )
  where id = v_alerta;
  return coalesce(new,old);
end;
$$;

drop trigger if exists sync_total_confirmaciones_insert on public.alerta_confirmaciones;
create trigger sync_total_confirmaciones_insert
after insert on public.alerta_confirmaciones
for each row execute function public.sincronizar_total_confirmaciones();

drop trigger if exists sync_total_confirmaciones_delete on public.alerta_confirmaciones;
create trigger sync_total_confirmaciones_delete
after delete on public.alerta_confirmaciones
for each row execute function public.sincronizar_total_confirmaciones();

create or replace function public.confirmar_alerta(
  p_alerta_id uuid,
  p_latitud numeric default null,
  p_longitud numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_alerta public.alertas;
  v_rows integer := 0;
  v_total integer;
begin
  if v_user is null then raise exception 'Debes iniciar sesión'; end if;
  select * into v_alerta from public.alertas where id = p_alerta_id;
  if not found then raise exception 'La alerta no existe'; end if;
  if v_alerta.autor_id = v_user then raise exception 'No puedes confirmar tu propia alerta'; end if;

  insert into public.alerta_confirmaciones(alerta_id,usuario_id,latitud,longitud)
  values(p_alerta_id,v_user,p_latitud,p_longitud)
  on conflict (alerta_id,usuario_id) do nothing;
  get diagnostics v_rows = row_count;

  select count(*) into v_total from public.alerta_confirmaciones where alerta_id=p_alerta_id;
  update public.alertas set total_confirmaciones=v_total where id=p_alerta_id;

  return jsonb_build_object(
    'ok',true,
    'ya_confirmada',v_rows=0,
    'mensaje',case when v_rows>0 then 'Confirmación registrada' else 'Ya confirmaste esta alerta' end,
    'total',v_total
  );
end;
$$;

grant execute on function public.confirmar_alerta(uuid,numeric,numeric) to authenticated;

create or replace function public.seguir_alerta(p_alerta_id uuid, p_seguir boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_total integer;
begin
  if v_user is null then raise exception 'Debes iniciar sesión'; end if;
  if not exists(select 1 from public.alertas where id=p_alerta_id) then raise exception 'La alerta no existe'; end if;

  if p_seguir then
    insert into public.alerta_seguimientos(alerta_id,usuario_id)
    values(p_alerta_id,v_user)
    on conflict do nothing;
  else
    delete from public.alerta_seguimientos
    where alerta_id=p_alerta_id and usuario_id=v_user;
  end if;

  select count(*) into v_total from public.alerta_seguimientos where alerta_id=p_alerta_id;
  update public.alertas set total_seguidores=v_total where id=p_alerta_id;

  return jsonb_build_object('siguiendo',p_seguir,'total',v_total);
end;
$$;

grant execute on function public.seguir_alerta(uuid,boolean) to authenticated;

create or replace function public.valorar_utilidad_alerta(p_alerta_id uuid, p_util boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_si integer;
  v_no integer;
begin
  if v_user is null then raise exception 'Debes iniciar sesión'; end if;
  if not exists(select 1 from public.alertas where id=p_alerta_id) then raise exception 'La alerta no existe'; end if;

  insert into public.alerta_utilidad(alerta_id,usuario_id,util)
  values(p_alerta_id,v_user,p_util)
  on conflict(alerta_id,usuario_id)
  do update set util=excluded.util,updated_at=now();

  select count(*) filter(where util), count(*) filter(where not util)
  into v_si,v_no
  from public.alerta_utilidad where alerta_id=p_alerta_id;

  update public.alertas set total_util_si=v_si,total_util_no=v_no where id=p_alerta_id;
  return jsonb_build_object('util',p_util,'si',v_si,'no',v_no);
end;
$$;

grant execute on function public.valorar_utilidad_alerta(uuid,boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Actualizaciones, correcciones y moderación transparente
-- ---------------------------------------------------------------------
create or replace function public.agregar_actualizacion_alerta(
  p_alerta_id uuid,
  p_texto text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id bigint;
  v_alerta public.alertas;
begin
  if v_user is null then raise exception 'Debes iniciar sesión'; end if;
  select * into v_alerta from public.alertas where id=p_alerta_id;
  if not found then raise exception 'La alerta no existe'; end if;
  if v_alerta.autor_id<>v_user and not public.is_admin() then raise exception 'No autorizado'; end if;
  if char_length(trim(coalesce(p_texto,'')))<2 then raise exception 'Escribe una actualización'; end if;

  insert into public.alerta_actualizaciones(alerta_id,autor_id,tipo,texto)
  values(p_alerta_id,v_user,'actualizacion',trim(p_texto))
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.agregar_actualizacion_alerta(uuid,text) to authenticated;

create or replace function public.corregir_alerta_y_reenviar(
  p_alerta_id uuid,
  p_titulo text,
  p_descripcion text,
  p_zona_referencia text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_alerta public.alertas;
begin
  if v_user is null then raise exception 'Debes iniciar sesión'; end if;
  select * into v_alerta from public.alertas where id=p_alerta_id for update;
  if not found then raise exception 'La alerta no existe'; end if;
  if v_alerta.autor_id<>v_user then raise exception 'Solo el autor puede corregirla'; end if;
  if char_length(trim(coalesce(p_titulo,'')))<5 then raise exception 'Título demasiado corto'; end if;
  if char_length(trim(coalesce(p_descripcion,'')))<10 then raise exception 'Descripción demasiado corta'; end if;

  update public.alertas
  set titulo=trim(p_titulo),descripcion=trim(p_descripcion),
      zona_referencia=nullif(trim(coalesce(p_zona_referencia,'')),''),
      estado='en_revision',motivo_moderacion=null,version=version+1,updated_at=now()
  where id=p_alerta_id;

  insert into public.alerta_actualizaciones(alerta_id,autor_id,tipo,texto,estado_nuevo)
  values(p_alerta_id,v_user,'correccion','El autor corrigió la información y la envió nuevamente a revisión.','en_revision');
  return true;
end;
$$;

grant execute on function public.corregir_alerta_y_reenviar(uuid,text,text,text) to authenticated;

create or replace function public.moderar_alerta(
  p_alerta_id uuid,
  p_estado text,
  p_motivo text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_titulo text;
begin
  if v_user is null or not public.is_admin() then raise exception 'No autorizado'; end if;
  if p_estado not in ('en_revision','verificada','falsa','ocultada','reportada') then
    raise exception 'Estado de moderación inválido';
  end if;
  if p_estado in ('falsa','ocultada','en_revision') and char_length(trim(coalesce(p_motivo,'')))<5 then
    raise exception 'Indica un motivo claro';
  end if;

  select titulo into v_titulo from public.alertas where id=p_alerta_id;
  if not found then raise exception 'La alerta no existe'; end if;

  update public.alertas
  set estado=p_estado,motivo_moderacion=nullif(trim(coalesce(p_motivo,'')),''),
      moderada_por=v_user,moderada_en=now(),revisada_por=v_user,revisada_en=now(),updated_at=now()
  where id=p_alerta_id;

  insert into public.alerta_actualizaciones(alerta_id,autor_id,tipo,texto,estado_nuevo)
  values(
    p_alerta_id,v_user,'moderacion',
    case when p_estado='verificada' then 'MiZona verificó la alerta.'
         else coalesce(nullif(trim(p_motivo),''),'El estado de la alerta fue actualizado.') end,
    p_estado
  );
  return true;
end;
$$;

grant execute on function public.moderar_alerta(uuid,text,text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Resolución con evidencia o confirmación comunitaria
-- ---------------------------------------------------------------------
create or replace function public.proponer_resolucion_alerta(
  p_alerta_id uuid,
  p_descripcion text,
  p_evidencia_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_alerta public.alertas;
  v_admin boolean := false;
begin
  if v_user is null then raise exception 'Debes iniciar sesión'; end if;
  select * into v_alerta from public.alertas where id=p_alerta_id for update;
  if not found then raise exception 'La alerta no existe'; end if;
  v_admin := public.is_admin();
  if v_alerta.autor_id<>v_user and not v_admin then raise exception 'Solo el autor o un administrador puede proponer la resolución'; end if;
  if char_length(trim(coalesce(p_descripcion,'')))<5 then raise exception 'Describe cómo se resolvió'; end if;

  insert into public.alerta_resoluciones(
    alerta_id,propuesta_por,descripcion,evidencia_url,estado,total_confirmaciones,moderada_por,moderada_en
  ) values(
    p_alerta_id,v_user,trim(p_descripcion),nullif(trim(coalesce(p_evidencia_url,'')),''),
    case when v_admin then 'confirmada' else 'propuesta' end,
    case when v_admin then 2 else 0 end,
    case when v_admin then v_user else null end,
    case when v_admin then now() else null end
  )
  on conflict(alerta_id) do update set
    propuesta_por=excluded.propuesta_por,descripcion=excluded.descripcion,
    evidencia_url=excluded.evidencia_url,estado=excluded.estado,
    total_confirmaciones=excluded.total_confirmaciones,moderada_por=excluded.moderada_por,
    moderada_en=excluded.moderada_en,updated_at=now();

  update public.alertas
  set resolucion_estado=case when v_admin then 'confirmada' else 'propuesta' end,
      estado=case when v_admin then 'resuelta' else estado end,
      updated_at=now()
  where id=p_alerta_id;

  insert into public.alerta_actualizaciones(alerta_id,autor_id,tipo,texto,estado_nuevo)
  values(
    p_alerta_id,v_user,'resolucion',
    case when v_admin then 'La resolución fue confirmada por MiZona.' else 'El autor propuso marcar la alerta como resuelta. Falta confirmación vecinal.' end,
    case when v_admin then 'resuelta' else null end
  );

  return jsonb_build_object('estado',case when v_admin then 'confirmada' else 'propuesta' end);
end;
$$;

grant execute on function public.proponer_resolucion_alerta(uuid,text,text) to authenticated;

create or replace function public.confirmar_resolucion_alerta(p_alerta_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_res public.alerta_resoluciones;
  v_alerta public.alertas;
  v_total integer;
begin
  if v_user is null then raise exception 'Debes iniciar sesión'; end if;
  select * into v_res from public.alerta_resoluciones where alerta_id=p_alerta_id for update;
  if not found or v_res.estado<>'propuesta' then raise exception 'No hay una resolución pendiente'; end if;
  select * into v_alerta from public.alertas where id=p_alerta_id;
  if v_alerta.autor_id=v_user then raise exception 'El autor no puede confirmar su propia resolución'; end if;

  insert into public.alerta_resolucion_confirmaciones(alerta_id,usuario_id)
  values(p_alerta_id,v_user)
  on conflict do nothing;

  select count(*) into v_total from public.alerta_resolucion_confirmaciones where alerta_id=p_alerta_id;
  update public.alerta_resoluciones set total_confirmaciones=v_total,updated_at=now() where alerta_id=p_alerta_id;

  if v_total>=2 then
    update public.alerta_resoluciones set estado='confirmada',moderada_en=now() where alerta_id=p_alerta_id;
    update public.alertas set estado='resuelta',resolucion_estado='confirmada',updated_at=now() where id=p_alerta_id;
    insert into public.alerta_actualizaciones(alerta_id,autor_id,tipo,texto,estado_nuevo)
    values(p_alerta_id,v_user,'resolucion','La comunidad confirmó que la situación fue resuelta.','resuelta');
  end if;

  return jsonb_build_object('total',v_total,'confirmada',v_total>=2);
end;
$$;

grant execute on function public.confirmar_resolucion_alerta(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Centro de sugerencias
-- ---------------------------------------------------------------------
create or replace function public.crear_sugerencia_mizona(
  p_tipo text,
  p_area text,
  p_titulo text,
  p_descripcion text,
  p_pagina_origen text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if p_tipo not in ('mejora','problema','seguridad','negocios','mapa','otro') then raise exception 'Tipo inválido'; end if;
  if char_length(trim(coalesce(p_titulo,'')))<5 then raise exception 'Título demasiado corto'; end if;
  if char_length(trim(coalesce(p_descripcion,'')))<10 then raise exception 'Describe mejor tu sugerencia'; end if;
  insert into public.sugerencias_mizona(usuario_id,tipo,area,titulo,descripcion,pagina_origen)
  values(v_user,p_tipo,coalesce(nullif(trim(p_area),''),'general'),trim(p_titulo),trim(p_descripcion),nullif(trim(coalesce(p_pagina_origen,'')),''))
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.crear_sugerencia_mizona(text,text,text,text,text) to anon,authenticated;

create or replace function public.admin_actualizar_sugerencia(
  p_id uuid,
  p_estado text,
  p_respuesta text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'No autorizado'; end if;
  if p_estado not in ('recibida','en_revision','planificada','implementada','descartada') then raise exception 'Estado inválido'; end if;
  update public.sugerencias_mizona
  set estado=p_estado,respuesta_admin=nullif(trim(coalesce(p_respuesta,'')),''),
      revisada_por=auth.uid(),revisada_en=now(),updated_at=now()
  where id=p_id;
  return found;
end;
$$;

grant execute on function public.admin_actualizar_sugerencia(uuid,text,text) to authenticated;

-- ---------------------------------------------------------------------
-- 9. RLS
-- ---------------------------------------------------------------------
alter table public.alerta_ubicaciones_privadas enable row level security;
alter table public.alerta_seguimientos enable row level security;
alter table public.alerta_utilidad enable row level security;
alter table public.alerta_actualizaciones enable row level security;
alter table public.alerta_resoluciones enable row level security;
alter table public.alerta_resolucion_confirmaciones enable row level security;
alter table public.sugerencias_mizona enable row level security;

drop policy if exists "Ubicación privada visible al autor" on public.alerta_ubicaciones_privadas;
create policy "Ubicación privada visible al autor" on public.alerta_ubicaciones_privadas
for select to authenticated
using(autor_id=auth.uid() or public.is_admin());

drop policy if exists "Seguimientos propios" on public.alerta_seguimientos;
create policy "Seguimientos propios" on public.alerta_seguimientos
for select to authenticated using(usuario_id=auth.uid() or public.is_admin());

drop policy if exists "Utilidad propia" on public.alerta_utilidad;
create policy "Utilidad propia" on public.alerta_utilidad
for select to authenticated using(usuario_id=auth.uid() or public.is_admin());

drop policy if exists "Actualizaciones visibles" on public.alerta_actualizaciones;
create policy "Actualizaciones visibles" on public.alerta_actualizaciones
for select to anon,authenticated
using(
  visible=true and exists(
    select 1 from public.alertas a
    where a.id=alerta_id and (a.estado not in ('ocultada','falsa') or a.autor_id=auth.uid() or public.is_admin())
  )
);

drop policy if exists "Resoluciones visibles" on public.alerta_resoluciones;
create policy "Resoluciones visibles" on public.alerta_resoluciones
for select to anon,authenticated
using(exists(select 1 from public.alertas a where a.id=alerta_id and (a.estado not in ('ocultada','falsa') or a.autor_id=auth.uid() or public.is_admin())));

drop policy if exists "Confirmaciones de resolución propias" on public.alerta_resolucion_confirmaciones;
create policy "Confirmaciones de resolución propias" on public.alerta_resolucion_confirmaciones
for select to authenticated using(usuario_id=auth.uid() or public.is_admin());

drop policy if exists "Usuario ve sus sugerencias" on public.sugerencias_mizona;
create policy "Usuario ve sus sugerencias" on public.sugerencias_mizona
for select to authenticated using(usuario_id=auth.uid() or public.is_admin());

-- Las escrituras de estas tablas se realizan mediante RPC para aplicar reglas.
revoke insert, update, delete on public.alerta_ubicaciones_privadas from anon,authenticated;
revoke insert, update, delete on public.alerta_seguimientos from anon,authenticated;
revoke insert, update, delete on public.alerta_utilidad from anon,authenticated;
revoke insert, update, delete on public.alerta_actualizaciones from anon,authenticated;
revoke insert, update, delete on public.alerta_resoluciones from anon,authenticated;
revoke insert, update, delete on public.alerta_resolucion_confirmaciones from anon,authenticated;
revoke insert, update, delete on public.sugerencias_mizona from anon,authenticated;

grant select on public.alerta_ubicaciones_privadas,public.alerta_seguimientos,public.alerta_utilidad,public.alerta_actualizaciones,
  public.alerta_resoluciones,public.alerta_resolucion_confirmaciones,public.sugerencias_mizona
  to authenticated;
grant select on public.alerta_actualizaciones,public.alerta_resoluciones to anon;

-- ---------------------------------------------------------------------
-- 10. Notificaciones para seguidores y cambios de estado
-- ---------------------------------------------------------------------
create or replace function public.enqueue_alert_update_followers_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alerta public.alertas;
  v_targets uuid[];
begin
  if to_regclass('public.notification_events') is null then return new; end if;
  select * into v_alerta from public.alertas where id=new.alerta_id;
  if not found then return new; end if;

  select array_agg(s.usuario_id) into v_targets
  from public.alerta_seguimientos s
  left join public.notification_preferences p on p.user_id=s.usuario_id
  where s.alerta_id=new.alerta_id
    and s.usuario_id is distinct from new.autor_id
    and coalesce(p.alertas_seguidas,true)=true;

  if coalesce(array_length(v_targets,1),0)=0 then return new; end if;

  insert into public.notification_events(
    event_type,actor_id,resource_type,resource_id,categoria,latitud,longitud,
    prioridad,titulo,cuerpo,url,payload,dedupe_key
  ) values(
    'alerta_seguida_actualizada',new.autor_id,'alerta',new.alerta_id::text,v_alerta.categoria,
    v_alerta.latitud,v_alerta.longitud,'normal','🔔 Actualización de una alerta que sigues',
    left(new.texto,220),'alerta.html?id='||new.alerta_id::text,
    jsonb_build_object('target_user_ids',v_targets,'alerta_id',new.alerta_id,'tipo',new.tipo),
    'alerta_update:'||new.id::text
  ) on conflict(dedupe_key) do nothing;
  return new;
end;
$$;

drop trigger if exists enqueue_alert_update_followers_trigger on public.alerta_actualizaciones;
create trigger enqueue_alert_update_followers_trigger
after insert on public.alerta_actualizaciones
for each row execute function public.enqueue_alert_update_followers_push();

-- Actualiza el enlace de los eventos de alertas para abrir la página detallada.
do $$
begin
  if to_regclass('public.notification_events') is not null then
    update public.notification_events
    set url='alerta.html?id='||resource_id
    where resource_type='alerta' and resource_id is not null
      and (url like 'mapa.html?alerta=%' or url='notificaciones.html');
  end if;
end $$;

-- Intenta añadir las tablas a Realtime sin fallar si ya estaban incluidas.
do $$
begin
  begin alter publication supabase_realtime add table public.alerta_actualizaciones; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.alerta_resoluciones; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.alerta_seguimientos; exception when duplicate_object then null; end;
end $$;

-- Sincronización inicial de contadores.
update public.alertas a
set total_confirmaciones=(select count(*) from public.alerta_confirmaciones c where c.alerta_id=a.id),
    total_seguidores=(select count(*) from public.alerta_seguimientos s where s.alerta_id=a.id),
    total_util_si=(select count(*) from public.alerta_utilidad u where u.alerta_id=a.id and u.util),
    total_util_no=(select count(*) from public.alerta_utilidad u where u.alerta_id=a.id and not u.util);

select 'Fase 5 instalada correctamente' as resultado;

-- ---------------------------------------------------------------------
-- 11. Ajusta los eventos push de alertas para la nueva página detallada
-- ---------------------------------------------------------------------
create or replace function public.enqueue_new_alert_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.notification_events') is null then return new; end if;
  insert into public.notification_events(
    event_type,actor_id,resource_type,resource_id,categoria,latitud,longitud,
    prioridad,titulo,cuerpo,url,payload,dedupe_key
  ) values(
    'alerta_nueva',new.autor_id,'alerta',new.id::text,new.categoria,new.latitud,new.longitud,
    case when new.categoria in ('incendio','persona') then 'critical'
         when new.categoria in ('robo','accidente') then 'high' else 'normal' end,
    case when new.categoria='robo' then '🚨 Robo reportado cerca'
         when new.categoria='accidente' then '🚧 Accidente cerca'
         when new.categoria='incendio' then '🔥 Incendio reportado'
         when new.categoria='persona' then '👤 Alerta de persona'
         when new.categoria in ('agua','luz') then '💧 Aviso de servicio en tu zona'
         when new.categoria='mascota' then '🐾 Aviso de mascota cerca'
         else '🔔 Nueva alerta en MiZona' end,
    left(new.titulo||coalesce(' · '||new.zona_referencia,''),220),
    'alerta.html?id='||new.id::text,
    jsonb_build_object('estado',new.estado,'distrito',new.distrito,'precision',new.precision_ubicacion),
    'alerta_nueva:'||new.id::text
  ) on conflict(dedupe_key) do nothing;
  return new;
end;
$$;

create or replace function public.enqueue_alert_confirmation_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_alerta public.alertas;
begin
  if to_regclass('public.notification_events') is null then return new; end if;
  select * into v_alerta from public.alertas where id=new.alerta_id;
  if not found or v_alerta.autor_id=new.usuario_id then return new; end if;
  insert into public.notification_events(
    event_type,actor_id,recipient_id,resource_type,resource_id,categoria,latitud,longitud,
    prioridad,titulo,cuerpo,url,payload,dedupe_key
  ) values(
    'alerta_confirmada',new.usuario_id,v_alerta.autor_id,'alerta',v_alerta.id::text,
    v_alerta.categoria,v_alerta.latitud,v_alerta.longitud,'normal','✅ Confirmaron tu alerta',
    'Un vecino indicó que también vio: '||left(v_alerta.titulo,140),
    'alerta.html?id='||v_alerta.id::text,
    jsonb_build_object('confirmacion_id',new.id,'alerta_id',v_alerta.id),
    'alerta_confirmada:'||new.id::text
  ) on conflict(dedupe_key) do nothing;
  return new;
end;
$$;

create or replace function public.enqueue_alert_status_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.notification_events') is null then return new; end if;
  if new.estado is not distinct from old.estado then return new; end if;
  if new.estado not in ('verificada','resuelta','falsa','ocultada') then return new; end if;
  insert into public.notification_events(
    event_type,actor_id,resource_type,resource_id,categoria,latitud,longitud,
    prioridad,titulo,cuerpo,url,payload,dedupe_key
  ) values(
    'alerta_'||new.estado,coalesce(new.moderada_por,new.revisada_por),'alerta',new.id::text,new.categoria,
    new.latitud,new.longitud,case when new.estado='verificada' then 'high' else 'normal' end,
    case new.estado when 'verificada' then '✅ Alerta verificada' when 'resuelta' then '🟢 Alerta resuelta'
      when 'falsa' then '⚠️ Reporte descartado' else '🔕 Alerta retirada' end,
    left(new.titulo||coalesce(' · '||new.motivo_moderacion,''),220),
    'alerta.html?id='||new.id::text,
    jsonb_build_object('estado',new.estado,'motivo',new.motivo_moderacion),
    'alerta_estado:'||new.id::text||':'||new.estado
  ) on conflict(dedupe_key) do nothing;
  return new;
end;
$$;

select 'Fase 5 y notificaciones ajustadas correctamente' as resultado_final;
