import { applyBrand, loadBrand } from "./brand.js";
import { supabase, getCurrentUser } from "./supabase.js";

const PAGE_INFO = {
  "admin.html": ["Administración", "Control general de MiZona"],
  "amistades.html": ["Amigos", "Tus contactos y solicitudes"],
  "explorar.html": ["Explorar", "Personas y contenido de tu zona"],
  "mensajes.html": ["Mensajes", "Conversaciones privadas"],
  "notificaciones.html": ["Notificaciones", "Actividad reciente de tu cuenta"],
  "usuario.html": ["Perfil público", "Información y publicaciones"],
};

const NAV_GROUPS = [
  ["Principal", [
    ["index.html", "ti-home", "Inicio"],
    ["alertas.html", "ti-bell", "Alertas"],
    ["mapa.html", "ti-map", "Mapa"],
    ["servicios.html", "ti-tool", "Servicios"],
    ["solicitudes.html", "ti-clipboard-list", "Solicitudes"],
  ]],
  ["Comunidad", [
    ["ofertas.html", "ti-tag", "Zona Ofertas"],
    ["ride.html", "ti-car", "MiZonaRide"],
    ["empleos.html", "ti-briefcase", "Empleos"],
  ]],
  ["Cuenta", [
    ["mensajes.html", "ti-message", "Mensajes"],
    ["amistades.html", "ti-users", "Amigos"],
    ["notificaciones.html", "ti-bell", "Notificaciones"],
    ["perfil.html", "ti-user", "Mi perfil"],
    ["negocio.html", "ti-building-store", "Mi negocio"],
  ]],
];

function currentFile() {
  return (location.pathname.split("/").pop() || "index.html").toLowerCase();
}

function ensureIcons() {
  if (document.querySelector('link[href*="tabler-icons"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css";
  document.head.appendChild(link);
}

function navMarkup(page) {
  return NAV_GROUPS.map(([label, links]) => `
    <div class="mz2-nav-label">${label}</div>
    <nav class="mz2-nav">
      ${links.map(([href, icon, text]) => `
        <a href="${href}" class="${page === href ? "active" : ""}">
          <i class="ti ${icon}" aria-hidden="true"></i><span>${text}</span>
        </a>`).join("")}
    </nav>`).join("");
}

function mobileMarkup(page) {
  const links = [
    ["index.html", "ti-home", "Inicio"],
    ["mapa.html", "ti-map", "Mapa"],
    ["servicios.html", "ti-tool", "Servicios"],
    ["mensajes.html", "ti-message", "Mensajes"],
    ["perfil.html", "ti-user", "Perfil"],
  ];
  return links.map(([href, icon, text]) => `
    <a href="${href}" class="${page === href ? "active" : ""}">
      <i class="ti ${icon}" aria-hidden="true"></i><span>${text}</span>
    </a>`).join("");
}

async function renderAccount(shell) {
  const guest = shell.querySelector("#mz2Guest");
  const account = shell.querySelector("#mz2Account");
  try {
    const user = await getCurrentUser();
    if (!user) {
      guest.hidden = false;
      account.hidden = true;
      return;
    }

    const { data } = await supabase
      .from("perfiles")
      .select("nombre_visible,username,avatar_url,distrito")
      .eq("id", user.id)
      .maybeSingle();

    const name = data?.nombre_visible || user.user_metadata?.nombre_visible || "Usuario";
    const username = data?.username ? `@${data.username}` : (data?.distrito || "MiZona");
    const initials = name.split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase() || "U";
    shell.querySelector("#mz2AccountName").textContent = name;
    shell.querySelector("#mz2AccountMeta").textContent = username;
    const avatar = shell.querySelector("#mz2AccountAvatar");
    avatar.innerHTML = data?.avatar_url ? `<img src="${String(data.avatar_url).replaceAll('"', '&quot;')}" alt="">` : initials;
    account.hidden = false;
    guest.hidden = true;
  } catch {
    guest.hidden = false;
    account.hidden = true;
  }
}

function buildShell(page, content) {
  const [title, subtitle] = PAGE_INFO[page] || [content.querySelector("h1")?.textContent?.trim() || "MiZona", "Tu comunidad, más cerca"];
  const shell = document.createElement("div");
  shell.className = "mz2-shell";
  shell.innerHTML = `
    <aside class="mz2-sidebar">
      <a class="mz2-brand" href="index.html">
        <span class="mz2-brand-mark">MZ</span>
        <span class="mz2-brand-text"><strong data-brand-name>MiZona</strong><small>mizona.pe</small></span>
      </a>
      <div id="mz2Account" class="mz2-account" hidden>
        <div id="mz2AccountAvatar" class="mz2-account-avatar">U</div>
        <div class="mz2-account-data"><strong id="mz2AccountName">Usuario</strong><small id="mz2AccountMeta">MiZona</small></div>
      </div>
      <div id="mz2Guest" class="mz2-guest-actions" hidden><a href="login.html">Ingresar</a><a href="registro.html">Registrarme</a></div>
      ${navMarkup(page)}
      <div class="mz2-sidebar-spacer"></div>
      <button class="mz2-publish" type="button" id="mz2Publish"><i class="ti ti-plus"></i> Publicar en mi zona</button>
    </aside>
    <section class="mz2-workspace">
      <header class="mz2-topbar">
        <div class="mz2-page-heading"><strong>${title}</strong><small>${subtitle}</small></div>
        <div class="mz2-topbar-spacer"></div>
        <button class="mz2-search-button" type="button" id="mz2Search"><i class="ti ti-search"></i><span>Buscar en tu zona…</span></button>
        <a class="mz2-top-action" href="notificaciones.html" aria-label="Notificaciones"><i class="ti ti-bell"></i></a>
        <a class="mz2-top-action" href="index.html" aria-label="Volver al inicio"><i class="ti ti-home"></i></a>
      </header>
      <div class="mz2-content"></div>
    </section>
    <nav class="mz2-mobile-nav">${mobileMarkup(page)}</nav>`;

  shell.querySelector(".mz2-content").appendChild(content);
  shell.querySelector("#mz2Search")?.addEventListener("click", () => location.href = "explorar.html");
  shell.querySelector("#mz2Publish")?.addEventListener("click", () => location.href = "index.html?publicar=1");
  return shell;
}

async function init() {
  const page = currentFile();
  const content = document.querySelector("body > main.page-shell");
  if (!content || document.body.classList.contains("auth-page") || document.body.classList.contains("clips-page")) return;
  if (document.querySelector("body > .mz-layout,body > .mz-layout-2col,body > .mz-app,body > .layout")) return;

  ensureIcons();
  content.querySelector(":scope > header")?.classList.add("mz-legacy-header");
  if (page === "mensajes.html") content.classList.add("mz-chat-page");

  const shell = buildShell(page, content);
  shell.hidden = content.hidden;
  document.body.insertBefore(shell, document.body.firstChild);
  document.body.classList.add("mz-shell-active");

  const observer = new MutationObserver(() => { shell.hidden = content.hidden; });
  observer.observe(content, { attributes: true, attributeFilter: ["hidden"] });

  applyBrand();
  loadBrand().catch(() => null);
  renderAccount(shell);
}

init();
