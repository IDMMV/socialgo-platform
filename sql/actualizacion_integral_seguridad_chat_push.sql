-- ============================================================
-- MiZona.pe — ACTUALIZACIÓN INTEGRAL
-- Sesión estable, teléfono verificado, contactos de confianza,
-- proveedores aprobados, alertas clasificadas, chat seguro y push.
-- Ejecutar DESPUÉS de las fases anteriores.
-- ============================================================
begin;
create extension if not exists pgcrypto;

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
