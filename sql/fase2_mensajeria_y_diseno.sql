-- ============================================================
-- MiZona.pe — FASE 2
-- Corrección definitiva de mensajería, RLS y nombre de marca.
-- Ejecutar UNA VEZ en Supabase > SQL Editor.
-- Es seguro volver a ejecutarlo si fuera necesario.
-- ============================================================

begin;

-- 1) Campos de lectura de mensajes.
alter table if exists public.mensajes
  add column if not exists leido boolean not null default false;

alter table if exists public.mensajes
  add column if not exists leido_en timestamptz;

alter table public.conversaciones enable row level security;
alter table public.conversacion_participantes enable row level security;
alter table public.mensajes enable row level security;

-- 2) Función auxiliar SECURITY DEFINER.
-- Evita que una política de conversacion_participantes consulte la misma
-- tabla bajo RLS y genere: "infinite recursion detected in policy".
create or replace function public.es_participante_conversacion(
  p_conversacion_id uuid,
  p_usuario_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.conversacion_participantes cp
    where cp.conversacion_id = p_conversacion_id
      and cp.usuario_id = p_usuario_id
  );
$$;

revoke all on function public.es_participante_conversacion(uuid, uuid) from public;
grant execute on function public.es_participante_conversacion(uuid, uuid) to authenticated;

-- 3) Eliminar políticas anteriores de las tres tablas del chat.
-- Son tablas exclusivas de mensajería y se reconstruyen abajo.
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('conversaciones', 'conversacion_participantes', 'mensajes')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- 4) Políticas sin recursión.
create policy "mz2_conversaciones_select"
on public.conversaciones
for select
to authenticated
using (public.es_participante_conversacion(id, auth.uid()));

create policy "mz2_participantes_select"
on public.conversacion_participantes
for select
to authenticated
using (public.es_participante_conversacion(conversacion_id, auth.uid()));

create policy "mz2_mensajes_select"
on public.mensajes
for select
to authenticated
using (public.es_participante_conversacion(conversacion_id, auth.uid()));

create policy "mz2_mensajes_insert"
on public.mensajes
for insert
to authenticated
with check (
  remitente_id = auth.uid()
  and public.es_participante_conversacion(conversacion_id, auth.uid())
);

create policy "mz2_mensajes_update_lectura"
on public.mensajes
for update
to authenticated
using (public.es_participante_conversacion(conversacion_id, auth.uid()))
with check (public.es_participante_conversacion(conversacion_id, auth.uid()));

-- 5) Crear u obtener conversación directa entre dos usuarios.
create or replace function public.crear_o_obtener_conversacion(p_otro_usuario uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usuario uuid := auth.uid();
  v_conversacion uuid;
begin
  if v_usuario is null then
    raise exception 'Debes iniciar sesión';
  end if;

  if p_otro_usuario is null or p_otro_usuario = v_usuario then
    raise exception 'Usuario de destino inválido';
  end if;

  if not exists (select 1 from public.perfiles p where p.id = p_otro_usuario) then
    raise exception 'El usuario de destino no existe';
  end if;

  select c.id
    into v_conversacion
  from public.conversaciones c
  join public.conversacion_participantes mine
    on mine.conversacion_id = c.id
   and mine.usuario_id = v_usuario
  join public.conversacion_participantes other_member
    on other_member.conversacion_id = c.id
   and other_member.usuario_id = p_otro_usuario
  where (
    select count(*)
    from public.conversacion_participantes cp
    where cp.conversacion_id = c.id
  ) = 2
  order by c.creada_en desc
  limit 1;

  if v_conversacion is null then
    insert into public.conversaciones(creada_por)
    values (v_usuario)
    returning id into v_conversacion;

    insert into public.conversacion_participantes(conversacion_id, usuario_id)
    values
      (v_conversacion, v_usuario),
      (v_conversacion, p_otro_usuario);
  end if;

  return v_conversacion;
end;
$$;

revoke all on function public.crear_o_obtener_conversacion(uuid) from public;
grant execute on function public.crear_o_obtener_conversacion(uuid) to authenticated;

-- 6) Listado seguro y rápido para la pantalla de mensajes.
create or replace function public.listar_conversaciones_mizona()
returns table (
  conversacion_id uuid,
  otro_usuario_id uuid,
  otro_username text,
  otro_nombre text,
  otro_avatar_url text,
  ultimo_mensaje text,
  ultimo_mensaje_en timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.id as conversacion_id,
    other_profile.id as otro_usuario_id,
    other_profile.username::text as otro_username,
    other_profile.nombre_visible::text as otro_nombre,
    other_profile.avatar_url::text as otro_avatar_url,
    last_message.contenido::text as ultimo_mensaje,
    coalesce(last_message.creado_en, c.creada_en) as ultimo_mensaje_en
  from public.conversaciones c
  join public.conversacion_participantes mine
    on mine.conversacion_id = c.id
   and mine.usuario_id = auth.uid()
  join public.conversacion_participantes other_member
    on other_member.conversacion_id = c.id
   and other_member.usuario_id <> auth.uid()
  join public.perfiles other_profile
    on other_profile.id = other_member.usuario_id
  left join lateral (
    select m.contenido, m.creado_en
    from public.mensajes m
    where m.conversacion_id = c.id
    order by m.creado_en desc
    limit 1
  ) last_message on true
  order by coalesce(last_message.creado_en, c.creada_en) desc;
$$;

revoke all on function public.listar_conversaciones_mizona() from public;
grant execute on function public.listar_conversaciones_mizona() to authenticated;

-- 7) Vista compatible para código anterior.
create or replace view public.conversaciones_detalle
with (security_invoker = true)
as
select
  c.id as conversacion_id,
  other_profile.id as otro_usuario_id,
  other_profile.username as otro_username,
  other_profile.nombre_visible as otro_nombre,
  other_profile.avatar_url as otro_avatar_url,
  last_message.contenido as ultimo_mensaje,
  coalesce(last_message.creado_en, c.creada_en) as ultimo_mensaje_en
from public.conversaciones c
join public.conversacion_participantes mine
  on mine.conversacion_id = c.id
 and mine.usuario_id = auth.uid()
join public.conversacion_participantes other_member
  on other_member.conversacion_id = c.id
 and other_member.usuario_id <> auth.uid()
join public.perfiles other_profile
  on other_profile.id = other_member.usuario_id
left join lateral (
  select m.contenido, m.creado_en
  from public.mensajes m
  where m.conversacion_id = c.id
  order by m.creado_en desc
  limit 1
) last_message on true;

grant select on public.conversaciones_detalle to authenticated;

-- 8) Actualizar la marca antigua solo cuando todavía figure SocialGo.
do $$
begin
  if to_regclass('public.configuracion_plataforma') is not null then
    update public.configuracion_plataforma
    set nombre = 'MiZona',
        eslogan = coalesce(nullif(eslogan, ''), 'Tu zona, tu gente, tus oportunidades.'),
        actualizado_en = now()
    where regexp_replace(lower(coalesce(nombre, '')), '[^a-z0-9]', '', 'g') = 'socialgo';
  end if;
end $$;

-- 9) Realtime de mensajes, sin fallar si ya estaba agregado.
do $$
begin
  alter publication supabase_realtime add table public.mensajes;
exception
  when duplicate_object then null;
end $$;

commit;

notify pgrst, 'reload schema';
