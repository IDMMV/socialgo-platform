# Corrección SQL V3

Corrige:

1. Nombres de parámetros de `mizona_distance_meters`.
2. Creación faltante de `public.solicitudes_amistad` antes de sus dependencias.
3. Recreación segura de `perfiles_publicos` y `publicaciones_feed` cuando existían con una estructura anterior.

## Orden

1. Ejecutar `sql/MiZona_SQL_REPARAR_AMISTADES.sql`.
2. Ejecutar `sql/MiZona_SQL_FINAL_COMPLETO.sql` completo.
