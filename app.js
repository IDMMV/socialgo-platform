import { APP_CONFIG } from "./config.js";
import { applyBrand } from "./brand.js";

applyBrand();

const dialog = document.querySelector("#composerDialog");
for (const id of ["openComposer", "openComposer2", "mobileCreate"]) {
  document.querySelector(`#${id}`)?.addEventListener("click", () => dialog?.showModal());
}

document.querySelectorAll('[data-action="like"]').forEach((button) => {
  button.addEventListener("click", () => {
    const counter = button.querySelector("span");
    const active = button.classList.toggle("active");
    if (counter) counter.textContent = String(Number(counter.textContent) + (active ? 1 : -1));
    button.firstChild.textContent = active ? "♥ " : "♡ ";
  });
});

document.querySelectorAll('[data-action="save"]').forEach((button) => {
  button.addEventListener("click", () => {
    button.classList.toggle("active");
    if (!localStorage.getItem("socialgo_demo_user")) {
      alert("Regístrate para guardar publicaciones.");
    }
  });
});

document.querySelectorAll('[data-action="share"]').forEach((button) => {
  button.addEventListener("click", async () => {
    if (!localStorage.getItem("socialgo_demo_user")) {
      alert("Regístrate para compartir publicaciones desde SocialGo.");
      return;
    }
    const shareData = {
      title: document.title,
      text: "Mira esta publicación en SocialGo",
      url: location.href
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(location.href);
        alert("Enlace copiado.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") console.error(error);
    }
  });
});

document.querySelector("#publishDemo")?.addEventListener("click", () => {
  if (!localStorage.getItem("socialgo_demo_user")) {
    alert("Debes crear una cuenta o iniciar sesión para publicar.");
    location.href = "registro.html";
    return;
  }
  alert("Publicación de demostración creada. La conexión real con Supabase se añadirá en la siguiente fase.");
  dialog?.close();
});

if ("serviceWorker" in navigator && APP_CONFIG.enablePWA) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(console.error);
  });
}
