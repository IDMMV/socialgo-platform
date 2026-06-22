# SOCIALGO — FASE 5: CLIPS REALES

## Incluye

- Subir o grabar clips desde el celular.
- Duración máxima de 60 segundos.
- Tamaño máximo de 25 MB.
- Formatos MP4, WebM y MOV.
- Reproducción vertical automática.
- Deslizar hacia arriba para ver el siguiente.
- Tocar el video para pausar o reproducir.
- Me gusta.
- Comentarios.
- Guardados.
- Compartir.
- Descarga solo cuando el creador lo autorice.
- Visitantes pueden ver, pero deben registrarse para interactuar.

## 1. Ejecutar SQL

En Supabase SQL Editor ejecuta:

`sql/schema_fase5.sql`

## 2. Reemplazar en GitHub

- `clips.html`
- `css/global.css`
- `service-worker.js`

## 3. Agregar en GitHub

- `js/clips.js`
- `sql/schema_fase5.sql`

## 4. Esperar Vercel

Espera que el despliegue aparezca como `Ready`.

Después abre:

`https://socialgo-platform.vercel.app/clips.html`

Usa una ventana de incógnito o fuerza la actualización para evitar caché antigua.

## Importante

Esta fase usa Supabase Storage para pruebas iniciales.
Los filtros faciales, música, recorte, subtítulos y moderación automática
se incorporarán en fases posteriores con servicios especializados de video.
