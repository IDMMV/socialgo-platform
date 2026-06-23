import { supabase, getCurrentUser } from "./supabase.js";
import { initMiZonaUI, escapeHtml, timeAgo } from "./mizona-ui-v2.js";

initMiZonaUI();

const list = document.querySelector("#requestsList");
const count = document.querySelector("#requestCount");
const searchInputs = [document.querySelector("#requestSearch"), document.querySelector("#requestSearchMobile")].filter(Boolean);
const category = document.querySelector("#requestCategory");
const dialog = document.querySelector("#requestDialog");
const form = document.querySelector("#requestForm");
const status = document.querySelector("#requestStatus");
let requests = [];
let currentUser = null;

function showStatus(message, isError = false) {
  status.hidden = false;
  status.textContent = message;
  status.style.borderColor = isError ? "var(--mz-red)" : "var(--mz-green)";
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `S/ ${number.toFixed(number % 1 ? 2 : 0)}` : "";
}

function budget(item) {
  if (item.presupuesto_desde != null && item.presupuesto_hasta != null) return `${money(item.presupuesto_desde)} – ${money(item.presupuesto_hasta)}`;
  if (item.presupuesto_desde != null) return `Desde ${money(item.presupuesto_desde)}`;
  if (item.presupuesto_hasta != null) return `Hasta ${money(item.presupuesto_hasta)}`;
  return "Presupuesto por conversar";
}

function urgencyLabel(value) {
  return value === "urgente" ? "Urgente" : value === "hoy" ? "Para hoy" : "Normal";
}

function render() {
  const term = searchInputs[0]?.value.trim().toLowerCase() || searchInputs[1]?.value.trim().toLowerCase() || "";
  const selected = category.value;
  const visible = requests.filter((item) => {
    const haystack = `${item.titulo || ""} ${item.categoria || ""} ${item.descripcion || ""} ${item.distrito || ""}`.toLowerCase();
    return (!term || haystack.includes(term)) && (selected === "todas" || item.categoria === selected);
  });

  count.textContent = `${visible.length} solicitud${visible.length === 1 ? "" : "es"}`;
  if (!visible.length) {
    list.innerHTML = `<div class="mz-empty-state"><i class="ti ti-clipboard-off"></i><strong>No hay solicitudes con esos filtros.</strong><p>Publica una necesidad para que los profesionales de tu zona puedan verla.</p></div>`;
    return;
  }

  list.innerHTML = visible.map((item) => {
    const own = currentUser?.id === item.usuario_id;
    return `<article class="mz-feed-card">
      <div class="mz-feed-head">
        <div><span class="mz-tag ${item.urgencia === "urgente" ? "reportada" : "verificada"}">${escapeHtml(urgencyLabel(item.urgencia))}</span><h3>${escapeHtml(item.titulo)}</h3></div>
        <strong>${escapeHtml(budget(item))}</strong>
      </div>
      <p>${escapeHtml(item.descripcion)}</p>
      <div class="mz-feed-meta"><span><i class="ti ti-category"></i> ${escapeHtml(item.categoria)}</span><span><i class="ti ti-map-pin"></i> ${escapeHtml(item.distrito)}</span><span><i class="ti ti-clock"></i> ${timeAgo(item.created_at)}</span></div>
      <div class="mz-feed-actions">
        ${own
          ? `<button class="mz-btn success sm" data-resolve="${item.id}"><i class="ti ti-check"></i> Marcar resuelta</button>`
          : `<button class="mz-btn primary sm" data-contact="${item.usuario_id}" data-title="${escapeHtml(item.titulo)}"><i class="ti ti-send"></i> Enviar propuesta</button>`}
      </div>
    </article>`;
  }).join("");

  list.querySelectorAll("[data-contact]").forEach((button) => button.addEventListener("click", () => startConversation(button.dataset.contact, button.dataset.title)));
  list.querySelectorAll("[data-resolve]").forEach((button) => button.addEventListener("click", () => resolveRequest(button.dataset.resolve)));
}

async function loadRequests() {
  currentUser = await getCurrentUser();
  if (!currentUser) {
    list.innerHTML = `<div class="mz-empty-state"><i class="ti ti-lock"></i><strong>Inicia sesión para ver las solicitudes.</strong><p>Por privacidad, las necesidades de los vecinos solo se muestran a usuarios registrados.</p><a class="mz-btn primary" href="login.html?next=solicitudes.html">Iniciar sesión</a></div>`;
    count.textContent = "Acceso privado";
    return;
  }

  const { data, error } = await supabase
    .from("solicitudes_mizona")
    .select("id,usuario_id,categoria,titulo,descripcion,distrito,presupuesto_desde,presupuesto_hasta,urgencia,estado,fecha_necesaria,created_at")
    .eq("estado", "abierta")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    list.innerHTML = `<div class="mz-empty-state"><i class="ti ti-database-exclamation"></i><strong>No se pudieron cargar las solicitudes.</strong><p>${escapeHtml(error.message)}</p></div>`;
    count.textContent = "Error";
    return;
  }

  requests = data || [];
  render();
}

async function openForm() {
  currentUser = await getCurrentUser();
  if (!currentUser) {
    location.href = `login.html?next=${encodeURIComponent("solicitudes.html#publicar")}`;
    return;
  }

  status.hidden = true;
  try {
    const { data: profile } = await supabase.from("perfiles").select("distrito").eq("id", currentUser.id).maybeSingle();
    if (profile?.distrito && !form.elements.distrito.value) form.elements.distrito.value = profile.distrito;
  } catch {}
  dialog.showModal();
}

async function startConversation(otherUserId, title) {
  currentUser = currentUser || await getCurrentUser();
  if (!currentUser) return openForm();
  try {
    const { data, error } = await supabase.rpc("crear_o_obtener_conversacion", { p_otro_usuario: otherUserId });
    if (error) throw error;
    sessionStorage.setItem("mizona_chat_context", `Propuesta para: ${title}`);
    location.href = `mensajes.html?c=${encodeURIComponent(data)}`;
  } catch (error) {
    window.mzToast?.(`No se pudo abrir el chat: ${error.message}`, "error");
  }
}

async function resolveRequest(id) {
  if (!confirm("¿Confirmas que esta solicitud ya fue resuelta?")) return;
  const { error } = await supabase.from("solicitudes_mizona").update({ estado: "resuelta" }).eq("id", id).eq("usuario_id", currentUser.id);
  if (error) window.mzToast?.(error.message, "error");
  else {
    window.mzToast?.("Solicitud marcada como resuelta.");
    await loadRequests();
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  currentUser = currentUser || await getCurrentUser();
  if (!currentUser) return openForm();

  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  showStatus("Publicando solicitud...");

  try {
    const fd = new FormData(form);
    const payload = {
      usuario_id: currentUser.id,
      categoria: String(fd.get("categoria") || "Otros"),
      titulo: String(fd.get("titulo") || "").trim(),
      descripcion: String(fd.get("descripcion") || "").trim(),
      distrito: String(fd.get("distrito") || "").trim(),
      presupuesto_desde: fd.get("presupuesto_desde") ? Number(fd.get("presupuesto_desde")) : null,
      presupuesto_hasta: fd.get("presupuesto_hasta") ? Number(fd.get("presupuesto_hasta")) : null,
      urgencia: String(fd.get("urgencia") || "normal"),
      fecha_necesaria: fd.get("fecha_necesaria") || null,
      estado: "abierta"
    };

    if (payload.titulo.length < 5 || payload.descripcion.length < 10 || !payload.distrito) throw new Error("Completa el título, la descripción y el distrito.");
    if (payload.presupuesto_desde != null && payload.presupuesto_hasta != null && payload.presupuesto_desde > payload.presupuesto_hasta) {
      throw new Error("El presupuesto desde no puede ser mayor que el presupuesto hasta.");
    }

    const { error } = await supabase.from("solicitudes_mizona").insert(payload);
    if (error) throw error;

    form.reset();
    dialog.close();
    window.mzToast?.("Solicitud publicada correctamente.");
    await loadRequests();
  } catch (error) {
    showStatus(error.message || "No se pudo publicar la solicitud.", true);
  } finally {
    submit.disabled = false;
  }
});

searchInputs.forEach((input) => input.addEventListener("input", () => {
  searchInputs.forEach((other) => { if (other !== input) other.value = input.value; });
  render();
}));
category.addEventListener("change", render);
document.querySelectorAll("#openRequestForm,#openRequestFormSecondary,#mobileRequestAdd").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); openForm(); }));
document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => dialog.close()));

if (location.hash === "#publicar") openForm();
loadRequests();
