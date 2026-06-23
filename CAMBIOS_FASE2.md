# MiZona — Cambios de la Fase 2

## Objetivo

Unificar la apariencia de las páginas heredadas y corregir el error de mensajería:

`infinite recursion detected in policy for relation "conversacion_participantes"`

## Cambios principales

### 1. Mensajería corregida

- Se eliminó la política RLS recursiva de `conversacion_participantes`.
- Se agregó la función segura `es_participante_conversacion(...)`.
- Se reconstruyeron las políticas de conversaciones, participantes y mensajes.
- Se agregó `listar_conversaciones_mizona()` para cargar chats sin depender de la vista antigua.
- Se actualizó `crear_o_obtener_conversacion(...)`.
- Se mantiene Realtime para mensajes nuevos.
- La pantalla ahora detecta y explica claramente cuando falta ejecutar el SQL de Fase 2.

### 2. Nueva pantalla de mensajes

- Barra lateral igual a MiZona.
- Lista de conversaciones con buscador.
- Chat responsive para computadora y celular.
- Botón de regreso en móvil.
- Estados vacíos y errores más claros.
- Búsqueda de un contacto recibido por URL.
- Mejor visualización de mensajes enviados, recibidos y leídos.

### 3. Apariencia unificada

Se añadió una capa visual común para:

- Administración.
- Amigos.
- Explorar.
- Mensajes.
- Notificaciones.
- Perfil público.

También se igualaron colores, anchos, tarjetas, botones, barras superiores y menús móviles en las demás páginas.

Archivos nuevos:

- `css/mizona-phase2.css`
- `js/mizona-shell-v2.js`

### 4. Corrección de marca

- Un valor antiguo `SocialGo` guardado en Supabase ya no vuelve a cambiar el nombre visible.
- El SQL actualiza automáticamente `SocialGo` a `MiZona` cuando corresponde.

### 5. Servicios reales en Inicio

- Se eliminaron los tres proveedores ficticios de la portada.
- Inicio ahora carga servicios reales desde `servicios_mizona`.
- El botón Contactar abre una conversación usando el ID real del propietario.
- Si no existen servicios, se muestra un estado vacío y el acceso para registrar uno.

### 6. Caché PWA

- Nueva versión de caché: `mizona-v2.1.0-fase2`.
- Se agregaron los nuevos CSS, JavaScript y páginas principales al service worker.
- Al publicarse, la versión antigua será reemplazada durante la activación del nuevo service worker.

## Instalación

1. Reemplazar en GitHub los archivos del ZIP de Fase 2.
2. Hacer Commit y Push.
3. En Supabase abrir **SQL Editor**.
4. Ejecutar completo:

   `sql/fase2_mensajeria_y_diseno.sql`

5. Esperar el despliegue de Vercel.
6. Recargar la web con limpieza de caché o cerrar y volver a abrir la PWA.

## Pruebas recomendadas

- Abrir Mensajes sin conversación seleccionada.
- Contactar un servicio real.
- Enviar un mensaje entre dos cuentas.
- Confirmar que el mensaje llega sin recargar.
- Revisar Amigos, Explorar, Notificaciones y Perfil público.
- Revisar en celular que el menú inferior y el botón atrás del chat funcionen.
