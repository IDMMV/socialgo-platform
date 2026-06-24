# MiZona · Fase 3 · Notificaciones push

Esta entrega deja programada la arquitectura:

Supabase Auth + Supabase Database + Database Webhook + Edge Function + OneSignal + celulares/navegadores.

## Archivos principales

- `js/push-notifications.js`: registra el navegador, vincula el dispositivo con el usuario y guarda preferencias.
- `push/onesignal/OneSignalSDKWorker.js`: recibe notificaciones aun cuando MiZona está cerrada.
- `notificaciones.html`: panel para activar/desactivar, escoger radio, categorías, horario silencioso y dispositivos.
- `sql/fase3_notificaciones_push.sql`: tablas, RLS, cola de eventos y disparadores.
- `supabase/functions/send-push/index.ts`: Edge Function que selecciona destinatarios y llama a OneSignal.
- `supabase/config.toml`: desactiva la verificación JWT únicamente para el webhook protegido con secreto propio.

## Paso 1 · Subir el proyecto a GitHub

Copia todo el contenido de esta carpeta sobre tu repositorio, acepta reemplazar archivos y publica:

`Fase 3: notificaciones push por dispositivo`

Después espera el despliegue de Vercel.

## Paso 2 · Crear la aplicación en OneSignal

1. Crea una cuenta en OneSignal.
2. Crea una aplicación llamada `MiZona`.
3. Agrega la plataforma **Web**.
4. Usa como URL exacta:

   `https://mizona.pe`

5. Selecciona configuración con código personalizado.
6. Configura el service worker:

   - Path: `/push/onesignal/`
   - Filename: `OneSignalSDKWorker.js`
   - Scope: `/push/onesignal/`

7. En `Settings → Keys & IDs`, copia:

   - OneSignal App ID
   - App API Key

## Paso 3 · Colocar solamente el App ID público

Abre:

`js/env.public.js`

Reemplaza:

```js
ONESIGNAL_APP_ID: ""
```

por:

```js
ONESIGNAL_APP_ID: "TU_APP_ID_DE_ONESIGNAL"
```

El App ID sí puede publicarse en GitHub.

**No pongas la App API Key en este archivo ni en GitHub.**

## Paso 4 · Crear las tablas y funciones en Supabase

Entra a:

`Supabase → SQL Editor → New query`

Copia y ejecuta todo el archivo:

`sql/fase3_notificaciones_push.sql`

Al terminar debe aparecer:

`Fase 3 de notificaciones instalada correctamente`

## Paso 5 · Crear la Edge Function

### Opción desde el panel de Supabase

1. Abre `Edge Functions`.
2. Crea una función llamada `send-push`.
3. Copia todo el contenido de:

   `supabase/functions/send-push/index.ts`

4. Desactiva `Verify JWT`, porque la llamada vendrá del webhook de la base de datos.
5. Publica la función.

### Opción con Supabase CLI

```bash
supabase functions deploy send-push --no-verify-jwt
```

## Paso 6 · Guardar los secretos en Supabase

En `Edge Functions → Secrets`, agrega:

```text
ONESIGNAL_APP_ID=TU_APP_ID
ONESIGNAL_API_KEY=TU_APP_API_KEY_PRIVADA
MIZONA_WEBHOOK_SECRET=CREA_UN_TEXTO_LARGO_ALEATORIO
MIZONA_SITE_URL=https://mizona.pe
```

Ejemplo de secreto fuerte:

```text
mizona_push_2026_cambia_esto_por_40_caracteres_aleatorios
```

No publiques estos valores en GitHub.

## Paso 7 · Crear el Database Webhook

En Supabase:

1. Abre `Database → Webhooks`.
2. Crea un webhook llamado `procesar_notificaciones_push`.
3. Tabla: `notification_events`.
4. Evento: `INSERT`.
5. Método: `POST`.
6. URL:

   `https://fhqdxethubaycijtbzry.supabase.co/functions/v1/send-push`

7. Agrega el encabezado:

```text
x-mizona-webhook-secret: EL_MISMO_VALOR_DE_MIZONA_WEBHOOK_SECRET
```

8. Guarda el webhook.

## Paso 8 · Registrar un celular

1. Abre MiZona desde el celular.
2. Inicia sesión.
3. Entra a `Notificaciones`.
4. Presiona `Activar en este dispositivo`.
5. Acepta notificaciones y ubicación.
6. Revisa que el celular aparezca en `Dispositivos registrados`.

### iPhone/iPad

1. Abre MiZona en Safari.
2. Presiona Compartir.
3. Selecciona `Agregar a pantalla de inicio`.
4. Abre MiZona desde el icono instalado.
5. Activa las notificaciones desde el panel.

## Paso 9 · Prueba inmediata

Cuando el dispositivo aparezca como activo, presiona:

`Enviar prueba`

Debe llegar:

- Título: `MiZona está conectada`
- Mensaje: `Esta es una notificación de prueba enviada a tu dispositivo.`

También puedes comprobar la suscripción en:

`OneSignal → Audience → Subscriptions`

## Eventos automáticos incluidos

- Nueva alerta dentro del radio del usuario.
- Confirmación de una alerta propia.
- Alerta verificada, resuelta o retirada.
- Nuevo mensaje privado.
- Solicitud de amistad.
- Solicitud de amistad aceptada.
- Comentario, reacción o nuevo seguidor.
- Eventos empresariales y ofertas preparados para fases posteriores.

## Reglas implementadas

- El autor de una alerta no recibe su propia alerta cercana.
- Solo se notifica a usuarios con un dispositivo activo.
- Las alertas se filtran por categoría y radio.
- Se respetan preferencias y horario silencioso.
- Las emergencias críticas pueden atravesar el horario silencioso si el usuario lo permite.
- Un mismo evento no se envía dos veces al mismo usuario.
- Cada dispositivo queda vinculado mediante el ID del usuario de Supabase.
- La App API Key de OneSignal permanece únicamente en la Edge Function.

## Tablas nuevas

- `push_devices`
- `notification_preferences`
- `notification_events`
- `notification_deliveries`
- `notification_inbox`

## Diagnóstico rápido

### El botón dice “Falta configurar”

Falta colocar `ONESIGNAL_APP_ID` en `js/env.public.js` y volver a publicar Vercel.

### El celular se registra, pero la prueba no llega

Revisa:

1. `OneSignal → Audience → Subscriptions`.
2. Secretos de la Edge Function.
3. Webhook de `notification_events`.
4. Logs de `send-push`.
5. Que el dominio configurado en OneSignal sea exactamente el dominio abierto en el celular.

### Funciona en Android, pero no en iPhone

MiZona debe estar agregada a la pantalla de inicio y abrirse desde ese icono.

### Aparece “sin_dispositivo_activo”

La cuenta tiene el permiso bloqueado, el navegador se desuscribió o el registro del dispositivo está inactivo.
