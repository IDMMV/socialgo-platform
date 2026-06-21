import { APP_CONFIG } from "./config.js";
import { applyBrand } from "./brand.js";
import { getCurrentUser } from "./supabase.js";
import { renderSessionControls } from "./session.js";
import {
  createPost,
  loadFeed,
  toggleLike,
  toggleSave,
  registerShare,
  deletePost,
  renderPost
} from "./publicaciones.js";

applyBrand();
await renderSessionControls();

const dialog = document.querySelector("#composerDialog");
const feed = document.querySelector("#feed");
const publishButton = document.querySelector("#publishDemo");
const postText = document.querySelector("#postText");
const visibility = document.querySelector("#postVisibility");
const allowDownload = document.querySelector("#allowDownload");
const allowComments = document.querySelector("#allowComments");

async function requireUser(message) {
  const user = await getCurrentUser();
  if (!user) {
    alert(message);
    location.href = "registro.html";
    return null;
  }
  return user;
}

async function refreshFeed() {
  if (!feed) return;

  feed.innerHTML = `<div class="notice">Cargando publicaciones…</div>`;

  try {
    const currentUser = await getCurrentUser();
    const posts = await loadFeed();

    if (!posts.length) {
      feed.innerHTML = `
        <section class="page-card">
          <h2>Todavía no hay publicaciones</h2>
          <p>Sé la primera persona en compartir algo.</p>
        </section>
      `;
      return;
    }

    feed.innerHTML = posts.map(post => renderPost(post, currentUser?.id)).join("");
    bindPostActions();
  } catch (error) {
    console.error(error);
    feed.innerHTML = `<div class="notice">No se pudo cargar el feed: ${error.message}</div>`;
  }
}

function bindPostActions() {
  document.querySelectorAll('[data-real-action="like"]').forEach(button => {
    button.addEventListener("click", async () => {
      if (!await requireUser("Regístrate para indicar que te gusta una publicación.")) return;

      try {
        await toggleLike(button.dataset.postId);
        await refreshFeed();
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.querySelectorAll('[data-real-action="save"]').forEach(button => {
    button.addEventListener("click", async () => {
      if (!await requireUser("Regístrate para guardar publicaciones.")) return;

      try {
        const saved = await toggleSave(button.dataset.postId);
        button.classList.toggle("active", saved);
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.querySelectorAll('[data-real-action="share"]').forEach(button => {
    button.addEventListener("click", async () => {
      if (!await requireUser("Regístrate para compartir publicaciones.")) return;

      try {
        await registerShare(button.dataset.postId);

        const url = `${location.origin}${location.pathname}?post=${button.dataset.postId}`;
        const shareData = {
          title: document.title,
          text: "Mira esta publicación",
          url
        };

        if (navigator.share) {
          await navigator.share(shareData);
        } else {
          await navigator.clipboard.writeText(url);
          alert("Enlace copiado.");
        }

        await refreshFeed();
      } catch (error) {
        if (error?.name !== "AbortError") alert(error.message);
      }
    });
  });

  document.querySelectorAll("[data-delete-post]").forEach(button => {
    button.addEventListener("click", async () => {
      if (!confirm("¿Eliminar esta publicación?")) return;

      try {
        await deletePost(button.dataset.deletePost);
        await refreshFeed();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

for (const id of ["openComposer", "openComposer2", "mobileCreate"]) {
  document.querySelector(`#${id}`)?.addEventListener("click", async () => {
    if (await requireUser("Regístrate o inicia sesión para publicar.")) {
      dialog?.showModal();
      postText?.focus();
    }
  });
}

publishButton?.addEventListener("click", async () => {
  if (!await requireUser("Debes iniciar sesión para publicar.")) return;

  publishButton.disabled = true;
  publishButton.textContent = "Publicando…";

  try {
    await createPost({
      content: postText.value,
      visibility: visibility.value,
      allowComments: allowComments.checked,
      allowDownloads: allowDownload.checked
    });

    postText.value = "";
    visibility.value = "public";
    allowComments.checked = true;
    allowDownload.checked = false;

    dialog?.close();
    await refreshFeed();
  } catch (error) {
    alert(error.message);
  } finally {
    publishButton.disabled = false;
    publishButton.textContent = "Publicar";
  }
});

await refreshFeed();

if ("serviceWorker" in navigator && APP_CONFIG.enablePWA) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(console.error);
  });
}
