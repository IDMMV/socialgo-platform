import { supabase, getCurrentUser } from './supabase.js';
import { openOrRequestChat } from './chat-access.js';
import {
  deletePost,
  toggleLike,
  toggleSave,
  registerShare,
  loadComments,
  createComment,
  deleteComment,
  reportPost,
  blockUser
} from './publicaciones.js';

const qs = (selector, root = document) => root.querySelector(selector);
const selectorValue = value => String(value ?? '').replace(/[\"\\]/g, '\\$&');
const esc = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const fmtDate = value => value
  ? new Date(value).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
  : '';
const ago = value => {
  if (!value) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'Ahora';
  if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `Hace ${Math.floor(seconds / 3600)} h`;
  if (seconds < 604800) return `Hace ${Math.floor(seconds / 86400)} días`;
  return fmtDate(value);
};

const PROFILE_TYPES = {
  vecino: { label: 'Vecino', icon: 'ti-user', tabs: ['publicaciones', 'eventos', 'recomendaciones'] },
  profesional: { label: 'Profesional', icon: 'ti-briefcase', tabs: ['servicios', 'trabajos', 'resenas', 'publicaciones'] },
  negocio: { label: 'Negocio', icon: 'ti-building-store', tabs: ['publicaciones', 'ofertas', 'productos', 'opiniones'] },
  institucion: { label: 'Institución', icon: 'ti-building-community', tabs: ['comunicados', 'campanas', 'alertas_oficiales', 'eventos'] },
  organizacion: { label: 'Organización vecinal', icon: 'ti-users-group', tabs: ['actividades', 'reuniones', 'comunidad', 'eventos'] }
};
const TAB_LABELS = {
  publicaciones: 'Publicaciones', eventos: 'Eventos', recomendaciones: 'Recomendaciones', servicios: 'Servicios',
  trabajos: 'Trabajos', resenas: 'Reseñas', ofertas: 'Ofertas', productos: 'Productos', opiniones: 'Opiniones',
  comunicados: 'Comunicados', campanas: 'Campañas', alertas_oficiales: 'Alertas oficiales', actividades: 'Actividades',
  reuniones: 'Reuniones', comunidad: 'Comunidad'
};
const KIND_LABELS = {
  general: 'Publicación', consejo: 'Consejo', recomendacion: 'Recomendación', evento: 'Evento',
  comunicado: 'Comunicado', campana: 'Campaña', actividad: 'Actividad', reunion: 'Reunión', foto: 'Foto de la zona',
  trabajo: 'Trabajo realizado', producto: 'Producto', oferta: 'Oferta', empleo: 'Empleo', alerta_oficial: 'Alerta oficial'
};
const CATEGORY_ICONS = {
  general: 'ti-notes', consejo: 'ti-bulb', recomendacion: 'ti-thumb-up', evento: 'ti-calendar-event',
  comunicado: 'ti-speakerphone', campana: 'ti-heart-handshake', actividad: 'ti-walk', reunion: 'ti-users',
  foto: 'ti-photo', trabajo: 'ti-tools', producto: 'ti-package', oferta: 'ti-tag', empleo: 'ti-briefcase',
  alerta_oficial: 'ti-shield-check'
};

let currentUser = null;
let viewerProfile = null;
let profile = null;
let activeTab = null;
let datasets = { posts: [], services: [], offers: [], jobs: [], businesses: [] };
const EDIT_WINDOW_MS = 5 * 60 * 1000;

function initials(name) {
  return String(name || 'U').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
}
function typeInfo() { return PROFILE_TYPES[profile?.tipo_perfil] || PROFILE_TYPES.vecino; }
function isOwner() { return Boolean(currentUser && profile && String(currentUser.id) === String(profile.id)); }
function canSeeContent() {
  if (!profile) return false;
  if (isOwner()) return true;
  if (profile.privacidad_perfil !== 'privado') return true;
  return Boolean(profile.siguiendo || profile.estado_amistad === 'aceptada');
}
function editRemainingMs(post) {
  const created = new Date(post?.creado_en).getTime();
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, EDIT_WINDOW_MS - (Date.now() - created));
}
function canEditPost(post) { return isOwner() && editRemainingMs(post) > 0; }
function editRemainingLabel(post) {
  const ms = editRemainingMs(post);
  if (ms <= 0) return '';
  return `${Math.max(1, Math.ceil(ms / 60000))} min restantes`;
}
function toLocalDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function avatarMarkup(url, name, className = 'profile-post-avatar') {
  return url
    ? `<span class="${className}"><img src="${esc(url)}" alt="" loading="lazy"></span>`
    : `<span class="${className}">${esc(initials(name))}</span>`;
}
function toast(message, type = 'ok') {
  let node = qs('#profileToast');
  if (!node) {
    node = document.createElement('div');
    node.id = 'profileToast';
    node.className = 'profile-toast';
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.dataset.type = type;
  node.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.hidden = true; }, 3200);
}

async function queryProfile(username) {
  let result = await supabase.from('perfiles_publicos').select('*').eq('username', username).maybeSingle();
  if (!result.error && result.data) return result.data;
  result = await supabase.from('perfiles').select('*').eq('username', username).eq('estado', 'activo').maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}
async function safeQuery(builder) {
  try {
    const { data, error } = await builder;
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

async function loadViewerProfile() {
  if (!currentUser) return;
  viewerProfile = await safeQuery(
    supabase.from('perfiles').select('id,username,nombre_visible,avatar_url').eq('id', currentUser.id).limit(1)
  ).then(rows => rows[0] || null);
}

async function loadData() {
  if (!canSeeContent()) return;

  let posts = await safeQuery(
    supabase.from('publicaciones_feed')
      .select('*')
      .eq('autor_id', profile.id)
      .eq('visibilidad', 'public')
      .order('creado_en', { ascending: false })
      .limit(80)
  );

  // Compatibilidad con instalaciones antiguas que aún no tengan la vista completa.
  if (!posts.length) {
    posts = await safeQuery(
      supabase.from('publicaciones')
        .select('id,autor_id,titulo,contenido,tipo,archivo_url,miniatura_url,visibilidad,permitir_comentarios,categoria_publicacion,ubicacion_texto,fecha_evento,creado_en')
        .eq('autor_id', profile.id)
        .eq('visibilidad', 'public')
        .eq('estado_moderacion', 'aprobado')
        .order('creado_en', { ascending: false })
        .limit(80)
    );
  }

  datasets.posts = posts;
  datasets.services = await safeQuery(
    supabase.from('servicios_mizona').select('*').eq('propietario_id', profile.id).eq('estado', 'activo').order('created_at', { ascending: false }).limit(40)
  );
  datasets.businesses = await safeQuery(
    supabase.from('negocios').select('*').eq('propietario_id', profile.id).eq('estado', 'aprobado').order('creado_en', { ascending: false }).limit(10)
  );
  const businessIds = datasets.businesses.map(item => item.id);
  if (businessIds.length) {
    datasets.offers = await safeQuery(
      supabase.from('ofertas_negocios').select('*').in('comercio_id', businessIds).eq('estado', 'publicada').order('created_at', { ascending: false }).limit(40)
    );
  }
  datasets.jobs = await safeQuery(
    supabase.from('empleos_mizona').select('*').eq('publicador_id', profile.id).eq('estado', 'publicado').order('created_at', { ascending: false }).limit(40)
  );
}

function renderHeader() {
  const info = typeInfo();
  document.title = `${profile.nombre_visible || profile.username} · MiZona.pe`;

  const profileCard = qs('.public-profile-card');
  const cover = qs('#publicCover');
  const usesCover = ['negocio', 'institucion', 'organizacion'].includes(profile.tipo_perfil);
  profileCard?.classList.toggle('profile-compact', !usesCover);
  profileCard?.classList.toggle('profile-with-cover', usesCover);
  cover.hidden = !usesCover;
  cover.innerHTML = usesCover && profile.portada_url
    ? `<img src="${esc(profile.portada_url)}" alt="Portada de ${esc(profile.nombre_visible || profile.username)}">`
    : '';

  qs('#publicAvatar').innerHTML = profile.avatar_url
    ? `<img src="${esc(profile.avatar_url)}" alt="Foto de ${esc(profile.nombre_visible || profile.username)}">`
    : esc(initials(profile.nombre_visible || profile.username));
  qs('#publicName').innerHTML = `${esc(profile.nombre_visible || profile.username)} ${profile.verificado || profile.proveedor_estado === 'aprobado' ? '<span class="profile-verified" title="Perfil verificado"><i class="ti ti-rosette-discount-check-filled"></i></span>' : ''}`;
  qs('#publicHandle').textContent = `@${profile.username || 'usuario'}`;
  qs('#publicBio').textContent = profile.biografia || descriptionByType(profile.tipo_perfil);
  qs('#publicType').className = `profile-type-chip ${esc(profile.tipo_perfil || 'vecino')}`;
  qs('#publicType').innerHTML = `<i class="ti ${info.icon}"></i> ${info.label}`;

  const location = profile.mostrar_distrito_publico === false ? 'Ubicación privada' : (profile.distrito || 'Distrito no indicado');
  qs('#publicMeta').innerHTML = `<span><i class="ti ti-map-pin"></i>${esc(location)}</span><span><i class="ti ti-calendar"></i>En MiZona desde ${fmtDate(profile.creado_en || profile.created_at) || 'recientemente'}</span>`;
  qs('#statFollowers').textContent = Number(profile.total_seguidores || 0).toLocaleString('es-PE');
  qs('#statFollowing').textContent = Number(profile.total_seguidos || 0).toLocaleString('es-PE');
  qs('#statPosts').textContent = datasets.posts.length.toLocaleString('es-PE');

  const fourth = profile.tipo_perfil === 'profesional'
    ? datasets.services.length
    : profile.tipo_perfil === 'negocio'
      ? datasets.offers.length
      : datasets.posts.filter(item => ['evento', 'actividad', 'reunion'].includes(item.categoria_publicacion)).length;
  qs('#statExtra').textContent = Number(fourth || 0).toLocaleString('es-PE');
  qs('#statExtraLabel').textContent = profile.tipo_perfil === 'profesional' ? 'Servicios' : profile.tipo_perfil === 'negocio' ? 'Ofertas' : 'Actividades';

  renderActions();
  renderTabs();
  renderAside();
}
function descriptionByType(type) {
  return ({
    vecino: 'Comparte consejos, eventos y recomendaciones útiles para su comunidad.',
    profesional: 'Profesional local disponible para atender a vecinos de la zona.',
    negocio: 'Negocio local con productos, ofertas y novedades para la comunidad.',
    institucion: 'Cuenta institucional con comunicados y servicios oficiales.',
    organizacion: 'Organización vecinal que promueve actividades y participación comunitaria.'
  })[type] || '';
}

function renderActions() {
  const box = qs('#publicActions');
  if (isOwner()) {
    box.innerHTML = `<a class="profile-btn primary" href="perfil.html"><i class="ti ti-pencil"></i>Editar perfil</a><a class="profile-btn" href="publicar.html"><i class="ti ti-plus"></i>Publicar</a>`;
    return;
  }
  const followText = profile.siguiendo ? 'Siguiendo' : profile.seguimiento_pendiente ? 'Solicitud enviada' : 'Seguir';
  box.innerHTML = `<button class="profile-btn primary" id="followProfile"><i class="ti ${profile.siguiendo ? 'ti-user-check' : 'ti-user-plus'}"></i>${followText}</button>
    <button class="profile-btn" id="messageProfile"><i class="ti ti-message"></i>Mensaje</button>
    <button class="profile-btn" id="friendProfile"><i class="ti ti-users-plus"></i>${profile.estado_amistad === 'aceptada' ? 'Amigos' : profile.estado_amistad === 'pendiente' ? 'Solicitud enviada' : 'Agregar amigo'}</button>`;
  qs('#followProfile')?.addEventListener('click', toggleFollow);
  qs('#messageProfile')?.addEventListener('click', sendMessage);
  qs('#friendProfile')?.addEventListener('click', sendFriendRequest);
}

function renderTabs() {
  const tabs = typeInfo().tabs;
  activeTab = activeTab && tabs.includes(activeTab) ? activeTab : tabs[0];
  qs('#profileTabs').innerHTML = tabs.map(tab => `<button class="profile-tab ${tab === activeTab ? 'active' : ''}" data-tab="${tab}">${TAB_LABELS[tab] || tab}</button>`).join('');
  qs('#profileTabs').querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
    activeTab = button.dataset.tab;
    renderTabs();
    renderContent();
  }));
}

function filterPosts(tab) {
  const map = {
    publicaciones: null, eventos: ['evento'], recomendaciones: ['recomendacion', 'consejo'], trabajos: ['trabajo', 'foto'],
    comunicados: ['comunicado'], campanas: ['campana'], alertas_oficiales: ['alerta_oficial'], actividades: ['actividad'],
    reuniones: ['reunion'], comunidad: ['general', 'consejo', 'recomendacion'], productos: ['producto']
  };
  const kinds = map[tab];
  return kinds ? datasets.posts.filter(post => kinds.includes(post.categoria_publicacion || 'general')) : datasets.posts;
}

function postMenu(post) {
  const editable = canEditPost(post);
  if (isOwner()) {
    return `<button type="button" class="profile-menu-item" data-edit-profile-post="${esc(post.id)}" ${editable ? '' : 'disabled'}>
        <i class="ti ${editable ? 'ti-pencil' : 'ti-lock'}"></i><span>${editable ? 'Modificar publicación' : 'Edición cerrada'}${editable ? `<small>${editRemainingLabel(post)}</small>` : '<small>El plazo de 5 minutos terminó</small>'}</span>
      </button>
      <button type="button" class="profile-menu-item" data-save-profile-post="${esc(post.id)}"><i class="ti ${post.usuario_guardo ? 'ti-bookmark-filled' : 'ti-bookmark'}"></i><span>${post.usuario_guardo ? 'Quitar de guardados' : 'Guardar publicación'}</span></button>
      <button type="button" class="profile-menu-item danger" data-delete-profile-post="${esc(post.id)}"><i class="ti ti-trash"></i><span>Eliminar publicación<small>Disponible en cualquier momento</small></span></button>`;
  }
  return `<button type="button" class="profile-menu-item" data-save-profile-post="${esc(post.id)}"><i class="ti ${post.usuario_guardo ? 'ti-bookmark-filled' : 'ti-bookmark'}"></i><span>${post.usuario_guardo ? 'Quitar de guardados' : 'Guardar publicación'}</span></button>
    <button type="button" class="profile-menu-item" data-report-profile-post="${esc(post.id)}"><i class="ti ti-flag"></i><span>Reportar publicación</span></button>
    <button type="button" class="profile-menu-item danger" data-block-profile-user="${esc(post.autor_id)}"><i class="ti ti-user-off"></i><span>Bloquear esta cuenta</span></button>`;
}

function postCard(post) {
  const kind = post.categoria_publicacion || 'general';
  const title = String(post.titulo || '').trim();
  const text = String(post.contenido || '').trim();
  const displayName = profile.nombre_visible || profile.username || 'Usuario';
  const visibilityIcon = post.visibilidad === 'public' ? 'ti-world' : post.visibilidad === 'followers' ? 'ti-users' : post.visibilidad === 'friends' ? 'ti-user-check' : 'ti-lock';
  const totalLikes = Number(post.total_me_gusta || 0);
  const totalComments = Number(post.total_comentarios || 0);
  const totalShares = Number(post.total_compartidos || 0);

  const media = post.archivo_url && ['video', 'clip'].includes(post.tipo)
    ? `<div class="profile-post-media"><video src="${esc(post.archivo_url)}" controls playsinline preload="metadata"></video></div>`
    : post.archivo_url
      ? `<div class="profile-post-media"><img src="${esc(post.archivo_url)}" alt="Imagen publicada por ${esc(displayName)}" loading="lazy" data-profile-media></div>`
      : '';

  const details = [
    post.ubicacion_texto ? `<span><i class="ti ti-map-pin"></i>${esc(post.ubicacion_texto)}</span>` : '',
    post.fecha_evento ? `<span><i class="ti ti-calendar-event"></i>${esc(new Date(post.fecha_evento).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' }))}</span>` : ''
  ].filter(Boolean).join('');

  return `<article class="profile-post social-post" id="post-${esc(post.id)}" data-profile-post-id="${esc(post.id)}">
    <header class="profile-post-header">
      ${avatarMarkup(profile.avatar_url, displayName)}
      <div class="profile-post-author">
        <a href="usuario.html?u=${encodeURIComponent(profile.username || '')}">${esc(displayName)} ${profile.verificado ? '<span class="profile-inline-verified"><i class="ti ti-rosette-discount-check-filled"></i></span>' : ''}</a>
        <div class="profile-post-subline"><span>${esc(ago(post.creado_en))}</span><span aria-hidden="true">·</span><i class="ti ${visibilityIcon}" title="Visibilidad"></i><span class="profile-post-category"><i class="ti ${CATEGORY_ICONS[kind] || 'ti-notes'}"></i>${esc(KIND_LABELS[kind] || 'Publicación')}</span></div>
      </div>
      <div class="profile-post-menu-wrap">
        <button type="button" class="profile-post-menu-button" data-profile-menu-button="${esc(post.id)}" aria-label="Opciones de la publicación" aria-expanded="false"><i class="ti ti-dots"></i></button>
        <div class="profile-post-menu" data-profile-menu="${esc(post.id)}" hidden>${postMenu(post)}</div>
      </div>
    </header>

    ${(title || text) ? `<div class="profile-post-copy">${title ? `<h2>${esc(title)}</h2>` : ''}${text && text !== title ? `<p>${esc(text).replaceAll('\n', '<br>')}</p>` : ''}${details ? `<div class="profile-post-details">${details}</div>` : ''}</div>` : ''}
    ${media}

    <div class="profile-post-engagement">
      <span class="profile-reaction-summary"><i class="ti ti-heart-filled"></i><strong data-like-count="${esc(post.id)}">${totalLikes.toLocaleString('es-PE')}</strong></span>
      <span><button type="button" data-profile-comment-toggle="${esc(post.id)}"><strong data-comment-count="${esc(post.id)}">${totalComments.toLocaleString('es-PE')}</strong> comentario${totalComments === 1 ? '' : 's'}</button>${totalShares ? `<span> · ${totalShares.toLocaleString('es-PE')} compartido${totalShares === 1 ? '' : 's'}</span>` : ''}</span>
    </div>

    <div class="profile-post-actions social-actions">
      <button type="button" class="${post.usuario_dio_me_gusta ? 'active' : ''}" data-like-profile-post="${esc(post.id)}"><i class="ti ${post.usuario_dio_me_gusta ? 'ti-heart-filled' : 'ti-heart'}"></i><span>Me interesa</span></button>
      <button type="button" data-profile-comment-toggle="${esc(post.id)}" ${post.permitir_comentarios === false ? 'disabled' : ''}><i class="ti ti-message-circle"></i><span>Comentar</span></button>
      <button type="button" data-share-profile-post="${esc(post.id)}"><i class="ti ti-share-3"></i><span>Compartir</span></button>
    </div>

    <section class="profile-comments-panel" data-comments-panel="${esc(post.id)}" hidden>
      <div class="profile-comments-list" data-comments-list="${esc(post.id)}"><div class="profile-comments-loading"><i class="ti ti-loader-2"></i> Cargando comentarios…</div></div>
      ${post.permitir_comentarios === false
        ? '<div class="profile-comments-disabled"><i class="ti ti-message-off"></i> Los comentarios están desactivados en esta publicación.</div>'
        : currentUser
          ? `<form class="profile-comment-form" data-comment-form="${esc(post.id)}">
              ${avatarMarkup(viewerProfile?.avatar_url, viewerProfile?.nombre_visible || viewerProfile?.username || 'Tú', 'profile-comment-avatar')}
              <label><span class="sr-only">Escribe un comentario</span><input name="comment" maxlength="1200" autocomplete="off" placeholder="Escribe un comentario…" required></label>
              <button type="submit" aria-label="Publicar comentario"><i class="ti ti-send"></i></button>
            </form>`
          : `<a class="profile-login-comment" href="login.html?next=${encodeURIComponent(location.pathname + location.search)}"><i class="ti ti-login"></i> Inicia sesión para comentar</a>`}
    </section>
  </article>`;
}

function serviceCard(service) {
  return `<article class="profile-post profile-resource-card"><div class="profile-post-body"><span class="profile-post-kind">Servicio</span><h3>${esc(service.nombre)}</h3><p>${esc(service.descripcion || service.categoria || 'Servicio local')}</p><div class="profile-post-meta"><span>${service.tarifa_desde != null ? `Desde S/ ${Number(service.tarifa_desde).toFixed(0)}` : 'Cotización directa'}</span><span>${service.disponible !== false ? 'Disponible' : 'No disponible'}</span></div></div><div class="profile-post-actions"><button data-contact-provider="${esc(profile.id)}"><i class="ti ti-message"></i> Contactar</button><a href="servicios.html"><i class="ti ti-eye"></i> Ver servicio</a></div></article>`;
}
function offerCard(offer) {
  const price = offer.precio_oferta != null ? `S/ ${Number(offer.precio_oferta).toFixed(2)}` : (offer.descuento_texto || 'Oferta especial');
  return `<article class="profile-post profile-resource-card">${offer.imagen_url ? `<img src="${esc(offer.imagen_url)}" alt="${esc(offer.titulo)}" loading="lazy">` : ''}<div class="profile-post-body"><span class="profile-post-kind">Oferta</span><h3>${esc(offer.titulo)}</h3><p>${esc(offer.descripcion || offer.condiciones || 'Promoción disponible por tiempo limitado.')}</p><div class="profile-post-meta"><strong class="profile-offer-price">${esc(price)}</strong><span>${offer.vence_en ? `Hasta ${fmtDate(offer.vence_en)}` : 'Stock limitado'}</span></div></div><div class="profile-post-actions"><a href="oferta.html?id=${encodeURIComponent(offer.id)}"><i class="ti ti-tag"></i> Ver oferta</a><button data-share-offer="${offer.id}"><i class="ti ti-share"></i> Compartir</button></div></article>`;
}

function ownerComposer() {
  if (!isOwner() || activeTab !== 'publicaciones') return '';
  return `<a class="profile-composer" href="publicar.html">
    ${avatarMarkup(profile.avatar_url, profile.nombre_visible || profile.username, 'profile-composer-avatar')}
    <span>¿Qué está pasando en tu zona?</span>
    <i class="ti ti-photo"></i><i class="ti ti-calendar-event"></i>
  </a>`;
}

function renderContent() {
  const root = qs('#profileContent');
  if (!canSeeContent()) {
    root.innerHTML = `<div class="profile-private-box"><i class="ti ti-lock"></i><h2>Este perfil es privado</h2><p>Sigue a esta persona o envía una solicitud de amistad para ver sus publicaciones públicas autorizadas.</p><button class="profile-btn primary" id="privateFollow">Seguir</button></div>`;
    qs('#privateFollow')?.addEventListener('click', toggleFollow);
    return;
  }

  let rows = [];
  if (activeTab === 'servicios') rows = datasets.services.map(serviceCard);
  else if (activeTab === 'ofertas') rows = datasets.offers.map(offerCard);
  else if (activeTab === 'resenas' || activeTab === 'opiniones') rows = [];
  else rows = filterPosts(activeTab).map(postCard);

  root.innerHTML = `${ownerComposer()}<div class="profile-grid">${rows.length ? rows.join('') : `<div class="profile-empty"><i class="ti ti-notes-off"></i><strong>Aún no hay ${esc((TAB_LABELS[activeTab] || 'publicaciones').toLowerCase())}</strong><div>Cuando esta cuenta publique contenido, aparecerá aquí.</div>${isOwner() ? '<a class="profile-btn primary profile-empty-action" href="publicar.html"><i class="ti ti-plus"></i> Crear publicación</a>' : ''}</div>`}</div>`;
  bindContentActions(root);
}

function closePostMenus(exceptId = null) {
  document.querySelectorAll('[data-profile-menu]').forEach(menu => {
    if (exceptId && String(menu.dataset.profileMenu) === String(exceptId)) return;
    menu.hidden = true;
    const button = document.querySelector(`[data-profile-menu-button="${selectorValue(menu.dataset.profileMenu)}"]`);
    button?.setAttribute('aria-expanded', 'false');
  });
}
function updatePostCounters(post) {
  const card = document.querySelector(`[data-profile-post-id="${selectorValue(post.id)}"]`);
  if (!card) return;
  const likeButton = qs('[data-like-profile-post]', card);
  likeButton?.classList.toggle('active', Boolean(post.usuario_dio_me_gusta));
  if (likeButton) likeButton.innerHTML = `<i class="ti ${post.usuario_dio_me_gusta ? 'ti-heart-filled' : 'ti-heart'}"></i><span>Me interesa</span>`;
  const likeCount = qs('[data-like-count]', card);
  if (likeCount) likeCount.textContent = Number(post.total_me_gusta || 0).toLocaleString('es-PE');
  const commentCount = qs('[data-comment-count]', card);
  if (commentCount) commentCount.textContent = Number(post.total_comentarios || 0).toLocaleString('es-PE');
}
function renderInlineComment(comment) {
  const name = comment.nombre_visible || comment.username || 'Usuario';
  const mine = currentUser && String(currentUser.id) === String(comment.autor_id);
  return `<article class="profile-comment" data-comment-id="${esc(comment.id)}">
    ${avatarMarkup(comment.avatar_url, name, 'profile-comment-avatar')}
    <div class="profile-comment-bubble"><div><strong>${esc(name)}</strong><span>${esc(ago(comment.creado_en))}</span></div><p>${esc(comment.contenido).replaceAll('\n', '<br>')}</p></div>
    ${mine ? `<button type="button" class="profile-comment-delete" data-delete-inline-comment="${esc(comment.id)}" data-comment-post="${esc(comment.publicacion_id)}" aria-label="Eliminar comentario"><i class="ti ti-trash"></i></button>` : ''}
  </article>`;
}
async function loadInlineComments(postId) {
  const list = document.querySelector(`[data-comments-list="${selectorValue(postId)}"]`);
  if (!list) return;
  list.innerHTML = '<div class="profile-comments-loading"><i class="ti ti-loader-2"></i> Cargando comentarios…</div>';
  try {
    const comments = await loadComments(postId);
    list.innerHTML = comments.length
      ? comments.map(renderInlineComment).join('')
      : '<div class="profile-no-comments"><i class="ti ti-message-circle"></i><strong>Todavía no hay comentarios</strong><span>Sé la primera persona en comentar.</span></div>';
    bindInlineCommentDeletes(list);
  } catch (error) {
    list.innerHTML = `<div class="profile-comments-error"><i class="ti ti-alert-circle"></i>${esc(error.message || 'No se pudieron cargar los comentarios.')}</div>`;
  }
}
function bindInlineCommentDeletes(root) {
  root.querySelectorAll('[data-delete-inline-comment]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('¿Eliminar este comentario?')) return;
    button.disabled = true;
    try {
      await deleteComment(button.dataset.deleteInlineComment);
      const post = findPost(button.dataset.commentPost);
      if (post) {
        post.total_comentarios = Math.max(0, Number(post.total_comentarios || 0) - 1);
        updatePostCounters(post);
      }
      await loadInlineComments(button.dataset.commentPost);
      toast('Comentario eliminado.');
    } catch (error) {
      button.disabled = false;
      toast(error.message || 'No se pudo eliminar el comentario.', 'error');
    }
  }));
}
async function toggleCommentsPanel(postId) {
  const panel = document.querySelector(`[data-comments-panel="${selectorValue(postId)}"]`);
  if (!panel) return;
  const willOpen = panel.hidden;
  panel.hidden = !willOpen;
  if (willOpen) await loadInlineComments(postId);
}

function bindContentActions(root) {
  root.querySelectorAll('[data-contact-provider]').forEach(button => button.addEventListener('click', sendMessage));
  root.querySelectorAll('[data-share-offer]').forEach(button => button.addEventListener('click', () => shareUrl(`${location.origin}/oferta.html?id=${encodeURIComponent(button.dataset.shareOffer)}`, 'Oferta en MiZona')));

  root.querySelectorAll('[data-profile-menu-button]').forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();
    const postId = button.dataset.profileMenuButton;
    const menu = document.querySelector(`[data-profile-menu="${selectorValue(postId)}"]`);
    const opening = menu?.hidden;
    closePostMenus();
    if (menu && opening) {
      menu.hidden = false;
      button.setAttribute('aria-expanded', 'true');
    }
  }));

  root.querySelectorAll('[data-edit-profile-post]').forEach(button => button.addEventListener('click', () => {
    closePostMenus();
    openEditPost(button.dataset.editProfilePost);
  }));
  root.querySelectorAll('[data-delete-profile-post]').forEach(button => button.addEventListener('click', () => {
    closePostMenus();
    removeProfilePost(button.dataset.deleteProfilePost, button);
  }));

  root.querySelectorAll('[data-like-profile-post]').forEach(button => button.addEventListener('click', async () => {
    if (!await ensureLogin()) return;
    const post = findPost(button.dataset.likeProfilePost);
    if (!post) return;
    button.disabled = true;
    try {
      const liked = await toggleLike(post.id);
      post.usuario_dio_me_gusta = liked;
      post.total_me_gusta = Math.max(0, Number(post.total_me_gusta || 0) + (liked ? 1 : -1));
      updatePostCounters(post);
    } catch (error) {
      toast(error.message || 'No se pudo actualizar la reacción.', 'error');
    } finally {
      button.disabled = false;
    }
  }));

  root.querySelectorAll('[data-save-profile-post]').forEach(button => button.addEventListener('click', async () => {
    if (!await ensureLogin()) return;
    const post = findPost(button.dataset.saveProfilePost);
    if (!post) return;
    button.disabled = true;
    try {
      const saved = await toggleSave(post.id);
      post.usuario_guardo = saved;
      button.innerHTML = `<i class="ti ${saved ? 'ti-bookmark-filled' : 'ti-bookmark'}"></i><span>${saved ? 'Quitar de guardados' : 'Guardar publicación'}</span>`;
      toast(saved ? 'Publicación guardada.' : 'Publicación retirada de guardados.');
      closePostMenus();
    } catch (error) {
      button.disabled = false;
      toast(error.message || 'No se pudo guardar la publicación.', 'error');
    }
  }));

  root.querySelectorAll('[data-profile-comment-toggle]').forEach(button => button.addEventListener('click', () => toggleCommentsPanel(button.dataset.profileCommentToggle)));

  root.querySelectorAll('[data-comment-form]').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!await ensureLogin()) return;
    const postId = form.dataset.commentForm;
    const input = form.elements.comment;
    const content = input.value.trim();
    if (!content) return;
    const submit = qs('button[type="submit"]', form);
    submit.disabled = true;
    try {
      await createComment(postId, content);
      input.value = '';
      const post = findPost(postId);
      if (post) {
        post.total_comentarios = Number(post.total_comentarios || 0) + 1;
        updatePostCounters(post);
      }
      await loadInlineComments(postId);
    } catch (error) {
      toast(error.message || 'No se pudo publicar el comentario.', 'error');
    } finally {
      submit.disabled = false;
    }
  }));

  root.querySelectorAll('[data-share-profile-post]').forEach(button => button.addEventListener('click', async () => {
    if (!await ensureLogin()) return;
    const post = findPost(button.dataset.shareProfilePost);
    if (!post) return;
    try {
      await registerShare(post.id);
      post.total_compartidos = Number(post.total_compartidos || 0) + 1;
      await shareUrl(`${location.origin}/usuario.html?u=${encodeURIComponent(profile.username)}#post-${encodeURIComponent(post.id)}`, `${profile.nombre_visible || profile.username} compartió algo en MiZona`);
    } catch (error) {
      if (error?.name !== 'AbortError') toast(error.message || 'No se pudo compartir.', 'error');
    }
  }));

  root.querySelectorAll('[data-report-profile-post]').forEach(button => button.addEventListener('click', async () => {
    if (!await ensureLogin()) return;
    closePostMenus();
    const reason = prompt('¿Por qué deseas reportar esta publicación?');
    if (!reason?.trim()) return;
    try {
      await reportPost(button.dataset.reportProfilePost, reason.trim());
      toast('Reporte enviado para revisión.');
    } catch (error) {
      toast(error.message || 'No se pudo enviar el reporte.', 'error');
    }
  }));

  root.querySelectorAll('[data-block-profile-user]').forEach(button => button.addEventListener('click', async () => {
    if (!await ensureLogin()) return;
    closePostMenus();
    if (!confirm('¿Bloquear esta cuenta? Dejarás de ver sus publicaciones y no podrá interactuar contigo.')) return;
    try {
      await blockUser(button.dataset.blockProfileUser);
      toast('Cuenta bloqueada.');
      setTimeout(() => { location.href = 'explorar.html'; }, 900);
    } catch (error) {
      toast(error.message || 'No se pudo bloquear la cuenta.', 'error');
    }
  }));

  root.querySelectorAll('[data-profile-media]').forEach(image => image.addEventListener('error', () => {
    image.closest('.profile-post-media').innerHTML = '<div class="profile-media-unavailable"><i class="ti ti-photo-off"></i><strong>La imagen ya no está disponible</strong></div>';
  }, { once: true }));
}

function findPost(postId) { return datasets.posts.find(item => String(item.id) === String(postId)); }
function setEditStatus(message = '') {
  const box = qs('#editPostStatus');
  if (!box) return;
  box.textContent = message;
  box.hidden = !message;
}
function closeEditPost() {
  const dialog = qs('#editPostDialog');
  if (!dialog) return;
  if (typeof dialog.close === 'function' && dialog.open) dialog.close();
  else dialog.removeAttribute('open');
  setEditStatus('');
}
function openEditPost(postId) {
  const post = findPost(postId);
  if (!post) return toast('No se encontró la publicación.', 'error');
  if (!canEditPost(post)) {
    renderContent();
    return toast('El plazo de 5 minutos para modificar esta publicación ya terminó.', 'error');
  }
  qs('#editPostId').value = post.id;
  qs('#editPostTitle').value = post.titulo || '';
  qs('#editPostContent').value = post.contenido || '';
  qs('#editPostCategory').value = post.categoria_publicacion || 'general';
  qs('#editPostVisibility').value = post.visibilidad || 'public';
  qs('#editPostLocation').value = post.ubicacion_texto || '';
  qs('#editPostEventDate').value = toLocalDateTime(post.fecha_evento);
  qs('#editPostComments').checked = post.permitir_comentarios !== false;
  setEditStatus('');
  const dialog = qs('#editPostDialog');
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}
async function saveEditedPost(event) {
  event.preventDefault();
  const post = findPost(qs('#editPostId').value);
  if (!post) return setEditStatus('No se encontró la publicación.');
  if (!canEditPost(post)) {
    setEditStatus('El plazo de 5 minutos ya terminó. Cierra esta ventana y vuelve a cargar el perfil.');
    renderContent();
    return;
  }
  const title = qs('#editPostTitle').value.trim();
  const content = qs('#editPostContent').value.trim();
  if (!title && !content && !post.archivo_url) return setEditStatus('La publicación necesita un título o contenido.');

  const button = qs('#savePostChanges');
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<i class="ti ti-loader-2"></i> Guardando…';
  setEditStatus('');
  try {
    const eventValue = qs('#editPostEventDate').value;
    const payload = {
      titulo: title || null,
      contenido: content || null,
      categoria_publicacion: qs('#editPostCategory').value,
      visibilidad: qs('#editPostVisibility').value,
      ubicacion_texto: qs('#editPostLocation').value.trim() || null,
      fecha_evento: eventValue ? new Date(eventValue).toISOString() : null,
      permitir_comentarios: qs('#editPostComments').checked
    };
    const { data, error } = await supabase.from('publicaciones').update(payload)
      .eq('id', post.id).eq('autor_id', currentUser.id)
      .select('id,autor_id,titulo,contenido,tipo,archivo_url,miniatura_url,visibilidad,permitir_comentarios,categoria_publicacion,ubicacion_texto,fecha_evento,creado_en').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('No se pudo modificar. El plazo de 5 minutos puede haber terminado.');
    datasets.posts = datasets.posts.map(item => String(item.id) === String(data.id) ? { ...item, ...data } : item);
    closeEditPost();
    renderHeader();
    renderContent();
    toast('Publicación modificada correctamente.');
  } catch (error) {
    const message = /5 minutos|row-level security|42501/i.test(error.message || '')
      ? 'Solo puedes modificar tu publicación durante los primeros 5 minutos.'
      : (error.message || 'No se pudo modificar la publicación.');
    setEditStatus(message);
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}
async function removeProfilePost(postId, button) {
  const post = findPost(postId);
  if (!post) return toast('No se encontró la publicación.', 'error');
  if (!isOwner()) return toast('Solo el autor puede borrar esta publicación.', 'error');
  if (!confirm('¿Eliminar esta publicación definitivamente? Esta acción no se puede deshacer.')) return;
  const original = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.innerHTML = '<i class="ti ti-loader-2"></i><span>Eliminando…</span>';
  }
  try {
    await deletePost(post.id, post.archivo_url || null);
    datasets.posts = datasets.posts.filter(item => String(item.id) !== String(post.id));
    renderHeader();
    renderContent();
    toast('Publicación eliminada.');
  } catch (error) {
    toast(error.message || 'No se pudo borrar la publicación.', 'error');
    if (button) {
      button.disabled = false;
      button.innerHTML = original;
    }
  }
}
function bindEditDialog() {
  qs('#editPostForm')?.addEventListener('submit', saveEditedPost);
  document.querySelectorAll('[data-close-edit-dialog]').forEach(button => button.addEventListener('click', closeEditPost));
  qs('#editPostDialog')?.addEventListener('click', event => {
    if (event.target === event.currentTarget) closeEditPost();
  });
}

function renderAside() {
  const reason = ({
    vecino: 'Para recibir consejos, eventos y recomendaciones útiles de tu zona.',
    profesional: 'Para ver sus trabajos, servicios, disponibilidad y nuevas reseñas.',
    negocio: 'Para enterarte primero de ofertas, productos y novedades.',
    institucion: 'Para recibir comunicados, campañas y alertas oficiales.',
    organizacion: 'Para participar en actividades, reuniones y proyectos vecinales.'
  })[profile.tipo_perfil] || '';
  qs('#whyFollow').textContent = reason;
  const business = datasets.businesses[0];
  const contact = [];
  if (business?.direccion_publica) contact.push(`<span><i class="ti ti-map-pin"></i>${esc(business.direccion_publica)}</span>`);
  if (business?.whatsapp) contact.push(`<span><i class="ti ti-brand-whatsapp"></i>${esc(business.whatsapp)}</span>`);
  qs('#profileContact').innerHTML = contact.length ? contact.join('') : '<span>Los datos privados, el teléfono personal y la ubicación exacta nunca se muestran.</span>';
}

async function ensureLogin() {
  if (currentUser) return true;
  location.href = `login.html?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`;
  return false;
}
async function toggleFollow() {
  if (!await ensureLogin()) return;
  if (isOwner()) return;
  try {
    const { data, error } = await supabase.rpc('mizona_toggle_seguimiento', { p_seguido_id: profile.id });
    if (error) throw error;
    const state = Array.isArray(data) ? data[0] : data;
    profile.siguiendo = state?.estado === 'siguiendo';
    profile.seguimiento_pendiente = state?.estado === 'pendiente';
    if (state?.estado === 'dejado') profile.total_seguidores = Math.max(0, Number(profile.total_seguidores || 0) - 1);
    if (state?.estado === 'siguiendo') profile.total_seguidores = Number(profile.total_seguidores || 0) + 1;
    toast(state?.mensaje || 'Preferencia actualizada.');
    renderHeader();
    renderContent();
  } catch (error) {
    try {
      if (profile.siguiendo) {
        await supabase.from('seguidores').delete().eq('seguidor_id', currentUser.id).eq('seguido_id', profile.id);
        profile.siguiendo = false;
        profile.total_seguidores = Math.max(0, Number(profile.total_seguidores || 0) - 1);
      } else {
        await supabase.from('seguidores').insert({ seguidor_id: currentUser.id, seguido_id: profile.id });
        profile.siguiendo = true;
        profile.total_seguidores = Number(profile.total_seguidores || 0) + 1;
      }
      toast(profile.siguiendo ? 'Ahora sigues este perfil.' : 'Dejaste de seguirlo.');
      renderHeader();
      renderContent();
    } catch (fallback) {
      toast(fallback.message || error.message, 'error');
    }
  }
}
async function sendFriendRequest() {
  if (!await ensureLogin() || isOwner()) return;
  if (profile.estado_amistad === 'aceptada' || profile.estado_amistad === 'pendiente') return;
  const { error } = await supabase.rpc('enviar_solicitud_amistad', { p_destinatario: profile.id });
  if (error) toast(error.message, 'error');
  else {
    profile.estado_amistad = 'pendiente';
    toast('Solicitud de amistad enviada.');
    renderActions();
  }
}
async function sendMessage() {
  if (!await ensureLogin() || isOwner()) return;
  try {
    await openOrRequestChat(profile.id);
  } catch (error) {
    toast(error.message, 'error');
  }
}
async function shareUrl(url, text) {
  if (navigator.share) {
    await navigator.share({ title: 'MiZona.pe', text, url });
    return;
  }
  await navigator.clipboard.writeText(url);
  toast('Enlace copiado.');
}

async function init() {
  bindEditDialog();
  document.addEventListener('click', () => closePostMenus());
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closePostMenus();
  });

  const username = new URLSearchParams(location.search).get('u');
  const root = qs('#profileLoad');
  if (!username) {
    root.innerHTML = '<div class="profile-empty"><strong>Falta indicar el usuario.</strong></div>';
    return;
  }

  currentUser = await getCurrentUser();
  await loadViewerProfile();
  try {
    profile = await queryProfile(username);
    if (!profile) {
      root.innerHTML = '<div class="profile-empty"><strong>Perfil no encontrado.</strong></div>';
      return;
    }
    await loadData();
    root.hidden = true;
    qs('#profileReady').hidden = false;
    renderHeader();
    renderContent();
    if (location.hash.startsWith('#post-')) {
      requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    }
  } catch (error) {
    root.innerHTML = `<div class="profile-empty"><strong>No se pudo cargar el perfil.</strong><div>${esc(error.message)}</div></div>`;
  }
}

init();
