import { supabase } from './supabase.js';
import { initNearbyExperience, getStoredNearbyLocation, getNearbyRadius, distanceMeters, formatDistance } from './nearby-location.js';

const list=document.querySelector('#jobsList');
const count=document.querySelector('#jobsCount');
let point=getStoredNearbyLocation();
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function money(v){const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN',maximumFractionDigits:0}).format(n):'';}
function salary(item){if(item.salario_desde!=null&&item.salario_hasta!=null)return`${money(item.salario_desde)} – ${money(item.salario_hasta)}`;if(item.salario_desde!=null)return`Desde ${money(item.salario_desde)}`;return'Sueldo por conversar';}
async function load(){
  list.innerHTML='<div class="mz-loader">Buscando empleos cerca de ti…</div>';
  const{data,error}=await supabase.from('empleos_mizona').select('*').eq('estado','publicado').order('created_at',{ascending:false}).limit(100);
  if(error){list.innerHTML=`<div class="mz-empty-state"><i class="ti ti-briefcase-off"></i><strong>La sección de empleos aún no está instalada.</strong><p>Ejecuta el SQL de cercanía 500 m para habilitarla.</p></div>`;count.textContent='Próximamente';return;}
  const radius=getNearbyRadius();
  let rows=(data||[]).map(item=>({...item,_distanceMeters:point?distanceMeters(point,{lat:Number(item.latitud),lng:Number(item.longitud)}):NaN}));
  if(point&&radius)rows=rows.filter(item=>Number.isFinite(item._distanceMeters)&&item._distanceMeters<=radius).sort((a,b)=>a._distanceMeters-b._distanceMeters);
  count.textContent=`${rows.length} en ${radius>=1000?`${radius/1000} km`:`${radius} m`}`;
  if(!rows.length){list.innerHTML=`<div class="mz-empty-state"><i class="ti ti-briefcase-off"></i><strong>No hay empleos dentro de ${radius>=1000?`${radius/1000} km`:`${radius} m`}.</strong><p>Amplía el radio para ver oportunidades de otros sectores.</p><button type="button" class="mz-btn primary" data-expand-jobs>Ampliar a 1 km</button></div>`;list.querySelector('[data-expand-jobs]')?.addEventListener('click',()=>window.MiZonaNearby?.setRadius(1000));return;}
  list.innerHTML=rows.map(item=>`<article class="mz-feed-card"><div class="mz-feed-head"><div><span class="mz-tag verificada">${esc(item.modalidad||'Presencial')}</span><h3>${esc(item.titulo)}</h3></div><strong>${esc(salary(item))}</strong></div><p><strong>${esc(item.empresa)}</strong> · ${esc(item.descripcion||'')}</p><div class="mz-feed-meta"><span class="mz-distance-chip"><i class="ti ti-current-location"></i> A ${formatDistance(item._distanceMeters)}</span><span><i class="ti ti-clock"></i> ${esc(item.tipo_jornada||'Jornada por confirmar')}</span><span><i class="ti ti-map-pin"></i> ${esc(item.distrito||'Tu zona')}</span></div></article>`).join('');
}
await initNearbyExperience({reason:'Activa tu ubicación para mostrar oportunidades laborales primero dentro de 500 metros.'});
point=getStoredNearbyLocation();
window.addEventListener('mizona:location',e=>{point=e.detail.point;load();});
window.addEventListener('mizona:radius-change',load);
load();
