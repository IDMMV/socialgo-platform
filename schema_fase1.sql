-- SOCIALGO - FASE 1 (BORRADOR)
-- Ejecutar en un proyecto Supabase de DESARROLLO.
-- Revisar y probar antes de usar en producción.

create extension if not exists pgcrypto;

create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-zA-Z0-9_.]{3,24}$'),
  nombre_visible text not null check (char_length(nombre_visible) between 1 and 80),
  tipo_cuenta text not null default 'personal'
    check (tipo_cuenta in ('personal','creator','business','organization')),
  biografia text,
  avatar_url text,
  portada_url text,
  permitir_busqueda_telefono boolean not null default false,
  permitir_busqueda_correo boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.configuracion_plataforma (
  id smallint primary key default 1 check (id = 1),
  nombre text not null default 'SocialGo',
  eslogan text not null default 'Conecta, comparte y crece.',
  logo_url text,
  icono_url text,
  color_principal text not null default '#7c3aed',
  color_secundario text not null default '#22b8f0',
  actualizado_en timestamptz not null default now()
);

create table if not exists public.publicaciones (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null references public.perfiles(id) on delete cascade,
  contenido text check (char_length(contenido) <= 5000),
  tipo text not null default 'texto'
    check (tipo in ('texto','imagen','video','clip','encuesta')),
  archivo_url text,
  miniatura_url text,
  visibilidad text not null default 'public'
    check (visibilidad in ('public','followers','friends','private')),
  permitir_comentarios boolean not null default true,
  permitir_descargas boolean not null default false,
  estado_moderacion text not null default 'pendiente'
    check (estado_moderacion in ('pendiente','aprobado','revision','rechazado')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.pendientes_proyecto (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  categoria text not null,
  descripcion text,
  proveedor text,
  costo_estimado numeric(14,2),
  moneda text not null default 'USD',
  prioridad text not null default 'media'
    check (prioridad in ('critica','alta','media','baja')),
  estado text not null default 'por_investigar'
    check (estado in ('idea','por_investigar','cotizar','por_decidir','aprobado','contratado','implementando','completado','descartado')),
  fecha_limite date,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.auditoria_admin (
  id bigint generated always as identity primary key,
  administrador_id uuid references auth.users(id),
  modulo text not null,
  accion text not null,
  entidad text,
  entidad_id text,
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  motivo text,
  creado_en timestamptz not null default now()
);

alter table public.perfiles enable row level security;
alter table public.configuracion_plataforma enable row level security;
alter table public.publicaciones enable row level security;
alter table public.pendientes_proyecto enable row level security;
alter table public.auditoria_admin enable row level security;

-- Políticas básicas. Las políticas administrativas se añadirán en Fase 2
-- usando roles verificados en servidor.

drop policy if exists "Perfiles públicos visibles" on public.perfiles;
create policy "Perfiles públicos visibles"
on public.perfiles for select
using (true);

drop policy if exists "Usuario actualiza su perfil" on public.perfiles;
create policy "Usuario actualiza su perfil"
on public.perfiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Usuario crea su perfil" on public.perfiles;
create policy "Usuario crea su perfil"
on public.perfiles for insert
with check (auth.uid() = id);

drop policy if exists "Marca visible públicamente" on public.configuracion_plataforma;
create policy "Marca visible públicamente"
on public.configuracion_plataforma for select
using (true);

drop policy if exists "Publicaciones públicas visibles" on public.publicaciones;
create policy "Publicaciones públicas visibles"
on public.publicaciones for select
using (
  visibilidad = 'public'
  or autor_id = auth.uid()
);

drop policy if exists "Autor crea publicación" on public.publicaciones;
create policy "Autor crea publicación"
on public.publicaciones for insert
with check (autor_id = auth.uid());

drop policy if exists "Autor actualiza publicación" on public.publicaciones;
create policy "Autor actualiza publicación"
on public.publicaciones for update
using (autor_id = auth.uid())
with check (autor_id = auth.uid());

drop policy if exists "Autor elimina publicación" on public.publicaciones;
create policy "Autor elimina publicación"
on public.publicaciones for delete
using (autor_id = auth.uid());

insert into public.configuracion_plataforma (id)
values (1)
on conflict (id) do nothing;
