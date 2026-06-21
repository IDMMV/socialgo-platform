-- ============================================================
-- SOCIALGO - FASE 3
-- PUBLICACIONES, ME GUSTA, GUARDADOS Y COMPARTIDOS
-- Ejecutar una sola vez después de Fase 2.
-- ============================================================

create table if not exists public.me_gusta_publicaciones (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  publicacion_id uuid not null references public.publicaciones(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (usuario_id, publicacion_id)
);

create table if not exists public.publicaciones_guardadas (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  publicacion_id uuid not null references public.publicaciones(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (usuario_id, publicacion_id)
);

create table if not exists public.publicaciones_compartidas (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  publicacion_id uuid not null references public.publicaciones(id) on delete cascade,
  creado_en timestamptz not null default now()
);

create table if not exists public.comentarios (
  id uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references public.publicaciones(id) on delete cascade,
  autor_id uuid not null references auth.users(id) on delete cascade,
  contenido text not null check (char_length(contenido) between 1 and 1000),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table public.me_gusta_publicaciones enable row level security;
alter table public.publicaciones_guardadas enable row level security;
alter table public.publicaciones_compartidas enable row level security;
alter table public.comentarios enable row level security;

-- Me gusta
drop policy if exists "Me gusta visibles" on public.me_gusta_publicaciones;
create policy "Me gusta visibles"
on public.me_gusta_publicaciones for select
to anon, authenticated
using (true);

drop policy if exists "Usuario gestiona sus me gusta" on public.me_gusta_publicaciones;
create policy "Usuario gestiona sus me gusta"
on public.me_gusta_publicaciones for all
to authenticated
using (usuario_id = auth.uid())
with check (usuario_id = auth.uid());

-- Guardados
drop policy if exists "Usuario ve sus guardados" on public.publicaciones_guardadas;
create policy "Usuario ve sus guardados"
on public.publicaciones_guardadas for select
to authenticated
using (usuario_id = auth.uid());

drop policy if exists "Usuario gestiona sus guardados" on public.publicaciones_guardadas;
create policy "Usuario gestiona sus guardados"
on public.publicaciones_guardadas for all
to authenticated
using (usuario_id = auth.uid())
with check (usuario_id = auth.uid());

-- Compartidos
drop policy if exists "Usuario ve sus compartidos" on public.publicaciones_compartidas;
create policy "Usuario ve sus compartidos"
on public.publicaciones_compartidas for select
to authenticated
using (usuario_id = auth.uid() or public.is_admin());

drop policy if exists "Usuario registra compartidos" on public.publicaciones_compartidas;
create policy "Usuario registra compartidos"
on public.publicaciones_compartidas for insert
to authenticated
with check (usuario_id = auth.uid());

-- Comentarios
drop policy if exists "Comentarios visibles" on public.comentarios;
create policy "Comentarios visibles"
on public.comentarios for select
to anon, authenticated
using (true);

drop policy if exists "Usuario crea comentario" on public.comentarios;
create policy "Usuario crea comentario"
on public.comentarios for insert
to authenticated
with check (autor_id = auth.uid());

drop policy if exists "Autor gestiona comentario" on public.comentarios;
create policy "Autor gestiona comentario"
on public.comentarios for update
to authenticated
using (autor_id = auth.uid() or public.is_admin())
with check (autor_id = auth.uid() or public.is_admin());

drop policy if exists "Autor elimina comentario" on public.comentarios;
create policy "Autor elimina comentario"
on public.comentarios for delete
to authenticated
using (autor_id = auth.uid() or public.is_admin());

-- Vista segura para el feed
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
  p.estado_moderacion = 'aprobado'
  and (
    p.visibilidad = 'public'
    or p.autor_id = auth.uid()
    or public.is_admin()
  );

grant select on public.publicaciones_feed to anon, authenticated;

-- Asegurar que las publicaciones nuevas puedan aprobarse en esta fase.
-- En fases posteriores pasarán por moderación automática.
