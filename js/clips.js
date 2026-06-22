import { applyBrand } from "./brand.js";
import { supabase, getCurrentUser } from "./supabase.js";
import {
  toggleLike,
  toggleSave,
  registerShare,
  loadComments,
  createComment,
  deleteComment,
  renderComment
} from "./publicaciones.js";

applyBrand();

const feed = document.querySelector("#clipsFeed");
const createButton = document.querySelector("#createClipButton");
const uploadDialog = document.querySelector("#clipUploadDialog");
const uploadForm = document.querySelector("#clipUploadForm");
const fileInput = document.querySelector("#clipFile");
const preview = document.querySelector("#clipPreview");
const previewVideo = document.querySelector("#clipPreviewVideo");
const description = document.querySelector("#clipDescription");
const visibility = document.querySelector("#clipVisibility");
const allowComments = document.querySelector("#clipAllowComments");
const allowDownload = document.querySelector("#clipAllowDownload");
const publishButton = document.querySelector("#publishClipButton");
const uploadStatus = document.querySelector("#clipUploadStatus");

const commentsDialog = document.querySelector("#clipCommentsDialog");
const commentsList = document.querySelector("#clipCommentsList");
const commentForm = document.querySelector("#clipCommentForm");
const commentText = document.querySelector("#clipCommentText");

let selectedFile = null;
let selectedDuration = 0;
let activeCommentsPostId = null;
let observer = null;

async function requireUser(message) {
  const user = await getCurrentUser();

  if (!user) {
    alert(message);
    window.location.href = "registro.html";
    return null;
  }

  return user;
}

function showUploadStatus(message, isError = false) {
  uploadStatus.classList.remove("hidden");
  uploadStatus.textContent = message;
  uploadStatus.style.borderColor = isError ? "var(--danger)" : "#22c55e";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initials(value) {
  return String(value || "U")
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0))
    .join("")
    .toUpperCase();
}

function renderClip(clip) {
  const canDownload = Boolean(clip.permitir_descargas);
  const avatar = clip.avatar_url
    ? `<img src="${escapeHtml(clip.avatar_url)}" alt="" style="width:44px;height:44px;border-radius:50%;object-fit:cover">`
    : `<span class="avatar">${escapeHtml(initials(clip.nombre_visible))}</span>`;

  return `
    <article class="clip-card paused" data-clip-id="${clip.id}">
      <video
        src="${escapeHtml(clip.archivo_url)}"
        playsinline
        loop
        preload="metadata"></video>

      <div class="clip-gradient"></div>
      <div class="clip-play-overlay"><span>▶</span></div>

      <div class="clip-info">
        <div style="display:flex;align-items:center;gap:10px">
          ${avatar}
          <div>
            <strong>${escapeHtml(clip.nombre_visible || "Usuario")}</strong>
            <small>@${escapeHtml(clip.username || "usuario")}</small>
          </div>
        </div>
        ${clip.contenido ? `<p>${escapeHtml(clip.contenido).replaceAll("\n","<br>")}</p>` : ""}
        <small>${Math.round(clip.duracion_segundos || 0)} s</small>
      </div>

      <div class="clip-actions">
        <button data-clip-action="like" data-post-id="${clip.id}" class="${clip.usuario_dio_me_gusta ? "active" : ""}">
          <span>${clip.usuario_dio_me_gusta ? "♥" : "♡"}</span>
          <small>${clip.total_me_gusta ?? 0}</small>
        </button>

        <button data-clip-action="comment" data-post-id="${clip.id}">
          <span>💬</span>
          <small>${clip.total_comentarios ?? 0}</small>
        </button>

        <button data-clip-action="share" data-post-id="${clip.id}">
          <span>↗</span>
          <small>${clip.total_compartidos ?? 0}</small>
        </button>

        <button data-clip-action="save" data-post-id="${clip.id}" class="${clip.usuario_guardo ? "active" : ""}">
          <span>🔖</span>
          <small>Guardar</small>
        </button>

        ${canDownload ? `
          <button data-clip-action="download" data-url="${escapeHtml(clip.archivo_url)}" data-name="clip-${clip.id}.mp4">
            <span>⬇️</span>
            <small>Descargar</small>
          </button>` : ""}
      </div>
    </article>
  `;
}

async function loadClips() {
  feed.innerHTML = `
    <section class="clip-empty">
      <div class="notice">Cargando clips…</div>
    </section>`;

  const { data, error } = await supabase
    .from("clips_feed")
    .select("*")
    .order("creado_en", { ascending: false })
    .limit(50);

  if (error) {
    feed.innerHTML = `
      <section class="clip-empty">
        <div class="notice">No se pudieron cargar los clips: ${escapeHtml(error.message)}</div>
      </section>`;
    return;
  }

  if (!data?.length) {
    feed.innerHTML = `
      <section class="clip-empty">
        <section class="page-card">
          <h1>Todavía no hay clips</h1>
          <p>Presiona ＋ para publicar el primer video.</p>
        </section>
      </section>`;
    return;
  }

  feed.innerHTML = data.map(renderClip).join("");
  bindClipActions();
  startVideoObserver();
}

function startVideoObserver() {
  observer?.disconnect();

  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const card = entry.target;
      const video = card.querySelector("video");

      if (entry.isIntersecting && entry.intersectionRatio >= 0.72) {
        document.querySelectorAll(".clip-card video").forEach(other => {
          if (other !== video) {
            other.pause();
            other.closest(".clip-card")?.classList.add("paused");
          }
        });

        video.play()
          .then(() => card.classList.remove("paused"))
          .catch(() => card.classList.add("paused"));
      } else {
        video.pause();
        card.classList.add("paused");
      }
    }
  }, { threshold: [0.72] });

  document.querySelectorAll(".clip-card").forEach(card => observer.observe(card));
}

function bindClipActions() {
  document.querySelectorAll(".clip-card video").forEach(video => {
    video.addEventListener("click", () => {
      const card = video.closest(".clip-card");

      if (video.paused) {
        video.play();
        card.classList.remove("paused");
      } else {
        video.pause();
        card.classList.add("paused");
      }
    });
  });

  document.querySelectorAll('[data-clip-action="like"]').forEach(button => {
    button.addEventListener("click", async () => {
      if (!await requireUser("Regístrate para dar Me gusta.")) return;

      try {
        await toggleLike(button.dataset.postId);
        await loadClips();
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.querySelectorAll('[data-clip-action="save"]').forEach(button => {
    button.addEventListener("click", async () => {
      if (!await requireUser("Regístrate para guardar clips.")) return;

      try {
        const saved = await toggleSave(button.dataset.postId);
        button.classList.toggle("active", saved);
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.querySelectorAll('[data-clip-action="comment"]').forEach(button => {
    button.addEventListener("click", async () => {
      if (!await requireUser("Regístrate para comentar.")) return;
      activeCommentsPostId = button.dataset.postId;
      commentsDialog.showModal();
      await refreshComments();
    });
  });

  document.querySelectorAll('[data-clip-action="share"]').forEach(button => {
    button.addEventListener("click", async () => {
      if (!await requireUser("Regístrate para compartir clips.")) return;

      try {
        await registerShare(button.dataset.postId);

        const url = `${location.origin}/clips.html?clip=${button.dataset.postId}`;
        const shareData = {
          title: document.title,
          text: "Mira este clip",
          url
        };

        if (navigator.share) {
          await navigator.share(shareData);
        } else {
          await navigator.clipboard.writeText(url);
          alert("Enlace copiado.");
        }

        await loadClips();
      } catch (error) {
        if (error?.name !== "AbortError") alert(error.message);
      }
    });
  });

  document.querySelectorAll('[data-clip-action="download"]').forEach(button => {
    button.addEventListener("click", async () => {
      if (!await requireUser("Regístrate para descargar videos.")) return;

      try {
        const response = await fetch(button.dataset.url);
        if (!response.ok) throw new Error("No se pudo descargar el video.");

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = button.dataset.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

async function refreshComments() {
  const user = await getCurrentUser();
  commentsList.innerHTML = `<p class="notice">Cargando comentarios…</p>`;

  try {
    const comments = await loadComments(activeCommentsPostId);

    commentsList.innerHTML = comments.length
      ? comments.map(comment => renderComment(comment, user?.id)).join("")
      : `<p class="notice">Todavía no hay comentarios.</p>`;

    document.querySelectorAll("[data-delete-comment]").forEach(button => {
      button.addEventListener("click", async () => {
        if (!confirm("¿Eliminar este comentario?")) return;
        await deleteComment(button.dataset.deleteComment);
        await refreshComments();
        await loadClips();
      });
    });
  } catch (error) {
    commentsList.innerHTML = `<p class="notice">${escapeHtml(error.message)}</p>`;
  }
}

async function getVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = Number(video.duration || 0);
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer el video."));
    };
    video.src = url;
  });
}

async function uploadClip() {
  const user = await requireUser("Debes iniciar sesión para publicar.");
  if (!user) return;

  if (!selectedFile) {
    showUploadStatus("Selecciona o graba un video.", true);
    return;
  }

  publishButton.disabled = true;
  publishButton.textContent = "Subiendo…";
  showUploadStatus("Subiendo el video. No cierres esta ventana.");

  let uploadedPath = null;

  try {
    const extension =
      selectedFile.type === "video/webm" ? "webm" :
      selectedFile.type === "video/quicktime" ? "mov" : "mp4";

    uploadedPath = `${user.id}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("clips")
      .upload(uploadedPath, selectedFile, {
        contentType: selectedFile.type || "video/mp4",
        cacheControl: "3600",
        upsert: false
      });

    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage
      .from("clips")
      .getPublicUrl(uploadedPath);

    const { error: insertError } = await supabase
      .from("publicaciones")
      .insert({
        autor_id: user.id,
        contenido: description.value.trim() || null,
        tipo: "clip",
        archivo_url: publicData.publicUrl,
        visibilidad: visibility.value,
        permitir_comentarios: allowComments.checked,
        permitir_descargas: allowDownload.checked,
        estado_moderacion: "aprobado",
        duracion_segundos: Math.round(selectedDuration)
      });

    if (insertError) throw insertError;

    showUploadStatus("Clip publicado correctamente.");
    uploadForm.reset();
    selectedFile = null;
    selectedDuration = 0;
    preview.classList.add("hidden");
    previewVideo.removeAttribute("src");

    window.setTimeout(() => {
      uploadDialog.close();
      loadClips();
    }, 800);
  } catch (error) {
    if (uploadedPath) {
      await supabase.storage.from("clips").remove([uploadedPath]).catch(console.error);
    }
    showUploadStatus(error.message || "No se pudo publicar el clip.", true);
  } finally {
    publishButton.disabled = false;
    publishButton.textContent = "Publicar clip";
  }
}

createButton.addEventListener("click", async () => {
  if (!await requireUser("Regístrate o inicia sesión para crear un clip.")) return;
  uploadStatus.classList.add("hidden");
  uploadDialog.showModal();
});

fileInput.addEventListener("change", async () => {
  selectedFile = fileInput.files?.[0] ?? null;
  uploadStatus.classList.add("hidden");

  if (!selectedFile) {
    preview.classList.add("hidden");
    return;
  }

  if (!["video/mp4", "video/webm", "video/quicktime"].includes(selectedFile.type)) {
    selectedFile = null;
    fileInput.value = "";
    showUploadStatus("Formato no permitido. Usa MP4, WebM o MOV.", true);
    return;
  }

  if (selectedFile.size > 25 * 1024 * 1024) {
    selectedFile = null;
    fileInput.value = "";
    showUploadStatus("El video supera el máximo de 25 MB.", true);
    return;
  }

  try {
    selectedDuration = await getVideoDuration(selectedFile);

    if (selectedDuration <= 0 || selectedDuration > 60.5) {
      selectedFile = null;
      fileInput.value = "";
      showUploadStatus("El video debe durar como máximo 60 segundos.", true);
      return;
    }

    previewVideo.src = URL.createObjectURL(selectedFile);
    preview.classList.remove("hidden");
    showUploadStatus(`Video listo: ${Math.round(selectedDuration)} segundos.`);
  } catch (error) {
    selectedFile = null;
    fileInput.value = "";
    showUploadStatus(error.message, true);
  }
});

publishButton.addEventListener("click", uploadClip);

commentForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await createComment(activeCommentsPostId, commentText.value);
    commentText.value = "";
    await refreshComments();
    await loadClips();
  } catch (error) {
    alert(error.message);
  }
});

document.querySelector("#closeClipComments").addEventListener("click", () => {
  commentsDialog.close();
});

await loadClips();
