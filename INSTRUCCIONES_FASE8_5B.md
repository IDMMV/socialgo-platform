# SOCIALGO — FASE 8.5B

## Mejoras de velocidad y estabilidad

- Los MP4 de hasta 3 minutos, sin recorte ni silencio, se suben directamente.
- FFmpeg solo se usa cuando realmente hace falta recortar o quitar audio.
- El editor se precarga en segundo plano para videos largos.
- Carga reanudable por bloques de 6 MB.
- Reintentos automáticos cuando falla la conexión.
- `Esc` no cierra el editor mientras se procesa o sube.
- Aviso antes de abandonar la página durante una carga.

## Texto estilo TikTok

- Texto dentro del video.
- Se puede arrastrar a cualquier zona.
- Color configurable.
- Fondo oscuro, claro, transparente, morado o rosado.
- Tamaño configurable.
- Se conserva la posición cuando se publica.

## GitHub Desktop

1. Descomprime y reemplaza todo.
2. Summary: `Mejorar editor de clips SocialGo 8.5B`.
3. Commit to main.
4. Push origin.

## Supabase

Ejecuta:

`sql/schema_fase8_5b.sql`

También debe estar ejecutado previamente:

`sql/schema_fase8_5a.sql`
