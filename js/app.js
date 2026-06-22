import { APP_CONFIG } from "./config.js";
import { applyBrand } from "./brand.js";
import { supabase, getCurrentUser } from "./supabase.js";
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
  renderComment,
  createPoll,
  votePoll,
  loadPollDetails
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

const pollDialog = document.querySelector("#pollDialog");
const pollOptionsBuilder = document.querySelector("#pollOptionsBuilder");
const pollQuestion = document.querySelector("#pollQuestion");
const pollDuration = document.querySelector("#pollDuration");
const pollVisibility = document.querySelector("#pollVisibility");
const pollStatus = document.querySelector("#pollStatus");
const publishPollButton = document.querySelector("#publishPoll");



function escapeUi(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initialsUi(value) {
  return String(value || "U")
    .split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join("").toUpperCase();
}

async function loadStories() {
  const container = document.querySelector("#storiesList");
  if (!container) return;

  const currentUser = await getCurrentUser();
  const { data, error } = await supabase
    .from("perfiles_publicos")
    .select("id,username,nombre_visible,avatar_url")
    .limit(12);

  if (error) return;

  const others = (data || []).filter(profile => profile.id !== currentUser?.id).slice(0, 8);
  const cards = others.map(profile => {
    const image = profile.avatar_url
      ? `<img src="${escapeUi(profile.avatar_url)}" alt="" loading="lazy">`
      : `<b>${escapeUi(initialsUi(profile.nombre_visible || profile.username))}</b>`;
    return `<a class="story" href="usuario.html?u=${encodeURIComponent(profile.username)}"><span>${image}</span><small>${escapeUi(profile.nombre_visible || profile.username)}</small></a>`;
  }).join("");

  container.insertAdjacentHTML("beforeend", cards);
}

function bindImageFallbacks() {
  document.querySelectorAll(".post-image").forEach(image => {
    image.addEventListener("error", () => {
      const fallback = document.createElement("div");
      fallback.className = "post-image-fallback";
      fallback.innerHTML = "<span>🖼️</span><strong>La imagen no está disponible</strong><small>Puede haber sido eliminada o su enlace venció.</small>";
      image.replaceWith(fallback);
    }, { once: true });
  });
}

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


document.querySelector("#quickPhoto")?.addEventListener("click", async () => {
  if (!await requireUser("Regístrate o inicia sesión para publicar una foto.")) return;
  dialog?.showModal();
  window.setTimeout(() => postImage?.click(), 150);
});

document.querySelector("#quickClip")?.addEventListener("click", async () => {
  if (!await requireUser("Regístrate o inicia sesión para crear un clip.")) return;
  window.location.href = "clips.html";
});

document.querySelector("#quickPoll")?.addEventListener("click", async () => {
  if (!await requireUser("Regístrate o inicia sesión para crear una encuesta.")) return;
  pollStatus.classList.add("hidden");
  pollDialog.showModal();
  pollQuestion.focus();
});

async function refreshFeed() {
  if (!feed) return;

  feed.innerHTML = `<div class="notice">Cargando publicaciones…</div>`;

  try {
    const currentUser = await getCurrentUser();
    const posts = await loadFeed();
    const pollPostIds = posts.filter(post => post.tipo === "encuesta").map(post => post.id);
    const polls = await loadPollDetails(pollPostIds);

    if (!posts.length) {
      feed.innerHTML = `
        <section class="page-card">
          <h2>Todavía no hay publicaciones</h2>
          <p>Sé la primera persona en compartir algo.</p>
        </section>`;
      return;
    }

    feed.innerHTML = posts.map(post => renderPost(post, currentUser?.id, polls.get(post.id))).join("");
    bindPostActions();
    bindImageFallbacks();
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


function bindPollActions() {
  document.querySelectorAll("[data-poll-option-id]").forEach(button => {
    button.addEventListener("click", async () => {
      if (!await requireUser("Debes iniciar sesión para votar.")) return;

      try {
        await votePoll(button.dataset.pollOptionId);
        await refreshFeed();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function bindPostActions() {
  bindPollActions();
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

for (const id of ["openComposer", "openComposer2", "mobileCreate", "topCreate"]) {
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


document.querySelector("#addPollOption")?.addEventListener("click", () => {
  const current = pollOptionsBuilder.querySelectorAll(".poll-builder-row").length;
  if (current >= 6) {
    alert("Máximo 6 opciones.");
    return;
  }

  const row = document.createElement("div");
  row.className = "poll-builder-row";
  row.innerHTML = `
    <input class="poll-option-input" maxlength="120" placeholder="Opción ${current + 1}">
    <button type="button" class="secondary">✕</button>`;

  row.querySelector("button").addEventListener("click", () => row.remove());
  pollOptionsBuilder.appendChild(row);
  row.querySelector("input").focus();
});

pollOptionsBuilder.querySelectorAll(".poll-builder-row button").forEach(button => {
  if (!button.disabled) {
    button.addEventListener("click", () => button.closest(".poll-builder-row").remove());
  }
});

publishPollButton?.addEventListener("click", async () => {
  if (!await requireUser("Debes iniciar sesión para publicar una encuesta.")) return;

  const options = [...pollOptionsBuilder.querySelectorAll(".poll-option-input")]
    .map(input => input.value.trim())
    .filter(Boolean);

  publishPollButton.disabled = true;
  pollStatus.classList.remove("hidden");
  pollStatus.textContent = "Publicando encuesta…";

  try {
    await createPoll({
      question: pollQuestion.value,
      options,
      visibility: pollVisibility.value,
      durationDays: Number(pollDuration.value)
    });

    pollQuestion.value = "";
    pollOptionsBuilder.innerHTML = `
      <div class="poll-builder-row">
        <input class="poll-option-input" maxlength="120" placeholder="Opción 1">
        <button type="button" class="secondary" disabled>✕</button>
      </div>
      <div class="poll-builder-row">
        <input class="poll-option-input" maxlength="120" placeholder="Opción 2">
        <button type="button" class="secondary" disabled>✕</button>
      </div>`;

    pollStatus.textContent = "Encuesta publicada.";
    setTimeout(() => {
      pollDialog.close();
      refreshFeed();
    }, 700);
  } catch (error) {
    pollStatus.textContent = error.message;
    pollStatus.style.borderColor = "var(--danger)";
  } finally {
    publishPollButton.disabled = false;
  }
});


async function refreshMessagesBadge() {
  const user = await getCurrentUser();
  const badge = document.querySelector("#messagesBadge");
  if (!user || !badge) return;
  const { count, error } = await supabase
    .from("mensajes")
    .select("id", { count: "exact", head: true })
    .neq("remitente_id", user.id)
    .eq("leido", false);
  if (!error && count) {
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.hidden = false;

    const topBadge = document.querySelector("#topNotificationBadge");
    if (topBadge) {
      topBadge.textContent = badge.textContent;
      topBadge.hidden = false;
    }
  } else badge.hidden = true;
}

async function refreshNotificationBadge() {
  const user = await getCurrentUser();
  const badge = document.querySelector("#notificationBadge");
  if (!user || !badge) return;

  const { count, error } = await supabase
    .from("notificaciones")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", user.id)
    .eq("leida", false);

  if (!error && count) {
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}


document.querySelector("#closeComments")?.addEventListener("click", () => commentsDialog.close());

await loadStories();
await refreshFeed();
await refreshNotificationBadge();
await refreshMessagesBadge();

if ("serviceWorker" in navigator && APP_CONFIG.enablePWA) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(console.error);
  });
}
