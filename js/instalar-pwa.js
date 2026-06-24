// ============================================================
// MiZona.pe — Botón de instalación PWA
// Agregar este script al final del <body> en index.html
// ============================================================

(function() {
  let deferredPrompt = null;
  const DISMISS_KEY = 'mizona_pwa_banner_oculto';
  const esMovil = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const esIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Capturar el evento de instalación del navegador
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    mostrarBotonInstalar();
  });

  // Detectar si ya está instalada
  window.addEventListener('appinstalled', () => {
    ocultarBotonInstalar();
    mostrarToastInstalado();
    deferredPrompt = null;
  });

  // Si ya está en modo standalone (instalada), no mostrar
  if (window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true) {
    return;
  }

  function mostrarBotonInstalar() {
    if (sessionStorage.getItem(DISMISS_KEY) === '1') return;
    const btn = document.getElementById('btn-instalar-pwa');
    const banner = document.getElementById('banner-instalar-pwa');
    if (btn) btn.style.display = 'flex';
    if (banner) {
      banner.style.display = 'flex';
      // Animar entrada
      setTimeout(() => banner.style.transform = 'translateY(0)', 100);
    }
  }

  window.cerrarBannerInstalacion = function() {
    sessionStorage.setItem(DISMISS_KEY, '1');
    ocultarBotonInstalar();
  };

  function ocultarBotonInstalar() {
    const btn = document.getElementById('btn-instalar-pwa');
    const banner = document.getElementById('banner-instalar-pwa');
    if (btn) btn.style.display = 'none';
    if (banner) banner.style.display = 'none';
  }

  function mostrarToastInstalado() {
    const t = document.getElementById('mz-toast') ||
      Object.assign(document.createElement('div'), {id:'mz-toast',className:'mz-toast'});
    if (!document.getElementById('mz-toast')) document.body.appendChild(t);
    t.textContent = '✅ ¡MiZona instalada! Búscala en tu pantalla de inicio.';
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 4000);
  }

  // Función global para activar instalación
  window.instalarMiZona = async function() {
    if (!deferredPrompt) {
      // Fallback para navegadores que no soportan el prompt
      mostrarInstrucciones();
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      mostrarToastInstalado();
    }
    deferredPrompt = null;
    ocultarBotonInstalar();
  };

  // Instrucciones manuales si el navegador no soporta el prompt
  function mostrarInstrucciones() {
    const modal = document.getElementById('modal-instalar-manual');
    if (modal) {
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  }

  // Mostrar después de 3 segundos. En iPhone/iPad se usan instrucciones manuales.
  setTimeout(() => {
    if (deferredPrompt || (esMovil && esIOS)) mostrarBotonInstalar();
  }, 3000);

})();
