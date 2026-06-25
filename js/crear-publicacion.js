import { supabase, getCurrentUser } from './supabase.js';
import { createPost } from './publicaciones.js';

const TYPES={
  vecino:[
    ['general','ti-message-circle','Publicación vecinal','Comparte algo útil de tu barrio'],
    ['consejo','ti-bulb','Consejo','Recomendación de seguridad o convivencia'],
    ['recomendacion','ti-star','Recomendación','Recomienda un lugar o servicio'],
    ['evento','ti-calendar-event','Evento','Invita a una actividad cercana'],
    ['foto','ti-camera','Foto de la zona','Comparte una imagen de interés local']
  ],
  profesional:[
    ['trabajo','ti-photo-check','Trabajo realizado','Muestra resultados y experiencia'],
    ['consejo','ti-bulb','Consejo profesional','Orienta a los vecinos'],
    ['general','ti-message-circle','Novedad','Disponibilidad o anuncio profesional']
  ],
  negocio:[
    ['producto','ti-package','Producto o novedad','Muestra productos y novedades'],
    ['general','ti-speakerphone','Publicación del negocio','Informa horarios o novedades']
  ],
  institucion:[
    ['comunicado','ti-file-description','Comunicado oficial','Información institucional'],
    ['campana','ti-megaphone','Campaña','Campañas de salud, seguridad o servicios'],
    ['evento','ti-calendar-event','Evento institucional','Actividad pública programada']
  ],
  organizacion:[
    ['actividad','ti-users-group','Actividad vecinal','Convoca a una actividad comunitaria'],
    ['reunion','ti-calendar-time','Reunión','Informa una reunión de vecinos'],
    ['evento','ti-calendar-event','Evento','Invita a la comunidad'],
    ['comunicado','ti-speakerphone','Comunicado','Información de la organización']
  ]
};
let user=null,profile=null,selected='general';
const form=document.querySelector('#publishForm');
const typesBox=document.querySelector('#accountPublishTypes');
const statusBox=document.querySelector('#publishStatus');
const eventField=document.querySelector('#eventDateField');
const imageInput=document.querySelector('#postImage');
const preview=document.querySelector('#imagePreview');

function show(message,type='info'){
  statusBox.hidden=false;statusBox.textContent=message;
  statusBox.style.background=type==='error'?'#fff0f1':type==='success'?'#eaf8f1':'#fff4e8';
  statusBox.style.borderColor=type==='error'?'#f4b4ba':type==='success'?'#b9e5cf':'#ffd5a9';
  statusBox.style.color=type==='error'?'#972b34':type==='success'?'#166a4d':'#86501e';
}
function renderTypes(){
  const type=profile?.tipo_perfil||'vecino';
  const rows=TYPES[type]||TYPES.vecino;
  typesBox.innerHTML=rows.map(([value,icon,label,desc],i)=>`<button class="publish-type-btn ${i===0?'active':''}" type="button" data-type="${value}"><i class="ti ${icon}"></i><span><strong>${label}</strong><small>${desc}</small></span></button>`).join('');
  selected=rows[0][0];updateForm();
  typesBox.querySelectorAll('[data-type]').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.publish-type-btn').forEach(x=>x.classList.remove('active'));btn.classList.add('active');selected=btn.dataset.type;updateForm();
  }));
}
function updateForm(){
  const labels={general:'Nueva publicación',consejo:'Nuevo consejo',recomendacion:'Nueva recomendación',evento:'Nuevo evento',foto:'Foto de la zona',trabajo:'Trabajo realizado',producto:'Producto o novedad',comunicado:'Comunicado',campana:'Campaña',actividad:'Actividad vecinal',reunion:'Reunión vecinal'};
  document.querySelector('#publishTitle').textContent=labels[selected]||'Nueva publicación';
  eventField.hidden=!['evento','actividad','reunion','campana'].includes(selected);
  document.querySelector('#postImage').required=['foto','trabajo','producto'].includes(selected);
}
async function init(){
  user=await getCurrentUser();
  if(!user){location.href='login.html?next=publicar.html';return;}
  const {data,error}=await supabase.from('perfiles').select('id,tipo_perfil,proveedor_estado,proveedor_tipo,distrito,zona').eq('id',user.id).maybeSingle();
  if(error){show(error.message,'error');return;}
  profile=data||{tipo_perfil:'vecino'};
  if(profile.tipo_perfil==='vecino'&&profile.proveedor_estado==='aprobado'){
    profile.tipo_perfil=profile.proveedor_tipo==='independiente'?'profesional':profile.proveedor_tipo==='organizacion'?'organizacion':profile.proveedor_tipo||'vecino';
  }
  document.querySelector('#postLocation').value=[profile.zona,profile.distrito].filter(Boolean).join(', ');
  renderTypes();
}

document.querySelector('[data-special="alerta"]')?.addEventListener('click',()=>location.href='alertas.html#reportar');
imageInput.addEventListener('change',()=>{
  const file=imageInput.files?.[0];
  if(!file){preview.style.display='none';preview.removeAttribute('src');return;}
  preview.src=URL.createObjectURL(file);preview.style.display='block';
});
form.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=document.querySelector('#publishButton');button.disabled=true;button.innerHTML='<i class="ti ti-loader-2"></i> Publicando…';
  try{
    if(selected==='producto'&&profile.tipo_perfil!=='negocio') throw new Error('Solo un negocio aprobado puede publicar productos.');
    if(selected==='trabajo'&&profile.tipo_perfil!=='profesional') throw new Error('Solo un profesional aprobado puede mostrar trabajos.');
    const result=await createPost({
      title:document.querySelector('#postTitle').value,
      content:document.querySelector('#postContent').value,
      category:selected,
      locationText:document.querySelector('#postLocation').value,
      eventDate:document.querySelector('#postEventDate').value?new Date(document.querySelector('#postEventDate').value).toISOString():null,
      visibility:document.querySelector('#postVisibility').value,
      allowComments:document.querySelector('#allowComments').checked,
      showAuthor:true,
      imageFile:imageInput.files?.[0]||null
    });
    show('✅ Publicación creada. Ya aparece en tu perfil y en el contenido permitido de MiZona.','success');
    setTimeout(()=>location.href=`usuario.html?u=${encodeURIComponent((await supabase.from('perfiles').select('username').eq('id',user.id).single()).data.username)}`,1000);
  }catch(error){show(error.message||'No se pudo publicar.','error');button.disabled=false;button.innerHTML='<i class="ti ti-send"></i> Publicar';}
});
init();
