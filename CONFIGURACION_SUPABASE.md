# Configuración de Supabase agregada

Se configuró el proyecto con:

- URL pública de Supabase en `js/env.public.js`.
- Clave publicable en `js/env.public.js`.
- URL y clave publicable en `negocio.html`, donde aún quedaban valores de ejemplo.

La clave usada es una clave **publishable/anon** apta para frontend. No se debe colocar una `service_role` en archivos públicos.

> Importante: esta configuración permite conectar el navegador con Supabase, pero por sí sola no convierte el botón de publicación de ofertas en un guardado real. Ese flujo requiere tabla, políticas RLS y código de inserción/aprobación.
