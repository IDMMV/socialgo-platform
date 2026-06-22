-- ============================================================
-- SOCIALGO - FASE 8.5B
-- TEXTO EDITABLE EN CLIPS
-- Ejecutar después de schema_fase8_5a.sql
-- ============================================================

alter table public.publicaciones
  add column if not exists clip_editor jsonb not null default '{}'::jsonb;

create or replace view public.clips_feed
with (security_invoker = true)
as
select
  p.id,
  p.autor_id,
  p.contenido,
  p.archivo_url,
  p.miniatura_url,
  p.clip_editor,
  p.visibilidad,
  p.permitir_comentarios,
  p.permitir_descargas,
  p.duracion_segundos,
  p.creado_en,
  pf.username,
  pf.nombre_visible,
  pf.avatar_url,
  (
    select count(*) from public.me_gusta_publicaciones mg
    where mg.publicacion_id = p.id
  ) as total_me_gusta,
  (
    select count(*) from public.comentarios c
    where c.publicacion_id = p.id
  ) as total_comentarios,
  (
    select count(*) from public.publicaciones_compartidas pc
    where pc.publicacion_id = p.id
  ) as total_compartidos,
  exists (
    select 1 from public.me_gusta_publicaciones mg
    where mg.publicacion_id = p.id
      and mg.usuario_id = auth.uid()
  ) as usuario_dio_me_gusta,
  exists (
    select 1 from public.publicaciones_guardadas pg
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
    select 1 from public.usuarios_bloqueados ub
    where ub.bloqueador_id = auth.uid()
      and ub.bloqueado_id = p.autor_id
  );

grant select on public.clips_feed to anon, authenticated;
