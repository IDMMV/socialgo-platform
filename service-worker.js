const CACHE_NAME = "mizona-v1.1.0-fase1b";

const CORE = [
  "./",
  "./index.html",
  "./js/dashboard-mizona.js",
  "./js/mapa-mizona.js",
  "./js/alertas-mizona.js",
  "./js/mizona-ui-v2.js",
  "./css/mizona-dark.css",
  "./mapa.html",
  "./assets/mizona-logo.svg",
  "./assets/icon-512.png",
  "./assets/icon-192.png",
  "./js/mizona-ui.js",
  "./css/mizona.css",
  "./beneficios.html",
  "./solicitudes.html",
  "./servicios.html",
  "./alertas.html",
  "./login.html",
  "./registro.html",
  "./clips.html",
  "./notificaciones.html",
  "./usuario.html",
  "./amistades.html",
  "./recuperar.html",
  "./restablecer.html",
  "./auth-callback.html",
  "./perfil.html",
  "./css/global.css",
  "./js/app.js",
  "./js/layout.js",
  "./js/auth.js",
  "./js/brand.js",
  "./js/config.js",
  "./js/env.public.js",
  "./js/session.js",
  "./js/supabase.js",
  "./js/publicaciones.js",
  "./js/media.js",
  "./js/clips.js",
  "./js/clip-editor.js",
  "./js/resumable-upload.js"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
