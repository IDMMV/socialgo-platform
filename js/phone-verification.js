import { supabase, getCurrentUser } from './supabase.js';
import { refreshSessionSnapshot } from './session-state.js';

const PERU_PREFIX = '+51';
const PENDING_KEY = 'mizona.pending.phone.pe';
const REQUEST_TIMEOUT_MS = 25000;

const status = document.querySelector('#phoneStatus');
const phoneForm = document.querySelector('#phoneForm');
const codeForm = document.querySelector('#codeForm');
const phone = document.querySelector('#phone');
const code = document.querySelector('#code');
const sendButton = document.querySelector('#sendCode');
const resendButton = document.querySelector('#resend');
const changePhoneButton = document.querySelector('#changePhone');
const progress = document.querySelector('#phoneProgress');
let normalized = '';

function keepPageVisible() {
  document.body.classList.remove('auth-pending');
  document.documentElement.dataset.authState ||= 'logged';
}

function show(text, type = 'info') {
  keepPageVisible();
  status.className = `mz-alert-box ${type === 'info' ? '' : type}`;
  status.textContent = String(text || '');
}

function showProgress(text = '') {
  if (progress) progress.textContent = text;
}

function peruDigits(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('51') && digits.length >= 11) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length === 10) digits = digits.slice(1);
  return digits.slice(0, 9);
}

function toE164(value) {
  const digits = peruDigits(value);
  if (!/^9\d{8}$/.test(digits)) {
    throw new Error('Ingresa un celular peruano válido de 9 dígitos que empiece con 9.');
  }
  return `${PERU_PREFIX}${digits}`;
}

function nationalFromE164(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.startsWith('51') && digits.length === 11 ? digits.slice(2) : peruDigits(digits);
}

function maskPhone(e164) {
  const digits = nationalFromE164(e164);
  return `${PERU_PREFIX} *** *** ${digits.slice(-3)}`;
}

function errorText(error) {
  if (!error) return 'No se recibió una respuesta válida del servidor.';
  const raw = [error.message, error.error_description, error.msg, error.details, error.hint, error.code]
    .find(value => typeof value === 'string' && value.trim());
  const text = String(raw || 'Error desconocido').trim();
  if (/provider.*disabled|phone.*disabled|unsupported.*phone|sms.*not.*configured|sms provider|phone provider/i.test(text)) {
    return 'El envío de SMS aún no está habilitado en Supabase. Activa Phone y configura un proveedor SMS en Authentication → Providers.';
  }
  if (/rate.?limit|too many|60 seconds|over_email_send_rate_limit/i.test(text)) return 'Espera al menos 60 segundos antes de solicitar otro código.';
  if (/already.*registered|phone.*exists|duplicate|user_already_exists/i.test(text)) return 'Este celular ya está asociado con otra cuenta de MiZona.';
  if (/invalid.*phone|phone.*invalid|validation_failed/i.test(text)) return 'El número no es válido. Ingresa solo 9 dígitos y verifica que empiece con 9.';
  if (/captcha/i.test(text)) return 'Supabase exige completar el CAPTCHA antes de enviar el SMS.';
  if (/timeout|tardó demasiado/i.test(text)) return 'La solicitud tardó demasiado. Revisa tu conexión e inténtalo nuevamente.';
  return text === '{}' ? 'No se pudo enviar el SMS. Revisa la configuración Phone/SMS de Supabase.' : text;
}

function busy(button, on, label) {
  if (!button) return;
  if (on) {
    button.dataset.old = button.textContent;
    button.disabled = true;
    button.textContent = label;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.old || button.textContent;
  }
}

function withTimeout(promise, message, ms = REQUEST_TIMEOUT_MS) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

function showCodeStep(e164) {
  normalized = e164;
  sessionStorage.setItem(PENDING_KEY, e164);
  phone.value = nationalFromE164(e164);
  phone.readOnly = true;
  sendButton.hidden = true;
  codeForm.hidden = false;
  show(`Código enviado a ${maskPhone(e164)}. Ingresa los 6 dígitos recibidos.`, 'success');
  showProgress('No cierres esta pantalla mientras esperas el SMS.');
  setTimeout(() => code.focus({ preventScroll: true }), 150);
}

async function init() {
  keepPageVisible();
  try {
    const user = await getCurrentUser();
    if (!user) {
      location.href = `login.html?next=${encodeURIComponent('verificar-telefono.html')}`;
      return;
    }
    const pending = sessionStorage.getItem(PENDING_KEY) || '';
    phone.value = nationalFromE164(pending || user.phone || '');
    const { data: profile, error } = await supabase
      .from('perfiles')
      .select('telefono_verificado,telefono_e164')
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw error;
    if (profile?.telefono_verificado) {
      show('✅ Tu celular ya está verificado.', 'success');
      phoneForm.hidden = true;
      codeForm.hidden = true;
      return;
    }
    if (pending) {
      showCodeStep(pending);
      show('Tienes una verificación pendiente. Ingresa el último código recibido o solicita uno nuevo.');
    } else {
      show('Tu número todavía no está verificado. Te enviaremos un código por SMS.');
    }
  } catch (error) {
    show(errorText(error), 'error');
  } finally {
    keepPageVisible();
  }
}

async function sendNewCode() {
  normalized = toE164(phone.value);
  showProgress('Solicitando código a Supabase…');
  const result = await withTimeout(
    supabase.auth.updateUser({ phone: normalized }),
    'Supabase tardó demasiado en responder al envío del SMS.'
  );
  if (result?.error) throw result.error;
  showCodeStep(normalized);
}

async function resendCode() {
  normalized = normalized || sessionStorage.getItem(PENDING_KEY) || toE164(phone.value);
  showProgress('Reenviando código…');
  const result = await withTimeout(
    supabase.auth.resend({ type: 'phone_change', phone: normalized }),
    'Supabase tardó demasiado en reenviar el SMS.'
  );
  if (result?.error) throw result.error;
  showCodeStep(normalized);
  show(`Nuevo código enviado a ${maskPhone(normalized)}.`, 'success');
}

phone.addEventListener('input', () => {
  const digits = peruDigits(phone.value);
  if (phone.value !== digits) phone.value = digits;
});

phone.addEventListener('keydown', event => {
  if (event.key === 'Enter' && phone.value.length !== 9) event.preventDefault();
});

phoneForm.addEventListener('submit', async event => {
  event.preventDefault();
  keepPageVisible();
  busy(sendButton, true, 'Enviando…');
  try {
    await sendNewCode();
  } catch (error) {
    show(errorText(error), 'error');
    showProgress('No se modificó tu sesión ni se borró el número ingresado.');
  } finally {
    busy(sendButton, false, 'Enviar código');
    keepPageVisible();
  }
});

resendButton.addEventListener('click', async () => {
  busy(resendButton, true, 'Reenviando…');
  try {
    await resendCode();
  } catch (error) {
    show(errorText(error), 'error');
  } finally {
    busy(resendButton, false, 'Reenviar código');
    keepPageVisible();
  }
});

changePhoneButton?.addEventListener('click', () => {
  sessionStorage.removeItem(PENDING_KEY);
  normalized = '';
  code.value = '';
  codeForm.hidden = true;
  phone.readOnly = false;
  sendButton.hidden = false;
  phone.focus();
  show('Escribe el nuevo número peruano de 9 dígitos.');
  showProgress('');
});

codeForm.addEventListener('submit', async event => {
  event.preventDefault();
  keepPageVisible();
  const verifyButton = codeForm.querySelector('button[type="submit"]');
  busy(verifyButton, true, 'Verificando…');
  try {
    const token = String(code.value || '').replace(/\D/g, '');
    if (!/^\d{6}$/.test(token)) throw new Error('Escribe el código de 6 dígitos recibido por SMS.');
    normalized = normalized || sessionStorage.getItem(PENDING_KEY) || toE164(phone.value);
    const result = await withTimeout(
      supabase.auth.verifyOtp({ phone: normalized, token, type: 'phone_change' }),
      'Supabase tardó demasiado en verificar el código.'
    );
    if (result?.error) throw result.error;

    const { error: syncError } = await supabase.rpc('mizona_sync_phone_verification');
    if (syncError) {
      const user = await getCurrentUser();
      const fallback = await supabase.from('perfiles').update({
        telefono_e164: normalized,
        telefono_verificado: true,
        telefono_verificado_en: new Date().toISOString()
      }).eq('id', user.id);
      if (fallback.error) throw syncError;
    }

    sessionStorage.removeItem(PENDING_KEY);
    await refreshSessionSnapshot().catch(() => null);
    show('✅ Celular verificado. Ya puedes usar alertas, chat y notificaciones.', 'success');
    showProgress('Verificación terminada correctamente.');
    phoneForm.hidden = true;
    codeForm.hidden = true;
    setTimeout(() => {
      location.href = new URLSearchParams(location.search).get('next') || 'notificaciones.html';
    }, 1000);
  } catch (error) {
    show(errorText(error), 'error');
  } finally {
    busy(verifyButton, false, 'Verificar ahora');
    keepPageVisible();
  }
});

window.addEventListener('unhandledrejection', event => {
  keepPageVisible();
  const message = errorText(event.reason);
  show(message, 'error');
  event.preventDefault();
});

init();
