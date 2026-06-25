import { applyBrand, loadBrand } from "./brand.js";
import { bootstrapPushNotifications } from "./push-notifications.js";

applyBrand();
loadBrand().catch(() => applyBrand());

const currentPage = (location.pathname.split("/").pop() || "index.html").toLowerCase();
document.documentElement.dataset.page = currentPage.replace(/\.html$/, "");

document.querySelectorAll('a[href]').forEach((link) => {
  const raw = link.getAttribute('href') || '';
  if (/^https?:\/\//i.test(raw)) {
    link.rel = `${link.rel || ''} noopener noreferrer`.trim();
  }

  const target = raw.split('#')[0].split('?')[0].split('/').pop()?.toLowerCase();
  if (!target || target !== currentPage) return;
  if (link.matches('.mz-nav-item,.mz-nav a,.side-nav a,.mz-mobile-bottom a,.mz-bn-item')) {
    link.classList.add('active');
  }
});

document.querySelectorAll('button:not([type])').forEach((button) => {
  if (!button.closest('form')) button.type = 'button';
});

window.mzToast = function mzToast(message, type = 'ok') {
  let toast = document.querySelector('#mz-global-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'mz-global-toast';
    toast.className = 'mz-global-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.dataset.type = type;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(window.__mzToastTimer);
  window.__mzToastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
};

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('./OneSignalSDKWorker.js', { updateViaCache: 'none' }).catch((error) => {
      console.info('MiZona: PWA no disponible.', error?.message || error);
    });
  });
}


bootstrapPushNotifications().catch((error) => {
  console.info("MiZona Push no se inició:", error?.message || error);
});
