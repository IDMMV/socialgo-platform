# SOCIALGO — FASE 8.4 CORRECCIÓN INTEGRAL

Corrige:

- Panel administrador que quedaba en "Verificando acceso".
- Botón para volver al inicio desde administración.
- Perfil demasiado ancho.
- Foto de perfil en cabecera y editor.
- Clips mostrados como imagen rota en el feed.
- Mensajería: apertura automática, errores visibles y permisos de actualización.

## GitHub Desktop

1. Descomprime el ZIP.
2. Copia y reemplaza todo.
3. Summary: `Aplicar corrección integral SocialGo 8.4`.
4. Commit to main.
5. Push origin.

## Supabase

Ejecuta una vez:

`sql/reparacion_fase8_4.sql`

## Pruebas

1. Abre admin.html y verifica que desaparezca el cuadro de verificación.
2. Cambia foto de perfil y recarga.
3. Abre un clip desde Inicio y desde Clips.
4. Abre Mensajes, selecciona una conversación y envía texto.
