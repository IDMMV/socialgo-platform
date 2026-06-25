-- ============================================================
-- MiZona.pe — Mejoras completas v2 (CORREGIDO)
-- Compatible con la estructura actual de MIZONA.zip
-- Incluye: niveles, comentarios, tema día/noche, resúmenes,
-- mapa de calor, estadísticas por distrito y acceso público.
-- Ejecutar UNA sola vez en Supabase > SQL Editor > New query.
-- El script es reejecutable y no elimina datos existentes.
-- ============================================================

begin;

-- ---------------------------------------------------------------------
-- 1. PERFIL, NIVELES Y CONTADORES
-- ---------------------------------------------------------------------
alter table public.perfiles
  add column if not exists nivel integer not null default 1,
  add column if not exists puntos_total integer not null default 0,
  add column if not exists puntos_bonus integer not null default 0,
  add column if not exists tema text not null default 'dia',
  add column if not exists es_publico boolean not null default true,
  add column if not exists total_alertas integer not null default 0,
  add column if not exists total_confirmaciones_dadas integer not null default 0,
  add column if not exists total_servicios integer not null default 0,
  add column if not exists total_comentarios integer not null default 0,
  add column if not exists ultima_actividad timestamptz default now();

do $$ begin
  alter table public.perfiles add constraint perfiles_nivel_mz_check check (nivel between 1 and 5);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.perfiles add constraint perfiles_tema_mz_check check (tema in ('dia','noche'));
exception when duplicate_object then null; end $$;

alter table public.perfiles alter column tema set default 'dia';

create or replace function public.calcular_nivel(p_puntos integer)
returns integer
language sql
immutable
as $$
  select case
    when coalesce(p_puntos,0) >= 500 then 5
    when coalesce(p_puntos,0) >= 200 then 4
    when coalesce(p_puntos,0) >= 75  then 3
    when coalesce(p_puntos,0) >= 20  then 2
    else 1
  end;
$$;

-- ---------------------------------------------------------------------
-- 2. COMENTARIOS EN ALERTAS
-- ---------------------------------------------------------------------
create table if not exists public.comentarios_alerta (
  id uuid primary key default gen_random_uuid(),
  alerta_id uuid not null references public.alertas(id) on delete cascade,
  autor_id uuid not null references public.perfiles(id) on delete cascade,
  contenido text not null check (char_length(btrim(contenido)) between 2 and 500),
  es_anonimo boolean not null default false,
  likes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists comentarios_alerta_alerta_idx
  on public.comentarios_alerta(alerta_id, created_at);
create index if not exists comentarios_alerta_autor_idx
  on public.comentarios_alerta(autor_id, created_at desc);

create or replace function public.mz_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists comentarios_alerta_touch on public.comentarios_alerta;
create trigger comentarios_alerta_touch
before update on public.comentarios_alerta
for each row execute function public.mz_touch_updated_at();

alter table public.comentarios_alerta enable row level security;
alter table public.comentarios_alerta replica identity full;
-- Limpia también los nombres usados por la propuesta original parcialmente ejecutada.
drop policy if exists "comentarios_select" on public.comentarios_alerta;
drop policy if exists "comentarios_insert" on public.comentarios_alerta;
drop policy if exists "comentarios_delete" on public.comentarios_alerta;
drop policy if exists comentarios_alerta_select on public.comentarios_alerta;
drop policy if exists comentarios_alerta_insert on public.comentarios_alerta;
drop policy if exists comentarios_alerta_update on public.comentarios_alerta;
drop policy if exists comentarios_alerta_delete on public.comentarios_alerta;
create policy comentarios_alerta_select
  on public.comentarios_alerta for select to anon, authenticated
  using (true);
create policy comentarios_alerta_insert
  on public.comentarios_alerta for insert to authenticated
  with check (auth.uid() = autor_id);
create policy comentarios_alerta_update
  on public.comentarios_alerta for update to authenticated
  using (auth.uid() = autor_id)
  with check (auth.uid() = autor_id);
create policy comentarios_alerta_delete
  on public.comentarios_alerta for delete to authenticated
  using (auth.uid() = autor_id);

-- Habilita actualizaciones en vivo. Si la tabla ya estaba publicada, no falla.
do $$
begin
  alter publication supabase_realtime add table public.comentarios_alerta;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- Recalcula contadores desde las tablas reales. Así evita duplicar puntos
-- si el SQL se ejecuta nuevamente y también corrige eliminaciones.
create or replace function public.mz_recalcular_perfil_participacion(p_usuario uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alertas integer := 0;
  v_confirmaciones integer := 0;
  v_servicios integer := 0;
  v_comentarios integer := 0;
  v_bonus integer := 0;
  v_puntos integer := 0;
begin
  if p_usuario is null then return; end if;

  select count(*)::integer into v_alertas
    from public.alertas where autor_id = p_usuario;
  select count(*)::integer into v_confirmaciones
    from public.alerta_confirmaciones where usuario_id = p_usuario;
  select count(*)::integer into v_servicios
    from public.servicios_mizona
    where propietario_id = p_usuario and estado = 'activo';
  select count(*)::integer into v_comentarios
    from public.comentarios_alerta where autor_id = p_usuario;
  select coalesce(puntos_bonus,0) into v_bonus
    from public.perfiles where id = p_usuario;

  v_puntos := v_alertas * 10 + v_confirmaciones * 3 +
              v_servicios * 15 + v_comentarios * 2 + coalesce(v_bonus,0);

  update public.perfiles
     set total_alertas = v_alertas,
         total_confirmaciones_dadas = v_confirmaciones,
         total_servicios = v_servicios,
         total_comentarios = v_comentarios,
         puntos_total = v_puntos,
         nivel = public.calcular_nivel(v_puntos),
         ultima_actividad = now()
   where id = p_usuario;
end;
$$;

create or replace function public.mz_trigger_recalcular_participacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new jsonb;
  v_old jsonb;
  v_nuevo uuid;
  v_anterior uuid;
begin
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;

  v_nuevo := coalesce(
    nullif(v_new->>'autor_id','')::uuid,
    nullif(v_new->>'usuario_id','')::uuid,
    nullif(v_new->>'propietario_id','')::uuid
  );
  v_anterior := coalesce(
    nullif(v_old->>'autor_id','')::uuid,
    nullif(v_old->>'usuario_id','')::uuid,
    nullif(v_old->>'propietario_id','')::uuid
  );

  perform public.mz_recalcular_perfil_participacion(coalesce(v_nuevo,v_anterior));
  if v_nuevo is not null and v_anterior is not null and v_nuevo <> v_anterior then
    perform public.mz_recalcular_perfil_participacion(v_anterior);
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

-- Retira los disparadores incrementales de la propuesta original si llegaron a crearse.
drop trigger if exists trg_puntos_alerta on public.alertas;
drop trigger if exists trg_puntos_confirmacion on public.alerta_confirmaciones;
drop trigger if exists trg_puntos_comentario on public.comentarios_alerta;

drop trigger if exists trg_mz_participacion_alertas on public.alertas;
create trigger trg_mz_participacion_alertas
  after insert or update or delete on public.alertas
  for each row execute function public.mz_trigger_recalcular_participacion();

drop trigger if exists trg_mz_participacion_confirmaciones on public.alerta_confirmaciones;
create trigger trg_mz_participacion_confirmaciones
  after insert or update or delete on public.alerta_confirmaciones
  for each row execute function public.mz_trigger_recalcular_participacion();

drop trigger if exists trg_mz_participacion_servicios on public.servicios_mizona;
create trigger trg_mz_participacion_servicios
  after insert or update or delete on public.servicios_mizona
  for each row execute function public.mz_trigger_recalcular_participacion();

drop trigger if exists trg_mz_participacion_comentarios on public.comentarios_alerta;
create trigger trg_mz_participacion_comentarios
  after insert or update or delete on public.comentarios_alerta
  for each row execute function public.mz_trigger_recalcular_participacion();

-- ---------------------------------------------------------------------
-- 3. RESÚMENES SEMANALES
-- ---------------------------------------------------------------------
create table if not exists public.resumenes_semanales (
  id uuid primary key default gen_random_uuid(),
  distrito text not null,
  semana_inicio date not null,
  semana_fin date not null,
  total_alertas integer not null default 0,
  alertas_por_categoria jsonb not null default '{}'::jsonb,
  total_vecinos_activos integer not null default 0,
  alerta_mas_confirmada jsonb,
  resumen_texto text,
  enviado_push boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(distrito, semana_inicio)
);

alter table public.resumenes_semanales
  add column if not exists updated_at timestamptz not null default now();

alter table public.resumenes_semanales enable row level security;
drop policy if exists resumenes_semanales_select on public.resumenes_semanales;
create policy resumenes_semanales_select
  on public.resumenes_semanales for select to anon, authenticated using (true);

create or replace function public.generar_resumen_semanal(p_distrito text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inicio date := date_trunc('week', current_date)::date;
  v_fin date := (date_trunc('week', current_date) + interval '6 days')::date;
  v_total integer := 0;
  v_categorias jsonb := '{}'::jsonb;
  v_vecinos integer := 0;
  v_top_alerta jsonb;
  v_texto text;
begin
  if nullif(btrim(p_distrito),'') is null then
    raise exception 'Distrito requerido';
  end if;

  select count(*)::integer into v_total
  from public.alertas
  where lower(distrito) = lower(btrim(p_distrito))
    and estado in ('reportada','en_revision','verificada','resuelta')
    and created_at >= v_inicio
    and created_at < v_fin + interval '1 day';

  select coalesce(jsonb_object_agg(categoria,cantidad),'{}'::jsonb)
  into v_categorias
  from (
    select categoria, count(*)::integer cantidad
    from public.alertas
    where lower(distrito) = lower(btrim(p_distrito))
      and estado in ('reportada','en_revision','verificada','resuelta')
      and created_at >= v_inicio
      and created_at < v_fin + interval '1 day'
    group by categoria
  ) q;

  select count(distinct autor_id)::integer into v_vecinos
  from public.alertas
  where lower(distrito) = lower(btrim(p_distrito))
    and created_at >= v_inicio
    and created_at < v_fin + interval '1 day';

  select jsonb_build_object(
           'id', id,
           'titulo', titulo,
           'confirmaciones', total_confirmaciones,
           'categoria', categoria
         )
    into v_top_alerta
  from public.alertas
  where lower(distrito) = lower(btrim(p_distrito))
    and estado in ('reportada','en_revision','verificada','resuelta')
    and created_at >= v_inicio
    and created_at < v_fin + interval '1 day'
  order by total_confirmaciones desc, created_at desc
  limit 1;

  v_texto := format(
    'Esta semana se registraron %s alertas y participaron %s vecinos en %s.',
    v_total, v_vecinos, btrim(p_distrito)
  );

  insert into public.resumenes_semanales(
    distrito, semana_inicio, semana_fin, total_alertas,
    alertas_por_categoria, total_vecinos_activos,
    alerta_mas_confirmada, resumen_texto, updated_at
  ) values (
    btrim(p_distrito), v_inicio, v_fin, v_total,
    v_categorias, v_vecinos, v_top_alerta, v_texto, now()
  )
  on conflict(distrito,semana_inicio) do update set
    semana_fin = excluded.semana_fin,
    total_alertas = excluded.total_alertas,
    alertas_por_categoria = excluded.alertas_por_categoria,
    total_vecinos_activos = excluded.total_vecinos_activos,
    alerta_mas_confirmada = excluded.alerta_mas_confirmada,
    resumen_texto = excluded.resumen_texto,
    updated_at = now();

  return json_build_object(
    'distrito', btrim(p_distrito),
    'semana_inicio', v_inicio,
    'semana_fin', v_fin,
    'total_alertas', v_total,
    'vecinos_activos', v_vecinos,
    'por_categoria', v_categorias,
    'top_alerta', v_top_alerta,
    'resumen', v_texto
  );
end;
$$;

create or replace function public.mz_trigger_resumen_semanal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nuevo text;
  v_anterior text;
begin
  if tg_op <> 'DELETE' then v_nuevo := nullif(btrim(new.distrito),''); end if;
  if tg_op <> 'INSERT' then v_anterior := nullif(btrim(old.distrito),''); end if;
  if v_nuevo is not null then perform public.generar_resumen_semanal(v_nuevo); end if;
  if v_anterior is not null and lower(v_anterior) <> lower(coalesce(v_nuevo,'')) then
    perform public.generar_resumen_semanal(v_anterior);
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists trg_resumen_semanal_alertas on public.alertas;
create trigger trg_resumen_semanal_alertas
  after insert or update or delete on public.alertas
  for each row execute function public.mz_trigger_resumen_semanal();

-- ---------------------------------------------------------------------
-- 4. MAPA DE CALOR HISTÓRICO
-- ---------------------------------------------------------------------
create table if not exists public.estadisticas_zona (
  id uuid primary key default gen_random_uuid(),
  distrito text not null,
  lat_approx numeric(8,4) not null,
  lng_approx numeric(8,4) not null,
  mes date not null,
  total_alertas integer not null default 0,
  alertas_robo integer not null default 0,
  alertas_accidente integer not null default 0,
  alertas_agua integer not null default 0,
  alertas_mascota integer not null default 0,
  intensidad numeric(4,3) not null default 0,
  updated_at timestamptz not null default now(),
  unique(distrito,lat_approx,lng_approx,mes)
);

create index if not exists estadisticas_zona_mes_idx on public.estadisticas_zona(mes);
create index if not exists estadisticas_zona_distrito_idx on public.estadisticas_zona(distrito);
alter table public.estadisticas_zona enable row level security;
drop policy if exists estadisticas_zona_select on public.estadisticas_zona;
create policy estadisticas_zona_select
  on public.estadisticas_zona for select to anon, authenticated using (true);

create or replace function public.mz_refrescar_celda_calor(
  p_distrito text,
  p_lat numeric,
  p_lng numeric,
  p_mes date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lat numeric(8,4);
  v_lng numeric(8,4);
  v_total integer;
  v_robo integer;
  v_accidente integer;
  v_agua integer;
  v_mascota integer;
begin
  if p_lat is null or p_lng is null or p_mes is null then return; end if;
  v_lat := round(p_lat,2);
  v_lng := round(p_lng,2);

  select
    count(*)::integer,
    count(*) filter (where categoria='robo')::integer,
    count(*) filter (where categoria='accidente')::integer,
    count(*) filter (where categoria in ('agua','luz'))::integer,
    count(*) filter (where categoria='mascota')::integer
  into v_total,v_robo,v_accidente,v_agua,v_mascota
  from public.alertas
  where lower(coalesce(distrito,'Sin distrito')) = lower(coalesce(p_distrito,'Sin distrito'))
    and round(latitud::numeric,2) = v_lat
    and round(longitud::numeric,2) = v_lng
    and date_trunc('month',created_at)::date = p_mes
    and estado in ('reportada','en_revision','verificada','resuelta');

  if coalesce(v_total,0)=0 then
    delete from public.estadisticas_zona
    where lower(distrito)=lower(coalesce(p_distrito,'Sin distrito'))
      and lat_approx=v_lat and lng_approx=v_lng and mes=p_mes;
    return;
  end if;

  insert into public.estadisticas_zona(
    distrito,lat_approx,lng_approx,mes,total_alertas,
    alertas_robo,alertas_accidente,alertas_agua,alertas_mascota,
    intensidad,updated_at
  ) values (
    coalesce(nullif(btrim(p_distrito),''),'Sin distrito'),v_lat,v_lng,p_mes,v_total,
    v_robo,v_accidente,v_agua,v_mascota,
    least(1.0,v_total::numeric/20.0),now()
  )
  on conflict(distrito,lat_approx,lng_approx,mes) do update set
    total_alertas=excluded.total_alertas,
    alertas_robo=excluded.alertas_robo,
    alertas_accidente=excluded.alertas_accidente,
    alertas_agua=excluded.alertas_agua,
    alertas_mascota=excluded.alertas_mascota,
    intensidad=excluded.intensidad,
    updated_at=now();
end;
$$;

create or replace function public.mz_trigger_estadisticas_zona()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE','DELETE') and old.latitud is not null and old.longitud is not null then
    perform public.mz_refrescar_celda_calor(
      old.distrito,old.latitud,old.longitud,date_trunc('month',old.created_at)::date
    );
  end if;
  if tg_op in ('INSERT','UPDATE') and new.latitud is not null and new.longitud is not null then
    perform public.mz_refrescar_celda_calor(
      new.distrito,new.latitud,new.longitud,date_trunc('month',new.created_at)::date
    );
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists trg_estadisticas_zona on public.alertas;
create trigger trg_estadisticas_zona
  after insert or update or delete on public.alertas
  for each row execute function public.mz_trigger_estadisticas_zona();

-- Carga inicial de las alertas existentes.
insert into public.estadisticas_zona(
  distrito,lat_approx,lng_approx,mes,total_alertas,
  alertas_robo,alertas_accidente,alertas_agua,alertas_mascota,
  intensidad,updated_at
)
select
  coalesce(nullif(btrim(distrito),''),'Sin distrito'),
  round(latitud::numeric,2)::numeric(8,4),
  round(longitud::numeric,2)::numeric(8,4),
  date_trunc('month',created_at)::date,
  count(*)::integer,
  count(*) filter(where categoria='robo')::integer,
  count(*) filter(where categoria='accidente')::integer,
  count(*) filter(where categoria in ('agua','luz'))::integer,
  count(*) filter(where categoria='mascota')::integer,
  least(1.0,count(*)::numeric/20.0),
  now()
from public.alertas
where latitud is not null and longitud is not null
  and estado in ('reportada','en_revision','verificada','resuelta')
group by 1,2,3,4
on conflict(distrito,lat_approx,lng_approx,mes) do update set
  total_alertas=excluded.total_alertas,
  alertas_robo=excluded.alertas_robo,
  alertas_accidente=excluded.alertas_accidente,
  alertas_agua=excluded.alertas_agua,
  alertas_mascota=excluded.alertas_mascota,
  intensidad=excluded.intensidad,
  updated_at=now();

-- ---------------------------------------------------------------------
-- 5. PÁGINA PÚBLICA DE DISTRITO
-- ---------------------------------------------------------------------
create table if not exists public.distritos_stats (
  id uuid primary key default gen_random_uuid(),
  distrito text not null,
  slug text unique not null,
  descripcion text,
  total_vecinos integer not null default 0,
  total_alertas integer not null default 0,
  total_alertas_mes integer not null default 0,
  total_servicios integer not null default 0,
  indice_seguridad integer not null default 70,
  coordenadas jsonb,
  updated_at timestamptz not null default now()
);

alter table public.distritos_stats enable row level security;
drop policy if exists distritos_stats_select on public.distritos_stats;
create policy distritos_stats_select
  on public.distritos_stats for select to anon, authenticated using (true);

create or replace function public.mz_slug_distrito(p_texto text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(
    lower(translate(coalesce(p_texto,''),
      'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')),
    '[^a-z0-9]+','-','g'
  ));
$$;

create or replace function public.actualizar_stats_distrito(p_distrito text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_distrito text := btrim(p_distrito);
  v_slug text;
  v_alertas_7d integer := 0;
begin
  if nullif(v_distrito,'') is null then return; end if;
  v_slug := public.mz_slug_distrito(v_distrito);

  insert into public.distritos_stats(distrito,slug)
  values(v_distrito,v_slug)
  on conflict(slug) do update set distrito=excluded.distrito;

  select count(*)::integer into v_alertas_7d
  from public.alertas
  where lower(distrito)=lower(v_distrito)
    and estado in ('reportada','en_revision','verificada')
    and created_at >= now()-interval '7 days';

  update public.distritos_stats ds set
    total_vecinos = (
      select count(*)::integer from public.perfiles p
      where lower(coalesce(p.distrito,''))=lower(v_distrito)
    ),
    total_alertas = (
      select count(*)::integer from public.alertas a
      where lower(a.distrito)=lower(v_distrito)
        and a.estado in ('reportada','en_revision','verificada')
    ),
    total_alertas_mes = (
      select count(*)::integer from public.alertas a
      where lower(a.distrito)=lower(v_distrito)
        and a.estado in ('reportada','en_revision','verificada','resuelta')
        and a.created_at >= date_trunc('month',now())
    ),
    total_servicios = (
      select count(*)::integer from public.servicios_mizona s
      where lower(s.distrito)=lower(v_distrito)
        and s.estado='activo' and coalesce(s.disponible,true)=true
    ),
    indice_seguridad = greatest(10,least(100,100-v_alertas_7d*5)),
    updated_at=now()
  where ds.slug=v_slug;
end;
$$;

create or replace function public.mz_trigger_stats_distrito()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new jsonb;
  v_old jsonb;
  v_nuevo text;
  v_anterior text;
begin
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  v_nuevo := nullif(btrim(v_new->>'distrito'),'');
  v_anterior := nullif(btrim(v_old->>'distrito'),'');

  if v_nuevo is not null then perform public.actualizar_stats_distrito(v_nuevo); end if;
  if v_anterior is not null and lower(v_anterior)<>lower(coalesce(v_nuevo,'')) then
    perform public.actualizar_stats_distrito(v_anterior);
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists trg_stats_distrito_alertas on public.alertas;
create trigger trg_stats_distrito_alertas
  after insert or update or delete on public.alertas
  for each row execute function public.mz_trigger_stats_distrito();

drop trigger if exists trg_stats_distrito_perfiles on public.perfiles;
create trigger trg_stats_distrito_perfiles
  after insert or update or delete on public.perfiles
  for each row execute function public.mz_trigger_stats_distrito();

drop trigger if exists trg_stats_distrito_servicios on public.servicios_mizona;
create trigger trg_stats_distrito_servicios
  after insert or update or delete on public.servicios_mizona
  for each row execute function public.mz_trigger_stats_distrito();

insert into public.distritos_stats(distrito,slug,descripcion,coordenadas)
values
 ('Los Olivos','los-olivos','Distrito residencial al norte de Lima.',jsonb_build_object('lat',-11.9533,'lng',-77.0683)),
 ('Ventanilla','ventanilla','Distrito costero de la Provincia Constitucional del Callao.',jsonb_build_object('lat',-11.8756,'lng',-77.1304)),
 ('Callao','callao','Provincia Constitucional del Callao.',jsonb_build_object('lat',-12.0565,'lng',-77.1183)),
 ('Comas','comas','Distrito al norte de Lima.',jsonb_build_object('lat',-11.9381,'lng',-77.0519)),
 ('Independencia','independencia','Distrito al norte de Lima.',jsonb_build_object('lat',-11.9881,'lng',-77.0525)),
 ('San Juan de Miraflores','san-juan-de-miraflores','Distrito al sur de Lima.',jsonb_build_object('lat',-12.1558,'lng',-76.9756)),
 ('Lurigancho-Chosica','lurigancho-chosica','Distrito del este de Lima.',jsonb_build_object('lat',-11.9359,'lng',-76.6970)),
 ('Ate','ate','Distrito del este de Lima.',jsonb_build_object('lat',-12.0265,'lng',-76.9214)),
 ('Carabayllo','carabayllo','Distrito del norte de Lima.',jsonb_build_object('lat',-11.7956,'lng',-77.0482))
on conflict(slug) do update set
  descripcion=coalesce(distritos_stats.descripcion,excluded.descripcion),
  coordenadas=coalesce(distritos_stats.coordenadas,excluded.coordenadas);

-- Backfill de estadísticas y niveles.
do $$
declare r record;
begin
  for r in select id from public.perfiles loop
    perform public.mz_recalcular_perfil_participacion(r.id);
  end loop;
  for r in
    select distinct distrito
    from (
      select distrito from public.perfiles where nullif(btrim(distrito),'') is not null
      union
      select distrito from public.alertas where nullif(btrim(distrito),'') is not null
      union
      select distrito from public.servicios_mizona where nullif(btrim(distrito),'') is not null
      union
      select distrito from public.distritos_stats
    ) d
  loop
    perform public.actualizar_stats_distrito(r.distrito);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6. ACCESO PÚBLICO COMPATIBLE CON LAS COLUMNAS ACTUALES
-- ---------------------------------------------------------------------
drop policy if exists alertas_mejoras_v2_public_select on public.alertas;
create policy alertas_mejoras_v2_public_select
  on public.alertas for select to anon, authenticated
  using (estado in ('reportada','en_revision','verificada','resuelta'));

drop policy if exists servicios_mejoras_v2_public_select on public.servicios_mizona;
create policy servicios_mejoras_v2_public_select
  on public.servicios_mizona for select to anon, authenticated
  using (estado='activo' and coalesce(disponible,true)=true);

-- ---------------------------------------------------------------------
-- 7. PERMISOS
-- ---------------------------------------------------------------------
grant execute on function public.calcular_nivel(integer) to anon, authenticated;
grant execute on function public.generar_resumen_semanal(text) to authenticated;
grant execute on function public.actualizar_stats_distrito(text) to authenticated;
grant select on public.distritos_stats to anon, authenticated;
grant select on public.estadisticas_zona to anon, authenticated;
grant select on public.resumenes_semanales to anon, authenticated;
grant select on public.comentarios_alerta to anon, authenticated;
grant insert,update,delete on public.comentarios_alerta to authenticated;

commit;

select 'Mejoras v2 instaladas correctamente: niveles, comentarios, mapa de calor y distritos' as resultado_final;
