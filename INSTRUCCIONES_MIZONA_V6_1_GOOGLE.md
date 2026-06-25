# MiZona V6.1 — Continuar con Google

## Orden correcto

1. En Supabase abre **SQL Editor → New query**.
2. Ejecuta completo `MiZona_SQL_V6_1_GOOGLE_LOGIN.sql`.
3. Debe aparecer: `OK: Google habilitado; perfiles automáticos y onboarding listos`.
4. Después copia los archivos de este paquete a la raíz del repositorio y reemplaza los anteriores.
5. Sube los cambios a GitHub y espera el despliegue de Vercel.
6. En Supabase confirma:
   - Authentication → Providers → Google: activado.
   - Authentication → URL Configuration → Site URL: `https://mizona.pe`.
   - Redirect URLs: `https://mizona.pe/auth-callback.html`.
7. En Google Auth Platform, si la aplicación continúa en modo **Prueba**, agrega tu correo en **Público → Usuarios de prueba**. Para permitir el ingreso de cualquier usuario, publica la aplicación en producción.
8. Abre `https://mizona.pe/login.html`, pulsa **Continuar con Google** y prueba.

## Qué cambia

- Botón Google en `login.html` y `registro.html`.
- Google confirma el correo; MiZona no envía un segundo mensaje de verificación.
- Los nuevos usuarios de Google reciben un perfil temporal seguro.
- `completar-perfil.html` solicita nombre de usuario, nombre, distrito opcional, celular opcional y aceptación de términos.
- Después se abre la pantalla de notificaciones para activar OneSignal.
- El celular sigue siendo opcional y no se utiliza para el acceso.

## Si aparece “Database error saving new user”

El SQL V6.1 no se ejecutó completo o el trigger anterior sigue activo. Vuelve a ejecutar todo `MiZona_SQL_V6_1_GOOGLE_LOGIN.sql` y prueba con una ventana de incógnito.

## Si Google solo deja entrar a tu correo

La aplicación está en modo **Prueba**. Agrega más usuarios de prueba o cambia el estado de publicación a **En producción** desde Google Auth Platform → Público.

## Seguridad

No subas el Client Secret a GitHub. El Client Secret solamente permanece guardado en Supabase → Authentication → Providers → Google.
