export const CIUDAD = {
  nombre: 'Heroica Puebla de Zaragoza',
  nombreCorto: 'Puebla',
  estado: 'Puebla',
  pais: 'México',
  centro: { lat: 19.0438, lng: -98.1981 },
  radioKm: 25,
  bbox: [-98.35, 18.95, -98.05, 19.15]
};

export const MAPBOX_DEFAULTS = {
  country: 'mx',
  language: 'es',
  types: 'address,poi,place,locality,neighborhood'
};

export const PUEBLA = CIUDAD;

export function switchCiudad(config) {
  if (!config) return;
  Object.assign(CIUDAD, config);
  if (config.centro) {
    const { lat, lng } = config.centro;
    const dLat = 0.15;
    const dLng = 0.15;
    if (!config.bbox) CIUDAD.bbox = [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
  }
}

export function withinBBox(lng, lat, bbox = CIUDAD.bbox) {
  if (typeof lng !== 'number' || typeof lat !== 'number') return false;
  return lng >= bbox[0] && lat >= bbox[1] && lng <= bbox[2] && lat <= bbox[3];
}

export function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function dentroDeRadio(lat, lng, radioKm = CIUDAD.radioKm) {
  return distanciaKm(CIUDAD.centro.lat, CIUDAD.centro.lng, lat, lng) <= radioKm;
}