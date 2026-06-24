# Instalación de la Fase 5

## 1. Copia de seguridad

Antes de reemplazar archivos, guarda una copia del repositorio actual.

## 2. Ejecutar SQL en Supabase

Abre:

`Supabase → SQL Editor → New query`

Copia todo el contenido de:

`sql/fase5_alertas_inteligentes.sql`

Presiona **Run**. El resultado final debe indicar que la Fase 5 fue instalada.

Este paso crea las tablas, funciones, políticas RLS, privacidad de coordenadas, seguimiento, utilidad, resoluciones, sugerencias y moderación.

## 3. Subir el proyecto

Copia todo el contenido de la carpeta `MiZona_Fase5_Alertas_Inteligentes` dentro del repositorio y acepta reemplazar.

En GitHub Desktop utiliza:

`Fase 5: alertas inteligentes y participación vecinal`

Después presiona **Commit to main** y **Push origin**.

## 4. Edge Function de notificaciones

La función `send-push` cambió para respetar:

- solo alertas verificadas;
- actualizaciones de alertas seguidas;
- cambios de estado;
- confirmaciones del autor.

Si ya desplegaste la función antes, vuelve a desplegarla desde Supabase CLI:

```bash
supabase functions deploy send-push
```

La clave privada de OneSignal debe permanecer en los secretos de Supabase y nunca en GitHub.

## 5. Pruebas recomendadas

### Publicación

1. Inicia sesión con una cuenta normal.
2. Abre `https://mizona.pe/alertas.html#reportar`.
3. Selecciona una categoría.
4. En computadora, haz clic en el mapa. En celular, mantén presionado el lugar.
5. Mueve el marcador y confirma.
6. Comprueba la pantalla final y publica.

### Duplicados

Publica otra alerta de la misma categoría a menos de 400 m y dentro de 36 horas. MiZona debe mostrar reportes similares antes de continuar.

### Seguimiento

1. Abre `alerta.html?id=...` con otra cuenta.
2. Pulsa **Seguir esta alerta**.
3. Desde el autor, agrega una actualización.
4. Comprueba la bandeja interna y el push cuando OneSignal esté activo.

### Moderación

1. Entra con el administrador.
2. Abre `admin-alertas.html`.
3. Verifica una alerta o solicita corrección con un motivo.
4. El autor debe ver el motivo en `alerta.html` y poder reenviar.

### Resolución

1. El autor propone marcarla como resuelta.
2. Dos cuentas diferentes confirman la resolución.
3. La alerta debe cambiar automáticamente a **Resuelta**.

### Sugerencias

Abre `sugerencias.html`, envía una idea y revisa su estado en `admin-alertas.html`.

## Observación

Las coordenadas exactas quedan en `alerta_ubicaciones_privadas`. La tabla pública `alertas` conserva únicamente la coordenada que corresponde al nivel de privacidad seleccionado.
