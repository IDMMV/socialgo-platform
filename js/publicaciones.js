import { supabase, getCurrentUser } from "./supabase.js";
import { uploadUserImage, removeStorageObject } from "./media.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function timeAgo(dateString) {
  const date = new Date(dateString);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "ahora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d`;

  return date.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined
  });
}

export async function createPost({
  content,
  title = null,
  category = "general",
  locationText = null,
  eventDate = null,
  visibility = "public",
  allowComments = true,
  allowDownloads = false,
  showAuthor = true,
  imageFile = null
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Debes iniciar sesión.");

  const cleanContent = String(content || "").trim();
  if (!cleanContent && !imageFile) {
    throw new Error("Escribe algo o selecciona una imagen.");
  }

  let upload = null;

  try {
    if (imageFile) {
      upload = await uploadUserImage({
        file: imageFile,
        bucket: "publicaciones",
        folder: "imagenes",
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 0.82
      });
    }

    const { data, error } = await supabase
      .from("publicaciones")
      .insert({
        autor_id: user.id,
        titulo: String(title || "").trim() || null,
        contenido: cleanContent || null,
        categoria_publicacion: category || "general",
        ubicacion_texto: String(locationText || "").trim() || null,
        fecha_evento: eventDate || null,
        perfil_autor_visible: showAuthor !== false,
        tipo: imageFile ? "imagen" : "texto",
        archivo_url: upload?.url ?? null,
        visibilidad: visibility,
        permitir_comentarios: allowComments,
        permitir_descargas: allowDownloads,
        estado_moderacion: "aprobado"
      })
      .select("id")
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    if (upload?.url) {
      await removeStorageObject("publicaciones", upload.url).catch(console.error);
    }
    throw error;
  }
}

export async function updatePost(postId, content) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Debes iniciar sesión.");

  const clean = String(content || "").trim();
  if (!clean) throw new Error("La publicación no puede quedar vacía.");

  const { error } = await supabase
    .from("publicaciones")
    .update({ contenido: clean })
    .eq("id", postId)
    .eq("autor_id", user.id);

  if (error) throw error;
}

export async function loadFeed(limit = 30) {
  const { data, error } = await supabase
    .from("publicaciones_feed")
    .select("*")
    .order("creado_en", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}


export async function createPoll({
  question,
  options,
  visibility = "public",
  durationDays = 7
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Debes iniciar sesión.");

  const cleanQuestion = String(question || "").trim();
  const cleanOptions = (options || [])
    .map(option => String(option || "").trim())
    .filter(Boolean);

  if (cleanQuestion.length < 3) {
    throw new Error("Escribe una pregunta válida.");
  }

  if (cleanOptions.length < 2 || cleanOptions.length > 6) {
    throw new Error("La encuesta debe tener entre 2 y 6 opciones.");
  }

  const closesAt = new Date(Date.now() + Number(durationDays) * 86400000).toISOString();

  const { data: post, error: postError } = await supabase
    .from("publicaciones")
    .insert({
      autor_id: user.id,
      contenido: cleanQuestion,
      tipo: "encuesta",
      visibilidad: visibility,
      permitir_comentarios: true,
      permitir_descargas: false,
      estado_moderacion: "aprobado"
    })
    .select("id")
    .single();

  if (postError) throw postError;

  const { error: pollError } = await supabase
    .from("encuestas")
    .insert({
      publicacion_id: post.id,
      creador_id: user.id,
      pregunta: cleanQuestion,
      cierra_en: closesAt
    });

  if (pollError) {
    await supabase.from("publicaciones").delete().eq("id", post.id);
    throw pollError;
  }

  const rows = cleanOptions.map((text, index) => ({
    publicacion_id: post.id,
    texto: text,
    orden: index + 1
  }));

  const { error: optionsError } = await supabase
    .from("encuesta_opciones")
    .insert(rows);

  if (optionsError) {
    await supabase.from("publicaciones").delete().eq("id", post.id);
    throw optionsError;
  }

  return post;
}

export async function votePoll(optionId) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Debes iniciar sesión para votar.");

  const { error } = await supabase.rpc("votar_encuesta", {
    p_opcion_id: optionId
  });

  if (error) throw error;
}

export async function loadPollDetails(postIds = []) {
  if (!postIds.length) return new Map();

  const { data, error } = await supabase
    .from("encuestas_feed")
    .select("*")
    .in("publicacion_id", postIds);

  if (error) throw error;

  const map = new Map();
  for (const row of data || []) {
    if (!map.has(row.publicacion_id)) {
      map.set(row.publicacion_id, {
        publicacion_id: row.publicacion_id,
        pregunta: row.pregunta,
        cierra_en: row.cierra_en,
        total_votos: Number(row.total_votos || 0),
        usuario_opcion_id: row.usuario_opcion_id,
        options: []
      });
    }

    map.get(row.publicacion_id).options.push({
      id: row.opcion_id,
      texto: row.opcion_texto,
      votos: Number(row.votos_opcion || 0)
    });
  }

  return map;
}

export async function toggleLike(postId) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Debes iniciar sesión.");

  const { data: existing, error: lookupError } = await supabase
    .from("me_gusta_publicaciones")
    .select("publicacion_id")
    .eq("publicacion_id", postId)
    .eq("usuario_id", user.id)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (existing) {
    const { error } = await supabase
      .from("me_gusta_publicaciones")
      .delete()
      .eq("publicacion_id", postId)
      .eq("usuario_id", user.id);

    if (error) throw error;
    return false;
  }

  const { error } = await supabase
    .from("me_gusta_publicaciones")
    .insert({ publicacion_id: postId, usuario_id: user.id });

  if (error) throw error;
  return true;
}

export async function toggleSave(postId) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Debes iniciar sesión.");

  const { data: existing, error: lookupError } = await supabase
    .from("publicaciones_guardadas")
    .select("publicacion_id")
    .eq("publicacion_id", postId)
    .eq("usuario_id", user.id)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (existing) {
    const { error } = await supabase
      .from("publicaciones_guardadas")
      .delete()
      .eq("publicacion_id", postId)
      .eq("usuario_id", user.id);

    if (error) throw error;
    return false;
  }

  const { error } = await supabase
    .from("publicaciones_guardadas")
    .insert({ publicacion_id: postId, usuario_id: user.id });

  if (error) throw error;
  return true;
}

export async function registerShare(postId) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Debes iniciar sesión.");

  const { error } = await supabase
    .from("publicaciones_compartidas")
    .insert({ publicacion_id: postId, usuario_id: user.id });

  if (error) throw error;
}

export async function deletePost(postId, fileUrl = null) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Debes iniciar sesión.");

  const { error } = await supabase
    .from("publicaciones")
    .delete()
    .eq("id", postId)
    .eq("autor_id", user.id);

  if (error) throw error;

  if (fileUrl) {
    await removeStorageObject("publicaciones", fileUrl).catch(console.error);
  }
}

export async function loadComments(postId) {
  const { data, error } = await supabase
    .from("comentarios_detalle")
    .select("*")
    .eq("publicacion_id", postId)
    .order("creado_en", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createComment(postId, content) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Debes iniciar sesión.");

  const clean = String(content || "").trim();
  if (!clean) throw new Error("Escribe un comentario.");

  const { error } = await supabase
    .from("comentarios")
    .insert({
      publicacion_id: postId,
      autor_id: user.id,
      contenido: clean
    });

  if (error) throw error;
}

export async function deleteComment(commentId) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Debes iniciar sesión.");

  const { error } = await supabase
    .from("comentarios")
    .delete()
    .eq("id", commentId)
    .eq("autor_id", user.id);

  if (error) throw error;
}

export async function reportPost(postId, reason) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Debes iniciar sesión.");

  const { error } = await supabase
    .from("reportes_contenido")
    .insert({
      reportante_id: user.id,
      publicacion_id: postId,
      motivo: reason
    });

  if (error) throw error;
}

export async function blockUser(blockedUserId) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Debes iniciar sesión.");
  if (blockedUserId === user.id) throw new Error("No puedes bloquearte a ti mismo.");

  const { error } = await supabase
    .from("usuarios_bloqueados")
    .upsert({
      bloqueador_id: user.id,
      bloqueado_id: blockedUserId
    });

  if (error) throw error;
}

export function renderPost(post, currentUserId, poll = null) {
  const isOwner = currentUserId && currentUserId === post.autor_id;
  const showAuthor = post.perfil_autor_visible !== false || isOwner;
  const displayName = showAuthor ? (post.nombre_visible || post.username || "Usuario") : "Vecino de tu zona";
  const displayUsername = showAuthor ? (post.username || "usuario") : "identidad protegida";
  const avatarText = escapeHtml(
    String(displayName || "U")
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part.charAt(0))
      .join("")
      .toUpperCase()
  );

  const profileImage = showAuthor ? (post.avatar_url || post.portada_url || null) : null;
  const avatar = profileImage
    ? `<div class="avatar"><img src="${escapeHtml(profileImage)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%"></div>`
    : `<div class="avatar">${showAuthor ? avatarText : "🛡"}</div>`;
  const categoryLabels = {general:"Publicación",consejo:"Consejo",recomendacion:"Recomendación",evento:"Evento",foto:"Foto de la zona",trabajo:"Trabajo realizado",producto:"Producto",comunicado:"Comunicado",campana:"Campaña",actividad:"Actividad",reunion:"Reunión",alerta_oficial:"Alerta oficial",empleo:"Empleo"};
  const categoryLabel = categoryLabels[post.categoria_publicacion] || "Publicación";
  const authorNameHtml = showAuthor
    ? `<a href="usuario.html?u=${encodeURIComponent(post.username || "")}" style="color:inherit;text-decoration:none">${escapeHtml(displayName)}</a>`
    : escapeHtml(displayName);


  const pollHtml = poll ? `
    <section class="poll-card">
      <strong>${escapeHtml(poll.pregunta)}</strong>
      <div class="poll-options">
        ${poll.options.map(option => {
          const percent = poll.total_votos
            ? Math.round((option.votos / poll.total_votos) * 100)
            : 0;
          const selected = poll.usuario_opcion_id === option.id;

          return `
            <button
              class="poll-option ${selected ? "selected" : ""}"
              data-poll-option-id="${option.id}"
              ${new Date(poll.cierra_en) <= new Date() ? "disabled" : ""}>
              <span class="poll-progress" style="width:${percent}%"></span>
              <span>${escapeHtml(option.texto)}</span>
              <strong>${percent}%</strong>
            </button>`;
        }).join("")}
      </div>
      <div class="poll-meta">
        <span>${poll.total_votos} voto${poll.total_votos === 1 ? "" : "s"}</span>
        <span>${new Date(poll.cierra_en) <= new Date()
          ? "Encuesta cerrada"
          : `Cierra ${new Date(poll.cierra_en).toLocaleString("es-PE")}`}</span>
      </div>
    </section>` : "";

  return `
    <article class="post" data-post-id="${post.id}" data-author-id="${post.autor_id}" data-file-url="${escapeHtml(post.archivo_url || "")}">
      <header class="post-header">
        ${avatar}
        <div>
          <strong>${authorNameHtml}</strong>
          <small>@${escapeHtml(displayUsername)} · ${timeAgo(post.creado_en)}</small>
          <span style="display:inline-flex;margin-top:4px;padding:2px 7px;border-radius:999px;background:#eef5ff;color:#185fa5;font-size:9px;font-weight:800">${escapeHtml(categoryLabel)}</span>
        </div>
        <button class="icon-button" data-post-menu="${post.id}" aria-label="Opciones">•••</button>

        <div class="menu-popup hidden" data-menu-for="${post.id}">
          ${isOwner ? `<button data-edit-post="${post.id}">✏️ Editar</button>
          <button data-delete-post="${post.id}">🗑️ Eliminar</button>` : `
          <button data-report-post="${post.id}">🚩 Reportar</button>
          <button data-block-user="${post.autor_id}">⛔ Bloquear usuario</button>`}
        </div>
      </header>

      ${post.contenido && post.tipo !== "encuesta" ? `<p>${escapeHtml(post.contenido).replaceAll("\n", "<br>")}</p>` : ""}

      ${pollHtml}

      ${post.archivo_url && post.tipo === "clip"
        ? `<video class="post-video" src="${escapeHtml(post.archivo_url)}" controls playsinline preload="metadata">
             Tu navegador no puede reproducir este video.
           </video>`
        : post.archivo_url
          ? `<img class="post-image"
                 src="${escapeHtml(post.archivo_url)}"
                 alt="Imagen publicada por ${escapeHtml(displayName)}"
                 loading="lazy"
                 onerror="this.outerHTML='<div class=&quot;media-unavailable&quot;>La imagen ya no está disponible.</div>'">`
          : ""}

      <footer class="post-actions">
        <button data-real-action="like" data-post-id="${post.id}">
          ${post.usuario_dio_me_gusta ? "♥" : "♡"} <span>${post.total_me_gusta ?? 0}</span>
        </button>

        <button data-real-action="comment" data-post-id="${post.id}" ${post.permitir_comentarios ? "" : "disabled"}>
          💬 <span>${post.total_comentarios ?? 0}</span>
        </button>

        <button data-real-action="share" data-post-id="${post.id}">
          ↗ <span>${post.total_compartidos ?? 0}</span>
        </button>

        <button data-real-action="save" data-post-id="${post.id}" class="${post.usuario_guardo ? "active" : ""}">
          🔖
        </button>
      </footer>
    </article>
  `;
}

export function renderComment(comment, currentUserId) {
  const isOwner = currentUserId === comment.autor_id;
  const initials = escapeHtml(
    String(comment.nombre_visible || comment.username || "U")
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part.charAt(0))
      .join("")
      .toUpperCase()
  );

  return `
    <article class="comment">
      <div class="avatar">${initials}</div>
      <div>
        <strong>${escapeHtml(comment.nombre_visible || "Usuario")}</strong>
        <small>@${escapeHtml(comment.username)} · ${timeAgo(comment.creado_en)}</small>
        <p>${escapeHtml(comment.contenido).replaceAll("\n", "<br>")}</p>
      </div>
      ${isOwner ? `<button class="icon-button" data-delete-comment="${comment.id}">🗑️</button>` : ""}
    </article>
  `;
}
