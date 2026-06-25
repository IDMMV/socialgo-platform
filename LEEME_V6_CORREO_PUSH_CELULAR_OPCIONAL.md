# MiZona V6 — correo confirmado + OneSignal Push

Esta versión elimina la verificación obligatoria por SMS.

## Funcionamiento
- El correo confirmado es la verificación principal de la cuenta.
- OneSignal Push funciona sin teléfono.
- El celular es opcional y privado.
- Alertas, chat, contactos de confianza, solicitudes de proveedor, evidencias y registro de conductor ya no exigen SMS.
- Proveedores y conductores continúan sujetos a revisión administrativa y documentos.

## Instalación
1. Copia los archivos de esta versión sobre la raíz del repositorio.
2. Ejecuta una sola vez `sql/MiZona_SQL_V6_CORREO_PUSH_CELULAR_OPCIONAL.sql`.
3. En Supabase activa la confirmación de correo.
4. Puedes desactivar Authentication > Providers > Phone; MiZona ya no lo usa.
5. Despliega en Vercel, borra datos/caché de `mizona.pe` y abre la PWA nuevamente.
6. En Notificaciones pulsa **Activar en este dispositivo** y acepta el permiso.

## Importante
El teléfono opcional se guarda en `perfiles.telefono_contacto`; no se utiliza para iniciar sesión ni para enviar OTP.
