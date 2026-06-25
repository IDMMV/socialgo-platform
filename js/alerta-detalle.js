import { supabase, getCurrentUser } from './supabase.js';
import { initMiZonaUI, toast, escapeHtml, timeAgo } from './mizona-ui-v2.js';

initMiZonaUI();
const id = new URLSearchParams(location.search).get('id');
const main = document.querySelector('#alertMain');
const timeline = document.querySelector('#alertTimeline');
const participation = document.querySelector('#alertParticipation');
const resolutionContent = document.querySelector('#resolutionContent');
const authorTools = document.querySelector('#authorTools');
const authorToolsContent = document.querySelector('#authorToolsContent');
const privacyBadge = document.querySelector('#privacyBadge');
let user = null;
let profile = null;
let alertData = null;
let following = false;
let confirmed = false;
let utility = null;
let map = null;
let exactShared = false;

function statusInfo(value) {
  return {
    reportada: ['reportada','Reportada por un vecino'], en_revision:['en_revision','En revisión'],
    verificada:['verificada','Verificada por MiZona'], resuelta:['resuelta','Resuelta'],
    falsa:['falsa','Descartada'], ocultada:['ocultada','Retirada'], en_disputa:['en_revision','En disputa'], vencida:['resuelta','Vencida']
  }[value] || ['reportada','Reportada'];
}
function privacyText(value) { return {exacta:'Punto preciso',aprox_50m:'Aproximada a 50 m',aprox_150m:'Aproximada a 150 m',solo_zona:'Solo zona aproximada'}[value] || 'Ubicación aproximada'; }
function requireLogin() { if (user) return true; location.href=`login.html?next=${encodeURIComponent(location.pathname+location.search)}`; return false; }
function formatCount(n,s,p){n=Number(n||0);return `${n} ${n===1?s:p}`;}

async function loadSession() {
  user = await getCurrentUser();
  if (!user) return;
  document.body.classList.remove('estado-guest'); document.body.classList.add('estado-logged');
  const [{ data }, { data: adminFlag }] = await Promise.all([
    supabase.from('perfiles').select('id,username,nombre_visible').eq('id',user.id).maybeSingle(),
    Promise.resolve(supabase.rpc('is_admin')).catch(()=>({data:false}))
  ]);
  profile = { ...(data || {}), is_admin: Boolean(adminFlag) };
}

async function loadAlert() {
  if (!id) { main.innerHTML='<div class="mz-empty">Falta el identificador de la alerta.</div>'; return; }
  await loadSession();
  const { data, error } = await supabase.from('alertas').select('id,autor_id,tipo_fuente,categoria,tipo_detalle,ocurre_ahora,destino_alerta,radio_metros,titulo,descripcion,distrito,zona_referencia,latitud,longitud,precision_ubicacion,estado,total_confirmaciones,total_seguidores,total_util_si,total_util_no,motivo_moderacion,resolucion_estado,created_at,updated_at').eq('id',id).maybeSingle();
  if (error || !data) { main.innerHTML=`<div class="mz-empty">${escapeHtml(error?.message || 'La alerta no está disponible.')}</div>`; return; }
  alertData = data;
  exactShared = false;
  if (user) {
    const { data: shared } = await Promise.resolve(supabase.rpc('mizona_ubicacion_emergencia_contacto',{p_alerta_id:id})).catch(()=>({data:null}));
    const row = Array.isArray(shared) ? shared[0] : shared;
    if (row?.latitud != null && row?.longitud != null) {
      alertData.latitud = row.latitud; alertData.longitud = row.longitud; alertData.precision_ubicacion = 'exacta'; exactShared = true;
    }
  }
  await loadUserState();
  renderMain(); renderMap(); await Promise.all([loadTimeline(),loadResolution()]); renderParticipation(); renderAuthorTools();
}

async function loadUserState() {
  following=false; confirmed=false; utility=null;
  if (!user) return;
  const [a,b,c]=await Promise.all([
    supabase.from('alerta_seguimientos').select('alerta_id').eq('alerta_id',id).eq('usuario_id',user.id).maybeSingle(),
    supabase.from('alerta_confirmaciones').select('alerta_id').eq('alerta_id',id).eq('usuario_id',user.id).maybeSingle(),
    supabase.from('alerta_utilidad').select('util').eq('alerta_id',id).eq('usuario_id',user.id).maybeSingle()
  ]);
  following=Boolean(a.data); confirmed=Boolean(b.data); utility=c.data?.util ?? null;
}

function renderMain() {
  const [cls,label]=statusInfo(alertData.estado);
  const isAuthor=user && String(user.id)===String(alertData.autor_id);
  main.innerHTML=`<div class="mz-detail-pad">
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><span class="mz-status-chip ${cls}">${label}</span><small style="font-size:9px;color:var(--txt3)">${timeAgo(alertData.created_at)}</small></div>
    <div style="display:flex;align-items:center;gap:6px;color:var(--txt3);font-size:9px;margin:8px 0 2px"><i class="ti ${alertData.tipo_fuente === 'oficial' ? 'ti-shield-check' : 'ti-shield-lock'}"></i>${alertData.tipo_fuente === 'oficial' ? 'Fuente oficial verificada' : 'Reportado por un vecino verificado · identidad protegida'}</div>
    <h1 class="mz-detail-title">${escapeHtml(alertData.titulo)}</h1>
    <div class="mz-detail-description">${escapeHtml(alertData.descripcion)}</div>
    ${isAuthor && alertData.motivo_moderacion ? `<div class="mz-rejection-box"><strong>Motivo indicado por moderación</strong>${escapeHtml(alertData.motivo_moderacion)}</div>`:''}
    <div class="mz-detail-meta"><span>📍 ${escapeHtml(alertData.zona_referencia||alertData.distrito)}</span><span>🛡 ${escapeHtml(privacyText(alertData.precision_ubicacion))}</span>${exactShared?'<span>🔐 Ubicación temporal compartida contigo</span>':''}<span>🕒 Actualizada ${timeAgo(alertData.updated_at)}</span></div>
  </div>`;
  privacyBadge.textContent=privacyText(alertData.precision_ubicacion);
}

function renderMap() {
  if (!alertData.latitud || !alertData.longitud) { document.querySelector('#mzAlertDetailMap').innerHTML='<div class="mz-empty">Esta alerta no tiene coordenadas públicas.</div>'; return; }
  if (!map) { map=L.map('mzAlertDetailMap',{scrollWheelZoom:false}).setView([alertData.latitud,alertData.longitud],16); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map); }
  L.marker([alertData.latitud,alertData.longitud]).addTo(map).bindPopup(escapeHtml(alertData.titulo)).openPopup();
  if(alertData.precision_ubicacion!=='exacta') L.circle([alertData.latitud,alertData.longitud],{radius:alertData.precision_ubicacion==='aprox_150m'?150:alertData.precision_ubicacion==='solo_zona'?450:50,color:'#7c3aed',fillOpacity:.08,dashArray:'7 6'}).addTo(map);
}

function renderParticipation() {
  const isAuthor=user && String(user.id)===String(alertData.autor_id);
  participation.innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:11px"><div class="mz-confirm-item"><small>Confirmaciones</small><strong>${formatCount(alertData.total_confirmaciones,'vecino','vecinos')}</strong></div><div class="mz-confirm-item"><small>Seguidores</small><strong>${formatCount(alertData.total_seguidores,'persona','personas')}</strong></div></div>
  <div style="display:grid;gap:7px">
    ${isAuthor?'<div class="mz-location-summary"><i class="ti ti-pencil"></i><div><strong>Tú reportaste esta alerta</strong><span>Las confirmaciones deben provenir de otros vecinos.</span></div></div>':`<button class="mz-btn success" id="confirmDetail" ${confirmed||['resuelta','falsa','ocultada'].includes(alertData.estado)?'disabled':''}>${confirmed?'✓ Ya confirmaste':'✓ Yo también lo vi'}</button>`}
    <button class="mz-btn ghost mz-follow-btn ${following?'active':''}" id="followDetail"><i class="ti ${following?'ti-bell-check':'ti-bell-plus'}"></i>${following?' Siguiendo actualizaciones':' Seguir esta alerta'}</button>
  </div>
  <div class="mz-helpful"><span class="mz-helpful-label">¿Te ayudó?</span><button class="mz-btn sm ${utility===true?'success':'ghost'}" id="usefulYes">Sí · ${Number(alertData.total_util_si||0)}</button><button class="mz-btn sm ${utility===false?'danger':'ghost'}" id="usefulNo">No · ${Number(alertData.total_util_no||0)}</button></div>`;
  document.querySelector('#confirmDetail')?.addEventListener('click',confirmAlert);
  document.querySelector('#followDetail')?.addEventListener('click',toggleFollow);
  document.querySelector('#usefulYes')?.addEventListener('click',()=>voteUtility(true));
  document.querySelector('#usefulNo')?.addEventListener('click',()=>voteUtility(false));
}

async function confirmAlert() {
  if(!requireLogin())return;
  try { const {data,error}=await supabase.rpc('confirmar_alerta',{p_alerta_id:id,p_latitud:null,p_longitud:null}); if(error)throw error; toast(data?.mensaje||'Confirmación registrada.'); await refresh(); } catch(e){toast(e.message,'error');}
}
async function toggleFollow() {
  if(!requireLogin())return;
  try { const {error}=await supabase.rpc('seguir_alerta',{p_alerta_id:id,p_seguir:!following}); if(error)throw error; following=!following; toast(following?'Ahora sigues esta alerta.':'Dejaste de seguirla.'); await refresh(); } catch(e){toast(e.message,'error');}
}
async function voteUtility(value) {
  if(!requireLogin())return;
  try { const {error}=await supabase.rpc('valorar_utilidad_alerta',{p_alerta_id:id,p_util:value}); if(error)throw error; toast('Gracias por tu opinión.'); await refresh(); } catch(e){toast(e.message,'error');}
}

async function loadTimeline() {
  const {data,error}=await supabase.from('alerta_actualizaciones').select('id,tipo,texto,estado_nuevo,created_at').eq('alerta_id',id).eq('visible',true).order('created_at',{ascending:false});
  if(error){timeline.innerHTML=`<div class="mz-empty">${escapeHtml(error.message)}</div>`;return;}
  timeline.innerHTML=data?.length?data.map(item=>`<div class="mz-timeline-item"><div class="mz-timeline-dot"></div><strong>${escapeHtml({creada:'Alerta creada',actualizacion:'Nueva actualización',moderacion:'Moderación',correccion:'Información corregida',resolucion:'Resolución',estado:'Cambio de estado'}[item.tipo]||'Actualización')}</strong><p>${escapeHtml(item.texto)}</p><small>${timeAgo(item.created_at)}</small></div>`).join(''):'<div class="mz-empty">Aún no hay actualizaciones.</div>';
}

async function loadResolution() {
  const {data,error}=await supabase.from('alerta_resoluciones').select('*').eq('alerta_id',id).maybeSingle();
  if(error){resolutionContent.innerHTML=`<div class="mz-empty">${escapeHtml(error.message)}</div>`;return;}
  const isAuthor=user&&String(user.id)===String(alertData.autor_id);
  if(!data){resolutionContent.innerHTML=isAuthor?`<p style="font-size:9px;color:var(--txt2);line-height:1.5">Cuando la situación termine, propón marcarla como resuelta. Dos vecinos podrán confirmarla.</p><form class="mz-inline-form" id="resolutionForm"><label>¿Cómo se resolvió?<textarea id="resolutionText" required maxlength="1000"></textarea></label><label>Enlace de evidencia (opcional)<input id="resolutionEvidence" type="url" placeholder="https://..."></label><button class="mz-btn success" type="submit">Proponer como resuelta</button></form>`:'<p style="font-size:9px;color:var(--txt2)">Todavía no existe una propuesta de resolución.</p>';document.querySelector('#resolutionForm')?.addEventListener('submit',proposeResolution);return;}
  const pending=data.estado==='propuesta';
  resolutionContent.innerHTML=`<div class="mz-resolution-box ${pending?'pending':''}"><strong>${pending?'Resolución pendiente de confirmación':'Situación resuelta'}</strong><div style="margin-top:5px">${escapeHtml(data.descripcion)}</div>${data.evidencia_url?`<a href="${escapeHtml(data.evidencia_url)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:7px">Ver evidencia</a>`:''}<div style="margin-top:7px;font-weight:700">${Number(data.total_confirmaciones||0)} confirmaciones vecinales</div></div>${pending&&!isAuthor?'<button class="mz-btn success" id="confirmResolution" style="margin-top:9px;width:100%">Confirmar que ya se resolvió</button>':''}`;
  document.querySelector('#confirmResolution')?.addEventListener('click',confirmResolution);
}
async function proposeResolution(event){event.preventDefault();if(!requireLogin())return;try{const{error}=await supabase.rpc('proponer_resolucion_alerta',{p_alerta_id:id,p_descripcion:document.querySelector('#resolutionText').value,p_evidencia_url:document.querySelector('#resolutionEvidence').value||null});if(error)throw error;toast('Propuesta de resolución registrada.');await refresh();}catch(e){toast(e.message,'error');}}
async function confirmResolution(){if(!requireLogin())return;try{const{data,error}=await supabase.rpc('confirmar_resolucion_alerta',{p_alerta_id:id});if(error)throw error;toast(data?.confirmada?'La alerta quedó resuelta.':'Confirmación registrada.');await refresh();}catch(e){toast(e.message,'error');}}

function renderAuthorTools() {
  const isAuthor=user&&String(user.id)===String(alertData.autor_id); const isAdmin=Boolean(profile?.is_admin);
  if(!isAuthor&&!isAdmin){authorTools.hidden=true;return;} authorTools.hidden=false;
  authorToolsContent.innerHTML=`<form class="mz-inline-form" id="updateForm"><label>Agregar una actualización<textarea id="updateText" maxlength="1000" placeholder="Ej.: El servicio ya llegó o la situación continúa..."></textarea></label><button class="mz-btn ghost" type="submit">Publicar actualización</button></form>${isAuthor?`<hr style="border:0;border-top:1px solid var(--bd2);margin:14px 0"><form class="mz-inline-form" id="correctionForm"><strong style="font-size:10px">Corregir información y reenviar</strong><label>Título<input id="correctTitle" value="${escapeHtml(alertData.titulo)}"></label><label>Descripción<textarea id="correctDescription">${escapeHtml(alertData.descripcion)}</textarea></label><label>Referencia<input id="correctReference" value="${escapeHtml(alertData.zona_referencia||'')}"></label><button class="mz-btn danger" type="submit">Guardar y enviar a revisión</button></form>`:''}${isAdmin?'<a class="mz-btn ghost" href="admin-alertas.html" style="margin-top:12px;width:100%">Abrir moderación de alertas</a>':''}`;
  document.querySelector('#updateForm')?.addEventListener('submit',addUpdate);
  document.querySelector('#correctionForm')?.addEventListener('submit',correctAlert);
}
async function addUpdate(event){event.preventDefault();const text=document.querySelector('#updateText').value.trim();if(!text)return;try{const{error}=await supabase.rpc('agregar_actualizacion_alerta',{p_alerta_id:id,p_texto:text});if(error)throw error;toast('Actualización publicada.');await refresh();}catch(e){toast(e.message,'error');}}
async function correctAlert(event){event.preventDefault();if(!confirm('¿Guardar los cambios y enviar nuevamente a revisión?'))return;try{const{error}=await supabase.rpc('corregir_alerta_y_reenviar',{p_alerta_id:id,p_titulo:document.querySelector('#correctTitle').value,p_descripcion:document.querySelector('#correctDescription').value,p_zona_referencia:document.querySelector('#correctReference').value||null});if(error)throw error;toast('Alerta corregida y reenviada.');await refresh();}catch(e){toast(e.message,'error');}}

async function refresh(){await loadAlert();}
document.querySelector('#shareAlert')?.addEventListener('click',async()=>{const url=location.href;try{if(navigator.share)await navigator.share({title:alertData?.titulo||'Alerta MiZona',url});else{await navigator.clipboard.writeText(url);toast('Enlace copiado.');}}catch(_){}});
await loadAlert();
const channel=supabase.channel(`alert-detail-${id}`).on('postgres_changes',{event:'*',schema:'public',table:'alertas',filter:`id=eq.${id}`},refresh).on('postgres_changes',{event:'*',schema:'public',table:'alerta_actualizaciones',filter:`alerta_id=eq.${id}`},refresh).subscribe();
addEventListener('beforeunload',()=>supabase.removeChannel(channel));
