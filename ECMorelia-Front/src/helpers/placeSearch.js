const FALLBACK_REGION = {
  lat: 19.7024,
  lng: -101.1969,
  city: 'Morelia',
  state: 'Michoacán'
};

const REGION_CACHE_KEY = 'emergencity_detected_region_v1';
const REGION_CACHE_TTL_MS = 30 * 60 * 1000;

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

const STATE_ABBR_MAP = {
  pue: 'Puebla',
  mich: 'Michoacán',
  cdmx: 'Ciudad de México',
  df: 'Ciudad de México',
  edomex: 'Estado de México',
  mex: 'Estado de México',
  jal: 'Jalisco',
  nl: 'Nuevo León',
  gto: 'Guanajuato',
  qro: 'Querétaro',
  ver: 'Veracruz',
  tlax: 'Tlaxcala',
  mor: 'Morelia',
  hgo: 'Hidalgo',
  oax: 'Oaxaca',
  chis: 'Chiapas',
  tab: 'Tabasco',
  yuc: 'Yucatán',
  qroo: 'Quintana Roo',
  slp: 'San Luis Potosí',
  ags: 'Aguascalientes',
  zac: 'Zacatecas',
  dgo: 'Durango',
  coah: 'Coahuila',
  chih: 'Chihuahua',
  son: 'Sonora',
  sin: 'Sinaloa',
  nay: 'Nayarit',
  col: 'Colima',
  gro: 'Guerrero',
  camp: 'Campeche',
  tamps: 'Tamaulipas',
  bc: 'Baja California',
  bcs: 'Baja California Sur'
};

function buildBboxFromCenter(lat, lng) {
  const minLng = Number((lng - 0.20).toFixed(4));
  const minLat = Number((lat - 0.16).toFixed(4));
  const maxLng = Number((lng + 0.20).toFixed(4));
  const maxLat = Number((lat + 0.16).toFixed(4));
  return {
    bboxStr: `${minLng},${minLat},${maxLng},${maxLat}`,
    viewboxStr: `${minLng},${maxLat},${maxLng},${minLat}`
  };
}

export function getCachedRegion() {
  try {
    const raw = sessionStorage.getItem(REGION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng)) {
      return {
        ...parsed,
        ...buildBboxFromCenter(parsed.lat, parsed.lng)
      };
    }
  } catch (_) {}
  return null;
}

function saveCachedRegion(region) {
  try {
    sessionStorage.setItem(REGION_CACHE_KEY, JSON.stringify({
      ...region,
      timestamp: Date.now()
    }));
  } catch (_) {}
}

export async function resolveRegionFromCoords(lat, lng, mapboxToken) {
  let city = '';
  let state = '';

  if (mapboxToken) {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&types=place,region&language=es&limit=2`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const features = data.features || [];
        const placeFeat = features.find(f => f.place_type?.includes('place'));
        const regionFeat = features.find(f => f.place_type?.includes('region'));
        city = placeFeat?.text || '';
        state = regionFeat?.text || '';
        if (!state && placeFeat?.context) {
          const ctxReg = placeFeat.context.find(c => c.id.startsWith('region'));
          if (ctxReg) state = ctxReg.text;
        }
      }
    } catch (_) {}
  }

  if (!city) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&zoom=10&accept-language=es`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const addr = data.address || {};
        city = addr.city || addr.town || addr.municipality || addr.county || '';
        state = state || addr.state || '';
      }
    } catch (_) {}
  }

  const region = {
    lat,
    lng,
    city: city || FALLBACK_REGION.city,
    state: state || FALLBACK_REGION.state,
    ...buildBboxFromCenter(lat, lng)
  };
  saveCachedRegion(region);
  return region;
}

export async function detectCurrentRegion({ mapboxToken, fallbackCenter } = {}) {
  const cached = getCachedRegion();
  if (cached && cached.timestamp && Date.now() - cached.timestamp < REGION_CACHE_TTL_MS) {
    return cached;
  }

  const getPosition = () =>
    new Promise((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        reject(new Error('Geolocation unavailable'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(err),
        { enableHighAccuracy: false, timeout: 5500, maximumAge: 300000 }
      );
    });

  try {
    const coords = await getPosition();
    return await resolveRegionFromCoords(coords.lat, coords.lng, mapboxToken);
  } catch (_) {
    if (fallbackCenter && Number.isFinite(fallbackCenter.lat) && Number.isFinite(fallbackCenter.lng)) {
      return await resolveRegionFromCoords(fallbackCenter.lat, fallbackCenter.lng, mapboxToken);
    }
    if (cached) return cached;
    return {
      ...FALLBACK_REGION,
      ...buildBboxFromCenter(FALLBACK_REGION.lat, FALLBACK_REGION.lng)
    };
  }
}

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

export function cleanMexicanAddress(rawAddress) {
  let cleaned = String(rawAddress || '').trim();
  if (!cleaned) return '';

  cleaned = cleaned
    .replace(/,?\s*zona sin asignaci[oó]n de nombre de col(?:onia)?\.?\s*\d*/gi, '')
    .replace(/\bNte\.?(?=\s|,|$)/gi, 'Norte')
    .replace(/\bOte\.?(?=\s|,|$)/gi, 'Oriente')
    .replace(/\bPte\.?(?=\s|,|$)/gi, 'Poniente')
    .replace(/\bAv\.?(?=\s)/gi, 'Avenida')
    .replace(/\bBlvd\.?(?=\s)/gi, 'Boulevard')
    .replace(/\bCalz\.?(?=\s)/gi, 'Calzada')
    .replace(/\bProl\.?(?=\s)/gi, 'Prolongación')
    .replace(/\bFracc?\.?(?=\s)/gi, 'Fraccionamiento')
    .replace(/\bCol\.?(?=\s)/gi, 'Colonia')
    .replace(/,\s*([A-Za-zÁÉÍÓÚÑáéíóúñ]{2,6})\.?\s*$/g, (_, abbr) => {
      const key = normalizeText(abbr);
      return STATE_ABBR_MAP[key] ? `, ${STATE_ABBR_MAP[key]}` : `, ${abbr}`;
    })
    .replace(/\s+,/g, ',')
    .replace(/,\s*,+/g, ',')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

function parseAddressComponents(cleanedAddress) {
  const parts = cleanedAddress.split(',').map(p => p.trim()).filter(Boolean);
  const firstSegment = parts[0] || '';
  const numMatch = firstSegment.match(/^(.*?)\s+(?:no\.?\s*|num\.?\s*|#\s*)?(\d+[a-zA-Z]?)(?:\s|$)/i);

  const street = numMatch ? numMatch[1].trim() : firstSegment;
  const houseNumber = numMatch ? numMatch[2].trim() : '';

  const cpMatch = cleanedAddress.match(/\b(\d{5})\b/);
  const postalCode = cpMatch ? cpMatch[1] : '';

  let neighborhood = '';
  let city = '';
  let state = '';

  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    const normSeg = normalizeText(seg);
    if (!seg) continue;

    if (postalCode && seg.includes(postalCode)) {
      const withoutCp = seg.replace(postalCode, '').trim();
      if (withoutCp && !city) city = withoutCp;
      continue;
    }

    if (i === parts.length - 1 && parts.length >= 3) {
      state = seg;
      continue;
    }

    if (!neighborhood && (normSeg.startsWith('barrio') || normSeg.startsWith('colonia') || normSeg.startsWith('fraccionamiento') || normSeg.startsWith('unidad') || i === 1)) {
      neighborhood = seg.replace(/^(?:colonia|col\.?)\s+/i, '').trim();
      continue;
    }

    if (!city) {
      city = seg;
    }
  }

  if (normalizeText(city).includes('puebla')) city = 'Puebla';
  if (normalizeText(city).includes('morelia')) city = 'Morelia';

  return { street, houseNumber, postalCode, neighborhood, city, state };
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

export async function geocodeExactAddress(rawAddress, { mapboxToken, proximity, regionHint } = {}) {
  const cleaned = cleanMexicanAddress(rawAddress);
  if (!cleaned) return null;

  const parsed = parseAddressComponents(cleaned);
  const activeRegion = regionHint || getCachedRegion();
  const effectiveCity = parsed.city || activeRegion?.city || '';
  const effectiveState = parsed.state || activeRegion?.state || '';

  const fullQuery = effectiveCity && !normalizeText(cleaned).includes(normalizeText(effectiveCity))
    ? `${cleaned}, ${effectiveCity}${effectiveState ? `, ${effectiveState}` : ''}, México`
    : `${cleaned}, México`;

  const targetedStreetQuery = parsed.street
    ? [
        `${parsed.street}${parsed.houseNumber ? ` ${parsed.houseNumber}` : ''}`,
        parsed.postalCode,
        effectiveCity,
        effectiveState,
        'México'
      ].filter(Boolean).join(', ')
    : '';

  const proxParam = proximity && Number.isFinite(proximity.lng) && Number.isFinite(proximity.lat)
    ? `&proximity=${proximity.lng},${proximity.lat}`
    : (activeRegion && !parsed.city ? `&proximity=${activeRegion.lng},${activeRegion.lat}` : '');

  const candidates = [];
  const tasks = [];

  if (mapboxToken) {
    const fetchMb = async (qStr, types, weightBonus) => {
      if (!qStr) return;
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(qStr)}.json?access_token=${mapboxToken}&country=mx&types=${types}&routing=true&language=es&limit=5${proxParam}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      (data.features || []).forEach((f, idx) => {
        const routable = f.routable_points?.points?.[0]?.coordinates;
        const coords = Array.isArray(routable) && routable.length >= 2 ? routable : f.center;
        if (!coords) return;
        candidates.push({
          lat: coords[1],
          lng: coords[0],
          place_name: f.place_name || cleaned,
          housenumber: f.address || '',
          street: f.text || '',
          postalCode: (f.context || []).find(c => c.id.startsWith('postcode'))?.text || '',
          neighborhood: (f.context || []).find(c => c.id.startsWith('neighborhood') || c.id.startsWith('locality'))?.text || '',
          city: (f.context || []).find(c => c.id.startsWith('place'))?.text || '',
          placeType: f.place_type?.[0] || '',
          relevance: f.relevance || 0,
          weightBonus: weightBonus - idx * 3,
          source: 'mapbox'
        });
      });
    };

    tasks.push(fetchMb(fullQuery, 'address,poi', 25).catch(() => {}));
    if (targetedStreetQuery && targetedStreetQuery !== fullQuery) {
      tasks.push(fetchMb(targetedStreetQuery, 'address', 30).catch(() => {}));
    }
  }

  if (parsed.street) {
    tasks.push((async () => {
      const params = new URLSearchParams({
        street: parsed.houseNumber ? `${parsed.houseNumber} ${parsed.street}` : parsed.street,
        country: 'Mexico',
        format: 'jsonv2',
        addressdetails: '1',
        limit: '5',
        'accept-language': 'es'
      });
      if (parsed.postalCode) params.set('postalcode', parsed.postalCode);
      if (effectiveCity) params.set('city', effectiveCity);
      if (effectiveState) params.set('state', effectiveState);

      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      (Array.isArray(data) ? data : []).forEach((item, idx) => {
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const addr = item.address || {};
        candidates.push({
          lat,
          lng,
          place_name: item.display_name || cleaned,
          housenumber: addr.house_number || '',
          street: addr.road || '',
          postalCode: addr.postcode || '',
          neighborhood: addr.neighbourhood || addr.suburb || addr.quarter || '',
          city: addr.city || addr.town || addr.municipality || '',
          placeType: item.type || item.category || '',
          relevance: 0.9,
          weightBonus: 35 - idx * 3,
          source: 'nominatim_structured'
        });
      });
    })().catch(() => {}));
  }

  tasks.push((async () => {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(fullQuery)}&format=jsonv2&addressdetails=1&limit=5&accept-language=es`);
    if (!res.ok) return;
    const data = await res.json();
    (Array.isArray(data) ? data : []).forEach((item, idx) => {
      const lat = parseFloat(item.lat);
      const lng = parseFloat(item.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const addr = item.address || {};
      candidates.push({
        lat,
        lng,
        place_name: item.display_name || cleaned,
        housenumber: addr.house_number || '',
        street: addr.road || '',
        postalCode: addr.postcode || '',
        neighborhood: addr.neighbourhood || addr.suburb || addr.quarter || '',
        city: addr.city || addr.town || addr.municipality || '',
        placeType: item.type || item.category || '',
        relevance: 0.85,
        weightBonus: 20 - idx * 3,
        source: 'nominatim'
      });
    });
  })().catch(() => {}));

  await Promise.all(tasks);
  if (candidates.length === 0) return null;

  const normStreetTokens = normalizeText(parsed.street).split(' ').filter(Boolean);
  const normHouse = normalizeText(parsed.houseNumber);
  const normNeighborhood = normalizeText(parsed.neighborhood);
  const normCity = normalizeText(effectiveCity);

  let best = null;
  let bestScore = -Infinity;

  for (const c of candidates) {
    let score = (c.weightBonus || 0) + (c.relevance || 0) * 30;
    const normCandFull = normalizeText(`${c.street} ${c.housenumber} ${c.place_name}`);
    const normCandStreet = normalizeText(c.street || c.place_name);
    const normCandHouse = normalizeText(c.housenumber);

    if (normHouse) {
      if (normCandHouse === normHouse) score += 160;
      else if (new RegExp(`\\b${normHouse}\\b`).test(normCandFull)) score += 120;
    }

    if (normStreetTokens.length > 0) {
      const matched = normStreetTokens.filter(t => normCandStreet.includes(t) || normCandFull.includes(t)).length;
      score += (matched / normStreetTokens.length) * 110;
    }

    if (parsed.postalCode && String(c.postalCode || c.place_name).includes(parsed.postalCode)) {
      score += 95;
    }

    if (normNeighborhood && normalizeText(`${c.neighborhood} ${c.place_name}`).includes(normNeighborhood)) {
      score += 55;
    }

    if (normCity && normalizeText(`${c.city} ${c.place_name}`).includes(normCity)) {
      score += 45;
    }

    if (['address', 'house', 'building', 'residential', 'yes'].includes(c.placeType)) {
      score += 50;
    }

    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  return best ? { lat: best.lat, lng: best.lng, place_name: best.place_name } : null;
}

async function fetchPhotonPOIs(query, proximity, region, signal, limit = 10) {
  const lat = proximity?.lat || region.lat;
  const lng = proximity?.lng || region.lng;
  const { bboxStr } = buildBboxFromCenter(lat, lng);
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=${lat}&lon=${lng}&bbox=${bboxStr}&limit=${limit}`;
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
      const city = p.city || region.city;
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

async function fetchMapboxPlaces(query, proximity, region, mapboxToken, signal, mode, limit = 10) {
  if (!mapboxToken) return [];
  const lat = proximity?.lat || region.lat;
  const lng = proximity?.lng || region.lng;
  const { bboxStr } = buildBboxFromCenter(lat, lng);
  const types = mode === 'address-only'
    ? 'address,place,locality,neighborhood'
    : mode === 'poi-only'
      ? 'poi'
      : 'poi,address,place,locality,neighborhood';

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxToken}&country=mx&bbox=${bboxStr}&proximity=${lng},${lat}&types=${types}&routing=true&language=es&limit=${limit}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = await res.json();

  return (data.features || []).map((f) => {
    const routable = f.routable_points?.points?.[0]?.coordinates;
    const [fLng, fLat] = Array.isArray(routable) && routable.length >= 2 ? routable : f.center;
    const isPOI = f.place_type?.includes('poi');
    const neighborhoodCtx = (f.context || []).find(c => c.id.startsWith('neighborhood') || c.id.startsWith('locality'));
    const placeCtx = (f.context || []).find(c => c.id.startsWith('place'));
    const colonia = neighborhoodCtx?.text || '';
    const streetNum = f.address || '';
    const addressLine = [f.properties?.address || (!isPOI ? f.text : ''), streetNum].filter(Boolean).join(' ');
    const distNum = calcDistanceKm(lat, lng, fLat, fLng);
    const dist = distNum.toFixed(1);

    const rawName = !isPOI && streetNum ? `${f.text} ${streetNum}` : (f.text || f.place_name);
    const uniformName = formatUniformPlaceName(rawName, addressLine, colonia, isPOI);

    const subtitleParts = [
      addressLine && addressLine !== rawName ? addressLine : '',
      colonia ? `Col. ${colonia}` : '',
      placeCtx?.text || region.city,
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

async function fetchNominatimPOIs(query, proximity, region, signal) {
  const lat = proximity?.lat || region.lat;
  const lng = proximity?.lng || region.lng;
  const { viewboxStr } = buildBboxFromCenter(lat, lng);
  const cityLabel = region.city || '';
  const searchQuery = cityLabel && !normalizeText(query).includes(normalizeText(cityLabel))
    ? `${query} ${cityLabel}`
    : query;

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=jsonv2&addressdetails=1&viewbox=${viewboxStr}&bounded=1&limit=8&accept-language=es`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = await res.json();

  return (Array.isArray(data) ? data : [])
    .map((item, idx) => {
      const fLat = parseFloat(item.lat);
      const fLng = parseFloat(item.lon);
      if (!Number.isFinite(fLat) || !Number.isFinite(fLng)) return null;

      const addr = item.address || {};
      const streetWithNum = [addr.road, addr.house_number].filter(Boolean).join(' ');
      const rawName = item.name || streetWithNum || addr.amenity || addr.shop || addr.building || item.display_name?.split(',')[0];
      if (!rawName) return null;

      const colonia = addr.neighbourhood || addr.suburb || addr.quarter || '';
      const distNum = calcDistanceKm(lat, lng, fLat, fLng);
      const dist = distNum.toFixed(1);
      const isPOI = Boolean(item.name && item.category && !['highway', 'place', 'boundary', 'building'].includes(item.category));

      const uniformName = formatUniformPlaceName(rawName, streetWithNum, colonia, isPOI);
      const subtitleParts = [
        streetWithNum && streetWithNum !== rawName ? streetWithNum : '',
        colonia ? `Col. ${colonia}` : '',
        addr.city || addr.town || cityLabel,
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

export async function searchPlaces(query, { proximity, mapboxToken, signal, mode = 'all', region } = {}) {
  const rawInput = (query || '').trim();
  if (rawInput.length < 2) return { addresses: [], places: [] };

  const cleanQuery = cleanMexicanAddress(rawInput);
  const activeRegion = region || getCachedRegion() || {
    ...FALLBACK_REGION,
    ...buildBboxFromCenter(FALLBACK_REGION.lat, FALLBACK_REGION.lng)
  };

  const normQuery = normalizeText(cleanQuery);
  const tokens = normQuery.split(' ').filter(Boolean);
  const hasDigits = /\d/.test(cleanQuery);
  const hasMultiWord = mode !== 'address-only' && !hasDigits && tokens.length >= 2;
  const primaryQuery = hasMultiWord
    ? (GENERIC_PREFIXES.has(tokens[0]) ? tokens.slice(0, 2).join(' ') : tokens[0])
    : cleanQuery;

  const tasks = [
    mode === 'address-only' ? Promise.resolve([]) : fetchPhotonPOIs(cleanQuery, proximity, activeRegion, signal, 10).catch(() => []),
    fetchMapboxPlaces(cleanQuery, proximity, activeRegion, mapboxToken, signal, mode, 10).catch(() => [])
  ];

  if (hasDigits) {
    tasks.push(fetchNominatimPOIs(cleanQuery, proximity, activeRegion, signal).catch(() => []));
  } else if (hasMultiWord && primaryQuery !== normQuery) {
    tasks.push(fetchPhotonPOIs(primaryQuery, proximity, activeRegion, signal, 15).catch(() => []));
    tasks.push(fetchMapboxPlaces(primaryQuery, proximity, activeRegion, mapboxToken, signal, 'poi-only', 10).catch(() => []));
    tasks.push(fetchNominatimPOIs(cleanQuery, proximity, activeRegion, signal).catch(() => []));
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