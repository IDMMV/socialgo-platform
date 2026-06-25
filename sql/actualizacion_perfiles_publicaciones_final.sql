-- ============================================================
-- MiZona.pe — PERFILES PÚBLICOS, SEGUIMIENTO PRIVADO Y PUBLICACIONES
-- Ejecutar después de MiZona_SQL_Actualizacion_Total_500m.sql
-- ============================================================

begin;

grant execute on function public.is_admin() to anon,authenticated;

-- 1. Tipos y privacidad de perfil
alter table public.perfiles
  add column if not exists tipo_perfil text not null default 'vecino',
  add column if not exists privacidad_perfil text not null default 'publico',
  add column if not exists permitir_seguidores boolean not null default true,
  add column if not exists mostrar_distrito_publico boolean not null default true;

do $$ begin
  alter table public.perfiles add constraint perfiles_tipo_perfil_check
    check (tipo_perfil in ('vecino','profesional','negocio','institucion','organizacion'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.perfiles add constraint perfiles_privacidad_perfil_check
    check (privacidad_perfil in ('publico','privado'));
exception when duplicate_object then null; end $$;

-- Migrar aprobaciones existentes sin permitir que una cuenta se autoverifique.
update public.perfiles
set tipo_perfil = case
  when proveedor_estado='aprobado' and proveedor_tipo='independiente' then 'profesional'
  when proveedor_estado='aprobado' and proveedor_tipo='negocio' then 'negocio'
  when proveedor_estado='aprobado' and proveedor_tipo='organizacion' then 'organizacion'
  else coalesce(tipo_perfil,'vecino')
end;


-- Impide que una cuenta se apruebe a sí misma cambiando columnas desde el navegador.
create or replace function public.mizona_proteger_tipo_y_aprobacion()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare v_admin boolean:=coalesce(public.is_admin(),false);
begin
  if tg_op='UPDATE' and auth.uid()=old.id and not v_admin then
    new.proveedor_estado:=old.proveedor_estado;
    new.proveedor_tipo:=old.proveedor_tipo;
    if new.tipo_perfil='profesional' and not (old.proveedor_estado='aprobado' and old.proveedor_tipo='independiente') then
      raise exception 'El perfil profesional requiere aprobación del administrador';
    elsif new.tipo_perfil='negocio' and not (old.proveedor_estado='aprobado' and old.proveedor_tipo='negocio') then
      raise exception 'El perfil de negocio requiere aprobación del administrador';
    elsif new.tipo_perfil='organizacion' and not (old.proveedor_estado='aprobado' and old.proveedor_tipo='organizacion') then
      raise exception 'La organización requiere aprobación del administrador';
    elsif new.tipo_perfil='institucion' then
      raise exception 'El perfil institucional solo puede ser habilitado por el administrador';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists perfiles_proteger_tipo_aprobacion on public.perfiles;
create trigger perfiles_proteger_tipo_aprobacion
before update on public.perfiles
for each row execute function public.mizona_proteger_tipo_y_aprobacion();

-- 2. Metadatos de publicaciones normales
alter table public.publicaciones
  add column if not exists titulo text,
  add column if not exists categoria_publicacion text not null default 'general',
  add column if not exists ubicacion_texto text,
  add column if not exists fecha_evento timestamptz,
  add column if not exists perfil_autor_visible boolean not null default true;

do $$ begin
  alter table public.publicaciones add constraint publicaciones_categoria_mizona_check
    check (categoria_publicacion in (
      'general','consejo','recomendacion','evento','foto','trabajo','producto',
      'comunicado','campana','actividad','reunion','alerta_oficial','empleo'
    ));
exception when duplicate_object then null; end $$;

create index if not exists publicaciones_autor_categoria_idx
  on public.publicaciones(autor_id,categoria_publicacion,creado_en desc);

-- 3. Solicitudes de seguimiento para perfiles privados
create table if not exists public.solicitudes_seguimiento(
  id uuid primary key default gen_random_uuid(),
  solicitante_id uuid not null references auth.users(id) on delete cascade,
  destinatario_id uuid not null references auth.users(id) on delete cascade,
  estado text not null default 'pendiente' check(estado in('pendiente','aceptada','rechazada','cancelada')),
  creado_en timestamptz not null default now(),
  respondido_en timestamptz,
  check(solicitante_id<>destinatario_id)
);
create unique index if not exists solicitudes_seguimiento_una_activa
  on public.solicitudes_seguimiento(solicitante_id,destinatario_id)
  where estado='pendiente';
alter table public.solicitudes_seguimiento enable row level security;

drop policy if exists "Seguimientos relacionados visibles" on public.solicitudes_seguimiento;
create policy "Seguimientos relacionados visibles" on public.solicitudes_seguimiento
for select to authenticated
using(solicitante_id=auth.uid() or destinatario_id=auth.uid() or public.is_admin());

drop policy if exists "Destinatario responde seguimiento" on public.solicitudes_seguimiento;
create policy "Destinatario responde seguimiento" on public.solicitudes_seguimiento
for update to authenticated
using(destinatario_id=auth.uid() or solicitante_id=auth.uid() or public.is_admin())
with check(destinatario_id=auth.uid() or solicitante_id=auth.uid() or public.is_admin());

-- La escritura se hace mediante RPC para respetar privacidad y evitar duplicados.
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

  select privacidad_perfil,permitir_seguidores into v_privacidad,v_permitir
  from public.perfiles where id=p_seguido_id and estado='activo';
  if not found then raise exception 'Perfil no disponible'; end if;
  if not v_permitir then raise exception 'Este perfil no acepta seguidores'; end if;

  if exists(select 1 from public.seguidores where seguidor_id=v_uid and seguido_id=p_seguido_id) then
    delete from public.seguidores where seguidor_id=v_uid and seguido_id=p_seguido_id;
    return query select 'dejado'::text,'Dejaste de seguir este perfil.'::text; return;
  end if;

  select id into v_request from public.solicitudes_seguimiento
  where solicitante_id=v_uid and destinatario_id=p_seguido_id and estado='pendiente' limit 1;
  if v_request is not null then
    update public.solicitudes_seguimiento set estado='cancelada',respondido_en=now() where id=v_request;
    return query select 'cancelado'::text,'Solicitud de seguimiento cancelada.'::text; return;
  end if;

  if v_privacidad='privado' then
    insert into public.solicitudes_seguimiento(solicitante_id,destinatario_id)
    values(v_uid,p_seguido_id);
    insert into public.notificaciones(usuario_id,actor_id,tipo)
    values(p_seguido_id,v_uid,'seguimiento');
    return query select 'pendiente'::text,'Solicitud enviada. El usuario deberá aprobarla.'::text; return;
  end if;

  insert into public.seguidores(seguidor_id,seguido_id) values(v_uid,p_seguido_id)
  on conflict do nothing;
  insert into public.notificaciones(usuario_id,actor_id,tipo)
  values(p_seguido_id,v_uid,'seguimiento');
  return query select 'siguiendo'::text,'Ahora sigues este perfil.'::text;
end $$;
grant execute on function public.mizona_toggle_seguimiento(uuid) to authenticated;

create or replace function public.mizona_responder_seguimiento(p_solicitud_id uuid,p_respuesta text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_solicitante uuid; v_destinatario uuid:=auth.uid();
begin
  if p_respuesta not in('aceptada','rechazada') then raise exception 'Respuesta inválida'; end if;
  update public.solicitudes_seguimiento
  set estado=p_respuesta,respondido_en=now()
  where id=p_solicitud_id and destinatario_id=v_destinatario and estado='pendiente'
  returning solicitante_id into v_solicitante;
  if v_solicitante is null then raise exception 'Solicitud no encontrada'; end if;
  if p_respuesta='aceptada' then
    insert into public.seguidores(seguidor_id,seguido_id)
    values(v_solicitante,v_destinatario) on conflict do nothing;
    insert into public.notificaciones(usuario_id,actor_id,tipo)
    values(v_solicitante,v_destinatario,'seguimiento');
  end if;
end $$;
grant execute on function public.mizona_responder_seguimiento(uuid,text) to authenticated;

create or replace view public.solicitudes_seguimiento_recibidas
with(security_invoker=true) as
select s.id,s.creado_en,p.id usuario_id,p.username,p.nombre_visible,p.avatar_url,p.tipo_perfil
from public.solicitudes_seguimiento s
join public.perfiles p on p.id=s.solicitante_id
where s.destinatario_id=auth.uid() and s.estado='pendiente';
grant select on public.solicitudes_seguimiento_recibidas to authenticated;


-- Sincroniza automáticamente el tipo público cuando el administrador aprueba o suspende un proveedor.
create or replace function public.mizona_revisar_proveedor(p_id uuid,p_estado text,p_observacion text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_user uuid;v_tipo text;v_tipo_perfil text;begin
 if not public.is_admin() then raise exception 'Acceso administrativo requerido'; end if;
 if p_estado not in('observado','aprobado','rechazado','suspendido') then raise exception 'Estado inválido'; end if;
 update public.solicitudes_proveedor set estado=p_estado,observacion_admin=nullif(trim(coalesce(p_observacion,'')),''),revisado_por=auth.uid(),revisado_en=now(),actualizado_en=now() where id=p_id returning usuario_id,tipo into v_user,v_tipo;
 if v_user is null then raise exception 'Solicitud no encontrada'; end if;
 v_tipo_perfil:=case when p_estado<>'aprobado' then 'vecino' when v_tipo='independiente' then 'profesional' when v_tipo='negocio' then 'negocio' when v_tipo='organizacion' then 'organizacion' else 'vecino' end;
 update public.perfiles set proveedor_estado=p_estado,proveedor_tipo=v_tipo,tipo_perfil=v_tipo_perfil,proveedor_actualizado_en=now() where id=v_user;
 insert into public.notificaciones(usuario_id,actor_id,tipo) values(v_user,auth.uid(),'sistema');
 insert into public.notification_events(event_type,actor_id,recipient_id,resource_type,resource_id,prioridad,titulo,cuerpo,url,payload,dedupe_key)
 values('negocio_proveedor_revision',auth.uid(),v_user,'solicitud_proveedor',p_id::text,'normal',
   case p_estado when 'aprobado' then '✅ Solicitud aprobada' when 'observado' then 'Solicitud con observaciones' when 'rechazado' then 'Solicitud rechazada' else 'Estado de proveedor actualizado' end,
   case p_estado when 'aprobado' then 'Tu perfil público ya muestra el tipo aprobado y puedes publicar contenido profesional.' when 'observado' then coalesce(nullif(trim(p_observacion),''),'Revisa y corrige los datos de tu solicitud.') when 'rechazado' then coalesce(nullif(trim(p_observacion),''),'La solicitud no fue aprobada.') else 'Revisa el estado de tu solicitud.' end,
   'proveedor.html',jsonb_build_object('solicitud_id',p_id,'estado',p_estado,'tipo_perfil',v_tipo_perfil),'negocio_proveedor_revision:'||p_id::text||':'||p_estado)
 on conflict(dedupe_key) do nothing;
end $$;
grant execute on function public.mizona_revisar_proveedor(uuid,text,text) to authenticated;

-- 4. Vista pública sin correo, teléfono ni ubicación exacta
create or replace view public.perfiles_publicos
with(security_invoker=true) as
select
  p.id,p.username,p.nombre_visible,p.biografia,p.avatar_url,p.portada_url,p.ultima_actividad,
  p.tipo_perfil,p.privacidad_perfil,p.permitir_seguidores,p.mostrar_distrito_publico,
  case when p.mostrar_distrito_publico then p.distrito else null end as distrito,
  p.creado_en,(coalesce(p.telefono_verificado,false) or p.proveedor_estado='aprobado') as verificado,p.proveedor_estado,p.proveedor_tipo,
  (select count(*) from public.seguidores s where s.seguido_id=p.id) total_seguidores,
  (select count(*) from public.seguidores s where s.seguidor_id=p.id) total_seguidos,
  exists(select 1 from public.seguidores s where s.seguidor_id=auth.uid() and s.seguido_id=p.id) siguiendo,
  exists(select 1 from public.solicitudes_seguimiento ss where ss.solicitante_id=auth.uid() and ss.destinatario_id=p.id and ss.estado='pendiente') seguimiento_pendiente,
  (select sa.estado from public.solicitudes_amistad sa
    where ((sa.solicitante_id=auth.uid() and sa.destinatario_id=p.id) or (sa.solicitante_id=p.id and sa.destinatario_id=auth.uid()))
      and sa.estado in('pendiente','aceptada') order by sa.creado_en desc limit 1) estado_amistad
from public.perfiles p where p.estado='activo';
grant select on public.perfiles_publicos to anon,authenticated;

-- 5. Privacidad real para las publicaciones
-- El autor y el administrador siempre pueden ver su contenido.
drop policy if exists "Publicaciones públicas visibles" on public.publicaciones;
drop policy if exists "Publicaciones visibles según privacidad" on public.publicaciones;
create policy "Publicaciones visibles según privacidad" on public.publicaciones
for select to anon,authenticated
using(
  autor_id=auth.uid() or public.is_admin()
  or (
    estado_moderacion='aprobado'
    and (
      (
        visibilidad='public'
        and exists(select 1 from public.perfiles pf where pf.id=autor_id and pf.privacidad_perfil='publico')
      )
      or (
        visibilidad in('public','followers')
        and exists(select 1 from public.seguidores s where s.seguidor_id=auth.uid() and s.seguido_id=autor_id)
      )
      or (
        visibilidad='friends'
        and exists(select 1 from public.solicitudes_amistad sa
          where sa.estado='aceptada'
          and ((sa.solicitante_id=auth.uid() and sa.destinatario_id=autor_id)
            or (sa.destinatario_id=auth.uid() and sa.solicitante_id=autor_id)))
      )
    )
  )
);

-- 6. Feed con tipo de perfil y metadatos de la publicación
create or replace view public.publicaciones_feed
with(security_invoker=true) as
select
  p.id,p.autor_id,p.titulo,p.contenido,p.tipo,p.archivo_url,p.miniatura_url,p.visibilidad,
  p.permitir_comentarios,p.permitir_descargas,p.categoria_publicacion,p.ubicacion_texto,
  p.fecha_evento,p.perfil_autor_visible,p.creado_en,
  pf.username,pf.nombre_visible,pf.avatar_url,pf.portada_url,pf.tipo_perfil,
  (select count(*) from public.me_gusta_publicaciones mg where mg.publicacion_id=p.id) total_me_gusta,
  (select count(*) from public.comentarios c where c.publicacion_id=p.id) total_comentarios,
  (select count(*) from public.publicaciones_compartidas pc where pc.publicacion_id=p.id) total_compartidos,
  exists(select 1 from public.me_gusta_publicaciones mg where mg.publicacion_id=p.id and mg.usuario_id=auth.uid()) usuario_dio_me_gusta,
  exists(select 1 from public.publicaciones_guardadas pg where pg.publicacion_id=p.id and pg.usuario_id=auth.uid()) usuario_guardo
from public.publicaciones p
join public.perfiles pf on pf.id=p.autor_id
where p.estado_moderacion='aprobado'
  and not exists(select 1 from public.usuarios_bloqueados ub where ub.bloqueador_id=auth.uid() and ub.bloqueado_id=p.autor_id);
grant select on public.publicaciones_feed to anon,authenticated;

commit;
