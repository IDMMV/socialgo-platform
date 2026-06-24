// ============================================================
// MiZona.pe — Reconocimiento de voz para formularios
// Usa Web Speech API nativa — sin costo, sin API externa
// Compatible con Chrome en Android (Redmi, Samsung, etc.)
// ============================================================

const VOZ_IDIOMA = 'es-PE'; // Español peruano

/**
 * Activa el micrófono en un campo de texto
 * @param {HTMLInputElement|HTMLTextAreaElement} campo - El input o textarea objetivo
 * @param {HTMLButtonElement} boton - El botón que activó la escucha
 */
export function activarVoz(campo, boton) {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    mostrarErrorVoz('Tu navegador no soporta dictado por voz. Usa Google Chrome.');
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SpeechRecognition();
  rec.lang = VOZ_IDIOMA;
  rec.interimResults = true;   // Mostrar texto mientras habla
  rec.maxAlternatives = 1;
  rec.continuous = false;

  // Estado visual del botón
  const textoOriginal = boton.innerHTML;
  boton.innerHTML = '<i class="ti ti-microphone" style="color:#E24B4A;animation:blink-mic .8s ease-in-out infinite"></i> Escuchando...';
  boton.disabled = false;
  boton.style.background = '#FEF2F2';
  boton.style.borderColor = '#E24B4A';
  campo.style.borderColor = '#E24B4A';
  campo.style.boxShadow = '0 0 0 3px rgba(220,38,38,.15)';

  const textoBase = campo.value;

  rec.onresult = (event) => {
    let transcripcion = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcripcion += event.results[i][0].transcript;
    }
    // Mostrar en tiempo real mientras habla
    campo.value = textoBase + (textoBase ? ' ' : '') + transcripcion;
    // Auto-resize para textareas
    if (campo.tagName === 'TEXTAREA') {
      campo.style.height = 'auto';
      campo.style.height = campo.scrollHeight + 'px';
    }
  };

  rec.onend = () => {
    resetearBoton(boton, textoOriginal);
    resetearCampo(campo);
    // Disparar evento input para que el formulario detecte el cambio
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  };

  rec.onerror = (event) => {
    resetearBoton(boton, textoOriginal);
    resetearCampo(campo);
    const mensajes = {
      'not-allowed': 'Permiso de micrófono denegado. Ve a Configuración → Chrome → Micrófono.',
      'no-speech': 'No se detectó voz. Intenta de nuevo.',
      'network': 'Sin conexión. El dictado requiere internet.',
      'audio-capture': 'No se encontró micrófono en tu dispositivo.',
    };
    mostrarErrorVoz(mensajes[event.error] || 'Error al reconocer la voz. Intenta de nuevo.');
  };

  // Permitir cancelar tocando el botón de nuevo
  boton.onclick = () => {
    rec.stop();
    resetearBoton(boton, textoOriginal);
    resetearCampo(campo);
    boton.onclick = null; // Restaurar el onclick original en el siguiente tick
  };

  rec.start();
}

function resetearBoton(boton, textoOriginal) {
  boton.innerHTML = textoOriginal;
  boton.style.background = '';
  boton.style.borderColor = '';
}

function resetearCampo(campo) {
  campo.style.borderColor = '';
  campo.style.boxShadow = '';
}

function mostrarErrorVoz(mensaje) {
  // Usar el sistema de toast de MiZona si existe
  if (typeof toast === 'function') {
    toast(mensaje, 'error');
    return;
  }
  // Fallback simple
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;border-radius:20px;padding:10px 20px;font-size:12px;font-weight:600;z-index:9999;white-space:nowrap';
  div.textContent = '🎙️ ' + mensaje;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 4000);
}

/**
 * Inicializa botones de voz en todos los campos con data-voz
 * Uso en HTML: <button type="button" data-voz-para="nombreDelCampo">🎙️</button>
 *              <input name="nombreDelCampo" ...>
 */
export function initVozFormulario(contenedor = document) {
  contenedor.querySelectorAll('[data-voz-para]').forEach(boton => {
    const nombreCampo = boton.dataset.vozPara;
    const campo = contenedor.querySelector(`[name="${nombreCampo}"], #${nombreCampo}`);
    if (!campo) return;

    boton.addEventListener('click', (e) => {
      e.preventDefault();
      activarVoz(campo, boton);
    });
  });
}
