# Resumen de implementación

## Interfaz y sesión

- Perfil único almacenado en memoria y caché local para evitar cambios de nombre durante la navegación.
- Prioridad de identidad: `nombre_visible` y `username`; el correo ya no se usa como nombre público de reemplazo.
- La barra espera el estado real de autenticación antes de mostrar opciones de invitado.
- Usuario conectado: `Mi cuenta` y `Cerrar sesión`.
- Invitado: `Ingresar` y `Crear cuenta`.
- CSS adaptable para reducir anchos excesivos y ocultar paneles secundarios cuando falta espacio.
- Registro en dos columnas en computadora y una columna en celular.

## Cuenta, teléfono y proveedores

- Registro simplificado: todas las cuentas nacen personales.
- Celular obligatorio en el formulario.
- Pantalla de verificación SMS.
- Alertas, chat, contactos de confianza, publicación de servicios y push requieren celular verificado.
- Solicitud de proveedor con revisión administrativa.
- Estados y observaciones visibles para el solicitante.
- Publicación de servicios limitada a proveedores aprobados o administradores.

## Alertas

- El botón ya no dispara una alarma inmediata.
- Modal con categorías, radio, destinatarios, GPS, texto y dictado por voz.
- Estado inicial `reportada / sin verificar`.
- Aviso público prudente: un vecino reportó un posible hecho.
- Destinos: vecinos, contactos de confianza o ambos.
- Ubicación pública aproximada.
- Ubicación exacta temporal para el autor, administrador y contactos aceptados.

## Contactos de confianza

- Invitación por `@username`.
- Ambos usuarios deben verificar su celular.
- Aceptar, rechazar o eliminar.
- Permisos para recibir alertas y ubicación temporal de emergencia.

## Chat privado

- Texto en tiempo real.
- Teléfono verificado obligatorio para enviar.
- Desconocidos: solicitud previa.
- Amigos, contactos de confianza y proveedores aprobados: acceso directo.
- Estado leído/no leído.
- Bloqueo y reporte.
- Notificación push por cada mensaje nuevo.

## OneSignal

- El dispositivo se asocia al ID estable de Supabase mediante `OneSignal.login(user.id)`.
- Se guarda el `subscription_id` por dispositivo.
- El mensaje crea un evento `social_mensaje` real.
- El navegador puede solicitar el envío de su propio evento como respaldo.
- El Database Webhook procesa automáticamente los eventos creados en servidor.
- Reclamo atómico del evento para evitar duplicados.
- Solo se envía a cuentas con teléfono verificado y dispositivo activo.
