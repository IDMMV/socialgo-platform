# SocialGo — Fase 1

Base inicial modular de la futura red social.

## Incluye

- Inicio adaptable a computadora y celular.
- Registro e inicio de sesión en modo demostración.
- Publicaciones de ejemplo.
- Compartir mediante el menú nativo del teléfono para usuarios registrados.
- Guardados y Me gusta de demostración.
- Nombre, eslogan y colores editables desde `admin.html`.
- PWA básica mediante `manifest.json` y `service-worker.js`.
- Estructura inicial para Supabase.
- SQL preliminar con RLS para perfiles y publicaciones.
- Panel inicial de pendientes.

## Importante

Esta versión es una demostración visual y estructural. Todavía no debe utilizarse con usuarios reales ni pagos.

No incluye aún:

- Autenticación real de Supabase.
- Chat en tiempo real.
- Carga real de fotos o videos.
- Roles administrativos completos.
- MFA.
- Cloudflare Turnstile.
- Pagos.
- Monetización.
- Moderación automática.
- Transmisiones en vivo.

## Cómo probar

1. Descomprime la carpeta.
2. Abre el proyecto mediante un servidor local.
3. Una opción sencilla es usar la extensión Live Server en Visual Studio Code.
4. Abre `index.html`.
5. Usa `registro.html` para crear un usuario de demostración.
6. Abre `admin.html` para cambiar nombre, eslogan y colores.

## Próxima fase

1. Crear proyecto Supabase de desarrollo.
2. Configurar variables de entorno.
3. Integrar Supabase Auth.
4. Crear perfiles reales.
5. Probar todas las políticas RLS.
6. Crear roles administrativos.
7. Añadir auditoría inmutable.
8. Configurar Cloudflare y Turnstile.

## Seguridad

- No coloques `service_role` dentro de JavaScript público.
- No subas contraseñas o claves privadas a GitHub.
- Usa un proyecto Supabase separado para pruebas.
- Revisa el archivo `sql/schema_fase1.sql` antes de ejecutarlo.
