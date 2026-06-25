# MiZona.pe — instalación de mejoras integradas

Esta versión parte de **MIZONA.zip** (la web actual) e incorpora las propuestas contenidas en **MiZona_Mejoras_Completas(1).zip**, adaptadas a la estructura real de la base de datos.

## Mejoras incorporadas

- Modo día y noche, conservando el modo día como diseño inicial.
- Sistema de niveles y puntos para la participación vecinal.
- Comentarios en la página individual de cada alerta.
- Mapa de calor histórico por mes, sin datos ficticios.
- Página pública por distrito con alertas, servicios, estadísticas y resumen semanal.
- Barra lateral y estilos visuales más uniformes.
- Dictado por voz y selector de ubicación conservados en el reporte de alertas.
- Recuperación de contraseña, acceso y archivos actuales preservados.
- Caché PWA actualizada para cargar los nuevos archivos.

## Corrección del error SQL

La propuesta original consultaba una columna inexistente:

```sql
servicios_mizona.activo
```

La tabla real usa:

```sql
estado = 'activo'
disponible = true
```

El archivo `sql/mejoras_v2.sql` ya está corregido y también puede completar una instalación parcial del SQL anterior.

## Paso 1 — copia de seguridad

Antes de reemplazar archivos, guarda una copia de tu repositorio actual.

## Paso 2 — ejecutar SQL

En Supabase abre:

```text
SQL Editor → New query
```

Copia y ejecuta **todo** el archivo:

```text
sql/mejoras_v2.sql
```

No ejecutes el SQL original de la propuesta. El resultado esperado es:

```text
Mejoras v2 instaladas correctamente: niveles, comentarios, mapa de calor y distritos
```

Este script está envuelto en una transacción: si Supabase encuentra un error, no deja la instalación nueva a medias.

## Paso 3 — reemplazar el proyecto

1. Descomprime el ZIP completo.
2. Abre la carpeta `MiZona_Mejoras_Integradas`.
3. Copia **todo lo que está dentro**.
4. Pégalo dentro de la carpeta de tu repositorio.
5. Acepta reemplazar los archivos.

En GitHub Desktop usa este mensaje:

```text
Integrar niveles, comentarios, mapa de calor y páginas de distrito
```

Después presiona:

```text
Commit to main
Push origin
```

## Paso 4 — actualizar la PWA

Después del despliegue de Vercel:

1. Abre `https://mizona.pe`.
2. En computadora usa `Ctrl + F5`.
3. Cierra por completo la aplicación instalada en el celular y vuelve a abrirla.
4. Si continúa una versión antigua, elimina el acceso instalado y vuelve a instalar MiZona.

La caché nueva se llama:

```text
mizona-v6.0-mejoras-integradas
```

## Pruebas recomendadas

1. Abre **Mi perfil** y comprueba nivel, puntos, estadísticas y cambio de tema.
2. Abre una alerta desde **Ver detalles** y publica un comentario con otra cuenta.
3. En **Mapa**, abre el mapa de calor y cambia el mes.
4. Desde Inicio, pulsa el nombre de la zona para abrir `distrito.html`.
5. Comprueba que la página del distrito muestre alertas y servicios reales.
6. Prueba la web como invitado y como usuario registrado.
7. Prueba en computadora y celular.

## Archivos principales agregados

```text
distrito.html
css/mejoras-v2.css
css/mizona-sidebar.css
js/tema-mizona.js
js/niveles-mizona.js
js/comentarios-alerta.js
js/mapa-calor.js
js/voz-mizona.js
sql/mejoras_v2.sql
```
