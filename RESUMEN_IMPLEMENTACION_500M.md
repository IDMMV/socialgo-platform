# Resumen de implementación — MiZona 500 m

## Incorporado

- Ubicación automática al ingresar, después del permiso del usuario.
- Explicación previa de privacidad antes del permiso del sistema.
- Radio inicial unificado de 500 m.
- Selector de 500 m, 1 km, 2 km, 5 km y toda la zona.
- Preferencia persistente entre páginas.
- Mapa centrado en el usuario con círculo de búsqueda.
- Filtrado por distancia real mediante fórmula Haversine.
- Distancia visible en alertas, servicios, solicitudes, ofertas y empleos.
- Botón para ampliar a 1 km cuando no existen resultados a 500 m.
- Ficha inferior al tocar un incidente en el mapa.
- Confirmación, compartir, seguimiento y acceso al detalle.
- Captura o selección de fotografías desde el celular.
- Compresión de fotografías antes de subirlas.
- Teléfono verificado obligatorio para aportar evidencia.
- Moderación administrativa de fotografías.
- Bucket privado y enlaces temporales para evidencia.
- Estado inicial visible `Sin verificar`.
- Empleos locales conectados a Supabase y filtrados por cercanía.
- Radio predeterminado de notificaciones cambiado de 1.5 km a 500 m.
- Ubicación y radio configurables desde el perfil.
- Nueva versión de service worker para evitar archivos antiguos en caché.

## Se conserva de la Actualización Integral

- Barra lateral estable y sesión única.
- Nombre de usuario consistente, sin reemplazarlo por el correo.
- Cuenta personal con permisos adicionales de proveedor.
- Solicitud y aprobación de profesionales o negocios.
- Verificación telefónica.
- Contactos de confianza.
- Alertas categorizadas y dirigidas a vecinos, contactos o ambos.
- Chat privado con solicitudes, bloqueos y reportes.
- OneSignal identificado con el ID estable de Supabase.
- Notificaciones automáticas de mensajes y alertas.
