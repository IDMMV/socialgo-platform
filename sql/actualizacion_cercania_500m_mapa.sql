-- ============================================================
-- MiZona.pe — Cercanía automática 500 m, mapa participativo
-- Ejecutar DESPUÉS de actualizacion_integral_seguridad_chat_push.sql
-- Fecha: 2026-06-25
-- ============================================================

create extension if not exists pgcrypto;

-- 1) Última ubicación privada y radio preferido del usuario
alter table public.perfiles
  add column if not exists latitud_ultima numeric(10,7),
  add column if not exists longitud_ultima numeric(10,7),
  add column if not exists ubicacion_precision_metros integer,
  add column if not exists ubicacion_actualizada_en timestamptz,
  add column if not exists radio_preferido_metros integer not null default 500;

alter table public.perfiles drop constraint if exists perfiles_radio_preferido_check;
alter table public.perfiles add constraint perfiles_radio_preferido_check
  check (radio_preferido_metros in (500,1000,2000,5000,0)) not valid;

-- Coordenadas aproximadas para contenido local.
alter table public.servicios_mizona
  add column if not exists latitud numeric(10,7),
  add column if not exists longitud numeric(10,7),
  add column if not exists precision_ubicacion text default 'aprox_150m';

alter table public.solicitudes_mizona
  add column if not exists latitud numeric(10,7),
  add column if not exists longitud numeric(10,7),
  add column if not exists precision_ubicacion text default 'aprox_150m';

alter table public.ofertas_negocios
  add column if not exists latitud numeric(10,7),
  add column if not exists longitud numeric(10,7);

alter table public.solicitudes_negocio
  add column if not exists latitud numeric(10,7),
  add column if not exists longitud numeric(10,7);

create index if not exists servicios_mizona_geo_idx on public.servicios_mizona(latitud,longitud);
create index if not exists solicitudes_mizona_geo_idx on public.solicitudes_mizona(latitud,longitud);
create index if not exists ofertas_negocios_geo_idx on public.ofertas_negocios(latitud,longitud);
create index if not exists perfiles_ubicacion_actualizada_idx on public.perfiles(ubicacion_actualizada_en desc);


-- El radio inicial de notificaciones también pasa a 500 m.
do $$
begin
  if to_regclass('public.notification_preferences') is not null then
    execute 'alter table public.notification_preferences alter column radio_metros set default 500';
    execute 'update public.notification_preferences set radio_metros=500,updated_at=now() where radio_metros=1500';
  end if;
end $$;

-- 2) Distancia Haversine en metros
create or replace function public.mizona_distance_meters(
  lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric
)
returns numeric
language sql
immutable
parallel safe
as $$
  select case
    when lat1 is null or lon1 is null or lat2 is null or lon2 is null then null
    else 6371000 * 2 * asin(sqrt(
      power(sin(radians((lat2-lat1)/2)),2) +
      cos(radians(lat1))*cos(radians(lat2))*power(sin(radians((lon2-lon1)/2)),2)
    ))
  end;
$$;

-- Guarda la ubicación únicamente en el perfil del usuario autenticado.
create or replace function public.mizona_actualizar_ubicacion(
  p_latitud numeric,
  p_longitud numeric,
  p_precision_metros integer default null,
  p_radio_metros integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_radio integer := case when p_radio_metros in (500,1000,2000,5000,0) then p_radio_metros else 500 end;
begin
  if v_user is null then raise exception 'Debes iniciar sesión'; end if;
  if p_latitud not between -90 and 90 or p_longitud not between -180 and 180 then
    raise exception 'Coordenadas inválidas';
  end if;
  update public.perfiles
  set latitud_ultima=round(p_latitud,7),
      longitud_ultima=round(p_longitud,7),
      ubicacion_precision_metros=greatest(0,coalesce(p_precision_metros,0)),
      ubicacion_actualizada_en=now(),
      radio_preferido_metros=v_radio
  where id=v_user;
  return jsonb_build_object('ok',true,'radio_metros',v_radio,'actualizada_en',now());
end $$;

grant execute on function public.mizona_actualizar_ubicacion(numeric,numeric,integer,integer) to authenticated;

-- 3) Consulta única de alertas dentro de un radio
create or replace function public.mizona_alertas_cercanas(
  p_latitud numeric,
  p_longitud numeric,
  p_radio_metros integer default 500,
  p_limite integer default 100
)
returns table(
  id uuid,
  autor_id uuid,
  categoria text,
  titulo text,
  descripcion text,
  distrito text,
  zona_referencia text,
  estado text,
  tipo_fuente text,
  latitud numeric,
  longitud numeric,
  precision_ubicacion text,
  total_confirmaciones integer,
  total_seguidores integer,
  created_at timestamptz,
  distancia_metros numeric
)
language sql
stable
security definer
set search_path=public
as $$
  select a.id,a.autor_id,a.categoria,a.titulo,a.descripcion,a.distrito,a.zona_referencia,
         a.estado,a.tipo_fuente,a.latitud,a.longitud,a.precision_ubicacion,
         a.total_confirmaciones,a.total_seguidores,a.created_at,
         public.mizona_distance_meters(p_latitud,p_longitud,a.latitud,a.longitud) distancia_metros
  from public.alertas a
  where a.latitud is not null and a.longitud is not null
    and a.estado in ('reportada','en_revision','verificada','en_disputa','resuelta')
    and (coalesce(p_radio_metros,500)=0 or public.mizona_distance_meters(p_latitud,p_longitud,a.latitud,a.longitud)<=coalesce(p_radio_metros,500))
  order by distancia_metros asc,a.created_at desc
  limit least(greatest(coalesce(p_limite,100),1),250);
$$;

grant execute on function public.mizona_alertas_cercanas(numeric,numeric,integer,integer) to anon,authenticated;

-- 4) Aportes y fotografías de vecinos sobre una alerta
create table if not exists public.alerta_aportes (
  id uuid primary key default gen_random_uuid(),
  alerta_id uuid not null references public.alertas(id) on delete cascade,
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  tipo text not null default 'foto' check (tipo in ('foto','comentario','actualizacion_estado')),
  texto text check (texto is null or char_length(texto)<=500),
  archivo_url text,
  latitud numeric(10,7),
  longitud numeric(10,7),
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobado','rechazado','retirado')),
  motivo_revision text,
  revisado_por uuid references public.perfiles(id),
  revisado_en timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists alerta_aportes_alerta_idx on public.alerta_aportes(alerta_id,created_at desc);
create index if not exists alerta_aportes_estado_idx on public.alerta_aportes(estado,created_at desc);

alter table public.alerta_aportes enable row level security;

drop policy if exists "Ver aportes aprobados o propios" on public.alerta_aportes;
create policy "Ver aportes aprobados o propios" on public.alerta_aportes
for select using (
  estado='aprobado' or usuario_id=auth.uid() or public.is_admin()
);

drop policy if exists "Usuarios verificados aportan evidencia" on public.alerta_aportes;
create policy "Usuarios verificados aportan evidencia" on public.alerta_aportes
for insert to authenticated with check (
  usuario_id=auth.uid()
  and exists(select 1 from public.perfiles p where p.id=auth.uid() and coalesce(p.telefono_verificado,false)=true)
);

drop policy if exists "Autor corrige aporte pendiente" on public.alerta_aportes;
create policy "Autor corrige aporte pendiente" on public.alerta_aportes
for update to authenticated using (usuario_id=auth.uid() and estado='pendiente')
with check (usuario_id=auth.uid() and estado='pendiente');

drop policy if exists "Administrador modera aportes" on public.alerta_aportes;
create policy "Administrador modera aportes" on public.alerta_aportes
for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Bucket privado: se generan enlaces temporales únicamente para aportes aprobados, el autor o administradores.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('alertas-evidencias','alertas-evidencias',false,12582912,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Subir evidencia propia" on storage.objects;
create policy "Subir evidencia propia" on storage.objects
for insert to authenticated with check (
  bucket_id='alertas-evidencias' and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists "Leer evidencias de alertas" on storage.objects;
create policy "Leer evidencias de alertas" on storage.objects
for select using (
  bucket_id='alertas-evidencias' and (
    (storage.foldername(name))[1]=auth.uid()::text
    or public.is_admin()
    or exists(
      select 1 from public.alerta_aportes aporte
      where aporte.archivo_url=storage.objects.name and aporte.estado='aprobado'
    )
  )
);

drop policy if exists "Borrar evidencia propia pendiente" on storage.objects;
create policy "Borrar evidencia propia pendiente" on storage.objects
for delete to authenticated using (
  bucket_id='alertas-evidencias' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin())
);

-- Notifica al autor de la alerta cuando llega un aporte.
create or replace function public.mizona_notificar_aporte_alerta()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare v_autor uuid; v_titulo text;
begin
  select autor_id,titulo into v_autor,v_titulo from public.alertas where id=new.alerta_id;
  if v_autor is not null and v_autor<>new.usuario_id and to_regclass('public.notification_events') is not null then
    insert into public.notification_events(
      event_type,actor_id,recipient_id,resource_type,resource_id,prioridad,titulo,cuerpo,url,payload,dedupe_key
    ) values(
      'aporte_alerta',new.usuario_id,v_autor,'alerta',new.alerta_id::text,'normal',
      'Un vecino aportó información','Se agregó una fotografía o actualización a: '||coalesce(v_titulo,'tu alerta'),
      'alerta.html?id='||new.alerta_id::text,jsonb_build_object('aporte_id',new.id),
      'aporte:'||new.id::text
    );
  end if;
  return new;
end $$;

drop trigger if exists alerta_aporte_notificacion on public.alerta_aportes;
create trigger alerta_aporte_notificacion after insert on public.alerta_aportes
for each row execute function public.mizona_notificar_aporte_alerta();

-- 5) Empleos locales (la página deja de ser solo una demostración)
create table if not exists public.empleos_mizona (
  id uuid primary key default gen_random_uuid(),
  publicador_id uuid not null references public.perfiles(id) on delete cascade,
  negocio_id uuid references public.negocios(id) on delete set null,
  titulo text not null,
  empresa text not null,
  descripcion text,
  modalidad text default 'presencial' check (modalidad in ('presencial','hibrido','remoto')),
  tipo_jornada text default 'tiempo_completo',
  salario_desde numeric(12,2),
  salario_hasta numeric(12,2),
  distrito text,
  direccion_referencia text,
  latitud numeric(10,7),
  longitud numeric(10,7),
  estado text not null default 'pendiente' check (estado in ('pendiente','publicado','pausado','cerrado','rechazado')),
  vence_en timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists empleos_mizona_geo_idx on public.empleos_mizona(latitud,longitud);
create index if not exists empleos_mizona_estado_idx on public.empleos_mizona(estado,created_at desc);
alter table public.empleos_mizona enable row level security;

drop policy if exists "Empleos publicados visibles" on public.empleos_mizona;
create policy "Empleos publicados visibles" on public.empleos_mizona for select using (estado='publicado' or publicador_id=auth.uid() or public.is_admin());
drop policy if exists "Proveedor publica empleo" on public.empleos_mizona;
create policy "Proveedor publica empleo" on public.empleos_mizona for insert to authenticated with check (
  publicador_id=auth.uid() and exists(select 1 from public.perfiles p where p.id=auth.uid() and p.proveedor_estado='aprobado')
);
drop policy if exists "Autor administra empleo" on public.empleos_mizona;
create policy "Autor administra empleo" on public.empleos_mizona for update to authenticated using (publicador_id=auth.uid() or public.is_admin()) with check (publicador_id=auth.uid() or public.is_admin());

select 'OK: cercanía 500 m, ubicación privada, aportes fotográficos y empleos locales instalados' as resultado;
