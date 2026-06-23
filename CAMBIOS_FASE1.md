# MiZona.pe — Fase 1: estabilización y apariencia unificada

## 1. Identidad de marca

Se restauraron en `js/brand.js` las funciones que varias páginas necesitaban:

- `applyBrand()`
- `getBrand()`
- `loadBrand()`
- `saveBrand()`
- `BRAND`

La marca predeterminada ahora es MiZona, con los colores azul, verde y rojo del proyecto. Si la tabla `configuracion_plataforma` no existe o no responde, la página sigue funcionando con la configuración local.

## 2. Apariencia unificada

Se creó `css/mizona-unified.css` y se añadió a las 22 páginas HTML.

La nueva capa visual:

- Convierte las páginas oscuras de Alertas, Servicios y Solicitudes al estilo claro principal.
- Actualiza las páginas heredadas de SocialGo sin destruir su programación.
- Unifica botones, tarjetas, formularios, diálogos, tipografía y colores.
- Aumenta textos que estaban entre 8 y 10 píxeles.
- Mejora el comportamiento en celulares.
- Mantiene Clips con fondo oscuro porque es un visor de video, pero usa la marca MiZona.

## 3. Núcleo común

Se creó `js/mizona-core.js` para:

- Aplicar la marca en todas las páginas.
- Marcar la navegación activa.
- Registrar correctamente la PWA.
- Corregir botones sin tipo fuera de formularios.
- Proporcionar notificaciones visuales con `window.mzToast()`.

## 4. PWA y caché

Se reconstruyó `service-worker.js`.

Se eliminaron del precache los archivos inexistentes que impedían la instalación y se cambió el proceso para que un recurso opcional defectuoso no bloquee toda la PWA.

La nueva caché se llama:

```text
mizona-v2.0.0-estable
```

También se actualizaron los colores del `manifest.json`.

## 5. Servicios reales

`servicios.html` ya no es una tarjeta estática. Ahora:

- Lee servicios desde `servicios_mizona`.
- Busca por nombre, categoría, descripción o distrito.
- Filtra por categoría.
- Permite publicar un servicio después de iniciar sesión.
- Abre WhatsApp cuando existe un número válido.
- Intenta abrir una conversación privada mediante `crear_o_obtener_conversacion`.

Archivo nuevo:

```text
js/servicios-mizona.js
```

## 6. Solicitudes reales

`solicitudes.html` ahora:

- Lee solicitudes abiertas desde `solicitudes_mizona`.
- Protege la lista para usuarios registrados, de acuerdo con la política RLS existente.
- Permite publicar solicitudes con categoría, urgencia, distrito, fecha y presupuesto.
- Permite al propietario marcar una solicitud como resuelta.
- Permite a otro usuario abrir una conversación para enviar una propuesta.

Archivo nuevo:

```text
js/solicitudes-mizona.js
```

## 7. Página principal

Los modales de la página principal ahora insertan realmente:

- Alertas en `alertas`.
- Solicitudes en `solicitudes_mizona`.

Antes solamente cerraban el modal y mostraban un mensaje de éxito.

## 8. Botones sin acción

Se corrigieron los botones detectados sin eventos:

- Pestañas “Para ti” y “Siguiendo” de Clips.
- Botones “Pasar” del panel de negocio.
- Botón de empleo demostrativo.
- Botón de oferta demostrativa.
- Botón de emergencia de la página principal.

Las tarjetas de empleo y oferta se identifican como demostraciones para no prometer una postulación o devolución de dinero inexistente.

## 9. Pruebas realizadas

- Validación de sintaxis de todos los archivos JavaScript con Node.
- Validación de scripts JavaScript incluidos dentro de los HTML.
- Comprobación de rutas locales de CSS, JavaScript, imágenes y páginas.
- Comprobación de imports locales.
- Análisis de sintaxis de los cuatro archivos CSS.
- Búsqueda de botones sin evento o formulario asociado.

No fue posible realizar operaciones reales contra Supabase desde el entorno de revisión porque no tiene acceso de red. Las pruebas finales deben hacerse después de subir el proyecto a Vercel.

## 10. Pruebas después de subirlo

1. Abrir Inicio como visitante y como usuario.
2. Publicar una alerta con descripción de más de 10 caracteres.
3. Publicar una solicitud desde Inicio y desde Solicitudes.
4. Publicar un servicio y comprobar que aparezca en la lista.
5. Probar búsqueda y categorías de Servicios y Solicitudes.
6. Probar WhatsApp y el chat privado.
7. Abrir Alertas, Servicios, Solicitudes, Login, Mensajes y Administración para comprobar la apariencia.
8. Probar celular en orientación vertical.
9. Revisar Clips en “Para ti” y “Siguiendo”.
10. Confirmar que la PWA deja de mostrar archivos antiguos.
