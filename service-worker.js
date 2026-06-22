const CACHE_NAME = "socialgo-v0.7.0";

const CORE = [
  "./",
  "./index.html",
  "./login.html",
  "./registro.html",
  "./clips.html",
  "./notificaciones.html",
  "./usuario.html",
  "./recuperar.html",
  "./restablecer.html",
  "./auth-callback.html",
  "./perfil.html",
  "./css/global.css",
  "./js/app.js",
  "./js/auth.js",
  "./js/brand.js",
  "./js/config.js",
  "./js/env.public.js",
  "./js/session.js",
  "./js/supabase.js",
  "./js/publicaciones.js",
  "./js/media.js",
  "./js/clips.js"
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
