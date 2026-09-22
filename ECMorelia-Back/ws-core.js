// ws-core.js — Núcleo del WebSocket v2 (compartido por main.js y websocket-server.js)
// Un solo source de verdad para el protocolo.

const WebSocket = require('ws');
const fetch = require('node-fetch');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const crypto = require('crypto');
const PROTOCOL_VERSION = 2;
const MAPBOX_TOKEN =
  process.env.MAPBOX_TOKEN ||
  'pk.eyJ1IjoiZXltYXJkMjkiLCJhIjoiY21tcDY4YzNpMGw3bjJzb203YmZyNTVnMyJ9.OvZlnCMfUkUYe6Ib83DUVw';

const DEFAULT_LOCATION = { lat: 19.7024, lng: -101.1969 };
const OFFER_TIMEOUT_MS = 20_000;
const LOCATION_BROADCAST_THROTTLE_MS = 2_000;
const AMBULANCE_INACTIVITY_MS = 5 * 60 * 1000;

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

// ID único e irrepetible: fecha + 64 bits de aleatoriedad criptográfica.
// Probabilidad de colisión: ~1 en 1.8×10^19 — imposible a escala estatal.
function generateCallId() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = crypto.randomBytes(8).toString('hex').toUpperCase();
  return `EM-${y}${m}${d}-${rand}`;
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

// ============ ASIGNACIÓN DE EMERGENCIAS ============
function findNearestAvailableAmbulance(location, excludeIds = new Set()) {
  let best = null, bestDist = Infinity;
  for (const [, amb] of activeAmbulances) {
    // Acepta "disponible" Y "fuera_de_servicio" (standby = el operador decide)
    if (amb.status !== 'disponible' && amb.status !== 'fuera_de_servicio') continue;
    if (!amb.location) continue;
    if (excludeIds.has(amb.id)) continue;
    const d = calculateDistance(location.lat, location.lng, amb.location.lat, amb.location.lng);
    if (d < bestDist) { bestDist = d; best = amb; }
  }
  return best ? { ambulance: best, distanceKm: bestDist } : null;
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
      // Auto-aceptar solo a unidades "disponibles"
      acceptEmergencyOffer(offerId, true);
    } else {
      // Standby que no respondió → se descarta y se busca siguiente
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
    correlationId: e.correlationId
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

// ============ HANDLERS ============
async function handleRegisterAmbulance(ws, data) {
  if (!data.ambulance?.id) return sendError(ws, 'Datos de ambulancia incompletos', 'BAD_PAYLOAD');
  const location = data.ambulance.location || DEFAULT_LOCATION;
  const amb = {
    id: String(data.ambulance.id),
    placa: data.ambulance.placa || 'SIN-PLACA',
    nombre: data.ambulance.nombre || data.ambulance.placa || 'Ambulancia',
    tipo: data.ambulance.tipo || 'UVI Móvil',
    status: data.ambulance.status || 'disponible',
    location, speed: 0, heading: 0, ws, lastUpdate: new Date()
  };
  activeAmbulances.set(amb.id, amb);
  console.log(`🚑 Ambulancia ${amb.id} (${amb.nombre}) · ${amb.status}`);

  await handleRequestHospitalsList(ws);
  handleRequestActiveEmergencies(ws);
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
    activeHospitals.set(info.id, { info, ws, connectedAt: new Date().toISOString() });
    console.log(`🏥 Hospital ${info.nombre} (${info.id}) · camas: ${info.camasEmergencia}`);

    const ambulancesList = Array.from(activeAmbulances.values()).map(a => ({
      id: a.id, placa: a.placa, nombre: a.nombre, tipo: a.tipo,
      status: a.status, location: a.location, speed: a.speed, heading: a.heading, lastUpdate: a.lastUpdate
    }));
    sendMessage(ws, { type: 'active_ambulances_update', ambulances: ambulancesList, hospitalInfo: info });

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
  activeReceptors.set(receptorId, { ws, receptorId, nombre, connectedAt: new Date().toISOString() });
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
  const record = {
    ws, paramedicId,
    nombre: data.nombre || paramedicId,
    ambulanceId: data.ambulanceId ? String(data.ambulanceId) : null,
    connectedAt: new Date().toISOString()
  };
  activeParamedics.set(paramedicId, record);
  ws._role = 'paramedic';
  ws._paramedicId = paramedicId;
  console.log(`🩺 Paramédico ${paramedicId} · amb: ${record.ambulanceId || 'sin asignar'}`);

  const operator = record.ambulanceId ? activeAmbulances.get(record.ambulanceId) : null;
  sendMessage(ws, {
    type: 'paramedic_registered',
    paramedicId, nombre: record.nombre, ambulanceId: record.ambulanceId,
    pairedWith: operator ? { ambulanceId: operator.id, operatorName: operator.nombre, placa: operator.placa } : null,
    message: operator ? 'Emparejado con unidad activa' : 'Sin unidad activa emparejada',
    timestamp: new Date().toISOString()
  });
    // Enviar lista de ambulancias activas para que el paramédico se vincule
  sendMessage(ws, {
    type: 'active_ambulances_update',
    ambulances: Array.from(activeAmbulances.values()).map(a => ({
      id: a.id, placa: a.placa, nombre: a.nombre, tipo: a.tipo,
      status: a.status, location: a.location, speed: a.speed,
      heading: a.heading, lastUpdate: a.lastUpdate
    })),
    timestamp: new Date().toISOString()
  });
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
    connectedAt: new Date().toISOString()
  };
  activeDoctors.set(doctorId, record);
  ws._role = 'doctor';
  ws._doctorId = doctorId;
  console.log(`👨‍⚕️ Doctor ${doctorId} (${record.especialidad})`);

  // Enviar reportes prehospitalarios recientes al doctor que se conecta
  const recentReports = [];
  prehospitalReports.forEach((record, callId) => {
    const last = record.versions[record.versions.length - 1];
    if (last) {
      recentReports.push({
        callId,
        version: record.currentVersion,
        report: last.report,
        patientInfo: record.patientInfo,
        hospitalId: record.hospitalId,
        ambulanceId: record.ambulanceId,
        timestamp: last.timestamp
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

  // Enviar historial de reportes para previsualización
  if (recentReports.length > 0) {
    sendMessage(ws, {
      type: 'doctor_reports_history',
      reports: recentReports,
      timestamp: new Date().toISOString()
    });
  }
}

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

async function handleEmergencyCall(ws, data) {
  const { location, address, emergencyType, patientInfo, notes, timestamp } = data;
  if (!location) return sendError(ws, 'Datos incompletos: falta location', 'BAD_PAYLOAD');

  const callId = generateCallId();
  const correlationId = generateId('corr');
  console.log(`🚨 Emergencia ${callId} @ ${JSON.stringify(location)}`);

  const emergency = {
    callId, correlationId, location,
    address: address || 'Sin dirección',
    emergencyType: emergencyType || 'No especificado',
    patientInfo: patientInfo || {}, notes: notes || '',
    timestamp: timestamp || new Date().toISOString(),
    status: 'pending',
    assignedAmbulanceId: null, assignedAmbulanceName: null, assignedAt: null,
    createdBy: ws._receptorId || 'desconocido',
    receptorWs: ws, hospitalId: null, doctorId: null
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
  // El operador inicia la emergencia SIN receptor previo.
  // Crea la emergencia con la ambulancia ya asignada y la notifica al hospital.
  const { ambulanceId, patientInfo, notes, location } = data;
  if (!ambulanceId) return sendError(ws, 'ambulanceId requerido', 'BAD_PAYLOAD');

  const amb = activeAmbulances.get(String(ambulanceId));
  if (!amb) return sendError(ws, 'Ambulancia no registrada', 'NOT_FOUND');

  const callId = generateCallId();
  const correlationId = generateId('corr');
  const emLocation = location || amb.location || DEFAULT_LOCATION;

  console.log(`🚨 Emergencia operador ${callId} · unidad ${amb.id}`);

  const emergency = {
    callId, correlationId,
    location: emLocation,
    address: data.address || amb.nombre || 'Iniciada por operador',
    emergencyType: data.emergencyType || 'Iniciada por operador',
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
    initiatedBy: 'operator',
  };
  activeEmergencies.set(callId, emergency);
  rejectedAmbulances.set(callId, new Set());
  amb.status = 'en_ruta';

  // Avisar al operador con el folio confirmado
  sendMessage(ws, {
    type: 'operator_emergency_created',
    callId,
    correlationId,
    message: 'Emergencia creada. Notificando hospital.',
    timestamp: new Date().toISOString(),
  });

  // Difundir a todos los receptores (para que vean el folio en su panel)
  broadcastToReceptors({
    type: 'emergency_created_by_operator_broadcast',
    callId,
    ambulanceId: amb.id,
    ambulanceName: amb.nombre || amb.placa,
    emergencyType: emergency.emergencyType,
    address: emergency.address,
    patientInfo: emergency.patientInfo,
    timestamp: new Date().toISOString(),
    correlationId,
  });

  broadcastActiveEmergencies();
  broadcastActiveAmbulances();
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
  const { ambulanceId, callId } = data;
  console.log(`✅ Emergencia ${callId} completada por ${ambulanceId}`);
  if (callId && activeEmergencies.has(callId)) {
    activeEmergencies.delete(callId);
    rejectedAmbulances.delete(callId);
    broadcastActiveEmergencies();
    broadcastToReceptors({
      type: 'emergency_completed_broadcast',
      callId, ambulanceId, message: 'Emergencia completada',
      timestamp: new Date().toISOString()
    });
  }
  const amb = activeAmbulances.get(String(ambulanceId));
  if (amb && amb.status === 'en_ruta') {
    amb.status = 'disponible';
    broadcastActiveAmbulances();
  }
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

// Ranking de hospitales por cercanía + capacidad. Excluye rechazados y sin camas.
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
      // Score: menor es mejor. Distancia penaliza, camas premian.
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
    console.log(`🛏️ Hospital ${h.info.id} → camas emergencia: ${h.info.camasEmergencia}`);
  }

  if (amb?.ws) {
    if (pendingRoute) {
      sendMessage(amb.ws, {
        type: 'patient_accepted_with_route',
        notificationId: data.notificationId,
        hospitalId: data.hospitalId,
        hospitalInfo: data.hospitalInfo || h?.info,
        message: 'Hospital ha aceptado. Ruta trazada.',
        routeGeometry: pendingRoute.routeGeometry,
        distance: pendingRoute.distance, duration: pendingRoute.duration,
        timestamp: new Date().toISOString(),
        isEmergencyRoute: pendingRoute.isEmergencyRoute
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

    const callId = notification.callId;
  if (callId && activeEmergencies.has(callId)) {
    const em = activeEmergencies.get(callId);
    em.hospitalId = String(data.hospitalId);
    activeEmergencies.set(callId, em);
    broadcastActiveEmergencies();
  }

  // Vincular hospital al reporte prehospitalario del caso (si existe)
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

    // Avisar al paramédico emparejado con esa ambulancia
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
  const { callId, report, version, urgentOnly, hospitalId, ambulanceId, patientInfo } = data;
  if (!callId) return;
  let record = prehospitalReports.get(callId);
  if (!record) {
    record = {
      callId, versions: [], currentVersion: 0,
      hospitalId: hospitalId ? String(hospitalId) : null,
      ambulanceId: ambulanceId ? String(ambulanceId) : null,
      patientInfo: patientInfo || {},
      createdAt: new Date().toISOString()
    };
  }
  record.currentVersion += 1;
  record.versions.push({
    version: record.currentVersion, report, urgentOnly: !!urgentOnly,
    timestamp: new Date().toISOString()
  });
  if (hospitalId) record.hospitalId = String(hospitalId);
  if (ambulanceId) record.ambulanceId = String(ambulanceId);
  if (patientInfo) record.patientInfo = { ...record.patientInfo, ...patientInfo };
  prehospitalReports.set(callId, record);

  console.log(`📝 Reporte prehospitalario ${callId} v${record.currentVersion}`);

  if (record.hospitalId) {
    const h = activeHospitals.get(record.hospitalId);
    if (h?.ws?.readyState === WebSocket.OPEN) {
      sendMessage(h.ws, {
        type: 'prehospital_report_update',
        callId, version: record.currentVersion, urgentOnly: !!urgentOnly,
        report, patientInfo: record.patientInfo,
        timestamp: new Date().toISOString()
      });
    }
  }

    // Notificar a TODOS los doctores conectados (broadcast) además del asignado
  const em = activeEmergencies.get(callId);
  if (em?.doctorId) {
    const doc = activeDoctors.get(em.doctorId);
    if (doc?.ws?.readyState === WebSocket.OPEN) {
      sendMessage(doc.ws, {
        type: 'prehospital_report_update',
        callId,
        version: record.currentVersion,
        urgentOnly: !!urgentOnly,
        report,
        patientInfo: record.patientInfo,
        hospitalId: record.hospitalId,
        ambulanceId: record.ambulanceId,
        triage: report?.triaje,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Broadcast general a todos los doctores (para que vean el caso aunque no estén asignados)
  broadcastToDoctors({
    type: 'prehospital_report_broadcast',
    callId,
    version: record.currentVersion,
    urgentOnly: !!urgentOnly,
    patientInfo: record.patientInfo,
    hospitalId: record.hospitalId,
    ambulanceId: record.ambulanceId,
    triage: report?.triaje,
    timestamp: new Date().toISOString()
  });

  broadcastToParamedics({
    type: 'prehospital_report_ack',
    callId, version: record.currentVersion, urgentOnly: !!urgentOnly,
    timestamp: new Date().toISOString()
  });
}

function handlePrehospitalReportGet(ws, data) {
  const { callId } = data;
  if (!callId) return sendError(ws, 'callId requerido', 'BAD_PAYLOAD');
  const record = prehospitalReports.get(callId);
  if (!record) return sendError(ws, 'Reporte no encontrado', 'NOT_FOUND');
  sendMessage(ws, {
    type: 'prehospital_report_history',
    callId, versions: record.versions, currentVersion: record.currentVersion,
    patientInfo: record.patientInfo, hospitalId: record.hospitalId,
    timestamp: new Date().toISOString()
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
  console.log(`👨‍⚕️ Doctor ${doctorId} asignado a ${callId}`);
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
  const { to, callId, from } = data;
  if (!to?.role || !to?.id) return sendError(ws, 'Destino inválido', 'BAD_PAYLOAD');
  const sessionId = generateId('vcall');
  const session = {
    sessionId, callId: callId || null,
    caller: from || { role: ws._role, id: ws._receptorId || ws._paramedicId || ws._doctorId },
    callee: to, status: 'ringing',
    createdAt: new Date().toISOString()
  };
  videoCallSessions.set(sessionId, session);
  const target = findWsByRoleId(to.role, to.id);
  if (!target) {
    videoCallSessions.delete(sessionId);
    return sendError(ws, 'Destino no disponible', 'NOT_FOUND');
  }
  sendMessage(target, {
    type: 'video_call_incoming',
    sessionId, callId: session.callId, from: session.caller,
    timestamp: new Date().toISOString()
  });
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
      activeAmbulances.delete(id);
      lastLocationBroadcast.delete(id);
      console.log(`🚑 Ambulancia ${id} desconectada`);
      for (const [callId, em] of activeEmergencies) {
        if (em.assignedAmbulanceId === id) {
          em.status = 'pending';
          em.assignedAmbulanceId = null;
          em.assignedAmbulanceName = null;
          em.assignedAt = null;
          activeEmergencies.set(callId, em);
        }
      }
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

async function handleMessage(ws, data) {
  switch (data.type) {
    case 'register_ambulance':          return handleRegisterAmbulance(ws, data);
    case 'register_hospital':           return handleRegisterHospital(ws, data);
    case 'register_receptor':           return handleRegisterReceptor(ws, data);
    case 'register_paramedic':          return handleRegisterParamedic(ws, data);
    case 'register_doctor':             return handleRegisterDoctor(ws, data);
    case 'request_active_ambulances': return handleRequestActiveAmbulances(ws);
    case 'location_update':             return handleLocationUpdate(data);
    case 'video_call_request': return handleVideoCallRequest(ws, data);
case 'video_call_accept':  return handleVideoCallAccept(ws, data);
case 'video_call_reject':  return handleVideoCallReject(ws, data);
case 'video_call_signal':  return handleVideoCallSignal(ws, data);
case 'video_call_end':     return handleVideoCallEnd(ws, data);
    case 'request_ranked_hospitals': return handleRequestRankedHospitals(ws, data);
    case 'operator_initiated_emergency': return handleOperatorInitiatedEmergency(ws, data);
    case 'ambulance_status_update':     return handleAmbulanceStatusUpdate(ws, data);
    case 'emergency_call':              return handleEmergencyCall(ws, data);
    case 'request_active_emergencies':  return handleRequestActiveEmergencies(ws);
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
    case 'prehospital_report_get':      return handlePrehospitalReportGet(ws, data);
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

  setInterval(() => {
    if (!currentWss) return;
    currentWss.clients.forEach(c => {
      if (c.readyState === WebSocket.OPEN) { try { c.ping(); } catch (_) {} }
    });
  }, 30_000);

  setInterval(() => {
    const now = Date.now();
    for (const [id, amb] of activeAmbulances) {
      if (amb.lastUpdate && now - amb.lastUpdate.getTime() > AMBULANCE_INACTIVITY_MS) {
        console.log(`🕒 Limpiando ambulancia inactiva ${id}`);
        activeAmbulances.delete(id);
        lastLocationBroadcast.delete(id);
        for (const [callId, em] of activeEmergencies) {
          if (em.assignedAmbulanceId === id) {
            em.status = 'pending';
            em.assignedAmbulanceId = null;
            em.assignedAmbulanceName = null;
            em.assignedAt = null;
            activeEmergencies.set(callId, em);
          }
        }
        broadcastActiveEmergencies();
        broadcastActiveAmbulances();
      }
    }
  }, 60_000);

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
      if (!data?.type) return sendError(ws, 'Falta type', 'BAD_TYPE');
      try { await handleMessage(ws, data); }
      catch (e) {
        console.error(`❌ [${data.type}]`, e.message);
        sendError(ws, 'Error procesando mensaje', 'HANDLER_ERROR');
      }
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