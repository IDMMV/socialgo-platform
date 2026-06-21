import { supabase, getCurrentUser } from "./supabase.js";

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
  visibility = "public",
  allowComments = true,
  allowDownloads = false
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Debes iniciar sesión.");

  const cleanContent = String(content || "").trim();
  if (!cleanContent) throw new Error("Escribe algo antes de publicar.");

  const { data, error } = await supabase
    .from("publicaciones")
    .insert({
      autor_id: user.id,
      contenido: cleanContent,
      tipo: "texto",
      visibilidad: visibility,
      permitir_comentarios: allowComments,
      permitir_descargas: allowDownloads,
      estado_moderacion: "aprobado"
    })
    .select("id")
    .single();

  if (error) throw error;
  return data;
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
    .insert({
      publicacion_id: postId,
      usuario_id: user.id
    });

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
    .insert({
      publicacion_id: postId,
      usuario_id: user.id
    });

  if (error) throw error;
  return true;
}

export async function registerShare(postId) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Debes iniciar sesión.");

  const { error } = await supabase
    .from("publicaciones_compartidas")
    .insert({
      publicacion_id: postId,
      usuario_id: user.id
    });

  if (error) throw error;
}

export async function deletePost(postId) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Debes iniciar sesión.");

  const { error } = await supabase
    .from("publicaciones")
    .delete()
    .eq("id", postId)
    .eq("autor_id", user.id);

  if (error) throw error;
}

export function renderPost(post, currentUserId) {
  const isOwner = currentUserId && currentUserId === post.autor_id;
  const avatar = escapeHtml(
    String(post.nombre_visible || post.username || "U")
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part.charAt(0))
      .join("")
      .toUpperCase()
  );

  return `
    <article class="post" data-post-id="${post.id}">
      <header class="post-header">
        <div class="avatar">${avatar}</div>
        <div>
          <strong>${escapeHtml(post.nombre_visible || "Usuario")}</strong>
          <small>@${escapeHtml(post.username || "usuario")} · ${timeAgo(post.creado_en)}</small>
        </div>
        ${isOwner ? `<button class="icon-button" data-delete-post="${post.id}" title="Eliminar">🗑️</button>` : `<span></span>`}
      </header>

      <p>${escapeHtml(post.contenido || "").replaceAll("\n", "<br>")}</p>

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
