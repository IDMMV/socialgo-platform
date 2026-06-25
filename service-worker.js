const CACHE_NAME = "mizona-v11-phone-push";

const CORE = [
  "./",
  "./index.html",
  "./alertas.html",
  "./alerta.html",
  "./sugerencias.html",
  "./admin-alertas.html",
  "./mapa.html",
  "./distrito.html",
  "./servicios.html",
  "./solicitudes.html",
  "./ofertas.html",
  "./empleos.html",
  "./ride.html",
  "./perfil.html",
  "./clips.html",
  "./negocio.html",
  "./negocio-publico.html",
  "./oferta.html",
  "./admin-negocios.html",
  "./seguridad.html",
  "./admin.html",
  "./usuario.html",
  "./explorar.html",
  "./amistades.html",
  "./notificaciones.html",
  "./mensajes.html",
  "./admin-proveedores.html",
  "./proveedor.html",
  "./verificar-telefono.html",
  "./contactos-confianza.html",
  "./seguidores.html",
  "./publicar.html",
  "./login.html",
  "./registro.html",
  "./recuperar.html",
  "./restablecer.html",
  "./manifest.json",
  "./OneSignalSDKWorker.js",
  "./assets/mizona-logo.svg",
  "./assets/mizona-logo-horizontal.svg",
  "./assets/mizona-logo-blanco.svg",
  "./assets/mizona-icon-app.svg",
  "./assets/apple-touch-icon.png",
  "./assets/favicon-32.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./css/mizona.css",
  "./css/mizona-dark.css",
  "./css/global.css",
  "./css/mizona-unified.css",
  "./css/mizona-phase2.css",
  "./css/mizona-master-shell.css",
  "./css/mizona-logo.css",
  "./css/auth-security.css",
  "./css/negocios-ofertas.css",
  "./css/alertas-inteligentes.css",
  "./css/mejoras-v2.css",
  "./css/mizona-sidebar.css",
  "./css/mizona-sidebar-uniforme.css",
  "./css/emergency-center.css",
  "./css/integral-modules.css",
  "./css/mizona-stability.css",
  "./css/nearby-location.css",
  "./css/perfiles-mizona.css",
  "./js/nearby-location.js",
  "./js/perfil-publico.js",
  "./js/crear-publicacion.js",
  "./js/seguidores.js",
  "./js/incident-sheet.js",
  "./js/empleos-mizona.js",
  "./js/mizona-core.js",
  "./js/tema-mizona.js",
  "./js/niveles-mizona.js",
  "./js/mapa-calor.js",
  "./js/voz-mizona.js",
  "./js/comentarios-alerta.js",
  "./js/auth.js",
  "./js/password-ui.js",
  "./js/mizona-master-shell.js",
  "./js/mizona-sidebar-uniforme.js",
  "./js/admin-proveedores.js",
  "./js/proveedor.js",
  "./js/contactos-confianza.js",
  "./js/phone-verification.js",
  "./js/emergency-center.js",
  "./js/push-dispatch.js",
  "./js/chat-access.js",
  "./js/session-state.js",
  "./js/mizona-ui-v2.js",
  "./js/brand.js",
  "./js/config.js",
  "./js/env.public.js",
  "./js/supabase.js",
  "./js/push-notifications.js",
  "./js/alertas-mizona.js",
  "./js/alert-location-picker.js",
  "./js/alerta-detalle.js",
  "./js/admin-alertas.js",
  "./js/sugerencias.js",
  "./js/mapa-mizona.js",
  "./js/servicios-mizona.js",
  "./js/solicitudes-mizona.js",
  "./js/ofertas-zona.js",
  "./js/negocio-publico.js",
  "./js/negocio-panel.js",
  "./js/oferta-detalle.js",
  "./js/admin-negocios.js",
  "./js/inicio-ofertas.js",
  "./js/publicaciones.js",
  "./js/home-publicaciones.js",
  "./js/instalar-pwa.js",
  "./conductor.html",
  "./admin-conductores.html",
  "./css/ride.css",
  "./js/ride.js",
  "./js/conductor.js",
  "./js/admin-conductores.js",
  "./assets/screenshot-mobile.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(CORE.map(async (url) => {
      const response = await fetch(url, { cache: "reload" });
      if (response.ok) await cache.put(url, response);
    }));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isCode = /\.(?:html?|js|mjs|css|json)$/i.test(url.pathname) ||
    /OneSignalSDKWorker\.js$/i.test(url.pathname) ||
    /service-worker\.js$/i.test(url.pathname);

  // HTML, JS, CSS y configuración: red primero para que las correcciones
  // lleguen al celular sin quedarse atrapadas en una versión antigua.
  if (request.mode === "navigate" || isCode) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request, { cache: "no-store" });
        if (fresh.ok) {
          const cache = await caches.open(CACHE_NAME);
          event.waitUntil(cache.put(request, fresh.clone()));
        }
        return fresh;
      } catch {
        return (await caches.match(request)) ||
          (request.mode === "navigate" ? await caches.match("./index.html") : null) ||
          new Response("Recurso no disponible", { status: 503 });
      }
    })());
    return;
  }

  // Imágenes y recursos pesados: caché rápida con actualización en segundo plano.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then(async response => {
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        event.waitUntil(cache.put(request, response.clone()));
      }
      return response;
    }).catch(() => null);
    return cached || (await network) || new Response("Recurso no disponible", { status: 503 });
  })());
});
