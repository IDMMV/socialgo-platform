# MiZona.pe — Integración del instalador PWA

Se integraron los tres archivos entregados:

- `manifest.json` en la raíz del proyecto.
- `js/instalar-pwa.js` dentro de la carpeta `js`.
- El fragmento visual se integró en `index.html` y sus estilos en `css/mizona.css`.

También se actualizó `service-worker.js` y se agregó `assets/screenshot-mobile.png` para que el manifiesto no apunte a un archivo inexistente.

## Prueba

1. Publica en GitHub/Vercel.
2. Abre `https://mizona.pe` en Chrome desde Android.
3. Espera unos segundos. Debe aparecer el banner de instalación cuando el navegador permita instalar la PWA.
4. En iPhone/iPad se mostrará la guía manual para agregar MiZona a la pantalla de inicio.

Si MiZona ya estaba instalada, desinstálala antes de repetir la prueba.
