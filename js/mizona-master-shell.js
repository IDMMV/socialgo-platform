const PAGE_INFO = {
  'alertas.html':['Alertas de tu zona','Reporta, confirma y sigue eventos cercanos'],
  'mapa.html':['Mapa de alertas','Incidentes y avisos en tiempo real'],
  'servicios.html':['Servicios cerca de ti','Profesionales y negocios de tu zona'],
  'solicitudes.html':['Solicitudes vecinales','Publica lo que necesitas y recibe ayuda'],
  'ofertas.html':['Zona Ofertas','Promociones verificadas cerca de ti'],
  'ride.html':['MiZonaRide','Movilidad y transporte en tu zona'],
  'empleos.html':['Empleos','Oportunidades laborales cercanas'],
  'mensajes.html':['Mensajes','Conversaciones privadas'],
  'amistades.html':['Amigos','Contactos y solicitudes'],
  'notificaciones.html':['Notificaciones','Actividad reciente y preferencias'],
  'perfil.html':['Mi perfil','Tu cuenta y actividad en MiZona'],
  'negocio.html':['Mi negocio','Administra tu presencia comercial'],
  'negocio-publico.html':['Negocio local','Servicios, ofertas y opiniones'],
  'oferta.html':['Detalle de oferta','Promoción verificada en MiZona'],
  'admin-negocios.html':['Negocios y ofertas','Moderación administrativa'],
  'explorar.html':['Explorar','Personas, negocios y contenido'],
  'admin.html':['Administración','Control general de MiZona'],
  'usuario.html':['Perfil público','Información y publicaciones'],
};

const NAV = [
  ['Principal',[
    ['index.html','ti-home','Inicio'],
    ['alertas.html','ti-bell','Alertas'],
    ['mapa.html','ti-map','Mapa'],
    ['servicios.html','ti-tool','Servicios'],
    ['solicitudes.html','ti-clipboard-list','Solicitudes'],
  ]],
  ['Comunidad',[
    ['ofertas.html','ti-tag','Zona Ofertas'],
    ['ride.html','ti-car','MiZonaRide'],
    ['empleos.html','ti-briefcase','Empleos'],
    ['explorar.html','ti-compass','Explorar'],
  ]],
  ['Cuenta',[
    ['mensajes.html','ti-message','Mensajes'],
    ['amistades.html','ti-users','Amigos'],
    ['notificaciones.html','ti-bell','Notificaciones'],
    ['perfil.html','ti-user','Mi perfil'],
    ['negocio.html','ti-building-store','Mi negocio'],
    ['admin.html','ti-shield','Administración'],
  ]],
];

const SKIP = new Set(['index.html','login.html','registro.html','recuperar.html','restablecer.html','auth-callback.html','clips.html','_preview_phase2.html']);

function currentFile(){ return (location.pathname.split('/').pop() || 'index.html').toLowerCase(); }
function initials(name='Usuario'){ return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase() || 'U'; }
function safe(value=''){ return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function navHtml(page){
  return NAV.map(([group,links])=>`<div class="mz3-nav-label">${group}</div><nav class="mz3-nav">${links.map(([href,icon,label])=>`<a href="${href}" class="${page===href?'active':''}"><i class="ti ${icon}"></i><span>${label}</span></a>`).join('')}</nav>`).join('');
}

function mobileHtml(page){
  const items=[['index.html','ti-home','Inicio'],['alertas.html','ti-bell','Alertas'],['__plus__','ti-plus',''],['mapa.html','ti-map','Mapa'],['perfil.html','ti-user','Perfil']];
  return items.map(([href,icon,label])=> href==='__plus__'
    ? `<a class="mz3-mobile-plus" href="index.html?publicar=1" aria-label="Publicar"><i class="ti ${icon}"></i></a>`
    : `<a href="${href}" class="${page===href?'active':''}"><i class="ti ${icon}"></i><span>${label}</span></a>`).join('');
}

function detachMain(page){
  let wrapper=null, main=null;
  const layout2=document.querySelector('body > .mz-layout-2col');
  const app=document.querySelector('body > .mz-app');
  const layout=document.querySelector('body > .layout');
  const shellLayout=document.querySelector('body > .mz-layout');
  const pageShell=document.querySelector('body > main.page-shell');
  const directMain=document.querySelector('body > main.mz-main, body > main.mz-feed, body > main.main');

  if(app){ wrapper=app; main=app.querySelector(':scope > .mz-main'); }
  else if(layout2){ wrapper=layout2; main=layout2.querySelector(':scope > .mz-feed,:scope > .mz-main'); }
  else if(layout){ wrapper=layout; main=layout.querySelector(':scope > .main'); }
  else if(shellLayout){ wrapper=shellLayout; main=shellLayout.querySelector(':scope > .mz-feed,:scope > .mz-main'); }
  else if(pageShell){ main=pageShell; }
  else if(directMain){ main=directMain; }

  if(!main) return null;
  const hidden=main.hidden;
  const oldHeader=main.querySelector(':scope > .mz-topbar,:scope > header.mz-topbar,:scope > .topbar,:scope > header:first-child');
  if(oldHeader && (oldHeader.classList.contains('mz-topbar') || oldHeader.classList.contains('topbar') || main.classList.contains('page-shell'))) oldHeader.remove();
  main.remove();
  if(wrapper) wrapper.remove();
  document.querySelectorAll('body > .mz-mobile-bottom,body > .mz-bottom-nav,body > .bottom-nav').forEach(n=>n.remove());
  main.hidden=hidden;
  return main;
}

function buildShell(page,main){
  const [title,subtitle]=PAGE_INFO[page] || [main.querySelector('h1')?.textContent?.trim() || 'MiZona','Tu comunidad, más cerca'];
  const shell=document.createElement('div');
  shell.className='mz3-shell';
  shell.innerHTML=`
    <aside class="mz3-sidebar" id="mz3Sidebar">
      <a class="mz3-brand" href="index.html" aria-label="MiZona.pe"><img class="mz3-brand-logo" src="assets/mizona-logo-blanco.svg" alt="MiZona.pe"></a>
      <a class="mz3-account" id="mz3Account" href="perfil.html" hidden><span class="mz3-account-avatar" id="mz3SideAvatar">U</span><span class="mz3-account-copy"><strong id="mz3SideName">Usuario</strong><small id="mz3SideMeta">Tu zona</small></span></a>
      <div class="mz3-guest" id="mz3Guest" hidden><a href="login.html">Ingresar</a><a href="registro.html">Crear cuenta</a></div>
      ${navHtml(page)}
      <div class="mz3-sidebar-spacer"></div>
      <button class="mz3-publish" id="mz3Publish" type="button"><i class="ti ti-plus"></i> Publicar en mi zona</button>
    </aside>
    <div class="mz3-drawer-backdrop" id="mz3Backdrop"></div>
    <section class="mz3-workspace">
      <header class="mz3-topbar">
        <button class="mz3-menu" id="mz3Menu" type="button" aria-label="Abrir menú"><i class="ti ti-menu-2"></i></button>
        <button class="mz3-location" id="mz3Location" type="button"><i class="ti ti-map-pin-filled"></i><span id="mz3Zone">Mi zona</span></button>
        <label class="mz3-search"><i class="ti ti-search"></i><input id="mz3Search" type="search" placeholder="Buscar en MiZona..."></label>
        <a class="mz3-add-btn" href="index.html?publicar=1" aria-label="Publicar"><i class="ti ti-plus"></i></a>
        <a class="mz3-icon-btn" href="notificaciones.html" aria-label="Notificaciones"><i class="ti ti-bell"></i><span class="mz3-icon-dot" id="mz3NotifDot" hidden></span></a>
        <a class="mz3-profile-btn" id="mz3TopProfile" href="perfil.html"><span class="mz3-top-avatar" id="mz3TopAvatar">U</span><span class="mz3-profile-copy"><strong id="mz3TopName">Perfil</strong><small>Ver cuenta</small></span></a>
      </header>
      <div class="mz3-content"></div>
    </section>
    <nav class="mz3-mobile-nav">${mobileHtml(page)}</nav>`;
  shell.querySelector('.mz3-content').appendChild(main);
  shell.hidden=main.hidden;
  return shell;
}

async function loadAccount(shell){
  const guest=shell.querySelector('#mz3Guest');
  const account=shell.querySelector('#mz3Account');
  const top=shell.querySelector('#mz3TopProfile');
  try{
    const { supabase, getCurrentUser } = await import('./supabase.js');
    const user=await getCurrentUser();
    if(!user){ guest.hidden=false; account.hidden=true; top.href='login.html'; return; }
    const {data}=await supabase.from('perfiles').select('nombre_visible,username,avatar_url,distrito').eq('id',user.id).maybeSingle();
    const name=data?.nombre_visible || user.user_metadata?.nombre_visible || data?.username || 'Usuario';
    const meta=data?.distrito || (data?.username ? '@'+data.username : 'Tu zona');
    const avatar=data?.avatar_url ? `<img src="${safe(data.avatar_url)}" alt="">` : initials(name);
    shell.querySelector('#mz3SideName').textContent=name;
    shell.querySelector('#mz3SideMeta').textContent=meta;
    shell.querySelector('#mz3Zone').textContent=data?.distrito || 'Mi zona';
    shell.querySelector('#mz3TopName').textContent=name.split(' ')[0] || 'Perfil';
    shell.querySelector('#mz3SideAvatar').innerHTML=avatar;
    shell.querySelector('#mz3TopAvatar').innerHTML=avatar;
    account.hidden=false; guest.hidden=true;
    try{
      const {count}=await supabase.from('notificaciones').select('id',{count:'exact',head:true}).eq('usuario_id',user.id).eq('leida',false);
      shell.querySelector('#mz3NotifDot').hidden=!(count>0);
    }catch(_){ }
  }catch(_){ guest.hidden=false; account.hidden=true; top.href='login.html'; }
}

function init(){
  const page=currentFile();
  if(SKIP.has(page) || document.body.classList.contains('auth-page') || document.body.classList.contains('clips-page')) return;
  if(document.querySelector('.mz3-shell')) return;
  const main=detachMain(page);
  if(!main) return;
  const shell=buildShell(page,main);
  document.body.insertBefore(shell,document.body.firstChild);
  document.body.classList.add('mz-master-shell-active');
  document.documentElement.classList.add('mz-master-document-active');

  const menu=shell.querySelector('#mz3Menu');
  const backdrop=shell.querySelector('#mz3Backdrop');
  const close=()=>document.body.classList.remove('mz3-drawer-open');
  menu?.addEventListener('click',()=>document.body.classList.toggle('mz3-drawer-open'));
  backdrop?.addEventListener('click',close);
  shell.querySelectorAll('.mz3-sidebar a').forEach(a=>a.addEventListener('click',close));
  shell.querySelector('#mz3Publish')?.addEventListener('click',()=>location.href='index.html?publicar=1');
  shell.querySelector('#mz3Location')?.addEventListener('click',()=>location.href='mapa.html');
  const search=shell.querySelector('#mz3Search');
  search?.addEventListener('keydown',e=>{ if(e.key==='Enter'){ const q=search.value.trim(); location.href=q?`explorar.html?q=${encodeURIComponent(q)}`:'explorar.html'; }});

  const observer=new MutationObserver(()=>{ shell.hidden=main.hidden; });
  observer.observe(main,{attributes:true,attributeFilter:['hidden']});
  loadAccount(shell);
}

init();
