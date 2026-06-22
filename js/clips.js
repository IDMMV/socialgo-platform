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
import {
  MAX_CLIP_SECONDS,
  formatTime,
  readVideoMetadata,
  createTimelineThumbnails,
  captureCover,
  trimVideo,
  preloadVideoEditor
} from "./clip-editor.js";
import { uploadResumable } from "./resumable-upload.js";

applyBrand();

const feed = document.querySelector("#clipsFeed");
const createButton = document.querySelector("#createClipButton");
const bottomCreateButton = document.querySelector("#bottomCreateClip");
const editorDialog = document.querySelector("#clipUploadDialog");
const closeEditorButton = document.querySelector("#closeClipEditor");
const fileInput = document.querySelector("#clipFile");
const previewVideo = document.querySelector("#clipPreviewVideo");
const publishButton = document.querySelector("#publishClipButton");
const emptyState = document.querySelector("#editorEmptyState");
const editorControls = document.querySelector("#editorControls");
const originalDurationLabel = document.querySelector("#originalDuration");
const selectedDurationLabel = document.querySelector("#selectedDuration");
const timeline = document.querySelector("#thumbnailTimeline");
const trimStart = document.querySelector("#trimStart");
const trimEnd = document.querySelector("#trimEnd");
const trimStartTime = document.querySelector("#trimStartTime");
const trimEndTime = document.querySelector("#trimEndTime");
const resetTrimButton = document.querySelector("#resetTrim");
const toggleMuteButton = document.querySelector("#toggleMute");
const addTextButton = document.querySelector("#addClipText");
const textPanel = document.querySelector("#clipTextPanel");
const textInput = document.querySelector("#clipTextInput");
const textOverlay = document.querySelector("#clipTextOverlay");
const textColor = document.querySelector("#clipTextColor");
const textBackground = document.querySelector("#clipTextBackground");
const textSize = document.querySelector("#clipTextSize");
const chooseCoverButton = document.querySelector("#chooseCover");
const coverPanel = document.querySelector("#coverPickerPanel");
const coverTime = document.querySelector("#coverTime");
const coverTimeLabel = document.querySelector("#coverTimeLabel");
const coverCanvas = document.querySelector("#coverCanvas");
const description = document.querySelector("#clipDescription");
const visibility = document.querySelector("#clipVisibility");
const allowComments = document.querySelector("#clipAllowComments");
const allowDownload = document.querySelector("#clipAllowDownload");
const uploadStatus = document.querySelector("#clipUploadStatus");
const processingBox = document.querySelector("#processingBox");
const processingTitle = document.querySelector("#processingTitle");
const processingPercent = document.querySelector("#processingPercent");
const processingProgress = document.querySelector("#processingProgress");

const commentsDialog = document.querySelector("#clipCommentsDialog");
const commentsList = document.querySelector("#clipCommentsList");
const commentForm = document.querySelector("#clipCommentForm");
const commentText = document.querySelector("#clipCommentText");

let selectedFile = null;
let sourceDuration = 0;
let trimStartValue = 0;
let trimEndValue = 0;
let muted = false;
let activeCommentsPostId = null;
let observer = null;
let coverBlob = null;
let previewObjectUrl = null;
let isProcessing = false;
let textPosition = { x: 50, y: 48 };
let draggingText = false;
let dragOffset = { x: 0, y: 0 };

async function requireUser(message) {
  const user = await getCurrentUser();

  if (!user) {
    alert(message);
    location.href = "registro.html";
    return null;
  }

  return user;
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

function showStatus(message, isError = false) {
  uploadStatus.classList.remove("hidden");
  uploadStatus.textContent = message;
  uploadStatus.style.borderColor = isError ? "var(--danger)" : "#22c55e";
}

function hideStatus() {
  uploadStatus.classList.add("hidden");
}

function updateProcessing(percent, title) {
  processingBox.classList.remove("hidden");
  processingProgress.value = percent;
  processingPercent.textContent = `${percent}%`;
  processingTitle.textContent = title;
}

function updateTrimUI(changed = "start") {
  let start = Number(trimStart.value);
  let end = Number(trimEnd.value);

  if (changed === "start" && start > end - 0.1) {
    start = Math.max(0, end - 0.1);
    trimStart.value = start;
  }

  if (changed === "end" && end < start + 0.1) {
    end = Math.min(sourceDuration, start + 0.1);
    trimEnd.value = end;
  }

  if (end - start > MAX_CLIP_SECONDS) {
    if (changed === "start") {
      end = Math.min(sourceDuration, start + MAX_CLIP_SECONDS);
      trimEnd.value = end;
    } else {
      start = Math.max(0, end - MAX_CLIP_SECONDS);
      trimStart.value = start;
    }
  }

  trimStartValue = start;
  trimEndValue = end;

  const selected = end - start;
  trimStartTime.value = formatTime(start, true);
  trimEndTime.value = formatTime(end, true);
  selectedDurationLabel.textContent =
    `${formatTime(selected)} / ${formatTime(MAX_CLIP_SECONDS)}`;

  previewVideo.currentTime = Math.min(start, Math.max(0, sourceDuration - 0.05));

  selectedDurationLabel.classList.toggle(
    "trim-invalid",
    selected > MAX_CLIP_SECONDS
  );
}

async function openEditor() {
  if (!await requireUser("Regístrate o inicia sesión para crear un clip.")) return;
  resetEditor();
  editorDialog.showModal();
}

function resetEditor() {
  selectedFile = null;
  sourceDuration = 0;
  trimStartValue = 0;
  trimEndValue = 0;
  muted = false;
  coverBlob = null;
  fileInput.value = "";
  description.value = "";
  textInput.value = "";
  textOverlay.textContent = "";
  textOverlay.classList.add("hidden");
  textPosition = { x: 50, y: 48 };
  textOverlay.style.left = "50%";
  textOverlay.style.top = "48%";
  textOverlay.style.transform = "translate(-50%, -50%)";
  textColor.value = "#ffffff";
  textBackground.value = "dark";
  textSize.value = "28";
  applyTextStyle();
  textPanel.classList.add("hidden");
  coverPanel.classList.add("hidden");
  editorControls.hidden = true;
  emptyState.hidden = false;
  processingBox.classList.add("hidden");
  hideStatus();

  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }

  previewVideo.removeAttribute("src");
  previewVideo.load();
  timeline.innerHTML = "";
  publishButton.textContent = "Siguiente";
  publishButton.disabled = false;
}

async function handleSelectedVideo(file) {
  hideStatus();
  processingBox.classList.add("hidden");

  try {
    const metadata = await readVideoMetadata(file);
    selectedFile = file;
    sourceDuration = metadata.duration;

    trimStartValue = 0;
    trimEndValue = Math.min(sourceDuration, MAX_CLIP_SECONDS);

    trimStart.max = sourceDuration;
    trimEnd.max = sourceDuration;
    trimStart.value = 0;
    trimEnd.value = trimEndValue;
    coverTime.max = sourceDuration;
    coverTime.value = Math.min(1, sourceDuration);

    originalDurationLabel.textContent = formatTime(sourceDuration);
    emptyState.hidden = true;
    editorControls.hidden = false;

    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = URL.createObjectURL(file);
    previewVideo.src = previewObjectUrl;
    previewVideo.muted = muted;

    showStatus("Generando línea de tiempo…");
    const frames = await createTimelineThumbnails(file, sourceDuration, 10);
    timeline.innerHTML = frames
      .map(frame => `<img src="${frame}" alt="">`)
      .join("");

    hideStatus();
    updateTrimUI("start");
    await updateCover();

    if (sourceDuration > MAX_CLIP_SECONDS) {
      preloadVideoEditor((percent, title) => {
        if (!isProcessing) {
          showStatus(`${title} ${percent}%`);
          if (percent >= 8) setTimeout(hideStatus, 700);
        }
      });
    }
  } catch (error) {
    selectedFile = null;
    fileInput.value = "";
    showStatus(error.message, true);
  }
}

async function updateCover() {
  if (!selectedFile || !previewVideo.duration) return;

  coverTimeLabel.textContent = formatTime(Number(coverTime.value));
  coverBlob = await captureCover(
    previewVideo,
    coverCanvas,
    Number(coverTime.value)
  );
}

async function uploadClipFile(file, user) {
  const path = `${user.id}/${crypto.randomUUID()}.mp4`;

  return uploadResumable({
    bucket: "clips",
    path,
    file,
    contentType: "video/mp4",
    onProgress(percent) {
      updateProcessing(
        70 + Math.round(percent * 0.27),
        `Subiendo clip… ${percent}%`
      );
    }
  });
}

async function uploadCover(user) {
  if (!coverBlob) return null;

  const path = `${user.id}/portadas/${crypto.randomUUID()}.jpg`;

  const { error } = await supabase.storage
    .from("clips")
    .upload(path, coverBlob, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: false
    });

  if (error) throw error;

  const { data } = supabase.storage.from("clips").getPublicUrl(path);
  return { path, url: data.publicUrl };
}

async function processAndPublish() {
  const user = await requireUser("Debes iniciar sesión para publicar.");
  if (!user) return;

  if (!selectedFile) {
    showStatus("Selecciona o graba un video.", true);
    return;
  }

  const selectedDuration = trimEndValue - trimStartValue;

  if (selectedDuration <= 0 || selectedDuration > MAX_CLIP_SECONDS) {
    showStatus("Selecciona un fragmento de hasta 3 minutos.", true);
    return;
  }

  publishButton.disabled = true;
  publishButton.textContent = "Procesando…";
  hideStatus();

  let uploadedVideo = null;
  let uploadedCover = null;

  try {
    isProcessing = true;

    const usesWholeVideo =
      trimStartValue <= 0.05 &&
      Math.abs(trimEndValue - sourceDuration) <= 0.1 &&
      sourceDuration <= MAX_CLIP_SECONDS &&
      !muted;

    let processedFile = selectedFile;

    if (usesWholeVideo && selectedFile.type === "video/mp4") {
      updateProcessing(12, "Preparando carga rápida…");
    } else {
      processedFile = await trimVideo({
        file: selectedFile,
        start: trimStartValue,
        end: trimEndValue,
        muted,
        progressCallback(percent, title) {
          updateProcessing(Math.round(percent * 0.68), title);
        }
      });
    }

    updateProcessing(70, "Iniciando carga reanudable…");
    uploadedVideo = await uploadClipFile(processedFile, user);

    updateProcessing(98, "Subiendo portada…");
    uploadedCover = await uploadCover(user);

    const descriptionText = [
      textInput.value.trim(),
      description.value.trim()
    ].filter(Boolean).join("\n");

    const { error } = await supabase
      .from("publicaciones")
      .insert({
        autor_id: user.id,
        contenido: descriptionText || null,
        tipo: "clip",
        archivo_url: uploadedVideo.url,
        miniatura_url: uploadedCover?.url ?? null,
        visibilidad: visibility.value,
        permitir_comentarios: allowComments.checked,
        permitir_descargas: allowDownload.checked,
        estado_moderacion: "aprobado",
        duracion_segundos: Math.round(selectedDuration),
        clip_editor: {
          text: textInput.value.trim() || null,
          textColor: textColor.value,
          textBackground: textBackground.value,
          textSize: Number(textSize.value),
          textX: textPosition.x,
          textY: textPosition.y
        }
      });

    if (error) throw error;

    updateProcessing(100, "Clip publicado.");
    showStatus("Clip publicado correctamente.");

    setTimeout(async () => {
      editorDialog.close();
      resetEditor();
      await loadClips();
    }, 900);
  } catch (error) {
    if (uploadedVideo?.path) {
      await supabase.storage.from("clips").remove([uploadedVideo.path]);
    }

    if (uploadedCover?.path) {
      await supabase.storage.from("clips").remove([uploadedCover.path]);
    }

    const message = String(error?.message || "No se pudo procesar el video.");

    showStatus(
      message.includes("Worker")
        ? "No se pudo iniciar el editor de video. Actualiza la página y vuelve a intentarlo."
        : `${message} En celulares con poca memoria, usa un video más corto o de menor resolución.`,
      true
    );
  } finally {
    isProcessing = false;
    publishButton.disabled = false;
    publishButton.textContent = "Siguiente";
  }
}

function renderClip(clip) {
  const profileImage = clip.avatar_url || clip.portada_url || null;
  const avatar = profileImage
    ? `<img src="${escapeHtml(profileImage)}" alt="" style="width:44px;height:44px;border-radius:50%;object-fit:cover">`
    : `<span class="avatar">${escapeHtml(initials(clip.nombre_visible))}</span>`;

  return `
    <article class="clip-card paused" data-clip-id="${clip.id}">
      <video
        src="${escapeHtml(clip.archivo_url)}"
        poster="${escapeHtml(clip.miniatura_url || "")}"
        playsinline
        muted
        loop
        preload="metadata"></video>

      <div class="clip-gradient"></div>
      ${clip.clip_editor?.text ? `
        <div class="published-clip-text bg-${escapeHtml(clip.clip_editor.textBackground || "dark")}"
             style="
               left:${Number(clip.clip_editor.textX ?? 50)}%;
               top:${Number(clip.clip_editor.textY ?? 48)}%;
               color:${escapeHtml(clip.clip_editor.textColor || "#ffffff")};
               font-size:${Number(clip.clip_editor.textSize || 28)}px;">
          ${escapeHtml(clip.clip_editor.text)}
        </div>` : ""}
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
          <span>💬</span><small>${clip.total_comentarios ?? 0}</small>
        </button>
        <button data-clip-action="share" data-post-id="${clip.id}">
          <span>↗</span><small>${clip.total_compartidos ?? 0}</small>
        </button>
        <button data-clip-action="save" data-post-id="${clip.id}" class="${clip.usuario_guardo ? "active" : ""}">
          <span>🔖</span><small>Guardar</small>
        </button>
      </div>
    </article>`;
}

async function loadClips() {
  feed.innerHTML = `<section class="clip-empty"><div class="notice">Cargando clips…</div></section>`;

  const { data, error } = await supabase
    .from("clips_feed")
    .select("*")
    .order("creado_en", { ascending: false })
    .limit(50);

  if (error) {
    feed.innerHTML = `<section class="clip-empty"><div class="notice">${escapeHtml(error.message)}</div></section>`;
    return;
  }

  if (!data?.length) {
    feed.innerHTML = `<section class="clip-empty"><section class="page-card"><h1>Todavía no hay clips</h1><p>Presiona Crear para publicar el primero.</p></section></section>`;
    return;
  }

  feed.innerHTML = data.map(renderClip).join("");
  bindClipActions();
  startVideoObserver();
}

function startVideoObserver() {
  observer?.disconnect();

  observer = new IntersectionObserver(entries => {
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
      await toggleLike(button.dataset.postId);
      await loadClips();
    });
  });

  document.querySelectorAll('[data-clip-action="save"]').forEach(button => {
    button.addEventListener("click", async () => {
      if (!await requireUser("Regístrate para guardar clips.")) return;
      const saved = await toggleSave(button.dataset.postId);
      button.classList.toggle("active", saved);
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

      await registerShare(button.dataset.postId);
      const url = `${location.origin}/clips.html?clip=${button.dataset.postId}`;

      if (navigator.share) {
        await navigator.share({ title: document.title, text: "Mira este clip", url });
      } else {
        await navigator.clipboard.writeText(url);
        alert("Enlace copiado.");
      }
    });
  });
}

async function refreshComments() {
  const user = await getCurrentUser();
  const comments = await loadComments(activeCommentsPostId);

  commentsList.innerHTML = comments.length
    ? comments.map(comment => renderComment(comment, user?.id)).join("")
    : `<p class="notice">Todavía no hay comentarios.</p>`;

  document.querySelectorAll("[data-delete-comment]").forEach(button => {
    button.addEventListener("click", async () => {
      if (!confirm("¿Eliminar este comentario?")) return;
      await deleteComment(button.dataset.deleteComment);
      await refreshComments();
    });
  });
}

createButton?.addEventListener("click", openEditor);
document.querySelector("#bottomCreateClip")?.addEventListener("click", openEditor);

editorDialog.addEventListener("cancel", event => {
  if (isProcessing) {
    event.preventDefault();
    showStatus("La carga está en curso. Espera a que termine.", true);
    return;
  }

  if (selectedFile && !confirm("¿Salir del editor? Se perderán los cambios no publicados.")) {
    event.preventDefault();
  }
});

closeEditorButton?.addEventListener("click", () => {
  if (isProcessing) {
    showStatus("La carga está en curso. Espera a que termine.", true);
    return;
  }

  if (!selectedFile || confirm("¿Salir del editor? Se perderán los cambios no publicados.")) {
    editorDialog.close();
  }
});

window.addEventListener("beforeunload", event => {
  if (!isProcessing) return;
  event.preventDefault();
  event.returnValue = "";
});


fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) handleSelectedVideo(file);
});

trimStart.addEventListener("input", () => updateTrimUI("start"));
trimEnd.addEventListener("input", () => updateTrimUI("end"));

resetTrimButton.addEventListener("click", () => {
  trimStart.value = 0;
  trimEnd.value = Math.min(sourceDuration, MAX_CLIP_SECONDS);
  updateTrimUI("start");
});

toggleMuteButton.addEventListener("click", () => {
  muted = !muted;
  previewVideo.muted = muted;
  toggleMuteButton.firstChild.textContent = muted ? "🔇" : "🔊";
  toggleMuteButton.querySelector("small").textContent = muted ? "Silenciado" : "Sonido";
});

addTextButton.addEventListener("click", () => {
  textPanel.classList.toggle("hidden");
  textInput.focus();
});

function applyTextStyle() {
  textOverlay.style.color = textColor.value;
  textOverlay.style.fontSize = `${textSize.value}px`;
  textOverlay.dataset.background = textBackground.value;
  textOverlay.className = `clip-text-overlay bg-${textBackground.value}`;
  if (!textInput.value.trim()) textOverlay.classList.add("hidden");
}

textInput.addEventListener("input", () => {
  const text = textInput.value.trim();
  textOverlay.textContent = text;
  textOverlay.classList.toggle("hidden", !text);
  applyTextStyle();
});

textColor.addEventListener("input", applyTextStyle);
textBackground.addEventListener("change", applyTextStyle);
textSize.addEventListener("input", applyTextStyle);

textOverlay.addEventListener("pointerdown", event => {
  if (!textInput.value.trim()) return;

  draggingText = true;
  textOverlay.setPointerCapture(event.pointerId);
  const rect = textOverlay.getBoundingClientRect();
  dragOffset.x = event.clientX - rect.left - rect.width / 2;
  dragOffset.y = event.clientY - rect.top - rect.height / 2;
});

textOverlay.addEventListener("pointermove", event => {
  if (!draggingText) return;

  const previewRect = textOverlay.parentElement.getBoundingClientRect();
  const x = ((event.clientX - previewRect.left - dragOffset.x) / previewRect.width) * 100;
  const y = ((event.clientY - previewRect.top - dragOffset.y) / previewRect.height) * 100;

  textPosition.x = Math.max(8, Math.min(92, x));
  textPosition.y = Math.max(8, Math.min(92, y));

  textOverlay.style.left = `${textPosition.x}%`;
  textOverlay.style.top = `${textPosition.y}%`;
});

textOverlay.addEventListener("pointerup", event => {
  draggingText = false;
  try { textOverlay.releasePointerCapture(event.pointerId); } catch {}
});

chooseCoverButton.addEventListener("click", async () => {
  coverPanel.classList.toggle("hidden");
  if (!coverPanel.classList.contains("hidden")) await updateCover();
});

coverTime.addEventListener("input", updateCover);

previewVideo.addEventListener("timeupdate", () => {
  if (previewVideo.currentTime < trimStartValue) {
    previewVideo.currentTime = trimStartValue;
  }

  if (previewVideo.currentTime >= trimEndValue) {
    previewVideo.pause();
    previewVideo.currentTime = trimStartValue;
  }
});

publishButton.addEventListener("click", processAndPublish);

commentForm.addEventListener("submit", async event => {
  event.preventDefault();
  await createComment(activeCommentsPostId, commentText.value);
  commentText.value = "";
  await refreshComments();
});

document.querySelector("#closeClipComments")?.addEventListener("click", () => {
  commentsDialog.close();
});

await loadClips();
