-- ============================================================
-- SOCIALGO - REPARACIÓN FASE 8.4
-- MENSAJERÍA Y PERMISOS
-- Ejecutar una vez en Supabase SQL Editor.
-- ============================================================

alter table public.mensajes
  add column if not exists leido boolean not null default false;

alter table public.mensajes
  add column if not exists leido_en timestamptz;

alter table public.mensajes enable row level security;
alter table public.conversaciones enable row level security;
alter table public.conversacion_participantes enable row level security;

drop policy if exists "Participante ve mensajes" on public.mensajes;
create policy "Participante ve mensajes"
on public.mensajes for select
to authenticated
using (
  exists (
    select 1
    from public.conversacion_participantes cp
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
    select 1
    from public.conversacion_participantes cp
    where cp.conversacion_id = mensajes.conversacion_id
      and cp.usuario_id = auth.uid()
  )
);

drop policy if exists "Participante marca mensajes leidos" on public.mensajes;
create policy "Participante marca mensajes leidos"
on public.mensajes for update
to authenticated
using (
  exists (
    select 1
    from public.conversacion_participantes cp
    where cp.conversacion_id = mensajes.conversacion_id
      and cp.usuario_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.conversacion_participantes cp
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

  if p_otro_usuario is null or p_otro_usuario = auth.uid() then
    raise exception 'Usuario de destino inválido';
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

do $$
begin
  alter publication supabase_realtime add table public.mensajes;
exception
  when duplicate_object then null;
end $$;
