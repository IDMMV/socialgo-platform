create extension if not exists pgcrypto;

create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_.]{3,24}$'),
  nombre_visible text not null check (char_length(nombre_visible) between 1 and 80),
  tipo_cuenta text not null default 'personal' check (tipo_cuenta in ('personal','creator','business','organization')),
  biografia text,
  avatar_url text,
  portada_url text,
  permitir_busqueda_telefono boolean not null default false,
  permitir_busqueda_correo boolean not null default false,
  estado text not null default 'activo' check (estado in ('activo','suspendido','eliminacion_pendiente')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.roles_usuario (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  rol text not null check (rol in ('owner','admin','moderator','finance','support','verification','marketing','auditor')),
  asignado_en timestamptz not null default now(),
  asignado_por uuid references auth.users(id),
  primary key (usuario_id,rol)
);

create table if not exists public.configuracion_plataforma (
  id smallint primary key default 1 check (id=1),
  nombre text not null default 'SocialGo',
  eslogan text not null default 'Conecta, comparte y crece.',
  logo_url text,
  icono_url text,
  color_principal text not null default '#7c3aed',
  color_secundario text not null default '#22b8f0',
  actualizado_en timestamptz not null default now()
);

create table if not exists public.pendientes_proyecto (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  categoria text not null,
  descripcion text,
  proveedor text,
  costo_estimado numeric(14,2),
  costo_real numeric(14,2),
  moneda text not null default 'USD',
  prioridad text not null default 'media' check (prioridad in ('critica','alta','media','baja')),
  estado text not null default 'por_investigar' check (estado in ('idea','por_investigar','cotizar','por_decidir','aprobado','contratado','implementando','completado','descartado')),
  fecha_limite date,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create or replace function public.username_available(requested_username text)
returns boolean language sql stable security definer set search_path=public as $$
 select requested_username ~ '^[a-z0-9_.]{3,24}$' and not exists(select 1 from public.perfiles where username=lower(requested_username));
$$;
grant execute on function public.username_available(text) to anon,authenticated;

create or replace function public.has_role(required_role text)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.roles_usuario where usuario_id=auth.uid() and rol=required_role);
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.roles_usuario where usuario_id=auth.uid() and rol in ('owner','admin'));
$$;
grant execute on function public.has_role(text) to authenticated;
grant execute on function public.is_admin() to authenticated;

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path=public as $$ begin new.actualizado_en=now(); return new; end; $$;

drop trigger if exists perfiles_set_updated_at on public.perfiles;
create trigger perfiles_set_updated_at before update on public.perfiles for each row execute function public.set_updated_at();

drop trigger if exists pendientes_set_updated_at on public.pendientes_proyecto;
create trigger pendientes_set_updated_at before update on public.pendientes_proyecto for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare u text; n text; t text;
begin
 u:=lower(trim(coalesce(new.raw_user_meta_data->>'username','')));
 n:=trim(coalesce(new.raw_user_meta_data->>'full_name',u));
 t:=coalesce(new.raw_user_meta_data->>'account_type','personal');
 if u !~ '^[a-z0-9_.]{3,24}$' then raise exception 'Nombre de usuario inválido'; end if;
 if t not in ('personal','creator','business','organization') then t:='personal'; end if;
 insert into public.perfiles(id,username,nombre_visible,tipo_cuenta) values(new.id,u,n,t);
 return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.perfiles enable row level security;
alter table public.roles_usuario enable row level security;
alter table public.configuracion_plataforma enable row level security;
alter table public.pendientes_proyecto enable row level security;

drop policy if exists "Perfiles visibles" on public.perfiles;
create policy "Perfiles visibles" on public.perfiles for select to anon,authenticated using(estado='activo' or id=auth.uid() or public.is_admin());
drop policy if exists "Usuario actualiza su perfil" on public.perfiles;
create policy "Usuario actualiza su perfil" on public.perfiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());

drop policy if exists "Usuario ve sus roles" on public.roles_usuario;
create policy "Usuario ve sus roles" on public.roles_usuario for select to authenticated using(usuario_id=auth.uid() or public.is_admin());
drop policy if exists "Owner administra roles" on public.roles_usuario;
create policy "Owner administra roles" on public.roles_usuario for all to authenticated using(public.has_role('owner')) with check(public.has_role('owner'));

drop policy if exists "Marca pública" on public.configuracion_plataforma;
create policy "Marca pública" on public.configuracion_plataforma for select to anon,authenticated using(true);
drop policy if exists "Admin modifica marca" on public.configuracion_plataforma;
create policy "Admin modifica marca" on public.configuracion_plataforma for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists "Admin ve pendientes" on public.pendientes_proyecto;
create policy "Admin ve pendientes" on public.pendientes_proyecto for select to authenticated using(public.is_admin());
drop policy if exists "Admin gestiona pendientes" on public.pendientes_proyecto;
create policy "Admin gestiona pendientes" on public.pendientes_proyecto for all to authenticated using(public.is_admin()) with check(public.is_admin());

insert into public.configuracion_plataforma(id) values(1) on conflict(id) do nothing;
insert into public.pendientes_proyecto(titulo,categoria,descripcion,prioridad,estado)
select * from (values
 ('Elegir nombre y dominio definitivo','Marca','SocialGo es provisional.','critica','por_investigar'),
 ('Configurar Cloudflare y Turnstile','Seguridad','Protección contra bots y abuso.','alta','por_investigar'),
 ('Evaluar proveedor de video','Infraestructura','Comparar Cloudflare Stream y Mux.','alta','cotizar'),
 ('Evaluar moderación automática','Seguridad','Comparar proveedores.','alta','cotizar'),
 ('Preparar términos y privacidad','Legal','Revisión profesional antes del lanzamiento.','alta','por_investigar')
) v(titulo,categoria,descripcion,prioridad,estado)
where not exists(select 1 from public.pendientes_proyecto);

-- DESPUÉS de registrar y confirmar tu cuenta, ejecuta por separado:
-- insert into public.roles_usuario(usuario_id,rol)
-- select id,'owner' from auth.users where email='TU_CORREO'
-- on conflict do nothing;
