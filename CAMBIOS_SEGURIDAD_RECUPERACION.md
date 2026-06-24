# Cambios de seguridad y recuperación

- El correo de recuperación redirige a `https://mizona.pe/restablecer.html`.
- Nueva plantilla de correo con el botón “Crear nueva contraseña”.
- Botón de ojo en inicio de sesión, registro, respuesta secreta y nueva contraseña.
- Nueva página `seguridad.html` para configurar o cambiar la pregunta de recuperación.
- Pregunta validada antes de enviar el correo desde el flujo normal de MiZona.
- Respuesta almacenada como hash bcrypt en Supabase, nunca en texto plano.
- Bloqueo de 15 minutos después de cinco respuestas incorrectas.
- Acceso “Seguridad” agregado a Mi perfil.
- Flujo especial para cuentas antiguas que todavía no configuraron pregunta.
- Página de nueva contraseña valida primero la sesión de recuperación.
- Caché PWA actualizada.
