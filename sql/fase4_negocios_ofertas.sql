-- ============================================================
-- MiZona.pe — Fase 4: Negocios, catálogo de ofertas y moderación
-- Ejecutar una sola vez en Supabase SQL Editor.
-- Requiere las tablas perfiles y roles_usuario de las fases previas.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- UTILIDADES ----------
create or replace function public.mz_slugify(value text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(
    lower(translate(coalesce(value,''),
      'áéíóúüñÁÉÍÓÚÜÑ',
      'aeiouunAEIOUUN')),
    '[^a-z0-9]+','-','g'));
$$;

-- ---------- NEGOCIOS ----------
create table if not exists public.negocios (
  id uuid primary key default gen_random_uuid(),
  propietario_id uuid not null references public.perfiles(id) on delete cascade,
  slug text not null unique,
  nombre_comercial text not null check (char_length(nombre_comercial) between 2 and 100),
  categoria text not null default 'otros',
  descripcion text,
  logo_url text,
  portada_url text,
  distrito text,
  zona text,
  direccion_publica text,
  latitud numeric,
  longitud numeric,
  whatsapp text,
  telefono text,
  correo_publico text,
  sitio_web text,
  horario jsonb not null default '{}'::jsonb,
  delivery boolean not null default false,
  atiende_domicilio boolean not null default false,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','aprobado','rechazado','suspendido','cerrado')),
  verificado boolean not null default false,
  destacado boolean not null default false,
  motivo_estado text,
  aprobado_por uuid references public.perfiles(id),
  aprobado_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.negocio_miembros (
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  rol text not null default 'administrador'
    check (rol in ('propietario','administrador','editor','atencion')),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  primary key (negocio_id,usuario_id)
);

create table if not exists public.solicitudes_negocio (
  id uuid primary key default gen_random_uuid(),
  solicitante_id uuid not null references public.perfiles(id) on delete cascade,
  nombre_comercial text not null check (char_length(nombre_comercial) between 2 and 100),
  categoria text not null,
  tipo_persona text not null default 'persona_natural'
    check (tipo_persona in ('persona_natural','empresa','organizacion')),
  documento_tipo text check (documento_tipo in ('dni','ruc','ce','otro')),
  documento_numero text,
  descripcion text,
  distrito text,
  zona text,
  direccion text,
  whatsapp text,
  correo_comercial text,
  logo_url text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','aprobada','rechazada','correccion','cancelada')),
  motivo_revision text,
  revisado_por uuid references public.perfiles(id),
  revisado_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.negocio_servicios (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 2 and 100),
  descripcion text,
  precio_desde numeric(12,2),
  activo boolean not null default true,
  orden integer not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.negocio_fotos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  url text not null,
  descripcion text,
  orden integer not null default 0,
  visible boolean not null default true,
  creado_en timestamptz not null default now()
);

create table if not exists public.negocio_resenas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  puntuacion smallint not null check (puntuacion between 1 and 5),
  comentario text,
  visible boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique(negocio_id,usuario_id)
);

create or replace function public.mz_is_business_member(p_negocio uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1 from public.negocio_miembros nm
    where nm.negocio_id=p_negocio
      and nm.usuario_id=auth.uid()
      and nm.activo=true
  ) or public.is_admin();
$$;

-- ---------- AMPLIAR OFERTAS EXISTENTES ----------
create table if not exists public.ofertas_negocios (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid references public.perfiles(id) on delete set null,
  titulo text not null,
  descripcion text,
  tipo text not null default 'descuento',
  modalidad text not null default 'tienda',
  descuento_texto text,
  vence_en timestamptz,
  recurrente text,
  distrito text,
  activa boolean default true,
  es_boost boolean default false,
  vistas int default 0,
  clics int default 0,
  whatsapp_recibidos int default 0,
  created_at timestamptz default now()
);

alter table public.ofertas_negocios alter column negocio_id drop not null;
alter table public.ofertas_negocios add column if not exists comercio_id uuid references public.negocios(id) on delete cascade;
alter table public.ofertas_negocios add column if not exists imagen_url text;
alter table public.ofertas_negocios add column if not exists precio_normal numeric(12,2);
alter table public.ofertas_negocios add column if not exists precio_oferta numeric(12,2);
alter table public.ofertas_negocios add column if not exists porcentaje_descuento numeric(5,2);
alter table public.ofertas_negocios add column if not exists stock integer;
alter table public.ofertas_negocios add column if not exists fecha_inicio timestamptz default now();
alter table public.ofertas_negocios add column if not exists condiciones text;
alter table public.ofertas_negocios add column if not exists categoria text default 'otros';
alter table public.ofertas_negocios add column if not exists estado text default 'borrador';
alter table public.ofertas_negocios add column if not exists motivo_revision text;
alter table public.ofertas_negocios add column if not exists aprobado_por uuid references public.perfiles(id);
alter table public.ofertas_negocios add column if not exists aprobado_en timestamptz;
alter table public.ofertas_negocios add column if not exists permite_cupon boolean default false;
alter table public.ofertas_negocios add column if not exists max_cupones integer;
alter table public.ofertas_negocios add column if not exists actualizado_en timestamptz default now();

-- Quitar un check antiguo si impide nuevas modalidades/estados.
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid='public.ofertas_negocios'::regclass
      and contype='c'
      and pg_get_constraintdef(oid) ilike '%estado%'
  loop
    execute format('alter table public.ofertas_negocios drop constraint if exists %I',r.conname);
  end loop;
end $$;

alter table public.ofertas_negocios
  add constraint ofertas_negocios_estado_check
  check (estado in ('borrador','pendiente','publicada','rechazada','pausada','vencida')) not valid;

create table if not exists public.ofertas_guardadas (
  oferta_id uuid not null references public.ofertas_negocios(id) on delete cascade,
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key(oferta_id,usuario_id)
);

create table if not exists public.cupones_clientes (
  id uuid primary key default gen_random_uuid(),
  oferta_id uuid not null references public.ofertas_negocios(id) on delete cascade,
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  codigo text not null unique,
  estado text not null default 'activo' check (estado in ('activo','usado','vencido','cancelado')),
  usado_en timestamptz,
  creado_en timestamptz not null default now(),
  unique(oferta_id,usuario_id)
);

create table if not exists public.negocio_auditoria (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid references public.negocios(id) on delete cascade,
  oferta_id uuid references public.ofertas_negocios(id) on delete cascade,
  usuario_id uuid references public.perfiles(id),
  accion text not null,
  detalle jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);

-- ---------- ÍNDICES ----------
create index if not exists negocios_estado_distrito_idx on public.negocios(estado,distrito);
create index if not exists negocios_propietario_idx on public.negocios(propietario_id);
create index if not exists solicitudes_negocio_estado_idx on public.solicitudes_negocio(estado,creado_en desc);
create index if not exists ofertas_comercio_estado_idx on public.ofertas_negocios(comercio_id,estado);
create index if not exists ofertas_publicas_idx on public.ofertas_negocios(estado,vence_en,fecha_inicio);
create index if not exists resenas_negocio_idx on public.negocio_resenas(negocio_id,visible);

-- ---------- TRIGGERS ----------
create or replace function public.mz_set_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin
  new.actualizado_en=now();
  return new;
end $$;


create or replace function public.mz_protect_business_moderation()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if public.is_admin() then return new; end if;
  new.propietario_id:=old.propietario_id;
  new.estado:=old.estado;
  new.verificado:=old.verificado;
  new.destacado:=old.destacado;
  new.motivo_estado:=old.motivo_estado;
  new.aprobado_por:=old.aprobado_por;
  new.aprobado_en:=old.aprobado_en;
  return new;
end $$;

create or replace function public.mz_protect_request_moderation()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if public.is_admin() then return new; end if;
  new.solicitante_id:=old.solicitante_id;
  new.estado:=old.estado;
  new.motivo_revision:=old.motivo_revision;
  new.revisado_por:=old.revisado_por;
  new.revisado_en:=old.revisado_en;
  return new;
end $$;

create or replace function public.mz_protect_offer_moderation()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if public.is_admin() then return new; end if;

  if tg_op='INSERT' then
    if new.estado not in ('borrador','pendiente') then new.estado:='borrador'; end if;
    new.activa:=false;
    new.aprobado_por:=null;
    new.aprobado_en:=null;
    return new;
  end if;

  new.aprobado_por:=old.aprobado_por;
  new.aprobado_en:=old.aprobado_en;

  if new.estado='publicada' and old.estado<>'publicada' then
    raise exception 'Solo un administrador puede publicar una oferta';
  end if;

  if old.estado='publicada' and new.estado='publicada' and (
    new.titulo is distinct from old.titulo or
    new.descripcion is distinct from old.descripcion or
    new.precio_normal is distinct from old.precio_normal or
    new.precio_oferta is distinct from old.precio_oferta or
    new.imagen_url is distinct from old.imagen_url or
    new.condiciones is distinct from old.condiciones or
    new.vence_en is distinct from old.vence_en
  ) then
    raise exception 'Pausa la oferta y envíala nuevamente a revisión para modificar su contenido';
  end if;

  if new.estado<>'publicada' then new.activa:=false; end if;
  return new;
end $$;

drop trigger if exists negocios_updated_at on public.negocios;
create trigger negocios_updated_at before update on public.negocios
for each row execute function public.mz_set_updated_at();


drop trigger if exists negocios_protect_moderation on public.negocios;
create trigger negocios_protect_moderation before update on public.negocios
for each row execute function public.mz_protect_business_moderation();

drop trigger if exists solicitudes_negocio_updated_at on public.solicitudes_negocio;
create trigger solicitudes_negocio_updated_at before update on public.solicitudes_negocio
for each row execute function public.mz_set_updated_at();


drop trigger if exists solicitudes_negocio_protect_moderation on public.solicitudes_negocio;
create trigger solicitudes_negocio_protect_moderation before update on public.solicitudes_negocio
for each row execute function public.mz_protect_request_moderation();

drop trigger if exists negocio_servicios_updated_at on public.negocio_servicios;
create trigger negocio_servicios_updated_at before update on public.negocio_servicios
for each row execute function public.mz_set_updated_at();

drop trigger if exists negocio_resenas_updated_at on public.negocio_resenas;
create trigger negocio_resenas_updated_at before update on public.negocio_resenas
for each row execute function public.mz_set_updated_at();

drop trigger if exists ofertas_negocios_updated_at on public.ofertas_negocios;
create trigger ofertas_negocios_updated_at before update on public.ofertas_negocios
for each row execute function public.mz_set_updated_at();


drop trigger if exists ofertas_negocios_protect_moderation on public.ofertas_negocios;
create trigger ofertas_negocios_protect_moderation before insert or update on public.ofertas_negocios
for each row execute function public.mz_protect_offer_moderation();

-- ---------- RPC: SOLICITUD Y MODERACIÓN ----------
create or replace function public.aprobar_solicitud_negocio(
  p_solicitud_id uuid,
  p_aprobar boolean,
  p_motivo text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  s public.solicitudes_negocio%rowtype;
  n public.negocios%rowtype;
  base_slug text;
  final_slug text;
  i integer:=0;
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  select * into s from public.solicitudes_negocio where id=p_solicitud_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if s.estado not in ('pendiente','correccion') then
    raise exception 'Esta solicitud ya fue procesada';
  end if;

  if not p_aprobar then
    update public.solicitudes_negocio
      set estado='rechazada',motivo_revision=p_motivo,revisado_por=auth.uid(),revisado_en=now()
      where id=s.id;
    return jsonb_build_object('ok',true,'estado','rechazada');
  end if;

  base_slug:=public.mz_slugify(s.nombre_comercial);
  if base_slug='' then base_slug:='negocio'; end if;
  final_slug:=base_slug;
  while exists(select 1 from public.negocios where slug=final_slug) loop
    i:=i+1;
    final_slug:=base_slug||'-'||i;
  end loop;

  insert into public.negocios(
    propietario_id,slug,nombre_comercial,categoria,descripcion,distrito,zona,
    direccion_publica,whatsapp,correo_publico,logo_url,estado,verificado,
    aprobado_por,aprobado_en
  ) values(
    s.solicitante_id,final_slug,s.nombre_comercial,s.categoria,s.descripcion,s.distrito,s.zona,
    s.direccion,s.whatsapp,s.correo_comercial,s.logo_url,'aprobado',true,
    auth.uid(),now()
  ) returning * into n;

  insert into public.negocio_miembros(negocio_id,usuario_id,rol)
  values(n.id,s.solicitante_id,'propietario')
  on conflict(negocio_id,usuario_id) do update set activo=true,rol='propietario';

  update public.solicitudes_negocio
    set estado='aprobada',motivo_revision=p_motivo,revisado_por=auth.uid(),revisado_en=now()
    where id=s.id;

  insert into public.negocio_auditoria(negocio_id,usuario_id,accion,detalle)
  values(n.id,auth.uid(),'aprobar_negocio',jsonb_build_object('solicitud_id',s.id));

  return jsonb_build_object('ok',true,'estado','aprobada','negocio_id',n.id,'slug',n.slug);
end $$;

create or replace function public.enviar_oferta_revision(p_oferta_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare o public.ofertas_negocios%rowtype;
begin
  select * into o from public.ofertas_negocios where id=p_oferta_id for update;
  if not found then raise exception 'Oferta no encontrada'; end if;
  if not public.mz_is_business_member(o.comercio_id) then raise exception 'No autorizado'; end if;
  update public.ofertas_negocios set estado='pendiente',activa=false,motivo_revision=null where id=o.id;
  insert into public.negocio_auditoria(negocio_id,oferta_id,usuario_id,accion)
  values(o.comercio_id,o.id,auth.uid(),'enviar_oferta_revision');
  return jsonb_build_object('ok',true,'estado','pendiente');
end $$;

create or replace function public.moderar_oferta(
  p_oferta_id uuid,
  p_aprobar boolean,
  p_motivo text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare o public.ofertas_negocios%rowtype;
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  select * into o from public.ofertas_negocios where id=p_oferta_id for update;
  if not found then raise exception 'Oferta no encontrada'; end if;

  if p_aprobar then
    update public.ofertas_negocios
      set estado='publicada',activa=true,motivo_revision=null,aprobado_por=auth.uid(),aprobado_en=now()
      where id=o.id;
  else
    update public.ofertas_negocios
      set estado='rechazada',activa=false,motivo_revision=p_motivo,aprobado_por=auth.uid(),aprobado_en=now()
      where id=o.id;
  end if;

  insert into public.negocio_auditoria(negocio_id,oferta_id,usuario_id,accion,detalle)
  values(o.comercio_id,o.id,auth.uid(),case when p_aprobar then 'aprobar_oferta' else 'rechazar_oferta' end,
         jsonb_build_object('motivo',p_motivo));
  return jsonb_build_object('ok',true,'estado',case when p_aprobar then 'publicada' else 'rechazada' end);
end $$;

create or replace function public.reclamar_cupon(p_oferta_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  o public.ofertas_negocios%rowtype;
  c public.cupones_clientes%rowtype;
  usados integer;
  codigo_nuevo text;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;

  select * into o from public.ofertas_negocios where id=p_oferta_id for update;
  if not found or o.estado<>'publicada' or not coalesce(o.activa,false) then
    raise exception 'Oferta no disponible';
  end if;
  if not coalesce(o.permite_cupon,false) then raise exception 'Esta oferta no usa cupón'; end if;
  if o.vence_en is not null and o.vence_en<now() then raise exception 'Oferta vencida'; end if;

  select * into c from public.cupones_clientes
  where oferta_id=o.id and usuario_id=auth.uid();
  if found then
    return jsonb_build_object('ok',true,'codigo',c.codigo,'estado',c.estado,'existente',true);
  end if;

  if o.max_cupones is not null then
    select count(*) into usados from public.cupones_clientes where oferta_id=o.id;
    if usados>=o.max_cupones then raise exception 'Ya no quedan cupones'; end if;
  end if;

  codigo_nuevo:='MZ-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.cupones_clientes(oferta_id,usuario_id,codigo)
  values(o.id,auth.uid(),codigo_nuevo) returning * into c;

  return jsonb_build_object('ok',true,'codigo',c.codigo,'estado',c.estado,'existente',false);
end $$;

grant execute on function public.mz_is_business_member(uuid) to anon,authenticated;
grant execute on function public.aprobar_solicitud_negocio(uuid,boolean,text) to authenticated;
grant execute on function public.enviar_oferta_revision(uuid) to authenticated;
grant execute on function public.moderar_oferta(uuid,boolean,text) to authenticated;
grant execute on function public.reclamar_cupon(uuid) to authenticated;

-- ---------- RLS ----------
alter table public.negocios enable row level security;
alter table public.negocio_miembros enable row level security;
alter table public.solicitudes_negocio enable row level security;
alter table public.negocio_servicios enable row level security;
alter table public.negocio_fotos enable row level security;
alter table public.negocio_resenas enable row level security;
alter table public.ofertas_negocios enable row level security;
alter table public.ofertas_guardadas enable row level security;
alter table public.cupones_clientes enable row level security;
alter table public.negocio_auditoria enable row level security;

-- Negocios públicos aprobados; miembros y admin ven también los suyos.
drop policy if exists "negocios publicos y propios" on public.negocios;
create policy "negocios publicos y propios" on public.negocios
for select to anon,authenticated
using(estado='aprobado' or propietario_id=auth.uid() or public.mz_is_business_member(id) or public.is_admin());

drop policy if exists "miembros actualizan negocio" on public.negocios;
create policy "miembros actualizan negocio" on public.negocios
for update to authenticated
using(public.mz_is_business_member(id))
with check(public.mz_is_business_member(id));

-- Miembros.
drop policy if exists "miembros visibles al equipo" on public.negocio_miembros;
create policy "miembros visibles al equipo" on public.negocio_miembros
for select to authenticated
using(usuario_id=auth.uid() or public.mz_is_business_member(negocio_id) or public.is_admin());

drop policy if exists "admin gestiona miembros" on public.negocio_miembros;
create policy "admin gestiona miembros" on public.negocio_miembros
for all to authenticated
using(public.mz_is_business_member(negocio_id))
with check(public.mz_is_business_member(negocio_id));

-- Solicitudes.
drop policy if exists "usuario crea solicitud negocio" on public.solicitudes_negocio;
create policy "usuario crea solicitud negocio" on public.solicitudes_negocio
for insert to authenticated with check(solicitante_id=auth.uid());

drop policy if exists "usuario ve solicitud negocio" on public.solicitudes_negocio;
create policy "usuario ve solicitud negocio" on public.solicitudes_negocio
for select to authenticated using(solicitante_id=auth.uid() or public.is_admin());

drop policy if exists "usuario edita solicitud corregible" on public.solicitudes_negocio;
create policy "usuario edita solicitud corregible" on public.solicitudes_negocio
for update to authenticated
using(solicitante_id=auth.uid() and estado in ('pendiente','correccion'))
with check(solicitante_id=auth.uid());

-- Servicios y fotos: público si el negocio está aprobado; equipo gestiona.
drop policy if exists "servicios publicos" on public.negocio_servicios;
create policy "servicios publicos" on public.negocio_servicios
for select to anon,authenticated
using(activo=true and exists(select 1 from public.negocios n where n.id=negocio_id and n.estado='aprobado') or public.mz_is_business_member(negocio_id));

drop policy if exists "equipo gestiona servicios" on public.negocio_servicios;
create policy "equipo gestiona servicios" on public.negocio_servicios
for all to authenticated using(public.mz_is_business_member(negocio_id)) with check(public.mz_is_business_member(negocio_id));

drop policy if exists "fotos publicas" on public.negocio_fotos;
create policy "fotos publicas" on public.negocio_fotos
for select to anon,authenticated
using(visible=true and exists(select 1 from public.negocios n where n.id=negocio_id and n.estado='aprobado') or public.mz_is_business_member(negocio_id));

drop policy if exists "equipo gestiona fotos" on public.negocio_fotos;
create policy "equipo gestiona fotos" on public.negocio_fotos
for all to authenticated using(public.mz_is_business_member(negocio_id)) with check(public.mz_is_business_member(negocio_id));

-- Reseñas.
drop policy if exists "resenas publicas" on public.negocio_resenas;
create policy "resenas publicas" on public.negocio_resenas
for select to anon,authenticated using(visible=true or usuario_id=auth.uid() or public.is_admin());

drop policy if exists "usuario crea resena" on public.negocio_resenas;
create policy "usuario crea resena" on public.negocio_resenas
for insert to authenticated with check(usuario_id=auth.uid() and not public.mz_is_business_member(negocio_id));

drop policy if exists "usuario actualiza resena" on public.negocio_resenas;
create policy "usuario actualiza resena" on public.negocio_resenas
for update to authenticated using(usuario_id=auth.uid()) with check(usuario_id=auth.uid());

-- Ofertas: público solo publicadas y vigentes; equipo y admin ven todas las propias.
drop policy if exists "ofertas publicas y propias" on public.ofertas_negocios;
create policy "ofertas publicas y propias" on public.ofertas_negocios
for select to anon,authenticated
using(
  (estado='publicada' and coalesce(activa,false)=true
    and (fecha_inicio is null or fecha_inicio<=now())
    and (vence_en is null or vence_en>=now())
    and exists(select 1 from public.negocios n where n.id=comercio_id and n.estado='aprobado'))
  or public.mz_is_business_member(comercio_id)
  or public.is_admin()
);

drop policy if exists "equipo crea ofertas" on public.ofertas_negocios;
create policy "equipo crea ofertas" on public.ofertas_negocios
for insert to authenticated with check(public.mz_is_business_member(comercio_id));

drop policy if exists "equipo actualiza ofertas" on public.ofertas_negocios;
create policy "equipo actualiza ofertas" on public.ofertas_negocios
for update to authenticated
using(public.mz_is_business_member(comercio_id))
with check(public.mz_is_business_member(comercio_id));

drop policy if exists "equipo elimina borradores" on public.ofertas_negocios;
create policy "equipo elimina borradores" on public.ofertas_negocios
for delete to authenticated
using(public.mz_is_business_member(comercio_id) and estado in ('borrador','rechazada'));

-- Guardados y cupones.
drop policy if exists "usuario gestiona ofertas guardadas" on public.ofertas_guardadas;
create policy "usuario gestiona ofertas guardadas" on public.ofertas_guardadas
for all to authenticated using(usuario_id=auth.uid()) with check(usuario_id=auth.uid());

drop policy if exists "usuario ve sus cupones" on public.cupones_clientes;
create policy "usuario ve sus cupones" on public.cupones_clientes
for select to authenticated
using(usuario_id=auth.uid() or exists(
  select 1 from public.ofertas_negocios o
  where o.id=oferta_id and public.mz_is_business_member(o.comercio_id)
) or public.is_admin());

-- Auditoría solo administración.
drop policy if exists "admin ve auditoria negocio" on public.negocio_auditoria;
create policy "admin ve auditoria negocio" on public.negocio_auditoria
for select to authenticated using(public.is_admin());

-- ---------- STORAGE ----------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('negocios','negocios',true,8388608,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=8388608,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "imagenes negocios publicas" on storage.objects;
create policy "imagenes negocios publicas" on storage.objects
for select to public using(bucket_id='negocios');

drop policy if exists "usuarios suben imagenes negocio" on storage.objects;
create policy "usuarios suben imagenes negocio" on storage.objects
for insert to authenticated
with check(bucket_id='negocios' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "usuarios actualizan imagenes negocio" on storage.objects;
create policy "usuarios actualizan imagenes negocio" on storage.objects
for update to authenticated
using(bucket_id='negocios' and (storage.foldername(name))[1]=auth.uid()::text)
with check(bucket_id='negocios' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "usuarios eliminan imagenes negocio" on storage.objects;
create policy "usuarios eliminan imagenes negocio" on storage.objects
for delete to authenticated
using(bucket_id='negocios' and (storage.foldername(name))[1]=auth.uid()::text);

-- ---------- REALTIME ----------
do $$
begin
  begin alter publication supabase_realtime add table public.solicitudes_negocio; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.ofertas_negocios; exception when duplicate_object then null; end;
end $$;

-- Resultado de comprobación.
select
  (select count(*) from public.negocios) as negocios,
  (select count(*) from public.solicitudes_negocio) as solicitudes,
  (select count(*) from public.ofertas_negocios) as ofertas;
