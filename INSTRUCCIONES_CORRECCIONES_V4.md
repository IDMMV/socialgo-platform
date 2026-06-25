# MiZona.pe — Correcciones operativas V4

## Qué corrige esta entrega

1. **Crear publicación:** habilita desplazamiento vertical y espacio inferior para que siempre se vean los botones finales.
2. **Seguir perfiles:** corrige la función SQL que devolvía `column reference "estado" is ambiguous`.
3. **Verificar celular:** mantiene el flujo correcto `updateUser → verifyOtp(phone_change)` y muestra mensajes comprensibles en lugar de `{}`.
4. **OneSignal:** agrega `OneSignalSDKWorker.js` en la raíz y lo combina con el service worker de la PWA, evitando el error HTTP 404 y el conflicto de alcance.
5. **Mensajes:** al funcionar la verificación telefónica, el chat privado deja de bloquearse por `telefono_verificado=false`.
6. **MiZonaRide:** elimina conductores simulados y agrega solicitud real de conductor, documentos, revisión administrativa, estado en línea y ubicación en tiempo real mientras la página permanece abierta.

## Instalación

### A. Archivos web

1. Guarda una copia de seguridad del repositorio.
2. Copia el contenido del ZIP completo sobre la raíz del repositorio.
3. Confirma que estén en la raíz:
   - `OneSignalSDKWorker.js`
   - `service-worker.js`
   - `conductor.html`
   - `admin-conductores.html`
4. Haz Commit y Push. Espera el despliegue de Vercel.

### B. SQL

Ejecuta en una consulta nueva de Supabase:

`MiZona_SQL_REPARACION_OPERATIVA_V4.sql`

Debe terminar con:

`OK: seguimiento corregido y módulo de conductores instalado`

## Configuración obligatoria del SMS

El código no puede enviar SMS hasta que Supabase tenga un proveedor configurado.

1. Supabase → Authentication → Providers.
2. Activa **Phone**.
3. Configura un proveedor SMS compatible, por ejemplo Twilio, MessageBird o Vonage.
4. Guarda y vuelve a probar `verificar-telefono.html`.

## Comprobar OneSignal

Después del despliegue abre directamente:

`https://mizona.pe/OneSignalSDKWorker.js`

Debe mostrarse JavaScript y no un error 404.

En OneSignal configura:

- Site URL: `https://mizona.pe`
- Service worker path: `/`
- Filename: `OneSignalSDKWorker.js`
- Scope: `/`

Cierra la PWA, vuelve a abrirla y activa las notificaciones nuevamente.

## Flujo de conductor

1. El usuario verifica el celular.
2. Abre `conductor.html`.
3. Completa los datos y carga DNI, licencia, SOAT, tarjeta de propiedad, revisión técnica y foto del vehículo.
4. El administrador abre `admin-conductores.html`.
5. Revisa los documentos y aprueba u observa la solicitud.
6. El conductor abre `ride.html` y pulsa **Ponerme en línea**.
7. Mientras MiZonaRide esté abierta, la ubicación del vehículo se actualiza y otros usuarios pueden verlo en el mapa.

## Prueba de notificaciones entre dos cuentas

1. Inicia sesión con la primera cuenta en un celular y activa las notificaciones.
2. Inicia sesión con la segunda cuenta en otro dispositivo y activa las notificaciones.
3. Confirma que ambos dispositivos aparezcan como activos.
4. Envía un mensaje o una notificación de prueba.
5. Si la app está abierta, el mensaje se recibe por Supabase Realtime; si está cerrada, el aviso depende de OneSignal.
