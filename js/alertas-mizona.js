
import { supabase, getCurrentUser } from "./supabase.js";
import { initMiZonaUI, toast, escapeHtml, timeAgo } from "./mizona-ui-v2.js";

initMiZonaUI();

const list = document.querySelector("#alertasLista");
const form = document.querySelector("#alertaForm");
const statusBox = document.querySelector("#alertaStatus");
const confirmRadius = 500;

const categoryColors = {
  robo:"#ff3b46",
  accidente:"#f59e0b",
  agua:"#2d7ff9",
  luz:"#60a5fa",
  persona:"#9b5cf6",
  mascota:"#f97316",
  incendio:"#ef4444",
  otro:"#64748b"
};

function showStatus(message, error=false){
  if(!statusBox) return;
  statusBox.hidden = false;
  statusBox.className = `mz-status ${error ? "error":"ok"}`;
  statusBox.textContent = message;
}

async function loadAlerts(){
  if(!list) return;
  list.innerHTML = `<div class="mz-loader">Cargando alertas...</div>`;

  const { data, error } = await supabase
    .from("alertas")
    .select("id,categoria,titulo,descripcion,distrito,zona_referencia,estado,tipo_fuente,latitud,longitud,created_at,autor_id,total_confirmaciones")
    .order("created_at",{ascending:false})
    .limit(40);

  if(error){
    list.innerHTML = `<div class="mz-empty">No se pudieron cargar las alertas: ${escapeHtml(error.message)}</div>`;
    return;
  }

  if(!data?.length){
    list.innerHTML = `<div class="mz-empty">Todavía no hay alertas en esta zona.</div>`;
    return;
  }

  list.innerHTML = data.map(a => `
    <article class="mz-feed-card" data-alert-id="${a.id}">
      <div class="mz-feed-head">
        <span class="mz-tag ${a.tipo_fuente === "oficial" ? "oficial" : a.estado === "verificada" ? "verificada" : a.estado === "resuelta" ? "resuelta" : "reportada"}">
          ${a.tipo_fuente === "oficial" ? "Fuente oficial" : a.estado === "verificada" ? "Verificada" : a.estado === "resuelta" ? "Resuelta" : "Reportada"}
        </span>
        <small>${timeAgo(a.created_at)}</small>
      </div>
      <h3>${escapeHtml(a.titulo)}</h3>
      <p>${escapeHtml(a.descripcion || "")}</p>
      <div class="mz-feed-meta">
        <span>📍 ${escapeHtml(a.zona_referencia || a.distrito)}</span>
        <span>👥 ${Number(a.total_confirmaciones || 0)} confirmaciones</span>
      </div>
      <div class="mz-feed-actions">
        <button class="mz-btn success sm" data-confirm="${a.id}">✓ Yo también lo vi</button>
        <button class="mz-btn ghost sm" data-share="${a.id}" data-title="${escapeHtml(a.titulo)}">Compartir</button>
        <a class="mz-btn ghost sm" href="mapa.html?alerta=${a.id}">Ver en mapa</a>
      </div>
    </article>
  `).join("");

  list.querySelectorAll("[data-confirm]").forEach(btn => {
    btn.addEventListener("click", () => confirmAlert(btn.dataset.confirm, btn));
  });

  list.querySelectorAll("[data-share]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const url = `${location.origin}${location.pathname.replace("alertas.html","mapa.html")}?alerta=${btn.dataset.share}`;
      const payload = { title: "MiZona.pe", text: btn.dataset.title, url };
      try{
        if(navigator.share) await navigator.share(payload);
        else {
          await navigator.clipboard.writeText(url);
          toast("Enlace copiado.");
        }
      }catch{}
    });
  });
}

async function confirmAlert(alertId, button){
  const user = await getCurrentUser();
  if(!user){
    location.href = `login.html?next=${encodeURIComponent("alertas.html")}`;
    return;
  }

  button.disabled = true;
  let coords = null;

  try{
    coords = await new Promise(resolve => {
      if(!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        pos => resolve({lat:pos.coords.latitude,lng:pos.coords.longitude}),
        () => resolve(null),
        {enableHighAccuracy:false,timeout:5000,maximumAge:300000}
      );
    });

    const { data, error } = await supabase.rpc("confirmar_alerta",{
      p_alerta_id: alertId,
      p_latitud: coords?.lat ?? null,
      p_longitud: coords?.lng ?? null
    });

    if(error) throw error;
    toast(data?.mensaje || "Confirmación registrada.");
    await loadAlerts();
  }catch(error){
    toast(error.message || "No se pudo confirmar.");
    button.disabled = false;
  }
}

form?.addEventListener("submit", async event => {
  event.preventDefault();
  const user = await getCurrentUser();
  if(!user){
    location.href = `login.html?next=${encodeURIComponent("alertas.html")}`;
    return;
  }

  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  showStatus("Enviando alerta...");

  try{
    const fd = new FormData(form);
    const payload = {
      autor_id:user.id,
      categoria:fd.get("categoria"),
      titulo:String(fd.get("titulo")||"").trim(),
      descripcion:String(fd.get("descripcion")||"").trim(),
      distrito:String(fd.get("distrito")||"").trim(),
      zona_referencia:String(fd.get("zona_referencia")||"").trim(),
      latitud:fd.get("latitud") ? Number(fd.get("latitud")) : null,
      longitud:fd.get("longitud") ? Number(fd.get("longitud")) : null,
      tipo_fuente:"ciudadana",
      estado:"reportada"
    };

    if(payload.titulo.length < 5 || payload.descripcion.length < 10){
      throw new Error("Describe mejor lo ocurrido antes de enviar.");
    }

    const { error } = await supabase.from("alertas").insert(payload);
    if(error) throw error;

    showStatus("Alerta enviada. Se mostrará como reportada hasta ser revisada.");
    form.reset();
    await loadAlerts();
  }catch(error){
    showStatus(error.message || "No se pudo publicar la alerta.",true);
  }finally{
    submit.disabled = false;
  }
});

document.querySelector("[data-use-location]")?.addEventListener("click", async () => {
  if(!navigator.geolocation){
    toast("Tu navegador no admite ubicación.");
    return;
  }
  navigator.geolocation.getCurrentPosition(pos => {
    form.elements.latitud.value = pos.coords.latitude.toFixed(6);
    form.elements.longitud.value = pos.coords.longitude.toFixed(6);
    toast("Ubicación aproximada agregada.");
  }, () => toast("No fue posible obtener la ubicación."), {enableHighAccuracy:true,timeout:8000});
});

loadAlerts();

const channel = supabase.channel("mizona-alertas")
  .on("postgres_changes",{event:"*",schema:"public",table:"alertas"},loadAlerts)
  .subscribe();

addEventListener("beforeunload",()=>supabase.removeChannel(channel));
