// src/helpers/placeSearch.js
// Búsqueda unificada de lugares y direcciones.
// Mapbox para direcciones exactas de Morelia.
// Foursquare (vía proxy backend) para POIs comerciales.

const MAPBOX_GEOCODE_BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

const MORELIA_CENTER = { lat: 19.7024, lng: -101.1969 };
const MORELIA_RADIUS_M = 15000;
const MORELIA_BBOX = '-101.35,19.55,-101.00,19.85';

const MAPBOX_TYPE_LABEL = {
  address: 'DIRECCIÓN',
  poi: 'LUGAR',
  place: 'CIUDAD / ZONA',
  locality: 'LOCALIDAD',
  neighborhood: 'COLONIA',
  district: 'DISTRITO',
  region: 'REGIÓN',
  postcode: 'CÓDIGO POSTAL',
  country: 'PAÍS'
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
  '52e81612bcbc57d13a577574': 'PARQUE'
};

function resolveApiBase() {
  const explicit = import.meta.env.VITE_API;
  if (explicit) return explicit.replace(/\/+$/, '');
  const ws = import.meta.env.VITE_WS_URL;
  if (ws) {
    try {
      const u = new URL(ws);
      u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
      u.pathname = '';
      u.search = '';
      u.hash = '';
      return u.origin;
    } catch (_) {}
  }
  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:3000';
  }
  return 'https://emergencity-morelia-v2.onrender.com';
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
    `access_token=${token}` +
    `&country=mx` +
    `&bbox=${MORELIA_BBOX}` +
    `&proximity=${MORELIA_CENTER.lng},${MORELIA_CENTER.lat}` +
    `&limit=6` +
    `&language=es` +
    `&fuzzyMatch=true` +
    `&autocomplete=true`;

  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.features || []).map(f => ({
    id: `mb_${f.id}`,
    place_name: f.text || f.place_name,
    subtitle: f.place_name,
    lat: f.center[1],
    lng: f.center[0],
    type: f.place_type?.[0] || 'place',
    relevance: f.relevance || 0,
    source: 'mapbox',
    categories: []
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
        limit: 8
      }),
      signal
    });
    if (!res.ok) return [];
    const data = await res.json();

    return (data.results || [])
      .map(r => {
        const lat = r.latitude ?? r.location?.latitude;
        const lng = r.longitude ?? r.location?.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        const shortName = r.name || '';
        const addr = r.location?.formatted_address || r.location?.address || '';
        const neighborhood = r.location?.neighborhood || '';
        const locality = r.location?.locality || '';

        const parts = [neighborhood, locality].filter(Boolean);
        const subtitle = parts.length > 0 ? parts.join(' · ') : addr;

        return {
          id: `fsq_${r.fsq_place_id}`,
          place_name: shortName,
          subtitle,
          full_address: addr,
          lat,
          lng,
          type: r.categories?.[0]?.name || 'lugar',
          relevance: r.distance != null ? 1 - Math.min(r.distance / MORELIA_RADIUS_M, 1) : 0.5,
          source: 'foursquare',
          categories: r.categories || []
        };
      })
      .filter(Boolean);
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    return [];
  }
}

export function getPlaceTypeLabel(type, source = 'mapbox', categories = []) {
  if (source === 'foursquare') {
    for (const cat of categories) {
      if (cat.id && FOURSQUARE_CATEGORY_LABEL[cat.id]) return FOURSQUARE_CATEGORY_LABEL[cat.id];
    }
    if (type) return type.toUpperCase().slice(0, 20);
    return 'LUGAR';
  }
  if (!type) return 'DIRECCIÓN';
  return MAPBOX_TYPE_LABEL[type] || 'DIRECCIÓN';
}

export async function searchPlaces(query, { proximity, mapboxToken, signal } = {}) {
  const q = (query || '').trim();
  if (q.length < 2) return { addresses: [], places: [] };

  // Ejecutar ambas fuentes en paralelo para reducir latencia
  const [mapboxResults, foursquareResults] = await Promise.all([
    searchMapbox(q, { token: mapboxToken, signal }).catch(e => {
      if (e.name === 'AbortError') throw e;
      return [];
    }),
    searchFoursquare(q, { signal }).catch(e => {
      if (e.name === 'AbortError') throw e;
      return [];
    })
  ]);

  const prox = proximity?.lat != null ? proximity : MORELIA_CENTER;

  const sortByProximity = (list) => list.sort((a, b) => {
    const dA = calcDistanceKm(prox.lat, prox.lng, a.lat, a.lng);
    const dB = calcDistanceKm(prox.lat, prox.lng, b.lat, b.lng);
    return dA - dB;
  });

  // Deduplicar places vs addresses (mismo lugar a menos de 50m)
  const places = [];
  for (const p of foursquareResults) {
    const isDuplicate = mapboxResults.some(m =>
      calcDistanceKm(m.lat, m.lng, p.lat, p.lng) < 0.05
    );
    if (!isDuplicate) places.push(p);
  }

  return {
    addresses: sortByProximity(mapboxResults),
    places: sortByProximity(places)
  };
}