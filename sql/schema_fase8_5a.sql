-- ============================================================
-- SOCIALGO - FASE 8.5A
-- CLIPS DE HASTA 3 MINUTOS
-- Ejecutar una vez en Supabase SQL Editor.
-- ============================================================

alter table public.publicaciones
  drop constraint if exists publicaciones_duracion_clip;

alter table public.publicaciones
  add constraint publicaciones_duracion_clip
  check (
    tipo <> 'clip'
    or (
      duracion_segundos is not null
      and duracion_segundos between 1 and 180
    )
  );

update storage.buckets
set
  file_size_limit = 104857600,
  allowed_mime_types = array[
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'image/jpeg'
  ]
where id = 'clips';
