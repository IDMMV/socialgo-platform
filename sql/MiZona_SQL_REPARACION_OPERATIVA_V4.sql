-- ============================================================
-- MiZona.pe — REPARACIÓN OPERATIVA V4
-- Corrige seguimiento y agrega alta/verificación de conductores.
-- Ejecutar una sola vez en Supabase SQL Editor.
-- Es seguro volver a ejecutarlo.
-- ============================================================

begin;

-- 1) CORRECCIÓN: "column reference estado is ambiguous"
create or replace function public.mizona_toggle_seguimiento(p_seguido_id uuid)
returns table(estado text,mensaje text)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_privacidad text;
  v_permitir boolean;
  v_request uuid;
begin
  if v_uid is null then raise exception 'Debes iniciar sesión'; end if;
  if p_seguido_id=v_uid then raise exception 'No puedes seguirte a ti mismo'; end if;

  select p.privacidad_perfil,p.permitir_seguidores
    into v_privacidad,v_permitir
  from public.perfiles p
  where p.id=p_seguido_id and p.estado='activo';

  if not found then raise exception 'Perfil no disponible'; end if;
  if not v_permitir then raise exception 'Este perfil no acepta seguidores'; end if;

  if exists(
    select 1 from public.seguidores sg
    where sg.seguidor_id=v_uid and sg.seguido_id=p_seguido_id
  ) then
    delete from public.seguidores sg
    where sg.seguidor_id=v_uid and sg.seguido_id=p_seguido_id;
    return query select 'dejado'::text,'Dejaste de seguir este perfil.'::text;
    return;
  end if;

  select ss.id into v_request
  from public.solicitudes_seguimiento ss
  where ss.solicitante_id=v_uid
    and ss.destinatario_id=p_seguido_id
    and ss.estado='pendiente'
  limit 1;

  if v_request is not null then
    update public.solicitudes_seguimiento ss
    set estado='cancelada',respondido_en=now()
    where ss.id=v_request;
    return query select 'cancelado'::text,'Solicitud de seguimiento cancelada.'::text;
    return;
  end if;

  if v_privacidad='privado' then
    insert into public.solicitudes_seguimiento(solicitante_id,destinatario_id)
    values(v_uid,p_seguido_id);
    insert into public.notificaciones(usuario_id,actor_id,tipo)
    values(p_seguido_id,v_uid,'seguimiento');
    return query select 'pendiente'::text,'Solicitud enviada. El usuario deberá aprobarla.'::text;
    return;
  end if;

  insert into public.seguidores(seguidor_id,seguido_id)
  values(v_uid,p_seguido_id)
  on conflict do nothing;
  insert into public.notificaciones(usuario_id,actor_id,tipo)
  values(p_seguido_id,v_uid,'seguimiento');
  return query select 'siguiendo'::text,'Ahora sigues este perfil.'::text;
end $$;

grant execute on function public.mizona_toggle_seguimiento(uuid) to authenticated;

-- 2) SOLICITUD Y DOCUMENTOS DEL CONDUCTOR
create table if not exists public.solicitudes_conductor(
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null unique references auth.users(id) on delete cascade,
  nombres text not null,
  celular text not null,
  dni text not null,
  licencia_numero text not null,
  licencia_categoria text not null,
  licencia_vencimiento date,
  vehiculo_marca text not null,
  vehiculo_modelo text not null,
  vehiculo_anio integer,
  vehiculo_color text,
  placa text not null,
  soat_vencimiento date,
  revision_vencimiento date,
  estado text not null default 'pendiente' check(estado in('borrador','pendiente','observado','aprobado','rechazado','suspendido')),
  observacion_admin text,
  revisado_por uuid references auth.users(id),
  revisado_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.documentos_conductor(
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.solicitudes_conductor(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check(tipo in('dni_frente','dni_reverso','licencia','soat','tarjeta_propiedad','revision_tecnica','foto_vehiculo','otro')),
  storage_path text not null,
  estado text not null default 'pendiente' check(estado in('pendiente','aprobado','rechazado')),
  observacion text,
  creado_en timestamptz not null default now(),
  unique(solicitud_id,tipo,storage_path)
);

create table if not exists public.conductores(
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  solicitud_id uuid not null references public.solicitudes_conductor(id) on delete cascade,
  estado text not null default 'aprobado' check(estado in('aprobado','suspendido')),
  en_linea boolean not null default false,
  latitud double precision,
  longitud double precision,
  precision_metros integer,
  ubicacion_actualizada_en timestamptz,
  vehiculo_marca text,
  vehiculo_modelo text,
  vehiculo_color text,
  placa_publica text,
  actualizado_en timestamptz not null default now()
);

create index if not exists conductores_linea_idx on public.conductores(en_linea,estado,ubicacion_actualizada_en desc);
create index if not exists documentos_conductor_usuario_idx on public.documentos_conductor(usuario_id,creado_en desc);

alter table public.solicitudes_conductor enable row level security;
alter table public.documentos_conductor enable row level security;
alter table public.conductores enable row level security;

drop policy if exists "Conductor ve su solicitud" on public.solicitudes_conductor;
create policy "Conductor ve su solicitud" on public.solicitudes_conductor
for select to authenticated using(usuario_id=auth.uid() or public.is_admin());

drop policy if exists "Admin gestiona solicitudes conductor" on public.solicitudes_conductor;
create policy "Admin gestiona solicitudes conductor" on public.solicitudes_conductor
for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists "Usuario ve documentos conductor" on public.documentos_conductor;
create policy "Usuario ve documentos conductor" on public.documentos_conductor
for select to authenticated using(usuario_id=auth.uid() or public.is_admin());

drop policy if exists "Usuario agrega documentos conductor" on public.documentos_conductor;
create policy "Usuario agrega documentos conductor" on public.documentos_conductor
for insert to authenticated with check(usuario_id=auth.uid());

drop policy if exists "Usuario elimina documentos pendientes" on public.documentos_conductor;
create policy "Usuario elimina documentos pendientes" on public.documentos_conductor
for delete to authenticated using(usuario_id=auth.uid() and estado='pendiente');

drop policy if exists "Conductores disponibles visibles" on public.conductores;
create policy "Conductores disponibles visibles" on public.conductores
for select to anon,authenticated using(
  usuario_id=auth.uid()
  or public.is_admin()
  or (estado='aprobado' and en_linea=true and ubicacion_actualizada_en>now()-interval '3 minutes')
);

drop policy if exists "Admin gestiona conductores" on public.conductores;
create policy "Admin gestiona conductores" on public.conductores
for all to authenticated using(public.is_admin()) with check(public.is_admin());

-- 3) RPC: enviar/actualizar solicitud
create or replace function public.mizona_enviar_solicitud_conductor(
  p_nombres text,p_celular text,p_dni text,p_licencia_numero text,p_licencia_categoria text,
  p_licencia_vencimiento date,p_vehiculo_marca text,p_vehiculo_modelo text,p_vehiculo_anio integer,
  p_vehiculo_color text,p_placa text,p_soat_vencimiento date,p_revision_vencimiento date
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare v_id uuid; v_phone_ok boolean;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  select coalesce(p.telefono_verificado,false) into v_phone_ok from public.perfiles p where p.id=auth.uid();
  if not coalesce(v_phone_ok,false) then raise exception 'Primero verifica tu celular'; end if;
  if length(trim(coalesce(p_nombres,'')))<5 then raise exception 'Completa tus nombres'; end if;
  if length(regexp_replace(coalesce(p_dni,''),'\D','','g'))<>8 then raise exception 'El DNI debe tener 8 dígitos'; end if;
  if length(trim(coalesce(p_placa,'')))<5 then raise exception 'Escribe una placa válida'; end if;

  insert into public.solicitudes_conductor(
    usuario_id,nombres,celular,dni,licencia_numero,licencia_categoria,licencia_vencimiento,
    vehiculo_marca,vehiculo_modelo,vehiculo_anio,vehiculo_color,placa,soat_vencimiento,revision_vencimiento,
    estado,observacion_admin,actualizado_en
  ) values(
    auth.uid(),trim(p_nombres),trim(p_celular),regexp_replace(p_dni,'\D','','g'),upper(trim(p_licencia_numero)),upper(trim(p_licencia_categoria)),p_licencia_vencimiento,
    trim(p_vehiculo_marca),trim(p_vehiculo_modelo),p_vehiculo_anio,trim(coalesce(p_vehiculo_color,'')),upper(trim(p_placa)),p_soat_vencimiento,p_revision_vencimiento,
    'pendiente',null,now()
  )
  on conflict(usuario_id) do update set
    nombres=excluded.nombres,celular=excluded.celular,dni=excluded.dni,
    licencia_numero=excluded.licencia_numero,licencia_categoria=excluded.licencia_categoria,licencia_vencimiento=excluded.licencia_vencimiento,
    vehiculo_marca=excluded.vehiculo_marca,vehiculo_modelo=excluded.vehiculo_modelo,vehiculo_anio=excluded.vehiculo_anio,
    vehiculo_color=excluded.vehiculo_color,placa=excluded.placa,soat_vencimiento=excluded.soat_vencimiento,
    revision_vencimiento=excluded.revision_vencimiento,estado='pendiente',observacion_admin=null,revisado_por=null,revisado_en=null,actualizado_en=now()
  returning id into v_id;
  return v_id;
end $$;

grant execute on function public.mizona_enviar_solicitud_conductor(text,text,text,text,text,date,text,text,integer,text,text,date,date) to authenticated;

-- 4) RPC: revisión administrativa
create or replace function public.mizona_revisar_conductor(p_solicitud_id uuid,p_estado text,p_observacion text default null)
returns void language plpgsql security definer set search_path=public
as $$
declare v_row public.solicitudes_conductor%rowtype;
begin
  if not public.is_admin() then raise exception 'Acceso denegado'; end if;
  if p_estado not in('observado','aprobado','rechazado','suspendido') then raise exception 'Estado inválido'; end if;
  update public.solicitudes_conductor sc
  set estado=p_estado,observacion_admin=nullif(trim(coalesce(p_observacion,'')),''),revisado_por=auth.uid(),revisado_en=now(),actualizado_en=now()
  where sc.id=p_solicitud_id returning * into v_row;
  if v_row.id is null then raise exception 'Solicitud no encontrada'; end if;

  if p_estado='aprobado' then
    insert into public.conductores(usuario_id,solicitud_id,estado,en_linea,vehiculo_marca,vehiculo_modelo,vehiculo_color,placa_publica,actualizado_en)
    values(v_row.usuario_id,v_row.id,'aprobado',false,v_row.vehiculo_marca,v_row.vehiculo_modelo,v_row.vehiculo_color,
      case when length(v_row.placa)>=3 then left(v_row.placa,1)||'***'||right(v_row.placa,2) else '***' end,now())
    on conflict(usuario_id) do update set solicitud_id=excluded.solicitud_id,estado='aprobado',en_linea=false,
      vehiculo_marca=excluded.vehiculo_marca,vehiculo_modelo=excluded.vehiculo_modelo,vehiculo_color=excluded.vehiculo_color,
      placa_publica=excluded.placa_publica,actualizado_en=now();
  elsif p_estado='suspendido' then
    update public.conductores c set estado='suspendido',en_linea=false,actualizado_en=now() where c.usuario_id=v_row.usuario_id;
  else
    update public.conductores c set en_linea=false,actualizado_en=now() where c.usuario_id=v_row.usuario_id;
  end if;
end $$;

grant execute on function public.mizona_revisar_conductor(uuid,text,text) to authenticated;

-- 5) RPC: conexión y ubicación del conductor aprobado
create or replace function public.mizona_actualizar_conductor_online(p_en_linea boolean,p_latitud double precision default null,p_longitud double precision default null,p_precision integer default null)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  if not exists(select 1 from public.conductores c where c.usuario_id=auth.uid() and c.estado='aprobado') then
    raise exception 'Tu cuenta de conductor todavía no está aprobada';
  end if;
  if p_en_linea and (p_latitud is null or p_longitud is null) then raise exception 'Activa la ubicación para ponerte en línea'; end if;
  update public.conductores c set
    en_linea=p_en_linea,
    latitud=case when p_en_linea then p_latitud else c.latitud end,
    longitud=case when p_en_linea then p_longitud else c.longitud end,
    precision_metros=case when p_en_linea then p_precision else c.precision_metros end,
    ubicacion_actualizada_en=case when p_en_linea then now() else c.ubicacion_actualizada_en end,
    actualizado_en=now()
  where c.usuario_id=auth.uid();
end $$;

grant execute on function public.mizona_actualizar_conductor_online(boolean,double precision,double precision,integer) to authenticated;

-- 6) Vista pública mínima de vehículos activos
create or replace view public.conductores_disponibles
with (security_invoker=true)
as
select c.usuario_id,c.latitud,c.longitud,c.precision_metros,c.ubicacion_actualizada_en,
       c.vehiculo_marca,c.vehiculo_modelo,c.vehiculo_color,c.placa_publica,
       p.nombre_visible,p.username,p.avatar_url
from public.conductores c
join public.perfiles p on p.id=c.usuario_id
where c.estado='aprobado' and c.en_linea=true and c.ubicacion_actualizada_en>now()-interval '3 minutes';

grant select on public.conductores_disponibles to anon,authenticated;

-- 7) Storage privado de documentos
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('conductores-documentos','conductores-documentos',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Conductor sube sus documentos" on storage.objects;
create policy "Conductor sube sus documentos" on storage.objects
for insert to authenticated with check(
  bucket_id='conductores-documentos' and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists "Conductor ve sus documentos" on storage.objects;
create policy "Conductor ve sus documentos" on storage.objects
for select to authenticated using(
  bucket_id='conductores-documentos' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin())
);

drop policy if exists "Conductor reemplaza sus documentos" on storage.objects;
create policy "Conductor reemplaza sus documentos" on storage.objects
for update to authenticated using(
  bucket_id='conductores-documentos' and (storage.foldername(name))[1]=auth.uid()::text
) with check(
  bucket_id='conductores-documentos' and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists "Conductor elimina documentos pendientes" on storage.objects;
create policy "Conductor elimina documentos pendientes" on storage.objects
for delete to authenticated using(
  bucket_id='conductores-documentos' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin())
);

-- Habilitar cambios en tiempo real sin fallar si ya está agregado.
do $$ begin
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='conductores'
  ) then
    alter publication supabase_realtime add table public.conductores;
  end if;
exception when undefined_object then null; end $$;

commit;

select 'OK: seguimiento corregido y módulo de conductores instalado' as resultado;
