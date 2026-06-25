-- ============================================================
-- MiZona.pe — ACTUALIZACIÓN INTEGRAL
-- Sesión estable, teléfono verificado, contactos de confianza,
-- proveedores aprobados, alertas clasificadas, chat seguro y push.
-- Ejecutar DESPUÉS de las fases anteriores.
-- ============================================================
begin;
create extension if not exists pgcrypto;

-- ============================================================
-- PRERREQUISITO INTEGRADO: AMISTADES
-- Debe existir antes de crear vistas y políticas que la consultan.
-- ============================================================
alter table public.perfiles
  add column if not exists ultima_actividad timestamptz default now();

alter table public.mensajes
  add column if not exists leido boolean not null default false,
  add column if not exists leido_en timestamptz;

create table if not exists public.solicitudes_amistad(
  id uuid primary key default gen_random_uuid(),
  solicitante_id uuid not null references auth.users(id) on delete cascade,
  destinatario_id uuid not null references auth.users(id) on delete cascade,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','aceptada','rechazada')),
  creado_en timestamptz not null default now(),
  respondido_en timestamptz,
  check (solicitante_id <> destinatario_id)
);

create unique index if not exists solicitudes_amistad_unicas
  on public.solicitudes_amistad(
    least(solicitante_id,destinatario_id),
    greatest(solicitante_id,destinatario_id)
  )
  where estado in ('pendiente','aceptada');

alter table public.solicitudes_amistad enable row level security;

drop policy if exists "Usuarios ven solicitudes relacionadas"
  on public.solicitudes_amistad;
create policy "Usuarios ven solicitudes relacionadas"
  on public.solicitudes_amistad
  for select to authenticated
  using (
    solicitante_id=auth.uid()
    or destinatario_id=auth.uid()
    or public.is_admin()
  );

drop policy if exists "Usuarios eliminan solicitudes relacionadas"
  on public.solicitudes_amistad;
create policy "Usuarios eliminan solicitudes relacionadas"
  on public.solicitudes_amistad
  for delete to authenticated
  using (
    solicitante_id=auth.uid()
    or destinatario_id=auth.uid()
    or public.is_admin()
  );

grant select,delete on public.solicitudes_amistad to authenticated;

create or replace function public.enviar_solicitud_amistad(p_destinatario uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión';
  end if;
  if p_destinatario=auth.uid() then
    raise exception 'No puedes enviarte una solicitud a ti mismo';
  end if;
  if exists(
    select 1 from public.usuarios_bloqueados b
    where (b.bloqueador_id=auth.uid() and b.bloqueado_id=p_destinatario)
       or (b.bloqueador_id=p_destinatario and b.bloqueado_id=auth.uid())
  ) then
    raise exception 'No se puede enviar la solicitud porque existe un bloqueo';
  end if;

  select id into v_id
  from public.solicitudes_amistad
  where (
    (solicitante_id=auth.uid() and destinatario_id=p_destinatario)
    or (solicitante_id=p_destinatario and destinatario_id=auth.uid())
  )
  and estado in ('pendiente','aceptada')
  order by creado_en desc
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.solicitudes_amistad(solicitante_id,destinatario_id)
  values(auth.uid(),p_destinatario)
  returning id into v_id;

  insert into public.notificaciones(usuario_id,actor_id,tipo)
  values(p_destinatario,auth.uid(),'solicitud_amistad');

  return v_id;
end $$;
grant execute on function public.enviar_solicitud_amistad(uuid) to authenticated;

create or replace function public.responder_solicitud_amistad(
  p_solicitud_id uuid,
  p_respuesta text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_solicitante uuid;
begin
  if p_respuesta not in ('aceptada','rechazada') then
    raise exception 'Respuesta inválida';
  end if;

  update public.solicitudes_amistad
  set estado=p_respuesta,respondido_en=now()
  where id=p_solicitud_id
    and destinatario_id=auth.uid()
    and estado='pendiente'
  returning solicitante_id into v_solicitante;

  if v_solicitante is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if p_respuesta='aceptada' then
    insert into public.notificaciones(usuario_id,actor_id,tipo)
    values(v_solicitante,auth.uid(),'amistad_aceptada');
  end if;
end $$;
grant execute on function public.responder_solicitud_amistad(uuid,text)
  to authenticated;

create or replace view public.amigos_detalle
with (security_invoker=true) as
select
  sa.id as solicitud_id,
  case when sa.solicitante_id=auth.uid() then d.id else s.id end as id,
  case when sa.solicitante_id=auth.uid() then d.username else s.username end as username,
  case when sa.solicitante_id=auth.uid() then d.nombre_visible else s.nombre_visible end as nombre_visible,
  case when sa.solicitante_id=auth.uid() then d.avatar_url else s.avatar_url end as avatar_url,
  case when sa.solicitante_id=auth.uid() then d.ultima_actividad else s.ultima_actividad end as ultima_actividad
from public.solicitudes_amistad sa
join public.perfiles s on s.id=sa.solicitante_id
join public.perfiles d on d.id=sa.destinatario_id
where sa.estado='aceptada'
  and (sa.solicitante_id=auth.uid() or sa.destinatario_id=auth.uid());
grant select on public.amigos_detalle to authenticated;

create or replace view public.solicitudes_recibidas_detalle
with (security_invoker=true) as
select
  sa.id as solicitud_id,
  sa.creado_en,
  p.id,p.username,p.nombre_visible,p.avatar_url,p.ultima_actividad
from public.solicitudes_amistad sa
join public.perfiles p on p.id=sa.solicitante_id
where sa.destinatario_id=auth.uid() and sa.estado='pendiente';
grant select on public.solicitudes_recibidas_detalle to authenticated;

create or replace view public.solicitudes_enviadas_detalle
with (security_invoker=true) as
select
  sa.id as solicitud_id,
  sa.creado_en,
  sa.estado,
  p.id,p.username,p.nombre_visible,p.avatar_url,p.ultima_actividad
from public.solicitudes_amistad sa
join public.perfiles p on p.id=sa.destinatario_id
where sa.solicitante_id=auth.uid();
grant select on public.solicitudes_enviadas_detalle to authenticated;


-- 1. Perfil único: todas las cuentas nacen personales.
alter table public.perfiles
  add column if not exists telefono_e164 text,
  add column if not exists telefono_verificado_en timestamptz,
  add column if not exists proveedor_estado text not null default 'no_solicitado',
  add column if not exists proveedor_tipo text,
  add column if not exists proveedor_actualizado_en timestamptz;

do $$ begin
  alter table public.perfiles add constraint perfiles_proveedor_estado_check
    check (proveedor_estado in ('no_solicitado','pendiente','observado','aprobado','rechazado','suspendido'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.perfiles add constraint perfiles_proveedor_tipo_check
    check (proveedor_tipo is null or proveedor_tipo in ('independiente','negocio','organizacion'));
exception when duplicate_object then null; end $$;

update public.perfiles set tipo_cuenta='personal' where tipo_cuenta is null;

create or replace function public.mizona_sync_phone_verification()
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_user uuid:=auth.uid(); v_phone text; v_confirmed timestamptz;
begin
  if v_user is null then raise exception 'Debes iniciar sesión'; end if;
  select phone,phone_confirmed_at into v_phone,v_confirmed from auth.users where id=v_user;
  if v_confirmed is null or nullif(trim(coalesce(v_phone,'')),'') is null then
    update public.perfiles set telefono_verificado=false,telefono_e164=null,telefono_verificado_en=null where id=v_user;
    return jsonb_build_object('verificado',false);
  end if;
  update public.perfiles set telefono_verificado=true,telefono_e164=v_phone,telefono_verificado_en=coalesce(telefono_verificado_en,v_confirmed) where id=v_user;
  return jsonb_build_object('verificado',true,'telefono',repeat('*',greatest(length(v_phone)-4,0))||right(v_phone,4));
end $$;
grant execute on function public.mizona_sync_phone_verification() to authenticated;

create or replace function public.mizona_requiere_telefono_verificado()
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select telefono_verificado from public.perfiles where id=auth.uid()),false)
$$;
grant execute on function public.mizona_requiere_telefono_verificado() to authenticated;

-- 2. Contactos de confianza.
create table if not exists public.contactos_confianza(
  id uuid primary key default gen_random_uuid(),
  propietario_id uuid not null references auth.users(id) on delete cascade,
  contacto_id uuid not null references auth.users(id) on delete cascade,
  estado text not null default 'pendiente' check(estado in('pendiente','aceptado','rechazado','cancelado')),
  recibir_alertas boolean not null default true,
  ver_ubicacion_emergencia boolean not null default true,
  permitir_llamada boolean not null default true,
  creado_en timestamptz not null default now(),
  respondido_en timestamptz,
  check(propietario_id<>contacto_id),
  unique(propietario_id,contacto_id)
);
alter table public.contactos_confianza enable row level security;
drop policy if exists "contactos_confianza_select" on public.contactos_confianza;
create policy "contactos_confianza_select" on public.contactos_confianza for select to authenticated
using(propietario_id=auth.uid() or contacto_id=auth.uid() or public.is_admin());
drop policy if exists "contactos_confianza_delete" on public.contactos_confianza;
create policy "contactos_confianza_delete" on public.contactos_confianza for delete to authenticated
using(propietario_id=auth.uid() or contacto_id=auth.uid() or public.is_admin());

create or replace view public.contactos_confianza_detalle with(security_invoker=true) as
select c.id,c.propietario_id,c.contacto_id,c.estado,c.recibir_alertas,c.ver_ubicacion_emergencia,c.permitir_llamada,c.creado_en,c.respondido_en,
  case when c.propietario_id=auth.uid() then p2.nombre_visible else p1.nombre_visible end nombre_visible,
  case when c.propietario_id=auth.uid() then p2.username else p1.username end username,
  case when c.propietario_id=auth.uid() then p2.avatar_url else p1.avatar_url end avatar_url,
  case when c.propietario_id=auth.uid() then 'enviado' else 'recibido' end direccion
from public.contactos_confianza c
join public.perfiles p1 on p1.id=c.propietario_id join public.perfiles p2 on p2.id=c.contacto_id
where c.propietario_id=auth.uid() or c.contacto_id=auth.uid();
grant select on public.contactos_confianza_detalle to authenticated;

create or replace function public.mizona_solicitar_contacto_confianza(p_username text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid();v_contact uuid;v_id uuid;
begin
 if v_user is null then raise exception 'Debes iniciar sesión'; end if;
 if not public.mizona_requiere_telefono_verificado() then raise exception 'Verifica tu celular antes de agregar contactos de confianza'; end if;
 select id into v_contact from public.perfiles where lower(username)=lower(trim(replace(p_username,'@',''))) limit 1;
 if v_contact is null then raise exception 'No encontramos ese usuario'; end if;
 if v_contact=v_user then raise exception 'No puedes agregarte a ti mismo'; end if;
 if not coalesce((select telefono_verificado from public.perfiles where id=v_contact),false) then raise exception 'El contacto también debe verificar su celular'; end if;
 insert into public.contactos_confianza(propietario_id,contacto_id,estado) values(v_user,v_contact,'pendiente')
 on conflict(propietario_id,contacto_id) do update set estado='pendiente',creado_en=now(),respondido_en=null returning id into v_id;
 insert into public.notificaciones(usuario_id,actor_id,tipo) values(v_contact,v_user,'sistema');
 insert into public.notification_events(event_type,actor_id,recipient_id,resource_type,resource_id,prioridad,titulo,cuerpo,url,payload,dedupe_key)
 values('contacto_confianza_solicitud',v_user,v_contact,'contacto_confianza',v_id::text,'normal','Nueva invitación de confianza','Un vecino te invitó a ser su contacto de confianza.','contactos-confianza.html',jsonb_build_object('solicitud_id',v_id),'contacto_confianza_solicitud:'||v_id::text)
 on conflict(dedupe_key) do update set titulo=excluded.titulo,cuerpo=excluded.cuerpo,payload=excluded.payload,estado='pending',procesado_en=null,error=null;
 return v_id;
end $$;
grant execute on function public.mizona_solicitar_contacto_confianza(text) to authenticated;

create or replace function public.mizona_responder_contacto_confianza(p_id uuid,p_aceptar boolean)
returns void language plpgsql security definer set search_path=public as $$
declare v_owner uuid;
begin
 update public.contactos_confianza set estado=case when p_aceptar then 'aceptado' else 'rechazado' end,respondido_en=now()
 where id=p_id and contacto_id=auth.uid() and estado='pendiente'
 returning propietario_id into v_owner;
 if not found then raise exception 'Solicitud no encontrada'; end if;
 insert into public.notification_events(event_type,actor_id,recipient_id,resource_type,resource_id,prioridad,titulo,cuerpo,url,payload,dedupe_key)
 values('contacto_confianza_respuesta',auth.uid(),v_owner,'contacto_confianza',p_id::text,'normal',case when p_aceptar then 'Contacto de confianza aceptado' else 'Invitación de confianza rechazada' end,case when p_aceptar then 'Tu invitación fue aceptada.' else 'Tu invitación no fue aceptada.' end,'contactos-confianza.html',jsonb_build_object('solicitud_id',p_id,'aceptada',p_aceptar),'contacto_confianza_respuesta:'||p_id::text)
 on conflict(dedupe_key) do update set titulo=excluded.titulo,cuerpo=excluded.cuerpo,payload=excluded.payload,estado='pending',procesado_en=null,error=null;
end $$;
grant execute on function public.mizona_responder_contacto_confianza(uuid,boolean) to authenticated;

-- 3. Solicitudes para ofrecer servicios.
create table if not exists public.solicitudes_proveedor(
 id uuid primary key default gen_random_uuid(), usuario_id uuid not null references auth.users(id) on delete cascade,
 tipo text not null check(tipo in('independiente','negocio','organizacion')), nombre_comercial text not null,
 categoria text not null, descripcion text not null, distrito text not null, zona_atencion text,
 whatsapp text, ruc text, documento_url text, evidencia_url text, mensaje_admin text,
 estado text not null default 'pendiente' check(estado in('pendiente','observado','aprobado','rechazado','suspendido')),
 observacion_admin text, revisado_por uuid references auth.users(id), revisado_en timestamptz,
 creado_en timestamptz not null default now(), actualizado_en timestamptz not null default now()
);
create unique index if not exists solicitudes_proveedor_una_activa on public.solicitudes_proveedor(usuario_id) where estado in('pendiente','observado','aprobado');
alter table public.solicitudes_proveedor enable row level security;
drop policy if exists "proveedor_usuario_ve" on public.solicitudes_proveedor;
create policy "proveedor_usuario_ve" on public.solicitudes_proveedor for select to authenticated using(usuario_id=auth.uid() or public.is_admin());
drop policy if exists "proveedor_admin_actualiza" on public.solicitudes_proveedor;
create policy "proveedor_admin_actualiza" on public.solicitudes_proveedor for update to authenticated using(public.is_admin()) with check(public.is_admin());

create or replace view public.solicitudes_proveedor_admin with(security_invoker=true) as
select s.*,p.username,p.nombre_visible,p.avatar_url,p.telefono_verificado
from public.solicitudes_proveedor s join public.perfiles p on p.id=s.usuario_id;
grant select on public.solicitudes_proveedor_admin to authenticated;

create or replace function public.mizona_solicitar_proveedor(p_tipo text,p_nombre text,p_categoria text,p_descripcion text,p_distrito text,p_zona text,p_whatsapp text,p_ruc text,p_mensaje text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;begin
 if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
 if not public.mizona_requiere_telefono_verificado() then raise exception 'Verifica tu celular antes de solicitar autorización'; end if;
 if p_tipo not in('independiente','negocio','organizacion') then raise exception 'Tipo inválido'; end if;
 if length(trim(coalesce(p_nombre,'')))<3 or length(trim(coalesce(p_descripcion,'')))<20 then raise exception 'Completa el nombre y una descripción detallada'; end if;
 select id into v_id from public.solicitudes_proveedor where usuario_id=auth.uid() and estado in('pendiente','observado','aprobado') order by creado_en desc limit 1;
 if v_id is not null then
   if exists(select 1 from public.solicitudes_proveedor where id=v_id and estado='pendiente') then raise exception 'Tu solicitud ya está en revisión'; end if;
   if exists(select 1 from public.solicitudes_proveedor where id=v_id and estado='aprobado') then raise exception 'Ya eres un proveedor aprobado'; end if;
   update public.solicitudes_proveedor set tipo=p_tipo,nombre_comercial=trim(p_nombre),categoria=trim(p_categoria),descripcion=trim(p_descripcion),distrito=trim(p_distrito),zona_atencion=nullif(trim(coalesce(p_zona,'')),''),whatsapp=nullif(trim(coalesce(p_whatsapp,'')),''),ruc=nullif(trim(coalesce(p_ruc,'')),''),mensaje_admin=nullif(trim(coalesce(p_mensaje,'')),''),estado='pendiente',observacion_admin=null,revisado_por=null,revisado_en=null,actualizado_en=now() where id=v_id;
 else
   insert into public.solicitudes_proveedor(usuario_id,tipo,nombre_comercial,categoria,descripcion,distrito,zona_atencion,whatsapp,ruc,mensaje_admin)
   values(auth.uid(),p_tipo,trim(p_nombre),trim(p_categoria),trim(p_descripcion),trim(p_distrito),nullif(trim(coalesce(p_zona,'')),''),nullif(trim(coalesce(p_whatsapp,'')),''),nullif(trim(coalesce(p_ruc,'')),''),nullif(trim(coalesce(p_mensaje,'')),'')) returning id into v_id;
 end if;
 update public.perfiles set proveedor_estado='pendiente',proveedor_tipo=p_tipo,proveedor_actualizado_en=now() where id=auth.uid(); return v_id;
end $$;
grant execute on function public.mizona_solicitar_proveedor(text,text,text,text,text,text,text,text,text) to authenticated;

create or replace function public.mizona_revisar_proveedor(p_id uuid,p_estado text,p_observacion text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_user uuid;v_tipo text;begin
 if not public.is_admin() then raise exception 'Acceso administrativo requerido'; end if;
 if p_estado not in('observado','aprobado','rechazado','suspendido') then raise exception 'Estado inválido'; end if;
 update public.solicitudes_proveedor set estado=p_estado,observacion_admin=nullif(trim(coalesce(p_observacion,'')),''),revisado_por=auth.uid(),revisado_en=now(),actualizado_en=now() where id=p_id returning usuario_id,tipo into v_user,v_tipo;
 if v_user is null then raise exception 'Solicitud no encontrada'; end if;
 update public.perfiles set proveedor_estado=p_estado,proveedor_tipo=v_tipo,proveedor_actualizado_en=now() where id=v_user;
 insert into public.notificaciones(usuario_id,actor_id,tipo) values(v_user,auth.uid(),'sistema');
 insert into public.notification_events(event_type,actor_id,recipient_id,resource_type,resource_id,prioridad,titulo,cuerpo,url,payload,dedupe_key)
 values('negocio_proveedor_revision',auth.uid(),v_user,'solicitud_proveedor',p_id::text,'normal',
   case p_estado when 'aprobado' then '✅ Solicitud aprobada' when 'observado' then 'Solicitud con observaciones' when 'rechazado' then 'Solicitud rechazada' else 'Estado de proveedor actualizado' end,
   case p_estado when 'aprobado' then 'Ya puedes publicar tus servicios en MiZona.' when 'observado' then coalesce(nullif(trim(p_observacion),''),'Revisa y corrige los datos de tu solicitud.') when 'rechazado' then coalesce(nullif(trim(p_observacion),''),'La solicitud no fue aprobada.') else 'Revisa el estado de tu solicitud.' end,
   'proveedor.html',jsonb_build_object('solicitud_id',p_id,'estado',p_estado),'negocio_proveedor_revision:'||p_id::text||':'||p_estado)
 on conflict(dedupe_key) do nothing;
end $$;
grant execute on function public.mizona_revisar_proveedor(uuid,text,text) to authenticated;

create or replace function public.mizona_puede_publicar_servicio()
returns boolean language sql stable security definer set search_path=public as $$
 select coalesce((select proveedor_estado='aprobado' from public.perfiles where id=auth.uid()),false) or public.is_admin()
$$;
grant execute on function public.mizona_puede_publicar_servicio() to authenticated;

drop policy if exists "crear servicio propio" on public.servicios_mizona;
create policy "crear servicio propio" on public.servicios_mizona for insert to authenticated
with check(propietario_id=auth.uid() and public.mizona_puede_publicar_servicio());

-- 4. Solicitudes de conversación y chat privado.
create table if not exists public.usuarios_bloqueados(
 bloqueador_id uuid not null references auth.users(id) on delete cascade,
 bloqueado_id uuid not null references auth.users(id) on delete cascade,
 creado_en timestamptz not null default now(),
 primary key(bloqueador_id,bloqueado_id),
 check(bloqueador_id<>bloqueado_id)
);

create table if not exists public.solicitudes_chat(
 id uuid primary key default gen_random_uuid(),
 solicitante_id uuid not null references auth.users(id) on delete cascade,
 destinatario_id uuid not null references auth.users(id) on delete cascade,
 estado text not null default 'pendiente' check(estado in('pendiente','aceptada','rechazada','cancelada')),
 creado_en timestamptz not null default now(),
 respondido_en timestamptz,
 check(solicitante_id<>destinatario_id)
);
create unique index if not exists solicitudes_chat_una_activa
 on public.solicitudes_chat(least(solicitante_id,destinatario_id),greatest(solicitante_id,destinatario_id))
 where estado in('pendiente','aceptada');
alter table public.solicitudes_chat enable row level security;
drop policy if exists "solicitudes_chat_relacionadas" on public.solicitudes_chat;
create policy "solicitudes_chat_relacionadas" on public.solicitudes_chat for select to authenticated
 using(solicitante_id=auth.uid() or destinatario_id=auth.uid() or public.is_admin());
drop policy if exists "solicitudes_chat_cancelar" on public.solicitudes_chat;
revoke insert,update,delete on public.solicitudes_chat from anon,authenticated;
grant select on public.solicitudes_chat to authenticated;

create or replace view public.solicitudes_chat_recibidas with(security_invoker=true) as
select s.id,s.solicitante_id,s.estado,s.creado_en,p.username,p.nombre_visible,p.avatar_url
from public.solicitudes_chat s join public.perfiles p on p.id=s.solicitante_id
where s.destinatario_id=auth.uid() and s.estado='pendiente';
grant select on public.solicitudes_chat_recibidas to authenticated;

create or replace function public.mizona_solicitar_o_abrir_chat(p_otro_usuario uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_user uuid:=auth.uid();v_conversation uuid;v_request uuid;v_event bigint;v_allowed boolean:=false;v_actor text;
begin
 if v_user is null then raise exception 'Debes iniciar sesión'; end if;
 if p_otro_usuario is null or p_otro_usuario=v_user then raise exception 'Usuario inválido'; end if;
 if not public.mizona_requiere_telefono_verificado() then raise exception 'Verifica tu celular antes de iniciar un chat'; end if;
 if not coalesce((select telefono_verificado from public.perfiles where id=p_otro_usuario),false) then raise exception 'Este usuario todavía no verificó su celular'; end if;
 if exists(select 1 from public.usuarios_bloqueados where (bloqueador_id=v_user and bloqueado_id=p_otro_usuario) or (bloqueador_id=p_otro_usuario and bloqueado_id=v_user)) then raise exception 'No se puede iniciar la conversación porque existe un bloqueo'; end if;

 select c.id into v_conversation
 from public.conversaciones c
 join public.conversacion_participantes a on a.conversacion_id=c.id and a.usuario_id=v_user
 join public.conversacion_participantes b on b.conversacion_id=c.id and b.usuario_id=p_otro_usuario
 where (select count(*) from public.conversacion_participantes x where x.conversacion_id=c.id)=2
 order by c.creada_en desc limit 1;
 if v_conversation is not null then return jsonb_build_object('estado','abierta','conversation_id',v_conversation); end if;

 v_allowed:=
   exists(select 1 from public.solicitudes_amistad a where a.estado='aceptada' and ((a.solicitante_id=v_user and a.destinatario_id=p_otro_usuario) or (a.solicitante_id=p_otro_usuario and a.destinatario_id=v_user)))
   or exists(select 1 from public.contactos_confianza c where c.estado='aceptado' and ((c.propietario_id=v_user and c.contacto_id=p_otro_usuario) or (c.propietario_id=p_otro_usuario and c.contacto_id=v_user)))
   or coalesce((select proveedor_estado='aprobado' from public.perfiles where id=p_otro_usuario),false)
   or exists(select 1 from public.solicitudes_chat s where s.estado='aceptada' and ((s.solicitante_id=v_user and s.destinatario_id=p_otro_usuario) or (s.solicitante_id=p_otro_usuario and s.destinatario_id=v_user)));

 if v_allowed then
   v_conversation:=public.crear_o_obtener_conversacion(p_otro_usuario);
   return jsonb_build_object('estado','abierta','conversation_id',v_conversation);
 end if;

 select id into v_request from public.solicitudes_chat
 where estado='pendiente' and ((solicitante_id=v_user and destinatario_id=p_otro_usuario) or (solicitante_id=p_otro_usuario and destinatario_id=v_user))
 order by creado_en desc limit 1;
 if v_request is not null then return jsonb_build_object('estado','pendiente','request_id',v_request,'ya_existia',true); end if;

 insert into public.solicitudes_chat(solicitante_id,destinatario_id) values(v_user,p_otro_usuario) returning id into v_request;
 select coalesce(nullif(nombre_visible,''),nullif(username,''),'Un vecino') into v_actor from public.perfiles where id=v_user;
 insert into public.notification_events(event_type,actor_id,recipient_id,resource_type,resource_id,prioridad,titulo,cuerpo,url,payload,dedupe_key)
 values('social_solicitud_chat',v_user,p_otro_usuario,'solicitud_chat',v_request::text,'normal','Solicitud de conversación',v_actor||' quiere enviarte mensajes privados.','mensajes.html',jsonb_build_object('solicitud_id',v_request),'social_solicitud_chat:'||v_request::text)
 returning id into v_event;
 return jsonb_build_object('estado','pendiente','request_id',v_request,'event_id',v_event);
end $$;
grant execute on function public.mizona_solicitar_o_abrir_chat(uuid) to authenticated;

create or replace function public.mizona_responder_solicitud_chat(p_id uuid,p_aceptar boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_sender uuid;v_conversation uuid;v_event bigint;begin
 update public.solicitudes_chat set estado=case when p_aceptar then 'aceptada' else 'rechazada' end,respondido_en=now()
 where id=p_id and destinatario_id=auth.uid() and estado='pendiente' returning solicitante_id into v_sender;
 if v_sender is null then raise exception 'Solicitud no encontrada'; end if;
 if p_aceptar then v_conversation:=public.crear_o_obtener_conversacion(v_sender); end if;
 insert into public.notification_events(event_type,actor_id,recipient_id,resource_type,resource_id,prioridad,titulo,cuerpo,url,payload,dedupe_key)
 values('social_respuesta_chat',auth.uid(),v_sender,'solicitud_chat',p_id::text,'normal',case when p_aceptar then 'Solicitud de chat aceptada' else 'Solicitud de chat rechazada' end,case when p_aceptar then 'Ya pueden conversar de forma privada.' else 'La solicitud de conversación no fue aceptada.' end,case when p_aceptar then 'mensajes.html?c='||v_conversation::text else 'mensajes.html' end,jsonb_build_object('solicitud_id',p_id,'aceptada',p_aceptar,'conversacion_id',v_conversation),'social_respuesta_chat:'||p_id::text)
 returning id into v_event;
 return jsonb_build_object('estado',case when p_aceptar then 'abierta' else 'rechazada' end,'conversation_id',v_conversation,'event_id',v_event);
end $$;
grant execute on function public.mizona_responder_solicitud_chat(uuid,boolean) to authenticated;

-- El acceso público al RPC antiguo se retira para que desconocidos no salten la solicitud.
revoke execute on function public.crear_o_obtener_conversacion(uuid) from anon,authenticated;

-- 5. Bloqueo y reporte de chat.
alter table public.usuarios_bloqueados enable row level security;
drop policy if exists "bloqueos_propios" on public.usuarios_bloqueados;
create policy "bloqueos_propios" on public.usuarios_bloqueados for all to authenticated using(bloqueador_id=auth.uid()) with check(bloqueador_id=auth.uid());

create table if not exists public.reportes_chat(
 id uuid primary key default gen_random_uuid(),reportante_id uuid not null references auth.users(id),reportado_id uuid not null references auth.users(id),
 conversacion_id uuid references public.conversaciones(id) on delete set null,motivo text not null,detalle text,estado text not null default 'pendiente',creado_en timestamptz not null default now());
alter table public.reportes_chat enable row level security;
drop policy if exists "reportes_chat_usuario" on public.reportes_chat;
create policy "reportes_chat_usuario" on public.reportes_chat for select to authenticated using(reportante_id=auth.uid() or public.is_admin());

create or replace function public.mizona_bloquear_usuario(p_usuario uuid,p_bloquear boolean default true)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_usuario=auth.uid() then raise exception 'Acción inválida'; end if;
 if p_bloquear then insert into public.usuarios_bloqueados values(auth.uid(),p_usuario,now()) on conflict do nothing;
 else delete from public.usuarios_bloqueados where bloqueador_id=auth.uid() and bloqueado_id=p_usuario; end if;
end $$;
grant execute on function public.mizona_bloquear_usuario(uuid,boolean) to authenticated;

create or replace function public.mizona_reportar_chat(p_usuario uuid,p_conversacion uuid,p_motivo text,p_detalle text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;begin
 if length(trim(coalesce(p_motivo,'')))<3 then raise exception 'Selecciona un motivo'; end if;
 insert into public.reportes_chat(reportante_id,reportado_id,conversacion_id,motivo,detalle) values(auth.uid(),p_usuario,p_conversacion,trim(p_motivo),nullif(trim(coalesce(p_detalle,'')),'')) returning id into v_id;return v_id;
end $$;
grant execute on function public.mizona_reportar_chat(uuid,uuid,text,text) to authenticated;

create or replace function public.mizona_enviar_mensaje(p_conversacion uuid,p_contenido text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid();v_other uuid;v_message uuid;v_event bigint;v_actor text;begin
 if v_user is null then raise exception 'Debes iniciar sesión'; end if;
 if not public.mizona_requiere_telefono_verificado() then raise exception 'Verifica tu celular para enviar mensajes'; end if;
 if length(trim(coalesce(p_contenido,''))) not between 1 and 2000 then raise exception 'Mensaje inválido'; end if;
 if not public.es_participante_conversacion(p_conversacion,v_user) then raise exception 'No perteneces a esta conversación'; end if;
 select usuario_id into v_other from public.conversacion_participantes where conversacion_id=p_conversacion and usuario_id<>v_user limit 1;
 if exists(select 1 from public.usuarios_bloqueados where (bloqueador_id=v_user and bloqueado_id=v_other) or (bloqueador_id=v_other and bloqueado_id=v_user)) then raise exception 'No se puede enviar el mensaje porque existe un bloqueo'; end if;
 insert into public.mensajes(conversacion_id,remitente_id,contenido) values(p_conversacion,v_user,trim(p_contenido)) returning id into v_message;
 select coalesce(nullif(nombre_visible,''),nullif(username,''),'Un vecino') into v_actor from public.perfiles where id=v_user;
 insert into public.notification_events(event_type,actor_id,recipient_id,resource_type,resource_id,prioridad,titulo,cuerpo,url,payload,dedupe_key)
 values('social_mensaje',v_user,v_other,'mensaje',v_message::text,'normal','Nuevo mensaje de '||v_actor,left(trim(p_contenido),160),'mensajes.html?c='||p_conversacion::text,jsonb_build_object('conversacion_id',p_conversacion,'mensaje_id',v_message),'social_mensaje:'||v_message::text)
 returning id into v_event;
 return jsonb_build_object('mensaje_id',v_message,'event_id',v_event,'destinatario_id',v_other);
end $$;
grant execute on function public.mizona_enviar_mensaje(uuid,text) to authenticated;

-- 6. Alertas detalladas y contactos de confianza.
alter table public.alertas
 add column if not exists tipo_detalle text,
 add column if not exists ocurre_ahora boolean not null default true,
 add column if not exists radio_metros integer not null default 500,
 add column if not exists destino_alerta text not null default 'vecinos';

create or replace function public.crear_alerta_emergencia_mizona(
 p_tipo text,p_descripcion text,p_distrito text,p_zona text,p_lat numeric,p_lon numeric,p_precision text default 'aprox_50m',p_destino text default 'vecinos',p_radio integer default 500,p_ocurre_ahora boolean default true)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_user uuid:=auth.uid();v_categoria text;v_titulo text;v_alerta uuid:=gen_random_uuid();v_events bigint[]:=array[]::bigint[];
 r record;v_event bigint;v_name text;v_precision text;v_public_lat numeric;v_public_lon numeric;
begin
 if v_user is null then raise exception 'Debes iniciar sesión'; end if;
 if not public.mizona_requiere_telefono_verificado() then raise exception 'Verifica tu celular antes de enviar una alerta'; end if;
 if p_tipo not in('robo','sospechoso','accidente','incendio','emergencia_medica','violencia','persona_desaparecida','mascota','agua','luz','via_publica','otro') then raise exception 'Selecciona un tipo de alerta válido'; end if;
 if p_destino not in('vecinos','confianza','ambos') then raise exception 'Destino inválido'; end if;
 if char_length(trim(coalesce(p_descripcion,'')))<10 then raise exception 'Describe mejor lo ocurrido'; end if;
 if char_length(trim(coalesce(p_distrito,'')))<2 then raise exception 'Indica el distrito'; end if;
 v_precision:=coalesce(nullif(p_precision,''),'aprox_50m');
 if v_precision not in('exacta','aprox_50m','aprox_150m','solo_zona') then raise exception 'Nivel de privacidad inválido'; end if;
 v_categoria:=case p_tipo when 'sospechoso' then 'robo' when 'emergencia_medica' then 'accidente' when 'violencia' then 'otro' when 'persona_desaparecida' then 'persona' when 'via_publica' then 'otro' else p_tipo end;
 v_titulo:=case p_tipo when 'robo' then 'Posible robo o asalto' when 'sospechoso' then 'Persona o vehículo sospechoso' when 'accidente' then 'Accidente de tránsito' when 'incendio' then 'Incendio o fuga de gas' when 'emergencia_medica' then 'Emergencia médica' when 'violencia' then 'Violencia o pelea' when 'persona_desaparecida' then 'Persona desaparecida' when 'mascota' then 'Mascota perdida' when 'agua' then 'Problema con el servicio de agua' when 'luz' then 'Problema con el servicio eléctrico' when 'via_publica' then 'Riesgo en la vía pública' else 'Alerta vecinal' end;
 select c.latitud,c.longitud into v_public_lat,v_public_lon from public.mizona_coordenada_publica(p_lat,p_lon,v_precision,v_alerta::text)c;
 insert into public.alertas(id,autor_id,tipo_fuente,categoria,tipo_detalle,titulo,descripcion,distrito,zona_referencia,latitud,longitud,precision_ubicacion,estado,ocurre_ahora,radio_metros,destino_alerta)
 values(v_alerta,v_user,'ciudadana',v_categoria,p_tipo,v_titulo,trim(p_descripcion),trim(p_distrito),nullif(trim(coalesce(p_zona,'')),''),v_public_lat,v_public_lon,v_precision,'reportada',p_ocurre_ahora,greatest(100,least(coalesce(p_radio,500),5000)),p_destino);
 insert into public.alerta_ubicaciones_privadas(alerta_id,autor_id,latitud_exacta,longitud_exacta) values(v_alerta,v_user,p_lat,p_lon);
 insert into public.alerta_actualizaciones(alerta_id,autor_id,tipo,texto,estado_nuevo) values(v_alerta,v_user,'creada','Alerta reportada por un vecino. Pendiente de verificación.','reportada');
 select nombre_visible into v_name from public.perfiles where id=v_user;
 if p_destino in('confianza','ambos') then
   for r in select contacto_id from public.contactos_confianza where propietario_id=v_user and estado='aceptado' and recibir_alertas loop
     insert into public.notification_events(event_type,actor_id,recipient_id,resource_type,resource_id,categoria,latitud,longitud,prioridad,titulo,cuerpo,url,payload,dedupe_key)
     values('contacto_emergencia',v_user,r.contacto_id,'alerta',v_alerta::text,v_categoria,p_lat,p_lon,'critical','🆘 '||coalesce(v_name,'Un contacto')||' solicita ayuda',v_titulo||'. Ubicación compartida temporalmente.','alerta.html?id='||v_alerta::text,jsonb_build_object('alerta_id',v_alerta,'target_user_ids',jsonb_build_array(r.contacto_id),'sin_verificar',true),'contacto_emergencia:'||v_alerta::text||':'||r.contacto_id::text) returning id into v_event;
     v_events:=array_append(v_events,v_event);
   end loop;
 end if;
 return jsonb_build_object('alerta_id',v_alerta,'event_ids',to_jsonb(v_events),'estado','reportada','verificacion','sin_verificar');
end $$;
grant execute on function public.crear_alerta_emergencia_mizona(text,text,text,text,numeric,numeric,text,text,integer,boolean) to authenticated;

-- 7. Asegura tipos de notificación usados por la actualización.
alter table public.notificaciones drop constraint if exists notificaciones_tipo_check;
alter table public.notificaciones add constraint notificaciones_tipo_check check(tipo in('like','comentario','seguimiento','sistema','solicitud_amistad','amistad_aceptada','mensaje'));

commit;
select 'Actualización integral instalada correctamente' as resultado;

-- NOTA: Este bloque debe ejecutarse dentro de la misma actualización. Si el editor
-- no permite sentencias después del COMMIT anterior, selecciónalo y ejecútalo también.
begin;
-- Privacidad para alertas dirigidas únicamente a contactos de confianza.
drop policy if exists "alertas visibles" on public.alertas;
create policy "alertas visibles" on public.alertas for select to anon,authenticated using(
  ((destino_alerta <> 'confianza') and estado not in ('ocultada','falsa'))
  or autor_id=auth.uid() or public.is_admin()
  or exists(select 1 from public.contactos_confianza c where c.propietario_id=alertas.autor_id and c.contacto_id=auth.uid() and c.estado='aceptado')
);

-- Mensaje cuidadoso: un reporte ciudadano nunca se anuncia como hecho confirmado.
create or replace function public.enqueue_new_alert_push()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_actor text:='Un vecino';v_detail text;
begin
 if to_regclass('public.notification_events') is null or new.destino_alerta='confianza' then return new; end if;
 select coalesce(nullif(username,''),'vecino') into v_actor from public.perfiles where id=new.autor_id;
 v_detail:=coalesce(new.tipo_detalle,new.categoria,'alerta');
 insert into public.notification_events(event_type,actor_id,resource_type,resource_id,categoria,latitud,longitud,prioridad,titulo,cuerpo,url,payload,dedupe_key)
 values('alerta_nueva',new.autor_id,'alerta',new.id::text,new.categoria,new.latitud,new.longitud,
   case when new.categoria in('incendio','persona') then 'critical' when new.categoria in('robo','accidente') then 'high' else 'normal' end,
   '⚠️ Alerta vecinal sin verificar',
   left('El vecino @'||v_actor||' reportó '||replace(v_detail,'_',' ')||coalesce(' cerca de '||new.zona_referencia,'')||'. Pendiente de verificación.',220),
   'alerta.html?id='||new.id::text,
   jsonb_build_object('estado','reportada','sin_verificar',true,'distrito',new.distrito,'precision',new.precision_ubicacion,'radio_metros',new.radio_metros),
   'alerta_nueva:'||new.id::text)
 on conflict(dedupe_key) do update set titulo=excluded.titulo,cuerpo=excluded.cuerpo,payload=excluded.payload;
 return new;
end $$;

-- Ubicación exacta solo para autor, administrador o contacto aceptado durante una alerta activa.
create or replace function public.mizona_ubicacion_emergencia_contacto(p_alerta_id uuid)
returns table(latitud numeric,longitud numeric,compartida_hasta timestamptz)
language sql stable security definer set search_path=public as $$
 select u.latitud_exacta,u.longitud_exacta,a.created_at+interval '60 minutes'
 from public.alerta_ubicaciones_privadas u join public.alertas a on a.id=u.alerta_id
 where a.id=p_alerta_id and now()<=a.created_at+interval '60 minutes'
 and (a.autor_id=auth.uid() or public.is_admin() or exists(select 1 from public.contactos_confianza c where c.propietario_id=a.autor_id and c.contacto_id=auth.uid() and c.estado='aceptado' and c.ver_ubicacion_emergencia));
$$;
grant execute on function public.mizona_ubicacion_emergencia_contacto(uuid) to authenticated;
commit;


-- ============================================================
-- CONTINUACIÓN: CERCANÍA AUTOMÁTICA 500 M Y MAPA PARTICIPATIVO
-- ============================================================

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
  p_lat1 numeric, p_lon1 numeric, p_lat2 numeric, p_lon2 numeric
)
returns numeric
language sql
immutable
parallel safe
as $$
  select case
    when p_lat1 is null or p_lon1 is null or p_lat2 is null or p_lon2 is null then null
    else 6371000 * 2 * asin(sqrt(
      power(sin(radians((p_lat2-p_lat1)/2)),2) +
      cos(radians(p_lat1))*cos(radians(p_lat2))*power(sin(radians((p_lon2-p_lon1)/2)),2)
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
  from public.perfiles p where p.id=p_seguido_id and p.estado='activo';
  if not found then raise exception 'Perfil no disponible'; end if;
  if not v_permitir then raise exception 'Este perfil no acepta seguidores'; end if;

  if exists(select 1 from public.seguidores where seguidor_id=v_uid and seguido_id=p_seguido_id) then
    delete from public.seguidores where seguidor_id=v_uid and seguido_id=p_seguido_id;
    return query select 'dejado'::text,'Dejaste de seguir este perfil.'::text; return;
  end if;

  select ss.id into v_request from public.solicitudes_seguimiento ss
  where ss.solicitante_id=v_uid and ss.destinatario_id=p_seguido_id and ss.estado='pendiente' limit 1;
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
drop view if exists public.perfiles_publicos;
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
drop view if exists public.publicaciones_feed;
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
