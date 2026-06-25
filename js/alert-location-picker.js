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
  const searchButton = document.getElementById(options.searchButtonId || 'locationSearchButton');
  const radiusStatus = document.getElementById(options.radiusStatusId || 'locationRadiusStatus');
  const closeButtons = modal?.querySelectorAll('[data-close-location]') || [];
  const referenceInput = options.referenceInput || null;
  const districtInput = options.districtInput || null;
  const latInput = options.latInput || null;
  const lngInput = options.lngInput || null;
  const originLatInput = options.originLatInput || null;
  const originLngInput = options.originLngInput || null;
  const maxDistance = Math.max(100, Number(options.maxDistanceMeters || 500));

  let map = null;
  let marker = null;
  let originMarker = null;
  let radiusCircle = null;
  let selected = null;
  let currentPosition = null;
  let reverseTimer = null;
  let locatingPromise = null;

  function ensureMap() {
    if (map) return map;
    if (!window.L || !mapElement) throw new Error('No se pudo iniciar el mapa.');
    map = L.map(mapElement, { zoomControl: true, scrollWheelZoom: true }).setView([-12.0464, -77.0428], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    map.on('click', event => {
      choosePoint(event.latlng.lat, event.latlng.lng, { reverse: true, source: 'map' });
    });
    return map;
  }

  function drawAllowedRadius() {
    if (!map || !currentPosition) return;
    if (!originMarker) {
      originMarker = L.circleMarker([currentPosition.lat, currentPosition.lng], {
        radius: 7, weight: 3, color: '#185fa5', fillColor: '#ffffff', fillOpacity: 1
      }).addTo(map).bindTooltip('Tu ubicación actual');
    } else originMarker.setLatLng([currentPosition.lat, currentPosition.lng]);

    if (!radiusCircle) {
      radiusCircle = L.circle([currentPosition.lat, currentPosition.lng], {
        radius: maxDistance, color: '#185fa5', weight: 2, fillColor: '#2f80ed', fillOpacity: 0.08
      }).addTo(map);
    } else {
      radiusCircle.setLatLng([currentPosition.lat, currentPosition.lng]);
      radiusCircle.setRadius(maxDistance);
    }
    if (radiusStatus) {
      radiusStatus.className = 'mz-radius-status ok';
      radiusStatus.innerHTML = `<i class="ti ti-shield-check"></i> Puedes marcar un evento hasta ${maxDistance} m de tu ubicación actual.`;
    }
  }

  function createMarker(lat, lng) {
    if (!map) return;
    if (!marker) {
      marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        if (!choosePoint(pos.lat, pos.lng, { reverse: true, source: 'drag', keepView: true })) {
          if (selected) marker.setLatLng([selected.lat, selected.lng]);
          else marker.remove(), marker = null;
        }
      });
    } else marker.setLatLng([lat, lng]);
  }

  function isInsideRadius(point) {
    if (!currentPosition) return false;
    const meters = distanceMeters(currentPosition, point);
    return Number.isFinite(meters) && meters <= maxDistance;
  }

  function showOutsideRadius(point) {
    const meters = distanceMeters(currentPosition, point);
    toast(`Ese punto está a ${formatDistance(meters)} de ti. Solo puedes reportar eventos dentro de ${maxDistance} m.`, 'error');
    if (radiusStatus) {
      radiusStatus.className = 'mz-radius-status error';
      radiusStatus.innerHTML = `<i class="ti ti-alert-triangle"></i> Punto fuera del límite: ${formatDistance(meters)}. Máximo permitido: ${maxDistance} m.`;
    }
    if (radiusCircle) map?.fitBounds(radiusCircle.getBounds(), { padding: [24, 24] });
  }

  async function reverseGeocode(lat, lng) {
    clearTimeout(reverseTimer);
    reverseTimer = setTimeout(async () => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&accept-language=es`, {
          headers: { Accept: 'application/json' }
        });
        if (!response.ok) return;
        const data = await response.json();
        const address = data.address || {};
        const district = address.suburb || address.city_district || address.district || address.city || address.town || '';
        const reference = [address.road || address.pedestrian || address.neighbourhood || address.quarter, district].filter(Boolean).join(', ');
        selected = { ...selected, district, reference, displayName: data.display_name || reference };
        if (districtInput && district) {
          districtInput.value = district;
          districtInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (referenceInput && reference) referenceInput.value = reference;
        renderSelected();
      } catch (_) {}
    }, 250);
  }

  function choosePoint(lat, lng, { reverse = false, source = 'map', keepView = false } = {}) {
    const candidate = { lat: round(lat), lng: round(lng) };
    if (!currentPosition) {
      toast('Primero permite tu ubicación actual. MiZona necesita validar que el evento esté cerca de ti.', 'error');
      if (radiusStatus) {
        radiusStatus.className = 'mz-radius-status error';
        radiusStatus.innerHTML = '<i class="ti ti-current-location-off"></i> Activa el GPS para habilitar el radio de seguridad.';
      }
      return false;
    }
    if (!isInsideRadius(candidate)) {
      showOutsideRadius(candidate);
      return false;
    }
    selected = { ...(selected || {}), ...candidate, source };
    createMarker(selected.lat, selected.lng);
    if (!keepView) map?.setView([selected.lat, selected.lng], Math.max(map.getZoom(), 17));
    if (reverse) reverseGeocode(selected.lat, selected.lng);
    if (radiusStatus) {
      const meters = distanceMeters(currentPosition, selected);
      radiusStatus.className = 'mz-radius-status ok';
      radiusStatus.innerHTML = `<i class="ti ti-circle-check"></i> Punto válido: a ${formatDistance(meters)} de tu ubicación.`;
    }
    renderSelected();
    return true;
  }

  function renderSelected() {
    if (!selected) {
      if (selectedText) selectedText.textContent = currentPosition ? 'Elige un punto dentro del círculo de 500 m.' : 'Activa tu ubicación para comenzar.';
      if (summary) summary.innerHTML = '<i class="ti ti-map-pin-question"></i><div><strong>Ubicación pendiente</strong><span>Escribe distrito y referencia, luego elige el punto en el mapa.</span></div>';
      if (confirmButton) confirmButton.disabled = true;
      return;
    }
    const distance = distanceMeters(currentPosition, selected);
    const valid = currentPosition && Number.isFinite(distance) && distance <= maxDistance;
    const label = selected.reference || selected.displayName || `${selected.lat}, ${selected.lng}`;
    if (selectedText) selectedText.innerHTML = `<strong>${label}</strong><br><span>${selected.lat}, ${selected.lng}${Number.isFinite(distance) ? ` · A ${formatDistance(distance)} de ti` : ''}</span>`;
    if (summary) summary.innerHTML = `<i class="ti ${valid ? 'ti-map-pin-check' : 'ti-map-pin-exclamation'}"></i><div><strong>${valid ? 'Punto seleccionado' : 'Punto no válido'}</strong><span>${label}${Number.isFinite(distance) ? ` · ${formatDistance(distance)} desde tu ubicación` : ''}</span></div>`;
    if (confirmButton) confirmButton.disabled = !valid;
  }

  function obtainCurrentLocation({ selectCurrent = false, closeAfter = false } = {}) {
    if (locatingPromise) return locatingPromise;
    if (!navigator.geolocation) {
      toast('Tu navegador no admite ubicación.', 'error');
      return Promise.resolve(null);
    }
    if (radiusStatus) {
      radiusStatus.className = 'mz-radius-status loading';
      radiusStatus.innerHTML = '<i class="ti ti-loader-2"></i> Obteniendo tu ubicación actual…';
    }
    locatingPromise = new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(position => {
        currentPosition = { lat: round(position.coords.latitude), lng: round(position.coords.longitude) };
        if (originLatInput) originLatInput.value = currentPosition.lat;
        if (originLngInput) originLngInput.value = currentPosition.lng;
        drawAllowedRadius();
        if (selectCurrent || !selected) choosePoint(currentPosition.lat, currentPosition.lng, { reverse: true, source: 'gps' });
        if (closeAfter) confirm();
        resolve(currentPosition);
      }, error => {
        if (radiusStatus) {
          radiusStatus.className = 'mz-radius-status error';
          radiusStatus.innerHTML = '<i class="ti ti-current-location-off"></i> No se pudo validar tu ubicación. Activa el GPS y vuelve a intentar.';
        }
        toast(error.code === 1 ? 'Permite el acceso a la ubicación para reportar eventos cercanos.' : 'No fue posible obtener tu ubicación.', 'error');
        renderSelected();
        resolve(null);
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
    }).finally(() => { locatingPromise = null; });
    return locatingPromise;
  }

  async function geocodeFromInputs({ select = true } = {}) {
    ensureMap();
    const district = districtInput?.value?.trim() || '';
    const reference = referenceInput?.value?.trim() || '';
    if (!district && !reference) {
      toast('Escribe primero el distrito o una referencia.', 'error');
      return null;
    }
    if (searchButton) { searchButton.disabled = true; searchButton.innerHTML = '<i class="ti ti-loader-2"></i> Buscando…'; }
    try {
      const query = [reference, district, 'Perú'].filter(Boolean).join(', ');
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=pe&accept-language=es&q=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('No se pudo consultar el mapa.');
      const rows = await response.json();
      if (!rows?.length) throw new Error('No encontramos esa dirección. Escribe una referencia más conocida.');
      const point = { lat: Number(rows[0].lat), lng: Number(rows[0].lon) };
      map?.setView([point.lat, point.lng], 17);
      if (select) choosePoint(point.lat, point.lng, { reverse: true, source: 'address' });
      return point;
    } catch (error) {
      toast(error.message || 'No se encontró la dirección.', 'error');
      return null;
    } finally {
      if (searchButton) { searchButton.disabled = false; searchButton.innerHTML = '<i class="ti ti-search"></i> Buscar distrito y referencia'; }
    }
  }

  async function open() {
    ensureMap();
    modal?.classList.add('open');
    modal?.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => map?.invalidateSize(), 120);
    const origin = await obtainCurrentLocation({ selectCurrent: false });
    if (!origin) return;
    const hasAddress = Boolean(districtInput?.value?.trim() || referenceInput?.value?.trim());
    if (hasAddress) await geocodeFromInputs({ select: true });
    else choosePoint(origin.lat, origin.lng, { reverse: true, source: 'gps' });
  }

  function close() {
    modal?.classList.remove('open');
    modal?.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function confirm() {
    if (!selected || !currentPosition) return;
    const meters = distanceMeters(currentPosition, selected);
    if (!Number.isFinite(meters) || meters > maxDistance) {
      showOutsideRadius(selected);
      return;
    }
    if (latInput) latInput.value = selected.lat;
    if (lngInput) lngInput.value = selected.lng;
    if (originLatInput) originLatInput.value = currentPosition.lat;
    if (originLngInput) originLngInput.value = currentPosition.lng;
    close();
    renderSelected();
    options.onConfirm?.(getValue());
  }

  function getValue() {
    if (!selected) return null;
    return {
      ...selected,
      originLat: currentPosition?.lat ?? null,
      originLng: currentPosition?.lng ?? null,
      distanceFromUser: distanceMeters(currentPosition, selected),
      maxDistanceMeters: maxDistance
    };
  }

  function clear() {
    selected = null;
    marker?.remove(); marker = null;
    if (latInput) latInput.value = '';
    if (lngInput) lngInput.value = '';
    renderSelected();
  }

  confirmButton?.addEventListener('click', confirm);
  searchButton?.addEventListener('click', () => geocodeFromInputs({ select: true }));
  closeButtons.forEach(button => button.addEventListener('click', close));
  modal?.addEventListener('click', event => { if (event.target === modal) close(); });
  renderSelected();

  return {
    open, close, confirm, clear, getValue,
    setPoint: (lat, lng, cfg = {}) => choosePoint(lat, lng, cfg),
    useCurrentLocation: ({ closeAfter = false } = {}) => obtainCurrentLocation({ selectCurrent: true, closeAfter }),
    ensureMap, geocodeFromInputs
  };
}
