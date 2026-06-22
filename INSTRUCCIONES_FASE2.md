# SOCIALGO FASE 2 COMPLETA Y CORREGIDA

Este paquete reemplaza la Fase 1 completa.

## Qué hacer

1. Descomprime el ZIP.
2. En GitHub, reemplaza todos los archivos de la raíz y de las carpetas `js`, `css` y `sql`.
3. No dejes archivos duplicados como `app (1).js`.
4. El archivo correcto debe quedar exactamente en `js/app.js`.
5. Reemplaza también `admin.html`, `js/brand.js` y `service-worker.js`.
6. Espera a que Vercel muestre el último despliegue como `Ready`.
7. Abre la web en modo incógnito o presiona `Ctrl + Shift + R`.

## Archivos especialmente importantes

- `js/app.js`: ya no utiliza `socialgo_demo_user`.
- `js/brand.js`: guarda y lee la marca desde Supabase.
- `admin.html`: valida sesión y rol.
- `service-worker.js`: usa caché `socialgo-v0.2.2`.
- `sql/schema_fase2.sql`: estructura y RLS de Fase 2.

## Prueba

- `/registro.html`
- `/login.html`
- `/perfil.html`
- `/admin.html`

Las publicaciones reales se implementarán en Fase 3.
