-- ============================================================
-- MiZona.pe — Seguridad de recuperación de contraseña
-- Ejecutar una sola vez en Supabase > SQL Editor.
-- La respuesta se almacena como hash bcrypt; nunca en texto plano.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.recuperacion_cuenta (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pregunta_id text not null check (pregunta_id in (
    'apodo_infancia','primer_colegio','distrito_infancia','persona_importante','frase_personal'
  )),
  respuesta_hash text not null,
  intentos_fallidos integer not null default 0,
  bloqueado_hasta timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.recuperacion_cuenta enable row level security;
revoke all on table public.recuperacion_cuenta from anon, authenticated;

create or replace function public.normalizar_respuesta_recuperacion(p_respuesta text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(trim(regexp_replace(coalesce(p_respuesta,''), '\s+', ' ', 'g')))
$$;

create or replace function public.configurar_pregunta_recuperacion(
  p_pregunta_id text,
  p_respuesta text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_answer text := public.normalizar_respuesta_recuperacion(p_respuesta);
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión';
  end if;

  if p_pregunta_id not in ('apodo_infancia','primer_colegio','distrito_infancia','persona_importante','frase_personal') then
    raise exception 'Pregunta no válida';
  end if;

  if char_length(v_answer) < 4 then
    raise exception 'La respuesta debe tener al menos 4 caracteres';
  end if;

  insert into public.recuperacion_cuenta(user_id,pregunta_id,respuesta_hash,intentos_fallidos,bloqueado_hasta,updated_at)
  values(v_uid,p_pregunta_id,extensions.crypt(v_answer,extensions.gen_salt('bf',12)),0,null,now())
  on conflict(user_id) do update set
    pregunta_id=excluded.pregunta_id,
    respuesta_hash=excluded.respuesta_hash,
    intentos_fallidos=0,
    bloqueado_hasta=null,
    updated_at=now();

  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.estado_pregunta_recuperacion()
returns table(configurada boolean,pregunta_id text,updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select true,r.pregunta_id,r.updated_at
  from public.recuperacion_cuenta r
  where r.user_id=auth.uid()
  union all
  select false,null::text,null::timestamptz
  where auth.uid() is not null
    and not exists(select 1 from public.recuperacion_cuenta r where r.user_id=auth.uid())
  limit 1
$$;

create or replace function public.verificar_pregunta_recuperacion(
  p_email text,
  p_pregunta_id text,
  p_respuesta text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid;
  v_row public.recuperacion_cuenta%rowtype;
  v_answer text := public.normalizar_respuesta_recuperacion(p_respuesta);
  v_new_attempts integer;
begin
  select u.id into v_user_id
  from auth.users u
  where lower(u.email)=lower(trim(coalesce(p_email,'')))
  limit 1;

  if v_user_id is null then
    perform pg_sleep(0.20);
    return jsonb_build_object('valida',false,'bloqueada',false);
  end if;

  select * into v_row
  from public.recuperacion_cuenta
  where user_id=v_user_id
  for update;

  if not found then
    perform pg_sleep(0.20);
    return jsonb_build_object('valida',false,'bloqueada',false,'sin_configurar',true);
  end if;

  if v_row.bloqueado_hasta is not null and v_row.bloqueado_hasta>now() then
    return jsonb_build_object('valida',false,'bloqueada',true);
  end if;

  if v_row.pregunta_id=p_pregunta_id
     and extensions.crypt(v_answer,v_row.respuesta_hash)=v_row.respuesta_hash then
    update public.recuperacion_cuenta
      set intentos_fallidos=0,bloqueado_hasta=null,updated_at=now()
      where user_id=v_user_id;
    return jsonb_build_object('valida',true,'bloqueada',false);
  end if;

  v_new_attempts:=coalesce(v_row.intentos_fallidos,0)+1;
  if v_new_attempts>=5 then
    update public.recuperacion_cuenta
      set intentos_fallidos=0,bloqueado_hasta=now()+interval '15 minutes',updated_at=now()
      where user_id=v_user_id;
    return jsonb_build_object('valida',false,'bloqueada',true);
  end if;

  update public.recuperacion_cuenta
    set intentos_fallidos=v_new_attempts,bloqueado_hasta=null,updated_at=now()
    where user_id=v_user_id;

  return jsonb_build_object('valida',false,'bloqueada',false);
end;
$$;

revoke all on function public.normalizar_respuesta_recuperacion(text) from public;
revoke all on function public.configurar_pregunta_recuperacion(text,text) from public;
revoke all on function public.estado_pregunta_recuperacion() from public;
revoke all on function public.verificar_pregunta_recuperacion(text,text,text) from public;

grant execute on function public.configurar_pregunta_recuperacion(text,text) to authenticated;
grant execute on function public.estado_pregunta_recuperacion() to authenticated;
grant execute on function public.verificar_pregunta_recuperacion(text,text,text) to anon, authenticated;
