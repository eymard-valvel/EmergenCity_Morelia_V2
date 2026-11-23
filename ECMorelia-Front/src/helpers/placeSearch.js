const MORELIA_CENTER = { lat: 19.7024, lng: -101.1969 };
const MORELIA_BBOX = '-101.35,19.60,-101.05,19.80';

const CATEGORY_MAP = {
  cinema: 'CINE',
  movie_theater: 'CINE',
  fast_food: 'COMIDA RÁPIDA',
  restaurant: 'RESTAURANTE',
  cafe: 'CAFETERÍA',
  mall: 'CENTRO COMERCIAL',
  shopping_mall: 'CENTRO COMERCIAL',
  department_store: 'TIENDA DEPARTAMENTAL',
  supermarket: 'SUPERMERCADO',
  convenience: 'TIENDA DE CONVENIENCIA',
  pharmacy: 'FARMACIA',
  hospital: 'HOSPITAL',
  clinic: 'CLÍNICA',
  school: 'ESCUELA',
  university: 'UNIVERSIDAD',
  bank: 'BANCO',
  fuel: 'GASOLINERA',
  hotel: 'HOTEL',
  park: 'PARQUE / PLAZA'
};

const BRAND_CANONICAL = {
  cinepolis: 'Cinépolis',
  'cinepolis vip': 'Cinépolis VIP',
  cinemex: 'Cinemex',
  kfc: 'KFC',
  'kentucky fried chicken': 'KFC',
  mcdonalds: "McDonald's",
  "mcdonald's": "McDonald's",
  'burger king': 'Burger King',
  'little caesars': 'Little Caesars',
  dominos: "Domino's Pizza",
  "domino's": "Domino's Pizza",
  subway: 'Subway',
  starbucks: 'Starbucks',
  oxxo: 'OXXO',
  walmart: 'Walmart',
  'bodega aurrera': 'Bodega Aurrera',
  soriana: 'Soriana',
  chedraui: 'Chedraui',
  costco: 'Costco',
  sams: "Sam's Club",
  "sam's club": "Sam's Club",
  'farmacias guadalajara': 'Farmacias Guadalajara',
  'farmacia guadalajara': 'Farmacias Guadalajara',
  'farmacias del ahorro': 'Farmacias del Ahorro',
  'farmacias similares': 'Farmacias Similares',
  sanborns: 'Sanborns',
  liverpool: 'Liverpool',
  sears: 'Sears',
  coppel: 'Coppel',
  elektra: 'Elektra',
  bbva: 'BBVA',
  banamex: 'Citibanamex',
  citibanamex: 'Citibanamex',
  santander: 'Santander',
  banorte: 'Banorte',
  hsbc: 'HSBC',
  scotiabank: 'Scotiabank',
  imss: 'IMSS',
  issste: 'ISSSTE'
};

const GENERIC_PREFIXES = new Set([
  'plaza', 'hospital', 'clinica', 'farmacia', 'farmacias', 'parque',
  'tienda', 'restaurante', 'cine', 'hotel', 'escuela', 'universidad', 'banco'
]);

export function getPlaceTypeLabel(type, source, categories = []) {
  const keys = [type, ...(Array.isArray(categories) ? categories : [categories])]
    .filter(Boolean)
    .map(k => String(k).toLowerCase().trim());

  for (const key of keys) {
    if (CATEGORY_MAP[key]) return CATEGORY_MAP[key];
    for (const [dictKey, label] of Object.entries(CATEGORY_MAP)) {
      if (key.includes(dictKey)) return label;
    }
  }
  return source === 'address' ? 'DIRECCIÓN' : 'ESTABLECIMIENTO';
}

function normalizeText(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTitleCase(str) {
  const minor = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'en', 'a']);
  return String(str || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word, idx) => {
      const lower = word.toLowerCase();
      if (idx > 0 && minor.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function formatUniformPlaceName(rawName, street, colonia, isPOI) {
  const cleanRaw = String(rawName || '').trim();
  if (!isPOI || !cleanRaw) return cleanRaw;

  const normRaw = normalizeText(cleanRaw);
  const sortedBrands = Object.keys(BRAND_CANONICAL).sort((a, b) => b.length - a.length);
  const matchedBrandKey = sortedBrands.find(
    b => normRaw === b || normRaw.startsWith(`${b} `)
  );

  const fallbackComplement = (colonia || street || '').trim();

  if (matchedBrandKey) {
    const canonicalBrand = BRAND_CANONICAL[matchedBrandKey];
    const normTokens = normRaw.split(' ');
    const brandTokens = matchedBrandKey.split(' ');
    const rawWords = cleanRaw.split(/\s+/);
    const suffixWords = rawWords.slice(brandTokens.length);
    const suffix = suffixWords.length > 0 ? toTitleCase(suffixWords.join(' ')) : '';

    if (suffix && normTokens.length > brandTokens.length) {
      return `${canonicalBrand} — ${suffix}`;
    }
    if (fallbackComplement) {
      return `${canonicalBrand} — ${toTitleCase(fallbackComplement)}`;
    }
    return canonicalBrand;
  }

  const wordCount = normRaw.split(' ').filter(Boolean).length;
  if (wordCount === 1 && fallbackComplement) {
    return `${toTitleCase(cleanRaw)} — ${toTitleCase(fallbackComplement)}`;
  }

  return cleanRaw;
}

function calcDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isSameLocation(a, b) {
  const dist = calcDistanceKm(a.lat, a.lng, b.lat, b.lng);
  if (dist < 0.06) return true;
  if (a.source === 'place' && b.source === 'place' && dist < 0.35) {
    const brandA = normalizeText(a.place_name).split(' ')[0];
    const brandB = normalizeText(b.place_name).split(' ')[0];
    if (brandA && brandA === brandB) return true;
  }
  return false;
}

async function fetchPhotonPOIs(query, proximity, signal, limit = 10) {
  const lat = proximity?.lat || MORELIA_CENTER.lat;
  const lng = proximity?.lng || MORELIA_CENTER.lng;
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=${lat}&lon=${lng}&bbox=${MORELIA_BBOX}&limit=${limit}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = await res.json();

  return (data.features || [])
    .map((f, idx) => {
      const p = f.properties || {};
      const [fLng, fLat] = f.geometry?.coordinates || [];
      if (!fLat || !fLng) return null;

      const rawName = p.name || [p.street, p.housenumber].filter(Boolean).join(' ');
      if (!rawName) return null;

      const streetLine = [p.street, p.housenumber].filter(Boolean).join(' ');
      const colonia = p.district || p.suburb || p.locality || '';
      const city = p.city || 'Morelia';
      const distNum = calcDistanceKm(lat, lng, fLat, fLng);
      const dist = distNum.toFixed(1);

      const isPOI = Boolean(
        p.name &&
        p.osm_value &&
        !['house', 'residential', 'service', 'unclassified', 'tertiary', 'secondary', 'primary', 'trunk', 'road'].includes(p.osm_value)
      );

      const uniformName = formatUniformPlaceName(rawName, streetLine, colonia, isPOI);

      const subtitleParts = [
        streetLine && streetLine !== rawName ? streetLine : '',
        colonia ? `Col. ${colonia}` : '',
        city,
        `a ${dist} km`
      ].filter(Boolean);

      return {
        id: `photon-${p.osm_id || idx}-${fLat.toFixed(5)}`,
        place_name: uniformName,
        subtitle: subtitleParts.join(' · '),
        lat: fLat,
        lng: fLng,
        type: p.osm_value || p.osm_key || 'poi',
        categories: [p.osm_value, p.osm_key].filter(Boolean),
        source: isPOI ? 'place' : 'address',
        _distKm: distNum
      };
    })
    .filter(Boolean);
}

async function fetchMapboxPlaces(query, proximity, mapboxToken, signal, mode, limit = 10) {
  if (!mapboxToken) return [];
  const lat = proximity?.lat || MORELIA_CENTER.lat;
  const lng = proximity?.lng || MORELIA_CENTER.lng;
  const types = mode === 'address-only'
    ? 'address,place,locality,neighborhood'
    : mode === 'poi-only'
      ? 'poi'
      : 'poi,address,place,locality,neighborhood';

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxToken}&country=mx&bbox=${MORELIA_BBOX}&proximity=${lng},${lat}&types=${types}&language=es&limit=${limit}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = await res.json();

  return (data.features || []).map((f) => {
    const [fLng, fLat] = f.center;
    const isPOI = f.place_type?.includes('poi');
    const neighborhoodCtx = (f.context || []).find(c => c.id.startsWith('neighborhood') || c.id.startsWith('locality'));
    const placeCtx = (f.context || []).find(c => c.id.startsWith('place'));
    const colonia = neighborhoodCtx?.text || '';
    const addressLine = f.properties?.address || '';
    const distNum = calcDistanceKm(lat, lng, fLat, fLng);
    const dist = distNum.toFixed(1);

    const rawName = f.text || f.place_name;
    const uniformName = formatUniformPlaceName(rawName, addressLine, colonia, isPOI);

    const subtitleParts = [
      addressLine,
      colonia ? `Col. ${colonia}` : '',
      placeCtx?.text || 'Morelia',
      `a ${dist} km`
    ].filter(Boolean);

    return {
      id: `mapbox-${f.id}`,
      place_name: uniformName,
      subtitle: subtitleParts.join(' · '),
      lat: fLat,
      lng: fLng,
      type: f.properties?.category || f.place_type?.[0] || 'place',
      categories: (f.properties?.category || '').split(',').map(s => s.trim()).filter(Boolean),
      source: isPOI ? 'place' : 'address',
      _distKm: distNum
    };
  });
}

async function fetchNominatimPOIs(query, proximity, signal) {
  const lat = proximity?.lat || MORELIA_CENTER.lat;
  const lng = proximity?.lng || MORELIA_CENTER.lng;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${query} Morelia`)}&format=jsonv2&addressdetails=1&viewbox=-101.35,19.80,-101.05,19.60&bounded=1&limit=8&accept-language=es`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = await res.json();

  return (Array.isArray(data) ? data : [])
    .map((item, idx) => {
      const fLat = parseFloat(item.lat);
      const fLng = parseFloat(item.lon);
      if (!Number.isFinite(fLat) || !Number.isFinite(fLng)) return null;

      const addr = item.address || {};
      const rawName = item.name || addr.amenity || addr.shop || addr.building || item.display_name?.split(',')[0];
      if (!rawName) return null;

      const streetLine = [addr.road, addr.house_number].filter(Boolean).join(' ');
      const colonia = addr.neighbourhood || addr.suburb || addr.quarter || '';
      const distNum = calcDistanceKm(lat, lng, fLat, fLng);
      const dist = distNum.toFixed(1);
      const isPOI = Boolean(item.name && item.category && !['highway', 'place', 'boundary'].includes(item.category));

      const uniformName = formatUniformPlaceName(rawName, streetLine, colonia, isPOI);
      const subtitleParts = [
        streetLine && streetLine !== rawName ? streetLine : '',
        colonia ? `Col. ${colonia}` : '',
        'Morelia',
        `a ${dist} km`
      ].filter(Boolean);

      return {
        id: `nom-${item.place_id || idx}-${fLat.toFixed(5)}`,
        place_name: uniformName,
        subtitle: subtitleParts.join(' · '),
        lat: fLat,
        lng: fLng,
        type: item.type || item.category || 'poi',
        categories: [item.type, item.category].filter(Boolean),
        source: isPOI ? 'place' : 'address',
        _distKm: distNum
      };
    })
    .filter(Boolean);
}

function scoreAndSort(items, normQuery, tokens) {
  return items
    .map((item) => {
      const normName = normalizeText(item.place_name);
      const normFull = normalizeText(`${item.place_name} ${item.subtitle}`);
      const matchedTokens = tokens.filter(t => normFull.includes(t)).length;
      const allMatched = tokens.length > 0 && matchedTokens === tokens.length;

      let score = 0;
      if (allMatched) score += 120;
      else score += matchedTokens * 25;

      if (normName === normQuery) score += 80;
      else if (normName.includes(normQuery)) score += 55;
      else if (tokens[0] && normName.startsWith(tokens[0])) score += 30;

      if (item.source === 'place') score += 35;
      score -= (item._distKm || 0) * 1.2;

      return { ...item, _score: score, _allMatched: allMatched };
    })
    .filter((item) => {
      if (tokens.length <= 1) return true;
      return item._allMatched || item._score >= 60;
    })
    .sort((a, b) => b._score - a._score)
    .map(({ _distKm, _score, _allMatched, ...clean }) => clean);
}

export async function searchPlaces(query, { proximity, mapboxToken, signal, mode = 'all' } = {}) {
  const cleanQuery = (query || '').trim();
  if (cleanQuery.length < 2) return { addresses: [], places: [] };

  const normQuery = normalizeText(cleanQuery);
  const tokens = normQuery.split(' ').filter(Boolean);
  const hasMultiWord = mode !== 'address-only' && tokens.length >= 2;
  const primaryQuery = hasMultiWord
    ? (GENERIC_PREFIXES.has(tokens[0]) ? tokens.slice(0, 2).join(' ') : tokens[0])
    : cleanQuery;

  const tasks = [
    mode === 'address-only' ? Promise.resolve([]) : fetchPhotonPOIs(cleanQuery, proximity, signal, 10).catch(() => []),
    fetchMapboxPlaces(cleanQuery, proximity, mapboxToken, signal, mode, 10).catch(() => [])
  ];

  if (hasMultiWord && primaryQuery !== normQuery) {
    tasks.push(fetchPhotonPOIs(primaryQuery, proximity, signal, 15).catch(() => []));
    tasks.push(fetchMapboxPlaces(primaryQuery, proximity, mapboxToken, signal, 'poi-only', 10).catch(() => []));
    tasks.push(fetchNominatimPOIs(cleanQuery, proximity, signal).catch(() => []));
  }

  const resultsArrays = await Promise.all(tasks);
  const merged = [];

  for (const list of resultsArrays) {
    for (const item of list) {
      const existingIdx = merged.findIndex(m => isSameLocation(m, item));
      if (existingIdx === -1) {
        merged.push(item);
      } else {
        const existing = merged[existingIdx];
        const existingHasDash = existing.place_name.includes('—');
        const currentHasDash = item.place_name.includes('—');
        if ((!existingHasDash && currentHasDash) || (item.subtitle.length > existing.subtitle.length && existingHasDash === currentHasDash)) {
          merged[existingIdx] = item;
        }
      }
    }
  }

  const rawPlaces = merged.filter(item => item.source === 'place');
  const rawAddresses = merged.filter(item => item.source !== 'place');

  return {
    places: scoreAndSort(rawPlaces, normQuery, tokens),
    addresses: scoreAndSort(rawAddresses, normQuery, tokens)
  };
}