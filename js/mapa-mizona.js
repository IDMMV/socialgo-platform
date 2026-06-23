
import { supabase } from "./supabase.js";
import { initMiZonaUI, escapeHtml, timeAgo } from "./mizona-ui-v2.js";

initMiZonaUI();

const defaultCenter = [-11.861, -77.073]; // Ventanilla aprox.
const map = L.map("mapaCompleto",{zoomControl:true}).setView(defaultCenter,13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
  maxZoom:19,
  attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

const colors = {
  robo:"#ff3b46", accidente:"#f59e0b", agua:"#2d7ff9", luz:"#60a5fa",
  persona:"#9b5cf6", mascota:"#f97316", incendio:"#ef4444", otro:"#64748b"
};

let markers = [];
let allAlerts = [];
let currentFilter = "todas";

function markerIcon(color){
  return L.divIcon({
    className:"",
    html:`<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:3px solid white;box-shadow:0 5px 15px rgba(0,0,0,.35)">
      <span style="display:block;width:8px;height:8px;border-radius:50%;background:white;margin:7px"></span>
    </div>`,
    iconSize:[28,28], iconAnchor:[14,28], popupAnchor:[0,-28]
  });
}

function render(){
  markers.forEach(m=>map.removeLayer(m));
  markers=[];

  const visible = allAlerts.filter(a => currentFilter === "todas" || a.categoria === currentFilter);
  visible.forEach(a => {
    if(a.latitud == null || a.longitud == null) return;
    const marker = L.marker([Number(a.latitud),Number(a.longitud)],{
      icon:markerIcon(colors[a.categoria] || colors.otro)
    }).addTo(map);

    marker.bindPopup(`
      <div style="min-width:220px">
        <b>${escapeHtml(a.titulo)}</b>
        <p>${escapeHtml(a.descripcion || "")}</p>
        <small>${escapeHtml(a.zona_referencia || a.distrito)} · ${timeAgo(a.created_at)}</small>
        <div style="margin-top:8px"><b>${Number(a.total_confirmaciones||0)}</b> confirmaciones</div>
      </div>
    `);
    markers.push(marker);
  });

  document.querySelector("#mapCount").textContent = `${visible.length} alertas`;
}

async function load(){
  const {data,error} = await supabase.from("alertas")
    .select("id,categoria,titulo,descripcion,distrito,zona_referencia,latitud,longitud,estado,tipo_fuente,total_confirmaciones,created_at")
    .in("estado",["reportada","verificada","resuelta"])
    .order("created_at",{ascending:false})
    .limit(200);

  if(error){
    document.querySelector("#mapStatus").textContent = error.message;
    return;
  }

  allAlerts = data || [];
  render();

  const selected = new URLSearchParams(location.search).get("alerta");
  const alert = allAlerts.find(x=>x.id===selected);
  if(alert?.latitud && alert?.longitud){
    map.setView([Number(alert.latitud),Number(alert.longitud)],16);
  }
}

document.querySelectorAll("[data-map-filter]").forEach(btn=>{
  btn.addEventListener("click",()=>{
    currentFilter=btn.dataset.mapFilter;
    document.querySelectorAll("[data-map-filter]").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");
    render();
  });
});

document.querySelector("[data-my-location]")?.addEventListener("click",()=>{
  map.locate({setView:true,maxZoom:16});
});

load();

const channel = supabase.channel("map-alertas")
 .on("postgres_changes",{event:"*",schema:"public",table:"alertas"},load)
 .subscribe();

addEventListener("beforeunload",()=>supabase.removeChannel(channel));
