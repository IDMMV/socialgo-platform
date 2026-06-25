-- ============================================================
-- MiZona.pe V6.2 — Desplazamiento y control de publicaciones
-- Reglas:
--   1) El autor modifica solo durante los primeros 5 minutos.
--   2) El autor puede borrar en cualquier momento.
--   3) Administradores y service_role conservan tareas de moderación.
-- Ejecutar una sola vez en Supabase -> SQL Editor.
-- ============================================================

begin;

alter table public.publicaciones enable row level security;

-- Quitar políticas UPDATE/DELETE anteriores para que ninguna política
-- permisiva pueda saltarse el límite de 5 minutos.
do $$
declare r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname='public'
      and tablename='publicaciones'
      and upper(cmd) in ('UPDATE','DELETE','ALL')
  loop
    execute format('drop policy if exists %I on public.publicaciones', r.policyname);
  end loop;
end $$;

-- Asegurar que la creación propia siga habilitada aunque antes existiera
-- una política FOR ALL que fue retirada.
drop policy if exists "Autor crea publicación" on public.publicaciones;
create policy "Autor crea publicación"
on public.publicaciones
for insert to authenticated
with check (autor_id=auth.uid());

create policy "Autor edita publicación durante 5 minutos"
on public.publicaciones
for update to authenticated
using (
  (autor_id=auth.uid() and creado_en >= now()-interval '5 minutes')
  or public.is_admin()
)
with check (
  (autor_id=auth.uid() and creado_en >= now()-interval '5 minutes')
  or public.is_admin()
);

create policy "Autor elimina publicación en cualquier momento"
on public.publicaciones
for delete to authenticated
using (autor_id=auth.uid() or public.is_admin());

-- Seguridad adicional: aunque apareciera otra política en el futuro,
-- el trigger impide que un usuario común edite después de 5 minutos
-- o cambie campos reservados para moderación.
create or replace function public.mizona_controlar_edicion_publicacion()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_role text:=coalesce(auth.role(),'');
  v_admin boolean:=false;
begin
  if current_user in ('postgres','supabase_admin') or v_role='service_role' then
    new.actualizado_en=now();
    return new;
  end if;

  v_admin:=coalesce(public.is_admin(),false);
  if v_admin then
    new.actualizado_en=now();
    return new;
  end if;

  if auth.uid() is null or old.autor_id is distinct from auth.uid() then
    raise exception using errcode='42501',message='Solo el autor puede modificar esta publicación.';
  end if;

  if clock_timestamp() > old.creado_en + interval '5 minutes' then
    raise exception using errcode='42501',message='El plazo de 5 minutos para modificar la publicación ya terminó.';
  end if;

  -- El autor puede cambiar únicamente el contenido visible de la publicación.
  -- No puede cambiar autor, fecha original, estado de moderación ni archivo.
  if (to_jsonb(new)-array[
        'titulo','contenido','categoria_publicacion','ubicacion_texto',
        'fecha_evento','visibilidad','permitir_comentarios','actualizado_en'
      ]::text[])
     is distinct from
     (to_jsonb(old)-array[
        'titulo','contenido','categoria_publicacion','ubicacion_texto',
        'fecha_evento','visibilidad','permitir_comentarios','actualizado_en'
      ]::text[])
  then
    raise exception using errcode='42501',message='No puedes modificar campos reservados de la publicación.';
  end if;

  new.actualizado_en=now();
  return new;
end;
$$;

drop trigger if exists mizona_limite_edicion_publicacion on public.publicaciones;
create trigger mizona_limite_edicion_publicacion
before update on public.publicaciones
for each row execute function public.mizona_controlar_edicion_publicacion();

commit;

select
  'OK: publicaciones editables durante 5 minutos y borrables por su autor en cualquier momento' as resultado;
