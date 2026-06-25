-- MiZona.pe — REPARACIÓN DE AMISTADES FALTANTES
-- Ejecutar una sola vez antes del SQL final completo V2.

begin;
create extension if not exists pgcrypto;

-- ============================================================
-- PRERREQUISITO INTEGRADO: AMISTADES
-- Debe existir antes de crear vistas y políticas que la consultan.
-- ============================================================
alter table public.perfiles
  add column if not exists ultima_actividad timestamptz default now();

alter table public.mensajes
  add column if not exists leido boolean not null default false,
  add column if not exists leido_en timestamptz;

create table if not exists public.solicitudes_amistad(
  id uuid primary key default gen_random_uuid(),
  solicitante_id uuid not null references auth.users(id) on delete cascade,
  destinatario_id uuid not null references auth.users(id) on delete cascade,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','aceptada','rechazada')),
  creado_en timestamptz not null default now(),
  respondido_en timestamptz,
  check (solicitante_id <> destinatario_id)
);

create unique index if not exists solicitudes_amistad_unicas
  on public.solicitudes_amistad(
    least(solicitante_id,destinatario_id),
    greatest(solicitante_id,destinatario_id)
  )
  where estado in ('pendiente','aceptada');

alter table public.solicitudes_amistad enable row level security;

drop policy if exists "Usuarios ven solicitudes relacionadas"
  on public.solicitudes_amistad;
create policy "Usuarios ven solicitudes relacionadas"
  on public.solicitudes_amistad
  for select to authenticated
  using (
    solicitante_id=auth.uid()
    or destinatario_id=auth.uid()
    or public.is_admin()
  );

drop policy if exists "Usuarios eliminan solicitudes relacionadas"
  on public.solicitudes_amistad;
create policy "Usuarios eliminan solicitudes relacionadas"
  on public.solicitudes_amistad
  for delete to authenticated
  using (
    solicitante_id=auth.uid()
    or destinatario_id=auth.uid()
    or public.is_admin()
  );

grant select,delete on public.solicitudes_amistad to authenticated;

create or replace function public.enviar_solicitud_amistad(p_destinatario uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión';
  end if;
  if p_destinatario=auth.uid() then
    raise exception 'No puedes enviarte una solicitud a ti mismo';
  end if;
  if exists(
    select 1 from public.usuarios_bloqueados b
    where (b.bloqueador_id=auth.uid() and b.bloqueado_id=p_destinatario)
       or (b.bloqueador_id=p_destinatario and b.bloqueado_id=auth.uid())
  ) then
    raise exception 'No se puede enviar la solicitud porque existe un bloqueo';
  end if;

  select id into v_id
  from public.solicitudes_amistad
  where (
    (solicitante_id=auth.uid() and destinatario_id=p_destinatario)
    or (solicitante_id=p_destinatario and destinatario_id=auth.uid())
  )
  and estado in ('pendiente','aceptada')
  order by creado_en desc
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.solicitudes_amistad(solicitante_id,destinatario_id)
  values(auth.uid(),p_destinatario)
  returning id into v_id;

  insert into public.notificaciones(usuario_id,actor_id,tipo)
  values(p_destinatario,auth.uid(),'solicitud_amistad');

  return v_id;
end $$;
grant execute on function public.enviar_solicitud_amistad(uuid) to authenticated;

create or replace function public.responder_solicitud_amistad(
  p_solicitud_id uuid,
  p_respuesta text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_solicitante uuid;
begin
  if p_respuesta not in ('aceptada','rechazada') then
    raise exception 'Respuesta inválida';
  end if;

  update public.solicitudes_amistad
  set estado=p_respuesta,respondido_en=now()
  where id=p_solicitud_id
    and destinatario_id=auth.uid()
    and estado='pendiente'
  returning solicitante_id into v_solicitante;

  if v_solicitante is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if p_respuesta='aceptada' then
    insert into public.notificaciones(usuario_id,actor_id,tipo)
    values(v_solicitante,auth.uid(),'amistad_aceptada');
  end if;
end $$;
grant execute on function public.responder_solicitud_amistad(uuid,text)
  to authenticated;

create or replace view public.amigos_detalle
with (security_invoker=true) as
select
  sa.id as solicitud_id,
  case when sa.solicitante_id=auth.uid() then d.id else s.id end as id,
  case when sa.solicitante_id=auth.uid() then d.username else s.username end as username,
  case when sa.solicitante_id=auth.uid() then d.nombre_visible else s.nombre_visible end as nombre_visible,
  case when sa.solicitante_id=auth.uid() then d.avatar_url else s.avatar_url end as avatar_url,
  case when sa.solicitante_id=auth.uid() then d.ultima_actividad else s.ultima_actividad end as ultima_actividad
from public.solicitudes_amistad sa
join public.perfiles s on s.id=sa.solicitante_id
join public.perfiles d on d.id=sa.destinatario_id
where sa.estado='aceptada'
  and (sa.solicitante_id=auth.uid() or sa.destinatario_id=auth.uid());
grant select on public.amigos_detalle to authenticated;

create or replace view public.solicitudes_recibidas_detalle
with (security_invoker=true) as
select
  sa.id as solicitud_id,
  sa.creado_en,
  p.id,p.username,p.nombre_visible,p.avatar_url,p.ultima_actividad
from public.solicitudes_amistad sa
join public.perfiles p on p.id=sa.solicitante_id
where sa.destinatario_id=auth.uid() and sa.estado='pendiente';
grant select on public.solicitudes_recibidas_detalle to authenticated;

create or replace view public.solicitudes_enviadas_detalle
with (security_invoker=true) as
select
  sa.id as solicitud_id,
  sa.creado_en,
  sa.estado,
  p.id,p.username,p.nombre_visible,p.avatar_url,p.ultima_actividad
from public.solicitudes_amistad sa
join public.perfiles p on p.id=sa.destinatario_id
where sa.solicitante_id=auth.uid();
grant select on public.solicitudes_enviadas_detalle to authenticated;


-- Asegura que los tipos de notificación de amistad sean válidos.
alter table public.notificaciones drop constraint if exists notificaciones_tipo_check;
alter table public.notificaciones add constraint notificaciones_tipo_check
  check(tipo in('like','comentario','seguimiento','sistema','solicitud_amistad','amistad_aceptada','mensaje'));

commit;
select 'OK: módulo de amistades reparado' as resultado;
