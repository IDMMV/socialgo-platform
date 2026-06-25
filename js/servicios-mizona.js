import { supabase, getCurrentUser } from './supabase.js';
import { initMiZonaUI, escapeHtml, toast } from './mizona-ui-v2.js';
import { openOrRequestChat } from './chat-access.js';
import {
  initNearbyExperience, getStoredNearbyLocation, getNearbyRadius,
  distanceMeters, formatDistance, requestNearbyLocation
} from './nearby-location.js';

initMiZonaUI();

const list = document.querySelector('#servicesList');
const count = document.querySelector('#serviceCount');
const searchInputs = [document.querySelector('#serviceSearch'), document.querySelector('#serviceSearchMobile')].filter(Boolean);
const category = document.querySelector('#serviceCategory');
const dialog = document.querySelector('#serviceDialog');
const form = document.querySelector('#serviceForm');
const status = document.querySelector('#serviceStatus');
let services = [];
let nearbyPoint = getStoredNearbyLocation();
let profileDistrict = localStorage.getItem('mizona_zona') || '';

function showStatus(message, isError = false) {
  status.hidden = false;
  status.textContent = message;
  status.style.borderColor = isError ? 'var(--mz-red)' : 'var(--mz-green)';
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `S/ ${number.toFixed(number % 1 ? 2 : 0)}` : '';
}
function priceLabel(item) {
  if (item.tarifa_desde != null && item.tarifa_hasta != null) return `${money(item.tarifa_desde)} – ${money(item.tarifa_hasta)}`;
  if (item.tarifa_desde != null) return `Desde ${money(item.tarifa_desde)}`;
  if (item.tarifa_hasta != null) return `Hasta ${money(item.tarifa_hasta)}`;
  return 'Cotización directa';
}
function normalisePhone(value = '') { let digits = String(value).replace(/\D/g, ''); if (digits.length === 9) digits = `51${digits}`; return digits; }
function normalize(value=''){return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();}
function serviceDistance(item) {
  if (!nearbyPoint) return NaN;
  return distanceMeters(nearbyPoint, { lat: Number(item.latitud), lng: Number(item.longitud) });
}

function nearbyServices(input) {
  const radius = getNearbyRadius();
  const decorated = input.map(item => ({ ...item, _distanceMeters: serviceDistance(item) }));
  if (!nearbyPoint || radius === 0) return decorated.sort((a,b)=>(a._distanceMeters||Infinity)-(b._distanceMeters||Infinity));
  const exact = decorated.filter(item => Number.isFinite(item._distanceMeters) && item._distanceMeters <= radius);
  const legacySameDistrict = decorated.filter(item => !Number.isFinite(item._distanceMeters) && profileDistrict && normalize(item.distrito) === normalize(profileDistrict));
  return exact.length ? exact.sort((a,b)=>a._distanceMeters-b._distanceMeters) : legacySameDistrict;
}

function render() {
  const term = searchInputs[0]?.value.trim().toLowerCase() || searchInputs[1]?.value.trim().toLowerCase() || '';
  const selected = category.value;
  const filtered = services.filter(item => {
    const haystack = `${item.nombre || ''} ${item.categoria || ''} ${item.descripcion || ''} ${item.distrito || ''}`.toLowerCase();
    return (!term || haystack.includes(term)) && (selected === 'todas' || item.categoria === selected);
  });
  const visible = nearbyServices(filtered);
  const radius = getNearbyRadius();

  count.textContent = nearbyPoint && radius ? `${visible.length} en ${radius >= 1000 ? `${radius/1000} km` : `${radius} m`}` : `${visible.length} servicio${visible.length === 1 ? '' : 's'}`;
  if (!visible.length) {
    list.innerHTML = `<div class="mz-empty-state"><i class="ti ti-tool-off"></i><strong>No encontramos servicios dentro de ${radius >= 1000 ? `${radius/1000} km` : `${radius} m`}.</strong><p>Amplía el radio o publica el primer servicio de tu zona.</p><button class="mz-btn primary" type="button" data-expand-radius>Ampliar a 1 km</button></div>`;
    list.querySelector('[data-expand-radius]')?.addEventListener('click',()=>window.MiZonaNearby?.setRadius(1000));
    return;
  }

  list.innerHTML = visible.map(item => {
    const phone = normalisePhone(item.whatsapp);
    const rating = Number(item.calificacion || 0);
    const distance = Number.isFinite(item._distanceMeters)
      ? `<span class="mz-distance-chip"><i class="ti ti-current-location"></i> A ${formatDistance(item._distanceMeters)}</span>`
      : `<span class="mz-distance-chip unknown"><i class="ti ti-map-pin"></i> ${escapeHtml(item.distrito || 'Ubicación por confirmar')}</span>`;
    return `<article class="mz-feed-card">
      <div class="mz-feed-head"><div><span class="mz-tag ${item.verificado ? 'verificada' : 'reportada'}">${item.verificado ? '✓ Verificado' : 'Perfil publicado'}</span><h3>${escapeHtml(item.nombre)}</h3></div><strong>${rating > 0 ? `★ ${rating.toFixed(1)}` : escapeHtml(priceLabel(item))}</strong></div>
      <p>${escapeHtml(item.descripcion || 'Servicio disponible en tu zona.')}</p>
      <div class="mz-feed-meta"><span><i class="ti ti-category"></i> ${escapeHtml(item.categoria)}</span>${distance}<span><i class="ti ti-cash"></i> ${escapeHtml(priceLabel(item))}</span></div>
      <div class="mz-feed-actions">${phone ? `<button class="mz-btn success sm" data-whatsapp="${phone}" data-name="${escapeHtml(item.nombre)}"><i class="ti ti-brand-whatsapp"></i> WhatsApp</button>` : ''}<button class="mz-btn primary sm" data-contact="${item.propietario_id}" data-name="${escapeHtml(item.nombre)}"><i class="ti ti-message"></i> Contactar</button></div>
    </article>`;
  }).join('');

  list.querySelectorAll('[data-whatsapp]').forEach(button => button.addEventListener('click', () => {
    const text = `Hola, vi tu servicio "${button.dataset.name}" en MiZona.pe y quisiera una cotización.`;
    window.open(`https://wa.me/${button.dataset.whatsapp}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }));
  list.querySelectorAll('[data-contact]').forEach(button => button.addEventListener('click', () => startConversation(button.dataset.contact, button.dataset.name)));
}

async function queryServices() {
  const columns = 'id,propietario_id,nombre,categoria,descripcion,distrito,zona_atencion,tarifa_desde,tarifa_hasta,whatsapp,disponible,verificado,calificacion,total_resenas,latitud,longitud,precision_ubicacion';
  let result = await supabase.from('servicios_mizona').select(columns).eq('estado','activo').order('verificado',{ascending:false}).order('calificacion',{ascending:false}).limit(150);
  if (result.error && /latitud|longitud|precision_ubicacion/i.test(result.error.message || '')) {
    result = await supabase.from('servicios_mizona').select('id,propietario_id,nombre,categoria,descripcion,distrito,zona_atencion,tarifa_desde,tarifa_hasta,whatsapp,disponible,verificado,calificacion,total_resenas').eq('estado','activo').order('verificado',{ascending:false}).order('calificacion',{ascending:false}).limit(150);
  }
  return result;
}

async function loadServices() {
  list.innerHTML = '<div class="mz-loader">Buscando servicios cerca de ti...</div>';
  const { data, error } = await queryServices();
  if (error) { list.innerHTML = `<div class="mz-empty-state"><i class="ti ti-database-exclamation"></i><strong>No se pudieron cargar los servicios.</strong><p>${escapeHtml(error.message)}</p></div>`; count.textContent='Error'; return; }
  services = data || [];
  render();
}

async function openForm() {
  const user = await getCurrentUser();
  if (!user) { location.href=`login.html?next=${encodeURIComponent('servicios.html#registrar')}`; return; }
  status.hidden = true;
  try {
    const { data: profile } = await supabase.from('perfiles').select('distrito,zona,proveedor_estado').eq('id',user.id).maybeSingle();
    profileDistrict = profile?.distrito || profileDistrict;
    if (profile?.proveedor_estado !== 'aprobado') { if (confirm('El administrador debe aprobarte como proveedor antes de publicar. ¿Enviar tu solicitud ahora?')) location.href='proveedor.html'; return; }
    if (profile?.distrito && !form.elements.distrito.value) form.elements.distrito.value=profile.distrito;
    if (profile?.zona && !form.elements.zona_atencion.value) form.elements.zona_atencion.value=profile.zona;
    const point = nearbyPoint || await requestNearbyLocation({ interactive:true });
    if (point) { form.elements.latitud.value = Number(point.lat.toFixed(3)); form.elements.longitud.value = Number(point.lng.toFixed(3)); }
  } catch (error) { window.mzToast?.(error.message || 'No se pudo validar tu cuenta','error'); return; }
  dialog.showModal();
}

async function startConversation(otherUserId, serviceName) {
  const user=await getCurrentUser();
  if(!user){location.href=`login.html?next=${encodeURIComponent('servicios.html')}`;return;}
  if(user.id===otherUserId){toast('Este servicio te pertenece.');return;}
  try{await openOrRequestChat(otherUserId,{context:`Consulta sobre: ${serviceName}`,notify:message=>window.mzToast?.(message)});}catch(error){window.mzToast?.(`No se pudo abrir el chat de ${serviceName}: ${error.message}`,'error');}
}

form.addEventListener('submit', async event => {
  event.preventDefault(); const user=await getCurrentUser(); if(!user)return openForm();
  const submit=form.querySelector('[type="submit"]'); submit.disabled=true; showStatus('Publicando servicio...');
  try{
    const fd=new FormData(form); const point=nearbyPoint || getStoredNearbyLocation();
    const payload={propietario_id:user.id,nombre:String(fd.get('nombre')||'').trim(),categoria:String(fd.get('categoria')||'Otros'),descripcion:String(fd.get('descripcion')||'').trim()||null,distrito:String(fd.get('distrito')||'').trim(),zona_atencion:String(fd.get('zona_atencion')||'').trim()||null,whatsapp:normalisePhone(fd.get('whatsapp'))||null,tarifa_desde:fd.get('tarifa_desde')?Number(fd.get('tarifa_desde')):null,tarifa_hasta:fd.get('tarifa_hasta')?Number(fd.get('tarifa_hasta')):null,disponible:true,estado:'activo',latitud:fd.get('latitud')?Number(fd.get('latitud')):(point?Number(point.lat.toFixed(3)):null),longitud:fd.get('longitud')?Number(fd.get('longitud')):(point?Number(point.lng.toFixed(3)):null),precision_ubicacion:'aprox_150m'};
    if(payload.nombre.length<3||!payload.distrito)throw new Error('Completa el nombre y el distrito.');
    if(payload.tarifa_desde!=null&&payload.tarifa_hasta!=null&&payload.tarifa_desde>payload.tarifa_hasta)throw new Error('La tarifa desde no puede ser mayor que la tarifa hasta.');
    let {error}=await supabase.from('servicios_mizona').insert(payload);
    if(error&&/latitud|longitud|precision_ubicacion/i.test(error.message||'')){delete payload.latitud;delete payload.longitud;delete payload.precision_ubicacion;({error}=await supabase.from('servicios_mizona').insert(payload));}
    if(error)throw error;
    form.reset();dialog.close();window.mzToast?.('Servicio publicado correctamente.');await loadServices();
  }catch(error){showStatus(error.message||'No se pudo publicar el servicio.',true);}finally{submit.disabled=false;}
});

searchInputs.forEach(input=>input.addEventListener('input',()=>{searchInputs.forEach(other=>{if(other!==input)other.value=input.value;});render();}));
category.addEventListener('change',render);
const initialSearch=new URLSearchParams(location.search).get('q');if(initialSearch)searchInputs.forEach(input=>{input.value=initialSearch;});
document.querySelectorAll('#openServiceForm,#openServiceFormSecondary,#mobileServiceAdd').forEach(button=>button.addEventListener('click',event=>{event.preventDefault();openForm();}));
document.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
window.addEventListener('mizona:location',event=>{nearbyPoint=event.detail.point;render();});
window.addEventListener('mizona:radius-change',render);

if(location.hash==='#registrar')openForm();
await initNearbyExperience({reason:'Activa la ubicación para mostrar primero profesionales que estén a 500 metros de ti.'});
nearbyPoint=getStoredNearbyLocation();
await loadServices();
