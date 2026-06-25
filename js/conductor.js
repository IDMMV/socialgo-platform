import { supabase, getCurrentUser } from './supabase.js';
const $=s=>document.querySelector(s);let user=null,request=null,profile=null;
const status=$('#driverStatus'),form=$('#driverForm'),submit=$('#submitDriver');
function show(text,type=''){status.className=`ride-status ${type}`;status.textContent=text}
function errText(e){return e?.message||e?.details||e?.hint||'No se pudo completar la operación.'}
function setValue(id,value){if(value!=null)$(id).value=value}
function badge(state){const labels={pendiente:'En revisión',observado:'Con observaciones',aprobado:'Aprobado',rechazado:'Rechazado',suspendido:'Suspendido'};$('#requestBadge').textContent=labels[state]||'';}
async function load(){
 user=await getCurrentUser();if(!user){location.href='login.html?next=conductor.html';return;}
 const [{data:p,error:pe},{data:r,error:re}]=await Promise.all([
  supabase.from('perfiles').select('nombre_visible,telefono_verificado,telefono_e164').eq('id',user.id).maybeSingle(),
  supabase.from('solicitudes_conductor').select('*').eq('usuario_id',user.id).maybeSingle()
 ]);
 if(pe){show(errText(pe),'error');return;} profile=p||{};request=r||null;if(re&&re.code!=='42P01'){show(errText(re),'error');return;}
 setValue('#driverNames',request?.nombres||profile.nombre_visible||user.user_metadata?.full_name||'');setValue('#driverPhone',request?.celular||profile.telefono_e164||user.phone||'');
 const map={driverDni:'dni',driverLicense:'licencia_numero',driverLicenseCategory:'licencia_categoria',driverLicenseExpiry:'licencia_vencimiento',vehicleBrand:'vehiculo_marca',vehicleModel:'vehiculo_modelo',vehicleYear:'vehiculo_anio',vehicleColor:'vehiculo_color',vehiclePlate:'placa',soatExpiry:'soat_vencimiento',technicalExpiry:'revision_vencimiento'};
 for(const [id,key] of Object.entries(map))setValue(`#${id}`,request?.[key]);
 if(!profile.telefono_verificado){show('Primero debes verificar tu celular para enviar la solicitud.','warning');submit.disabled=true;$('#verifyPhoneLink').hidden=false;}
 else if(request){badge(request.estado);if(request.estado==='aprobado'){show('✅ Tu cuenta de conductor está aprobada. Ya puedes ponerte en línea desde MiZonaRide.','success');submit.textContent='Actualizar documentos';}else if(request.estado==='observado'){show(`La solicitud tiene observaciones: ${request.observacion_admin||'Revisa tus datos y documentos.'}`,'warning');}else if(request.estado==='rechazado'){show(`La solicitud fue rechazada: ${request.observacion_admin||'Puedes corregir y volver a enviarla.'}`,'error');}else show('Tu solicitud está en revisión. Puedes agregar documentos faltantes.');}
 else show('Completa los datos y adjunta documentos legibles.');
 await loadDocs();
}
async function loadDocs(){if(!user)return;const {data}=await supabase.from('documentos_conductor').select('id,tipo,estado,creado_en').eq('usuario_id',user.id).order('creado_en',{ascending:false});$('#uploadedDocs').innerHTML=data?.length?`<div class="ride-status success"><strong>Documentos cargados:</strong> ${[...new Set(data.map(d=>d.tipo.replaceAll('_',' ')))].join(', ')}</div>`:'';}
async function uploadDocs(requestId){
 for(const input of document.querySelectorAll('[data-doc-type]')){const file=input.files?.[0];if(!file)continue;if(file.size>10*1024*1024)throw new Error(`${file.name} supera 10 MB.`);const ext=(file.name.split('.').pop()||'bin').toLowerCase();const path=`${user.id}/${input.dataset.docType}-${Date.now()}.${ext}`;const {error:upErr}=await supabase.storage.from('conductores-documentos').upload(path,file,{upsert:true});if(upErr)throw upErr;const {error:dbErr}=await supabase.from('documentos_conductor').insert({solicitud_id:requestId,usuario_id:user.id,tipo:input.dataset.docType,storage_path:path});if(dbErr)throw dbErr;input.value='';}
}
form.addEventListener('submit',async e=>{e.preventDefault();submit.disabled=true;submit.textContent='Enviando…';try{const args={p_nombres:$('#driverNames').value,p_celular:$('#driverPhone').value,p_dni:$('#driverDni').value,p_licencia_numero:$('#driverLicense').value,p_licencia_categoria:$('#driverLicenseCategory').value,p_licencia_vencimiento:$('#driverLicenseExpiry').value||null,p_vehiculo_marca:$('#vehicleBrand').value,p_vehiculo_modelo:$('#vehicleModel').value,p_vehiculo_anio:Number($('#vehicleYear').value)||null,p_vehiculo_color:$('#vehicleColor').value,p_placa:$('#vehiclePlate').value,p_soat_vencimiento:$('#soatExpiry').value||null,p_revision_vencimiento:$('#technicalExpiry').value||null};const {data:id,error}=await supabase.rpc('mizona_enviar_solicitud_conductor',args);if(error)throw error;await uploadDocs(id);show('✅ Solicitud enviada. El administrador revisará tus datos y documentos.','success');await load();}catch(e){show(errText(e),'error');}finally{submit.disabled=!profile?.telefono_verificado;submit.textContent='Enviar para revisión';}});
load();
