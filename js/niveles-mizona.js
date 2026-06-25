// ============================================================
// MiZona.pe — Sistema de niveles
// ============================================================
export const NIVELES = [
  { nivel: 1, nombre: 'Vecino Nuevo',        icon: '🏠', min: 0,   color: '#94a3b8' },
  { nivel: 2, nombre: 'Vecino Participante', icon: '🤝', min: 20,  color: '#185FA5' },
  { nivel: 3, nombre: 'Vecino Activo',       icon: '⭐', min: 75,  color: '#d97706' },
  { nivel: 4, nombre: 'Vecino Confiable',    icon: '🛡️', min: 200, color: '#1D9E75' },
  { nivel: 5, nombre: 'Guardián del Barrio', icon: '👑', min: 500, color: '#E24B4A' },
];

export const PUNTOS = {
  publicar_alerta: 10,
  confirmar_alerta: 3,
  comentar: 2,
  alerta_verificada: 20,
  registrar_servicio: 15,
  solicitud_respondida: 5,
};

export function getNivelInfo(puntos = 0) {
  let info = NIVELES[0];
  for (const n of NIVELES) {
    if (puntos >= n.min) info = n;
  }
  const siguiente = NIVELES.find(n => n.min > puntos);
  const progreso = siguiente
    ? Math.round(((puntos - info.min) / (siguiente.min - info.min)) * 100)
    : 100;
  return { ...info, puntos, progreso, siguiente };
}

export function renderBadgeNivel(puntos = 0, solo_icon = false) {
  const n = getNivelInfo(puntos);
  if (solo_icon) return `<span title="${n.nombre} · ${puntos} pts">${n.icon}</span>`;
  return `
    <span class="mz-nivel-badge" style="color:${n.color};background:${n.color}18;border:1px solid ${n.color}40;border-radius:20px;padding:2px 8px;font-size:9px;font-weight:700;display:inline-flex;align-items:center;gap:4px">
      ${n.icon} ${n.nombre}
    </span>`;
}

export function renderBarraNivel(puntos = 0) {
  const n = getNivelInfo(puntos);
  const sig = n.siguiente;
  return `
    <div class="mz-nivel-barra" style="margin:6px 0">
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:9px;color:var(--txt3,#94a3b8);margin-bottom:4px">
        <span>${n.icon} ${n.nombre}</span>
        <span>${puntos} pts${sig ? ` · faltan ${sig.min - puntos} para ${sig.nombre}` : ' · Nivel máximo'}</span>
      </div>
      <div style="height:6px;background:var(--bd,#e2e8f0);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${n.progreso}%;background:${n.color};border-radius:3px;transition:width .6s ease"></div>
      </div>
    </div>`;
}
