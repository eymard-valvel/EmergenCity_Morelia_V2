// ws-core.js — Núcleo del WebSocket (compartido por main.js y websocket-server.js)
// v3: heartbeat robusto, case recovery, disconnection handling

const WebSocket = require('ws');
const fetch = require('node-fetch');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const crypto = require('crypto');
const PROTOCOL_VERSION = 3;
const MAPBOX_TOKEN =
  process.env.MAPBOX_TOKEN ||
  'pk.eyJ1IjoiZXltYXJkMjkiLCJhIjoiY21tcDY4YzNpMGw3bjJzb203YmZyNTVnMyJ9.OvZlnCMfUkUYe6Ib83DUVw';

const DEFAULT_LOCATION = { lat: 19.7024, lng: -101.1969 };
const OFFER_TIMEOUT_MS = 20_000;
const LOCATION_BROADCAST_THROTTLE_MS = 2_000;

// Soft inactivity: si el WS está vivo, NO borrar la ambulancia por estos ms.
const SOFT_INACTIVITY_MS = 15 * 60 * 1000;

// Hard inactivity: si el WS está muerto Y no hay heartbeat por estos ms, borrar.
const HARD_INACTIVITY_MS = 30 * 60 * 1000;

// Ping server → cliente cada 25s (mantiene viva la conexión en NAT/proxies).
const SERVER_PING_INTERVAL_MS = 25_000;

// ============ ESTADO (singleton) ============
const activeAmbulances = new Map();
const activeHospitals = new Map();
const activeReceptors = new Map();
const activeParamedics = new Map();
const activeDoctors = new Map();
const activeEmergencies = new Map();
const pendingOffers = new Map();
const activeRoutes = new Map();
const pendingNotifications = new Map();
const pendingEmergencyRoutes = new Map();
const rejectedHospitals = new Map();
const rejectedAmbulances = new Map();
const prehospitalReports = new Map();
const videoCallSessions = new Map();
const geocodeCache = new Map();
const lastLocationBroadcast = new Map();

let currentWss = null;

function generateCallId(origin = 'receptor') {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = crypto.randomBytes(8).toString('hex').toUpperCase();
  // F   = Folio de emergencia detonada por RECEPTOR (formulario de despacho)
  // OP  = Folio de emergencia detonada por OPERADOR (MapaOperador)
  const prefix = origin === 'operator' ? 'OP' : 'F';
  return `${prefix}-${y}${m}${d}-${rand}`;
}

function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

// ============ UTILIDADES ============
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sendMessage(ws, message) {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      return true;
    }
  } catch (e) {
    console.error('[ws] Error enviando:', e.message);
  }
  return false;
}

function sendError(ws, message, code = 'ERROR') {
  sendMessage(ws, { type: 'error', code, message, timestamp: new Date().toISOString() });
}

function broadcastToAll(message) {
  if (!currentWss) return;
  const str = JSON.stringify(message);
  currentWss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) {
      try { c.send(str); } catch (_) {}
    }
  });
}
function broadcastToMap(map, message) {
  const str = JSON.stringify(message);
  map.forEach(entry => {
    if (entry.ws && entry.ws.readyState === WebSocket.OPEN) {
      try { entry.ws.send(str); } catch (_) {}
    }
  });
}
const broadcastToAmbulances = m => broadcastToMap(activeAmbulances, m);
const broadcastToHospitals  = m => broadcastToMap(activeHospitals, m);
const broadcastToReceptors  = m => broadcastToMap(activeReceptors, m);
const broadcastToParamedics = m => broadcastToMap(activeParamedics, m);
const broadcastToDoctors    = m => broadcastToMap(activeDoctors, m);

// ============ LIVENESS ============
/**
 * Marca el WS como vivo. Actualiza lastUpdate del registro correspondiente.
 * Se ejecuta en CADA mensaje entrante — así no hace falta depender solo de
 * location_update para mantener viva la ambulancia.
 */
function touchConnection(ws) {
  ws._lastHeartbeat = Date.now();
  const role = ws._role;
  if (role === 'ambulance' && ws._ambulanceId) {
    const amb = activeAmbulances.get(ws._ambulanceId);
    if (amb) amb.lastUpdate = new Date();
  } else if (role === 'hospital' && ws._hospitalId) {
    const h = activeHospitals.get(ws._hospitalId);
    if (h) h.lastUpdate = new Date();
  } else if (role === 'paramedic' && ws._paramedicId) {
    const p = activeParamedics.get(ws._paramedicId);
    if (p) p.lastUpdate = new Date();
  } else if (role === 'doctor' && ws._doctorId) {
    const d = activeDoctors.get(ws._doctorId);
    if (d) d.lastUpdate = new Date();
  } else if (role === 'receptor' && ws._receptorId) {
    const r = activeReceptors.get(ws._receptorId);
    if (r) r.lastUpdate = new Date();
  }
}

// ============ HELPERS DE CASO ACTIVO ============
/** Devuelve la emergencia asignada a esta ambulancia (o null). */
function getCaseForAmbulance(ambulanceId) {
  if (!ambulanceId) return null;
  for (const [, em] of activeEmergencies) {
    if (em.assignedAmbulanceId === String(ambulanceId)) return em;
  }
  return null;
}

/** Devuelve la ruta activa (cacheada) para una ambulancia. */
function getRouteForAmbulance(ambulanceId) {
  if (!ambulanceId) return null;
  for (const [, route] of activeRoutes) {
    if (route.ambulanceId === String(ambulanceId)) return route;
  }
  return null;
}

/** Devuelve las notificaciones pendientes dirigidas a un hospital. */
function getPendingNotificationsForHospital(hospitalId) {
  const arr = [];
  for (const [, n] of pendingNotifications) {
    if (String(n.hospitalId) === String(hospitalId)) arr.push(n);
  }
  return arr;
}

/** Devuelve la notificación pendiente que tiene esa ambulancia como emisora. */
function getPendingNotificationForAmbulance(ambulanceId) {
  for (const [, n] of pendingNotifications) {
    if (String(n.ambulanceId) === String(ambulanceId)) return n;
  }
  return null;
}

// ============ HELPERS DE HOSPITAL ============
/** Devuelve los casos activos de un hospital (pendientes + ya aceptados). */
function getHospitalActiveCases(hospitalId) {
  const cases = [];
  const seen = new Set();

  // Casos pendientes (notificaciones sin aceptar)
  for (const [, n] of pendingNotifications) {
    if (String(n.hospitalId) === String(hospitalId)) {
      cases.push({
        callId: n.callId,
        ambulanceId: n.ambulanceId,
        ambulanceName: n.ambulanceName,
        emergencyType: n.emergencyType,
        patientInfo: n.patientInfo,
        distanceKm: n.distanceKm,
        isFinal: false,
        status: 'pending'
      });
      seen.add(n.callId);
    }
  }

  // Casos ya aceptados (rutas activas hacia este hospital)
  for (const [, r] of activeRoutes) {
    if (String(r.hospitalId) === String(hospitalId) && !seen.has(r.callId)) {
      cases.push({
        callId: r.callId,
        ambulanceId: r.ambulanceId,
        hospitalId: r.hospitalId,
        distance: r.distance,
        duration: r.duration,
        isFinal: false,
        status: 'accepted'
      });
      seen.add(r.callId);
    }
  }

  return cases;
}

/** Envía la lista completa de casos activos a un hospital. */
function sendHospitalActiveCases(hospitalId) {
  const h = activeHospitals.get(String(hospitalId));
  if (!h?.ws || h.ws.readyState !== WebSocket.OPEN) return;
  sendMessage(h.ws, {
    type: 'hospital_active_cases_update',
    cases: getHospitalActiveCases(hospitalId),
    timestamp: new Date().toISOString()
  });
}

// ============ GEOCODING ============
async function geocodeAddress(address) {
  if (!address || address.trim() === '') return null;
  const clean = address.trim().toLowerCase();
  if (geocodeCache.has(clean)) return geocodeCache.get(clean);
  try {
    const queryBase = clean.includes('méxico') || clean.includes('mexico') ? clean : `${clean}, México`;
    const q = encodeURIComponent(queryBase);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${MAPBOX_TOKEN}&country=mx&types=address,poi&limit=1&language=es`;
    const r = await fetch(url);
    if (r.ok) {
      const d = await r.json();
      if (d.features?.length) {
        const best = d.features[0];
        const result = { lat: best.center[1], lng: best.center[0], place_name: best.place_name, address: best.place_name };
        geocodeCache.set(clean, result);
        return result;
      }
    }
    const nQ = encodeURIComponent(`${clean}, Michoacán, México`);
    const r2 = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${nQ}&countrycodes=mx&limit=1`);
    if (r2.ok) {
      const d2 = await r2.json();
      if (d2.length) {
        const result = {
          lat: parseFloat(d2[0].lat),
          lng: parseFloat(d2[0].lon),
          place_name: d2[0].display_name,
          address: d2[0].display_name
        };
        geocodeCache.set(clean, result);
        return result;
      }
    }
  } catch (e) {
    console.error('💥 Error geocoding:', e.message);
  }
  return null;
}

async function getHospitalsList() {
  const list = [];
  activeHospitals.forEach((h, id) => {
    list.push({
      id,
      nombre: h.info.nombre || `Hospital ${id}`,
      direccion: h.info.direccion || '',
      lat: h.info.lat ?? DEFAULT_LOCATION.lat,
      lng: h.info.lng ?? DEFAULT_LOCATION.lng,
      especialidades: h.info.especialidades || ['General'],
      camasDisponibles: h.info.camasDisponibles ?? 10,
      camasEmergencia: h.info.camasEmergencia ?? h.info.camasDisponibles ?? 10,
      telefono: h.info.telefono || '',
      connected: true,
      activo: true,
      status: 'active'
    });
  });
  try {
    const dbHospitals = await prisma.hospitales.findMany({
      select: { id_hospitales: true, nombre: true, direccion: true }
    });
    dbHospitals.forEach(h => {
      const id = String(h.id_hospitales);
      if (!activeHospitals.has(id)) {
        list.push({
          id,
          nombre: h.nombre || `Hospital ${id}`,
          direccion: h.direccion || '',
          lat: null, lng: null,
          especialidades: ['General'],
          camasDisponibles: 10,
          camasEmergencia: 10,
          telefono: '',
          connected: false,
          activo: true,
          status: 'inactive'
        });
      }
    });
  } catch (e) {
    console.warn('[hospitales] DB no disponible:', e.message);
  }
  return list;
}

// ============ ASIGNACIÓN ============
function findNearestAvailableAmbulance(location, excludeIds = new Set()) {
  let best = null, bestDist = Infinity;
  for (const [, amb] of activeAmbulances) {
    if (amb.status !== 'disponible' && amb.status !== 'fuera_de_servicio') continue;
    if (!amb.location) continue;
    if (excludeIds.has(amb.id)) continue;
    const d = calculateDistance(location.lat, location.lng, amb.location.lat, amb.location.lng);
    if (d < bestDist) { bestDist = d; best = amb; }
  }
  return best ? { ambulance: best, distanceKm: bestDist } : null;
}

function findNearestConnectedHospital(location, excludeIds = new Set()) {
  if (!location?.lat || !location?.lng) return null;
  let best = null;
  let bestDist = Infinity;
  for (const [, h] of activeHospitals) {
    if (h.ws?.readyState !== WebSocket.OPEN) continue;
    if (h.info.activo === false) continue;
    if (excludeIds.has(h.info.id)) continue;
    const camas = h.info.camasEmergencia ?? h.info.camasDisponibles ?? 0;
    if (camas <= 0) continue;
    if (!h.info.lat || !h.info.lng) continue;
    const d = calculateDistance(location.lat, location.lng, h.info.lat, h.info.lng);
    if (d < bestDist) { bestDist = d; best = h; }
  }
  return best ? { hospital: best, distanceKm: bestDist } : null;
}

function emitEmergencyOffer(emergency, ambulance, excludedIds = new Set()) {
  const offerId = generateId('offer');
  const isStandby = ambulance.status === 'fuera_de_servicio';
  const payload = {
    type: 'emergency_offer',
    offerId,
    callId: emergency.callId,
    location: emergency.location,
    address: emergency.address,
    emergencyType: emergency.emergencyType,
    patientInfo: emergency.patientInfo,
    notes: emergency.notes,
    distanceKm: ambulance.location
      ? calculateDistance(emergency.location.lat, emergency.location.lng, ambulance.location.lat, ambulance.location.lng)
      : null,
    expiresInMs: OFFER_TIMEOUT_MS,
    isStandby,
    timestamp: new Date().toISOString(),
    correlationId: emergency.correlationId
  };
  sendMessage(ambulance.ws, payload);

  const timer = setTimeout(() => {
    if (!pendingOffers.has(offerId)) return;
    pendingOffers.delete(offerId);
    console.log(`⏱️ Oferta ${offerId} expirada (standby=${isStandby})`);
    if (!isStandby) {
      acceptEmergencyOffer(offerId, true);
    } else {
      rejectEmergencyOffer(offerId, 'Standby sin respuesta');
    }
  }, OFFER_TIMEOUT_MS);

  pendingOffers.set(offerId, {
    offerId, callId: emergency.callId, ambulanceId: ambulance.id,
    ws: ambulance.ws, timer, excludedIds, isStandby
  });
}

function acceptEmergencyOffer(offerId, auto = false) {
  const offer = pendingOffers.get(offerId);
  if (!offer) return;
  clearTimeout(offer.timer);
  pendingOffers.delete(offerId);

  const emergency = activeEmergencies.get(offer.callId);
  if (!emergency) return;
  const ambulance = activeAmbulances.get(offer.ambulanceId);
  if (!ambulance) return;

  emergency.status = 'assigned';
  emergency.assignedAmbulanceId = ambulance.id;
  emergency.assignedAmbulanceName = ambulance.nombre || ambulance.placa;
  emergency.assignedAt = new Date().toISOString();
  emergency.autoAssigned = auto;
  activeEmergencies.set(emergency.callId, emergency);
  ambulance.status = 'en_ruta';

  sendMessage(ambulance.ws, {
    type: 'new_emergency_assigned',
    callId: emergency.callId,
    location: emergency.location,
    address: emergency.address,
    emergencyType: emergency.emergencyType,
    patientInfo: emergency.patientInfo,
    notes: emergency.notes,
    timestamp: emergency.timestamp,
    assignedAt: emergency.assignedAt,
    autoAssigned: auto,
    correlationId: emergency.correlationId
  });

  const pairedAm = Array.from(activeParamedics.values())
    .find(p => p.ambulanceId === String(ambulance.id));
  if (pairedAm?.ws) {
    sendMessage(pairedAm.ws, {
      type: 'emergency_case_received',
      callId: emergency.callId,
      address: emergency.address,
      emergencyType: emergency.emergencyType,
      notes: emergency.notes,
      patientInfo: emergency.patientInfo,
      risks: emergency.risks || [],
      timestamp: new Date().toISOString()
    });
  }

  if (emergency.receptorWs) {
    sendMessage(emergency.receptorWs, {
      type: 'emergency_assigned_ack',
      callId: emergency.callId,
      ambulanceId: ambulance.id,
      ambulanceName: ambulance.nombre || ambulance.placa,
      assignedAt: emergency.assignedAt,
      message: `Ambulancia ${ambulance.nombre || ambulance.id} asignada`,
      correlationId: emergency.correlationId
    });
  }

  broadcastToReceptors({
    type: 'emergency_assigned_broadcast',
    callId: emergency.callId,
    ambulanceId: ambulance.id,
    ambulanceName: ambulance.nombre || ambulance.placa,
    emergencyType: emergency.emergencyType,
    address: emergency.address,
    assignedAt: emergency.assignedAt,
    timestamp: new Date().toISOString(),
    correlationId: emergency.correlationId
  });

  broadcastActiveEmergencies();
  broadcastActiveAmbulances();
}

function rejectEmergencyOffer(offerId, reason = 'No especificado') {
  const offer = pendingOffers.get(offerId);
  if (!offer) return;
  clearTimeout(offer.timer);
  pendingOffers.delete(offerId);

  const emergency = activeEmergencies.get(offer.callId);
  if (!emergency) return;

  const excluded = offer.excludedIds || new Set();
  excluded.add(offer.ambulanceId);
  console.log(`🚫 Ambulancia ${offer.ambulanceId} rechazó (${reason}). Excluidas: ${[...excluded].join(',')}`);

  const next = findNearestAvailableAmbulance(emergency.location, excluded);
  if (next) {
    emergency.status = 'offering';
    activeEmergencies.set(emergency.callId, emergency);
    emitEmergencyOffer(emergency, next.ambulance, excluded);
  } else {
    emergency.status = 'pending_no_ambulance';
    emergency.assignedAmbulanceId = null;
    activeEmergencies.set(emergency.callId, emergency);
    if (emergency.receptorWs) {
      sendMessage(emergency.receptorWs, {
        type: 'emergency_assignment_failed',
        callId: emergency.callId,
        message: 'No hay ambulancias disponibles. En espera.',
        correlationId: emergency.correlationId
      });
    }
    broadcastToReceptors({
      type: 'emergency_pending_broadcast',
      callId: emergency.callId,
      emergencyType: emergency.emergencyType,
      address: emergency.address,
      message: 'Emergencia sin ambulancia — en espera',
      timestamp: new Date().toISOString()
    });
  }
  broadcastActiveEmergencies();
}

function serializeEmergency(e) {
  return {
    callId: e.callId, location: e.location, address: e.address,
    emergencyType: e.emergencyType, patientInfo: e.patientInfo, notes: e.notes,
    timestamp: e.timestamp, status: e.status,
    assignedAmbulanceId: e.assignedAmbulanceId,
    assignedAmbulanceName: e.assignedAmbulanceName,
    assignedAt: e.assignedAt, hospitalId: e.hospitalId, doctorId: e.doctorId,
    correlationId: e.correlationId,
    initiatedBy: e.initiatedBy || 'receptor',
    createdBy: e.createdBy || null
  };
}

function broadcastActiveAmbulances() {
  const ambulances = Array.from(activeAmbulances.values()).map(a => ({
    id: a.id, placa: a.placa, nombre: a.nombre || a.placa,
    tipo: a.tipo, status: a.status,
    location: a.location, speed: a.speed, heading: a.heading, lastUpdate: a.lastUpdate
  }));
  broadcastToAll({ type: 'active_ambulances_update', ambulances, timestamp: new Date().toISOString() });
}

function broadcastActiveEmergencies() {
  const emergencies = Array.from(activeEmergencies.values()).map(serializeEmergency);
  broadcastToAll({ type: 'active_emergencies_update', emergencies, timestamp: new Date().toISOString() });
}

async function broadcastActiveHospitalsToAmbulances() {
  const hospitalsList = await getHospitalsList();
  broadcastToAmbulances({
    type: 'active_hospitals_update',
    hospitals: hospitalsList,
    total: hospitalsList.length,
    connected: activeHospitals.size,
    timestamp: new Date().toISOString()
  });
}

// ============ REGISTROS ============
async function handleRegisterAmbulance(ws, data) {
  if (!data.ambulance?.id) return sendError(ws, 'Datos de ambulancia incompletos', 'BAD_PAYLOAD');
  const location = data.ambulance.location || DEFAULT_LOCATION;
  const ambId = String(data.ambulance.id);

  const amb = {
    id: ambId,
    placa: data.ambulance.placa || 'SIN-PLACA',
    nombre: data.ambulance.nombre || data.ambulance.placa || 'Ambulancia',
    tipo: data.ambulance.tipo || 'UVI Móvil',
    status: data.ambulance.status || 'disponible',
    location, speed: 0, heading: 0, ws,
    lastUpdate: new Date(),
    connectedAt: new Date().toISOString()
  };
  activeAmbulances.set(ambId, amb);

  ws._role = 'ambulance';
  ws._ambulanceId = ambId;

  console.log(`🚑 Ambulancia ${ambId} (${amb.nombre}) · ${amb.status}`);

  await handleRequestHospitalsList(ws);
  handleRequestActiveEmergencies(ws);

  // === RECUPERACIÓN DE CASO ===
  // Si esta ambulancia tenía un caso asignado, reenviarlo para que el
  // cliente recupere la vista de navegación.
  const activeCase = getCaseForAmbulance(ambId);
  const activeRoute = getRouteForAmbulance(ambId);
  const pendingNotif = getPendingNotificationForAmbulance(ambId);

  sendMessage(ws, {
    type: 'assigned_emergency_sync',
    emergency: activeCase ? serializeEmergency(activeCase) : null,
    route: activeRoute ? {
      routeGeometry: activeRoute.routeGeometry,
      distance: activeRoute.distance,
      duration: activeRoute.duration,
      hospitalId: activeRoute.hospitalId
    } : null,
    hospitalRequest: pendingNotif ? {
      hospitalName: pendingNotif.hospitalId, // nombre se completa abajo
      hospitalId: pendingNotif.hospitalId,
      distanceKm: pendingNotif.distanceKm,
      callId: pendingNotif.callId
    } : null,
    timestamp: new Date().toISOString()
  });

  broadcastActiveAmbulances();
  broadcastActiveEmergencies();
  broadcastToReceptors({
    type: 'ambulance_connected',
    ambulance: { id: amb.id, placa: amb.placa, nombre: amb.nombre, status: amb.status },
    timestamp: new Date().toISOString()
  });

  sendMessage(ws, { type: 'ambulance_registered', ambulanceId: amb.id, message: 'Ambulancia registrada' });
}

async function handleRegisterHospital(ws, data) {
  if (!data.hospital?.id) return sendError(ws, 'Datos de hospital incompletos', 'BAD_PAYLOAD');
  try {
    const info = {
      id: String(data.hospital.id),
      nombre: data.hospital.nombre || 'Hospital',
      direccion: data.hospital.direccion || '',
      lat: data.hospital.lat ?? null,
      lng: data.hospital.lng ?? null,
      especialidades: data.hospital.especialidades || ['General'],
      camasDisponibles: data.hospital.camasDisponibles ?? 10,
      camasEmergencia: data.hospital.camasEmergencia ?? data.hospital.camasDisponibles ?? 10,
      telefono: data.hospital.telefono || '',
      activo: data.hospital.activo !== undefined ? data.hospital.activo : true
    };
    if ((!info.lat || !info.lng) && info.direccion) {
      const geo = await geocodeAddress(info.direccion);
      if (geo) { info.lat = geo.lat; info.lng = geo.lng; }
      else { info.lat = DEFAULT_LOCATION.lat; info.lng = DEFAULT_LOCATION.lng; }
    }
    activeHospitals.set(info.id, { info, ws, connectedAt: new Date().toISOString(), lastUpdate: new Date() });

    ws._role = 'hospital';
    ws._hospitalId = info.id;

    console.log(`🏥 Hospital ${info.nombre} (${info.id}) · camas: ${info.camasEmergencia}`);

    const ambulancesList = Array.from(activeAmbulances.values()).map(a => ({
      id: a.id, placa: a.placa, nombre: a.nombre, tipo: a.tipo,
      status: a.status, location: a.location, speed: a.speed, heading: a.heading, lastUpdate: a.lastUpdate
    }));
    sendMessage(ws, { type: 'active_ambulances_update', ambulances: ambulancesList, hospitalInfo: info });

    // Rutas relevantes activas
    const relevantRoutes = [];
    for (const [, route] of activeRoutes) {
      if (route.hospitalId === info.id) {
        relevantRoutes.push({
          ambulanceId: route.ambulanceId, routeGeometry: route.routeGeometry,
          distance: route.distance, duration: route.duration, timestamp: route.timestamp
        });
      }
    }
    if (relevantRoutes.length > 0) {
      sendMessage(ws, { type: 'active_routes_update', routes: relevantRoutes });
    }

    // ============ NUEVO: CASOS ACTIVOS DEL HOSPITAL ============
    sendHospitalActiveCases(info.id);

    // ============ NUEVO: HISTORIAL DE REPORTES DEL HOSPITAL ============
    const recentReports = [];
    prehospitalReports.forEach((record, callId) => {
      const latest = record.latest;
      if (latest && String(record.hospitalId) === String(info.id)) {
        recentReports.push({
          callId,
          version: latest.version,
          isFinal: latest.isFinal,
          urgentOnly: latest.urgentOnly,
          report: latest.report,
          patientInfo: record.patientInfo,
          hospitalId: record.hospitalId,
          ambulanceId: record.ambulanceId,
          timestamp: latest.timestamp
        });
      }
    });
    if (recentReports.length > 0) {
      sendMessage(ws, {
        type: 'doctor_reports_history',
        reports: recentReports,
        timestamp: new Date().toISOString()
      });
      console.log(`📋 Enviados ${recentReports.length} reportes históricos a hospital ${info.id}`);
    }
    // ============================================================

    // Notificaciones pendientes (recuperación)
    const pending = getPendingNotificationsForHospital(info.id);
    if (pending.length > 0) {
      pending.forEach(n => {
        sendMessage(ws, { type: 'patient_transfer_notification', ...n });
      });
      console.log(`📩 Reenviando ${pending.length} notificación(es) pendiente(s) a hospital ${info.id}`);
    }

    broadcastActiveHospitalsToAmbulances();
    sendMessage(ws, { type: 'hospital_registered', hospitalInfo: info, message: 'Hospital registrado correctamente' });
  } catch (e) {
    console.error('❌ register_hospital:', e.message);
    sendError(ws, 'Error interno', 'INTERNAL');
  }
}

function handleRegisterReceptor(ws, data) {
  const receptorId = data.receptorId || generateId('receptor');
  const nombre = data.nombre || receptorId;
  activeReceptors.set(receptorId, { ws, receptorId, nombre, connectedAt: new Date().toISOString(), lastUpdate: new Date() });
  ws._role = 'receptor';
  ws._receptorId = receptorId;
  console.log(`📞 Receptor ${receptorId} (${nombre})`);

  sendMessage(ws, {
    type: 'active_emergencies_update',
    emergencies: Array.from(activeEmergencies.values()).map(serializeEmergency),
    timestamp: new Date().toISOString()
  });
  sendMessage(ws, {
    type: 'active_ambulances_update',
    ambulances: Array.from(activeAmbulances.values()).map(a => ({
      id: a.id, placa: a.placa, nombre: a.nombre, tipo: a.tipo,
      status: a.status, location: a.location, speed: a.speed, lastUpdate: a.lastUpdate
    })),
    timestamp: new Date().toISOString()
  });
  sendMessage(ws, {
    type: 'receptor_registered',
    receptorId, nombre, totalReceptors: activeReceptors.size,
    timestamp: new Date().toISOString()
  });
}

function handleRegisterParamedic(ws, data) {
  const paramedicId = data.paramedicId || generateId('paramedic');
  const ambulanceId = data.ambulanceId ? String(data.ambulanceId) : null;
  const record = {
    ws, paramedicId,
    nombre: data.nombre || paramedicId,
    ambulanceId,
    connectedAt: new Date().toISOString(),
    lastUpdate: new Date()
  };
  activeParamedics.set(paramedicId, record);
  ws._role = 'paramedic';
  ws._paramedicId = paramedicId;
  if (ambulanceId) ws._ambulanceId = ambulanceId;

  console.log(`🩺 Paramédico ${paramedicId} · amb: ${ambulanceId || 'sin asignar'}`);

  const operator = ambulanceId ? activeAmbulances.get(ambulanceId) : null;
  sendMessage(ws, {
    type: 'paramedic_registered',
    paramedicId, nombre: record.nombre, ambulanceId,
    pairedWith: operator ? { ambulanceId: operator.id, operatorName: operator.nombre, placa: operator.placa } : null,
    message: operator ? 'Emparejado con unidad activa' : 'Sin unidad activa emparejada',
    timestamp: new Date().toISOString()
  });

  sendMessage(ws, {
    type: 'active_ambulances_update',
    ambulances: Array.from(activeAmbulances.values()).map(a => ({
      id: a.id, placa: a.placa, nombre: a.nombre, tipo: a.tipo,
      status: a.status, location: a.location, speed: a.speed,
      heading: a.heading, lastUpdate: a.lastUpdate
    })),
    timestamp: new Date().toISOString()
  });

  // === RECUPERACIÓN DE CASO ===
  // Enviar el caso activo asignado a la ambulancia del paramédico
  if (ambulanceId) {
    const activeCase = getCaseForAmbulance(ambulanceId);
    if (activeCase) {
      sendMessage(ws, {
        type: 'assigned_case_sync',
        callId: activeCase.callId,
        emergencyType: activeCase.emergencyType,
        address: activeCase.address,
        patientInfo: activeCase.patientInfo,
        notes: activeCase.notes,
        hospitalId: activeCase.hospitalId,
        ambulanceId,
        timestamp: new Date().toISOString()
      });

      // Si el hospital ya aceptó, avisar también
      const hospitalAccepted = pendingNotifications.size === 0 && activeCase.hospitalId
        ? activeHospitals.get(activeCase.hospitalId)
        : null;
      if (hospitalAccepted) {
        sendMessage(ws, {
          type: 'hospital_accepted_for_call',
          callId: activeCase.callId,
          hospitalId: hospitalAccepted.info.id,
          hospitalInfo: hospitalAccepted.info,
          message: 'Hospital aceptó. Puede enviar reporte prehospitalario.',
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  if (operator) {
    sendMessage(operator.ws, {
      type: 'paramedic_paired',
      paramedicId, nombre: record.nombre,
      timestamp: new Date().toISOString()
    });
  }
}

function handleRegisterDoctor(ws, data) {
  const doctorId = data.doctorId || generateId('doctor');
  const record = {
    ws, doctorId,
    nombre: data.nombre || `EC-Doctor-${doctorId.slice(-4)}`,
    especialidad: data.especialidad || 'Urgenciólogo',
    hospitalId: data.hospitalId ? String(data.hospitalId) : null,
    disponibilidad: data.disponibilidad || 'disponible',
    connectedAt: new Date().toISOString(),
    lastUpdate: new Date()
  };
  activeDoctors.set(doctorId, record);
  ws._role = 'doctor';
  ws._doctorId = doctorId;
  console.log(`👨‍⚕️ Doctor ${doctorId} (${record.especialidad})`);

const recentReports = [];
prehospitalReports.forEach((record, callId) => {
  const latest = record.latest;
  if (latest) {
    recentReports.push({
      callId,
      version: latest.version,
      isFinal: latest.isFinal,
      urgentOnly: latest.urgentOnly,
      report: latest.report,
      patientInfo: record.patientInfo,
      hospitalId: record.hospitalId,
      ambulanceId: record.ambulanceId,
      timestamp: latest.timestamp
    });
  }
});

  sendMessage(ws, {
    type: 'doctor_registered',
    doctorId,
    nombre: record.nombre,
    especialidad: record.especialidad,
    hospitalId: record.hospitalId,
    totalReports: recentReports.length,
    timestamp: new Date().toISOString()
  });

  if (recentReports.length > 0) {
    sendMessage(ws, {
      type: 'doctor_reports_history',
      reports: recentReports,
      timestamp: new Date().toISOString()
    });
  }
}

// ============ LOCATION / STATUS ============
function handleLocationUpdate(data) {
  const { ambulanceId } = data;
  if (!ambulanceId) return;
  const amb = activeAmbulances.get(String(ambulanceId));
  if (!amb) return;

  amb.location = data.location || amb.location;
  amb.speed = data.speed ?? amb.speed;
  amb.heading = data.heading ?? amb.heading;
  if (data.status) amb.status = data.status;
  amb.lastUpdate = new Date();

  const now = Date.now();
  const last = lastLocationBroadcast.get(amb.id) || 0;
  if (now - last < LOCATION_BROADCAST_THROTTLE_MS) return;
  lastLocationBroadcast.set(amb.id, now);

  const payload = {
    type: 'location_update',
    ambulanceId: amb.id, location: amb.location,
    speed: amb.speed, heading: amb.heading, status: amb.status,
    timestamp: new Date().toISOString()
  };
  broadcastToHospitals(payload);
  broadcastToReceptors({ ...payload, type: 'ambulance_location_update' });

  const payloadAmb = {
    type: 'ambulance_location_broadcast',
    ambulanceId: amb.id, placa: amb.placa, nombre: amb.nombre,
    location: amb.location, speed: amb.speed, heading: amb.heading, status: amb.status,
    timestamp: new Date().toISOString()
  };
  activeAmbulances.forEach(other => {
    if (other.id !== amb.id && other.ws?.readyState === WebSocket.OPEN) {
      try { other.ws.send(JSON.stringify(payloadAmb)); } catch (_) {}
    }
  });
}

function handleAmbulanceStatusUpdate(ws, data) {
  const { ambulanceId } = data;
  const status = data.status;
  if (!ambulanceId || !status) return sendError(ws, 'ambulanceId y status requeridos', 'BAD_PAYLOAD');
  const valid = ['disponible', 'en_ruta', 'ocupado', 'fuera_de_servicio'];
  if (!valid.includes(status)) return sendError(ws, `Estado inválido: ${status}`, 'BAD_STATUS');
  const amb = activeAmbulances.get(String(ambulanceId));
  if (!amb) return sendError(ws, 'Ambulancia no encontrada', 'NOT_FOUND');

  amb.status = status;
  amb.lastUpdate = new Date();
  console.log(`🔄 Ambulancia ${amb.id}: ${status}`);

  sendMessage(ws, { type: 'status_updated', ambulanceId: amb.id, status, timestamp: new Date().toISOString() });
  broadcastActiveAmbulances();
  broadcastToReceptors({
    type: 'ambulance_status_changed',
    ambulanceId: amb.id, placa: amb.placa, nombre: amb.nombre,
    newStatus: status,
    timestamp: new Date().toISOString()
  });
}

// ============ EMERGENCIAS ============
async function handleEmergencyCall(ws, data) {
  const { location, address, emergencyType, patientInfo, notes, timestamp } = data;
  if (!location) return sendError(ws, 'Datos incompletos: falta location', 'BAD_PAYLOAD');

  const callId = generateCallId('receptor');
  const correlationId = generateId('corr');
  console.log(`Emergencia ${callId} @ ${JSON.stringify(location)}`);

  const emergency = {
    callId, correlationId, location,
    address: address || 'Sin dirección',
    emergencyType: emergencyType || 'No especificado',
    patientInfo: patientInfo || {}, notes: notes || '',
    timestamp: timestamp || new Date().toISOString(),
    status: 'pending',
    assignedAmbulanceId: null, assignedAmbulanceName: null, assignedAt: null,
    createdBy: ws._receptorId || 'desconocido',
    receptorWs: ws, hospitalId: null, doctorId: null,
    initiatedBy: 'receptor'
  };
  activeEmergencies.set(callId, emergency);
  rejectedAmbulances.set(callId, new Set());

  const candidate = findNearestAvailableAmbulance(location);
  if (candidate) {
    emergency.status = 'offering';
    activeEmergencies.set(callId, emergency);
    emitEmergencyOffer(emergency, candidate.ambulance, new Set());
  } else {
    emergency.status = 'pending_no_ambulance';
    activeEmergencies.set(callId, emergency);
    sendMessage(ws, {
      type: 'emergency_assignment_failed',
      callId, message: 'No hay ambulancias disponibles. En espera.', correlationId
    });
    broadcastToReceptors({
      type: 'emergency_pending_broadcast',
      callId, emergencyType, address,
      message: 'Emergencia sin ambulancia — en espera',
      timestamp: new Date().toISOString()
    });
  }
  broadcastActiveEmergencies();
  broadcastActiveAmbulances();
}

async function handleOperatorInitiatedEmergency(ws, data) {
  const { ambulanceId, patientInfo, notes, location, emergencyType } = data;
  if (!ambulanceId) return sendError(ws, 'ambulanceId requerido', 'BAD_PAYLOAD');

  const amb = activeAmbulances.get(String(ambulanceId));
  if (!amb) return sendError(ws, 'Ambulancia no registrada', 'NOT_FOUND');

  const callId = generateCallId('operator');
  const correlationId = generateId('corr');
  const emLocation = location || amb.location || DEFAULT_LOCATION;

  console.log(`[operator] Emergencia ${callId} desde unidad ${amb.id}`);

  const emergency = {
    callId, correlationId,
    location: emLocation,
    address: data.address || amb.nombre || 'Iniciada por operador',
    emergencyType: emergencyType || 'Iniciada por operador',
    patientInfo: patientInfo || {},
    notes: notes || '',
    timestamp: new Date().toISOString(),
    status: 'assigned',
    assignedAmbulanceId: amb.id,
    assignedAmbulanceName: amb.nombre || amb.placa,
    assignedAt: new Date().toISOString(),
    createdBy: `operator:${amb.id}`,
    receptorWs: null,
    hospitalId: null,
    doctorId: null,
    initiatedBy: 'operator'
  };

  activeEmergencies.set(callId, emergency);
  rejectedAmbulances.set(callId, new Set());
  amb.status = 'en_ruta';

  // === Buscar hospital conectado más cercano ===
  const excluded = rejectedHospitals.get(String(amb.id)) || new Set();
  const candidate = findNearestConnectedHospital(emLocation, excluded);

  let hospitalInfo = null;
  let routeData = null;
  let distanceKm = null;

  if (candidate) {
    hospitalInfo = candidate.hospital.info;
    distanceKm = parseFloat(candidate.distanceKm.toFixed(2));

    if (hospitalInfo.lat && hospitalInfo.lng) {
      try {
        const coords = `${emLocation.lng},${emLocation.lat};${hospitalInfo.lng},${hospitalInfo.lat}`;
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}&language=es`;
        const r = await fetch(url);
        if (r.ok) {
          const json = await r.json();
          const route = json.routes?.[0];
          if (route) {
            routeData = {
              routeGeometry: route.geometry.coordinates,
              distance: route.distance,
              duration: route.duration
            };
            activeRoutes.set(`${amb.id}-${hospitalInfo.id}`, {
              ...routeData,
              ambulanceId: amb.id,
              hospitalId: hospitalInfo.id,
              updatedAt: new Date(),
              timestamp: new Date().toISOString()
            });
            console.log(`[operator] Ruta a ${hospitalInfo.nombre}: ${(route.distance / 1000).toFixed(1)} km · ${Math.round(route.duration / 60)} min`);
          }
        }
      } catch (e) {
        console.warn('[operator] Error trazando ruta:', e.message);
      }
    }

    emergency.hospitalId = hospitalInfo.id;
    activeEmergencies.set(callId, emergency);
  }

  // === Confirmar al operador ===
  sendMessage(ws, {
    type: 'operator_emergency_created',
    callId, correlationId,
    ambulanceId: amb.id,
    hospitalInfo,
    routeGeometry: routeData?.routeGeometry || null,
    distance: routeData?.distance || null,
    duration: routeData?.duration || null,
    distanceKm,
    message: routeData
      ? `Folio ${callId}. Ruta a ${hospitalInfo.nombre} trazada.`
      : (hospitalInfo
        ? `Folio ${callId}. Notificando a ${hospitalInfo.nombre}.`
        : `Folio ${callId}. Buscando hospital disponible.`),
    timestamp: new Date().toISOString()
  });

  broadcastToReceptors({
    type: 'emergency_created_by_operator_broadcast',
    callId, ambulanceId: amb.id,
    ambulanceName: amb.nombre || amb.placa,
    emergencyType: emergency.emergencyType,
    address: emergency.address,
    patientInfo: emergency.patientInfo,
    hospitalInfo,
    routeGeometry: routeData?.routeGeometry || null,
    distance: routeData?.distance || null,
    duration: routeData?.duration || null,
    timestamp: new Date().toISOString(),
    correlationId
  });

  broadcastActiveEmergencies();
  broadcastActiveAmbulances();

    // Notificar al paramédico emparejado con esta unidad para pre-llenar su reporte
  const pairedAm = Array.from(activeParamedics.values())
    .find(p => p.ambulanceId === String(amb.id));
  if (pairedAm?.ws) {
    sendMessage(pairedAm.ws, {
      type: 'emergency_case_received',
      callId,
      address: emergency.address,
      emergencyType: emergency.emergencyType,
      notes: emergency.notes,
      patientInfo: emergency.patientInfo,
      risks: emergency.risks || [],
      timestamp: new Date().toISOString()
    });
  }

  // === Notificar al hospital ===
  if (candidate && hospitalInfo) {
    const notificationId = generateId('notif');
    const payload = {
      notificationId, callId,
      ambulanceId: amb.id,
      ambulanceName: amb.nombre || amb.placa,
      ambulanceLocation: emLocation,
      hospitalId: hospitalInfo.id,
      patientInfo: emergency.patientInfo,
      notes: emergency.notes,
      emergencyType: emergency.emergencyType,
      distanceKm,
      emergencyMode: 'trasladar_paciente',
      autoRequested: true,
      fromOperator: true,
      routeGeometry: routeData?.routeGeometry || null,
      distance: routeData?.distance || null,
      duration: routeData?.duration || null
    };

    pendingNotifications.set(notificationId, {
      ...payload,
      timestamp: new Date().toISOString(),
      status: 'pending'
    });

    if (routeData) {
      pendingEmergencyRoutes.set(notificationId, {
        ambulanceId: amb.id,
        hospitalId: hospitalInfo.id,
        routeGeometry: routeData.routeGeometry,
        distance: routeData.distance,
        duration: routeData.duration,
        callId,
        isEmergencyRoute: false
      });
    }

    sendMessage(candidate.hospital.ws, {
      type: 'patient_transfer_notification',
      ...payload,
      timestamp: new Date().toISOString()
    });

    sendMessage(ws, {
      type: 'hospital_request_sent',
      callId, notificationId,
      hospitalId: hospitalInfo.id,
      hospitalName: hospitalInfo.nombre,
      distanceKm,
      camasEmergencia: hospitalInfo.camasEmergencia ?? hospitalInfo.camasDisponibles ?? 0,
      message: `Solicitud enviada a ${hospitalInfo.nombre}`,
      timestamp: new Date().toISOString()
    });
  } else {
    await autoRequestHospital(ws, {
      callId, ambulanceId: amb.id,
      patientInfo: emergency.patientInfo,
      notes: emergency.notes,
      emergencyType: emergency.emergencyType
    });
  }
}

function handleEmergencyAccept(ws, data) {
  let offerId = data.offerId;
  if (!offerId && data.callId) {
    for (const [id, o] of pendingOffers) {
      if (o.callId === data.callId) { offerId = id; break; }
    }
  }
  if (!offerId) return sendError(ws, 'offerId o callId requerido', 'BAD_PAYLOAD');
  acceptEmergencyOffer(offerId, false);
}

function handleEmergencyReject(ws, data) {
  let offerId = data.offerId;
  if (!offerId && data.callId) {
    for (const [id, o] of pendingOffers) {
      if (o.callId === data.callId) { offerId = id; break; }
    }
  }
  if (!offerId) return sendError(ws, 'offerId o callId requerido', 'BAD_PAYLOAD');
  rejectEmergencyOffer(offerId, data.reason || 'No especificado');
}

function handleAmbulanceEmergencyCancel(ws, data) {
  const { ambulanceId, callId, reason, notes } = data;
  if (!ambulanceId) return sendError(ws, 'ambulanceId requerido', 'BAD_PAYLOAD');
  console.warn(`⚠️ ${ambulanceId} cancela ${callId || '(sin callId)'} · ${reason || 'no especificado'}`);

  const amb = activeAmbulances.get(String(ambulanceId));
  if (amb) {
    amb.status = (reason === 'pinchadura' || reason === 'averia' || reason === 'avería')
      ? 'fuera_de_servicio' : 'disponible';
    broadcastActiveAmbulances();
  }
  if (!callId) return;

  const emergency = activeEmergencies.get(callId);
  if (!emergency) return;

  const excluded = rejectedAmbulances.get(callId) || new Set();
  excluded.add(String(ambulanceId));
  rejectedAmbulances.set(callId, excluded);

  const next = findNearestAvailableAmbulance(emergency.location, excluded);
  if (next) {
    emergency.status = 'offering';
    emergency.assignedAmbulanceId = null;
    emergency.assignedAmbulanceName = null;
    emergency.assignedAt = null;
    activeEmergencies.set(callId, emergency);
    emitEmergencyOffer(emergency, next.ambulance, excluded);
    broadcastToReceptors({
      type: 'emergency_reassigned_broadcast',
      callId,
      previousAmbulanceId: String(ambulanceId),
      newAmbulanceId: next.ambulance.id,
      newAmbulanceName: next.ambulance.nombre || next.ambulance.placa,
      reason: reason || 'imprevisto', notes: notes || '',
      timestamp: new Date().toISOString()
    });
  } else {
    emergency.status = 'pending_no_ambulance';
    emergency.assignedAmbulanceId = null;
    activeEmergencies.set(callId, emergency);
    broadcastToReceptors({
      type: 'emergency_pending_broadcast',
      callId,
      message: 'Unidad anterior canceló por imprevisto. Sin unidades disponibles.',
      reason: reason || 'imprevisto',
      timestamp: new Date().toISOString()
    });
  }
  broadcastActiveEmergencies();
}

function handleEmergencyCompleted(data) {
  const { ambulanceId, callId, completedBy } = data;
  console.log(`Servicio ${callId || '(sin folio)'} finalizado (por: ${completedBy || 'operador'})`);

  const resetAmbulanceState = (id) => {
    if (!id) return;
    const amb = activeAmbulances.get(String(id));
    if (amb && amb.status !== 'disponible') {
      amb.status = 'disponible';
      amb.lastUpdate = new Date();
    }
  };

  if (!callId || !activeEmergencies.has(callId)) {
    if (callId) {
      pendingNotifications.forEach((n, id) => {
        if (n.callId === callId) pendingNotifications.delete(id);
      });
      pendingEmergencyRoutes.forEach((r, id) => {
        if (r.callId === callId) pendingEmergencyRoutes.delete(id);
      });
    }
    resetAmbulanceState(ambulanceId);
    broadcastActiveAmbulances();
    return;
  }

  const emergency = activeEmergencies.get(callId);
  const assignedId = emergency.assignedAmbulanceId || ambulanceId;

  activeEmergencies.delete(callId);
  rejectedAmbulances.delete(callId);

  pendingNotifications.forEach((n, id) => {
    if (n.callId === callId) pendingNotifications.delete(id);
  });
  pendingEmergencyRoutes.forEach((r, id) => {
    if (r.callId === callId) pendingEmergencyRoutes.delete(id);
  });

  if (assignedId) {
    for (const [key, route] of activeRoutes) {
      if (route.ambulanceId === String(assignedId)) {
        activeRoutes.delete(key);
      }
    }
  }

  resetAmbulanceState(assignedId);

  // ==================== CLEANUP DE HOJA PREHOSPITALARIA ====================
  // Reglas:
  //  1. Si el reporte tiene versión FINAL → conservar 30 min de gracia para
  //     que hospital/doctor puedan seguir consultándolo tras un refresh.
  //  2. Si solo hay versiones URGENTES → eliminar de inmediato.
  const report = prehospitalReports.get(callId);
  if (report) {
    const tieneFinal = !!report.latest?.isFinal;
    if (tieneFinal) {
      console.log(`📋 Reporte final ${callId} conservado 30 min tras cierre`);
      setTimeout(() => {
        const rec = prehospitalReports.get(callId);
        // Solo eliminar si sigue siendo el mismo y sigue siendo final
        if (rec && rec.latest?.isFinal) {
          prehospitalReports.delete(callId);
          console.log(`📋 Reporte final ${callId} eliminado tras periodo de gracia`);
        }
      }, 30 * 60 * 1000);
    } else {
      prehospitalReports.delete(callId);
      console.log(`📋 Reporte ${callId} eliminado (solo tenía versiones urgentes)`);
    }
  }
  // =====================================================================

  broadcastActiveEmergencies();
  broadcastActiveAmbulances();

  broadcastToReceptors({
    type: 'emergency_completed_broadcast',
    callId,
    ambulanceId: assignedId,
    completedBy: completedBy || 'operador',
    message: 'Servicio finalizado',
    timestamp: new Date().toISOString()
  });

  if (assignedId) {
    const paired = Array.from(activeParamedics.values())
      .find(p => p.ambulanceId === String(assignedId));
    if (paired?.ws) {
      sendMessage(paired.ws, {
        type: 'emergency_case_closed',
        callId,
        message: 'Servicio cerrado por el centro regulador',
        timestamp: new Date().toISOString()
      });
    }
  }

    for (const [hid] of activeHospitals) {
    sendHospitalActiveCases(hid);
  }

  broadcastToHospitals({
    type: 'route_cleared',
    ambulanceId: assignedId,
    callId,
    timestamp: new Date().toISOString()
  });
}

function handleReceptorCompleteService(ws, data) {
  const { callId } = data;
  if (!callId) return sendError(ws, 'callId requerido', 'BAD_PAYLOAD');
  if (!activeEmergencies.has(callId)) {
    return sendError(ws, 'Emergencia no encontrada', 'NOT_FOUND');
  }
  console.log(`Receptor solicita cierre del servicio ${callId}`);
  handleEmergencyCompleted({ callId, completedBy: 'receptor' });
}

function handleRequestActiveEmergencies(ws) {
  sendMessage(ws, {
    type: 'active_emergencies_update',
    emergencies: Array.from(activeEmergencies.values()).map(serializeEmergency),
    timestamp: new Date().toISOString()
  });
}

function handleRequestActiveAmbulances(ws) {
  sendMessage(ws, {
    type: 'active_ambulances_update',
    ambulances: Array.from(activeAmbulances.values()).map(a => ({
      id: a.id, placa: a.placa, nombre: a.nombre, tipo: a.tipo,
      status: a.status, location: a.location, speed: a.speed,
      heading: a.heading, lastUpdate: a.lastUpdate
    })),
    timestamp: new Date().toISOString()
  });
}

// ============ CASO ACTIVO (recuperación) ============
function handleRequestMyCase(ws, data) {
  const { role, id, ambulanceId } = data || {};
  const ambId = ambulanceId || (role === 'ambulance' ? id : (ws._ambulanceId || null));

  if (!ambId) return sendError(ws, 'ambulanceId requerido', 'BAD_PAYLOAD');

  const emergency = getCaseForAmbulance(ambId);
  const route = getRouteForAmbulance(ambId);
  const notif = getPendingNotificationForAmbulance(ambId);

  sendMessage(ws, {
    type: 'assigned_emergency_sync',
    emergency: emergency ? serializeEmergency(emergency) : null,
    route: route ? {
      routeGeometry: route.routeGeometry,
      distance: route.distance,
      duration: route.duration,
      hospitalId: route.hospitalId
    } : null,
    hospitalRequest: notif ? {
      hospitalId: notif.hospitalId,
      distanceKm: notif.distanceKm,
      callId: notif.callId
    } : null,
    timestamp: new Date().toISOString()
  });
}

// ============ RANKING HOSPITALES ============
async function handleRequestRankedHospitals(ws, data) {
  const { location, excludeIds = [], ambulanceId } = data || {};
  if (!location?.lat || !location?.lng) {
    return sendError(ws, 'location requerida', 'BAD_PAYLOAD');
  }

  const excludeSet = new Set([
    ...excludeIds.map(String),
    ...(rejectedHospitals.get(String(ambulanceId)) ? [...rejectedHospitals.get(String(ambulanceId))] : [])
  ]);

  const candidates = Array.from(activeHospitals.values())
    .filter(h =>
      h.ws?.readyState === WebSocket.OPEN &&
      h.info.activo !== false &&
      !excludeSet.has(h.info.id) &&
      (h.info.camasEmergencia ?? h.info.camasDisponibles ?? 0) > 0
    )
    .map(h => {
      const dist = calculateDistance(location.lat, location.lng, h.info.lat, h.info.lng);
      const camas = h.info.camasEmergencia ?? h.info.camasDisponibles ?? 0;
      const score = dist / (1 + Math.min(camas, 20));
      return {
        id: h.info.id,
        nombre: h.info.nombre,
        direccion: h.info.direccion,
        lat: h.info.lat,
        lng: h.info.lng,
        camasEmergencia: camas,
        camasDisponibles: h.info.camasDisponibles ?? camas,
        especialidades: h.info.especialidades || ['General'],
        telefono: h.info.telefono || '',
        distanciaKm: parseFloat(dist.toFixed(2)),
        score: parseFloat(score.toFixed(3))
      };
    })
    .sort((a, b) => a.score - b.score);

  sendMessage(ws, {
    type: 'ranked_hospitals_update',
    hospitals: candidates,
    total: candidates.length,
    excluded: [...excludeSet],
    timestamp: new Date().toISOString()
  });
}

async function handleRequestHospitalsList(ws) {
  const hospitalsList = await getHospitalsList();
  sendMessage(ws, {
    type: 'active_hospitals_update',
    hospitals: hospitalsList,
    total: hospitalsList.length,
    connected: activeHospitals.size,
    timestamp: new Date().toISOString()
  });
}

// ============ NOTIFICACIONES / RUTAS ============
async function handlePatientTransferNotification(data) {
  const notificationId = data.notificationId || generateId('notif');
  const payload = { ...data, notificationId, timestamp: new Date().toISOString(), status: 'pending' };
  pendingNotifications.set(notificationId, payload);

  if (data.routeGeometry) {
    pendingEmergencyRoutes.set(notificationId, {
      ambulanceId: data.ambulanceId, hospitalId: data.hospitalId,
      routeGeometry: data.routeGeometry, distance: data.distance, duration: data.duration,
      isEmergencyRoute: data.emergencyMode === 'atender_emergencia'
    });
  }
  if (data.callId && activeEmergencies.has(data.callId)) {
    const em = activeEmergencies.get(data.callId);
    em.hospitalId = data.hospitalId;
    activeEmergencies.set(data.callId, em);
  }
  if (data.hospitalId) {
    const h = activeHospitals.get(String(data.hospitalId));
    if (h?.ws?.readyState === WebSocket.OPEN) {
      sendMessage(h.ws, { type: 'patient_transfer_notification', ...payload });
      console.log(`📩 Transferencia ${notificationId} → hospital ${data.hospitalId}`);
    } else {
      console.log(`❌ Hospital ${data.hospitalId} no encontrado/desconectado`);
      const amb = activeAmbulances.get(String(data.ambulanceId));
      if (amb?.ws) {
        sendMessage(amb.ws, {
          type: 'patient_transfer_failed',
          notificationId, reason: 'HOSPITAL_NOT_FOUND',
          message: `Hospital ${data.hospitalId} no disponible`
        });
      }
    }
  }

  const amb = activeAmbulances.get(String(data.ambulanceId));
  if (amb?.ws) {
    sendMessage(amb.ws, {
      type: 'notification_sent',
      notificationId, hospitalId: data.hospitalId,
      message: 'Notificación enviada'
    });
  }

  // ============ NUEVO: actualizar la lista de casos activos del hospital ============
  if (data.hospitalId) {
    sendHospitalActiveCases(data.hospitalId);
  }
  // ==================================================================================
}

async function autoRequestHospital(ws, data) {
  const { callId, ambulanceId, patientInfo, notes, emergencyType } = data;
  if (!callId) return sendError(ws, 'callId requerido', 'BAD_PAYLOAD');
  if (!ambulanceId) return sendError(ws, 'ambulanceId requerido', 'BAD_PAYLOAD');

  const amb = activeAmbulances.get(String(ambulanceId));
  if (!amb) return sendError(ws, 'Ambulancia no registrada', 'NOT_FOUND');

  const em = activeEmergencies.get(callId);
  if (!em) return sendError(ws, 'Emergencia no encontrada', 'NOT_FOUND');

  const loc = amb.location || em.location;
  if (!loc?.lat) {
    return sendError(ws, 'Sin ubicación de ambulancia', 'BAD_LOCATION');
  }

  const excluded = rejectedHospitals.get(String(ambulanceId)) || new Set();
  const candidate = findNearestConnectedHospital(loc, excluded);

  if (!candidate) {
    console.warn(`[autoRequestHospital] Sin hospital conectado disponible para ${callId}`);
    return sendMessage(ws, {
      type: 'hospital_search_failed',
      callId,
      reason: 'NO_CONNECTED_HOSPITALS',
      message: 'No hay hospitales conectados con capacidad disponible.',
      timestamp: new Date().toISOString()
    });
  }

  const notificationId = generateId('notif');
  const payload = {
    notificationId,
    callId,
    ambulanceId: amb.id,
    ambulanceName: amb.nombre || amb.placa,
    ambulanceLocation: loc,
    hospitalId: candidate.hospital.info.id,
    patientInfo: patientInfo || em.patientInfo || {},
    notes: notes || em.notes || '',
    emergencyType: emergencyType || em.emergencyType || 'Urgencia',
    distanceKm: parseFloat(candidate.distanceKm.toFixed(2)),
    emergencyMode: 'trasladar_paciente',
    autoRequested: true
  };

  pendingNotifications.set(notificationId, {
    ...payload,
    timestamp: new Date().toISOString(),
    status: 'pending'
  });

  em.hospitalId = candidate.hospital.info.id;
  activeEmergencies.set(callId, em);

  console.log(`[autoRequestHospital] Notificación ${notificationId} → hospital ${candidate.hospital.info.id}`);

  sendMessage(candidate.hospital.ws, {
    type: 'patient_transfer_notification',
    ...payload,
    timestamp: new Date().toISOString()
  });

  sendMessage(ws, {
    type: 'hospital_request_sent',
    callId,
    notificationId,
    hospitalId: candidate.hospital.info.id,
    hospitalName: candidate.hospital.info.nombre,
    distanceKm: payload.distanceKm,
    camasEmergencia: candidate.hospital.info.camasEmergencia ?? candidate.hospital.info.camasDisponibles ?? 0,
    message: `Solicitud enviada a ${candidate.hospital.info.nombre}`,
    timestamp: new Date().toISOString()
  });

  broadcastActiveEmergencies();
  broadcastActiveAmbulances();
}

async function handleHospitalAcceptPatient(data) {
  const notification = pendingNotifications.get(data.notificationId);
  if (!notification) return;
  const pendingRoute = pendingEmergencyRoutes.get(data.notificationId);
  const amb = activeAmbulances.get(String(notification.ambulanceId));

  const h = activeHospitals.get(String(data.hospitalId));
  if (h) {
    const actuales = h.info.camasEmergencia ?? h.info.camasDisponibles ?? 10;
    if (actuales <= 0) {
      if (amb?.ws) {
        sendMessage(amb.ws, {
          type: 'patient_rejected',
          notificationId: data.notificationId,
          hospitalId: data.hospitalId,
          reason: 'SIN_CAMAS',
          message: 'Hospital sin camas de emergencia disponibles.',
          timestamp: new Date().toISOString()
        });
      }
      pendingNotifications.delete(data.notificationId);
      return;
    }
    h.info.camasEmergencia = actuales - 1;
    h.info.camasDisponibles = Math.max(0, (h.info.camasDisponibles ?? 1) - 1);
    broadcastToHospitals({
      type: 'hospital_beds_update',
      hospitalId: h.info.id,
      camasEmergencia: h.info.camasEmergencia,
      camasDisponibles: h.info.camasDisponibles,
      timestamp: new Date().toISOString()
    });
    broadcastActiveHospitalsToAmbulances();
  }

  let routeData = null;
  if (pendingRoute) {
    routeData = {
      routeGeometry: pendingRoute.routeGeometry,
      distance: pendingRoute.distance,
      duration: pendingRoute.duration
    };
  }
  if (!routeData) {
    const cached = activeRoutes.get(`${notification.ambulanceId}-${data.hospitalId}`);
    if (cached) {
      routeData = {
        routeGeometry: cached.routeGeometry,
        distance: cached.distance,
        duration: cached.duration
      };
    }
  }
  if (!routeData && amb?.location && h?.info?.lat) {
    try {
      const coords = `${amb.location.lng},${amb.location.lat};${h.info.lng},${h.info.lat}`;
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}&language=es`;
      const r = await fetch(url);
      if (r.ok) {
        const json = await r.json();
        const route = json.routes?.[0];
        if (route) {
          routeData = {
            routeGeometry: route.geometry.coordinates,
            distance: route.distance,
            duration: route.duration
          };
        }
      }
    } catch (e) {
      console.warn('Error calculando ruta en aceptación:', e.message);
    }
  }

  if (routeData && amb && h) {
    activeRoutes.set(`${amb.id}-${h.info.id}`, {
      ...routeData,
      ambulanceId: amb.id,
      hospitalId: h.info.id,
      updatedAt: new Date(),
      timestamp: new Date().toISOString()
    });
  }

  if (amb?.ws) {
    if (routeData) {
      sendMessage(amb.ws, {
        type: 'patient_accepted_with_route',
        notificationId: data.notificationId,
        hospitalId: data.hospitalId,
        hospitalInfo: data.hospitalInfo || h?.info,
        message: 'Hospital ha aceptado. Ruta trazada.',
        routeGeometry: routeData.routeGeometry,
        distance: routeData.distance,
        duration: routeData.duration,
        timestamp: new Date().toISOString(),
        isEmergencyRoute: false
      });
    } else {
      sendMessage(amb.ws, {
        type: 'patient_accepted',
        notificationId: data.notificationId,
        hospitalId: data.hospitalId,
        hospitalInfo: data.hospitalInfo || h?.info,
        message: 'Hospital ha aceptado al paciente.',
        timestamp: new Date().toISOString()
      });
    }
    amb.status = 'en_ruta';
    rejectedHospitals.delete(amb.id);
  }

  if (h?.ws?.readyState === WebSocket.OPEN && routeData) {
    sendMessage(h.ws, {
      type: 'route_updated',
      ambulanceId: amb.id,
      hospitalId: h.info.id,
      routeGeometry: routeData.routeGeometry,
      distance: routeData.distance,
      duration: routeData.duration,
      timestamp: new Date().toISOString()
    });
  }

  const callId = notification.callId;
  if (callId && activeEmergencies.has(callId)) {
    const em = activeEmergencies.get(callId);
    em.hospitalId = String(data.hospitalId);
    activeEmergencies.set(callId, em);
    broadcastActiveEmergencies();
  }

  if (callId) {
    let reportRecord = prehospitalReports.get(callId);
    if (!reportRecord) {
      reportRecord = {
        callId,
        versions: [],
        currentVersion: 0,
        hospitalId: String(data.hospitalId),
        ambulanceId: String(notification.ambulanceId),
        patientInfo: notification.patientInfo || {},
        createdAt: new Date().toISOString()
      };
    } else {
      reportRecord.hospitalId = String(data.hospitalId);
    }
    prehospitalReports.set(callId, reportRecord);

    const paired = Array.from(activeParamedics.values())
      .find(p => p.ambulanceId === String(notification.ambulanceId));
    if (paired?.ws) {
      sendMessage(paired.ws, {
        type: 'hospital_accepted_for_call',
        callId,
        hospitalId: String(data.hospitalId),
        hospitalInfo: data.hospitalInfo || h?.info,
        message: 'Hospital aceptó. Puede enviar reporte prehospitalario.',
        timestamp: new Date().toISOString()
      });
    }
  }

  pendingEmergencyRoutes.delete(data.notificationId);
  pendingNotifications.delete(data.notificationId);
  broadcastActiveAmbulances();

   sendHospitalActiveCases(data.hospitalId);

}

async function handleHospitalRejectPatient(data) {
  const notification = pendingNotifications.get(data.notificationId);
  if (!notification) return;
  const amb = activeAmbulances.get(String(notification.ambulanceId));
  if (!amb?.ws) { pendingNotifications.delete(data.notificationId); return; }

  sendMessage(amb.ws, {
    type: 'patient_rejected',
    notificationId: data.notificationId,
    hospitalId: data.hospitalId,
    reason: data.reason || 'No especificado',
    message: 'Hospital no puede aceptar al paciente.',
    timestamp: new Date().toISOString()
  });

  const already = rejectedHospitals.get(amb.id) || new Set();
  already.add(String(data.hospitalId));
  rejectedHospitals.set(amb.id, already);
  const rejectedList = [...already];

  const available = Array.from(activeHospitals.values())
    .filter(h =>
      !rejectedList.includes(h.info.id) &&
      h.ws?.readyState === WebSocket.OPEN &&
      h.info.activo !== false &&
      (h.info.camasEmergencia ?? h.info.camasDisponibles ?? 0) > 0
    )
    .sort((a, b) => {
      if (!notification.ambulanceLocation) return 0;
      const da = calculateDistance(notification.ambulanceLocation.lat, notification.ambulanceLocation.lng, a.info.lat, a.info.lng);
      const db = calculateDistance(notification.ambulanceLocation.lat, notification.ambulanceLocation.lng, b.info.lat, b.info.lng);
      return da - db;
    });

  if (available.length > 0) {
    const next = available[0];
    const newNotifId = generateId('auto');
    const newNotif = { ...notification, notificationId: newNotifId, hospitalId: next.info.id, isAutomatic: true };
    pendingNotifications.set(newNotifId, newNotif);

    const pendingRoute = pendingEmergencyRoutes.get(data.notificationId);
    if (pendingRoute) {
      pendingEmergencyRoutes.set(newNotifId, { ...pendingRoute, hospitalId: next.info.id });
      pendingEmergencyRoutes.delete(data.notificationId);
    }
    sendMessage(next.ws, { type: 'patient_transfer_notification', ...newNotif });
    sendMessage(amb.ws, {
      type: 'automatic_redirect',
      originalHospitalId: data.hospitalId,
      newHospitalId: next.info.id,
      hospitalInfo: next.info,
      rejectedHospitals: rejectedList,
      message: `Reenviado a ${next.info.nombre}`,
      remainingHospitals: available.length - 1
    });
  } else {
    sendMessage(amb.ws, {
      type: 'no_hospitals_available',
      message: 'Todos los hospitales disponibles han rechazado',
      timestamp: new Date().toISOString()
    });
    pendingEmergencyRoutes.delete(data.notificationId);
  }
  pendingNotifications.delete(data.notificationId);
  broadcastActiveAmbulances();

sendHospitalActiveCases(data.hospitalId);

}

function handleCancelEmergencyMarker(data) {
  const { ambulanceId } = data;
  if (!ambulanceId) return;
  const amb = activeAmbulances.get(String(ambulanceId));
  if (amb?.ws) {
    sendMessage(amb.ws, {
      type: 'emergency_marker_cancelled',
      message: 'Marcador eliminado',
      timestamp: new Date().toISOString()
    });
  }
  for (const [key, route] of pendingEmergencyRoutes) {
    if (route.ambulanceId === String(ambulanceId) && route.isEmergencyRoute) {
      pendingEmergencyRoutes.delete(key);
    }
  }
}

function handleCancelNavigation(data) {
  const { ambulanceId, hospitalId, routeKey, isEmergencyRoute } = data;
  if (!ambulanceId) return;
  const amb = activeAmbulances.get(String(ambulanceId));
  if (amb) amb.status = 'disponible';

  if (routeKey) activeRoutes.delete(routeKey);
  else {
    for (const [key, route] of activeRoutes) {
      if (route.ambulanceId === String(ambulanceId) && route.hospitalId === String(hospitalId)) {
        activeRoutes.delete(key);
      }
    }
  }
  rejectedHospitals.delete(String(ambulanceId));
  pendingNotifications.forEach((n, id) => {
    if (n.ambulanceId === String(ambulanceId) && n.hospitalId === String(hospitalId)) {
      pendingNotifications.delete(id);
    }
  });
  if (isEmergencyRoute) {
    for (const [key, route] of pendingEmergencyRoutes) {
      if (route.ambulanceId === String(ambulanceId) && route.isEmergencyRoute) {
        pendingEmergencyRoutes.delete(key);
      }
    }
  }
  if (amb?.ws) {
    sendMessage(amb.ws, {
      type: 'navigation_cancelled',
      message: 'Navegación cancelada',
      timestamp: new Date().toISOString(),
      isEmergencyRoute: !!isEmergencyRoute
    });
  }
  const h = activeHospitals.get(String(hospitalId));
  if (h?.ws) {
    sendMessage(h.ws, {
      type: 'navigation_cancelled',
      ambulanceId,
      message: 'Ambulancia canceló la navegación',
      timestamp: new Date().toISOString()
    });
  }
  broadcastActiveAmbulances();
  broadcastActiveEmergencies();
}

async function handleRequestRouteRecompute(ws, data) {
  const { ambulanceId, hospitalId } = data;
  if (!ambulanceId || !hospitalId) return;
  const amb = activeAmbulances.get(String(ambulanceId));
  const h = activeHospitals.get(String(hospitalId));
  if (!amb?.location || !h?.info.lat) return;
  try {
    const coords = `${amb.location.lng},${amb.location.lat};${h.info.lng},${h.info.lat}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}&language=es`;
    const r = await fetch(url);
    if (!r.ok) return;
    const json = await r.json();
    if (!json.routes?.length) return;
    const route = json.routes[0];
    const routeData = {
      ambulanceId: String(ambulanceId), hospitalId: String(hospitalId),
      routeGeometry: route.geometry.coordinates,
      distance: route.distance, duration: route.duration,
      timestamp: new Date().toISOString()
    };
    activeRoutes.set(`${ambulanceId}-${hospitalId}`, { ...routeData, updatedAt: new Date() });
    if (amb.ws?.readyState === WebSocket.OPEN) sendMessage(amb.ws, { type: 'route_updated', ...routeData });
    if (h.ws?.readyState === WebSocket.OPEN) {
      sendMessage(h.ws, {
        type: 'route_updated', ambulanceId: routeData.ambulanceId, hospitalId: routeData.hospitalId,
        routeGeometry: routeData.routeGeometry, distance: routeData.distance, duration: routeData.duration
      });
    }
  } catch (e) {
    console.error('Error recalculando ruta:', e.message);
  }
}

function handleHospitalNote(data) {
  const { ambulanceId, note } = data;
  if (!ambulanceId) return;
  const amb = activeAmbulances.get(String(ambulanceId));
  if (amb?.ws) {
    sendMessage(amb.ws, {
      type: 'hospital_note',
      note: { ...note, timestamp: new Date().toISOString() }
    });
  }
}

function handlePrehospitalReportUpdate(data) {
  const { callId, report, urgentOnly, hospitalId, ambulanceId, patientInfo } = data;
  if (!callId) return;

  let record = prehospitalReports.get(callId);
  if (!record) {
    record = {
      callId,
      currentVersion: 0,
      latest: null,           // SOLO guardamos la última
      versions: [],           // historial compacto para auditoría
      hospitalId: hospitalId ? String(hospitalId) : null,
      ambulanceId: ambulanceId ? String(ambulanceId) : null,
      patientInfo: patientInfo || {},
      createdAt: new Date().toISOString()
    };
  }

  record.currentVersion += 1;
  const version = record.currentVersion;

  // Determinar si es versión final (no urgente Y reporte completo)
  const CAMPOS_FINALES = [
    ['seccionD', 'nombre'], ['seccionD', 'edad'], ['seccionD', 'sexo'],
    ['seccionF', 'tipo_urgencia'], ['seccionF', 'motivo_principal'],
    ['seccionI', 'fc'], ['seccionI', 'fr'], ['seccionI', 'spo2'], ['seccionI', 'ta'],
    ['seccionN', 'diagnostico_presuntivo'],
  ];
  const completo = CAMPOS_FINALES.every(([sec, key]) => {
    const v = report?.[sec]?.[key];
    return v !== undefined && v !== null && String(v).trim() !== '';
  });

  const isFinal = !urgentOnly && completo;

  const entry = {
    version,
    report,
    urgentOnly: !!urgentOnly,
    isFinal,
    timestamp: new Date().toISOString()
  };

  record.latest = entry;
  record.versions.push({
    version,
    isFinal,
    urgentOnly: !!urgentOnly,
    timestamp: entry.timestamp,
    report
  });
  // Mantener solo las últimas 20 versiones por auditoría
  if (record.versions.length > 20) record.versions = record.versions.slice(-20);

  if (hospitalId) record.hospitalId = String(hospitalId);
  if (ambulanceId) record.ambulanceId = String(ambulanceId);
  if (patientInfo) record.patientInfo = { ...record.patientInfo, ...patientInfo };

  prehospitalReports.set(callId, record);
  console.log(`📝 Reporte ${callId} v${version} · ${isFinal ? 'FINAL' : 'URGENTE'}`);

  const broadcastPayload = {
    type: 'prehospital_report_update',
    callId,
    version,
    urgentOnly: !!urgentOnly,
    isFinal,
    report,
    patientInfo: record.patientInfo,
    hospitalId: record.hospitalId,
    ambulanceId: record.ambulanceId,
    triage: report?.triaje,
    timestamp: entry.timestamp
  };

  // Hospital
  if (record.hospitalId) {
    const h = activeHospitals.get(record.hospitalId);
    if (h?.ws?.readyState === WebSocket.OPEN) sendMessage(h.ws, broadcastPayload);
  }

  // Doctor asignado
  const em = activeEmergencies.get(callId);
  if (em?.doctorId) {
    const doc = activeDoctors.get(em.doctorId);
    if (doc?.ws?.readyState === WebSocket.OPEN) sendMessage(doc.ws, broadcastPayload);
  }

  // Broadcast general a doctores (por si no hay uno asignado)
  broadcastToDoctors({
    type: 'prehospital_report_broadcast',
    ...broadcastPayload
  });

  // ACK al paramédico
  broadcastToParamedics({
    type: 'prehospital_report_ack',
    callId,
    version,
    urgentOnly: !!urgentOnly,
    isFinal,
    timestamp: new Date().toISOString()
  });
}



function handlePrehospitalReportGet(ws, data) {
  const { callId } = data;
  if (!callId) return sendError(ws, 'callId requerido', 'BAD_PAYLOAD');
  const record = prehospitalReports.get(callId);
  if (!record) return sendError(ws, 'Reporte no encontrado', 'NOT_FOUND');

  // Solo devolvemos la ÚLTIMA versión al cliente
  const latest = record.latest || (record.versions.length ? record.versions[record.versions.length - 1] : null);

  sendMessage(ws, {
    type: 'prehospital_report_snapshot',
    callId,
    version: latest?.version || 0,
    isFinal: latest?.isFinal || false,
    urgentOnly: latest?.urgentOnly || false,
    report: latest?.report || null,
    patientInfo: record.patientInfo,
    hospitalId: record.hospitalId,
    ambulanceId: record.ambulanceId,
    timestamp: latest?.timestamp || record.createdAt
  });
}

function handleRequestDoctorsList(ws) {
  const doctors = Array.from(activeDoctors.values()).map(d => ({
    doctorId: d.doctorId, nombre: d.nombre, especialidad: d.especialidad,
    hospitalId: d.hospitalId, disponibilidad: d.disponibilidad
  }));
  sendMessage(ws, { type: 'active_doctors_update', doctors, total: doctors.length, timestamp: new Date().toISOString() });
}

function handleAssignDoctor(data) {
  const { callId, doctorId, reason } = data;
  if (!callId || !doctorId) return;
  const em = activeEmergencies.get(callId);
  if (em) { em.doctorId = doctorId; activeEmergencies.set(callId, em); }
  const doc = activeDoctors.get(doctorId);
  if (doc?.ws?.readyState === WebSocket.OPEN) {
    sendMessage(doc.ws, {
      type: 'doctor_assigned',
      callId, reason: reason || 'Asignación manual',
      emergency: em ? serializeEmergency(em) : null,
      reportHistory: prehospitalReports.get(callId)?.versions || [],
      timestamp: new Date().toISOString()
    });
    doc.disponibilidad = 'asignado';
  }
  broadcastActiveEmergencies();
}

function handleDoctorAck(data) {
  const { callId, doctorId, status, note } = data;
  const em = activeEmergencies.get(callId);
  if (em?.receptorWs) {
    sendMessage(em.receptorWs, {
      type: 'doctor_ack_broadcast',
      callId, doctorId, status: status || 'ack', note: note || '',
      timestamp: new Date().toISOString()
    });
  }
  if (em?.hospitalId) {
    const h = activeHospitals.get(em.hospitalId);
    if (h?.ws) {
      sendMessage(h.ws, {
        type: 'doctor_ack_broadcast',
        callId, doctorId, status: status || 'ack', note: note || '',
        timestamp: new Date().toISOString()
      });
    }
  }
}

// ============ VIDEO ============
function findWsByRoleId(role, id) {
  if (!role || !id) return null;
  const map =
    role === 'doctor'    ? activeDoctors :
    role === 'hospital'  ? activeHospitals :
    role === 'paramedic' ? activeParamedics :
    role === 'ambulance' ? activeAmbulances :
    role === 'receptor'  ? activeReceptors : null;
  if (!map) return null;
  const entry = map.get(String(id));
  return entry?.ws || null;
}

function handleVideoCallRequest(ws, data) {
  const { to, callId, from, sessionId, ambulanceId } = data;
  if (!to?.role) return sendError(ws, 'Destino inválido', 'BAD_PAYLOAD');
  if (!sessionId) return sendError(ws, 'sessionId requerido', 'BAD_PAYLOAD');

  const session = {
    sessionId,
    callId: callId || null,
    ambulanceId: ambulanceId || null,
    caller: from || { role: ws._role, id: ws._paramedicId || ws._receptorId || 'unknown' },
    callee: to,
    status: 'ringing',
    createdAt: new Date().toISOString()
  };
  videoCallSessions.set(sessionId, session);

  const isBroadcast = !to.id || to.id === 'any' || to.id === '*';

  const incomingPayload = {
    type: 'video_call_incoming',
    sessionId,
    callId: session.callId,
    ambulanceId: session.ambulanceId,
    from: session.caller,
    timestamp: new Date().toISOString()
  };

  if (isBroadcast) {
    const targetMap =
      to.role === 'doctor'    ? activeDoctors :
      to.role === 'hospital'  ? activeHospitals :
      to.role === 'paramedic' ? activeParamedics :
      to.role === 'ambulance' ? activeAmbulances : null;

    if (!targetMap || targetMap.size === 0) {
      videoCallSessions.delete(sessionId);
      return sendError(ws, 'No hay doctores conectados', 'NO_TARGETS');
    }

    let sent = 0;
    targetMap.forEach(entry => {
      if (entry.ws?.readyState === WebSocket.OPEN) {
        sendMessage(entry.ws, incomingPayload);
        sent++;
      }
    });

    console.log(`[video] Sesión ${sessionId} → ${sent} doctor(es)`);
    sendMessage(ws, { type: 'video_call_ringing', sessionId, targets: sent, timestamp: new Date().toISOString() });
    return;
  }

  const target = findWsByRoleId(to.role, to.id);
  if (!target) {
    videoCallSessions.delete(sessionId);
    return sendError(ws, 'Destino no disponible', 'NOT_FOUND');
  }

  sendMessage(target, incomingPayload);
  sendMessage(ws, { type: 'video_call_ringing', sessionId, timestamp: new Date().toISOString() });
}

function handleVideoCallAccept(ws, data) {
  const { sessionId } = data;
  const s = videoCallSessions.get(sessionId);
  if (!s) return sendError(ws, 'Sesión no existe', 'NOT_FOUND');
  s.status = 'active';
  videoCallSessions.set(sessionId, s);
  const caller = findWsByRoleId(s.caller.role, s.caller.id);
  if (caller) sendMessage(caller, { type: 'video_call_accepted', sessionId, timestamp: new Date().toISOString() });
}

function handleVideoCallReject(ws, data) {
  const { sessionId, reason } = data;
  const s = videoCallSessions.get(sessionId);
  if (!s) return;
  videoCallSessions.delete(sessionId);
  const caller = findWsByRoleId(s.caller.role, s.caller.id);
  if (caller) {
    sendMessage(caller, { type: 'video_call_rejected', sessionId, reason: reason || 'No especificado', timestamp: new Date().toISOString() });
  }
}

function handleVideoCallSignal(ws, data) {
  const { sessionId, signal, to } = data;
  const s = videoCallSessions.get(sessionId);
  if (!s) return sendError(ws, 'Sesión no existe', 'NOT_FOUND');
  let target;
  if (to?.role && to?.id) target = findWsByRoleId(to.role, to.id);
  else {
    const sender = { role: ws._role, id: ws._receptorId || ws._paramedicId || ws._doctorId };
    const other = (s.caller.role === sender.role && s.caller.id === sender.id) ? s.callee : s.caller;
    target = findWsByRoleId(other.role, other.id);
  }
  if (target) sendMessage(target, { type: 'video_call_signal', sessionId, signal, timestamp: new Date().toISOString() });
}

function handleVideoCallEnd(ws, data) {
  const { sessionId } = data;
  const s = videoCallSessions.get(sessionId);
  if (!s) return;
  videoCallSessions.delete(sessionId);
  [findWsByRoleId(s.caller.role, s.caller.id), findWsByRoleId(s.callee.role, s.callee.id)]
    .forEach(t => { if (t) sendMessage(t, { type: 'video_call_ended', sessionId, timestamp: new Date().toISOString() }); });
}

// ============ CLEANUP ============
function cleanupDisconnectedClient(ws) {
  for (const [id, r] of activeReceptors) {
    if (r.ws === ws) { activeReceptors.delete(id); console.log(`📞 Receptor ${id} desconectado`); return; }
  }
  for (const [id, p] of activeParamedics) {
    if (p.ws === ws) { activeParamedics.delete(id); console.log(`🩺 Paramédico ${id} desconectado`); return; }
  }
  for (const [id, d] of activeDoctors) {
    if (d.ws === ws) {
      activeDoctors.delete(id);
      console.log(`👨‍⚕️ Doctor ${id} desconectado`);
      if (d.hospitalId) {
        const h = activeHospitals.get(d.hospitalId);
        if (h?.ws) sendMessage(h.ws, { type: 'doctor_disconnected', doctorId: id, timestamp: new Date().toISOString() });
      }
      return;
    }
  }
  for (const [id, h] of activeHospitals) {
    if (h.ws === ws) {
      activeHospitals.delete(id);
      console.log(`🏥 Hospital ${id} desconectado`);
      broadcastActiveHospitalsToAmbulances();
      return;
    }
  }
  for (const [id, amb] of activeAmbulances) {
    if (amb.ws === ws) {
      // NO eliminar la ambulancia inmediatamente — dejarla en el mapa para
      // que pueda reconectarse y recuperar su caso. Se limpiará por el
      // intervalo de inactividad si no vuelve.
      amb.ws = null;
      amb.disconnectedAt = new Date().toISOString();
      console.log(`🚑 Ambulancia ${id} WS cerrado (marcada como desconectada, esperando reconexión)`);

      for (const [offerId, o] of pendingOffers) {
        if (o.ambulanceId === id) { clearTimeout(o.timer); pendingOffers.delete(offerId); }
      }
      for (const [k, r] of activeRoutes) if (r.ambulanceId === id) activeRoutes.delete(k);
      rejectedHospitals.delete(id);
      for (const [k, r] of pendingEmergencyRoutes) if (r.ambulanceId === id) pendingEmergencyRoutes.delete(k);
      broadcastActiveAmbulances();
      broadcastActiveEmergencies();
      return;
    }
  }
}

// ============ DISPATCH ============
async function handleMessage(ws, data) {
  switch (data.type) {
    case 'register_ambulance':          return handleRegisterAmbulance(ws, data);
    case 'register_hospital':           return handleRegisterHospital(ws, data);
    case 'register_receptor':           return handleRegisterReceptor(ws, data);
    case 'register_paramedic':          return handleRegisterParamedic(ws, data);
    case 'register_doctor':             return handleRegisterDoctor(ws, data);
    case 'request_active_ambulances':   return handleRequestActiveAmbulances(ws);
    case 'request_my_case':             return handleRequestMyCase(ws, data);
    case 'request_active_emergencies':  return handleRequestActiveEmergencies(ws);
    case 'location_update':             return handleLocationUpdate(data);
    case 'auto_request_hospital':        return autoRequestHospital(ws, data);
    case 'operator_initiated_emergency': return handleOperatorInitiatedEmergency(ws, data);
    case 'receptor_complete_service': return handleReceptorCompleteService(ws, data);
    case 'request_ranked_hospitals':    return handleRequestRankedHospitals(ws, data);
    case 'ambulance_status_update':     return handleAmbulanceStatusUpdate(ws, data);
    case 'emergency_call':              return handleEmergencyCall(ws, data);
    case 'emergency_accept':            return handleEmergencyAccept(ws, data);
    case 'emergency_reject':            return handleEmergencyReject(ws, data);
    case 'ambulance_emergency_cancel':  return handleAmbulanceEmergencyCancel(ws, data);
    case 'emergency_completed':         return handleEmergencyCompleted(data);
    case 'request_hospitals_list':      return handleRequestHospitalsList(ws);
    case 'request_route_recompute':     return handleRequestRouteRecompute(ws, data);
    case 'cancel_navigation':           return handleCancelNavigation(data);
    case 'cancel_emergency_marker':     return handleCancelEmergencyMarker(data);
    case 'hospital_note':               return handleHospitalNote(data);
    case 'patient_transfer_notification': return handlePatientTransferNotification(data);
    case 'hospital_accept_patient':     return handleHospitalAcceptPatient(data);
    case 'hospital_reject_patient':     return handleHospitalRejectPatient(data);
    case 'prehospital_report_update':   return handlePrehospitalReportUpdate(data);
    case 'prehospital_report_get':    return handlePrehospitalReportGet(ws, data);
    case 'request_doctors_list':        return handleRequestDoctorsList(ws);
    case 'assign_doctor':               return handleAssignDoctor(data);
    case 'doctor_ack':                  return handleDoctorAck(data);
    case 'video_call_request':          return handleVideoCallRequest(ws, data);
    case 'video_call_accept':           return handleVideoCallAccept(ws, data);
    case 'video_call_reject':           return handleVideoCallReject(ws, data);
    case 'video_call_signal':           return handleVideoCallSignal(ws, data);
    case 'video_call_end':              return handleVideoCallEnd(ws, data);
    default:
      console.log(`⚠️ Tipo no manejado: ${data.type}`);
      sendError(ws, `Tipo desconocido: ${data.type}`, 'UNKNOWN_TYPE');
  }
}

// ============ INTERVALOS ============
let intervalsStarted = false;
function startIntervals() {
  if (intervalsStarted) return;
  intervalsStarted = true;

  // Ping server → cliente (mantiene viva la conexión a nivel TCP/WS)
  setInterval(() => {
    if (!currentWss) return;
    currentWss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try { client.ping(); } catch (_) {}
      }
    });
  }, SERVER_PING_INTERVAL_MS);

  // Cleanup de ambulancias:
  //  - Si WS está cerrado → borrar tras SOFT_INACTIVITY_MS
  //  - Si WS está vivo pero sin heartbeat por HARD_INACTIVITY_MS → borrar
  setInterval(() => {
    const now = Date.now();
    for (const [id, amb] of activeAmbulances) {
      const wsDead = !amb.ws || amb.ws.readyState !== WebSocket.OPEN;
      const last = amb.lastUpdate ? amb.lastUpdate.getTime() : 0;
      const age = now - last;

      const shouldRemove = wsDead
        ? age > SOFT_INACTIVITY_MS
        : age > HARD_INACTIVITY_MS;

      if (!shouldRemove) continue;

      console.log(`🕒 Limpiando ambulancia inactiva ${id} (wsDead=${wsDead}, age=${Math.round(age / 1000)}s)`);
      activeAmbulances.delete(id);
      lastLocationBroadcast.delete(id);
      for (const [callId, em] of activeEmergencies) {
        if (em.assignedAmbulanceId === id) {
          em.status = 'pending';
          em.lastAssignedAmbulanceId = em.assignedAmbulanceId;
          em.lastAssignedAmbulanceName = em.assignedAmbulanceName;
          em.assignedAmbulanceId = null;
          em.assignedAmbulanceName = null;
          em.assignedAt = null;
          em.unassignedAt = new Date().toISOString();
          em.unassignedReason = 'ambulance_timeout';
          activeEmergencies.set(callId, em);
        }
      }
      broadcastActiveEmergencies();
      broadcastActiveAmbulances();
    }
  }, 60_000);

  // Recomposición de rutas activas (tráfico en vivo)
  setInterval(async () => {
    for (const [ambulanceId, amb] of activeAmbulances) {
      if (amb.status !== 'en_ruta' || !amb.location) continue;
      let hospitalId = null;
      for (const [, r] of activeRoutes) {
        if (r.ambulanceId === ambulanceId) { hospitalId = r.hospitalId; break; }
      }
      if (!hospitalId) continue;
      const h = activeHospitals.get(hospitalId);
      if (!h?.info.lat) continue;
      try {
        const coords = `${amb.location.lng},${amb.location.lat};${h.info.lng},${h.info.lat}`;
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}&language=es`;
        const r = await fetch(url);
        if (!r.ok) continue;
        const json = await r.json();
        if (!json.routes?.length) continue;
        const route = json.routes[0];
        const routeData = {
          ambulanceId, hospitalId,
          routeGeometry: route.geometry.coordinates,
          distance: route.distance, duration: route.duration,
          timestamp: new Date().toISOString()
        };
        activeRoutes.set(`${ambulanceId}-${hospitalId}`, { ...routeData, updatedAt: new Date() });
        if (amb.ws?.readyState === WebSocket.OPEN) sendMessage(amb.ws, { type: 'route_updated', ...routeData });
        if (h.ws?.readyState === WebSocket.OPEN) {
          sendMessage(h.ws, {
            type: 'route_updated', ambulanceId, hospitalId,
            routeGeometry: routeData.routeGeometry, distance: routeData.distance, duration: routeData.duration
          });
        }
      } catch (_) {}
    }
  }, 15_000);

  setInterval(() => {
    const now = Date.now();
    for (const [id, s] of videoCallSessions) {
      if (s.status === 'ringing' && now - new Date(s.createdAt).getTime() > 60_000) {
        videoCallSessions.delete(id);
        const caller = findWsByRoleId(s.caller.role, s.caller.id);
        if (caller) sendMessage(caller, { type: 'video_call_rejected', sessionId: id, reason: 'TIMEOUT', timestamp: new Date().toISOString() });
      }
    }
  }, 30_000);
}

// ============ ATTACH ============
function attachV2WebSocket(server, options = {}) {
  const wss = new WebSocket.Server({
    server,
    path: options.path || '/ws',
    perMessageDeflate: false
  });
  currentWss = wss;

  wss.on('connection', (ws, req) => {
    console.log(`✅ WS conexión desde ${req.socket.remoteAddress}`);
    ws._lastHeartbeat = Date.now();
    sendMessage(ws, {
      type: 'connection_established',
      protocolVersion: PROTOCOL_VERSION,
      message: 'Conexión establecida',
      serverTime: new Date().toISOString()
    });

    ws.on('message', async raw => {
      let data;
      try { data = JSON.parse(raw); }
      catch { return sendError(ws, 'JSON inválido', 'BAD_JSON'); }

      // Liveness: cualquier mensaje cuenta como señal de vida.
      touchConnection(ws);

      if (data.type === 'heartbeat') {
        return sendMessage(ws, { type: 'heartbeat_ack', timestamp: new Date().toISOString() });
      }
      if (!data.type) return sendError(ws, 'Falta type', 'BAD_TYPE');

      try {
        await handleMessage(ws, data);
      } catch (e) {
        console.error(`[${data.type}]`, e.message);
        sendError(ws, 'Error procesando mensaje', 'HANDLER_ERROR');
      }
    });

    // Responder pong para no perder el ping nativo
    ws.on('pong', () => {
      ws._lastHeartbeat = Date.now();
      touchConnection(ws);
    });

    ws.on('close', (code, reason) => {
      console.log(`🔌 WS cierre ${code} - ${reason || ''}`);
      cleanupDisconnectedClient(ws);
    });
    ws.on('error', err => console.error('❌ WS error:', err.message));
  });

  startIntervals();
  console.log(`📡 WS v${PROTOCOL_VERSION} montado en path "${options.path || '/ws'}"`);

  return {
    wss,
    state: {
      activeAmbulances, activeHospitals, activeReceptors,
      activeParamedics, activeDoctors, activeEmergencies
    }
  };
}

module.exports = { attachV2WebSocket, PROTOCOL_VERSION };