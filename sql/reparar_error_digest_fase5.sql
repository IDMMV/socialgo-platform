-- ================================================================
-- MiZona.pe · Reparación Fase 5 · error digest()
-- Ejecutar primero este archivo y después volver a ejecutar el SQL
-- completo fase5_alertas_inteligentes_corregido_v2.sql.
-- ================================================================

create or replace function public.mizona_coordenada_publica(
  p_latitud numeric,
  p_longitud numeric,
  p_precision text,
  p_semilla text
)
returns table(latitud numeric, longitud numeric)
language plpgsql
immutable
set search_path = public
as $$
declare
  v_radio numeric := 0;
  v_hash bytea;
  v_angulo numeric;
  v_factor numeric;
  v_lat_delta numeric;
  v_lon_delta numeric;
begin
  if p_latitud is null or p_longitud is null then
    return query select null::numeric, null::numeric;
    return;
  end if;

  if p_precision = 'exacta' then
    return query select round(p_latitud,7), round(p_longitud,7);
    return;
  elsif p_precision = 'aprox_50m' then
    v_radio := 50;
  elsif p_precision = 'aprox_150m' then
    v_radio := 150;
  else
    v_radio := 450;
  end if;

  -- Hash determinístico sin depender de pgcrypto ni del esquema extensions.
  v_hash := decode(md5(coalesce(p_semilla,'mizona')), 'hex');
  v_angulo := (get_byte(v_hash,0)::numeric / 255) * 2 * pi();
  v_factor := 0.65 + (get_byte(v_hash,1)::numeric / 255) * 0.35;
  v_lat_delta := (v_radio * v_factor / 111320) * sin(v_angulo);
  v_lon_delta := (v_radio * v_factor / greatest(111320 * abs(cos(radians(p_latitud))), 1000)) * cos(v_angulo);

  return query select
    round((p_latitud + v_lat_delta)::numeric,7),
    round((p_longitud + v_lon_delta)::numeric,7);
end;
$$;

select 'Función mizona_coordenada_publica reparada correctamente' as resultado;
