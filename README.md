# MiZona.pe

**Tu zona, tu gente, tus oportunidades.**

Proyecto web estático conectado a Supabase y desplegable desde GitHub hacia Vercel.

## Versión incluida

Esta carpeta corresponde a la **Fase 3 de notificaciones push**, e incluye las correcciones acumuladas de las fases anteriores.

Se corrigieron:

- Identidad de marca y funciones de `brand.js`.
- Apariencia compartida entre páginas claras, oscuras y heredadas.
- Instalación y actualización del service worker.
- Publicación real de alertas y solicitudes desde la página principal.
- Directorio real de servicios conectado a `servicios_mizona`.
- Solicitudes reales conectadas a `solicitudes_mizona`.
- Botones sin acción detectados en clips, empleos, ofertas y negocio.
- Navegación móvil en páginas que quedaban sin menú.

Consulta `CAMBIOS_FASE1.md` para conocer los detalles y las pruebas recomendadas.


## FASE 3 — NOTIFICACIONES PUSH

Esta versión agrega registro de dispositivos, preferencias, radio geográfico, horario silencioso, bandeja interna, OneSignal y una Edge Function segura de Supabase.

La instalación requiere ejecutar:

`sql/fase3_notificaciones_push.sql`

y seguir:

`INSTRUCCIONES_FASE3_NOTIFICACIONES.md`

Las notificaciones no se activarán hasta colocar el App ID público de OneSignal y guardar la App API Key privada en los secretos de la Edge Function.

## Configuración de Supabase

La configuración pública está en:

```text
js/env.public.js
```

La clave pública de Supabase puede estar en el navegador. Nunca coloques allí una clave `service_role`, una contraseña ni una clave privada de inteligencia artificial.

### Base de datos ya existente

Esta actualización agrega tablas nuevas para dispositivos y entregas push, además de utilizar las tablas existentes, especialmente:

- `perfiles`
- `alertas`
- `alerta_confirmaciones`
- `servicios_mizona`
- `solicitudes_mizona`
- `configuracion_plataforma`
- `seguidores`
- `conversaciones`, `conversacion_participantes` y `mensajes`

Si esas tablas ya funcionan en tu web, **no vuelvas a ejecutar todos los SQL**.

Para una instalación nueva, revisa los scripts de la carpeta `sql` en el orden de sus fases. El archivo `sql/schema_mizona_fase1b.sql` contiene las tablas de alertas, servicios y solicitudes usadas por las páginas nuevas.

## Publicación en GitHub

1. Conserva una copia de seguridad del repositorio actual.
2. Reemplaza los archivos del repositorio por los de esta carpeta.
3. Confirma que también subiste los archivos nuevos:
   - `js/push-notifications.js`
   - `push/onesignal/OneSignalSDKWorker.js`
   - `sql/fase3_notificaciones_push.sql`
   - `supabase/functions/send-push/index.ts`
   - `INSTRUCCIONES_FASE3_NOTIFICACIONES.md`
4. Haz commit y push.
5. Espera el despliegue de Vercel.
6. En el celular, actualiza la página. Si siguiera apareciendo la versión anterior, elimina los datos del sitio o desinstala y vuelve a instalar la PWA para limpiar la caché antigua.

## Estructura principal

```text
MiZona/
├── index.html
├── alertas.html
├── mapa.html
├── servicios.html
├── solicitudes.html
├── ofertas.html
├── empleos.html
├── ride.html
├── perfil.html
├── negocio.html
├── mensajes.html
├── clips.html
├── admin.html
├── css/
│   ├── mizona.css
│   ├── mizona-dark.css
│   ├── global.css
│   └── mizona-unified.css
├── js/
│   ├── mizona-core.js
│   ├── brand.js
│   ├── supabase.js
│   ├── servicios-mizona.js
│   ├── solicitudes-mizona.js
│   ├── alertas-mizona.js
│   └── mapa-mizona.js
└── sql/
```

## Estado funcional

### Conectado a Supabase

- Autenticación y recuperación de contraseña.
- Alertas y confirmaciones.
- Mapa de alertas.
- Perfil, avatar y portada.
- Servicios locales.
- Solicitudes de trabajo o cotización.
- Amistades, seguidores, mensajes y notificaciones, siempre que se hayan ejecutado sus esquemas correspondientes.
- Clips, siempre que el almacenamiento y los esquemas de clips estén configurados.

### Todavía demostrativo o parcial

- Empleos reales y postulaciones.
- Activación de ofertas comerciales reales.
- MiZonaRide y contratación de conductores.
- Operaciones completas del panel de negocio.
- Integración de inteligencia artificial del panel de negocio.

Estas funciones deben conectarse a tablas y procesos seguros antes de mostrarse como servicios reales.


## FASE 2 — DISEÑO UNIFICADO Y MENSAJERÍA

Después de subir esta versión, ejecuta en Supabase el archivo:

`sql/fase2_mensajeria_y_diseno.sql`

Este archivo corrige la recursión de las políticas RLS del chat y habilita el nuevo listado de conversaciones. Consulta `INSTRUCCIONES_FASE2_MIZONA.md` para el orden completo.

## Fase 4 — Negocios y Zona Ofertas

Antes de usar `negocio.html`, `negocio-publico.html`, `oferta.html`, `ofertas.html` y `admin-negocios.html`, ejecuta `sql/fase4_negocios_ofertas.sql` en Supabase. Consulta `INSTRUCCIONES_FASE4_NEGOCIOS_OFERTAS.md`.

## Fase 5 — Alertas inteligentes

Consulta `INSTRUCCIONES_FASE5_ALERTAS_INTELIGENTES.md` y ejecuta `sql/fase5_alertas_inteligentes.sql` para habilitar selección en mapa, privacidad de ubicación, detección de duplicados, seguimiento, resolución comunitaria, moderación y sugerencias.
