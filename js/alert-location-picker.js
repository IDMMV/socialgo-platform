import { toast } from './mizona-ui-v2.js';

function round(value, digits = 6) {
  return Number(Number(value).toFixed(digits));
}

function distanceMeters(a, b) {
  if (!a || !b) return null;
  const rad = n => n * Math.PI / 180;
  const earth = 6371000;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '';
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

export function createAlertLocationPicker(options = {}) {
  const modal = document.getElementById(options.modalId || 'modal-location-picker');
  const mapElement = document.getElementById(options.mapId || 'mzLocationMap');
  const summary = document.getElementById(options.summaryId || 'locationSummary');
  const selectedText = document.getElementById(options.selectedTextId || 'locationSelectedText');
  const confirmButton = document.getElementById(options.confirmButtonId || 'confirmLocationButton');
  const closeButtons = modal?.querySelectorAll('[data-close-location]') || [];
  const referenceInput = options.referenceInput || null;
  const districtInput = options.districtInput || null;
  const latInput = options.latInput || null;
  const lngInput = options.lngInput || null;

  let map = null;
  let marker = null;
  let selected = null;
  let currentPosition = null;
  let reverseTimer = null;
  let touchTimer = null;
  let touchStart = null;
  let touchMoved = false;

  function ensureMap() {
    if (map) return map;
    if (!window.L || !mapElement) throw new Error('No se pudo iniciar el mapa.');
    map = L.map(mapElement, { zoomControl: true, scrollWheelZoom: true }).setView([-12.0464, -77.0428], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    map.on('click', event => {
      if (matchMedia('(pointer: coarse)').matches) return;
      setPoint(event.latlng.lat, event.latlng.lng, { reverse: true, source: 'map' });
    });

    installLongPress();
    return map;
  }

  function installLongPress() {
    if (!mapElement) return;
    const clear = () => {
      clearTimeout(touchTimer);
      touchTimer = null;
      touchStart = null;
      touchMoved = false;
    };

    mapElement.addEventListener('touchstart', event => {
      if (event.touches.length !== 1) return clear();
      touchMoved = false;
      touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      clearTimeout(touchTimer);
      touchTimer = setTimeout(() => {
        if (!touchStart || touchMoved || !map) return;
        const rect = mapElement.getBoundingClientRect();
        const point = L.point(touchStart.x - rect.left, touchStart.y - rect.top);
        const latlng = map.containerPointToLatLng(point);
        setPoint(latlng.lat, latlng.lng, { reverse: true, source: 'longpress' });
        navigator.vibrate?.(35);
        clear();
      }, 650);
    }, { passive: true });

    mapElement.addEventListener('touchmove', event => {
      if (!touchStart || !event.touches[0]) return;
      const dx = Math.abs(event.touches[0].clientX - touchStart.x);
      const dy = Math.abs(event.touches[0].clientY - touchStart.y);
      if (dx > 12 || dy > 12) {
        touchMoved = true;
        clearTimeout(touchTimer);
      }
    }, { passive: true });

    mapElement.addEventListener('touchend', clear, { passive: true });
    mapElement.addEventListener('touchcancel', clear, { passive: true });
  }

  function createMarker(lat, lng) {
    if (!map) return;
    if (!marker) {
      marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        setPoint(pos.lat, pos.lng, { reverse: true, source: 'drag', keepView: true });
      });
    } else {
      marker.setLatLng([lat, lng]);
    }
  }

  async function reverseGeocode(lat, lng) {
    clearTimeout(reverseTimer);
    reverseTimer = setTimeout(async () => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&accept-language=es`, {
          headers: { Accept: 'application/json' }
        });
        if (!response.ok) return;
        const data = await response.json();
        const address = data.address || {};
        const district = address.suburb || address.city_district || address.district || address.city || address.town || '';
        const reference = [address.road || address.pedestrian || address.neighbourhood, district].filter(Boolean).join(', ');
        selected = { ...selected, district, reference, displayName: data.display_name || reference };
        // Siempre actualizar distrito cuando viene de GPS o mapa (limpiar flag userEdited)
        if (districtInput && district) {
          districtInput.dataset.userEdited = '';
          districtInput.value = district;
          // Disparar evento change para que otros listeners lo detecten
          districtInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (referenceInput && reference && !referenceInput.value.trim()) referenceInput.value = reference;
        renderSelected();
      } catch (_) {
        // Las coordenadas siguen siendo válidas aunque no exista dirección textual.
      }
    }, 250);
  }

  function setPoint(lat, lng, { reverse = false, source = 'map', keepView = false } = {}) {
    selected = {
      ...(selected || {}),
      lat: round(lat),
      lng: round(lng),
      source
    };
    createMarker(selected.lat, selected.lng);
    if (!keepView) map?.setView([selected.lat, selected.lng], Math.max(map.getZoom(), 16));
    if (reverse) reverseGeocode(selected.lat, selected.lng);
    renderSelected();
  }

  function renderSelected() {
    if (!selected) {
      if (selectedText) selectedText.textContent = 'Aún no elegiste un punto.';
      if (summary) summary.innerHTML = '<i class="ti ti-map-pin-question"></i><div><strong>Ubicación pendiente</strong><span>Usa tu GPS o elige el punto directamente en el mapa.</span></div>';
      if (confirmButton) confirmButton.disabled = true;
      return;
    }

    const distance = distanceMeters(currentPosition, selected);
    const label = selected.reference || selected.displayName || `${selected.lat}, ${selected.lng}`;
    if (selectedText) selectedText.innerHTML = `<strong>${label}</strong><br><span>${selected.lat}, ${selected.lng}${distance != null ? ` · A ${formatDistance(distance)} de ti` : ''}</span>`;
    if (summary) summary.innerHTML = `<i class="ti ti-map-pin-check"></i><div><strong>Punto seleccionado</strong><span>${label}${distance != null ? ` · ${formatDistance(distance)} desde tu ubicación` : ''}</span></div>`;
    if (confirmButton) confirmButton.disabled = false;
  }

  async function useCurrentLocation({ closeAfter = false } = {}) {
    if (!navigator.geolocation) {
      toast('Tu navegador no admite ubicación.', 'error');
      return null;
    }
    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(position => {
        currentPosition = { lat: position.coords.latitude, lng: position.coords.longitude };
        setPoint(currentPosition.lat, currentPosition.lng, { reverse: true, source: 'gps' });
        if (closeAfter) confirm();
        resolve(selected);
      }, error => {
        toast(error.code === 1 ? 'Permite el acceso a la ubicación para usar el GPS.' : 'No fue posible obtener tu ubicación.', 'error');
        resolve(null);
      }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 });
    });
  }

  function open() {
    ensureMap();
    modal?.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => map?.invalidateSize(), 120);
    if (selected) map?.setView([selected.lat, selected.lng], 16);
    else useCurrentLocation();
  }

  function close() {
    modal?.classList.remove('open');
    document.body.style.overflow = '';
  }

  function confirm() {
    if (!selected) return;
    if (latInput) latInput.value = selected.lat;
    if (lngInput) lngInput.value = selected.lng;
    close();
    renderSelected();
    options.onConfirm?.(getValue());
  }

  function getValue() {
    if (!selected) return null;
    return {
      ...selected,
      distanceFromUser: distanceMeters(currentPosition, selected)
    };
  }

  function clear() {
    selected = null;
    marker?.remove();
    marker = null;
    if (latInput) latInput.value = '';
    if (lngInput) lngInput.value = '';
    renderSelected();
  }

  confirmButton?.addEventListener('click', confirm);
  closeButtons.forEach(button => button.addEventListener('click', close));
  modal?.addEventListener('click', event => { if (event.target === modal) close(); });
  districtInput?.addEventListener('input', () => { districtInput.dataset.userEdited = '1'; });
  renderSelected();

  return { open, close, confirm, clear, getValue, setPoint, useCurrentLocation, ensureMap };
}
