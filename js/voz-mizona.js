// ============================================================
// MiZona.pe — Reconocimiento de voz para formularios
// Usa Web Speech API nativa, sin API externa.
// ============================================================

const VOZ_IDIOMA = 'es-PE';
const reconocimientosActivos = new WeakMap();

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function mostrarErrorVoz(mensaje) {
  if (typeof window.mzToast === 'function') {
    window.mzToast(mensaje, 'error');
    return;
  }
  const anterior = document.getElementById('mz-voz-toast');
  anterior?.remove();
  const div = document.createElement('div');
  div.id = 'mz-voz-toast';
  div.setAttribute('role', 'status');
  div.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);max-width:min(92vw,520px);background:#1e293b;color:#fff;border-radius:20px;padding:10px 18px;font-size:12px;font-weight:600;z-index:9999;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.25)';
  div.textContent = `🎙️ ${mensaje}`;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 4200);
}

function resetearInterfaz(campo, boton, htmlOriginal) {
  boton.innerHTML = htmlOriginal;
  boton.disabled = false;
  boton.classList.remove('escuchando');
  boton.style.background = '';
  boton.style.borderColor = '';
  boton.setAttribute('aria-pressed', 'false');
  campo.style.borderColor = '';
  campo.style.boxShadow = '';
  reconocimientosActivos.delete(boton);
}

/**
 * Activa o detiene el micrófono para un campo.
 * @param {HTMLInputElement|HTMLTextAreaElement} campo
 * @param {HTMLButtonElement} boton
 */
export function activarVoz(campo, boton) {
  const activo = reconocimientosActivos.get(boton);
  if (activo) {
    activo.stop();
    return;
  }

  const SpeechRecognition = getSpeechRecognition();
  if (!SpeechRecognition) {
    mostrarErrorVoz('Tu navegador no admite dictado por voz. Puedes usar el micrófono del teclado del celular.');
    return;
  }

  const reconocimiento = new SpeechRecognition();
  reconocimiento.lang = VOZ_IDIOMA;
  reconocimiento.interimResults = true;
  reconocimiento.maxAlternatives = 1;
  reconocimiento.continuous = false;

  const htmlOriginal = boton.innerHTML;
  const textoBase = String(campo.value || '').trimEnd();
  let textoReconocido = '';
  let finalizado = false;

  reconocimientosActivos.set(boton, reconocimiento);
  boton.innerHTML = '<i class="ti ti-microphone" aria-hidden="true"></i> Detener';
  boton.classList.add('escuchando');
  boton.style.background = '#FEF2F2';
  boton.style.borderColor = '#E24B4A';
  boton.setAttribute('aria-pressed', 'true');
  campo.style.borderColor = '#E24B4A';
  campo.style.boxShadow = '0 0 0 3px rgba(226,75,74,.15)';

  reconocimiento.onresult = event => {
    textoReconocido = '';
    for (let i = 0; i < event.results.length; i += 1) {
      textoReconocido += event.results[i][0]?.transcript || '';
    }
    campo.value = `${textoBase}${textoBase && textoReconocido ? ' ' : ''}${textoReconocido}`.trimStart();
    if (campo.tagName === 'TEXTAREA') {
      campo.style.height = 'auto';
      campo.style.height = `${campo.scrollHeight}px`;
    }
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  };

  reconocimiento.onerror = event => {
    if (event.error === 'aborted') return;
    const mensajes = {
      'not-allowed': 'Permiso de micrófono denegado. Habilítalo en la configuración del navegador.',
      'service-not-allowed': 'El servicio de voz está bloqueado en este navegador.',
      'no-speech': 'No se detectó voz. Intenta nuevamente y habla cerca del micrófono.',
      'network': 'No se pudo usar el dictado. Comprueba tu conexión a internet.',
      'audio-capture': 'No se encontró un micrófono disponible.'
    };
    mostrarErrorVoz(mensajes[event.error] || 'No se pudo reconocer la voz. Intenta nuevamente.');
  };

  reconocimiento.onend = () => {
    if (finalizado) return;
    finalizado = true;
    resetearInterfaz(campo, boton, htmlOriginal);
    campo.dispatchEvent(new Event('change', { bubbles: true }));
  };

  try {
    reconocimiento.start();
  } catch (error) {
    resetearInterfaz(campo, boton, htmlOriginal);
    mostrarErrorVoz(error?.message || 'No se pudo iniciar el micrófono.');
  }
}

/**
 * Inicializa todos los botones con data-voz-para.
 */
export function initVozFormulario(contenedor = document) {
  const compatible = Boolean(getSpeechRecognition());
  contenedor.querySelectorAll('[data-voz-para]').forEach(boton => {
    if (boton.dataset.vozInicializada === '1') return;
    boton.dataset.vozInicializada = '1';
    boton.type = 'button';
    boton.setAttribute('aria-pressed', 'false');

    const nombreCampo = boton.dataset.vozPara;
    const selectorSeguro = window.CSS?.escape ? CSS.escape(nombreCampo) : nombreCampo;
    const campo = contenedor.querySelector(`[name="${selectorSeguro}"], #${selectorSeguro}`);
    if (!campo) {
      boton.hidden = true;
      return;
    }

    if (!compatible) {
      boton.title = 'Tu navegador no admite dictado. Usa el micrófono del teclado.';
    }

    boton.addEventListener('click', event => {
      event.preventDefault();
      activarVoz(campo, boton);
    });
  });
}
