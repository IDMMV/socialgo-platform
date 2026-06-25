import { supabase } from './supabase.js';

export const DEFAULT_NEARBY_RADIUS = 500;
export const NEARBY_RADIUS_OPTIONS = [500, 1000, 2000, 5000, 0];

const KEYS = {
  location: 'mizona_nearby_location_v2',
  radius: 'mizona_nearby_radius_v2',
  intro: 'mizona_location_intro_v2',
  manual: 'mizona_location_manual_v1'
};
const MAX_CACHE_AGE = 10 * 60 * 1000;
let pendingLocationPromise = null;
let currentPoint = readPoint();
let currentRadius = readRadius();

function safeJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function readPoint() {
  const point = safeJson(localStorage.getItem(KEYS.location));
  if (!point || !Number.isFinite(Number(point.lat)) || !Number.isFinite(Number(point.lng))) return null;
  return {
    lat: Number(point.lat),
    lng: Number(point.lng),
    accuracy: Number(point.accuracy || 0),
    timestamp: Number(point.timestamp || 0),
    source: point.source || 'gps'
  };
}

function savePoint(point) {
  currentPoint = point;
  localStorage.setItem(KEYS.location, JSON.stringify(point));
  window.dispatchEvent(new CustomEvent('mizona:location', { detail: { point, radius: currentRadius } }));
  updateLocationLabels();
}

function readRadius() {
  const stored = Number(localStorage.getItem(KEYS.radius));
  return NEARBY_RADIUS_OPTIONS.includes(stored) ? stored : DEFAULT_NEARBY_RADIUS;
}

export function getNearbyRadius() { return currentRadius; }
export function setNearbyRadius(radius) {
  const value = NEARBY_RADIUS_OPTIONS.includes(Number(radius)) ? Number(radius) : DEFAULT_NEARBY_RADIUS;
  currentRadius = value;
  localStorage.setItem(KEYS.radius, String(value));
  document.querySelectorAll('[data-nearby-radius-button]').forEach(button => {
    button.classList.toggle('active', Number(button.dataset.nearbyRadiusButton) === value);
  });
  updateLocationLabels();
  window.dispatchEvent(new CustomEvent('mizona:radius-change', { detail: { point: currentPoint, radius: value } }));
  persistProfileLocation(currentPoint, value).catch(() => {});
  return value;
}

export function getStoredNearbyLocation({ allowStale = true } = {}) {
  if (!currentPoint) return null;
  if (!allowStale && Date.now() - currentPoint.timestamp > MAX_CACHE_AGE) return null;
  return { ...currentPoint };
}

export function formatNearbyRadius(radius = currentRadius) {
  if (!radius) return 'todo el distrito';
  return radius >= 1000 ? `${Number((radius / 1000).toFixed(radius % 1000 ? 1 : 0))} km` : `${radius} m`;
}

export function formatDistance(meters) {
  const value = Number(meters);
  if (!Number.isFinite(value)) return 'distancia no disponible';
  if (value < 1000) return `${Math.max(0, Math.round(value))} m`;
  return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)} km`;
}

export function distanceMeters(a, b) {
  if (!a || !b) return NaN;
  const lat1 = Number(a.lat ?? a.latitud), lon1 = Number(a.lng ?? a.longitud);
  const lat2 = Number(b.lat ?? b.latitud), lon2 = Number(b.lng ?? b.longitud);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return NaN;
  const rad = value => value * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function decorateWithDistance(items, point = currentPoint, { latKey = 'latitud', lngKey = 'longitud' } = {}) {
  return (items || []).map(item => {
    const distance = point ? distanceMeters(point, { lat: Number(item?.[latKey]), lng: Number(item?.[lngKey]) }) : NaN;
    return { ...item, _distanceMeters: distance };
  });
}

export function filterNearby(items, point = currentPoint, radius = currentRadius, options = {}) {
  const { latKey = 'latitud', lngKey = 'longitud', includeWithoutCoordinates = false, fallbackDistrict = '' } = options;
  const district = normalise(fallbackDistrict);
  return decorateWithDistance(items, point, { latKey, lngKey }).filter(item => {
    if (!point || !radius) return true;
    if (Number.isFinite(item._distanceMeters)) return item._distanceMeters <= radius;
    if (includeWithoutCoordinates && district) return normalise(item.distrito || item.zona_atencion) === district;
    return includeWithoutCoordinates;
  }).sort((a, b) => {
    const da = Number.isFinite(a._distanceMeters) ? a._distanceMeters : Infinity;
    const db = Number.isFinite(b._distanceMeters) ? b._distanceMeters : Infinity;
    return da - db;
  });
}

function normalise(value = '') {
  return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

async function permissionState() {
  try {
    if (!navigator.permissions?.query) return 'unknown';
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch { return 'unknown'; }
}

function locationErrorMessage(error) {
  if (error?.code === 1) return 'La ubicación está bloqueada. Actívala en los permisos del navegador para ver contenido cercano.';
  if (error?.code === 2) return 'No pudimos determinar tu ubicación. Revisa que el GPS esté encendido.';
  if (error?.code === 3) return 'La ubicación tardó demasiado. Puedes reintentar o elegir tu distrito.';
  return 'No pudimos obtener tu ubicación.';
}

function ensureIntroModal(reason) {
  let overlay = document.querySelector('#mzLocationIntro');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'mzLocationIntro';
  overlay.className = 'mz-location-intro';
  overlay.innerHTML = `
    <section class="mz-location-intro-card" role="dialog" aria-modal="true" aria-labelledby="mzLocationIntroTitle">
      <button type="button" class="mz-location-intro-close" data-location-close aria-label="Cerrar">×</button>
      <div class="mz-location-intro-icon"><i class="ti ti-current-location"></i></div>
      <h2 id="mzLocationIntroTitle">Encuentra lo que ocurre cerca de ti</h2>
      <p>${reason || 'MiZona usa tu ubicación para mostrar alertas, servicios, ofertas y solicitudes alrededor de 500 metros.'}</p>
      <div class="mz-location-privacy"><i class="ti ti-shield-lock"></i><span>Tu ubicación exacta no se muestra públicamente ni se comparte de forma permanente.</span></div>
      <div class="mz-location-intro-actions">
        <button type="button" class="mz-location-primary" data-location-accept><i class="ti ti-map-pin"></i> Usar mi ubicación</button>
        <button type="button" class="mz-location-secondary" data-location-manual><i class="ti ti-map-search"></i> Elegir distrito</button>
      </div>
    </section>`;
  document.body.appendChild(overlay);
  return overlay;
}

function askIntro(reason) {
  return new Promise(resolve => {
    const overlay = ensureIntroModal(reason);
    const finish = value => {
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 180);
      resolve(value);
    };
    overlay.querySelector('[data-location-accept]').onclick = () => { localStorage.setItem(KEYS.intro, '1'); finish('accept'); };
    overlay.querySelector('[data-location-manual]').onclick = () => { localStorage.setItem(KEYS.manual, '1'); finish('manual'); };
    overlay.querySelector('[data-location-close]').onclick = () => finish('close');
    requestAnimationFrame(() => overlay.classList.add('open'));
  });
}

function showLocationBanner(message, type = 'info') {
  let banner = document.querySelector('#mzLocationBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'mzLocationBanner';
    banner.className = 'mz-location-banner';
    banner.innerHTML = `<i class="ti ti-location-question"></i><span></span><button type="button">Reintentar</button><a href="perfil.html">Elegir distrito</a>`;
    document.body.appendChild(banner);
    banner.querySelector('button').addEventListener('click', () => requestNearbyLocation({ force: true, interactive: true }));
  }
  banner.classList.toggle('error', type === 'error');
  banner.querySelector('span').textContent = message;
  banner.classList.add('show');
}

function hideLocationBanner() {
  document.querySelector('#mzLocationBanner')?.classList.remove('show');
}

async function persistProfileLocation(point, radius = currentRadius) {
  if (!point) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const args = {
    p_latitud: point.lat,
    p_longitud: point.lng,
    p_precision_metros: Math.round(point.accuracy || 0),
    p_radio_metros: radius || DEFAULT_NEARBY_RADIUS
  };
  const { error } = await supabase.rpc('mizona_actualizar_ubicacion', args);
  if (!error) return;
  await supabase.from('perfiles').update({
    latitud_ultima: point.lat,
    longitud_ultima: point.lng,
    ubicacion_precision_metros: Math.round(point.accuracy || 0),
    ubicacion_actualizada_en: new Date(point.timestamp).toISOString(),
    radio_preferido_metros: radius || DEFAULT_NEARBY_RADIUS
  }).eq('id', user.id);
}

export async function requestNearbyLocation({ force = false, interactive = true, reason = '', highAccuracy = true } = {}) {
  if (!navigator.geolocation) {
    showLocationBanner('Este dispositivo no admite ubicación. Elige tu distrito manualmente.', 'error');
    return null;
  }
  const cached = getStoredNearbyLocation({ allowStale: false });
  if (!force && cached) {
    updateLocationLabels();
    window.dispatchEvent(new CustomEvent('mizona:location', { detail: { point: cached, radius: currentRadius, cached: true } }));
    return cached;
  }
  if (pendingLocationPromise) return pendingLocationPromise;

  pendingLocationPromise = (async () => {
    const state = await permissionState();
    if (state === 'denied') {
      showLocationBanner('Permiso de ubicación bloqueado. Actívalo para mostrar lo que hay a 500 m.', 'error');
      return getStoredNearbyLocation();
    }
    if (interactive && state !== 'granted' && localStorage.getItem(KEYS.intro) !== '1') {
      const choice = await askIntro(reason);
      if (choice !== 'accept') {
        if (choice === 'manual') location.href = 'perfil.html#ubicacion';
        return getStoredNearbyLocation();
      }
    }

    return await new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(position => {
        const point = {
          lat: Number(position.coords.latitude),
          lng: Number(position.coords.longitude),
          accuracy: Number(position.coords.accuracy || 0),
          timestamp: Date.now(),
          source: 'gps'
        };
        savePoint(point);
        hideLocationBanner();
        persistProfileLocation(point).catch(() => {});
        resolve(point);
      }, error => {
        showLocationBanner(locationErrorMessage(error), 'error');
        resolve(getStoredNearbyLocation());
      }, {
        enableHighAccuracy: highAccuracy,
        timeout: 12000,
        maximumAge: force ? 0 : 300000
      });
    });
  })().finally(() => { pendingLocationPromise = null; });
  return pendingLocationPromise;
}

export function mountNearbyControls(root = document) {
  root.querySelectorAll('[data-nearby-controls]').forEach(container => {
    if (container.dataset.ready === '1') return;
    container.dataset.ready = '1';
    container.innerHTML = `
      <div class="mz-nearby-status"><i class="ti ti-current-location"></i><div><strong data-nearby-title>Cerca de ti</strong><span data-nearby-summary>Buscando tu ubicación…</span></div></div>
      <div class="mz-nearby-radii" role="group" aria-label="Radio de búsqueda">
        ${NEARBY_RADIUS_OPTIONS.map(radius => `<button type="button" data-nearby-radius-button="${radius}" class="${radius === currentRadius ? 'active' : ''}">${formatNearbyRadius(radius)}</button>`).join('')}
      </div>
      <button type="button" class="mz-nearby-refresh" data-nearby-refresh title="Actualizar ubicación"><i class="ti ti-refresh"></i><span>Actualizar</span></button>`;
    container.querySelectorAll('[data-nearby-radius-button]').forEach(button => button.addEventListener('click', () => setNearbyRadius(Number(button.dataset.nearbyRadiusButton))));
    container.querySelector('[data-nearby-refresh]')?.addEventListener('click', () => requestNearbyLocation({ force: true, interactive: true }));
  });
  updateLocationLabels();
}

function updateLocationLabels() {
  const point = currentPoint;
  document.querySelectorAll('[data-nearby-summary]').forEach(element => {
    if (!point) element.textContent = `Activa la ubicación para ver contenido a ${formatNearbyRadius(currentRadius)}`;
    else element.textContent = `Mostrando contenido a ${formatNearbyRadius(currentRadius)} · precisión ±${Math.max(1, Math.round(point.accuracy || 0))} m`;
  });
  document.querySelectorAll('[data-nearby-radius-text]').forEach(element => { element.textContent = formatNearbyRadius(currentRadius); });
  document.querySelectorAll('[data-nearby-radius-button]').forEach(button => button.classList.toggle('active', Number(button.dataset.nearbyRadiusButton) === currentRadius));
}

export async function initNearbyExperience(options = {}) {
  mountNearbyControls(options.root || document);
  const auto = options.auto !== false;
  if (!auto) return getStoredNearbyLocation();
  return requestNearbyLocation({
    force: false,
    interactive: options.interactive !== false,
    highAccuracy: options.highAccuracy !== false,
    reason: options.reason || 'MiZona mostrará primero alertas, servicios, ofertas y solicitudes que estén a 500 metros de ti. Después podrás ampliar el radio.'
  });
}

window.MiZonaNearby = {
  DEFAULT_NEARBY_RADIUS,
  getLocation: getStoredNearbyLocation,
  requestLocation: requestNearbyLocation,
  getRadius: getNearbyRadius,
  setRadius: setNearbyRadius,
  distanceMeters,
  formatDistance,
  filterNearby,
  init: initNearbyExperience
};
