# MiZona V5.1 — corrección de celular y notificaciones

## Cambios
- El celular se ingresa con 9 dígitos; MiZona agrega +51.
- La pantalla ya no desaparece si Supabase falla o demora.
- Reenvío OTP usa `phone_change`.
- OneSignal se inicializa en el orden recomendado por su SDK v16.
- Se agregó tiempo máximo y mensaje de error en vez de quedar en “Comprobando”.
- El service worker usa red primero para HTML, JS y CSS, evitando versiones antiguas en la PWA.

## Instalación
1. Copia todos los archivos del ZIP sobre la raíz del repositorio.
2. Commit y Push.
3. Espera a Vercel.
4. En el celular: cierra MiZona, abre Chrome > Configuración del sitio > mizona.pe > Borrar y restablecer.
5. Abre MiZona nuevamente e inicia sesión.
6. Verifica el celular con 9 dígitos y luego activa notificaciones.

## Requisito externo
Supabase debe tener Authentication > Providers > Phone habilitado y un proveedor SMS configurado. Sin proveedor, ningún frontend puede enviar el código real.
