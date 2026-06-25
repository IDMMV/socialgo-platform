import { loadFeed, toggleLike, registerShare } from './publicaciones.js';
import { getCurrentUser } from './supabase.js';

const root=document.querySelector('#homePublications');
if(root) init();
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const ago=v=>{const s=Math.floor((Date.now()-new Date(v).getTime())/1000);if(s<60)return'Ahora';if(s<3600)return`Hace ${Math.floor(s/60)} min`;if(s<86400)return`Hace ${Math.floor(s/3600)} h`;return`Hace ${Math.floor(s/86400)} días`;};
const initials=v=>String(v||'U').split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
const labels={general:'Publicación',consejo:'Consejo',recomendacion:'Recomendación',evento:'Evento',foto:'Foto de la zona',trabajo:'Trabajo realizado',producto:'Producto',comunicado:'Comunicado',campana:'Campaña',actividad:'Actividad',reunion:'Reunión',alerta_oficial:'Alerta oficial',empleo:'Empleo'};
async function init(){
 root.innerHTML='<div class="mz-card" style="padding:18px;text-align:center;color:var(--txt3)">Cargando publicaciones cercanas y de cuentas que sigues…</div>';
 try{
  const [posts,user]=await Promise.all([loadFeed(12),getCurrentUser()]);
  if(!posts.length){root.innerHTML='<div class="mz-card" style="padding:20px;text-align:center"><strong>Aún no hay publicaciones públicas.</strong><br><a href="publicar.html" style="color:var(--az);font-weight:800">Sé el primero en publicar</a></div>';return;}
  root.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin:4px 0 10px"><div><strong style="font-size:13px;color:var(--txt)">Publicaciones de tu comunidad</strong><div style="font-size:9px;color:var(--txt3)">Vecinos, profesionales, negocios e instituciones</div></div><a href="explorar.html" style="font-size:10px;color:var(--az);font-weight:800;text-decoration:none">Explorar perfiles</a></div>${posts.map(post=>card(post,user?.id)).join('')}<div style="text-align:center;margin:10px 0 4px"><a class="mz-btn ghost" href="publicar.html"><i class="ti ti-plus"></i> Crear publicación</a></div>`;
  bind();
 }catch(error){root.innerHTML=`<div class="mz-card" style="padding:18px;color:var(--rj)">No se pudieron cargar las publicaciones: ${esc(error.message)}</div>`;}
}
function card(p,userId){
 const kind=labels[p.categoria_publicacion]||'Publicación';
 const type=({vecino:'Vecino',profesional:'Profesional',negocio:'Negocio',institucion:'Institución',organizacion:'Organización'})[p.tipo_perfil]||'Vecino';
 const avatar=p.avatar_url?`<img src="${esc(p.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:esc(initials(p.nombre_visible));
 return `<article class="mz-post" data-home-post="${p.id}" style="margin-bottom:10px">
  <div class="mz-post-head"><div class="mz-post-av" style="background:var(--az-bg);color:var(--az)">${avatar}</div><div style="min-width:0"><div class="mz-post-name"><a href="usuario.html?u=${encodeURIComponent(p.username||'')}" style="color:inherit;text-decoration:none">${esc(p.nombre_visible||p.username||'Usuario')}</a></div><div class="mz-post-meta">@${esc(p.username||'usuario')} · ${esc(type)} · ${ago(p.creado_en)}</div></div><span style="margin-left:auto;font-size:8px;font-weight:900;background:var(--az-bg);color:var(--az);border-radius:99px;padding:4px 7px">${esc(kind)}</span></div>
  ${p.titulo?`<div style="padding:0 14px 4px;font-size:13px;font-weight:800;color:var(--txt)">${esc(p.titulo)}</div>`:''}
  ${p.contenido?`<div class="mz-post-body">${esc(p.contenido).replaceAll('\n','<br>')}</div>`:''}
  ${(p.ubicacion_texto||p.fecha_evento)?`<div style="padding:0 14px 9px;font-size:9px;color:var(--txt3);display:flex;gap:10px;flex-wrap:wrap">${p.ubicacion_texto?`<span>📍 ${esc(p.ubicacion_texto)}</span>`:''}${p.fecha_evento?`<span>📅 ${new Date(p.fecha_evento).toLocaleString('es-PE')}</span>`:''}</div>`:''}
  ${p.archivo_url&&p.tipo==='imagen'?`<img src="${esc(p.archivo_url)}" alt="${esc(p.titulo||kind)}" loading="lazy" style="width:100%;max-height:460px;object-fit:cover;display:block">`:''}
  <div class="mz-post-footer"><button class="mz-post-action" data-home-like="${p.id}"><i class="ti ${p.usuario_dio_me_gusta?'ti-heart-filled':'ti-heart'}"></i> <span>${Number(p.total_me_gusta||0)}</span></button><button class="mz-post-action" onclick="location.href='usuario.html?u=${encodeURIComponent(p.username||'')}'"><i class="ti ti-message"></i> ${Number(p.total_comentarios||0)}</button><button class="mz-post-action" data-home-share="${p.id}" data-title="${esc(p.titulo||kind)}"><i class="ti ti-share"></i> Compartir</button><button class="mz-post-action" onclick="location.href='usuario.html?u=${encodeURIComponent(p.username||'')}'"><i class="ti ti-user"></i> Perfil</button></div>
 </article>`;
}
function bind(){
 root.querySelectorAll('[data-home-like]').forEach(btn=>btn.addEventListener('click',async()=>{try{const liked=await toggleLike(btn.dataset.homeLike);const count=btn.querySelector('span');count.textContent=Math.max(0,Number(count.textContent||0)+(liked?1:-1));btn.querySelector('i').className=`ti ${liked?'ti-heart-filled':'ti-heart'}`;}catch(e){if(/sesión/i.test(e.message))location.href='login.html?next=index.html';else alert(e.message);}}));
 root.querySelectorAll('[data-home-share]').forEach(btn=>btn.addEventListener('click',async()=>{const url=`${location.origin}/index.html?publicacion=${encodeURIComponent(btn.dataset.homeShare)}`;try{await registerShare(btn.dataset.homeShare).catch(()=>{});if(navigator.share)await navigator.share({title:btn.dataset.title,text:'Mira esta publicación en MiZona',url});else{await navigator.clipboard.writeText(url);window.mostrarToast?.('Enlace copiado.');}}catch{}}));
}
