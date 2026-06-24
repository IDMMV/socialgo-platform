# MiZona.pe — Unificación visual global

## Objetivo
Todas las páginas internas usan ahora la misma estructura visual de Inicio:

- barra lateral completa;
- encabezado común;
- ubicación, buscador, botón publicar, notificaciones y perfil;
- navegación móvil inferior;
- colores, tipografía, tarjetas y espaciados compartidos;
- sección activa marcada según la página.

## Páginas unificadas

- Alertas
- Mapa
- Servicios
- Solicitudes
- Zona Ofertas
- MiZonaRide
- Empleos
- Mensajes
- Amigos
- Notificaciones
- Mi perfil
- Mi negocio
- Explorar
- Administración
- Perfil público

## Archivos principales

- `css/mizona-master-shell.css`: sistema visual compartido.
- `js/mizona-master-shell.js`: construye la navegación común y carga el perfil.
- `service-worker.js`: versión de caché actualizada.

## Comportamiento móvil

- La barra lateral se convierte en menú deslizable.
- La barra superior permanece visible.
- La navegación inferior permanece fija.
- El botón central permite publicar.
- Mapa, filtros y rangos conservan su funcionamiento.

## Páginas que mantienen diseño propio

Las páginas de acceso (`login`, `registro`, `recuperar`, `restablecer`) mantienen un diseño centrado porque no requieren barra lateral. `clips.html` mantiene su interfaz de editor a pantalla completa.

## Instalación

1. Copiar todo el contenido del proyecto sobre el repositorio actual.
2. Aceptar reemplazar archivos.
3. Realizar `Commit to main` y `Push origin`.
4. Esperar el despliegue de Vercel.
5. Abrir `https://mizona.pe` y recargar completamente.

La caché cambió a `mizona-v3.2.0-diseno-unificado`, por lo que el service worker eliminará la versión anterior.
