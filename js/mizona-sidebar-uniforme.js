/* MiZona.pe — componente único para las barras laterales antiguas.
   Las páginas que ya usan mz3-shell conservan su estructura y reciben
   el mismo diseño mediante mizona-sidebar-uniforme.css. */
const MENU = [
  ['Principal', [
    ['index.html','ti-home','Inicio'],
    ['alertas.html','ti-bell','Alertas','alertBadge'],
    ['mapa.html','ti-map','Mapa'],
    ['servicios.html','ti-tool','Servicios'],
    ['solicitudes.html','ti-clipboard-list','Solicitudes'],
  ]],
  ['Comunidad', [
    ['ofertas.html','ti-tag','Zona Ofertas'],
    ['ride.html','ti-car','MiZonaRide'],
    ['empleos.html','ti-briefcase','Empleos'],
    ['explorar.html','ti-compass','Explorar'],
    ['sugerencias.html','ti-bulb','Sugerencias'],
  ]],
  ['Cuenta', [
    ['mensajes.html','ti-message','Mensajes'],
    ['amistades.html','ti-users','Amigos'],
    ['notificaciones.html','ti-bell-ringing','Notificaciones'],
    ['perfil.html','ti-user','Mi perfil'],
    ['negocio.html','ti-building-store','Mi negocio'],
    ['admin.html','ti-shield','Administración','admin'],
  ]],
];

const ADMIN_PAGES = new Set(['admin.html','admin-alertas.html','admin-negocios.html']);
const PAGE_ALIASES = new Map([
  ['alerta.html','alertas.html'],
  ['distrito.html','mapa.html'],
  ['negocio-publico.html','negocio.html'],
  ['oferta.html','ofertas.html'],
  ['usuario.html','explorar.html'],
  ['admin-alertas.html','admin.html'],
  ['admin-negocios.html','admin.html'],
]);

function pageName(){ return (location.pathname.split('/').pop() || 'index.html').toLowerCase(); }
function initials(name='Usuario'){ return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase() || 'U'; }
function esc(value=''){ return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function navMarkup(){
  const raw=pageName();
  const active=PAGE_ALIASES.get(raw) || raw;
  return MENU.map(([label,items])=>`
    <div class="mz-nav-sec mz-u-label">${label}</div>
    <nav class="mz-nav mz-u-nav">
      ${items.map(([href,icon,text,special])=>{
        const selected=active===href || (special==='admin' && ADMIN_PAGES.has(raw));
        const attrs=special==='admin' ? ' id="link-admin" data-admin-link hidden' : '';
        const badge=special==='alertBadge' ? '<span class="mz-nav-badge" id="nb-alertas">0</span>' : '';
        return `<a class="mz-nav-item mz-u-link${selected?' active':''}" href="${href}"${selected?' aria-current="page"':''}${attrs}><i class="ti ${icon}"></i><span>${text}</span>${badge}</a>`;
      }).join('')}
    </nav>`).join('');
}

function staticSidebarMarkup(){
  return `
    <a class="mz-logo mz-u-brand" href="index.html" aria-label="MiZona.pe"><img class="mz-logo-img" src="assets/mizona-logo-blanco.svg" alt="MiZona.pe"></a>
    <a class="mz-sidebar-user mz-u-account hide-guest" id="sb-user" href="perfil.html">
      <span class="mz-user-av mz-u-avatar" id="sb-av">U</span>
      <span><strong class="mz-user-name mz-u-name" id="sb-name">Usuario</strong><small class="mz-user-dist mz-u-meta"><i class="ti ti-map-pin"></i><span id="sb-dist">Tu zona</span></small></span>
    </a>
    <div class="mz-u-guest hide-logged" id="mz-u-guest">
      <a href="login.html">Ingresar</a><a href="registro.html">Crear cuenta</a>
    </div>
    ${navMarkup()}
    <div class="mz-sidebar-spacer mz-u-spacer"></div>
    <button id="btn-instalar-pwa" type="button"><i class="ti ti-download"></i> Instalar MiZona</button>
    <a class="mz-sidebar-btn mz-u-publish" href="alertas.html#reportar"><i class="ti ti-plus"></i> Publicar en mi zona</a>`;
}

function normalizeStaticSidebar(sidebar){
  if(!sidebar || sidebar.classList.contains('mz3-sidebar') || sidebar.dataset.uniforme==='1') return;
  sidebar.dataset.uniforme='1';
  sidebar.innerHTML=staticSidebarMarkup();
}

function markMasterSidebar(sidebar){
  if(!sidebar || !sidebar.classList.contains('mz3-sidebar')) return;
  sidebar.dataset.uniforme='1';
  const raw=pageName();
  const active=PAGE_ALIASES.get(raw) || raw;
  sidebar.querySelectorAll('.mz3-nav a').forEach(a=>{
    const href=(a.getAttribute('href')||'').split('?')[0].split('#')[0];
    const selected=href===active || (href==='admin.html' && ADMIN_PAGES.has(raw));
    a.classList.toggle('active',selected);
    if(selected) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
  });
}

async function updateAccount(){
  const sidebars=[...document.querySelectorAll('.mz-sidebar,.mz3-sidebar')];
  if(!sidebars.length) return;
  try{
    const { supabase, getCurrentUser }=await import('./supabase.js');
    const user=await getCurrentUser();
    document.body.classList.toggle('estado-logged',Boolean(user));
    document.body.classList.toggle('estado-guest',!user);
    if(!user){
      document.querySelectorAll('[data-admin-link],#link-admin').forEach(el=>el.hidden=true);
      return;
    }
    const {data:profile}=await supabase.from('perfiles').select('nombre_visible,full_name,username,avatar_url,distrito,zona').eq('id',user.id).maybeSingle();
    const name=profile?.nombre_visible || profile?.full_name || profile?.username || user.email?.split('@')[0] || 'Usuario';
    const meta=profile?.distrito || profile?.zona || (profile?.username ? '@'+profile.username : 'Tu zona');
    const avatar=profile?.avatar_url ? `<img src="${esc(profile.avatar_url)}" alt="">` : initials(name);
    document.querySelectorAll('#sb-name,#mz3SideName').forEach(el=>el.textContent=name);
    document.querySelectorAll('#sb-dist,#mz3SideMeta').forEach(el=>el.textContent=meta);
    document.querySelectorAll('#sb-av,#mz3SideAvatar').forEach(el=>el.innerHTML=avatar);
    try{
      const {data:isAdmin}=await supabase.rpc('is_admin');
      document.querySelectorAll('[data-admin-link],#link-admin').forEach(el=>{ el.hidden=!isAdmin; el.style.display=isAdmin?'flex':'none'; });
    }catch(_){ }
    try{
      const {count}=await supabase.from('alertas').select('id',{count:'exact',head:true}).in('estado',['reportada','verificada','en_revision']);
      document.querySelectorAll('#nb-alertas').forEach(el=>{ el.textContent=String(Number(count||0)); el.hidden=Number(count||0)===0; });
    }catch(_){ }
  }catch(_){ }
}

function apply(){
  document.querySelectorAll('aside.mz-sidebar').forEach(normalizeStaticSidebar);
  document.querySelectorAll('aside.mz3-sidebar').forEach(markMasterSidebar);
  updateAccount();
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',apply,{once:true}); else apply();
const observer=new MutationObserver(()=>{
  const pending=[...document.querySelectorAll('aside.mz-sidebar:not([data-uniforme="1"]),aside.mz3-sidebar:not([data-uniforme="1"])')];
  if(!pending.length) return;
  pending.forEach(el=>el.classList.contains('mz3-sidebar')?markMasterSidebar(el):normalizeStaticSidebar(el));
  updateAccount();
});
observer.observe(document.documentElement,{childList:true,subtree:true});
