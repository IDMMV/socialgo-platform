-- ============================================================
-- SOCIALGO - FASE 4
-- COMENTARIOS, IMÁGENES, PERFIL, REPORTES Y BLOQUEOS
-- Ejecutar una sola vez después de Fase 3.
-- ============================================================

alter table public.perfiles
  add column if not exists telefono_contacto text;

create table if not exists public.reportes_contenido (
  id bigint generated always as identity primary key,
  reportante_id uuid not null references auth.users(id) on delete cascade,
  publicacion_id uuid not null references public.publicaciones(id) on delete cascade,
  motivo text not null check (char_length(motivo) between 3 and 500),
  estado text not null default 'pendiente'
    check (estado in ('pendiente','revision','resuelto','descartado')),
  creado_en timestamptz not null default now(),
  unique (reportante_id, publicacion_id)
);

create table if not exists public.usuarios_bloqueados (
  bloqueador_id uuid not null references auth.users(id) on delete cascade,
  bloqueado_id uuid not null references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (bloqueador_id, bloqueado_id),
  check (bloqueador_id <> bloqueado_id)
);

create table if not exists public.notificaciones (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('like','comentario','seguimiento','sistema')),
  publicacion_id uuid references public.publicaciones(id) on delete cascade,
  leida boolean not null default false,
  creado_en timestamptz not null default now()
);

alter table public.reportes_contenido enable row level security;
alter table public.usuarios_bloqueados enable row level security;
alter table public.notificaciones enable row level security;

drop policy if exists "Usuario crea reportes" on public.reportes_contenido;
create policy "Usuario crea reportes"
on public.reportes_contenido for insert
to authenticated
with check (reportante_id = auth.uid());

drop policy if exists "Usuario ve sus reportes" on public.reportes_contenido;
create policy "Usuario ve sus reportes"
on public.reportes_contenido for select
to authenticated
using (reportante_id = auth.uid() or public.is_admin());

drop policy if exists "Administradores gestionan reportes" on public.reportes_contenido;
create policy "Administradores gestionan reportes"
on public.reportes_contenido for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Usuario ve sus bloqueos" on public.usuarios_bloqueados;
create policy "Usuario ve sus bloqueos"
on public.usuarios_bloqueados for select
to authenticated
using (bloqueador_id = auth.uid());

drop policy if exists "Usuario crea bloqueos" on public.usuarios_bloqueados;
create policy "Usuario crea bloqueos"
on public.usuarios_bloqueados for insert
to authenticated
with check (bloqueador_id = auth.uid());

drop policy if exists "Usuario elimina bloqueos" on public.usuarios_bloqueados;
create policy "Usuario elimina bloqueos"
on public.usuarios_bloqueados for delete
to authenticated
using (bloqueador_id = auth.uid());

drop policy if exists "Usuario ve notificaciones" on public.notificaciones;
create policy "Usuario ve notificaciones"
on public.notificaciones for select
to authenticated
using (usuario_id = auth.uid());

drop policy if exists "Usuario actualiza notificaciones" on public.notificaciones;
create policy "Usuario actualiza notificaciones"
on public.notificaciones for update
to authenticated
using (usuario_id = auth.uid())
with check (usuario_id = auth.uid());

-- Vistas para comentarios.
create or replace view public.comentarios_detalle
with (security_invoker = true)
as
select
  c.id,
  c.publicacion_id,
  c.autor_id,
  c.contenido,
  c.creado_en,
  p.username,
  p.nombre_visible,
  p.avatar_url
from public.comentarios c
join public.perfiles p on p.id = c.autor_id;

grant select on public.comentarios_detalle to anon, authenticated;

-- Actualizar vista del feed excluyendo usuarios bloqueados.
create or replace view public.publicaciones_feed
with (security_invoker = true)
as
select
  p.id,
  p.autor_id,
  p.contenido,
  p.tipo,
  p.archivo_url,
  p.miniatura_url,
  p.visibilidad,
  p.permitir_comentarios,
  p.permitir_descargas,
  p.creado_en,
  pf.username,
  pf.nombre_visible,
  pf.avatar_url,
  (select count(*) from public.me_gusta_publicaciones mg where mg.publicacion_id = p.id) as total_me_gusta,
  (select count(*) from public.comentarios c where c.publicacion_id = p.id) as total_comentarios,
  (select count(*) from public.publicaciones_compartidas pc where pc.publicacion_id = p.id) as total_compartidos,
  exists (
    select 1 from public.me_gusta_publicaciones mg
    where mg.publicacion_id = p.id and mg.usuario_id = auth.uid()
  ) as usuario_dio_me_gusta,
  exists (
    select 1 from public.publicaciones_guardadas pg
    where pg.publicacion_id = p.id and pg.usuario_id = auth.uid()
  ) as usuario_guardo
from public.publicaciones p
join public.perfiles pf on pf.id = p.autor_id
where
  p.estado_moderacion = 'aprobado'
  and (
    p.visibilidad = 'public'
    or p.autor_id = auth.uid()
    or public.is_admin()
  )
  and not exists (
    select 1 from public.usuarios_bloqueados ub
    where ub.bloqueador_id = auth.uid()
      and ub.bloqueado_id = p.autor_id
  );

grant select on public.publicaciones_feed to anon, authenticated;

-- Notificaciones automáticas.
create or replace function public.notify_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare owner_id uuid;
begin
  select autor_id into owner_id
  from public.publicaciones
  where id = new.publicacion_id;

  if owner_id is not null and owner_id <> new.usuario_id then
    insert into public.notificaciones(usuario_id, actor_id, tipo, publicacion_id)
    values (owner_id, new.usuario_id, 'like', new.publicacion_id);
  end if;

  return new;
end;
$$;

drop trigger if exists notify_on_like on public.me_gusta_publicaciones;
create trigger notify_on_like
after insert on public.me_gusta_publicaciones
for each row execute function public.notify_like();

create or replace function public.notify_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare owner_id uuid;
begin
  select autor_id into owner_id
  from public.publicaciones
  where id = new.publicacion_id;

  if owner_id is not null and owner_id <> new.autor_id then
    insert into public.notificaciones(usuario_id, actor_id, tipo, publicacion_id)
    values (owner_id, new.autor_id, 'comentario', new.publicacion_id);
  end if;

  return new;
end;
$$;

drop trigger if exists notify_on_comment on public.comentarios;
create trigger notify_on_comment
after insert on public.comentarios
for each row execute function public.notify_comment();

-- Buckets públicos. Los permisos de escritura siguen protegidos por usuario.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('publicaciones', 'publicaciones', true, 6291456, array['image/jpeg','image/png','image/webp']),
  ('avatares', 'avatares', true, 3145728, array['image/jpeg','image/png','image/webp']),
  ('portadas', 'portadas', true, 6291456, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage: lectura pública.
drop policy if exists "Leer imagenes publicas SocialGo" on storage.objects;
create policy "Leer imagenes publicas SocialGo"
on storage.objects for select
to public
using (bucket_id in ('publicaciones','avatares','portadas'));

-- El primer segmento de la ruta debe coincidir con auth.uid().
drop policy if exists "Subir imagenes propias SocialGo" on storage.objects;
create policy "Subir imagenes propias SocialGo"
on storage.objects for insert
to authenticated
with check (
  bucket_id in ('publicaciones','avatares','portadas')
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Actualizar imagenes propias SocialGo" on storage.objects;
create policy "Actualizar imagenes propias SocialGo"
on storage.objects for update
to authenticated
using (
  bucket_id in ('publicaciones','avatares','portadas')
  and owner_id = auth.uid()::text
)
with check (
  bucket_id in ('publicaciones','avatares','portadas')
  and owner_id = auth.uid()::text
);

drop policy if exists "Eliminar imagenes propias SocialGo" on storage.objects;
create policy "Eliminar imagenes propias SocialGo"
on storage.objects for delete
to authenticated
using (
  bucket_id in ('publicaciones','avatares','portadas')
  and owner_id = auth.uid()::text
);
