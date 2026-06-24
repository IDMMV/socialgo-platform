# MiZona.pe — Fase 4: Negocios y Zona Ofertas

## Tres áreas implementadas

1. **Zona Ofertas para clientes (`ofertas.html`)**
   - Catálogo real conectado a Supabase.
   - Búsqueda, categorías, distrito y ordenamiento.
   - Oferta destacada, tarjetas, descuentos, stock y vigencia.
   - Guardar ofertas y obtener cupones.
   - Acceso a la página pública del negocio.
   - Bloque de ofertas cercanas agregado al Inicio.

2. **Página pública del negocio (`negocio-publico.html`)**
   - Portada, logotipo, descripción, ubicación y contactos.
   - Servicios, ofertas, galería, opiniones y confianza MiZona.
   - WhatsApp, llamada, mensaje, cómo llegar y compartir.
   - Cada negocio tiene una URL por `slug` o `id`.

3. **Panel privado del negocio (`negocio.html`)**
   - Solicitud para registrar negocio.
   - Estado de revisión.
   - Resumen, edición de información, portada y logotipo.
   - Crear ofertas como borrador o enviarlas a revisión.
   - Administrar servicios y galería.
   - Ver estados: borrador, pendiente, publicada, rechazada, pausada y vencida.

## Soporte administrativo

- Nueva página `admin-negocios.html`.
- Aprobar o rechazar solicitudes de negocios.
- Aprobar o rechazar ofertas.
- Al aprobar un negocio se crea automáticamente su página pública y se asigna al propietario.
- Al aprobar una oferta aparece automáticamente en Zona Ofertas y en la página pública.

## Seguridad

- RLS para clientes, propietarios y administradores.
- Los negocios no pueden aprobarse a sí mismos.
- Los propietarios no pueden publicar una oferta saltándose la revisión.
- Los documentos de solicitud no son públicos.
- Imágenes en bucket público `negocios`, con escritura limitada a cada usuario.
- Cupones únicos por usuario y oferta.
