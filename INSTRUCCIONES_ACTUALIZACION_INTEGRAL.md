# MiZona.pe — Instalación de la actualización integral

Esta entrega integra en un solo bloque:

- sesión visual estable y nombre de usuario consistente;
- ocultamiento de **Ingresar / Crear cuenta** cuando existe una sesión;
- diseño adaptable para usar la web al 100 % de zoom;
- cuenta personal única con autorización adicional para proveedores;
- revisión administrativa de profesionales, negocios y organizaciones;
- teléfono obligatorio en el registro y verificación mediante SMS;
- contactos de confianza;
- alertas clasificadas, geolocalizadas y publicadas inicialmente como **SIN VERIFICAR**;
- ubicación exacta temporal solo para contactos autorizados;
- chat privado con solicitudes para desconocidos, bloqueo y reporte;
- avisos push de mensajes, alertas, contactos y revisión de proveedor;
- corrección de la conexión Supabase → Edge Function → OneSignal.

## 1. Haz una copia de seguridad

Antes de reemplazar archivos, descarga una copia del repositorio actual y exporta la base de datos o conserva los SQL anteriores.

## 2. Ejecuta el SQL nuevo

En Supabase abre:

`SQL Editor → New query`

Copia y ejecuta completo:

`sql/actualizacion_integral_seguridad_chat_push.sql`

Este SQL debe ejecutarse **después de las fases anteriores** de MiZona, porque amplía las tablas de perfiles, alertas, mensajería y notificaciones ya existentes.

Al finalizar debe aparecer:

`Actualización integral instalada correctamente`

El archivo contiene dos transacciones consecutivas. Ejecuta todo el archivo; no detengas la ejecución después del primer mensaje.

## 3. Activa el proveedor de SMS en Supabase

La página `verificar-telefono.html` ya está programada, pero Supabase necesita un proveedor de SMS real.

En Supabase:

1. Abre `Authentication → Providers → Phone`.
2. Activa el proveedor Phone.
3. Configura uno de los proveedores SMS admitidos por tu cuenta de Supabase.
4. Guarda la configuración.
5. Revisa los límites de envío y el costo de los SMS.

La verificación implementada usa el flujo de cambio de teléfono de una cuenta ya conectada. El usuario recibe un código, lo introduce en MiZona y el perfil queda marcado como `telefono_verificado=true`.

## 4. Reemplaza los archivos del repositorio

Copia **todo el contenido interior** de la carpeta de esta entrega sobre el repositorio de MiZona.

Acepta reemplazar los archivos existentes y confirma que se incluyan también las carpetas nuevas o modificadas:

- `css/`
- `js/`
- `sql/`
- `supabase/functions/send-push/`
- `push/onesignal/`

Después realiza el commit y el push a GitHub. Vercel debería desplegar automáticamente el cambio.

## 5. Actualiza la Edge Function de notificaciones

La función fue corregida para:

- aceptar eventos del webhook o de un usuario autenticado;
- exigir teléfono verificado a los destinatarios;
- enviar mensajes privados por OneSignal;
- respetar el radio elegido en una alerta;
- evitar envíos duplicados cuando el navegador y el webhook procesan el mismo evento;
- usar `ONESIGNAL_REST_API_KEY` como nombre principal del secreto.

Desde Supabase CLI:

```bash
supabase functions deploy send-push --no-verify-jwt
```

También puedes reemplazar el contenido desde el panel de Edge Functions con:

`supabase/functions/send-push/index.ts`

La función conserva una validación interna mediante secreto para las llamadas del webhook y valida el JWT cuando la invoca el navegador.

## 6. Revisa los secretos de la Edge Function

En `Edge Functions → Secrets`, confirma estos valores:

```text
ONESIGNAL_APP_ID=TU_APP_ID
ONESIGNAL_REST_API_KEY=TU_REST_API_KEY_PRIVADA
MIZONA_WEBHOOK_SECRET=UN_TEXTO_LARGO_Y_ALEATORIO
MIZONA_SITE_URL=https://mizona.pe
```

No coloques `ONESIGNAL_REST_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ni `MIZONA_WEBHOOK_SECRET` dentro de GitHub o de un archivo HTML.

El App ID público ya está preparado en:

`js/env.public.js`

## 7. Revisa el Database Webhook

En Supabase abre `Database → Webhooks` y confirma que exista:

- Nombre sugerido: `procesar_notificaciones_push`
- Tabla: `public.notification_events`
- Evento: `INSERT`
- Método: `POST`
- URL:

```text
https://fhqdxethubaycijtbzry.supabase.co/functions/v1/send-push
```

- Encabezado:

```text
x-mizona-webhook-secret: EL_MISMO_VALOR_DE_MIZONA_WEBHOOK_SECRET
```

Este webhook es el que convierte cada fila nueva de `notification_events` en una notificación real de OneSignal.

## 8. Verifica OneSignal

En OneSignal, la Web App debe usar exactamente el origen:

`https://mizona.pe`

El service worker debe estar disponible públicamente en:

`https://mizona.pe/push/onesignal/OneSignalSDKWorker.js`

Configuración usada por el código:

```text
Path: push/onesignal/OneSignalSDKWorker.js
Scope: /push/onesignal/
```

Al abrir la URL del worker debe verse JavaScript y no una página HTML de Vercel ni un error 404.

## 9. Orden recomendado de pruebas

### Prueba A — sesión y barra lateral

1. Inicia sesión.
2. Cambia entre Inicio, Alertas, Ofertas, Explorar y Perfil.
3. El nombre debe permanecer estable.
4. No deben aparecer los botones `Ingresar` ni `Crear cuenta`.
5. Deben aparecer `Mi cuenta` y `Cerrar sesión`.
6. Prueba la web al 100 % de zoom.

### Prueba B — teléfono

1. Registra una cuenta nueva con correo y celular.
2. Confirma el correo.
3. Entra en `Verificar celular`.
4. Solicita el SMS e introduce el código.
5. Confirma en la tabla `perfiles` que `telefono_verificado` sea `true`.

### Prueba C — OneSignal

1. En el celular abre `Notificaciones`.
2. Presiona `Activar en este dispositivo`.
3. Acepta el permiso.
4. Confirma que el dispositivo aparezca como activo.
5. Presiona `Enviar prueba`.
6. Cierra o minimiza MiZona y repite la prueba.

### Prueba D — chat privado

Usa dos cuentas con teléfono verificado:

1. La cuenta A intenta escribir a una persona desconocida.
2. La cuenta B debe recibir una solicitud de conversación.
3. B acepta.
4. A y B intercambian mensajes.
5. Con la web cerrada en B, el mensaje debe producir una notificación push.
6. Prueba `Bloquear` y `Reportar`.

Los amigos, contactos de confianza y proveedores aprobados pueden abrir el chat directamente. Los desconocidos deben ser aceptados primero.

### Prueba E — contactos de confianza y alertas

1. A agrega a B como contacto de confianza.
2. B acepta.
3. A presiona `Crear alerta`.
4. Selecciona tipo, estado, alcance, ubicación y descripción.
5. Envía a `Vecinos`, `Contactos de confianza` o `Ambos`.
6. La alerta pública debe decir **SIN VERIFICAR**.
7. Solo los contactos aceptados pueden obtener la ubicación exacta temporal durante la primera hora.

### Prueba F — proveedor

1. Un usuario verificado abre `Ofrecer servicios`.
2. Envía su solicitud.
3. El administrador entra en `Administración → Proveedores`.
4. Aprueba, observa o rechaza.
5. El usuario recibe el aviso.
6. Solo después de la aprobación podrá publicar un servicio.

## 10. Comportamiento de las cuentas

Todos comienzan con una **cuenta personal**.

La autorización de proveedor es un permiso adicional, no una segunda cuenta:

- `no_solicitado`
- `pendiente`
- `observado`
- `aprobado`
- `rechazado`
- `suspendido`

Tipos de proveedor:

- profesional independiente;
- negocio;
- organización.

El correo y el teléfono permanecen privados. En la interfaz pública se utiliza el nombre visible y `@username`.

## 11. Diagnóstico rápido

### El SMS no llega

- Phone no está activado en Supabase.
- Falta configurar el proveedor SMS.
- El número no incluye código de país.
- Se alcanzó el límite de solicitudes o el proveedor rechazó el destino.

### El mensaje aparece en el chat, pero no llega al celular

Revisa, en este orden:

1. teléfono verificado en `perfiles`;
2. dispositivo activo en `push_devices`;
3. permiso concedido en el navegador y en Android/iOS;
4. fila creada en `notification_events` con `event_type='social_mensaje'`;
5. fila en `notification_deliveries`;
6. logs de la Edge Function `send-push`;
7. secreto de OneSignal y webhook.

### La notificación se duplica

La Edge Function nueva reclama cada evento de forma atómica. Confirma que Vercel y Supabase tengan los archivos nuevos y que no exista otra función antigua enviando el mismo evento.

### iPhone no muestra el permiso

Agrega MiZona a la pantalla de inicio, ábrela desde el icono y activa las notificaciones desde esa instalación.

## Importante

Los archivos están programados y validados sintácticamente, pero las funciones que dependen de Supabase, SMS y OneSignal solo quedarán activas después de ejecutar el SQL, desplegar la Edge Function y revisar los secretos y el webhook.
