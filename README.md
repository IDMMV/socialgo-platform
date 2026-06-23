# MiZona.pe

**Tu zona, tu gente, tus oportunidades.**

Proyecto web estático conectado a Supabase y desplegable desde GitHub hacia Vercel.

## Versión incluida

Esta carpeta corresponde a la **Fase 1 de estabilización y unificación visual**.

Se corrigieron:

- Identidad de marca y funciones de `brand.js`.
- Apariencia compartida entre páginas claras, oscuras y heredadas.
- Instalación y actualización del service worker.
- Publicación real de alertas y solicitudes desde la página principal.
- Directorio real de servicios conectado a `servicios_mizona`.
- Solicitudes reales conectadas a `solicitudes_mizona`.
- Botones sin acción detectados en clips, empleos, ofertas y negocio.
- Navegación móvil en páginas que quedaban sin menú.

Consulta `CAMBIOS_FASE1.md` para conocer los detalles y las pruebas recomendadas.

## Configuración de Supabase

La configuración pública está en:

```text
js/env.public.js
```

La clave pública de Supabase puede estar en el navegador. Nunca coloques allí una clave `service_role`, una contraseña ni una clave privada de inteligencia artificial.

### Base de datos ya existente

Esta actualización no agrega tablas nuevas. Utiliza las tablas y funciones existentes del proyecto, especialmente:

- `perfiles`
- `alertas`
- `alerta_confirmaciones`
- `servicios_mizona`
- `solicitudes_mizona`
- `configuracion_plataforma`
- `seguidores`
- `conversaciones`, `conversacion_participantes` y `mensajes`

Si esas tablas ya funcionan en tu web, **no vuelvas a ejecutar todos los SQL**.

Para una instalación nueva, revisa los scripts de la carpeta `sql` en el orden de sus fases. El archivo `sql/schema_mizona_fase1b.sql` contiene las tablas de alertas, servicios y solicitudes usadas por las páginas nuevas.

## Publicación en GitHub

1. Conserva una copia de seguridad del repositorio actual.
2. Reemplaza los archivos del repositorio por los de esta carpeta.
3. Confirma que también subiste los archivos nuevos:
   - `css/mizona-unified.css`
   - `js/mizona-core.js`
   - `js/servicios-mizona.js`
   - `js/solicitudes-mizona.js`
4. Haz commit y push.
5. Espera el despliegue de Vercel.
6. En el celular, actualiza la página. Si siguiera apareciendo la versión anterior, elimina los datos del sitio o desinstala y vuelve a instalar la PWA para limpiar la caché antigua.

## Estructura principal

```text
MiZona/
├── index.html
├── alertas.html
├── mapa.html
├── servicios.html
├── solicitudes.html
├── ofertas.html
├── empleos.html
├── ride.html
├── perfil.html
├── negocio.html
├── mensajes.html
├── clips.html
├── admin.html
├── css/
│   ├── mizona.css
│   ├── mizona-dark.css
│   ├── global.css
│   └── mizona-unified.css
├── js/
│   ├── mizona-core.js
│   ├── brand.js
│   ├── supabase.js
│   ├── servicios-mizona.js
│   ├── solicitudes-mizona.js
│   ├── alertas-mizona.js
│   └── mapa-mizona.js
└── sql/
```

## Estado funcional

### Conectado a Supabase

- Autenticación y recuperación de contraseña.
- Alertas y confirmaciones.
- Mapa de alertas.
- Perfil, avatar y portada.
- Servicios locales.
- Solicitudes de trabajo o cotización.
- Amistades, seguidores, mensajes y notificaciones, siempre que se hayan ejecutado sus esquemas correspondientes.
- Clips, siempre que el almacenamiento y los esquemas de clips estén configurados.

### Todavía demostrativo o parcial

- Empleos reales y postulaciones.
- Activación de ofertas comerciales reales.
- MiZonaRide y contratación de conductores.
- Operaciones completas del panel de negocio.
- Integración de inteligencia artificial del panel de negocio.

Estas funciones deben conectarse a tablas y procesos seguros antes de mostrarse como servicios reales.
