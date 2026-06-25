# MiZona.pe — Instalación de la web final integrada

Esta entrega integra el modelo definitivo de perfiles, publicaciones, seguimiento y privacidad de alertas sobre la versión de MiZona con cercanía inicial de 500 metros.

## 1. Antes de instalar

1. Descarga o duplica tu repositorio actual como copia de seguridad.
2. No borres tus variables públicas existentes de `js/env.public.js`.
3. Confirma que el dominio de producción continúa siendo `https://mizona.pe`.
4. Usa una sola de las dos opciones de SQL indicadas más abajo.

## 2. Subir la web a GitHub y Vercel

1. Descomprime `MiZona_WEB_FINAL_Completa.zip`.
2. Copia **todo el contenido interior** de la carpeta descomprimida sobre la raíz del repositorio.
3. Acepta reemplazar los archivos existentes.
4. En GitHub Desktop escribe como resumen del cambio:

   `MiZona final: perfiles, publicaciones, seguidores y alertas protegidas`

5. Presiona **Commit to main** y luego **Push origin**.
6. Espera a que Vercel termine el despliegue.

## 3. SQL que debes ejecutar

### Opción A — Ya instalaste la versión de cercanía de 500 metros

Ejecuta únicamente:

`MiZona_SQL_Perfiles_Publicaciones_Final.sql`

Este archivo agrega las funciones nuevas sin repetir toda la instalación anterior.

### Opción B — Todavía no ejecutaste el SQL total de la versión de 500 metros

Ejecuta únicamente:

`MiZona_SQL_FINAL_COMPLETO.sql`

Este archivo reúne la actualización anterior y la nueva integración final.

> No ejecutes los dos archivos uno detrás del otro. Elige A o B según el estado de tu base de datos.

## 4. Qué quedó integrado

### Perfiles públicos diferenciados

- Vecino.
- Profesional aprobado.
- Negocio aprobado.
- Institución autorizada.
- Organización vecinal aprobada.

Cada perfil tiene encabezado, portada, fotografía, biografía, estadísticas, pestañas y contenido apropiado para su tipo.

### Publicaciones normales

Las publicaciones normales sí muestran la identidad pública del autor y pueden permanecer en su perfil:

- Consejos y recomendaciones.
- Fotografías de la zona.
- Eventos y actividades.
- Trabajos realizados.
- Productos y novedades.
- Comunicados y campañas.

### Alertas sensibles

Los reportes de robo, violencia y otras situaciones de riesgo continúan separados de las publicaciones normales. En el mapa y en alertas se muestran como:

`Reportado por un vecino verificado · identidad protegida`

No se publica el nombre, la fotografía, el teléfono ni el punto desde donde la persona realizó el reporte.

### Seguimiento y privacidad

- Perfil público: se puede seguir inmediatamente.
- Perfil privado: se envía una solicitud de seguimiento.
- El propietario puede aceptar, rechazar o eliminar seguidores.
- El usuario puede impedir seguidores desde su configuración.
- Las publicaciones para seguidores o amigos se protegen con políticas RLS.

### Crear publicación

El botón central y los botones de publicar abren `publicar.html`. Las opciones dependen del tipo de perfil y los perfiles profesionales o comerciales requieren aprobación administrativa.

## 5. Configuración externa que continúa siendo necesaria

El paquete incluye el código de conexión, pero estas funciones dependen de servicios externos configurados en tus cuentas:

- Supabase Phone Auth y proveedor de SMS para verificar teléfonos.
- OneSignal Web Push y sus secretos en la Edge Function.
- Webhook de `notification_events` para enviar notificaciones automáticas.
- Permisos de ubicación y notificaciones aceptados por cada usuario en su dispositivo.

No publiques claves privadas dentro del HTML ni en GitHub.

## 6. Prueba recomendada con dos cuentas

1. Inicia sesión con una cuenta de vecino.
2. Abre **Mi perfil** y verifica que figure como Vecino.
3. Crea una publicación normal y confirma que aparezca en el inicio y en su perfil público.
4. Desde una segunda cuenta, abre ese perfil y pulsa **Seguir**.
5. Cambia el primer perfil a privado y prueba que la segunda cuenta reciba una solicitud pendiente.
6. Acepta la solicitud desde `seguidores.html`.
7. Crea una alerta de robo y confirma que el mapa no muestre el nombre ni la fotografía del reportante.
8. Prueba una cuenta profesional o negocio aprobándola desde el panel administrativo.
9. Confirma que las publicaciones del profesional o negocio permanezcan en su perfil público.
10. Prueba la web al 100 % de zoom y también desde el celular.

## 7. Limpiar la versión anterior del celular

Después del despliegue:

1. Cierra completamente la PWA o pestaña de MiZona.
2. Vuelve a abrir `https://mizona.pe`.
3. Si todavía aparece el diseño anterior, borra la caché del sitio o desinstala y vuelve a instalar la PWA.
4. En computadora usa una recarga forzada: `Ctrl + Shift + R`.

## 8. Importante

La entrega modifica archivos y prepara el SQL, pero no realiza directamente el `push` en tu GitHub ni ejecuta consultas dentro de tu proyecto Supabase. Esos pasos deben hacerse desde tus cuentas.
