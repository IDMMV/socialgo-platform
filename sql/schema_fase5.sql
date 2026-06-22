-- ============================================================
-- SOCIALGO - FASE 5
-- CLIPS Y VIDEOS CORTOS
-- Ejecutar una sola vez después de Fase 4.1
-- ============================================================

alter table public.publicaciones
  add column if not exists duracion_segundos integer;

alter table public.publicaciones
  drop constraint if exists publicaciones_duracion_clip;

alter table public.publicaciones
  add constraint publicaciones_duracion_clip
  check (
    tipo <> 'clip'
    or (
      duracion_segundos is not null
      and duracion_segundos between 1 and 60
    )
  );

-- Bucket público para videos cortos.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'clips',
  'clips',
  true,
  26214400,
  array['video/mp4','video/webm','video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Leer clips publicos" on storage.objects;
create policy "Leer clips publicos"
on storage.objects for select
to public
using (bucket_id = 'clips');

drop policy if exists "Subir clips propios" on storage.objects;
create policy "Subir clips propios"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'clips'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Eliminar clips propios" on storage.objects;
create policy "Eliminar clips propios"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'clips'
  and owner_id = auth.uid()::text
);

-- Vista para el feed vertical de clips.
create or replace view public.clips_feed
with (security_invoker = true)
as
select
  p.id,
  p.autor_id,
  p.contenido,
  p.archivo_url,
  p.visibilidad,
  p.permitir_comentarios,
  p.permitir_descargas,
  p.duracion_segundos,
  p.creado_en,
  pf.username,
  pf.nombre_visible,
  pf.avatar_url,
  (
    select count(*)
    from public.me_gusta_publicaciones mg
    where mg.publicacion_id = p.id
  ) as total_me_gusta,
  (
    select count(*)
    from public.comentarios c
    where c.publicacion_id = p.id
  ) as total_comentarios,
  (
    select count(*)
    from public.publicaciones_compartidas pc
    where pc.publicacion_id = p.id
  ) as total_compartidos,
  exists (
    select 1
    from public.me_gusta_publicaciones mg
    where mg.publicacion_id = p.id
      and mg.usuario_id = auth.uid()
  ) as usuario_dio_me_gusta,
  exists (
    select 1
    from public.publicaciones_guardadas pg
    where pg.publicacion_id = p.id
      and pg.usuario_id = auth.uid()
  ) as usuario_guardo
from public.publicaciones p
join public.perfiles pf on pf.id = p.autor_id
where
  p.tipo = 'clip'
  and p.estado_moderacion = 'aprobado'
  and (
    p.visibilidad = 'public'
    or p.autor_id = auth.uid()
    or public.is_admin()
  )
  and not exists (
    select 1
    from public.usuarios_bloqueados ub
    where ub.bloqueador_id = auth.uid()
      and ub.bloqueado_id = p.autor_id
  );

grant select on public.clips_feed to anon, authenticated;
