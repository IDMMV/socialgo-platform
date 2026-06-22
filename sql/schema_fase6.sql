-- ============================================================
-- SOCIALGO - FASE 6
-- ENCUESTAS Y CENTRO DE NOTIFICACIONES
-- Ejecutar una sola vez después de Fase 5.
-- ============================================================

create table if not exists public.encuestas (
  publicacion_id uuid primary key references public.publicaciones(id) on delete cascade,
  creador_id uuid not null references auth.users(id) on delete cascade,
  pregunta text not null check (char_length(pregunta) between 3 and 300),
  cierra_en timestamptz not null,
  creado_en timestamptz not null default now()
);

create table if not exists public.encuesta_opciones (
  id uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references public.encuestas(publicacion_id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 120),
  orden integer not null check (orden between 1 and 6),
  creado_en timestamptz not null default now(),
  unique(publicacion_id, orden)
);

create table if not exists public.encuesta_votos (
  publicacion_id uuid not null references public.encuestas(publicacion_id) on delete cascade,
  opcion_id uuid not null references public.encuesta_opciones(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (publicacion_id, usuario_id)
);

alter table public.encuestas enable row level security;
alter table public.encuesta_opciones enable row level security;
alter table public.encuesta_votos enable row level security;

drop policy if exists "Encuestas visibles" on public.encuestas;
create policy "Encuestas visibles"
on public.encuestas for select
to anon, authenticated
using (true);

drop policy if exists "Creador crea encuesta" on public.encuestas;
create policy "Creador crea encuesta"
on public.encuestas for insert
to authenticated
with check (creador_id = auth.uid());

drop policy if exists "Opciones visibles" on public.encuesta_opciones;
create policy "Opciones visibles"
on public.encuesta_opciones for select
to anon, authenticated
using (true);

drop policy if exists "Creador crea opciones" on public.encuesta_opciones;
create policy "Creador crea opciones"
on public.encuesta_opciones for insert
to authenticated
with check (
  exists (
    select 1
    from public.encuestas e
    where e.publicacion_id = encuesta_opciones.publicacion_id
      and e.creador_id = auth.uid()
  )
);

drop policy if exists "Votos visibles" on public.encuesta_votos;
create policy "Votos visibles"
on public.encuesta_votos for select
to authenticated
using (true);

-- Votar mediante función segura.
create or replace function public.votar_encuesta(p_opcion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_publicacion_id uuid;
  v_cierra_en timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para votar';
  end if;

  select eo.publicacion_id, e.cierra_en
  into v_publicacion_id, v_cierra_en
  from public.encuesta_opciones eo
  join public.encuestas e on e.publicacion_id = eo.publicacion_id
  where eo.id = p_opcion_id;

  if v_publicacion_id is null then
    raise exception 'Opción no encontrada';
  end if;

  if v_cierra_en <= now() then
    raise exception 'La encuesta ya terminó';
  end if;

  insert into public.encuesta_votos(publicacion_id, opcion_id, usuario_id)
  values (v_publicacion_id, p_opcion_id, auth.uid())
  on conflict (publicacion_id, usuario_id)
  do update set
    opcion_id = excluded.opcion_id,
    creado_en = now();
end;
$$;

grant execute on function public.votar_encuesta(uuid) to authenticated;

create or replace view public.encuestas_feed
with (security_invoker = true)
as
select
  e.publicacion_id,
  e.pregunta,
  e.cierra_en,
  eo.id as opcion_id,
  eo.texto as opcion_texto,
  eo.orden,
  (
    select count(*)
    from public.encuesta_votos ev
    where ev.publicacion_id = e.publicacion_id
  ) as total_votos,
  (
    select count(*)
    from public.encuesta_votos ev
    where ev.opcion_id = eo.id
  ) as votos_opcion,
  (
    select ev.opcion_id
    from public.encuesta_votos ev
    where ev.publicacion_id = e.publicacion_id
      and ev.usuario_id = auth.uid()
    limit 1
  ) as usuario_opcion_id
from public.encuestas e
join public.encuesta_opciones eo
  on eo.publicacion_id = e.publicacion_id
order by e.publicacion_id, eo.orden;

grant select on public.encuestas_feed to anon, authenticated;

-- Vista detallada para notificaciones.
create or replace view public.notificaciones_detalle
with (security_invoker = true)
as
select
  n.id,
  n.usuario_id,
  n.actor_id,
  n.tipo,
  n.publicacion_id,
  n.leida,
  n.creado_en,
  actor.username as actor_username,
  actor.nombre_visible as actor_nombre_visible,
  actor.avatar_url as actor_avatar_url
from public.notificaciones n
left join public.perfiles actor on actor.id = n.actor_id
where n.usuario_id = auth.uid();

grant select on public.notificaciones_detalle to authenticated;
