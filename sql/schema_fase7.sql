-- ============================================================
-- SOCIALGO - FASE 7
-- SEGUIDORES, PERFILES PÚBLICOS Y MENSAJERÍA
-- Ejecutar una sola vez después de Fase 6.
-- ============================================================

create table if not exists public.seguidores (
  seguidor_id uuid not null references auth.users(id) on delete cascade,
  seguido_id uuid not null references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (seguidor_id, seguido_id),
  check (seguidor_id <> seguido_id)
);

create table if not exists public.conversaciones (
  id uuid primary key default gen_random_uuid(),
  creada_por uuid not null references auth.users(id) on delete cascade,
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);

create table if not exists public.conversacion_participantes (
  conversacion_id uuid not null references public.conversaciones(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  unido_en timestamptz not null default now(),
  primary key (conversacion_id, usuario_id)
);

create table if not exists public.mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.conversaciones(id) on delete cascade,
  remitente_id uuid not null references auth.users(id) on delete cascade,
  contenido text not null check (char_length(contenido) between 1 and 2000),
  creado_en timestamptz not null default now()
);

alter table public.seguidores enable row level security;
alter table public.conversaciones enable row level security;
alter table public.conversacion_participantes enable row level security;
alter table public.mensajes enable row level security;

drop policy if exists "Seguidores visibles" on public.seguidores;
create policy "Seguidores visibles"
on public.seguidores for select
to anon, authenticated
using (true);

drop policy if exists "Usuario sigue" on public.seguidores;
create policy "Usuario sigue"
on public.seguidores for insert
to authenticated
with check (seguidor_id = auth.uid());

drop policy if exists "Usuario deja de seguir" on public.seguidores;
create policy "Usuario deja de seguir"
on public.seguidores for delete
to authenticated
using (seguidor_id = auth.uid());

drop policy if exists "Participante ve conversaciones" on public.conversaciones;
create policy "Participante ve conversaciones"
on public.conversaciones for select
to authenticated
using (
  exists (
    select 1 from public.conversacion_participantes cp
    where cp.conversacion_id = conversaciones.id
      and cp.usuario_id = auth.uid()
  )
);

drop policy if exists "Participante ve participantes" on public.conversacion_participantes;
create policy "Participante ve participantes"
on public.conversacion_participantes for select
to authenticated
using (
  exists (
    select 1 from public.conversacion_participantes mine
    where mine.conversacion_id = conversacion_participantes.conversacion_id
      and mine.usuario_id = auth.uid()
  )
);

drop policy if exists "Participante ve mensajes" on public.mensajes;
create policy "Participante ve mensajes"
on public.mensajes for select
to authenticated
using (
  exists (
    select 1 from public.conversacion_participantes cp
    where cp.conversacion_id = mensajes.conversacion_id
      and cp.usuario_id = auth.uid()
  )
);

drop policy if exists "Participante envia mensajes" on public.mensajes;
create policy "Participante envia mensajes"
on public.mensajes for insert
to authenticated
with check (
  remitente_id = auth.uid()
  and exists (
    select 1 from public.conversacion_participantes cp
    where cp.conversacion_id = mensajes.conversacion_id
      and cp.usuario_id = auth.uid()
  )
);

create or replace function public.crear_o_obtener_conversacion(p_otro_usuario uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversacion uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión';
  end if;

  if p_otro_usuario = auth.uid() then
    raise exception 'No puedes enviarte mensajes a ti mismo';
  end if;

  select c.id
  into v_conversacion
  from public.conversaciones c
  join public.conversacion_participantes a
    on a.conversacion_id = c.id and a.usuario_id = auth.uid()
  join public.conversacion_participantes b
    on b.conversacion_id = c.id and b.usuario_id = p_otro_usuario
  where (
    select count(*)
    from public.conversacion_participantes cp
    where cp.conversacion_id = c.id
  ) = 2
  limit 1;

  if v_conversacion is null then
    insert into public.conversaciones(creada_por)
    values (auth.uid())
    returning id into v_conversacion;

    insert into public.conversacion_participantes(conversacion_id, usuario_id)
    values
      (v_conversacion, auth.uid()),
      (v_conversacion, p_otro_usuario);
  end if;

  return v_conversacion;
end;
$$;

grant execute on function public.crear_o_obtener_conversacion(uuid) to authenticated;

create or replace view public.perfiles_publicos
with (security_invoker = true)
as
select
  p.id,
  p.username,
  p.nombre_visible,
  p.biografia,
  p.avatar_url,
  p.portada_url,
  (
    select count(*) from public.seguidores s
    where s.seguido_id = p.id
  ) as total_seguidores,
  (
    select count(*) from public.seguidores s
    where s.seguidor_id = p.id
  ) as total_seguidos,
  exists (
    select 1 from public.seguidores s
    where s.seguidor_id = auth.uid()
      and s.seguido_id = p.id
  ) as siguiendo
from public.perfiles p
where p.estado = 'activo';

grant select on public.perfiles_publicos to anon, authenticated;

create or replace view public.conversaciones_detalle
with (security_invoker = true)
as
select
  c.id as conversacion_id,
  other_user.id as otro_usuario_id,
  other_user.username as otro_username,
  other_user.nombre_visible as otro_nombre,
  other_user.avatar_url as otro_avatar_url,
  last_message.contenido as ultimo_mensaje,
  coalesce(last_message.creado_en, c.creada_en) as ultimo_mensaje_en
from public.conversaciones c
join public.conversacion_participantes mine
  on mine.conversacion_id = c.id
 and mine.usuario_id = auth.uid()
join public.conversacion_participantes other_participant
  on other_participant.conversacion_id = c.id
 and other_participant.usuario_id <> auth.uid()
join public.perfiles other_user
  on other_user.id = other_participant.usuario_id
left join lateral (
  select m.contenido, m.creado_en
  from public.mensajes m
  where m.conversacion_id = c.id
  order by m.creado_en desc
  limit 1
) last_message on true;

grant select on public.conversaciones_detalle to authenticated;

create or replace function public.actualizar_conversacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversaciones
  set actualizada_en = now()
  where id = new.conversacion_id;
  return new;
end;
$$;

drop trigger if exists actualizar_conversacion_mensaje on public.mensajes;
create trigger actualizar_conversacion_mensaje
after insert on public.mensajes
for each row execute function public.actualizar_conversacion();

do $$
begin
  alter publication supabase_realtime add table public.mensajes;
exception
  when duplicate_object then null;
end $$;
