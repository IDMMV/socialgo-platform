import {supabase} from './supabase.js';
import {requireAdmin} from './session.js';
const $=s=>document.querySelector(s),esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function status(msg,type='ok'){const e=$('#adminBusinessStatus');e.textContent=msg;e.className=`bo-status show ${type}`;setTimeout(()=>e.classList.remove('show'),4500)}
async function approveRequest(id,yes){const reason=yes?'Aprobado por administración':prompt('Motivo del rechazo:');if(!yes&&!reason)return;const {error}=await supabase.rpc('aprobar_solicitud_negocio',{p_solicitud_id:id,p_aprobar:yes,p_motivo:reason});if(error)return status(error.message,'error');status(yes?'Negocio aprobado y página pública creada.':'Solicitud rechazada.');load()}
async function moderateOffer(id,yes){const reason=yes?'Oferta verificada':prompt('Motivo del rechazo:');if(!yes&&!reason)return;const {error}=await supabase.rpc('moderar_oferta',{p_oferta_id:id,p_aprobar:yes,p_motivo:reason});if(error)return status(error.message,'error');status(yes?'Oferta publicada.':'Oferta rechazada.');load()}
async function load(){
 const [r,o,b,p]=await Promise.all([
  supabase.from('solicitudes_negocio').select('*').eq('estado','pendiente').order('creado_en'),
  supabase.from('ofertas_negocios').select('*').eq('estado','pendiente').order('created_at'),
  supabase.from('negocios').select('id',{count:'exact',head:true}).eq('estado','aprobado'),
  supabase.from('ofertas_negocios').select('id',{count:'exact',head:true}).eq('estado','publicada')
 ]);
 if(r.error)throw r.error;if(o.error)throw o.error;
 $('#requestCount').textContent=r.data?.length||0;$('#offerPendingCount').textContent=o.data?.length||0;$('#businessCount').textContent=b.count||0;$('#offerPublishedCount').textContent=p.count||0;
 const businessIds=[...new Set((o.data||[]).map(x=>x.comercio_id).filter(Boolean))];let bm=new Map();if(businessIds.length){const {data}=await supabase.from('negocios').select('id,nombre_comercial,distrito').in('id',businessIds);(data||[]).forEach(x=>bm.set(x.id,x))}
 $('#businessRequests').innerHTML=r.data?.length?r.data.map(x=>`<article class="bo-admin-row"><div><h3>${esc(x.nombre_comercial)}</h3><p>${esc(x.categoria)} · ${esc(x.distrito||'Sin distrito')} · ${esc(x.whatsapp||'Sin WhatsApp')}</p><p>${esc(x.descripcion||'')}</p></div><div class="bo-admin-actions"><button class="bo-primary-btn" data-approve-request="${x.id}">Aprobar</button><button class="bo-danger-btn" data-reject-request="${x.id}">Rechazar</button></div></article>`).join(''):'<div class="bo-empty">No hay solicitudes pendientes.</div>';
 $('#pendingOffers').innerHTML=o.data?.length?o.data.map(x=>{const n=bm.get(x.comercio_id);return `<article class="bo-admin-row"><div><h3>${esc(x.titulo)}</h3><p>${esc(n?.nombre_comercial||'Negocio')} · ${esc(n?.distrito||x.distrito||'')}</p><p>Precio normal: ${x.precio_normal??'—'} · Oferta: ${x.precio_oferta??'—'} · Vence: ${x.vence_en?new Date(x.vence_en).toLocaleDateString('es-PE'):'Sin fecha'}</p></div><div class="bo-admin-actions"><button class="bo-primary-btn" data-approve-offer="${x.id}">Publicar</button><button class="bo-danger-btn" data-reject-offer="${x.id}">Rechazar</button></div></article>`}).join(''):'<div class="bo-empty">No hay ofertas pendientes.</div>';
 document.querySelectorAll('[data-approve-request]').forEach(b=>b.onclick=()=>approveRequest(b.dataset.approveRequest,true));document.querySelectorAll('[data-reject-request]').forEach(b=>b.onclick=()=>approveRequest(b.dataset.rejectRequest,false));document.querySelectorAll('[data-approve-offer]').forEach(b=>b.onclick=()=>moderateOffer(b.dataset.approveOffer,true));document.querySelectorAll('[data-reject-offer]').forEach(b=>b.onclick=()=>moderateOffer(b.dataset.rejectOffer,false));
}
try{await requireAdmin();$('#adminBusinessGate').remove();$('#adminBusinessMain').hidden=false;await load()}catch(e){$('#adminBusinessGate').innerHTML=`<div class="bo-card bo-empty"><strong>Acceso restringido</strong><span>${esc(e.message)}</span><a class="bo-primary-btn" href="login.html">Iniciar sesión</a></div>`}
$('#refreshAdminBusiness')?.addEventListener('click',()=>load().catch(e=>status(e.message,'error')));
