import { APP_CONFIG } from "./config.js";
import { applyBrand } from "./brand.js";
import { getCurrentUser } from "./supabase.js";
import { renderSessionControls } from "./session.js";
import {
  createPost,
  updatePost,
  loadFeed,
  toggleLike,
  toggleSave,
  registerShare,
  deletePost,
  loadComments,
  createComment,
  deleteComment,
  reportPost,
  blockUser,
  renderPost,
  renderComment
} from "./publicaciones.js";

applyBrand();
await renderSessionControls();

const dialog = document.querySelector("#composerDialog");
const commentsDialog = document.querySelector("#commentsDialog");
const feed = document.querySelector("#feed");
const publishButton = document.querySelector("#publishDemo");
const postText = document.querySelector("#postText");
const visibility = document.querySelector("#postVisibility");
const allowDownload = document.querySelector("#allowDownload");
const allowComments = document.querySelector("#allowComments");
const postImage = document.querySelector("#postImage");
const postImagePreview = document.querySelector("#postImagePreview");
const postImagePreviewImg = document.querySelector("#postImagePreviewImg");
const removePostImage = document.querySelector("#removePostImage");
const commentsList = document.querySelector("#commentsList");
const commentForm = document.querySelector("#commentForm");
const commentText = document.querySelector("#commentText");

let selectedImage = null;
let activeCommentsPostId = null;

async function requireUser(message) {
  const user = await getCurrentUser();
  if (!user) {
    alert(message);
    location.href = "registro.html";
    return null;
  }
  return user;
}

postImage?.addEventListener("change", () => {
  selectedImage = postImage.files?.[0] ?? null;

  if (!selectedImage) {
    postImagePreview.classList.add("hidden");
    return;
  }

  postImagePreviewImg.src = URL.createObjectURL(selectedImage);
  postImagePreview.classList.remove("hidden");
});

removePostImage?.addEventListener("click", () => {
  selectedImage = null;
  postImage.value = "";
  postImagePreviewImg.removeAttribute("src");
  postImagePreview.classList.add("hidden");
});

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
        </section>`;
      return;
    }

    feed.innerHTML = posts.map(post => renderPost(post, currentUser?.id)).join("");
    bindPostActions();
  } catch (error) {
    console.error(error);
    feed.innerHTML = `<div class="notice">No se pudo cargar el feed: ${error.message}</div>`;
  }
}

async function openComments(postId) {
  if (!await requireUser("Regístrate para comentar.")) return;

  activeCommentsPostId = postId;
  commentsDialog.showModal();
  await refreshComments();
  commentText.focus();
}

async function refreshComments() {
  const currentUser = await getCurrentUser();
  commentsList.innerHTML = `<p class="notice">Cargando comentarios…</p>`;

  try {
    const comments = await loadComments(activeCommentsPostId);
    commentsList.innerHTML = comments.length
      ? comments.map(comment => renderComment(comment, currentUser?.id)).join("")
      : `<p class="notice">Todavía no hay comentarios.</p>`;

    document.querySelectorAll("[data-delete-comment]").forEach(button => {
      button.addEventListener("click", async () => {
        if (!confirm("¿Eliminar este comentario?")) return;
        await deleteComment(button.dataset.deleteComment);
        await refreshComments();
        await refreshFeed();
      });
    });
  } catch (error) {
    commentsList.innerHTML = `<p class="notice">${error.message}</p>`;
  }
}

function closeAllMenus() {
  document.querySelectorAll(".menu-popup").forEach(menu => menu.classList.add("hidden"));
}

function bindPostActions() {
  document.querySelectorAll("[data-post-menu]").forEach(button => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const menu = document.querySelector(`[data-menu-for="${button.dataset.postMenu}"]`);
      const wasHidden = menu.classList.contains("hidden");
      closeAllMenus();
      if (wasHidden) menu.classList.remove("hidden");
    });
  });

  document.querySelectorAll('[data-real-action="like"]').forEach(button => {
    button.addEventListener("click", async () => {
      if (!await requireUser("Regístrate para indicar que te gusta una publicación.")) return;
      await toggleLike(button.dataset.postId);
      await refreshFeed();
    });
  });

  document.querySelectorAll('[data-real-action="save"]').forEach(button => {
    button.addEventListener("click", async () => {
      if (!await requireUser("Regístrate para guardar publicaciones.")) return;
      const saved = await toggleSave(button.dataset.postId);
      button.classList.toggle("active", saved);
    });
  });

  document.querySelectorAll('[data-real-action="comment"]').forEach(button => {
    button.addEventListener("click", () => openComments(button.dataset.postId));
  });

  document.querySelectorAll('[data-real-action="share"]').forEach(button => {
    button.addEventListener("click", async () => {
      if (!await requireUser("Regístrate para compartir publicaciones.")) return;

      try {
        await registerShare(button.dataset.postId);
        const url = `${location.origin}${location.pathname}?post=${button.dataset.postId}`;
        const shareData = { title: document.title, text: "Mira esta publicación", url };

        if (navigator.share) await navigator.share(shareData);
        else {
          await navigator.clipboard.writeText(url);
          alert("Enlace copiado.");
        }

        await refreshFeed();
      } catch (error) {
        if (error?.name !== "AbortError") alert(error.message);
      }
    });
  });

  document.querySelectorAll("[data-edit-post]").forEach(button => {
    button.addEventListener("click", async () => {
      closeAllMenus();
      const article = button.closest(".post");
      const current = article.querySelector("p")?.innerText ?? "";
      const edited = prompt("Editar publicación:", current);
      if (edited === null) return;

      try {
        await updatePost(button.dataset.editPost, edited);
        await refreshFeed();
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.querySelectorAll("[data-delete-post]").forEach(button => {
    button.addEventListener("click", async () => {
      closeAllMenus();
      if (!confirm("¿Eliminar esta publicación?")) return;
      const article = button.closest(".post");

      try {
        await deletePost(button.dataset.deletePost, article.dataset.fileUrl || null);
        await refreshFeed();
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.querySelectorAll("[data-report-post]").forEach(button => {
    button.addEventListener("click", async () => {
      closeAllMenus();
      const reason = prompt("Indica brevemente el motivo del reporte:");
      if (!reason) return;

      try {
        await reportPost(button.dataset.reportPost, reason);
        alert("Reporte enviado. Gracias por ayudarnos a cuidar la comunidad.");
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.querySelectorAll("[data-block-user]").forEach(button => {
    button.addEventListener("click", async () => {
      closeAllMenus();
      if (!confirm("¿Bloquear a este usuario? Sus publicaciones dejarán de aparecer para ti.")) return;

      try {
        await blockUser(button.dataset.blockUser);
        await refreshFeed();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

document.addEventListener("click", closeAllMenus);

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
  publishButton.textContent = selectedImage ? "Comprimiendo y publicando…" : "Publicando…";

  try {
    await createPost({
      content: postText.value,
      visibility: visibility.value,
      allowComments: allowComments.checked,
      allowDownloads: allowDownload.checked,
      imageFile: selectedImage
    });

    postText.value = "";
    visibility.value = "public";
    allowComments.checked = true;
    allowDownload.checked = false;
    selectedImage = null;
    postImage.value = "";
    postImagePreview.classList.add("hidden");

    dialog?.close();
    await refreshFeed();
  } catch (error) {
    alert(error.message);
  } finally {
    publishButton.disabled = false;
    publishButton.textContent = "Publicar";
  }
});

commentForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeCommentsPostId) return;

  const button = commentForm.querySelector("button");
  button.disabled = true;

  try {
    await createComment(activeCommentsPostId, commentText.value);
    commentText.value = "";
    await refreshComments();
    await refreshFeed();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#closeComments")?.addEventListener("click", () => commentsDialog.close());

await refreshFeed();

if ("serviceWorker" in navigator && APP_CONFIG.enablePWA) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(console.error);
  });
}
