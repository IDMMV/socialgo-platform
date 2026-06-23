
-- ============================================================
-- MiZona.pe Fase 1B
-- Alertas, confirmaciones, servicios y solicitudes
-- Ejecutar en Supabase SQL Editor
-- ============================================================

create extension if not exists pgcrypto;

alter table public.perfiles
  add column if not exists distrito text,
  add column if not exists zona text,
  add column if not exists telefono_verificado boolean default false,
  add column if not exists reputacion_alertas integer default 0;

create table if not exists public.alertas (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null references public.perfiles(id) on delete cascade,
  tipo_fuente text not null default 'ciudadana'
    check (tipo_fuente in ('ciudadana','oficial')),
  categoria text not null
    check (categoria in ('robo','accidente','agua','luz','persona','mascota','incendio','otro')),
  titulo text not null check (char_length(titulo) between 5 and 120),
  descripcion text not null check (char_length(descripcion) between 10 and 1200),
  distrito text not null,
  zona_referencia text,
  latitud numeric(10,7),
  longitud numeric(10,7),
  estado text not null default 'reportada'
    check (estado in ('reportada','en_revision','verificada','en_disputa','resuelta','falsa','ocultada','vencida')),
  total_confirmaciones integer not null default 0,
  fuente_oficial text,
  revisada_por uuid references public.perfiles(id),
  revisada_en timestamptz,
  fecha_vencimiento timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists alertas_created_idx on public.alertas(created_at desc);
create index if not exists alertas_distrito_idx on public.alertas(distrito);
create index if not exists alertas_categoria_idx on public.alertas(categoria);
create index if not exists alertas_estado_idx on public.alertas(estado);
create index if not exists alertas_geo_idx on public.alertas(latitud,longitud);

create table if not exists public.alerta_confirmaciones (
  id uuid primary key default gen_random_uuid(),
  alerta_id uuid not null references public.alertas(id) on delete cascade,
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  latitud numeric(10,7),
  longitud numeric(10,7),
  peso numeric(4,2) not null default 1,
  created_at timestamptz not null default now(),
  unique(alerta_id,usuario_id)
);

create index if not exists alerta_confirmaciones_alerta_idx
  on public.alerta_confirmaciones(alerta_id);

create table if not exists public.servicios_mizona (
  id uuid primary key default gen_random_uuid(),
  propietario_id uuid not null references public.perfiles(id) on delete cascade,
  nombre text not null,
  categoria text not null,
  descripcion text,
  distrito text not null,
  zona_atencion text,
  tarifa_desde numeric(10,2),
  tarifa_hasta numeric(10,2),
  whatsapp text,
  disponible boolean default true,
  verificado boolean default false,
  calificacion numeric(3,2) default 0,
  total_resenas integer default 0,
  estado text default 'activo' check (estado in ('activo','pausado','suspendido')),
  created_at timestamptz default now()
);

create table if not exists public.solicitudes_mizona (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  categoria text not null,
  titulo text not null,
  descripcion text not null,
  distrito text not null,
  presupuesto_desde numeric(10,2),
  presupuesto_hasta numeric(10,2),
  urgencia text default 'normal' check (urgencia in ('normal','hoy','urgente')),
  estado text default 'abierta' check (estado in ('abierta','en_conversacion','resuelta','cancelada')),
  fecha_necesaria date,
  created_at timestamptz default now()
);

create or replace function public.actualizar_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists alertas_updated_at on public.alertas;
create trigger alertas_updated_at
before update on public.alertas
for each row execute function public.actualizar_updated_at();

create or replace function public.confirmar_alerta(
  p_alerta_id uuid,
  p_latitud numeric default null,
  p_longitud numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_alerta public.alertas;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión';
  end if;

  select * into v_alerta from public.alertas where id = p_alerta_id for update;
  if not found then
    raise exception 'La alerta no existe';
  end if;

  if v_alerta.autor_id = v_user then
    raise exception 'No puedes confirmar tu propia alerta';
  end if;

  insert into public.alerta_confirmaciones(alerta_id,usuario_id,latitud,longitud)
  values(p_alerta_id,v_user,p_latitud,p_longitud);

  update public.alertas
  set total_confirmaciones = total_confirmaciones + 1
  where id = p_alerta_id;

  return jsonb_build_object(
    'ok',true,
    'mensaje','Confirmación registrada',
    'total',v_alerta.total_confirmaciones + 1
  );
exception
  when unique_violation then
    raise exception 'Ya confirmaste esta alerta';
end $$;

grant execute on function public.confirmar_alerta(uuid,numeric,numeric) to authenticated;

alter table public.alertas enable row level security;
alter table public.alerta_confirmaciones enable row level security;
alter table public.servicios_mizona enable row level security;
alter table public.solicitudes_mizona enable row level security;

drop policy if exists "alertas visibles" on public.alertas;
create policy "alertas visibles" on public.alertas
for select to anon,authenticated
using (estado not in ('ocultada','falsa'));

drop policy if exists "usuarios crean alertas" on public.alertas;
create policy "usuarios crean alertas" on public.alertas
for insert to authenticated
with check (autor_id = auth.uid() and tipo_fuente = 'ciudadana');

drop policy if exists "autor actualiza alerta" on public.alertas;
create policy "autor actualiza alerta" on public.alertas
for update to authenticated
using (autor_id = auth.uid())
with check (autor_id = auth.uid());

drop policy if exists "confirmaciones propias visibles" on public.alerta_confirmaciones;
create policy "confirmaciones propias visibles" on public.alerta_confirmaciones
for select to authenticated
using (usuario_id = auth.uid());

drop policy if exists "servicios visibles" on public.servicios_mizona;
create policy "servicios visibles" on public.servicios_mizona
for select to anon,authenticated
using (estado = 'activo');

drop policy if exists "crear servicio propio" on public.servicios_mizona;
create policy "crear servicio propio" on public.servicios_mizona
for insert to authenticated
with check (propietario_id = auth.uid());

drop policy if exists "editar servicio propio" on public.servicios_mizona;
create policy "editar servicio propio" on public.servicios_mizona
for update to authenticated
using (propietario_id = auth.uid())
with check (propietario_id = auth.uid());

drop policy if exists "solicitudes visibles" on public.solicitudes_mizona;
create policy "solicitudes visibles" on public.solicitudes_mizona
for select to authenticated
using (true);

drop policy if exists "crear solicitud propia" on public.solicitudes_mizona;
create policy "crear solicitud propia" on public.solicitudes_mizona
for insert to authenticated
with check (usuario_id = auth.uid());

drop policy if exists "editar solicitud propia" on public.solicitudes_mizona;
create policy "editar solicitud propia" on public.solicitudes_mizona
for update to authenticated
using (usuario_id = auth.uid())
with check (usuario_id = auth.uid());

alter publication supabase_realtime add table public.alertas;
