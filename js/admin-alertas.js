import { supabase } from './supabase.js';
import { requireAdmin } from './session.js';

const content=document.querySelector('#adminAlertContent');const access=document.querySelector('#adminAccess');const list=document.querySelector('#adminAlertList');const filter=document.querySelector('#stateFilter');const suggestions=document.querySelector('#suggestionsAdmin');const evidenceList=document.querySelector('#evidenceModerationList');
function esc(v=''){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function ago(value){const m=(Date.now()-new Date(value))/60000;if(m<60)return`Hace ${Math.max(0,Math.floor(m))} min`;if(m<1440)return`Hace ${Math.floor(m/60)} h`;return`Hace ${Math.floor(m/1440)} días`;}
async function evidenceUrl(value){if(!value)return'';if(/^https?:\/\//i.test(value))return value;const{data}=await supabase.storage.from('alertas-evidencias').createSignedUrl(value,900);return data?.signedUrl||'';}
try{await requireAdmin();access.hidden=true;content.hidden=false;await Promise.all([loadAlerts(),loadEvidence(),loadSuggestions()]);}catch(error){access.innerHTML=`<div class="auth-card"><h1>Acceso restringido</h1><p class="notice">${esc(error.message)}</p><a class="primary" href="index.html">Volver</a></div>`;}
async function loadAlerts(){list.innerHTML='<div class="notice">Cargando alertas…</div>';const{data,error}=await supabase.from('alertas_admin_moderacion').select('id,categoria,titulo,descripcion,distrito,zona_referencia,estado,tipo_fuente,total_confirmaciones,total_seguidores,motivo_moderacion,precision_ubicacion,created_at,autor_id,latitud_exacta,longitud_exacta').order('created_at',{ascending:false}).limit(150);if(error){list.innerHTML=`<div class="notice">${esc(error.message)}</div>`;return;}const totals=data||[];document.querySelector('#statReported').textContent=totals.filter(x=>x.estado==='reportada').length;document.querySelector('#statReview').textContent=totals.filter(x=>['en_revision','en_disputa'].includes(x.estado)).length;document.querySelector('#statVerified').textContent=totals.filter(x=>x.estado==='verificada').length;document.querySelector('#statResolved').textContent=totals.filter(x=>x.estado==='resuelta').length;const selected=filter.value;const all=selected==='pending'?totals.filter(x=>['reportada','en_revision','en_disputa'].includes(x.estado)):selected==='all'?totals:totals.filter(x=>x.estado===selected);list.innerHTML=all.length?all.map(item=>`<article class="mz-admin-alert"><div><div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap"><span class="mz-status-chip ${esc(item.estado)}">${esc(item.estado.replaceAll('_',' '))}</span><span style="font-size:8px;color:var(--txt3)">${ago(item.created_at)}</span></div><h3>${esc(item.titulo)}</h3><p>${esc(item.descripcion)}</p><div style="font-size:8px;color:var(--txt3);display:flex;gap:10px;flex-wrap:wrap"><span>📍 ${esc(item.zona_referencia||item.distrito)}</span><span>👥 ${Number(item.total_confirmaciones||0)} confirmaciones</span><span>🛡 ${esc(item.precision_ubicacion||'aproximada')}</span><span>🎯 Exacta: ${item.latitud_exacta??'—'}, ${item.longitud_exacta??'—'}</span></div><div style="margin-top:9px;display:flex;gap:6px;flex-wrap:wrap"><a class="secondary" href="alerta.html?id=${encodeURIComponent(item.id)}" target="_blank">Ver detalle</a><a class="secondary" href="mapa.html?alerta=${encodeURIComponent(item.id)}" target="_blank">Mapa</a></div></div><div class="mz-admin-actions"><label style="font-size:9px;font-weight:700">Decisión<select data-state="${item.id}"><option value="verificada">Verificar</option><option value="en_revision">Solicitar corrección</option><option value="falsa">Descartar como falsa</option><option value="ocultada">Retirar por seguridad</option><option value="reportada">Devolver a reportada</option></select></label><label style="font-size:9px;font-weight:700">Motivo claro<textarea data-reason="${item.id}" placeholder="Ej.: Falta indicar hora o la ubicación no coincide.">${esc(item.motivo_moderacion||'')}</textarea></label><button class="primary" data-moderate="${item.id}" type="button">Guardar decisión</button></div></article>`).join(''):'<div class="notice">No hay alertas en este filtro.</div>';list.querySelectorAll('[data-moderate]').forEach(button=>button.addEventListener('click',()=>moderate(button.dataset.moderate,button)));}
async function moderate(id,button){const state=list.querySelector(`[data-state="${id}"]`).value;const reason=list.querySelector(`[data-reason="${id}"]`).value.trim();if(['en_revision','falsa','ocultada'].includes(state)&&reason.length<5){alert('Escribe un motivo claro para el usuario.');return;}if(!confirm('¿Guardar esta decisión de moderación?'))return;button.disabled=true;try{const{error}=await supabase.rpc('moderar_alerta',{p_alerta_id:id,p_estado:state,p_motivo:reason||null});if(error)throw error;alert('Decisión guardada y registrada en el historial.');await loadAlerts();}catch(error){alert(error.message);}finally{button.disabled=false;}}

async function loadEvidence(){
  if(!evidenceList)return;
  evidenceList.innerHTML='<div class="notice">Cargando aportes…</div>';
  const{data,error}=await supabase.from('alerta_aportes').select('id,alerta_id,usuario_id,tipo,texto,archivo_url,estado,motivo_revision,created_at').order('created_at',{ascending:false}).limit(150);
  if(error){evidenceList.innerHTML=`<div class="notice">${esc(error.message)}. Ejecuta el SQL de cercanía de 500 m para habilitar este módulo.</div>`;const stat=document.querySelector('#statEvidence');if(stat)stat.textContent='—';return;}
  const rows=data||[];
  const pending=rows.filter(row=>row.estado==='pendiente');
  const stat=document.querySelector('#statEvidence');if(stat)stat.textContent=String(pending.length);
  const alertIds=[...new Set(rows.map(row=>row.alerta_id).filter(Boolean))];
  const userIds=[...new Set(rows.map(row=>row.usuario_id).filter(Boolean))];
  const [alertsResult,profilesResult]=await Promise.all([
    alertIds.length?supabase.from('alertas').select('id,titulo,zona_referencia,distrito').in('id',alertIds):Promise.resolve({data:[]}),
    userIds.length?supabase.from('perfiles_publicos').select('id,username,nombre_visible').in('id',userIds):Promise.resolve({data:[]})
  ]);
  const alerts=new Map((alertsResult.data||[]).map(row=>[row.id,row]));
  const profiles=new Map((profilesResult.data||[]).map(row=>[row.id,row]));
  const ordered=[...pending,...rows.filter(row=>row.estado!=='pendiente')].slice(0,100);
  const prepared=await Promise.all(ordered.map(async row=>({...row,_signedUrl:await evidenceUrl(row.archivo_url)})));
  evidenceList.innerHTML=prepared.length?prepared.map(row=>{
    const alert=alerts.get(row.alerta_id)||{};const author=profiles.get(row.usuario_id)||{};
    const publicState=row.estado==='aprobado'?'Publicado':row.estado==='rechazado'?'Rechazado':row.estado==='retirado'?'Retirado':'Pendiente';
    return `<article class="mz-evidence-admin-card">
      <div class="mz-evidence-admin-media">${row._signedUrl?`<a href="${esc(row._signedUrl)}" target="_blank" rel="noopener"><img src="${esc(row._signedUrl)}" alt="Evidencia enviada" loading="lazy"></a>`:'<div class="notice">Aporte sin fotografía</div>'}</div>
      <div class="mz-evidence-admin-body"><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="mz-status-chip ${esc(row.estado)}">${esc(publicState)}</span><span style="font-size:9px;color:var(--txt3)">${ago(row.created_at)}</span></div>
      <h3>${esc(alert.titulo||'Alerta')}</h3><p style="font-size:10px;color:var(--txt3)">Por @${esc(author.username||author.nombre_visible||'usuario')} · ${esc(alert.zona_referencia||alert.distrito||'Zona no indicada')}</p>
      ${row.texto?`<p>${esc(row.texto)}</p>`:''}
      <label style="font-size:9px;font-weight:700;display:block">Observación<textarea data-evidence-reason="${row.id}" placeholder="Motivo si se rechaza o retira">${esc(row.motivo_revision||'')}</textarea></label>
      <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:8px"><a class="secondary" href="alerta.html?id=${encodeURIComponent(row.alerta_id)}" target="_blank">Ver alerta</a>${row.estado==='pendiente'?`<button class="primary" data-evidence-action="aprobar" data-evidence-id="${row.id}" type="button">Aprobar</button><button class="secondary" data-evidence-action="rechazar" data-evidence-id="${row.id}" type="button">Rechazar</button>`:`<button class="secondary" data-evidence-action="retirar" data-evidence-id="${row.id}" type="button">Retirar</button>`}</div></div>
    </article>`;
  }).join(''):'<div class="notice">No hay fotografías ni aportes para revisar.</div>';
  evidenceList.querySelectorAll('[data-evidence-action]').forEach(button=>button.addEventListener('click',()=>moderateEvidence(button.dataset.evidenceId,button.dataset.evidenceAction,button)));
}
async function moderateEvidence(id,action,button){
  const reason=evidenceList.querySelector(`[data-evidence-reason="${id}"]`)?.value.trim()||'';
  const state=action==='aprobar'?'aprobado':action==='rechazar'?'rechazado':'retirado';
  if(state!=='aprobado'&&reason.length<5){alert('Escribe un motivo claro para el vecino.');return;}
  if(!confirm(`¿${state==='aprobado'?'Publicar':'Cambiar a '+state} este aporte?`))return;
  button.disabled=true;
  try{
    const{data:{user}}=await supabase.auth.getUser();
    const{error}=await supabase.from('alerta_aportes').update({estado:state,motivo_revision:reason||null,revisado_por:user?.id||null,revisado_en:new Date().toISOString()}).eq('id',id);
    if(error)throw error;
    alert(state==='aprobado'?'Fotografía aprobada y visible en la alerta.':'Aporte actualizado.');
    await loadEvidence();
  }catch(error){alert(error.message);}finally{button.disabled=false;}
}

async function loadSuggestions(){const{data,error}=await supabase.from('sugerencias_mizona').select('*').order('created_at',{ascending:false}).limit(100);if(error){suggestions.innerHTML=`<p class="notice">${esc(error.message)}</p>`;return;}suggestions.innerHTML=data?.length?`<table class="admin-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Área</th><th>Sugerencia</th><th>Estado y respuesta</th></tr></thead><tbody>${data.map(item=>`<tr><td>${new Date(item.created_at).toLocaleString('es-PE')}</td><td>${esc(item.tipo)}</td><td>${esc(item.area)}</td><td><strong>${esc(item.titulo)}</strong><br><small>${esc(item.descripcion)}</small></td><td><select data-suggestion-state="${item.id}">${['recibida','en_revision','planificada','implementada','descartada'].map(state=>`<option value="${state}" ${state===item.estado?'selected':''}>${state}</option>`).join('')}</select><textarea data-suggestion-answer="${item.id}" style="width:100%;margin-top:5px" placeholder="Respuesta opcional">${esc(item.respuesta_admin||'')}</textarea><button class="secondary" data-save-suggestion="${item.id}" type="button">Guardar</button></td></tr>`).join('')}</tbody></table>`:'<p>No hay sugerencias.</p>';suggestions.querySelectorAll('[data-save-suggestion]').forEach(button=>button.addEventListener('click',()=>saveSuggestion(button.dataset.saveSuggestion,button)));}
async function saveSuggestion(id,button){button.disabled=true;try{const{error}=await supabase.rpc('admin_actualizar_sugerencia',{p_id:id,p_estado:suggestions.querySelector(`[data-suggestion-state="${id}"]`).value,p_respuesta:suggestions.querySelector(`[data-suggestion-answer="${id}"]`).value||null});if(error)throw error;alert('Sugerencia actualizada.');await loadSuggestions();}catch(error){alert(error.message);}finally{button.disabled=false;}}
filter.addEventListener('change',loadAlerts);document.querySelector('#reloadAlerts').addEventListener('click',()=>Promise.all([loadAlerts(),loadEvidence()]));
