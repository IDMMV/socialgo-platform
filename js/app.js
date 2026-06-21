import { APP_CONFIG } from './config.js';
import { applyBrand } from './brand.js';
import { getCurrentUser } from './supabase.js';

applyBrand();
const needUser = async message => { const u = await getCurrentUser(); if (!u) { alert(message); location.href='registro.html'; return null; } return u; };
const dialog=document.querySelector('#composerDialog');
for(const id of ['openComposer','openComposer2','mobileCreate']) document.querySelector(`#${id}`)?.addEventListener('click',async()=>{if(await needUser('Regístrate o inicia sesión para publicar.'))dialog?.showModal()});
document.querySelectorAll('[data-action="like"]').forEach(b=>b.onclick=async()=>{if(!await needUser('Regístrate para dar Me gusta.'))return;const c=b.querySelector('span'),a=b.classList.toggle('active');if(c)c.textContent=String(Number(c.textContent)+(a?1:-1));b.firstChild.textContent=a?'♥ ':'♡ '});
document.querySelectorAll('[data-action="save"]').forEach(b=>b.onclick=async()=>{if(await needUser('Regístrate para guardar publicaciones.'))b.classList.toggle('active')});
document.querySelectorAll('[data-action="share"]').forEach(b=>b.onclick=async()=>{if(!await needUser('Regístrate para compartir publicaciones.'))return;try{if(navigator.share)await navigator.share({title:document.title,text:'Mira esta publicación',url:location.href});else{await navigator.clipboard.writeText(location.href);alert('Enlace copiado.')}}catch(e){if(e.name!=='AbortError')console.error(e)}});
document.querySelector('#publishDemo')?.addEventListener('click',async()=>{if(await needUser('Debes iniciar sesión.')){alert('Tu sesión ya es real. Las publicaciones reales se agregarán en la Fase 3.');dialog?.close()}});
if('serviceWorker'in navigator&&APP_CONFIG.enablePWA)window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(console.error));
