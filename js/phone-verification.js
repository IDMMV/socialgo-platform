import { supabase, getCurrentUser } from './supabase.js';
import { refreshSessionSnapshot } from './session-state.js';

const status=document.querySelector('#phoneStatus');
const phoneForm=document.querySelector('#phoneForm');
const codeForm=document.querySelector('#codeForm');
const phone=document.querySelector('#phone');
const code=document.querySelector('#code');
const sendButton=document.querySelector('#sendCode');
const resendButton=document.querySelector('#resend');
let normalized='';

function show(text,type='info'){
  status.className=`mz-alert-box ${type==='info'?'':type}`;
  status.textContent=text;
}
function normalize(value){
  let s=String(value||'').replace(/[^\d+]/g,'');
  if(!s.startsWith('+')){
    s=s.replace(/^0+/,'');
    if(s.length===9)s='+51'+s;else s='+'+s;
  }
  return s;
}
function errorText(error){
  if(!error)return 'No se recibió una respuesta válida del servidor.';
  const raw=[error.message,error.error_description,error.msg,error.details,error.hint,error.code]
    .find(value=>typeof value==='string'&&value.trim());
  const text=String(raw||'Error desconocido').trim();
  if(/provider.*disabled|phone.*disabled|unsupported.*phone|sms.*not.*configured|sms provider/i.test(text)){
    return 'Supabase todavía no tiene activado el proveedor de teléfono/SMS. Activa Phone en Authentication → Providers y configura un proveedor SMS antes de volver a intentar.';
  }
  if(/rate.?limit|too many|60 seconds/i.test(text))return 'Se solicitaron demasiados códigos. Espera al menos 60 segundos y vuelve a intentar.';
  if(/already.*registered|phone.*exists|duplicate/i.test(text))return 'Este celular ya está asociado con otra cuenta de MiZona.';
  if(/invalid.*phone|phone.*invalid/i.test(text))return 'El número no es válido. En Perú usa el formato +51 seguido de 9 dígitos.';
  if(/captcha/i.test(text))return 'Supabase exige completar la verificación CAPTCHA antes de enviar el SMS.';
  return text==='{}'?'No se pudo enviar el SMS. Revisa que Phone y el proveedor SMS estén configurados en Supabase.':text;
}
function busy(button,on,label){
  if(!button)return;
  if(on){button.dataset.old=button.textContent;button.disabled=true;button.textContent=label;}
  else{button.disabled=false;button.textContent=button.dataset.old||button.textContent;}
}

async function init(){
  const user=await getCurrentUser();
  if(!user){location.href=`login.html?next=${encodeURIComponent('verificar-telefono.html')}`;return;}
  phone.value=user.user_metadata?.phone_pending||user.phone||'';
  const {data:p,error}=await supabase.from('perfiles').select('telefono_verificado,telefono_e164').eq('id',user.id).maybeSingle();
  if(error){show(errorText(error),'error');return;}
  if(p?.telefono_verificado){
    show('✅ Tu celular ya está verificado.','success');
    phoneForm.hidden=true;codeForm.hidden=true;
  }else{
    show('Tu número todavía no está verificado. Te enviaremos un código por SMS.');
  }
}
async function send(){
  normalized=normalize(phone.value);
  if(!/^\+[1-9]\d{8,14}$/.test(normalized))throw new Error('Escribe un número válido con código de país.');
  const {error}=await supabase.auth.updateUser({phone:normalized,data:{phone_pending:normalized}});
  if(error)throw error;
  codeForm.hidden=false;
  show(`Código enviado a ${normalized.replace(/.(?=.{4})/g,'•')}. Ingresa los 6 dígitos recibidos.`,'success');
  code.focus();
}

phoneForm.addEventListener('submit',async event=>{
  event.preventDefault();busy(sendButton,true,'Enviando…');
  try{await send();}catch(error){show(errorText(error),'error');}
  finally{busy(sendButton,false,'Enviar código');}
});
resendButton.addEventListener('click',async()=>{
  busy(resendButton,true,'Reenviando…');
  try{await send();}catch(error){show(errorText(error),'error');}
  finally{busy(resendButton,false,'Reenviar código');}
});
codeForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const verifyButton=codeForm.querySelector('button[type="submit"]');
  busy(verifyButton,true,'Verificando…');
  try{
    const token=code.value.trim();
    if(!/^\d{6,8}$/.test(token))throw new Error('Escribe el código numérico recibido por SMS.');
    const {error}=await supabase.auth.verifyOtp({phone:normalized||normalize(phone.value),token,type:'phone_change'});
    if(error)throw error;
    const {error:syncError}=await supabase.rpc('mizona_sync_phone_verification');
    if(syncError)throw syncError;
    await refreshSessionSnapshot();
    show('✅ Celular verificado. Ya puedes usar alertas, chat y solicitudes de proveedor.','success');
    codeForm.hidden=true;
    setTimeout(()=>location.href=new URLSearchParams(location.search).get('next')||'perfil.html',1100);
  }catch(error){show(errorText(error),'error');}
  finally{busy(verifyButton,false,'Verificar ahora');}
});

init();
