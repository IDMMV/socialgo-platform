// ============================================================
// MiZona.pe — Modo día/noche
// Mantiene el diseño actual como predeterminado (modo día).
// ============================================================
const CLAVE = 'mz-tema';
const TEMAS = new Set(['dia', 'noche']);

export function getTema() {
  const guardado = localStorage.getItem(CLAVE);
  return TEMAS.has(guardado) ? guardado : 'dia';
}

export function aplicarTema(tema = getTema()) {
  const seguro = TEMAS.has(tema) ? tema : 'dia';
  const raiz = document.documentElement;
  raiz.classList.toggle('tema-dia', seguro === 'dia');
  raiz.classList.toggle('tema-noche', seguro === 'noche');
  raiz.dataset.tema = seguro;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = seguro === 'noche' ? '#0f172a' : '#185FA5';
  document.dispatchEvent(new CustomEvent('mizona:tema', { detail: { tema: seguro } }));
  return seguro;
}

export function setTema(tema) {
  const seguro = TEMAS.has(tema) ? tema : 'dia';
  localStorage.setItem(CLAVE, seguro);
  aplicarTema(seguro);
  try { window._mzSyncTema?.(seguro); } catch (_) {}
  return seguro;
}

export function toggleTema() {
  return setTema(getTema() === 'noche' ? 'dia' : 'noche');
}

export function initTema() {
  return aplicarTema(getTema());
}

initTema();
