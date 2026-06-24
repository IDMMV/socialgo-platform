# Configurar recuperación de contraseña en Supabase

## 1. Ejecutar SQL

Abre **Supabase → SQL Editor → New query**, pega todo el contenido de:

`sql/seguridad_recuperacion.sql`

y presiona **Run**.

## 2. Revisar URL Configuration

Abre **Authentication → URL Configuration**.

- Site URL: `https://mizona.pe`
- Redirect URLs:
  - `https://mizona.pe/**`
  - `https://www.mizona.pe/**`
  - `https://socialgo-platform.vercel.app/**` (solo respaldo temporal)

## 3. Personalizar el correo

Abre **Authentication → Email Templates → Reset password**.

- Subject: `Crea una nueva contraseña para MiZona.pe`
- Body: pega el contenido de `supabase/PLANTILLA_CORREO_RECUPERACION.html`

El enlace debe conservar `{{ .ConfirmationURL }}`. Esa variable contiene el token seguro de Supabase y respeta el `redirectTo` enviado por MiZona.

## 4. Probar

1. Inicia sesión y abre `https://mizona.pe/seguridad.html`.
2. Configura la pregunta de recuperación.
3. Cierra sesión.
4. Abre `https://mizona.pe/recuperar.html`.
5. Ingresa correo, pregunta y respuesta.
6. Abre el correo y pulsa **Crear nueva contraseña**.
7. Debe abrir `https://mizona.pe/restablecer.html`.
