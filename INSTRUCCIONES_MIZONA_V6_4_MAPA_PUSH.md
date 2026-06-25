# MiZona V6.4 — mapa de 500 m y OneSignal Push

## Qué se corrigió

1. El mapa vuelve a buscar usando distrito + referencia.
2. Se dibuja un círculo de aproximadamente 500 m alrededor del GPS del usuario.
3. No se permite confirmar un punto fuera de ese círculo.
4. La base de datos vuelve a validar el límite con tolerancia GPS de 550 m.
5. OneSignal ya no filtra a los usuarios por `telefono_verificado`.
6. Al publicar una alerta, el autor recibe una confirmación Push en su propio dispositivo.
7. El navegador intenta procesar los eventos Push inmediatamente; el Database Webhook queda como respaldo.

## Instalación

### A. Supabase SQL
Ejecuta completo `MiZona_SQL_V6_4_MAPA_PUSH.sql`.

### B. Archivos web
Reemplaza en GitHub:
- `alertas.html`
- `css/alertas-inteligentes.css`
- `js/alert-location-picker.js`
- `js/alertas-mizona.js`
- `service-worker.js`

### C. Edge Function obligatoria
Reemplaza el contenido de `send-push` con:
- `supabase/functions/send-push/index.ts`

Después vuelve a desplegar la función con Verify JWT desactivado. Conserva estos secretos:
- `ONESIGNAL_APP_ID`
- `ONESIGNAL_REST_API_KEY`
- `MIZONA_WEBHOOK_SECRET`
- `MIZONA_SITE_URL=https://mizona.pe`

No publiques los secretos en GitHub.

### D. Verificación
1. Abre `Notificaciones` en MiZona.
2. Debe decir `Activo` y mostrar una suscripción/dispositivo.
3. Pulsa `Enviar notificación de prueba`.
4. Crea una alerta dentro de 500 m.
5. El mismo celular debe recibir `Tu alerta fue registrada`.
6. Otra cuenta cercana con Push activo debe recibir `Nueva alerta cerca`.

## Por qué antes no llegaba
La Edge Function V6.3 todavía exigía `telefono_verificado = true`. Como V6 quitó la verificación por SMS, los usuarios quedaban excluidos. Además, una alerta normal excluye correctamente a su propio autor del aviso vecinal; V6.4 agrega una confirmación separada para el autor.
