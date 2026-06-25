-- ============================================================
-- MiZona V6.1 — Acceso con Google + perfil inicial seguro
-- Ejecutar UNA SOLA VEZ después del SQL V6.
-- No contiene Client ID ni Client Secret.
-- ============================================================
begin;

alter table public.perfiles add column if not exists perfil_completo boolean not null default true;
alter table public.perfiles add column if not exists proveedor_registro text not null default 'email';
alter table public.perfiles add column if not exists terminos_aceptados_en timestamptz;
alter table public.perfiles add column if not exists telefono_contacto text;
alter table public.perfiles add column if not exists distrito text;
alter table public.perfiles add column if not exists zona text;
alter table public.perfiles add column if not exists actualizado_en timestamptz not null default now();

create or replace function public.mizona_generar_username_unico(p_email text, p_id uuid)
returns text
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_base text;
  v_candidate text;
  v_suffix text:=left(replace(p_id::text,'-',''),6);
  v_try integer:=0;
begin
  v_base:=lower(split_part(coalesce(p_email,''),'@',1));
  v_base:=regexp_replace(v_base,'[^a-z0-9_.]+','','g');
  v_base:=trim(both '._' from v_base);
  if length(v_base)<3 then v_base:='vecino'; end if;
  v_base:=left(v_base,15);
  v_candidate:=v_base||'_'||v_suffix;

  while exists(select 1 from public.perfiles p where p.username=v_candidate and p.id<>p_id) loop
    v_try:=v_try+1;
    v_candidate:=left(v_base,14)||'_'||v_suffix||left(v_try::text,2);
    if v_try>90 then
      v_candidate:='vecino_'||left(replace(gen_random_uuid()::text,'-',''),12);
      exit;
    end if;
  end loop;
  return v_candidate;
end
$$;

revoke all on function public.mizona_generar_username_unico(text,uuid) from public;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_requested text:=lower(trim(coalesce(new.raw_user_meta_data->>'username','')));
  v_username text;
  v_name text;
  v_type text:=lower(coalesce(new.raw_user_meta_data->>'account_type','personal'));
  v_provider text:=lower(coalesce(new.raw_app_meta_data->>'provider',new.raw_user_meta_data->>'signup_method','email'));
  v_avatar text:=coalesce(nullif(new.raw_user_meta_data->>'avatar_url',''),nullif(new.raw_user_meta_data->>'picture',''));
  v_selected boolean:=false;
  v_terms boolean:=lower(coalesce(new.raw_user_meta_data->>'terms_accepted','false')) in ('true','1','yes','si','sí');
begin
  v_name:=trim(coalesce(
    nullif(new.raw_user_meta_data->>'full_name',''),
    nullif(new.raw_user_meta_data->>'name',''),
    nullif(split_part(coalesce(new.email,''),'@',1),''),
    'Usuario MiZona'
  ));
  if length(v_name)>80 then v_name:=left(v_name,80); end if;
  if length(v_name)<1 then v_name:='Usuario MiZona'; end if;

  v_selected:=v_requested ~ '^[a-z0-9_.]{3,24}$';
  if v_selected then
    if exists(select 1 from public.perfiles p where p.username=v_requested and p.id<>new.id) then
      raise exception 'Ese nombre de usuario no está disponible';
    end if;
    v_username:=v_requested;
  else
    v_username:=public.mizona_generar_username_unico(new.email,new.id);
  end if;

  if v_type not in ('personal','creator','business','organization') then v_type:='personal'; end if;

  insert into public.perfiles(
    id,username,nombre_visible,tipo_cuenta,avatar_url,
    perfil_completo,proveedor_registro,terminos_aceptados_en
  ) values(
    new.id,v_username,v_name,v_type,v_avatar,
    (v_selected and v_terms),v_provider,
    case when v_terms then now() else null end
  )
  on conflict(id) do update set
    nombre_visible=coalesce(nullif(public.perfiles.nombre_visible,''),excluded.nombre_visible),
    avatar_url=coalesce(public.perfiles.avatar_url,excluded.avatar_url),
    proveedor_registro=coalesce(nullif(public.perfiles.proveedor_registro,''),excluded.proveedor_registro);

  return new;
end
$$;

-- Conserva el mismo trigger, pero ahora Google puede crear usuarios sin enviar username.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.mizona_asegurar_perfil()
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_auth auth.users%rowtype;
  v_profile public.perfiles%rowtype;
  v_username text;
  v_name text;
  v_provider text;
  v_avatar text;
begin
  if v_user is null then raise exception 'Debes iniciar sesión'; end if;

  select * into v_profile from public.perfiles where id=v_user;
  if found then return to_jsonb(v_profile); end if;

  select * into v_auth from auth.users where id=v_user;
  if not found then raise exception 'Usuario no encontrado'; end if;

  v_username:=public.mizona_generar_username_unico(v_auth.email,v_user);
  v_name:=trim(coalesce(
    nullif(v_auth.raw_user_meta_data->>'full_name',''),
    nullif(v_auth.raw_user_meta_data->>'name',''),
    nullif(split_part(coalesce(v_auth.email,''),'@',1),''),
    'Usuario MiZona'
  ));
  v_name:=left(v_name,80);
  v_provider:=lower(coalesce(v_auth.raw_app_meta_data->>'provider','email'));
  v_avatar:=coalesce(nullif(v_auth.raw_user_meta_data->>'avatar_url',''),nullif(v_auth.raw_user_meta_data->>'picture',''));

  insert into public.perfiles(id,username,nombre_visible,tipo_cuenta,avatar_url,perfil_completo,proveedor_registro)
  values(v_user,v_username,v_name,'personal',v_avatar,false,v_provider)
  returning * into v_profile;

  return to_jsonb(v_profile);
end
$$;

revoke all on function public.mizona_asegurar_perfil() from public;
grant execute on function public.mizona_asegurar_perfil() to authenticated;

create or replace function public.mizona_completar_perfil_google(
  p_username text,
  p_nombre text,
  p_distrito text default '',
  p_zona text default '',
  p_phone text default '',
  p_terms boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_username text:=lower(trim(coalesce(p_username,'')));
  v_name text:=trim(coalesce(p_nombre,''));
  v_digits text:=regexp_replace(coalesce(p_phone,''),'\D','','g');
  v_profile public.perfiles%rowtype;
begin
  if v_user is null then raise exception 'Debes iniciar sesión'; end if;
  if not p_terms then raise exception 'Debes aceptar los términos para continuar'; end if;
  if v_username !~ '^[a-z0-9_.]{3,24}$' then raise exception 'El nombre de usuario no es válido'; end if;
  if length(v_name) not between 1 and 80 then raise exception 'El nombre visible no es válido'; end if;
  if v_digits<>'' and v_digits !~ '^9[0-9]{8}$' then raise exception 'El celular opcional debe tener 9 dígitos y empezar con 9'; end if;
  if exists(select 1 from public.perfiles p where p.username=v_username and p.id<>v_user) then
    raise exception 'Ese nombre de usuario ya está ocupado';
  end if;

  update public.perfiles set
    username=v_username,
    nombre_visible=v_name,
    distrito=nullif(trim(coalesce(p_distrito,'')),''),
    zona=nullif(trim(coalesce(p_zona,'')),''),
    telefono_contacto=case when v_digits='' then null else '+51'||v_digits end,
    perfil_completo=true,
    proveedor_registro='google',
    terminos_aceptados_en=coalesce(terminos_aceptados_en,now()),
    actualizado_en=now()
  where id=v_user
  returning * into v_profile;

  if not found then raise exception 'No existe el perfil. Vuelve a iniciar sesión.'; end if;
  return to_jsonb(v_profile);
end
$$;

revoke all on function public.mizona_completar_perfil_google(text,text,text,text,text,boolean) from public;
grant execute on function public.mizona_completar_perfil_google(text,text,text,text,text,boolean) to authenticated;

-- Identifica el proveedor real de cuentas ya existentes sin alterar su perfil.
update public.perfiles p
set proveedor_registro=lower(coalesce(u.raw_app_meta_data->>'provider',p.proveedor_registro,'email'))
from auth.users u
where u.id=p.id;

commit;

select 'OK: Google habilitado; perfiles automáticos y onboarding listos' as resultado;
