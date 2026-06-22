# SOCIALGO — FASE 8.5A: EDITOR DE CLIPS

## Incluye

- Grabar video desde la cámara.
- Elegir video del celular o computadora.
- Videos publicados de máximo 3 minutos.
- Videos originales de hasta 250 MB.
- Línea de tiempo con miniaturas.
- Controles de inicio y final.
- Recorte del fragmento antes de subir.
- Vista previa.
- Silenciar audio.
- Elegir portada.
- Agregar texto descriptivo.
- Progreso de procesamiento y carga.

## Importante

El procesamiento usa FFmpeg WebAssembly dentro del navegador.
En celulares con poca memoria, usa archivos de menor resolución o duración.

El primer uso del editor necesita conexión a Internet para cargar el motor de edición.

## GitHub Desktop

1. Descomprime el ZIP.
2. Copia y reemplaza todo.
3. Summary: `Agregar editor de clips SocialGo 8.5A`.
4. Commit to main.
5. Push origin.

## Supabase

Ejecuta:

`sql/schema_fase8_5a.sql`

## Pruebas

1. Selecciona un video corto.
2. Ajusta inicio y final.
3. Publica.
4. Prueba un video de más de 3 minutos.
5. Elige un fragmento de máximo 3 minutos.
6. Comprueba que solo se publique el fragmento.
