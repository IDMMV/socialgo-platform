import { supabase, getCurrentUser } from './supabase.js';
import { openOrRequestChat } from './chat-access.js';

const qs = (s, root=document) => root.querySelector(s);
const esc = value => String(value ?? '')
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'",'&#039;');
const fmtDate = value => value ? new Date(value).toLocaleDateString('es-PE',{day:'2-digit',month:'short',year:'numeric'}) : '';
const ago = value => {
  if (!value) return '';
  const seconds = Math.max(0, Math.floor((Date.now()-new Date(value).getTime())/1000));
  if (seconds < 60) return 'ahora';
  if (seconds < 3600) return `hace ${Math.floor(seconds/60)} min`;
  if (seconds < 86400) return `hace ${Math.floor(seconds/3600)} h`;
  if (seconds < 604800) return `hace ${Math.floor(seconds/86400)} días`;
  return fmtDate(value);
};

const PROFILE_TYPES = {
  vecino:{label:'Vecino',icon:'ti-user',tabs:['publicaciones','eventos','recomendaciones']},
  profesional:{label:'Profesional',icon:'ti-briefcase',tabs:['servicios','trabajos','resenas','publicaciones']},
  negocio:{label:'Negocio',icon:'ti-building-store',tabs:['publicaciones','ofertas','productos','opiniones']},
  institucion:{label:'Institución',icon:'ti-building-community',tabs:['comunicados','campanas','alertas_oficiales','eventos']},
  organizacion:{label:'Organización vecinal',icon:'ti-users-group',tabs:['actividades','reuniones','comunidad','eventos']}
};
const TAB_LABELS = {
  publicaciones:'Publicaciones',eventos:'Eventos',recomendaciones:'Recomendaciones',servicios:'Servicios',
  trabajos:'Trabajos',resenas:'Reseñas',ofertas:'Ofertas',productos:'Productos',opiniones:'Opiniones',
  comunicados:'Comunicados',campanas:'Campañas',alertas_oficiales:'Alertas oficiales',actividades:'Actividades',
  reuniones:'Reuniones',comunidad:'Comunidad'
};
const KIND_LABELS = {
  general:'Publicación',consejo:'Consejo',recomendacion:'Recomendación',evento:'Evento',
  comunicado:'Comunicado',campana:'Campaña',actividad:'Actividad',reunion:'Reunión',foto:'Foto de la zona',
  trabajo:'Trabajo realizado',producto:'Producto',oferta:'Oferta',empleo:'Empleo'
};

let currentUser = null;
let profile = null;
let activeTab = null;
let datasets = {posts:[],services:[],offers:[],jobs:[],businesses:[]};

function initials(name){
  return String(name||'U').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
}
function typeInfo(){ return PROFILE_TYPES[profile?.tipo_perfil] || PROFILE_TYPES.vecino; }
function isOwner(){ return Boolean(currentUser && profile && String(currentUser.id)===String(profile.id)); }
function canSeeContent(){
  if (!profile) return false;
  if (isOwner()) return true;
  if (profile.privacidad_perfil !== 'privado') return true;
  return Boolean(profile.siguiendo || profile.estado_amistad === 'aceptada');
}
function toast(message,type='ok'){
  let node=qs('#profileToast');
  if(!node){ node=document.createElement('div');node.id='profileToast';node.style.cssText='position:fixed;right:18px;bottom:22px;z-index:9999;padding:12px 16px;border-radius:12px;color:#fff;font-weight:800;font-size:13px;box-shadow:0 12px 30px rgba(0,0,0,.2)';document.body.appendChild(node); }
  node.textContent=message;node.style.background=type==='error'?'#b4232c':'#166a4d';node.hidden=false;
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.hidden=true,3000);
}

async function queryProfile(username){
  let result = await supabase.from('perfiles_publicos').select('*').eq('username',username).maybeSingle();
  if (!result.error && result.data) return result.data;
  result = await supabase.from('perfiles').select('*').eq('username',username).eq('estado','activo').maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function safeQuery(builder){
  try { const {data,error}=await builder; if(error) return []; return data||[]; }
  catch { return []; }
}

async function loadData(){
  if(!canSeeContent()) return;
  let posts = await safeQuery(supabase.from('publicaciones')
    .select('id,autor_id,titulo,contenido,tipo,archivo_url,miniatura_url,visibilidad,permitir_comentarios,categoria_publicacion,ubicacion_texto,fecha_evento,creado_en')
    .eq('autor_id',profile.id).eq('visibilidad','public').eq('estado_moderacion','aprobado')
    .order('creado_en',{ascending:false}).limit(80));
  if(!posts.length){
    posts = await safeQuery(supabase.from('publicaciones')
      .select('id,autor_id,contenido,tipo,archivo_url,miniatura_url,visibilidad,permitir_comentarios,creado_en')
      .eq('autor_id',profile.id).eq('visibilidad','public').eq('estado_moderacion','aprobado')
      .order('creado_en',{ascending:false}).limit(80));
  }
  datasets.posts=posts;
  datasets.services=await safeQuery(supabase.from('servicios_mizona').select('*').eq('propietario_id',profile.id).eq('estado','activo').order('created_at',{ascending:false}).limit(40));
  datasets.businesses=await safeQuery(supabase.from('negocios').select('*').eq('propietario_id',profile.id).eq('estado','aprobado').order('creado_en',{ascending:false}).limit(10));
  const businessIds=datasets.businesses.map(x=>x.id);
  if(businessIds.length){
    datasets.offers=await safeQuery(supabase.from('ofertas_negocios').select('*').in('comercio_id',businessIds).eq('estado','publicada').order('created_at',{ascending:false}).limit(40));
  }
  datasets.jobs=await safeQuery(supabase.from('empleos_mizona').select('*').eq('publicador_id',profile.id).eq('estado','publicado').order('created_at',{ascending:false}).limit(40));
}

function renderHeader(){
  const info=typeInfo();
  document.title=`${profile.nombre_visible||profile.username} · MiZona.pe`;
  const cover=qs('#publicCover');
  cover.innerHTML=profile.portada_url?`<img src="${esc(profile.portada_url)}" alt="Portada de ${esc(profile.nombre_visible)}">`:'';
  qs('#publicAvatar').innerHTML=profile.avatar_url?`<img src="${esc(profile.avatar_url)}" alt="">`:esc(initials(profile.nombre_visible||profile.username));
  qs('#publicName').innerHTML=`${esc(profile.nombre_visible||profile.username)} ${profile.verificado||profile.proveedor_estado==='aprobado'?'<span class="profile-verified" title="Perfil verificado">✓</span>':''}`;
  qs('#publicHandle').textContent=`@${profile.username||'usuario'}`;
  qs('#publicBio').textContent=profile.biografia||descriptionByType(profile.tipo_perfil);
  qs('#publicType').className=`profile-type-chip ${esc(profile.tipo_perfil||'vecino')}`;
  qs('#publicType').innerHTML=`<i class="ti ${info.icon}"></i> ${info.label}`;
  const location=profile.mostrar_distrito_publico===false?'Ubicación privada':(profile.distrito||'Distrito no indicado');
  qs('#publicMeta').innerHTML=`<span><i class="ti ti-map-pin"></i>${esc(location)}</span><span><i class="ti ti-calendar"></i>En MiZona desde ${fmtDate(profile.creado_en||profile.created_at)||'recientemente'}</span>`;
  qs('#statFollowers').textContent=Number(profile.total_seguidores||0).toLocaleString('es-PE');
  qs('#statFollowing').textContent=Number(profile.total_seguidos||0).toLocaleString('es-PE');
  qs('#statPosts').textContent=datasets.posts.length.toLocaleString('es-PE');
  const fourth = profile.tipo_perfil==='profesional'?datasets.services.length:profile.tipo_perfil==='negocio'?datasets.offers.length:datasets.posts.filter(x=>['evento','actividad','reunion'].includes(x.categoria_publicacion)).length;
  qs('#statExtra').textContent=Number(fourth||0).toLocaleString('es-PE');
  qs('#statExtraLabel').textContent=profile.tipo_perfil==='profesional'?'Servicios':profile.tipo_perfil==='negocio'?'Ofertas':'Actividades';
  renderActions();renderTabs();renderAside();
}
function descriptionByType(type){
  return ({vecino:'Comparte consejos, eventos y recomendaciones útiles para su comunidad.',profesional:'Profesional local disponible para atender a vecinos de la zona.',negocio:'Negocio local con productos, ofertas y novedades para la comunidad.',institucion:'Cuenta institucional con comunicados y servicios oficiales.',organizacion:'Organización vecinal que promueve actividades y participación comunitaria.'})[type]||'';
}

function renderActions(){
  const box=qs('#publicActions');
  if(isOwner()){
    box.innerHTML=`<a class="profile-btn primary" href="perfil.html"><i class="ti ti-pencil"></i>Editar perfil</a><a class="profile-btn" href="publicar.html"><i class="ti ti-plus"></i>Publicar</a>`;
    return;
  }
  const followText=profile.siguiendo?'Siguiendo':profile.seguimiento_pendiente?'Solicitud enviada':'Seguir';
  box.innerHTML=`<button class="profile-btn primary" id="followProfile"><i class="ti ${profile.siguiendo?'ti-user-check':'ti-user-plus'}"></i>${followText}</button>
    <button class="profile-btn" id="messageProfile"><i class="ti ti-message"></i>Mensaje</button>
    <button class="profile-btn" id="friendProfile"><i class="ti ti-users-plus"></i>${profile.estado_amistad==='aceptada'?'Amigos':profile.estado_amistad==='pendiente'?'Solicitud enviada':'Agregar amigo'}</button>`;
  qs('#followProfile')?.addEventListener('click',toggleFollow);
  qs('#messageProfile')?.addEventListener('click',sendMessage);
  qs('#friendProfile')?.addEventListener('click',sendFriendRequest);
}

function renderTabs(){
  const tabs=typeInfo().tabs;
  activeTab=activeTab&&tabs.includes(activeTab)?activeTab:tabs[0];
  qs('#profileTabs').innerHTML=tabs.map(tab=>`<button class="profile-tab ${tab===activeTab?'active':''}" data-tab="${tab}">${TAB_LABELS[tab]||tab}</button>`).join('');
  qs('#profileTabs').querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{activeTab=btn.dataset.tab;renderTabs();renderContent();}));
}

function filterPosts(tab){
  const map={
    publicaciones:null,eventos:['evento'],recomendaciones:['recomendacion','consejo'],trabajos:['trabajo','foto'],
    comunicados:['comunicado'],campanas:['campana'],alertas_oficiales:['alerta_oficial'],actividades:['actividad'],
    reuniones:['reunion'],comunidad:['general','consejo','recomendacion'],productos:['producto']
  };
  const kinds=map[tab];
  return kinds?datasets.posts.filter(p=>kinds.includes(p.categoria_publicacion||'general')):datasets.posts;
}

function postCard(post){
  const kind=post.categoria_publicacion||'general';
  const title=post.titulo||String(post.contenido||'Publicación').split('\n')[0].slice(0,85);
  const text=post.contenido||'';
  return `<article class="profile-post">
    ${post.archivo_url&&post.tipo==='imagen'?`<img src="${esc(post.archivo_url)}" alt="${esc(title)}" loading="lazy">`:''}
    ${post.archivo_url&&['video','clip'].includes(post.tipo)?`<video src="${esc(post.archivo_url)}" controls playsinline style="width:100%;max-height:340px;background:#111"></video>`:''}
    <div class="profile-post-body"><span class="profile-post-kind">${esc(KIND_LABELS[kind]||'Publicación')}</span><h3>${esc(title)}</h3>${text&&text!==title?`<p>${esc(text).replaceAll('\n','<br>')}</p>`:''}
    <div class="profile-post-meta"><span>${post.ubicacion_texto?`<i class="ti ti-map-pin"></i> ${esc(post.ubicacion_texto)}`:''}</span><span>${ago(post.creado_en)}</span></div></div>
    <div class="profile-post-actions"><button type="button"><i class="ti ti-heart"></i> Me interesa</button><button type="button"><i class="ti ti-message"></i> Comentar</button><button type="button" data-share-post="${post.id}"><i class="ti ti-share"></i> Compartir</button></div>
  </article>`;
}
function serviceCard(s){
  return `<article class="profile-post"><div class="profile-post-body"><span class="profile-post-kind">Servicio</span><h3>${esc(s.nombre)}</h3><p>${esc(s.descripcion||s.categoria||'Servicio local')}</p><div class="profile-post-meta"><span>${s.tarifa_desde!=null?`Desde S/ ${Number(s.tarifa_desde).toFixed(0)}`:'Cotización directa'}</span><span>${s.disponible!==false?'Disponible':'No disponible'}</span></div></div><div class="profile-post-actions"><button data-contact-provider="${esc(profile.id)}"><i class="ti ti-message"></i> Contactar</button><a href="servicios.html"><i class="ti ti-eye"></i> Ver servicio</a></div></article>`;
}
function offerCard(o){
  const price=o.precio_oferta!=null?`S/ ${Number(o.precio_oferta).toFixed(2)}`:(o.descuento_texto||'Oferta especial');
  return `<article class="profile-post">${o.imagen_url?`<img src="${esc(o.imagen_url)}" alt="${esc(o.titulo)}" loading="lazy">`:''}<div class="profile-post-body"><span class="profile-post-kind">Oferta</span><h3>${esc(o.titulo)}</h3><p>${esc(o.descripcion||o.condiciones||'Promoción disponible por tiempo limitado.')}</p><div class="profile-post-meta"><strong style="font-size:16px;color:#b54708">${esc(price)}</strong><span>${o.vence_en?'Hasta '+fmtDate(o.vence_en):'Stock limitado'}</span></div></div><div class="profile-post-actions"><a href="oferta.html?id=${encodeURIComponent(o.id)}"><i class="ti ti-tag"></i> Ver oferta</a><button data-share-offer="${o.id}"><i class="ti ti-share"></i> Compartir</button></div></article>`;
}
function renderContent(){
  const root=qs('#profileContent');
  if(!canSeeContent()){
    root.innerHTML=`<div class="profile-private-box"><i class="ti ti-lock"></i><h2>Este perfil es privado</h2><p>Sigue a esta persona o envía una solicitud de amistad para ver sus publicaciones públicas autorizadas.</p><button class="profile-btn primary" id="privateFollow">Seguir</button></div>`;
    qs('#privateFollow')?.addEventListener('click',toggleFollow);return;
  }
  let rows=[];
  if(activeTab==='servicios') rows=datasets.services.map(serviceCard);
  else if(activeTab==='ofertas') rows=datasets.offers.map(offerCard);
  else if(activeTab==='resenas'||activeTab==='opiniones') rows=[];
  else rows=filterPosts(activeTab).map(postCard);
  root.innerHTML=`<div class="profile-grid">${rows.length?rows.join(''):`<div class="profile-empty"><i class="ti ti-notes-off"></i><strong>Aún no hay ${esc((TAB_LABELS[activeTab]||'publicaciones').toLowerCase())}</strong><div>Cuando esta cuenta publique contenido, aparecerá aquí.</div></div>`}</div>`;
  root.querySelectorAll('[data-contact-provider]').forEach(btn=>btn.addEventListener('click',sendMessage));
  root.querySelectorAll('[data-share-post]').forEach(btn=>btn.addEventListener('click',()=>shareUrl(`${location.origin}/usuario.html?u=${encodeURIComponent(profile.username)}`,'Publicación en MiZona')));
  root.querySelectorAll('[data-share-offer]').forEach(btn=>btn.addEventListener('click',()=>shareUrl(`${location.origin}/oferta.html?id=${encodeURIComponent(btn.dataset.shareOffer)}`,'Oferta en MiZona')));
}

function renderAside(){
  const reason=({vecino:'Para recibir consejos, eventos y recomendaciones útiles de tu zona.',profesional:'Para ver sus trabajos, servicios, disponibilidad y nuevas reseñas.',negocio:'Para enterarte primero de ofertas, productos y novedades.',institucion:'Para recibir comunicados, campañas y alertas oficiales.',organizacion:'Para participar en actividades, reuniones y proyectos vecinales.'})[profile.tipo_perfil]||'';
  qs('#whyFollow').textContent=reason;
  const business=datasets.businesses[0];
  const contact=[];
  if(business?.direccion_publica) contact.push(`<span><i class="ti ti-map-pin"></i>${esc(business.direccion_publica)}</span>`);
  if(business?.whatsapp) contact.push(`<span><i class="ti ti-brand-whatsapp"></i>${esc(business.whatsapp)}</span>`);
  qs('#profileContact').innerHTML=contact.length?contact.join(''):'<span>Los datos privados, el teléfono personal y la ubicación exacta nunca se muestran.</span>';
}

async function ensureLogin(){
  if(currentUser) return true;
  location.href=`login.html?next=${encodeURIComponent(location.pathname+location.search)}`;return false;
}
async function toggleFollow(){
  if(!await ensureLogin()) return;
  if(isOwner()) return;
  try{
    const {data,error}=await supabase.rpc('mizona_toggle_seguimiento',{p_seguido_id:profile.id});
    if(error) throw error;
    const state=Array.isArray(data)?data[0]:data;
    profile.siguiendo=state?.estado==='siguiendo';profile.seguimiento_pendiente=state?.estado==='pendiente';
    if(state?.estado==='dejado') profile.total_seguidores=Math.max(0,Number(profile.total_seguidores||0)-1);
    if(state?.estado==='siguiendo') profile.total_seguidores=Number(profile.total_seguidores||0)+1;
    toast(state?.mensaje||'Preferencia actualizada.');renderHeader();renderContent();
  }catch(error){
    // Compatibilidad con instalaciones anteriores sin RPC.
    try{
      if(profile.siguiendo){await supabase.from('seguidores').delete().eq('seguidor_id',currentUser.id).eq('seguido_id',profile.id);profile.siguiendo=false;profile.total_seguidores=Math.max(0,Number(profile.total_seguidores||0)-1);}
      else{await supabase.from('seguidores').insert({seguidor_id:currentUser.id,seguido_id:profile.id});profile.siguiendo=true;profile.total_seguidores=Number(profile.total_seguidores||0)+1;}
      toast(profile.siguiendo?'Ahora sigues este perfil.':'Dejaste de seguirlo.');renderHeader();renderContent();
    }catch(fallback){toast(fallback.message||error.message,'error');}
  }
}
async function sendFriendRequest(){
  if(!await ensureLogin()||isOwner()) return;
  if(profile.estado_amistad==='aceptada'||profile.estado_amistad==='pendiente') return;
  const {error}=await supabase.rpc('enviar_solicitud_amistad',{p_destinatario:profile.id});
  if(error) toast(error.message,'error'); else {profile.estado_amistad='pendiente';toast('Solicitud de amistad enviada.');renderActions();}
}
async function sendMessage(){
  if(!await ensureLogin()||isOwner()) return;
  try{await openOrRequestChat(profile.id);}catch(error){toast(error.message,'error');}
}
async function shareUrl(url,text){
  try{if(navigator.share) await navigator.share({title:'MiZona.pe',text,url}); else {await navigator.clipboard.writeText(url);toast('Enlace copiado.');}}catch{}
}

async function init(){
  const username=new URLSearchParams(location.search).get('u');
  const root=qs('#profileLoad');
  if(!username){root.innerHTML='<div class="profile-empty"><strong>Falta indicar el usuario.</strong></div>';return;}
  currentUser=await getCurrentUser();
  try{
    profile=await queryProfile(username);
    if(!profile){root.innerHTML='<div class="profile-empty"><strong>Perfil no encontrado.</strong></div>';return;}
    await loadData();
    root.hidden=true;qs('#profileReady').hidden=false;renderHeader();renderContent();
  }catch(error){root.innerHTML=`<div class="profile-empty"><strong>No se pudo cargar el perfil.</strong><div>${esc(error.message)}</div></div>`;}
}
init();
