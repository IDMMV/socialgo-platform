import { supabase } from './supabase.js';
import { getSessionSnapshot, getCachedSessionSnapshot, paintCachedIdentity, clearSessionSnapshot } from './session-state.js';

const PAGE_INFO = {
  'alertas.html':['Alertas de tu zona'], 'alerta.html':['Seguimiento de alerta'], 'mapa.html':['Mapa de alertas'],
  'servicios.html':['Servicios cerca de ti'], 'solicitudes.html':['Solicitudes vecinales'], 'ofertas.html':['Zona Ofertas'],
  'ride.html':['MiZonaRide'], 'empleos.html':['Empleos'], 'mensajes.html':['Mensajes'], 'amistades.html':['Amigos'],
  'contactos-confianza.html':['Contactos de confianza'], 'notificaciones.html':['Notificaciones'], 'perfil.html':['Mi perfil'],
  'proveedor.html':['Ofrecer servicios'], 'negocio.html':['Mi negocio'], 'negocio-publico.html':['Negocio local'],
  'oferta.html':['Detalle de oferta'], 'admin-proveedores.html':['Proveedores'], 'admin-negocios.html':['Negocios y ofertas'],
  'admin-alertas.html':['Alertas y sugerencias'], 'sugerencias.html':['Sugerencias'], 'explorar.html':['Explorar'],
  'admin.html':['Administración'], 'usuario.html':['Perfil público'], 'verificar-telefono.html':['Verificar teléfono']
};

const NAV = [
  ['Principal',[
    ['index.html','ti-home','Inicio'],['alertas.html','ti-bell','Alertas'],['mapa.html','ti-map','Mapa'],
    ['servicios.html','ti-tool','Servicios'],['solicitudes.html','ti-clipboard-list','Solicitudes']]],
  ['Comunidad',[
    ['ofertas.html','ti-tag','Zona Ofertas'],['ride.html','ti-car','MiZonaRide'],['empleos.html','ti-briefcase','Empleos'],
    ['explorar.html','ti-compass','Explorar'],['sugerencias.html','ti-bulb','Sugerencias']]],
  ['Cuenta',[
    ['mensajes.html','ti-message','Mensajes'],['amistades.html','ti-users','Amigos'],
    ['contactos-confianza.html','ti-shield-heart','Contactos de confianza'],['notificaciones.html','ti-bell-ringing','Notificaciones'],
    ['perfil.html','ti-user','Mi perfil'],['proveedor.html','ti-tool','Ofrecer servicios'],['negocio.html','ti-building-store','Mi negocio'],
    ['admin.html','ti-shield','Administración','admin']]]
];
const SKIP = new Set(['index.html','login.html','registro.html','recuperar.html','restablecer.html','auth-callback.html','clips.html','_preview_phase2.html']);
const ADMIN_PAGES = new Set(['admin.html','admin-alertas.html','admin-negocios.html','admin-proveedores.html']);
const ALIASES = new Map([['alerta.html','alertas.html'],['negocio-publico.html','negocio.html'],['oferta.html','ofertas.html'],['usuario.html','explorar.html'],['admin-alertas.html','admin.html'],['admin-negocios.html','admin.html'],['admin-proveedores.html','admin.html']]);

function currentFile(){ return (location.pathname.split('/').pop() || 'index.html').toLowerCase(); }
function initials(name='Usuario'){ return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase() || 'U'; }
function safe(value=''){ return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function activeFor(page,href,special){ const active=ALIASES.get(page)||page; return active===href || (special==='admin'&&ADMIN_PAGES.has(page)); }

function navHtml(page){
  return NAV.map(([group,links])=>`<div class="mz3-nav-label">${group}</div><nav class="mz3-nav">${links.map(([href,icon,label,special])=>`<a href="${href}" class="${activeFor(page,href,special)?'active':''}" ${special==='admin'?'data-admin-link hidden':''}><i class="ti ${icon}"></i><span>${label}</span></a>`).join('')}</nav>`).join('');
}
function mobileHtml(page){
  const items=[['index.html','ti-home','Inicio'],['alertas.html','ti-bell','Alertas'],['__plus__','ti-plus',''],['mensajes.html','ti-message','Mensajes'],['perfil.html','ti-user','Perfil']];
  return items.map(([href,icon,label])=>href==='__plus__'?`<a class="mz3-mobile-plus" href="alertas.html#reportar" aria-label="Publicar"><i class="ti ${icon}"></i></a>`:`<a href="${href}" class="${activeFor(page,href)?'active':''}"><i class="ti ${icon}"></i><span>${label}</span></a>`).join('');
}
function detachMain(){
  let wrapper=null,main=null;
  const candidates=[document.querySelector('body > .mz-layout-2col'),document.querySelector('body > .mz-app'),document.querySelector('body > .layout'),document.querySelector('body > .mz-layout')].filter(Boolean);
  for(const c of candidates){ const found=c.querySelector(':scope > .mz-feed,:scope > .mz-main,:scope > .main'); if(found){wrapper=c;main=found;break;} }
  main ||= document.querySelector('body > main.page-shell,body > main.mz-main,body > main.mz-feed,body > main.main');
  if(!main) return null;
  const hidden=main.hidden;
  const oldHeader=main.querySelector(':scope > .mz-topbar,:scope > header.mz-topbar,:scope > .topbar,:scope > header.mz-legacy-header');
  oldHeader?.remove(); main.remove(); wrapper?.remove();
  document.querySelectorAll('body > .mz-mobile-bottom,body > .mz-bottom-nav,body > .bottom-nav').forEach(n=>n.remove());
  main.hidden=hidden; return main;
}
function buildShell(page,main){
  const shell=document.createElement('div'); shell.className='mz3-shell auth-conditional';
  shell.innerHTML=`<aside class="mz3-sidebar" id="mz3Sidebar">
    <a class="mz3-brand" href="index.html"><img class="mz3-brand-logo" src="assets/mizona-logo-blanco.svg" alt="MiZona.pe"></a>
    <a class="mz3-account" id="mz3Account" href="perfil.html" hidden><span class="mz3-account-avatar" id="mz3SideAvatar">U</span><span class="mz3-account-copy"><strong id="mz3SideName" data-mz-name>Usuario</strong><small id="mz3SideMeta" data-mz-zone>Mi zona</small></span></a>
    <div class="mz-account-actions" id="mz3AccountActions" hidden><a class="primary" href="perfil.html">Mi cuenta</a><button id="mz3Logout" type="button">Cerrar sesión</button></div>
    <div class="mz3-guest" id="mz3Guest" hidden><a href="login.html">Ingresar</a><a href="registro.html">Crear cuenta</a></div>
    ${navHtml(page)}<div class="mz3-sidebar-spacer"></div><button class="mz3-publish" id="mz3Publish" type="button"><i class="ti ti-plus"></i> Publicar en mi zona</button>
  </aside><div class="mz3-drawer-backdrop" id="mz3Backdrop"></div>
  <section class="mz3-workspace"><header class="mz3-topbar"><button class="mz3-menu" id="mz3Menu" type="button"><i class="ti ti-menu-2"></i></button>
    <button class="mz3-location" id="mz3Location" type="button"><i class="ti ti-map-pin-filled"></i><span id="mz3Zone">Mi zona</span></button>
    <label class="mz3-search"><i class="ti ti-search"></i><input id="mz3Search" type="search" placeholder="Buscar en MiZona..."></label>
    <a class="mz3-add-btn" href="alertas.html#reportar" aria-label="Publicar"><i class="ti ti-plus"></i></a>
    <a class="mz3-icon-btn" href="notificaciones.html" aria-label="Notificaciones"><i class="ti ti-bell"></i><span class="mz3-icon-dot" id="mz3NotifDot" hidden></span></a>
    <a class="mz3-profile-btn" id="mz3TopProfile" href="perfil.html"><span class="mz3-top-avatar" id="mz3TopAvatar">U</span><span class="mz3-profile-copy"><strong id="mz3TopName" data-mz-first-name>Perfil</strong><small id="mz3TopMeta">Ver cuenta</small></span></a>
  </header><div class="mz3-content"></div></section><nav class="mz3-mobile-nav">${mobileHtml(page)}</nav>`;
  shell.querySelector('.mz3-content').appendChild(main); shell.hidden=main.hidden; return shell;
}
function avatarHtml(snapshot){ return snapshot.avatarUrl?`<img src="${safe(snapshot.avatarUrl)}" alt="">`:initials(snapshot.fullName); }
function renderAccount(shell,snapshot){
  const logged=Boolean(snapshot?.userId); document.documentElement.dataset.authState=logged?'logged':'guest';
  document.body.classList.toggle('estado-logged',logged);document.body.classList.toggle('estado-guest',!logged);document.body.classList.remove('auth-pending');
  shell.querySelector('#mz3Guest').hidden=logged; shell.querySelector('#mz3Account').hidden=!logged; shell.querySelector('#mz3AccountActions').hidden=!logged;
  const top=shell.querySelector('#mz3TopProfile'); top.href=logged?'perfil.html':'login.html';
  if(!logged){ shell.querySelector('#mz3TopName').textContent='Ingresar'; shell.querySelector('#mz3TopMeta').textContent='Tu cuenta'; return; }
  const meta=snapshot.publicHandle || snapshot.district || 'Mi zona';
  shell.querySelector('#mz3SideName').textContent=snapshot.fullName; shell.querySelector('#mz3SideMeta').textContent=meta;
  shell.querySelector('#mz3Zone').textContent=snapshot.district||'Mi zona'; shell.querySelector('#mz3TopName').textContent=snapshot.firstName;
  shell.querySelector('#mz3TopMeta').textContent=snapshot.providerStatus==='aprobado'?'Proveedor aprobado':'Ver cuenta';
  const avatar=avatarHtml(snapshot); shell.querySelector('#mz3SideAvatar').innerHTML=avatar;shell.querySelector('#mz3TopAvatar').innerHTML=avatar;
}
async function loadAccount(shell){
  const cached=getCachedSessionSnapshot(); if(cached) renderAccount(shell,cached);
  try{
    const snapshot=await getSessionSnapshot(); renderAccount(shell,snapshot);
    if(!snapshot) return;
    const [{data:isAdmin},{count}]=await Promise.all([
      Promise.resolve(supabase.rpc('is_admin')).catch(()=>({data:false})),
      Promise.resolve(supabase.from('notificaciones').select('id',{count:'exact',head:true}).eq('usuario_id',snapshot.userId).eq('leida',false)).catch(()=>({count:0}))
    ]);
    shell.querySelectorAll('[data-admin-link]').forEach(el=>el.hidden=!isAdmin);
    shell.querySelector('#mz3NotifDot').hidden=!(Number(count||0)>0);
  }catch{ renderAccount(shell,cached||null); }
}
function bind(shell,main){
  const close=()=>document.body.classList.remove('mz3-drawer-open');
  shell.querySelector('#mz3Menu')?.addEventListener('click',()=>document.body.classList.toggle('mz3-drawer-open'));
  shell.querySelector('#mz3Backdrop')?.addEventListener('click',close); shell.querySelectorAll('.mz3-sidebar a').forEach(a=>a.addEventListener('click',close));
  shell.querySelector('#mz3Publish')?.addEventListener('click',()=>location.href='alertas.html#reportar');
  shell.querySelector('#mz3Location')?.addEventListener('click',()=>location.href='mapa.html');
  shell.querySelector('#mz3Search')?.addEventListener('keydown',e=>{if(e.key==='Enter'){const q=e.currentTarget.value.trim();location.href=q?`explorar.html?q=${encodeURIComponent(q)}`:'explorar.html';}});
  shell.querySelector('#mz3Logout')?.addEventListener('click',async()=>{try{await supabase.auth.signOut();clearSessionSnapshot();location.href='index.html';}catch{window.mzToast?.('No se pudo cerrar sesión','error');}});
  new MutationObserver(()=>{shell.hidden=main.hidden}).observe(main,{attributes:true,attributeFilter:['hidden']});
}
function init(){
  const page=currentFile(); if(SKIP.has(page)||document.body.classList.contains('auth-page')||document.querySelector('.mz3-shell'))return;
  document.documentElement.dataset.authState='unknown'; document.body.classList.add('auth-pending'); paintCachedIdentity();
  const main=detachMain(); if(!main)return; const shell=buildShell(page,main);document.body.prepend(shell);
  document.body.classList.add('mz-master-shell-active');document.documentElement.classList.add('mz-master-document-active');bind(shell,main);loadAccount(shell);
  window.addEventListener('mizona:auth-change',()=>loadAccount(shell));
}
init();
