# MiZona.pe V6.2 — scroll y administración de publicaciones

## Qué corrige
- La página `usuario.html` vuelve a desplazarse normalmente en computadora y celular.
- La barra vertical del navegador vuelve a mostrarse.
- El autor ve **Modificar** durante los primeros 5 minutos.
- Después de 5 minutos aparece **Edición cerrada**.
- El autor ve **Borrar** sin límite de tiempo.
- La regla de 5 minutos se aplica también en Supabase, no solo en la pantalla.

## Instalación
1. En Supabase abre **SQL Editor → New query**.
2. Ejecuta completo `MiZona_SQL_V6_2_PUBLICACIONES_5_MIN.sql`.
3. En GitHub reemplaza estos archivos:
   - `usuario.html`
   - `css/perfiles-mizona.css`
   - `js/perfil-publico.js`
   - `js/publicaciones.js`
   - `service-worker.js`
4. Espera el despliegue de Vercel.
5. Abre `mizona.pe`, presiona `Ctrl + F5` en PC. En la PWA móvil ciérrala y vuelve a abrirla.

## Prueba
1. Publica un texto nuevo.
2. Abre tu perfil: debe aparecer **Modificar · 5 min** y **Borrar**.
3. Modifica el texto y guarda.
4. Prueba borrar una publicación antigua.
5. Verifica que la página permita bajar hasta todas las publicaciones.
