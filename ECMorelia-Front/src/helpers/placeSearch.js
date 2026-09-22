// src/helpers/placeSearch.js
const MAPBOX_GEOCODE_BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

const MORELIA_CENTER = { lat: 19.7024, lng: -101.1969 };
const MORELIA_RADIUS_M = 15000;
const MORELIA_BBOX = '-101.35,19.55,-101.00,19.85';

const MAPBOX_TYPE_LABEL = {
  address: 'DIRECCIÓN', poi: 'LUGAR', place: 'CIUDAD / ZONA',
  locality: 'LOCALIDAD', neighborhood: 'COLONIA', district: 'DISTRITO',
  region: 'REGIÓN', postcode: 'CÓDIGO POSTAL', country: 'PAÍS',
};

const FOURSQUARE_CATEGORY_LABEL = {
  '4d4b7105d754a06374d81259': 'RESTAURANTE',
  '4bf58dd8d48988d1c9941735': 'COMIDA RÁPIDA',
  '4bf58dd8d48988d1c8941735': 'CAFETERÍA',
  '4bf58dd8d48988d116941735': 'BAR',
  '4bf58dd8d48988d17f941735': 'CINE',
  '4bf58dd8d48988d1f6931735': 'HOSPITAL',
  '4bf58dd8d48988d10a951735': 'FARMACIA',
  '4bf58dd8d48988d13b951735': 'SUPERMERCADO',
  '4bf58dd8d48988d1f9931735': 'PLAZA COMERCIAL',
  '4bf58dd8d48988d1fa931735': 'HOTEL',
  '4bf58dd8d48988d1e5931735': 'GASOLINERA',
  '4bf58dd8d48988d118951735': 'BANCO',
  '4bf58dd8d48988d1f1931735': 'ESCUELA',
  '4bf58dd8d48988d164941735': 'TIENDA',
  '4e4c9077bd41f78e849722f9': 'TEMPLO',
  '4bf58dd8d48988d1e8931735': 'ESTACIONAMIENTO',
  '52e81612bcbc57d13a577574': 'PARQUE',
  '63be6904847c3692a84b9bb5': 'PUESTO DE COMIDA',
  '63be6904847c3692a84b9b92': 'TIENDA DE ABARROTES',
  '63be6904847c3692a84b9b9c': 'COMIDA CALLEJERA',
  '63be6904847c3692a84b9bb2': 'CARNICERÍA',
  '63be6904847c3692a84b9b80': 'PANADERÍA',
  '63be6904847c3692a84b9b85': 'FRUTERÍA',
};

function resolveApiBase() {
  const explicit = import.meta.env.VITE_API;
  if (explicit) return explicit.replace(/\/+$/, '');
  const ws = import.meta.env.VITE_WS_URL;
  if (ws) {
    try {
      const u = new URL(ws);
      u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
      u.pathname = ''; u.search = ''; u.hash = '';
      return u.origin;
    } catch (_) {}
  }
  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:3000';
  }
  return 'https://emergencity-morelia-v2.onrender.com';
}

export function getPlaceTypeLabel(type, source = 'mapbox', categories = []) {
  if (source === 'foursquare') {
    for (const cat of categories) {
      if (cat.id && FOURSQUARE_CATEGORY_LABEL[cat.id]) return FOURSQUARE_CATEGORY_LABEL[cat.id];
    }
    if (type) return type.toUpperCase().slice(0, 20);
    return 'LUGAR';
  }
  if (!type) return 'LUGAR';
  return MAPBOX_TYPE_LABEL[type] || type.replace(/\./g, ' ').replace(/_/g, ' ').toUpperCase().slice(0, 20);
}

function calcDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function searchMapbox(query, { token, signal }) {
  const url = `${MAPBOX_GEOCODE_BASE}/${encodeURIComponent(query)}.json?` +
    `access_token=${token}&country=mx&bbox=${MORELIA_BBOX}` +
    `&proximity=${MORELIA_CENTER.lng},${MORELIA_CENTER.lat}` +
    `&limit=8&language=es&fuzzyMatch=true&autocomplete=true`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.features || []).map(f => ({
    id: `mb_${f.id}`,
    place_name: f.text || f.place_name,
    subtitle: f.place_name,
    lat: f.center[1], lng: f.center[0],
    type: f.place_type?.[0] || 'place',
    relevance: f.relevance || 0,
    source: 'mapbox',
    categories: [],
  }));
}

async function searchFoursquare(query, { signal }) {
  const apiBase = resolveApiBase();
  try {
    const res = await fetch(`${apiBase}/api/places/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        lat: MORELIA_CENTER.lat,
        lng: MORELIA_CENTER.lng,
        radius: MORELIA_RADIUS_M,
        limit: 12,
      }),
      signal,
    });
    if (!res.ok) {
      console.warn('[Foursquare proxy] HTTP:', res.status);
      return [];
    }
    const data = await res.json();
    return (data.results || [])
      .map(r => {
        const lat = r.latitude ?? r.location?.latitude;
        const lng = r.longitude ?? r.location?.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        const shortName = r.name || '';
        const neighborhood = r.location?.neighborhood || '';
        const locality = r.location?.locality || '';
        const region = r.location?.region || '';
        const addr = r.location?.formatted_address || r.location?.address || '';

        // Construir subtitle con la ubicación más específica posible
        const parts = [neighborhood, locality, region].filter(Boolean);
        const seen = new Set();
        const subtitleParts = [];
        for (const p of parts) {
          if (!seen.has(p) && p.toLowerCase() !== 'morelia') { seen.add(p); subtitleParts.push(p); }
        }
        const subtitle = subtitleParts.length > 0 ? subtitleParts.join(' · ') : addr;

        return {
          id: `fsq_${r.fsq_place_id}`,
          place_name: shortName,      // ej. "Cinépolis" o "KFC"
          subtitle,                    // ej. "La Huerta · Morelia" o dirección
          full_address: addr,
          lat, lng,
          type: r.categories?.[0]?.name || 'lugar',
          relevance: r.distance != null ? 1 - Math.min(r.distance / MORELIA_RADIUS_M, 1) : 0.5,
          source: 'foursquare',
          categories: r.categories || [],
        };
      })
      .filter(Boolean);
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    console.warn('[Foursquare proxy] Error:', e.message);
    return [];
  }
}

export async function searchPlaces(query, { proximity, mapboxToken, signal } = {}) {
  const q = (query || '').trim();
  if (q.length < 2) return [];

  let mapboxResults = [];
  try { mapboxResults = await searchMapbox(q, { token: mapboxToken, signal }); }
  catch (e) { if (e.name === 'AbortError') throw e; }

  let foursquareResults = [];
  try { foursquareResults = await searchFoursquare(q, { signal }); }
  catch (e) { if (e.name === 'AbortError') throw e; }

  const merged = [...mapboxResults];
  for (const fsq of foursquareResults) {
    const isDuplicate = merged.some(m => calcDistanceKm(m.lat, m.lng, fsq.lat, fsq.lng) < 0.05);
    if (!isDuplicate) merged.push(fsq);
  }

  const prox = proximity?.lat != null ? proximity : MORELIA_CENTER;
  merged.sort((a, b) => {
    const relDiff = Math.abs(a.relevance - b.relevance);
    if (relDiff > 0.25) return b.relevance - a.relevance;
    const dA = calcDistanceKm(prox.lat, prox.lng, a.lat, a.lng);
    const dB = calcDistanceKm(prox.lat, prox.lng, b.lat, b.lng);
    return dA - dB;
  });

  return merged.slice(0, 12);
}