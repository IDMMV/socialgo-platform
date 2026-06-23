
import { supabase } from "./supabase.js";
import { initMiZonaUI, escapeHtml, timeAgo } from "./mizona-ui-v2.js";

initMiZonaUI();

const list = document.querySelector("#dashboardAlertas");
const recent = document.querySelector("#dashboardRecentes");

async function load(){
  const {data,error}=await supabase.from("alertas")
   .select("id,categoria,titulo,distrito,zona_referencia,estado,tipo_fuente,total_confirmaciones,created_at,latitud,longitud")
   .order("created_at",{ascending:false}).limit(8);

  if(error){
    if(list) list.innerHTML=`<div class="mz-empty">${escapeHtml(error.message)}</div>`;
    return;
  }

  const rows=(data||[]).slice(0,4).map(a=>`
    <div class="mz-alert-row">
      <span class="mz-dot ${a.categoria==="agua"||a.categoria==="luz"?"blue":a.categoria==="mascota"?"orange":a.estado==="resuelta"?"green":"red"}"></span>
      <div><strong>${escapeHtml(a.titulo)}</strong><small>${timeAgo(a.created_at)} · ${Number(a.total_confirmaciones||0)} confirmaron</small></div>
      <a class="mz-btn ghost sm" href="alertas.html">›</a>
    </div>`).join("");

  if(list) list.innerHTML=rows || `<div class="mz-empty">Sin alertas todavía.</div>`;
  if(recent) recent.innerHTML=(data||[]).slice(0,3).map(a=>`
    <div class="mz-alert-row">
      <span class="mz-dot red"></span>
      <div><strong>${escapeHtml(a.titulo)}</strong><small>${escapeHtml(a.zona_referencia||a.distrito)}</small></div>
      <small>${timeAgo(a.created_at)}</small>
    </div>`).join("");

  document.querySelector("#statAlerts").textContent=data?.length||0;
}

load();
const ch=supabase.channel("dashboard-alertas")
 .on("postgres_changes",{event:"*",schema:"public",table:"alertas"},load)
 .subscribe();
addEventListener("beforeunload",()=>supabase.removeChannel(ch));
