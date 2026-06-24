# MIGRACIÓN DEFINITIVA A MIZONA.PE

## Estado

- `https://mizona.pe` conectado a Producción en Vercel.
- `https://www.mizona.pe` redirige permanentemente a `https://mizona.pe`.
- La dirección antigua de Vercel puede mantenerse temporalmente como respaldo.

## 1. Supabase Auth

En **Supabase → Authentication → URL Configuration** configura:

### Site URL

```text
https://mizona.pe
```

### Redirect URLs

Agrega estas direcciones:

```text
https://mizona.pe/**
https://www.mizona.pe/**
https://socialgo-platform.vercel.app/**
```

La última dirección queda temporalmente para enlaces antiguos de confirmación y recuperación.

## 2. Archivos ya migrados

- `js/env.public.js`: `SITE_URL` apunta a `https://mizona.pe`.
- `supabase/functions/send-push/index.ts`: enlaces push usan `https://mizona.pe`.
- `supabase/.env.example`: `MIZONA_SITE_URL=https://mizona.pe`.
- `manifest.json`: inicio y alcance quedan en la raíz del dominio.
- `service-worker.js`: nueva versión de caché para evitar archivos antiguos.

## 3. OneSignal

Crea la aplicación Web Push con:

```text
Site Name: MiZona
Site URL: https://mizona.pe
Default Icon: https://mizona.pe/assets/icon-192.png
```

No uses `www.mizona.pe` ni la URL antigua de Vercel como Site URL de OneSignal.

Cuando OneSignal muestre el **App ID**, colócalo en:

```text
js/env.public.js → ONESIGNAL_APP_ID
```

La **App API Key** es privada y debe guardarse únicamente como secreto de Supabase con el nombre:

```text
ONESIGNAL_REST_API_KEY
```

También configura en los secretos de la Edge Function:

```text
MIZONA_SITE_URL=https://mizona.pe
```

## 4. Pruebas obligatorias

1. Registro de una cuenta nueva.
2. Confirmación de correo.
3. Inicio y cierre de sesión.
4. Recuperación de contraseña.
5. Apertura de enlaces desde correo.
6. Instalación de la PWA desde `mizona.pe`.
7. Activación de notificaciones en un celular.
8. Prueba de una alerta y una confirmación desde dos cuentas.

## 5. Publicación

Sube todos los archivos del paquete al repositorio, realiza `Commit to main`, `Push origin` y luego abre `https://mizona.pe` con una recarga forzada.
