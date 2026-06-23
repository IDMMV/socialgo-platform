# Instrucciones rápidas — MiZona Fase 2

## Paso 1: subir archivos

Descomprime `MiZona_Fase2_Estable.zip` y copia **el contenido interior** dentro de tu repositorio, aceptando reemplazar los archivos existentes.

En GitHub Desktop usa este mensaje:

`Fase 2: chat corregido y diseño unificado`

Después pulsa:

1. **Commit to main**
2. **Push origin**

## Paso 2: ejecutar el SQL obligatorio

Entra a Supabase:

1. Abre tu proyecto.
2. Entra a **SQL Editor**.
3. Abre el archivo `sql/fase2_mensajeria_y_diseno.sql`.
4. Copia todo su contenido.
5. Pégalo en una consulta nueva.
6. Presiona **Run**.

Sin este paso, la pantalla de mensajes puede seguir mostrando el error de recursión.

## Paso 3: actualizar la página

Cuando Vercel termine el despliegue:

- Presiona `Ctrl + F5` en computadora.
- En celular, cierra todas las pestañas de MiZona y vuelve a abrir.
- Si instalaste la web como aplicación, ciérrala completamente y vuelve a abrirla.

## Paso 4: prueba del chat

Usa dos cuentas distintas:

1. Una cuenta publica un servicio.
2. La segunda cuenta entra a Servicios y pulsa **Contactar**.
3. Envía un mensaje.
4. Abre la otra cuenta y revisa Mensajes.

No pruebes Contactar sobre un servicio que pertenece a la misma cuenta, porque MiZona lo bloqueará correctamente.
