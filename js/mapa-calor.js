// ============================================================
// MiZona.pe — Mapa de calor histórico
// Usa Leaflet + leaflet.heat. No muestra datos ficticios.
// ============================================================
import { supabase } from './supabase.js';

let mapaCalor = null;
let heatLayer = null;
let mesActual = new Date().toISOString().slice(0, 7);
let contenedorActual = null;
let avisoVacio = null;

function rangoMes(valor) {
  const [anio, mes] = String(valor || mesActual).split('-').map(Number);
  const inicio = new Date(Date.UTC(anio, Math.max(0, mes - 1), 1));
  const siguiente = new Date(Date.UTC(anio, Math.max(0, mes), 1));
  return {
    inicio: inicio.toISOString().slice(0, 10),
    siguiente: siguiente.toISOString().slice(0, 10)
  };
}

async function cargarLeafletHeat() {
  if (window.L?.heatLayer) return;
  const existente = document.getElementById('leaflet-heat-js');
  if (existente) {
    await new Promise((resolve, reject) => {
      if (window.L?.heatLayer) return resolve();
      existente.addEventListener('load', resolve, { once: true });
      existente.addEventListener('error', reject, { once: true });
    });
    return;
  }
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'leaflet-heat-js';
    script.src = 'https://cdn.jsdelivr.net/npm/leaflet.heat@0.2.0/dist/leaflet-heat.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('No se pudo cargar el módulo del mapa de calor.'));
    document.head.appendChild(script);
  });
}

function mostrarVacio(mensaje = 'Todavía no hay suficientes alertas para este mes.') {
  avisoVacio?.remove();
  const contenedor = document.getElementById(contenedorActual);
  if (!contenedor) return;
  avisoVacio = document.createElement('div');
  avisoVacio.className = 'mz-heat-empty';
  avisoVacio.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:500;background:rgba(15,23,42,.88);color:#fff;padding:10px 14px;border-radius:10px;font-size:11px;font-weight:700;box-shadow:0 5px 20px rgba(0,0,0,.2);text-align:center;pointer-events:none';
  avisoVacio.textContent = mensaje;
  contenedor.style.position = 'relative';
  contenedor.appendChild(avisoVacio);
}

function ocultarVacio() {
  avisoVacio?.remove();
  avisoVacio = null;
}

export async function initMapaCalor(contenedorId, distrito = null, opciones = {}) {
  if (!window.L) throw new Error('Leaflet no está cargado.');
  destroyMapaCalor();
  contenedorActual = contenedorId;
  const centro = opciones.centro || [-12.046, -77.043];
  const zoom = Number(opciones.zoom || 12);
  mapaCalor = L.map(contenedorId, {
    zoomControl: true,
    scrollWheelZoom: false,
    attributionControl: true
  }).setView(centro, zoom);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(mapaCalor);

  await cargarLeafletHeat();
  await cargarDatosCalor(distrito, opciones.mes || mesActual);
  setTimeout(() => mapaCalor?.invalidateSize(), 80);
  return mapaCalor;
}

export async function cargarDatosCalor(distrito = null, mes = null) {
  if (!mapaCalor) return [];
  mesActual = mes || mesActual;
  const { inicio, siguiente } = rangoMes(mesActual);

  let query = supabase
    .from('estadisticas_zona')
    .select('lat_approx,lng_approx,total_alertas,intensidad,distrito')
    .gte('mes', inicio)
    .lt('mes', siguiente)
    .order('total_alertas', { ascending: false })
    .limit(1000);

  if (distrito) query = query.ilike('distrito', distrito);
  const { data, error } = await query;
  if (error) throw error;

  if (heatLayer) {
    mapaCalor.removeLayer(heatLayer);
    heatLayer = null;
  }

  const puntos = (data || [])
    .map(item => [
      Number(item.lat_approx),
      Number(item.lng_approx),
      Math.max(0.15, Math.min(1, Number(item.intensidad) || Number(item.total_alertas) / 20 || 0.15))
    ])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

  if (!puntos.length) {
    mostrarVacio();
    return [];
  }

  ocultarVacio();
  heatLayer = L.heatLayer(puntos, {
    radius: 28,
    blur: 20,
    maxZoom: 17,
    minOpacity: 0.35,
    gradient: { 0.25: '#1D9E75', 0.55: '#f59e0b', 0.8: '#f97316', 1: '#E24B4A' }
  }).addTo(mapaCalor);

  const bounds = L.latLngBounds(puntos.map(([lat, lng]) => [lat, lng]));
  if (bounds.isValid()) mapaCalor.fitBounds(bounds.pad(0.25), { maxZoom: 14 });
  return data || [];
}

export async function cambiarMesCalor(mes, distrito = null) {
  mesActual = mes;
  return cargarDatosCalor(distrito, mes);
}

export function destroyMapaCalor() {
  avisoVacio?.remove();
  avisoVacio = null;
  if (mapaCalor) {
    try { mapaCalor.remove(); } catch (_) {}
  }
  mapaCalor = null;
  heatLayer = null;
  contenedorActual = null;
}
