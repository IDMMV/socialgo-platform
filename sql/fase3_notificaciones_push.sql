-- =====================================================================
-- MiZona.pe · Fase 3 · Notificaciones push con Supabase + OneSignal
-- Ejecutar una sola vez en Supabase → SQL Editor.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Dispositivos vinculados a cada cuenta
-- ---------------------------------------------------------------------
create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'onesignal' check (provider in ('onesignal')),
  subscription_id text not null,
  push_token text,
  etiqueta text,
  navegador text,
  sistema_operativo text,
  tipo_dispositivo text,
  permiso text not null default 'default' check (permiso in ('default','granted','denied')),
  activo boolean not null default false,
  user_agent text,
  ultimo_acceso timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, subscription_id)
);

create index if not exists push_devices_user_idx on public.push_devices(user_id);
create index if not exists push_devices_active_idx on public.push_devices(user_id, activo);

-- ---------------------------------------------------------------------
-- 2. Preferencias personales de notificación
-- ---------------------------------------------------------------------
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  alertas_activas boolean not null default true,
  categorias_alerta text[] not null default array['robo','accidente','agua','luz','mascota','persona','incendio']::text[],
  radio_metros integer not null default 1500 check (radio_metros between 500 and 20000),
  confirmaciones_alerta boolean not null default true,
  mensajes boolean not null default true,
  amistades boolean not null default true,
  negocios boolean not null default true,
  ofertas boolean not null default false,
  resumen_frecuencia text not null default 'inmediato'
    check (resumen_frecuencia in ('inmediato','diario','solo_emergencias','desactivado')),
  horario_silencioso_inicio time,
  horario_silencioso_fin time,
  emergencias_en_silencio boolean not null default true,
  zona_horaria text not null default 'America/Lima',
  latitud numeric(10,7),
  longitud numeric(10,7),
  ubicacion_actualizada_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.notification_preferences(user_id)
select id from public.perfiles
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------
-- 3. Cola de eventos, entregas e historial visible
-- ---------------------------------------------------------------------
create table if not exists public.notification_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  actor_id uuid references auth.users(id) on delete set null,
  recipient_id uuid references auth.users(id) on delete cascade,
  resource_type text,
  resource_id text,
  categoria text,
  latitud numeric(10,7),
  longitud numeric(10,7),
  prioridad text not null default 'normal' check (prioridad in ('normal','high','critical')),
  titulo text not null,
  cuerpo text not null,
  url text not null default 'notificaciones.html',
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text unique,
  estado text not null default 'pending' check (estado in ('pending','processing','sent','partial','skipped','failed')),
  intentos integer not null default 0,
  procesado_en timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists notification_events_pending_idx
  on public.notification_events(estado, created_at);

create table if not exists public.notification_deliveries (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.notification_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'onesignal',
  provider_message_id text,
  estado text not null default 'pending'
    check (estado in ('pending','sent','skipped','failed','opened')),
  motivo text,
  enviado_en timestamptz,
  abierto_en timestamptz,
  created_at timestamptz not null default now(),
  unique(event_id, user_id)
);

create index if not exists notification_deliveries_user_idx
  on public.notification_deliveries(user_id, created_at desc);

create table if not exists public.notification_inbox (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.notification_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null,
  cuerpo text not null,
  url text not null default 'notificaciones.html',
  tipo text not null,
  prioridad text not null default 'normal',
  leida boolean not null default false,
  leida_en timestamptz,
  created_at timestamptz not null default now(),
  unique(event_id, user_id)
);

create index if not exists notification_inbox_user_idx
  on public.notification_inbox(user_id, leida, created_at desc);

-- ---------------------------------------------------------------------
-- 4. Seguridad RLS
-- ---------------------------------------------------------------------
alter table public.push_devices enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_inbox enable row level security;

drop policy if exists "Usuario gestiona sus dispositivos push" on public.push_devices;
create policy "Usuario gestiona sus dispositivos push"
on public.push_devices for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Usuario gestiona sus preferencias push" on public.notification_preferences;
create policy "Usuario gestiona sus preferencias push"
on public.notification_preferences for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Usuario ve sus entregas push" on public.notification_deliveries;
create policy "Usuario ve sus entregas push"
on public.notification_deliveries for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Usuario ve su bandeja push" on public.notification_inbox;
create policy "Usuario ve su bandeja push"
on public.notification_inbox for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Usuario marca su bandeja push" on public.notification_inbox;
create policy "Usuario marca su bandeja push"
on public.notification_inbox for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- La cola de eventos solo debe ser leída/escrita por service_role.
revoke all on public.notification_events from anon, authenticated;
revoke insert, update, delete on public.notification_deliveries from anon, authenticated;
revoke insert, delete on public.notification_inbox from anon, authenticated;

grant select, insert, update, delete on public.push_devices to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant select on public.notification_deliveries to authenticated;
grant select, update on public.notification_inbox to authenticated;


drop policy if exists "Administradores ven dispositivos push" on public.push_devices;
create policy "Administradores ven dispositivos push"
on public.push_devices for select to authenticated
using (public.is_admin());

drop policy if exists "Administradores ven preferencias push" on public.notification_preferences;
create policy "Administradores ven preferencias push"
on public.notification_preferences for select to authenticated
using (public.is_admin());

drop policy if exists "Administradores ven eventos push" on public.notification_events;
create policy "Administradores ven eventos push"
on public.notification_events for select to authenticated
using (public.is_admin());

drop policy if exists "Administradores ven entregas push" on public.notification_deliveries;
create policy "Administradores ven entregas push"
on public.notification_deliveries for select to authenticated
using (public.is_admin());

grant select on public.notification_events to authenticated;

-- ---------------------------------------------------------------------
-- 5. Registro seguro de un navegador o celular
-- Permite transferir el mismo navegador cuando el usuario cambia de cuenta.
-- ---------------------------------------------------------------------
create or replace function public.mizona_register_push_device(
  p_subscription_id text,
  p_push_token text default null,
  p_permiso text default 'default',
  p_activo boolean default false,
  p_navegador text default null,
  p_sistema_operativo text default null,
  p_tipo_dispositivo text default null,
  p_etiqueta text default null,
  p_user_agent text default null
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
  if v_user is null then raise exception 'Debes iniciar sesión'; end if;
  if nullif(trim(p_subscription_id),'') is null then raise exception 'Suscripción inválida'; end if;

  insert into public.notification_preferences(user_id)
  values(v_user)
  on conflict(user_id) do nothing;

  insert into public.push_devices(
    user_id, provider, subscription_id, push_token, permiso, activo,
    navegador, sistema_operativo, tipo_dispositivo, etiqueta, user_agent,
    ultimo_acceso, updated_at
  ) values (
    v_user, 'onesignal', p_subscription_id, p_push_token,
    case when p_permiso in ('default','granted','denied') then p_permiso else 'default' end,
    p_activo, p_navegador, p_sistema_operativo, p_tipo_dispositivo,
    p_etiqueta, left(p_user_agent,500), now(), now()
  )
  on conflict(provider,subscription_id) do update set
    user_id = excluded.user_id,
    push_token = excluded.push_token,
    permiso = excluded.permiso,
    activo = excluded.activo,
    navegador = excluded.navegador,
    sistema_operativo = excluded.sistema_operativo,
    tipo_dispositivo = excluded.tipo_dispositivo,
    etiqueta = excluded.etiqueta,
    user_agent = excluded.user_agent,
    ultimo_acceso = now(),
    updated_at = now()
  where public.push_devices.user_id = v_user
     or public.push_devices.push_token is null
     or public.push_devices.push_token = excluded.push_token
  returning id into v_id;

  if v_id is null then
    raise exception 'El dispositivo está vinculado a otra cuenta. Desactiva las notificaciones en esa cuenta antes de cambiarlo.';
  end if;

  return v_id;
end;
$$;

grant execute on function public.mizona_register_push_device(text,text,text,boolean,text,text,text,text,text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Cálculo de distancia y selección de destinatarios cercanos
-- ---------------------------------------------------------------------
create or replace function public.mizona_distance_meters(
  p_lat1 numeric, p_lon1 numeric, p_lat2 numeric, p_lon2 numeric
)
returns numeric
language sql
immutable
parallel safe
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

create or replace function public.mizona_push_target_users(
  p_latitud numeric,
  p_longitud numeric,
  p_categoria text,
  p_actor_id uuid default null,
  p_max_radio_meters integer default 20000
)
returns table(user_id uuid, distancia_metros numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    pref.user_id,
    public.mizona_distance_meters(pref.latitud, pref.longitud, p_latitud, p_longitud) as distancia_metros
  from public.notification_preferences pref
  where pref.alertas_activas = true
    and pref.resumen_frecuencia <> 'desactivado'
    and pref.latitud is not null
    and pref.longitud is not null
    and (p_actor_id is null or pref.user_id <> p_actor_id)
    and (
      p_categoria = any(pref.categorias_alerta)
      or (p_categoria in ('agua','luz') and ('agua' = any(pref.categorias_alerta) or 'luz' = any(pref.categorias_alerta)))
    )
    and public.mizona_distance_meters(pref.latitud, pref.longitud, p_latitud, p_longitud)
        <= least(pref.radio_metros, greatest(500, least(coalesce(p_max_radio_meters, 20000), 20000)))
    and exists (
      select 1 from public.push_devices d
      where d.user_id = pref.user_id
        and d.activo = true
        and d.permiso = 'granted'
    );
$$;

revoke all on function public.mizona_push_target_users(numeric,numeric,text,uuid,integer) from public;
grant execute on function public.mizona_push_target_users(numeric,numeric,text,uuid,integer) to service_role;

-- ---------------------------------------------------------------------
-- 7. Eventos automáticos: alertas nuevas, confirmaciones y cambios
-- ---------------------------------------------------------------------
create or replace function public.enqueue_new_alert_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_events(
    event_type, actor_id, resource_type, resource_id, categoria,
    latitud, longitud, prioridad, titulo, cuerpo, url, payload, dedupe_key
  ) values (
    'alerta_nueva', new.autor_id, 'alerta', new.id::text, new.categoria,
    new.latitud, new.longitud,
    case when new.categoria in ('incendio','persona') then 'critical'
         when new.categoria in ('robo','accidente') then 'high'
         else 'normal' end,
    case when new.categoria = 'robo' then '🚨 Robo reportado cerca'
         when new.categoria = 'accidente' then '🚧 Accidente cerca'
         when new.categoria = 'incendio' then '🔥 Incendio reportado'
         when new.categoria = 'persona' then '👤 Alerta de persona'
         when new.categoria in ('agua','luz') then '💧 Aviso de servicio en tu zona'
         when new.categoria = 'mascota' then '🐾 Aviso de mascota cerca'
         else '🔔 Nueva alerta en MiZona' end,
    left(new.titulo || coalesce(' · ' || new.zona_referencia, ''), 220),
    'mapa.html?alerta=' || new.id::text,
    jsonb_build_object('estado', new.estado, 'distrito', new.distrito),
    'alerta_nueva:' || new.id::text
  )
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

drop trigger if exists enqueue_new_alert_push_trigger on public.alertas;
create trigger enqueue_new_alert_push_trigger
after insert on public.alertas
for each row execute function public.enqueue_new_alert_push();

create or replace function public.enqueue_alert_confirmation_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alerta public.alertas;
begin
  select * into v_alerta from public.alertas where id = new.alerta_id;
  if not found or v_alerta.autor_id = new.usuario_id then return new; end if;

  insert into public.notification_events(
    event_type, actor_id, recipient_id, resource_type, resource_id,
    categoria, latitud, longitud, prioridad, titulo, cuerpo, url, payload, dedupe_key
  ) values (
    'alerta_confirmada', new.usuario_id, v_alerta.autor_id, 'alerta', v_alerta.id::text,
    v_alerta.categoria, v_alerta.latitud, v_alerta.longitud, 'normal',
    '✅ Confirmaron tu alerta',
    'Un vecino indicó que también vio: ' || left(v_alerta.titulo, 140),
    'mapa.html?alerta=' || v_alerta.id::text,
    jsonb_build_object('confirmacion_id', new.id, 'alerta_id', v_alerta.id),
    'alerta_confirmada:' || new.id::text
  )
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

drop trigger if exists enqueue_alert_confirmation_push_trigger on public.alerta_confirmaciones;
create trigger enqueue_alert_confirmation_push_trigger
after insert on public.alerta_confirmaciones
for each row execute function public.enqueue_alert_confirmation_push();

create or replace function public.enqueue_alert_status_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado is not distinct from old.estado then return new; end if;
  if new.estado not in ('verificada','resuelta','falsa','ocultada') then return new; end if;

  insert into public.notification_events(
    event_type, actor_id, resource_type, resource_id, categoria,
    latitud, longitud, prioridad, titulo, cuerpo, url, payload, dedupe_key
  ) values (
    'alerta_' || new.estado, new.revisada_por, 'alerta', new.id::text, new.categoria,
    new.latitud, new.longitud,
    case when new.estado = 'verificada' then 'high' else 'normal' end,
    case new.estado
      when 'verificada' then '✅ Alerta verificada'
      when 'resuelta' then '🟢 Alerta resuelta'
      when 'falsa' then '⚠️ Reporte descartado'
      else '🔕 Alerta retirada'
    end,
    left(new.titulo, 180),
    'mapa.html?alerta=' || new.id::text,
    jsonb_build_object('estado', new.estado),
    'alerta_estado:' || new.id::text || ':' || new.estado
  )
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

drop trigger if exists enqueue_alert_status_push_trigger on public.alertas;
create trigger enqueue_alert_status_push_trigger
after update of estado on public.alertas
for each row execute function public.enqueue_alert_status_push();

-- ---------------------------------------------------------------------
-- 8. Convierte las notificaciones sociales existentes en push
-- ---------------------------------------------------------------------
create or replace function public.enqueue_social_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := 'Un usuario';
  v_title text;
  v_body text;
  v_url text := 'notificaciones.html';
begin
  if new.actor_id is not null then
    select coalesce(nullif(nombre_visible,''), nullif(username,''), 'Un usuario')
      into v_actor from public.perfiles where id = new.actor_id;
  end if;

  case new.tipo
    when 'mensaje' then
      v_title := '💬 Nuevo mensaje';
      v_body := v_actor || ' te envió un mensaje.';
      v_url := 'mensajes.html';
    when 'solicitud_amistad' then
      v_title := '👋 Solicitud de amistad';
      v_body := v_actor || ' quiere agregarte.';
      v_url := 'amistades.html';
    when 'amistad_aceptada' then
      v_title := '🤝 Solicitud aceptada';
      v_body := v_actor || ' aceptó tu solicitud de amistad.';
      v_url := 'amistades.html';
    when 'comentario' then
      v_title := '💬 Nuevo comentario';
      v_body := v_actor || ' comentó tu publicación.';
      v_url := 'index.html';
    when 'like' then
      v_title := '❤️ Nueva reacción';
      v_body := v_actor || ' reaccionó a tu publicación.';
      v_url := 'index.html';
    when 'seguimiento' then
      v_title := '👤 Nuevo seguidor';
      v_body := v_actor || ' comenzó a seguirte.';
      v_url := 'usuario.html?uid=' || coalesce(new.actor_id::text, '');
    else
      v_title := '🔔 Aviso de MiZona';
      v_body := 'Tienes una nueva notificación.';
  end case;

  if new.usuario_id = new.actor_id then return new; end if;

  insert into public.notification_events(
    event_type, actor_id, recipient_id, resource_type, resource_id,
    prioridad, titulo, cuerpo, url, payload, dedupe_key
  ) values (
    'social_' || new.tipo, new.actor_id, new.usuario_id, 'notificacion', new.id::text,
    case when new.tipo = 'mensaje' then 'high' else 'normal' end,
    v_title, v_body, v_url,
    jsonb_build_object('notificacion_id', new.id, 'tipo', new.tipo),
    'notificacion:' || new.id::text
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

drop trigger if exists enqueue_social_push_trigger on public.notificaciones;
create trigger enqueue_social_push_trigger
after insert on public.notificaciones
for each row execute function public.enqueue_social_push();

-- ---------------------------------------------------------------------
-- 9. Avisos administrativos generales
-- ---------------------------------------------------------------------
create or replace function public.mizona_admin_broadcast(
  p_titulo text,
  p_cuerpo text,
  p_url text default 'notificaciones.html',
  p_prioridad text default 'normal'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id bigint;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Acceso administrativo requerido';
  end if;
  if char_length(trim(p_titulo)) < 3 or char_length(trim(p_cuerpo)) < 5 then
    raise exception 'Completa el título y el mensaje';
  end if;

  insert into public.notification_events(
    event_type, actor_id, resource_type, prioridad,
    titulo, cuerpo, url, payload, dedupe_key
  ) values (
    'admin_broadcast', auth.uid(), 'sistema',
    case when p_prioridad in ('normal','high','critical') then p_prioridad else 'normal' end,
    left(trim(p_titulo), 100), left(trim(p_cuerpo), 220),
    coalesce(nullif(trim(p_url),''), 'notificaciones.html'),
    jsonb_build_object('target_all', true),
    'admin_broadcast:' || gen_random_uuid()::text
  ) returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.mizona_admin_broadcast(text,text,text,text) from public;
grant execute on function public.mizona_admin_broadcast(text,text,text,text) to authenticated;

-- ---------------------------------------------------------------------
-- 10. Registrar apertura de una notificación
-- ---------------------------------------------------------------------
create or replace function public.mizona_mark_push_opened(p_event_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then return; end if;

  update public.notification_inbox
  set leida = true, leida_en = coalesce(leida_en, now())
  where event_id = p_event_id and user_id = v_user;

  update public.notification_deliveries
  set estado = 'opened', abierto_en = coalesce(abierto_en, now())
  where event_id = p_event_id and user_id = v_user;
end;
$$;

revoke all on function public.mizona_mark_push_opened(bigint) from public;
grant execute on function public.mizona_mark_push_opened(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 11. Prueba manual desde el panel del usuario
-- ---------------------------------------------------------------------
create or replace function public.mizona_test_push()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_event_id bigint;
begin
  if v_user is null then raise exception 'Debes iniciar sesión'; end if;

  insert into public.notification_events(
    event_type, recipient_id, resource_type, prioridad,
    titulo, cuerpo, url, payload, dedupe_key
  ) values (
    'prueba', v_user, 'sistema', 'normal',
    '🔔 MiZona está conectada',
    'Esta es una notificación de prueba enviada a tu dispositivo.',
    'notificaciones.html',
    jsonb_build_object('test', true),
    'prueba:' || v_user::text || ':' || gen_random_uuid()::text
  ) returning id into v_event_id;

  return v_event_id;
end;
$$;

grant execute on function public.mizona_test_push() to authenticated;

-- ---------------------------------------------------------------------
-- 12. Realtime para actualizar el centro de notificaciones abierto
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.notification_inbox;
exception
  when duplicate_object then null;
end $$;

select 'Fase 3 de notificaciones instalada correctamente' as resultado;
