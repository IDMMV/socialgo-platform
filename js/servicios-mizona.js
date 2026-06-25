import { supabase, getCurrentUser } from "./supabase.js";
import { initMiZonaUI, escapeHtml, toast } from "./mizona-ui-v2.js";

initMiZonaUI();

const list = document.querySelector("#servicesList");
const count = document.querySelector("#serviceCount");
const searchInputs = [document.querySelector("#serviceSearch"), document.querySelector("#serviceSearchMobile")].filter(Boolean);
const category = document.querySelector("#serviceCategory");
const dialog = document.querySelector("#serviceDialog");
const form = document.querySelector("#serviceForm");
const status = document.querySelector("#serviceStatus");
let services = [];

function showStatus(message, isError = false) {
  status.hidden = false;
  status.textContent = message;
  status.style.borderColor = isError ? "var(--mz-red)" : "var(--mz-green)";
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `S/ ${number.toFixed(number % 1 ? 2 : 0)}` : "";
}

function priceLabel(item) {
  if (item.tarifa_desde != null && item.tarifa_hasta != null) return `${money(item.tarifa_desde)} – ${money(item.tarifa_hasta)}`;
  if (item.tarifa_desde != null) return `Desde ${money(item.tarifa_desde)}`;
  if (item.tarifa_hasta != null) return `Hasta ${money(item.tarifa_hasta)}`;
  return "Cotización directa";
}

function normalisePhone(value = "") {
  let digits = String(value).replace(/\D/g, "");
  if (digits.length === 9) digits = `51${digits}`;
  return digits;
}

function render() {
  const term = searchInputs[0]?.value.trim().toLowerCase() || searchInputs[1]?.value.trim().toLowerCase() || "";
  const selected = category.value;
  const visible = services.filter((item) => {
    const haystack = `${item.nombre || ""} ${item.categoria || ""} ${item.descripcion || ""} ${item.distrito || ""}`.toLowerCase();
    return (!term || haystack.includes(term)) && (selected === "todas" || item.categoria === selected);
  });

  count.textContent = `${visible.length} servicio${visible.length === 1 ? "" : "s"}`;
  if (!visible.length) {
    list.innerHTML = `<div class="mz-empty-state"><i class="ti ti-tool-off"></i><strong>No encontramos servicios con esos filtros.</strong><p>Prueba otra categoría o publica el primero en tu zona.</p></div>`;
    return;
  }

  list.innerHTML = visible.map((item) => {
    const phone = normalisePhone(item.whatsapp);
    const rating = Number(item.calificacion || 0);
    return `<article class="mz-feed-card">
      <div class="mz-feed-head">
        <div>
          <span class="mz-tag ${item.verificado ? "verificada" : "reportada"}">${item.verificado ? "✓ Verificado" : "Perfil publicado"}</span>
          <h3>${escapeHtml(item.nombre)}</h3>
        </div>
        <strong>${rating > 0 ? `★ ${rating.toFixed(1)}` : escapeHtml(priceLabel(item))}</strong>
      </div>
      <p>${escapeHtml(item.descripcion || "Servicio disponible en tu zona.")}</p>
      <div class="mz-feed-meta">
        <span><i class="ti ti-category"></i> ${escapeHtml(item.categoria)}</span>
        <span><i class="ti ti-map-pin"></i> ${escapeHtml(item.zona_atencion || item.distrito)}</span>
        <span><i class="ti ti-cash"></i> ${escapeHtml(priceLabel(item))}</span>
      </div>
      <div class="mz-feed-actions">
        ${phone ? `<button class="mz-btn success sm" data-whatsapp="${phone}" data-name="${escapeHtml(item.nombre)}"><i class="ti ti-brand-whatsapp"></i> WhatsApp</button>` : ""}
        <button class="mz-btn primary sm" data-contact="${item.propietario_id}" data-name="${escapeHtml(item.nombre)}"><i class="ti ti-message"></i> Contactar</button>
      </div>
    </article>`;
  }).join("");

  list.querySelectorAll("[data-whatsapp]").forEach((button) => {
    button.addEventListener("click", () => {
      const text = `Hola, vi tu servicio \"${button.dataset.name}\" en MiZona.pe y quisiera una cotización.`;
      window.open(`https://wa.me/${button.dataset.whatsapp}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    });
  });

  list.querySelectorAll("[data-contact]").forEach((button) => {
    button.addEventListener("click", () => startConversation(button.dataset.contact, button.dataset.name));
  });
}

async function loadServices() {
  list.innerHTML = `<div class="mz-loader">Cargando servicios...</div>`;
  const { data, error } = await supabase
    .from("servicios_mizona")
    .select("id,propietario_id,nombre,categoria,descripcion,distrito,zona_atencion,tarifa_desde,tarifa_hasta,whatsapp,disponible,verificado,calificacion,total_resenas")
    .eq("estado", "activo")
    .order("verificado", { ascending: false })
    .order("calificacion", { ascending: false })
    .limit(100);

  if (error) {
    list.innerHTML = `<div class="mz-empty-state"><i class="ti ti-database-exclamation"></i><strong>No se pudieron cargar los servicios.</strong><p>${escapeHtml(error.message)}</p></div>`;
    count.textContent = "Error";
    return;
  }

  services = data || [];
  render();
}

async function openForm() {
  const user = await getCurrentUser();
  if (!user) {
    location.href = `login.html?next=${encodeURIComponent("servicios.html#registrar")}`;
    return;
  }

  status.hidden = true;
  try {
    const { data: profile } = await supabase.from("perfiles").select("distrito,zona").eq("id", user.id).maybeSingle();
    if (profile?.distrito && !form.elements.distrito.value) form.elements.distrito.value = profile.distrito;
    if (profile?.zona && !form.elements.zona_atencion.value) form.elements.zona_atencion.value = profile.zona;
  } catch {}
  dialog.showModal();
}

async function startConversation(otherUserId, serviceName) {
  const user = await getCurrentUser();
  if (!user) {
    location.href = `login.html?next=${encodeURIComponent("servicios.html")}`;
    return;
  }
  if (user.id === otherUserId) {
    toast("Este servicio te pertenece.");
    return;
  }

  try {
    const { data, error } = await supabase.rpc("crear_o_obtener_conversacion", { p_otro_usuario: otherUserId });
    if (error) throw error;
    location.href = `mensajes.html?c=${encodeURIComponent(data)}`;
  } catch (error) {
    window.mzToast?.(`No se pudo abrir el chat de ${serviceName}: ${error.message}`, "error");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const user = await getCurrentUser();
  if (!user) return openForm();

  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  showStatus("Publicando servicio...");

  try {
    const fd = new FormData(form);
    const payload = {
      propietario_id: user.id,
      nombre: String(fd.get("nombre") || "").trim(),
      categoria: String(fd.get("categoria") || "Otros"),
      descripcion: String(fd.get("descripcion") || "").trim() || null,
      distrito: String(fd.get("distrito") || "").trim(),
      zona_atencion: String(fd.get("zona_atencion") || "").trim() || null,
      whatsapp: normalisePhone(fd.get("whatsapp")) || null,
      tarifa_desde: fd.get("tarifa_desde") ? Number(fd.get("tarifa_desde")) : null,
      tarifa_hasta: fd.get("tarifa_hasta") ? Number(fd.get("tarifa_hasta")) : null,
      disponible: true,
      estado: "activo"
    };

    if (payload.nombre.length < 3 || !payload.distrito) throw new Error("Completa el nombre y el distrito.");
    if (payload.tarifa_desde != null && payload.tarifa_hasta != null && payload.tarifa_desde > payload.tarifa_hasta) {
      throw new Error("La tarifa desde no puede ser mayor que la tarifa hasta.");
    }

    const { error } = await supabase.from("servicios_mizona").insert(payload);
    if (error) throw error;

    form.reset();
    dialog.close();
    window.mzToast?.("Servicio publicado correctamente.");
    await loadServices();
  } catch (error) {
    showStatus(error.message || "No se pudo publicar el servicio.", true);
  } finally {
    submit.disabled = false;
  }
});

searchInputs.forEach((input) => input.addEventListener("input", () => {
  searchInputs.forEach((other) => { if (other !== input) other.value = input.value; });
  render();
}));
category.addEventListener("change", render);
const initialSearch = new URLSearchParams(location.search).get("q");
if (initialSearch) searchInputs.forEach((input) => { input.value = initialSearch; });
document.querySelectorAll("#openServiceForm,#openServiceFormSecondary,#mobileServiceAdd").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); openForm(); }));
document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => dialog.close()));

if (location.hash === "#registrar") openForm();
loadServices();
