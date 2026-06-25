import { supabase, getCurrentUser } from './supabase.js';
import { initMiZonaUI, toast, escapeHtml, timeAgo } from './mizona-ui-v2.js';
import { createAlertLocationPicker } from './alert-location-picker.js';
import { initNearbyExperience, getStoredNearbyLocation, getNearbyRadius, distanceMeters, formatDistance } from './nearby-location.js';

initMiZonaUI();

const list = document.querySelector('#alertasLista');
const form = document.querySelector('#alertaForm');
const statusBox = document.querySelector('#alertaStatus');
const categoryInput = document.querySelector('#alertCategory');
const privacyInput = document.querySelector('#alertPrivacy');
const privacyHelp = document.querySelector('#privacyHelp');
const duplicatesModal = document.querySelector('#modal-duplicates');
const duplicateList = document.querySelector('#duplicateList');
const publishModal = document.querySelector('#modal-publish-confirm');
const publishSummary = document.querySelector('#publishSummary');
const finalPublishButton = document.querySelector('#finalPublishButton');

let currentUser = null;
let confirmations = new Set();
let follows = new Set();
let utilityVotes = new Map();
let pendingPayload = null;
let duplicateCheckPassed = false;

const locationPicker = createAlertLocationPicker({
  modalId: 'modal-location-picker',
  mapId: 'mzLocationMap',
  summaryId: 'locationSummary',
  selectedTextId: 'locationSelectedText',
  confirmButtonId: 'confirmLocationButton',
  referenceInput: form?.elements?.zona_referencia,
  districtInput: form?.elements?.distrito,
  latInput: form?.elements?.latitud,
  lngInput: form?.elements?.longitud,
  onConfirm: () => showStatus('Ubicación seleccionada. Ya puedes revisar la alerta.')
});

document.querySelector('[data-pick-location]')?.addEventListener('click', () => locationPicker.open());
document.querySelector('[data-use-location]')?.addEventListener('click', () => locationPicker.useCurrentLocation({ closeAfter: false }));
document.querySelector('#locationGpsButton')?.addEventListener('click', () => locationPicker.useCurrentLocation());

function showStatus(message, error = false) {
  if (!statusBox) return;
  statusBox.hidden = false;
  statusBox.className = `mz-status ${error ? 'error' : 'ok'}`;
  statusBox.textContent = message;
}

function openModal(modal) {
  modal?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
  modal?.classList.remove('open');
  if (!document.querySelector('.mz-smart-modal.open')) document.body.style.overflow = '';
}

document.querySelectorAll('[data-close-duplicates]').forEach(button => button.addEventListener('click', () => closeModal(duplicatesModal)));
document.querySelectorAll('[data-close-publish]').forEach(button => button.addEventListener('click', () => closeModal(publishModal)));
duplicatesModal?.addEventListener('click', event => { if (event.target === duplicatesModal) closeModal(duplicatesModal); });
publishModal?.addEventListener('click', event => { if (event.target === publishModal) closeModal(publishModal); });

document.querySelector('#continueDuplicateButton')?.addEventListener('click', () => {
  duplicateCheckPassed = true;
  closeModal(duplicatesModal);
  openPublishConfirmation();
});

const privacyDefaults = {
  robo: ['aprox_50m', 'El marcador público se desplazará aproximadamente 50 m para proteger domicilios.'],
  accidente: ['exacta', 'Los accidentes se muestran con punto preciso para facilitar la ubicación.'],
  agua: ['exacta', 'Los cortes y fugas pueden mostrarse con punto preciso.'],
  luz: ['exacta', 'Los cortes de luz pueden mostrarse con punto preciso.'],
  persona: ['aprox_150m', 'En personas desaparecidas se protege la ubicación con un radio aproximado.'],
  mascota: ['aprox_50m', 'La ubicación se muestra aproximada para proteger viviendas.'],
  incendio: ['exacta', 'Los incendios se muestran con punto preciso por seguridad.'],
  otro: ['aprox_50m', 'MiZona mostrará una ubicación aproximada.']
};

function applyPrivacyDefault() {
  const [value, help] = privacyDefaults[categoryInput?.value] || privacyDefaults.otro;
  if (privacyInput) privacyInput.value = value;
  if (privacyHelp) privacyHelp.textContent = help;
}
categoryInput?.addEventListener('change', applyPrivacyDefault);
applyPrivacyDefault();

function statusLabel(alert) {
  if (alert.tipo_fuente === 'oficial') return { cls: 'oficial', text: 'Fuente oficial' };
  const labels = {
    reportada: ['reportada', 'Sin verificar'],
    en_revision: ['en_revision', 'En revisión'],
    verificada: ['verificada', 'Verificada'],
    resuelta: ['resuelta', 'Resuelta'],
    falsa: ['falsa', 'Descartada'],
    ocultada: ['ocultada', 'Retirada'],
    en_disputa: ['en_revision', 'En disputa'],
    vencida: ['resuelta', 'Vencida']
  };
  const [cls, text] = labels[alert.estado] || labels.reportada;
  return { cls, text };
}

function countText(number, singular, plural) {
  const total = Number(number || 0);
  return `${total} ${total === 1 ? singular : plural}`;
}

async function loadUserState() {
  currentUser = await getCurrentUser();
  confirmations = new Set();
  follows = new Set();
  utilityVotes = new Map();
  if (!currentUser) return;
  const [confirmResult, followResult, utilityResult] = await Promise.all([
    supabase.from('alerta_confirmaciones').select('alerta_id').eq('usuario_id', currentUser.id),
    supabase.from('alerta_seguimientos').select('alerta_id').eq('usuario_id', currentUser.id),
    supabase.from('alerta_utilidad').select('alerta_id,util').eq('usuario_id', currentUser.id)
  ]);
  confirmations = new Set((confirmResult.data || []).map(row => String(row.alerta_id)));
  follows = new Set((followResult.data || []).map(row => String(row.alerta_id)));
  utilityVotes = new Map((utilityResult.data || []).map(row => [String(row.alerta_id), Boolean(row.util)]));
}

async function loadAlerts() {
  if (!list) return;
  list.innerHTML = '<div class="mz-loader">Cargando alertas...</div>';
  await loadUserState();

  const { data, error } = await supabase
    .from('alertas')
    .select('id,categoria,titulo,descripcion,distrito,zona_referencia,estado,tipo_fuente,latitud,longitud,precision_ubicacion,created_at,updated_at,autor_id,total_confirmaciones,total_seguidores,total_util_si,total_util_no,motivo_moderacion,resolucion_estado')
    .order('created_at', { ascending: false })
    .limit(60);

  if (error) {
    list.innerHTML = `<div class="mz-empty">No se pudieron cargar las alertas: ${escapeHtml(error.message)}</div>`;
    return;
  }
  if (!data?.length) {
    list.innerHTML = '<div class="mz-empty">Todavía no hay alertas en esta zona.</div>';
    return;
  }

  const point = getStoredNearbyLocation();
  const radius = getNearbyRadius();
  let visibleAlerts = data.map(alert => ({
    ...alert,
    _distanceMeters: point ? distanceMeters(point, { lat: Number(alert.latitud), lng: Number(alert.longitud) }) : NaN
  }));
  if (point && radius) {
    visibleAlerts = visibleAlerts
      .filter(alert => Number.isFinite(alert._distanceMeters) && alert._distanceMeters <= radius)
      .sort((a,b) => a._distanceMeters - b._distanceMeters);
  }
  if (!visibleAlerts.length) {
    list.innerHTML = `<div class="mz-empty"><strong>No hay alertas dentro de ${radius >= 1000 ? `${radius/1000} km` : `${radius} m`}.</strong><br><button class="mz-btn ghost" data-expand-alert-radius style="margin-top:9px">Ampliar a 1 km</button></div>`;
    list.querySelector('[data-expand-alert-radius]')?.addEventListener('click', () => window.MiZonaNearby?.setRadius(1000));
    return;
  }

  list.innerHTML = visibleAlerts.map(alert => {
    const status = statusLabel(alert);
    const id = String(alert.id);
    const isAuthor = currentUser && String(alert.autor_id) === String(currentUser.id);
    const confirmed = confirmations.has(id);
    const following = follows.has(id);
    const utility = utilityVotes.get(id);
    const canConfirm = !isAuthor && !confirmed && !['resuelta', 'falsa', 'ocultada', 'vencida'].includes(alert.estado);
    const locationPrivacy = {
      exacta: 'Punto preciso', aprox_50m: 'Ubicación aprox. 50 m', aprox_150m: 'Ubicación aprox. 150 m', solo_zona: 'Solo zona aproximada'
    }[alert.precision_ubicacion] || 'Ubicación aproximada';

    return `<article class="mz-feed-card" data-alert-id="${id}">
      <div class="mz-feed-head">
        <span class="mz-status-chip ${status.cls}">${status.text}</span>
        <small>${timeAgo(alert.created_at)}</small>
      </div>
      <div style="display:flex;align-items:center;gap:6px;color:var(--txt3);font-size:9px;margin:5px 0 2px"><i class="ti ${alert.tipo_fuente === 'oficial' ? 'ti-shield-check' : 'ti-shield-lock'}"></i>${alert.tipo_fuente === 'oficial' ? 'Fuente oficial verificada' : 'Reportado por un vecino verificado · identidad protegida'}</div>
      <h3>${escapeHtml(alert.titulo)}</h3>
      <p>${escapeHtml(alert.descripcion || '')}</p>
      ${isAuthor && alert.motivo_moderacion ? `<div class="mz-rejection-box"><strong>Motivo de moderación</strong>${escapeHtml(alert.motivo_moderacion)}</div>` : ''}
      <div class="mz-feed-meta">
        <span>📍 ${escapeHtml(alert.zona_referencia || alert.distrito)}</span>
        ${Number.isFinite(alert._distanceMeters) ? `<span class="mz-distance-chip"><i class="ti ti-current-location"></i> A ${formatDistance(alert._distanceMeters)}</span>` : ''}
        <span>🛡 ${escapeHtml(locationPrivacy)}</span>
        <span>👥 ${countText(alert.total_confirmaciones, 'confirmación', 'confirmaciones')}</span>
        <span>🔔 ${countText(alert.total_seguidores, 'seguidor', 'seguidores')}</span>
      </div>
      <div class="mz-feed-actions">
        ${isAuthor
          ? '<span class="mz-btn ghost sm"><i class="ti ti-pencil"></i> Tú la reportaste</span>'
          : `<button class="mz-btn success sm" data-confirm="${id}" ${canConfirm ? '' : 'disabled'}>${confirmed ? '✓ Ya confirmado' : '✓ Yo también lo vi'}</button>`}
        <button class="mz-btn ghost sm mz-follow-btn ${following ? 'active' : ''}" data-follow="${id}"><i class="ti ${following ? 'ti-bell-check' : 'ti-bell-plus'}"></i>${following ? ' Siguiendo' : ' Seguir'}</button>
        <button class="mz-btn ghost sm" data-share="${id}" data-title="${escapeHtml(alert.titulo)}"><i class="ti ti-share"></i> Compartir</button>
        <a class="mz-btn ghost sm" href="alerta.html?id=${encodeURIComponent(id)}"><i class="ti ti-eye"></i> Ver detalles</a>
      </div>
      <div class="mz-helpful">
        <span class="mz-helpful-label">¿Esta información te ayudó?</span>
        <button class="mz-btn sm ${utility === true ? 'success' : 'ghost'}" data-utility="yes" data-id="${id}">Sí · ${Number(alert.total_util_si || 0)}</button>
        <button class="mz-btn sm ${utility === false ? 'danger' : 'ghost'}" data-utility="no" data-id="${id}">No · ${Number(alert.total_util_no || 0)}</button>
      </div>
    </article>`;
  }).join('');

  bindListActions();
}

function requireLogin() {
  if (currentUser) return true;
  location.href = `login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
  return false;
}

function bindListActions() {
  list.querySelectorAll('[data-confirm]').forEach(button => button.addEventListener('click', () => confirmAlert(button.dataset.confirm, button)));
  list.querySelectorAll('[data-follow]').forEach(button => button.addEventListener('click', () => toggleFollow(button.dataset.follow, button)));
  list.querySelectorAll('[data-utility]').forEach(button => button.addEventListener('click', () => voteUtility(button.dataset.id, button.dataset.utility === 'yes')));
  list.querySelectorAll('[data-share]').forEach(button => button.addEventListener('click', async () => {
    const url = `${location.origin}/alerta.html?id=${encodeURIComponent(button.dataset.share)}`;
    try {
      if (navigator.share) await navigator.share({ title: 'MiZona.pe', text: button.dataset.title, url });
      else { await navigator.clipboard.writeText(url); toast('Enlace copiado.'); }
    } catch (_) {}
  }));
}

async function confirmAlert(alertId, button) {
  if (!requireLogin()) return;
  button.disabled = true;
  button.textContent = 'Guardando...';
  try {
    const point = getStoredNearbyLocation();
    const { data, error } = await supabase.rpc('confirmar_alerta', {
      p_alerta_id: alertId,
      p_latitud: point?.lat ?? null,
      p_longitud: point?.lng ?? null
    });
    if (error) throw error;
    toast(data?.mensaje || 'Confirmación registrada.');
    await loadAlerts();
  } catch (error) {
    toast(error.message || 'No se pudo confirmar.', 'error');
    button.disabled = false;
    button.textContent = '✓ Yo también lo vi';
  }
}

async function toggleFollow(alertId, button) {
  if (!requireLogin()) return;
  const shouldFollow = !follows.has(String(alertId));
  button.disabled = true;
  try {
    const { data, error } = await supabase.rpc('seguir_alerta', { p_alerta_id: alertId, p_seguir: shouldFollow });
    if (error) throw error;
    if (shouldFollow) follows.add(String(alertId)); else follows.delete(String(alertId));
    button.classList.toggle('active', shouldFollow);
    button.innerHTML = `<i class="ti ${shouldFollow ? 'ti-bell-check' : 'ti-bell-plus'}"></i>${shouldFollow ? ' Siguiendo' : ' Seguir'}`;
    toast(shouldFollow ? 'Recibirás las actualizaciones de esta alerta.' : 'Dejaste de seguir la alerta.');
  } catch (error) {
    toast(error.message || 'No se pudo actualizar el seguimiento.', 'error');
  } finally { button.disabled = false; }
}

async function voteUtility(alertId, useful) {
  if (!requireLogin()) return;
  try {
    const { error } = await supabase.rpc('valorar_utilidad_alerta', { p_alerta_id: alertId, p_util: useful });
    if (error) throw error;
    toast('Gracias por valorar la información.');
    await loadAlerts();
  } catch (error) { toast(error.message || 'No se pudo guardar tu valoración.', 'error'); }
}

function getFormPayload() {
  const data = new FormData(form);
  return {
    categoria: String(data.get('categoria') || ''),
    titulo: String(data.get('titulo') || '').trim(),
    descripcion: String(data.get('descripcion') || '').trim(),
    distrito: String(data.get('distrito') || '').trim(),
    zona_referencia: String(data.get('zona_referencia') || '').trim(),
    latitud: data.get('latitud') ? Number(data.get('latitud')) : null,
    longitud: data.get('longitud') ? Number(data.get('longitud')) : null,
    precision_ubicacion: String(data.get('precision_ubicacion') || 'aprox_50m')
  };
}

function validatePayload(payload) {
  if (payload.titulo.length < 5) throw new Error('Escribe un título más claro.');
  if (payload.descripcion.length < 10) throw new Error('Describe mejor lo ocurrido.');
  if (!payload.distrito) throw new Error('Indica el distrito.');
  if (!Number.isFinite(payload.latitud) || !Number.isFinite(payload.longitud)) throw new Error('Selecciona el punto donde ocurrió el evento.');
}

async function detectDuplicates(payload) {
  const { data, error } = await supabase.rpc('detectar_alertas_similares', {
    p_categoria: payload.categoria,
    p_latitud: payload.latitud,
    p_longitud: payload.longitud,
    p_radio_metros: 400,
    p_horas: 36
  });
  if (error) {
    if (/function .*detectar_alertas_similares/i.test(error.message || '')) throw new Error('Ejecuta el SQL de la Fase 5 en Supabase antes de publicar.');
    throw error;
  }
  return data || [];
}

function renderDuplicates(rows) {
  duplicateList.innerHTML = rows.map(row => `<article class="mz-duplicate-card">
    <div><h3>${escapeHtml(row.titulo)}</h3><p>${escapeHtml(row.zona_referencia || 'Zona aproximada')} · ${timeAgo(row.created_at)} · ${Number(row.total_confirmaciones || 0)} confirmaciones</p></div>
    <div style="text-align:right"><div class="mz-duplicate-distance">A ${Math.round(Number(row.distancia_metros || 0))} m</div><button class="mz-btn success sm" type="button" data-confirm-existing="${row.id}" style="margin-top:6px">Es el mismo</button><a class="mz-btn ghost sm" href="alerta.html?id=${encodeURIComponent(row.id)}" style="margin-top:5px">Ver</a></div>
  </article>`).join('');
  duplicateList.querySelectorAll('[data-confirm-existing]').forEach(button => button.addEventListener('click', async () => {
    await confirmAlert(button.dataset.confirmExisting, button);
    closeModal(duplicatesModal);
    location.href = `alerta.html?id=${encodeURIComponent(button.dataset.confirmExisting)}`;
  }));
}

function privacyText(value) {
  return { exacta: 'Punto preciso', aprox_50m: 'Aproximada a 50 m', aprox_150m: 'Aproximada a 150 m', solo_zona: 'Solo zona aproximada' }[value] || value;
}

function openPublishConfirmation() {
  if (!pendingPayload) return;
  const point = locationPicker.getValue();
  const distance = point?.distanceFromUser;
  publishSummary.innerHTML = [
    ['Categoría', categoryInput.options[categoryInput.selectedIndex]?.text || pendingPayload.categoria],
    ['Título', pendingPayload.titulo],
    ['Ubicación', pendingPayload.zona_referencia || `${pendingPayload.latitud}, ${pendingPayload.longitud}`],
    ['Privacidad', privacyText(pendingPayload.precision_ubicacion)],
    ['Distancia desde ti', Number.isFinite(distance) ? (distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance)} m`) : 'No disponible'],
    ['Estado inicial', 'Reportada por un vecino']
  ].map(([label, value]) => `<div class="mz-confirm-item"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`).join('');
  openModal(publishModal);
}

form?.addEventListener('submit', async event => {
  event.preventDefault();
  currentUser = await getCurrentUser();
  if (!currentUser) {
    location.href = `login.html?next=${encodeURIComponent('alertas.html#reportar')}`;
    return;
  }
  try {
    pendingPayload = getFormPayload();
    validatePayload(pendingPayload);
    showStatus('Comprobando si ya existe un reporte parecido...');
    const duplicates = await detectDuplicates(pendingPayload);
    if (duplicates.length && !duplicateCheckPassed) {
      renderDuplicates(duplicates);
      openModal(duplicatesModal);
      showStatus('Encontramos posibles reportes duplicados. Revísalos antes de continuar.');
      return;
    }
    openPublishConfirmation();
  } catch (error) {
    showStatus(error.message || 'Revisa los datos de la alerta.', true);
  }
});

finalPublishButton?.addEventListener('click', async () => {
  if (!pendingPayload || !currentUser) return;
  finalPublishButton.disabled = true;
  finalPublishButton.innerHTML = '<i class="ti ti-loader-2"></i> Publicando...';
  try {
    const { data, error } = await supabase.rpc('crear_alerta_mizona', {
      p_categoria: pendingPayload.categoria,
      p_titulo: pendingPayload.titulo,
      p_descripcion: pendingPayload.descripcion,
      p_distrito: pendingPayload.distrito,
      p_zona_referencia: pendingPayload.zona_referencia || null,
      p_latitud: pendingPayload.latitud,
      p_longitud: pendingPayload.longitud,
      p_precision_ubicacion: pendingPayload.precision_ubicacion
    });
    if (error) throw error;
    closeModal(publishModal);
    showStatus('Alerta publicada. Se mostrará como reportada hasta ser revisada.');
    form.reset();
    applyPrivacyDefault();
    locationPicker.clear();
    duplicateCheckPassed = false;
    pendingPayload = null;
    await loadAlerts();
    toast('Alerta publicada correctamente.');
    setTimeout(() => { if (data) location.href = `alerta.html?id=${encodeURIComponent(data)}`; }, 700);
  } catch (error) {
    showStatus(error.message || 'No se pudo publicar la alerta.', true);
    toast(error.message || 'No se pudo publicar.', 'error');
  } finally {
    finalPublishButton.disabled = false;
    finalPublishButton.innerHTML = '<i class="ti ti-send"></i> Sí, publicar alerta';
  }
});

form?.addEventListener('input', () => { duplicateCheckPassed = false; pendingPayload = null; });

await initNearbyExperience({ reason: 'Activa tu ubicación para mostrar primero alertas e incidentes que estén a 500 metros de ti.' });
await loadAlerts();
window.addEventListener('mizona:location', loadAlerts);
window.addEventListener('mizona:radius-change', loadAlerts);
const channel = supabase.channel('mizona-alertas-v5')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas' }, loadAlerts)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'alerta_actualizaciones' }, loadAlerts)
  .subscribe();

addEventListener('beforeunload', () => supabase.removeChannel(channel));
