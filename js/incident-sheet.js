import { supabase, getCurrentUser } from './supabase.js';
import { getStoredNearbyLocation, formatDistance } from './nearby-location.js';

const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let sheet;
let backdrop;
let currentAlert;
let refreshCallback = null;

function stateLabel(value) {
  const labels = {
    reportada: 'Sin verificar',
    en_revision: 'En verificación',
    verificada: 'Verificada',
    resuelta: 'Finalizada',
    falsa: 'Descartada',
    ocultada: 'Retirada',
    vencida: 'Vencida'
  };
  return labels[value] || 'Reportada';
}

function iconFor(category) {
  return ({ robo:'ti-shield-exclamation', accidente:'ti-car-crash', agua:'ti-droplet', luz:'ti-bolt', mascota:'ti-paw', incendio:'ti-flame', persona:'ti-user-question', otro:'ti-alert-triangle' })[category] || 'ti-alert-triangle';
}

function ensureSheet() {
  if (sheet) return;
  backdrop = document.createElement('div');
  backdrop.className = 'mz-map-sheet-backdrop';
  sheet = document.createElement('section');
  sheet.className = 'mz-map-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  document.body.append(backdrop, sheet);
  backdrop.addEventListener('click', closeIncidentSheet);
}

function closeIncidentSheet() {
  backdrop?.classList.remove('open');
  sheet?.classList.remove('open');
  document.body.style.overflow = '';
}

async function compressImage(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Selecciona una fotografía válida.');
  if (file.size > 12 * 1024 * 1024) throw new Error('La fotografía no debe superar 12 MB.');
  const image = await createImageBitmap(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .82));
  image.close?.();
  if (!blob) throw new Error('No se pudo preparar la fotografía.');
  return blob;
}

async function loadEvidence(alertId) {
  const user = await getCurrentUser();
  let query = supabase.from('alerta_aportes').select('id,usuario_id,tipo,texto,archivo_url,estado,created_at').eq('alerta_id', alertId).order('created_at', { ascending: false }).limit(24);
  const { data, error } = await query;
  if (error) {
    const box = sheet.querySelector('[data-evidence-grid]');
    if (box) box.innerHTML = '<div style="grid-column:1/-1;color:#94a3b8;font-size:9px">Ejecuta el SQL de cercanía para habilitar evidencias.</div>';
    return;
  }
  const visible = (data || []).filter(row => row.estado === 'aprobado' || (user && row.usuario_id === user.id));
  const box = sheet.querySelector('[data-evidence-grid]');
  if (!box) return;
  const images = visible.filter(row => row.tipo === 'foto' && row.archivo_url);
  const rendered = await Promise.all(images.map(async row => {
    let url = row.archivo_url;
    if (!/^https?:\/\//i.test(url)) {
      const { data } = await supabase.storage.from('alertas-evidencias').createSignedUrl(url, 900);
      url = data?.signedUrl || '';
    }
    if (!url) return '';
    return `<a class="mz-evidence-item" href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="Evidencia aportada" loading="lazy">${row.estado !== 'aprobado' ? '<span class="mz-evidence-pending">En revisión</span>' : ''}</a>`;
  }));
  box.innerHTML = rendered.filter(Boolean).length ? rendered.filter(Boolean).join('') : '<div style="grid-column:1/-1;color:#94a3b8;font-size:9px;padding:6px 0">Todavía no hay fotografías aprobadas.</div>';
}

async function uploadEvidence(file, note, button) {
  const user = await getCurrentUser();
  if (!user) {
    location.href = `login.html?next=${encodeURIComponent(`mapa.html?alerta=${currentAlert.id}`)}`;
    return;
  }
  if (!(user.email_confirmed_at || user.confirmed_at)) { alert('Confirma tu correo antes de aportar evidencia.'); return; }
  button.disabled = true;
  button.textContent = 'Subiendo…';
  try {
    const blob = await compressImage(file);
    const path = `${user.id}/${currentAlert.id}/${Date.now()}-${crypto.randomUUID()}.jpg`;
    const { error: uploadError } = await supabase.storage.from('alertas-evidencias').upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '3600' });
    if (uploadError) throw uploadError;
    const point = getStoredNearbyLocation();
    const { error } = await supabase.from('alerta_aportes').insert({
      alerta_id: currentAlert.id,
      usuario_id: user.id,
      tipo: 'foto',
      texto: note || null,
      archivo_url: path,
      latitud: point ? Number(point.lat.toFixed(3)) : null,
      longitud: point ? Number(point.lng.toFixed(3)) : null,
      estado: 'pendiente'
    });
    if (error) throw error;
    window.mzToast?.('Foto enviada. Se mostrará públicamente después de la revisión.');
    sheet.querySelector('[data-evidence-file]').value = '';
    sheet.querySelector('[data-evidence-note]').value = '';
    await loadEvidence(currentAlert.id);
  } catch (error) {
    window.mzToast?.(error.message || 'No se pudo enviar la fotografía.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Enviar foto';
  }
}

async function confirmAlert(button) {
  const user = await getCurrentUser();
  if (!user) {
    location.href = `login.html?next=${encodeURIComponent(`mapa.html?alerta=${currentAlert.id}`)}`;
    return;
  }
  button.disabled = true;
  try {
    const point = getStoredNearbyLocation();
    const { data, error } = await supabase.rpc('confirmar_alerta', { p_alerta_id: currentAlert.id, p_latitud: point?.lat ?? null, p_longitud: point?.lng ?? null });
    if (error) throw error;
    window.mzToast?.(data?.mensaje || 'Confirmación registrada.');
    currentAlert.conf = Number(currentAlert.conf || 0) + 1;
    await renderSheet();
    refreshCallback?.();
  } catch (error) {
    window.mzToast?.(error.message || 'No se pudo confirmar.', 'error');
    button.disabled = false;
  }
}

async function shareAlert() {
  const url = `${location.origin}/alerta.html?id=${encodeURIComponent(currentAlert.id)}`;
  try {
    if (navigator.share) await navigator.share({ title: currentAlert.titulo, text: 'Alerta de MiZona', url });
    else { await navigator.clipboard.writeText(url); window.mzToast?.('Enlace copiado.'); }
  } catch {}
}

async function renderSheet() {
  ensureSheet();
  const distance = Number(currentAlert._dist);
  sheet.innerHTML = `
    <div class="mz-map-sheet-handle"></div>
    <header class="mz-map-sheet-head">
      <div class="mz-map-sheet-icon"><i class="ti ${iconFor(currentAlert.tipo)}"></i></div>
      <div class="mz-map-sheet-title"><span class="mz-map-sheet-state">${esc(stateLabel(currentAlert.estado))}</span><h2>${esc(currentAlert.titulo)}</h2><p>${esc(currentAlert.meta || currentAlert.zona_referencia || currentAlert.distrito || 'Ubicación aproximada')}</p></div>
      <button class="mz-map-sheet-close" type="button" aria-label="Cerrar">×</button>
    </header>
    <div class="mz-map-sheet-body">
      <div class="mz-map-sheet-meta">
        ${Number.isFinite(distance) ? `<span><i class="ti ti-current-location"></i> A ${formatDistance(distance)}</span>` : ''}
        <span><i class="ti ti-users"></i> ${Number(currentAlert.conf || 0)} confirmaciones</span>
        <span><i class="ti ti-shield-lock"></i> ${esc(currentAlert.privacidadTexto || 'Ubicación aproximada')}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;color:#64748b;font-size:10px;margin:4px 0 10px"><i class="ti ${currentAlert.tipo_fuente === 'oficial' ? 'ti-shield-check' : 'ti-shield-lock'}"></i>${currentAlert.tipo_fuente === 'oficial' ? 'Fuente oficial verificada' : 'Reportado por un vecino verificado · identidad protegida'}</div>
      ${currentAlert.descripcion ? `<div class="mz-map-sheet-description">${esc(currentAlert.descripcion)}</div>` : ''}
      <div class="mz-map-sheet-actions">
        <button type="button" class="primary" data-sheet-confirm><i class="ti ti-eye-check"></i> También lo vi</button>
        <a href="alerta.html?id=${encodeURIComponent(currentAlert.id)}"><i class="ti ti-file-description"></i> Ver seguimiento</a>
        <button type="button" data-sheet-share><i class="ti ti-share"></i> Compartir</button>
        <button type="button" data-sheet-photo><i class="ti ti-camera-plus"></i> Aportar foto</button>
      </div>
      <section class="mz-evidence-section">
        <h3>Fotografías y aportes de vecinos</h3>
        <div class="mz-evidence-grid" data-evidence-grid><div style="grid-column:1/-1;color:#94a3b8;font-size:9px">Cargando…</div></div>
        <div class="mz-evidence-upload" data-evidence-upload hidden>
          <input type="file" accept="image/*" capture="environment" data-evidence-file id="mzEvidenceFile">
          <label for="mzEvidenceFile"><strong>Tomar o elegir fotografía</strong><br>Evita mostrar rostros, menores, placas completas o el interior de viviendas.</label>
          <button type="button" data-evidence-send>Enviar foto</button>
        </div>
        <textarea data-evidence-note hidden maxlength="300" placeholder="Describe qué muestra la foto (opcional)" style="width:100%;margin-top:7px;border:1px solid #dbe4ee;border-radius:9px;padding:8px;font-size:10px;resize:vertical"></textarea>
        <div class="mz-evidence-note">Las fotografías se publican inicialmente como pendientes y el administrador puede aprobarlas, rechazarlas o retirarlas.</div>
      </section>
    </div>`;
  sheet.querySelector('.mz-map-sheet-close').addEventListener('click', closeIncidentSheet);
  sheet.querySelector('[data-sheet-share]').addEventListener('click', shareAlert);
  sheet.querySelector('[data-sheet-confirm]').addEventListener('click', event => confirmAlert(event.currentTarget));
  sheet.querySelector('[data-sheet-photo]').addEventListener('click', () => {
    const upload = sheet.querySelector('[data-evidence-upload]');
    const note = sheet.querySelector('[data-evidence-note]');
    upload.hidden = !upload.hidden;
    note.hidden = upload.hidden;
    if (!upload.hidden) sheet.querySelector('[data-evidence-file]').click();
  });
  sheet.querySelector('[data-evidence-send]').addEventListener('click', event => {
    const file = sheet.querySelector('[data-evidence-file]').files?.[0];
    if (!file) { window.mzToast?.('Selecciona o toma una fotografía.', 'error'); return; }
    uploadEvidence(file, sheet.querySelector('[data-evidence-note]').value.trim(), event.currentTarget);
  });
  await loadEvidence(currentAlert.id);
}

export async function openIncidentSheet(alert, options = {}) {
  currentAlert = { ...alert };
  refreshCallback = options.onRefresh || refreshCallback;
  await renderSheet();
  backdrop.classList.add('open');
  sheet.classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function initIncidentSheet(options = {}) {
  refreshCallback = options.onRefresh || null;
  ensureSheet();
  return { open: openIncidentSheet, close: closeIncidentSheet };
}

window.MiZonaIncidentSheet = { open: openIncidentSheet, close: closeIncidentSheet };
