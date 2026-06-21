import { APP_CONFIG } from "./config.js";
import { applyBrand } from "./brand.js";
import { getCurrentUser } from "./supabase.js";
import { renderSessionControls } from "./session.js";

applyBrand();
await renderSessionControls();

async function requireUser(message) {
  const user = await getCurrentUser();
  if (!user) {
    alert(message);
    location.href = "registro.html";
    return null;
  }
  return user;
}

const dialog = document.querySelector("#composerDialog");

for (const id of ["openComposer", "openComposer2", "mobileCreate"]) {
  document.querySelector(`#${id}`)?.addEventListener("click", async () => {
    if (await requireUser("Regístrate o inicia sesión para publicar.")) {
      dialog?.showModal();
    }
  });
}

document.querySelectorAll('[data-action="like"]').forEach((button) => {
  button.addEventListener("click", async () => {
    if (!await requireUser("Regístrate para indicar que te gusta una publicación.")) return;

    const counter = button.querySelector("span");
    const active = button.classList.toggle("active");

    if (counter) {
      counter.textContent = String(Number(counter.textContent) + (active ? 1 : -1));
    }

    button.firstChild.textContent = active ? "♥ " : "♡ ";
  });
});

document.querySelectorAll('[data-action="save"]').forEach((button) => {
  button.addEventListener("click", async () => {
    if (!await requireUser("Regístrate para guardar publicaciones.")) return;
    button.classList.toggle("active");
  });
});

document.querySelectorAll('[data-action="share"]').forEach((button) => {
  button.addEventListener("click", async () => {
    if (!await requireUser("Regístrate para compartir publicaciones.")) return;

    try {
      const shareData = {
        title: document.title,
        text: "Mira esta publicación",
        url: location.href
      };

      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(location.href);
        alert("Enlace copiado.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") console.error(error);
    }
  });
});

document.querySelector("#publishDemo")?.addEventListener("click", async () => {
  if (!await requireUser("Debes iniciar sesión para publicar.")) return;

  alert("Tu sesión ya está conectada con Supabase. Las publicaciones reales se implementarán en la Fase 3.");
  dialog?.close();
});

if ("serviceWorker" in navigator && APP_CONFIG.enablePWA) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(console.error);
  });
}
