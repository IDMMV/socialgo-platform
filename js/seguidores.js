import { supabase, getCurrentUser } from './supabase.js';
const root=document.querySelector('#followersContent');let user=null;let view='requests';
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const initials=v=>String(v||'U').split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
function row(p,actions=''){return `<div class="follower-row"><div class="follower-avatar">${p.avatar_url?`<img src="${esc(p.avatar_url)}" alt="">`:esc(initials(p.nombre_visible))}</div><div class="follower-info"><strong>${esc(p.nombre_visible||p.username)}</strong><small>@${esc(p.username)} · ${esc(({vecino:'Vecino',profesional:'Profesional',negocio:'Negocio',institucion:'Institución',organizacion:'Organización vecinal'})[p.tipo_perfil]||'Vecino')}</small></div><div class="follower-actions">${actions}<a class="profile-btn" href="usuario.html?u=${encodeURIComponent(p.username)}">Ver perfil</a></div></div>`;}
function empty(text){root.innerHTML=`<div class="profile-empty"><i class="ti ti-users"></i><strong>${esc(text)}</strong></div>`;}
async function load(){root.innerHTML='<div class="profile-empty"><i class="ti ti-loader-2"></i>Cargando…</div>';
 if(view==='requests'){
  const {data,error}=await supabase.from('solicitudes_seguimiento_recibidas').select('*').order('creado_en',{ascending:false});
  if(error){empty('Ejecuta primero el SQL final de perfiles.');return;}if(!data?.length){empty('No tienes solicitudes pendientes.');return;}
  root.innerHTML=data.map(p=>row(p,`<button class="profile-btn primary" data-accept="${p.id}">Aceptar</button><button class="profile-btn" data-reject="${p.id}">Rechazar</button>`)).join('');
  root.querySelectorAll('[data-accept]').forEach(b=>b.addEventListener('click',()=>respond(b.dataset.accept,'aceptada')));root.querySelectorAll('[data-reject]').forEach(b=>b.addEventListener('click',()=>respond(b.dataset.reject,'rechazada')));
 }else{
  const column=view==='followers'?'seguido_id':'seguidor_id';const other=view==='followers'?'seguidor_id':'seguido_id';
  const {data:links,error}=await supabase.from('seguidores').select(`${other}`).eq(column,user.id).limit(200);if(error){empty(error.message);return;}
  const ids=(links||[]).map(x=>x[other]);if(!ids.length){empty(view==='followers'?'Aún no tienes seguidores.':'Aún no sigues a nadie.');return;}
  const {data}=await supabase.from('perfiles_publicos').select('*').in('id',ids);root.innerHTML=(data||[]).map(p=>row(p,view==='followers'?`<button class="profile-btn" data-remove="${p.id}">Eliminar</button>`:`<button class="profile-btn" data-unfollow="${p.id}">Dejar de seguir</button>`)).join('');
  root.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>removeFollower(b.dataset.remove)));root.querySelectorAll('[data-unfollow]').forEach(b=>b.addEventListener('click',()=>unfollow(b.dataset.unfollow)));
 }}
async function respond(id,response){const {error}=await supabase.rpc('mizona_responder_seguimiento',{p_solicitud_id:id,p_respuesta:response});if(error)alert(error.message);else load();}
async function removeFollower(id){const {error}=await supabase.from('seguidores').delete().eq('seguidor_id',id).eq('seguido_id',user.id);if(error)alert(error.message);else load();}
async function unfollow(id){const {error}=await supabase.from('seguidores').delete().eq('seguidor_id',user.id).eq('seguido_id',id);if(error)alert(error.message);else load();}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-view]').forEach(x=>x.classList.remove('active'));b.classList.add('active');view=b.dataset.view;load();}));
user=await getCurrentUser();if(!user)location.href='login.html?next=seguidores.html';else load();
