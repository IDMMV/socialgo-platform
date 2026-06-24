const CACHE_NAME = "mizona-v3.1.0-dominio";

const CORE = [
  "./",
  "./index.html",
  "./alertas.html",
  "./mapa.html",
  "./servicios.html",
  "./solicitudes.html",
  "./ofertas.html",
  "./empleos.html",
  "./ride.html",
  "./perfil.html",
  "./clips.html",
  "./negocio.html",
  "./admin.html",
  "./usuario.html",
  "./explorar.html",
  "./amistades.html",
  "./notificaciones.html",
  "./mensajes.html",
  "./login.html",
  "./registro.html",
  "./recuperar.html",
  "./restablecer.html",
  "./manifest.json",
  "./assets/mizona-logo.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./css/mizona.css",
  "./css/mizona-dark.css",
  "./css/global.css",
  "./css/mizona-unified.css",
  "./css/mizona-phase2.css",
  "./js/mizona-core.js",
  "./js/mizona-shell-v2.js",
  "./js/mizona-ui-v2.js",
  "./js/brand.js",
  "./js/config.js",
  "./js/env.public.js",
  "./js/supabase.js",
  "./js/push-notifications.js",
  "./js/alertas-mizona.js",
  "./js/mapa-mizona.js",
  "./js/servicios-mizona.js",
  "./js/solicitudes-mizona.js"
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

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(request)) || (await caches.match("./index.html"));
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      }
      return response;
    }).catch(() => null);

    return cached || (await network) || new Response("Recurso no disponible", { status: 503 });
  })());
});
