# MiZona V6 — OneSignal Push + correo confirmado

## Objetivo
- OneSignal Push funciona sin verificar el celular.
- El correo confirmado es la verificación principal.
- El celular es opcional, privado y no recibe OTP.

## Instalación
1. Guarda una copia de tu repositorio actual.
2. Descomprime `MiZona_WEB_FINAL_V6_EMAIL_PUSH_Cambios.zip`.
3. Copia su contenido en la raíz del repositorio y acepta reemplazar.
4. En Supabase SQL Editor ejecuta una sola vez:
   `MiZona_SQL_V6_CORREO_PUSH_CELULAR_OPCIONAL.sql`
5. En Supabase abre Authentication > Providers > Email y mantén activada la confirmación por correo.
6. Puedes desactivar Authentication > Providers > Phone, ya que esta versión no lo usa.
7. Sube los cambios a GitHub y espera el despliegue de Vercel.
8. En el celular borra los datos/caché de mizona.pe o desinstala y vuelve a instalar la PWA.
9. Inicia sesión con un correo confirmado, entra a Notificaciones y pulsa “Activar en este dispositivo”.

## Resultado esperado
- Alertas, chat, contactos de confianza, evidencias, proveedor y conductor funcionan sin SMS.
- OneSignal asocia el dispositivo con el ID del usuario de Supabase.
- El número puede guardarse desde Perfil > Celular opcional.
