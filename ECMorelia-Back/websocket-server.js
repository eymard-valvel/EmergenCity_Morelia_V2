// websocket-server.js — VERSIÓN MEJORADA CON HOSPITALES ACTIVOS SIEMPRE VISIBLES
const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const fetch = require('node-fetch');
const { PrismaClient } = require('@prisma/client');

const app = express();
const server = http.createServer(app);
const prisma = new PrismaClient();

const wss = new WebSocket.Server({
  server,
  path: '/ws',
  perMessageDeflate: false
});

// ---------- ALMACENAMIENTO ----------
const activeAmbulances   = new Map();
const activeHospitals    = new Map();
const activeReceptors    = new Map();
const pendingNotifications = new Map();
const activeRoutes       = new Map();
const rejectedHospitals  = new Map();
const pendingEmergencyRoutes = new Map();
const activeEmergencies  = new Map();

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || 'pk.eyJ1IjoiZXltYXJkMjkiLCJhIjoiY21tcDY4YzNpMGw3bjJzb203YmZyNTVnMyJ9.OvZlnCMfUkUYe6Ib83DUVw';
const geocodeCache = new Map();
const lastLocationBroadcast = new Map();
const DEFAULT_LOCATION = { lat: 19.7024, lng: -101.1969 };

let emergencyCounter = 1;
function generateCallId() {
  const ts = Date.now();
  const rand = Math.random().toString(36).substr(2, 5).toUpperCase();
  const seq = String(emergencyCounter++).padStart(4, '0');
  return `EM-${seq}-${rand}`;
}

// ---------- MIDDLEWARE ----------
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  next();
});
app.options('*', (req, res) => res.sendStatus(200));

// ---------- GEOCODING ----------
async function geocodeAddress(address) {
  if (!address || address.trim() === '') return null;
  const cleanAddress = address.trim().toLowerCase();
  if (geocodeCache.has(cleanAddress)) return geocodeCache.get(cleanAddress);

  try {
    const queryBase = (cleanAddress.includes('méxico') || cleanAddress.includes('mexico'))
      ? cleanAddress : `${cleanAddress}, México`;
    const q = encodeURIComponent(queryBase);
    const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${MAPBOX_TOKEN}&country=mx&types=address,poi&limit=1&language=es`;
    const mapboxResp = await fetch(mapboxUrl);
    if (mapboxResp.ok) {
      const mapboxData = await mapboxResp.json();
      if (mapboxData.features && mapboxData.features.length > 0) {
        const best = mapboxData.features[0];
        const result = {
          lat: best.center[1], lng: best.center[0],
          place_name: best.place_name, address: best.place_name
        };
        geocodeCache.set(cleanAddress, result);
        return result;
      }
    }
    const nominatimQ = encodeURIComponent(`${cleanAddress}, Michoacán, México`);
    const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${nominatimQ}&countrycodes=mx&limit=1`;
    const fallbackResp = await fetch(fallbackUrl);
    if (fallbackResp.ok) {
      const fallbackData = await fallbackResp.json();
      if (fallbackData.length > 0) {
        const result = {
          lat: parseFloat(fallbackData[0].lat), lng: parseFloat(fallbackData[0].lon),
          place_name: fallbackData[0].display_name, address: fallbackData[0].display_name
        };
        geocodeCache.set(cleanAddress, result);
        return result;
      }
    }
  } catch (error) {
    console.error('💥 Error en geocoding:', error);
  }
  return null;
}

// ---------- BROADCASTS ----------
function sendMessage(ws, message) {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      return true;
    }
  } catch (error) {
    console.error('Error enviando mensaje:', error);
  }
  return false;
}

function sendError(ws, message) {
  sendMessage(ws, { type: 'error', message });
}

function broadcastToAll(message) {
  const str = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(str); } catch (e) {}
    }
  });
}

function broadcastToAmbulances(message) {
  const str = JSON.stringify(message);
  activeAmbulances.forEach(amb => {
    if (amb.ws && amb.ws.readyState === WebSocket.OPEN) {
      try { amb.ws.send(str); } catch (e) {}
    }
  });
}

function broadcastToHospitals(message) {
  const str = JSON.stringify(message);
  activeHospitals.forEach(h => {
    if (h.ws && h.ws.readyState === WebSocket.OPEN) {
      try { h.ws.send(str); } catch (e) {}
    }
  });
}

function broadcastToReceptors(message) {
  const str = JSON.stringify(message);
  activeReceptors.forEach(r => {
    if (r.ws && r.ws.readyState === WebSocket.OPEN) {
      try { r.ws.send(str); } catch (e) {}
    }
  });
}

function broadcastActiveAmbulances() {
  const ambulancesList = Array.from(activeAmbulances.values()).map(a => ({
    id: a.id, placa: a.placa, nombre: a.nombre || a.placa,
    tipo: a.tipo, status: a.status,
    location: a.location, speed: a.speed, heading: a.heading, lastUpdate: a.lastUpdate
  }));
  const message = { type: 'active_ambulances_update', ambulances: ambulancesList, timestamp: new Date().toISOString() };
  broadcastToAll(message);
}

function broadcastActiveEmergencies() {
  const list = Array.from(activeEmergencies.values());
  const message = { type: 'active_emergencies_update', emergencies: list, timestamp: new Date().toISOString() };
  broadcastToAll(message);
}

// ---------- OBTENER LISTA DE HOSPITALES (incluye activos + DB) ----------
async function getHospitalsList() {
  // 1. Hospitales activos (conectados)
  const activeList = [];
  activeHospitals.forEach((h, id) => {
    activeList.push({
      id: id,
      nombre: h.info.nombre || `Hospital ${id}`,
      direccion: h.info.direccion || '',
      lat: h.info.lat || DEFAULT_LOCATION.lat,
      lng: h.info.lng || DEFAULT_LOCATION.lng,
      especialidades: h.info.especialidades || ['General'],
      camasDisponibles: h.info.camasDisponibles ?? 10,
      telefono: h.info.telefono || '',
      connected: true,
      activo: true,
      status: 'active'
    });
  });

  // 2. Hospitales de la base de datos (solo los que no están activos)
  try {
    const dbHospitals = await prisma.hospitales.findMany({
      select: { id_hospitales: true, nombre: true, direccion: true }
    });
    dbHospitals.forEach(h => {
      const id = h.id_hospitales.toString();
      if (!activeHospitals.has(id)) {
        activeList.push({
          id: id,
          nombre: h.nombre || `Hospital ${id}`,
          direccion: h.direccion || '',
          lat: null,
          lng: null,
          especialidades: ['General'],
          camasDisponibles: 10,
          telefono: '',
          connected: false,
          activo: true,
          status: 'inactive'
        });
      }
    });
  } catch (error) {
    console.error('❌ Error consultando hospitales DB:', error);
  }

  return activeList;
}

// ---------- HTTP ENDPOINTS ----------
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeAmbulances: activeAmbulances.size,
    activeHospitals: activeHospitals.size,
    activeReceptors: activeReceptors.size,
    activeEmergencies: activeEmergencies.size,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    ambulances: Array.from(activeAmbulances.values()).map(a => ({
      id: a.id, placa: a.placa, nombre: a.nombre, status: a.status, location: a.location
    })),
    hospitals: Array.from(activeHospitals.keys()),
    emergencies: Array.from(activeEmergencies.values()),
    timestamp: new Date().toISOString()
  });
});

app.post('/geocode', async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: 'Se requiere dirección' });
    const result = await geocodeAddress(address);
    if (!result) return res.status(404).json({ error: 'No se pudo geocodificar' });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/search-addresses', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || query.trim().length < 3) return res.json([]);
    const q = encodeURIComponent(query.trim());
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${MAPBOX_TOKEN}&country=mx&limit=10&types=address,poi,place&language=es`;
    const response = await fetch(url);
    if (!response.ok) return res.json([]);
    const data = await response.json();
    const results = (data.features || []).map(f => ({
      id: f.id, place_name: f.place_name,
      lat: f.center[1], lng: f.center[0],
      type: f.place_type[0], relevance: f.relevance
    }));
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Error en búsqueda' });
  }
});

app.post('/directions', async (req, res) => {
  try {
    const { startLng, startLat, endLng, endLat } = req.body;
    if (!startLng || !startLat || !endLng || !endLat)
      return res.status(400).json({ error: 'Coordenadas incompletas' });
    const coords = `${startLng},${startLat};${endLng},${endLat}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    if (!json.routes || json.routes.length === 0)
      return res.status(404).json({ error: 'No se encontraron rutas' });
    const route = json.routes[0];
    res.json({
      geometry: route.geometry.coordinates,
      distance: route.distance, duration: route.duration,
      summary: `${(route.distance / 1000).toFixed(1)} km, ${Math.round(route.duration / 60)} min`,
      steps: route.legs?.[0]?.steps || []
    });
  } catch (error) {
    res.status(500).json({ error: 'Error calculando ruta' });
  }
});

// ---------- WEBSOCKET ----------
wss.on('connection', (ws, req) => {
  console.log(`✅ Nueva conexión desde ${req.socket.remoteAddress}`);
  sendMessage(ws, {
    type: 'connection_established',
    message: 'Conexión establecida',
    timestamp: new Date().toISOString()
  });

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`📨 [${data.type}] desde ${req.socket.remoteAddress}`);
      await handleMessage(ws, data);
    } catch (error) {
      console.error('❌ Error procesando mensaje:', error);
      sendError(ws, 'JSON inválido');
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`🔌 Conexión cerrada: ${code} - ${reason}`);
    cleanupDisconnectedClient(ws);
  });

  ws.on('error', (error) => {
    console.error('❌ Error WebSocket:', error.message);
  });
});

// ---------- MANEJADOR DE MENSAJES ----------
async function handleMessage(ws, data) {
  switch (data.type) {
    case 'register_ambulance':
      await handleRegisterAmbulance(ws, data);
      break;
    case 'register_hospital':
      await handleRegisterHospital(ws, data);
      break;
    case 'register_receptor':
      handleRegisterReceptor(ws, data);
      break;
    case 'location_update':
      handleLocationUpdate(data);
      break;
    case 'ambulance_status_update':
      handleAmbulanceStatusUpdate(ws, data);
      break;
    case 'emergency_call':
      await handleEmergencyCall(ws, data);
      break;
    case 'request_active_emergencies':
      handleRequestActiveEmergencies(ws);
      break;
    case 'request_hospitals_list':
      await handleRequestHospitalsList(ws);
      break;
    case 'patient_transfer_notification':
      await handlePatientTransferNotification(data);
      break;
    case 'hospital_accept_patient':
      await handleHospitalAcceptPatient(data);
      break;
    case 'hospital_reject_patient':
      await handleHospitalRejectPatient(data);
      break;
    case 'cancel_navigation':
      handleCancelNavigation(data);
      break;
    case 'cancel_emergency_marker':
      handleCancelEmergencyMarker(data);
      break;
    case 'request_route_recompute':
      await handleRequestRouteRecompute(ws, data);
      break;
    case 'hospital_note':
      handleHospitalNote(data);
      break;
    case 'emergency_completed':
      handleEmergencyCompleted(data);
      break;
    default:
      console.log(`⚠️ Mensaje no manejado: ${data.type}`);
  }
}

// ---------- REGISTROS ----------
async function handleRegisterAmbulance(ws, data) {
  if (!data.ambulance || !data.ambulance.id) {
    return sendError(ws, 'Datos de ambulancia incompletos');
  }

  const location = data.ambulance.location || DEFAULT_LOCATION;
  const ambulanceData = {
    id: data.ambulance.id,
    placa: data.ambulance.placa || 'SIN-PLACA',
    nombre: data.ambulance.nombre || data.ambulance.placa || 'Ambulancia',
    tipo: data.ambulance.tipo || 'UVI Móvil',
    status: data.ambulance.status || 'disponible',
    location,
    speed: 0,
    heading: 0,
    ws,
    lastUpdate: new Date()
  };

  activeAmbulances.set(ambulanceData.id, ambulanceData);
  console.log(`🚑 Ambulancia registrada: ${ambulanceData.id} (${ambulanceData.nombre}) - ${ambulanceData.status}`);

  // Enviar lista de hospitales y emergencias activas
  await handleRequestHospitalsList(ws);
  handleRequestActiveEmergencies(ws);

  // Broadcast a todos
  broadcastActiveAmbulances();
  broadcastActiveEmergencies();
  broadcastToReceptors({
    type: 'ambulance_connected',
    ambulance: { id: ambulanceData.id, placa: ambulanceData.placa, nombre: ambulanceData.nombre, status: ambulanceData.status },
    timestamp: new Date().toISOString()
  });
}

async function handleRegisterHospital(ws, data) {
  if (!data.hospital || !data.hospital.id) return sendError(ws, 'Datos de hospital incompletos');

  try {
    let info = {
      id: data.hospital.id,
      nombre: data.hospital.nombre || 'Hospital',
      direccion: data.hospital.direccion || '',
      lat: data.hospital.lat || null,
      lng: data.hospital.lng || null,
      especialidades: data.hospital.especialidades || ['General'],
      camasDisponibles: data.hospital.camasDisponibles ?? 10,
      telefono: data.hospital.telefono || '',
      activo: data.hospital.activo !== undefined ? data.hospital.activo : true
    };
    if ((!info.lat || !info.lng) && info.direccion) {
      const geo = await geocodeAddress(info.direccion);
      if (geo) { info.lat = geo.lat; info.lng = geo.lng; }
      else { info.lat = DEFAULT_LOCATION.lat; info.lng = DEFAULT_LOCATION.lng; }
    }
    activeHospitals.set(info.id, { info, ws, connectedAt: new Date().toISOString() });
    console.log(`🏥 Hospital registrado: ${info.nombre} (${info.id})`);

    // Enviar ambulancias activas al hospital
    const ambulancesList = Array.from(activeAmbulances.values()).map(a => ({
      id: a.id, placa: a.placa, nombre: a.nombre, tipo: a.tipo,
      status: a.status, location: a.location, speed: a.speed, heading: a.heading, lastUpdate: a.lastUpdate
    }));
    sendMessage(ws, { type: 'active_ambulances_update', ambulances: ambulancesList, hospitalInfo: info });

    // Rutas activas hacia este hospital
    const relevantRoutes = [];
    for (const [, route] of activeRoutes) {
      if (route.hospitalId === info.id) {
        relevantRoutes.push({
          ambulanceId: route.ambulanceId,
          routeGeometry: route.routeGeometry,
          distance: route.distance,
          duration: route.duration,
          timestamp: route.timestamp
        });
      }
    }
    if (relevantRoutes.length > 0) {
      sendMessage(ws, { type: 'active_routes_update', routes: relevantRoutes });
    }

    // Notificar a ambulancias que hay un nuevo hospital activo
    broadcastActiveHospitalsToAmbulances();

    sendMessage(ws, { type: 'hospital_registered', hospitalInfo: info, message: 'Hospital registrado correctamente' });
  } catch (error) {
    console.error('❌ Error en register_hospital:', error);
    sendError(ws, 'Error interno del servidor');
  }
}

function handleRegisterReceptor(ws, data) {
  const receptorId = data.receptorId || `receptor_${Date.now()}`;
  const nombre = data.nombre || receptorId;
  activeReceptors.set(receptorId, { ws, receptorId, nombre, connectedAt: new Date().toISOString() });
  ws._receptorId = receptorId;
  console.log(`📞 Receptor registrado: ${receptorId} (${nombre})`);

  sendMessage(ws, {
    type: 'active_emergencies_update',
    emergencies: Array.from(activeEmergencies.values()),
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
    receptorId, nombre,
    totalReceptors: activeReceptors.size,
    timestamp: new Date().toISOString()
  });
}

// ---------- UBICACIÓN ----------
function handleLocationUpdate(data) {
  const { ambulanceId } = data;
  if (!ambulanceId) return;
  const ambulance = activeAmbulances.get(ambulanceId);
  if (!ambulance) return;

  ambulance.location = data.location || ambulance.location;
  ambulance.speed = data.speed ?? ambulance.speed;
  ambulance.heading = data.heading ?? ambulance.heading;
  if (data.status) ambulance.status = data.status;
  ambulance.lastUpdate = new Date();

  const now = Date.now();
  const last = lastLocationBroadcast.get(ambulanceId) || 0;
  if (now - last >= 2000) {
    lastLocationBroadcast.set(ambulanceId, now);
    broadcastToHospitals({
      type: 'location_update',
      ambulanceId,
      location: ambulance.location,
      speed: ambulance.speed,
      heading: ambulance.heading,
      status: ambulance.status,
      timestamp: new Date().toISOString()
    });
    broadcastToReceptors({
      type: 'ambulance_location_update',
      ambulanceId,
      location: ambulance.location,
      speed: ambulance.speed,
      heading: ambulance.heading,
      status: ambulance.status,
      timestamp: new Date().toISOString()
    });
  }
}

// ---------- ESTADO ----------
function handleAmbulanceStatusUpdate(ws, data) {
  const { ambulanceId, status } = data;
  if (!ambulanceId || !status) return sendError(ws, 'ambulanceId y status requeridos');
  const validStatuses = ['disponible', 'en_ruta', 'ocupado', 'fuera_de_servicio'];
  if (!validStatuses.includes(status)) return sendError(ws, `Estado inválido`);

  const ambulance = activeAmbulances.get(ambulanceId);
  if (!ambulance) return sendError(ws, 'Ambulancia no encontrada');

  ambulance.status = status;
  ambulance.lastUpdate = new Date();
  console.log(`🔄 Ambulancia ${ambulanceId}: ${status}`);
  sendMessage(ws, { type: 'status_updated', ambulanceId, status, timestamp: new Date().toISOString() });
  broadcastActiveAmbulances();
  broadcastToReceptors({
    type: 'ambulance_status_changed',
    ambulanceId,
    placa: ambulance.placa,
    nombre: ambulance.nombre,
    newStatus: status,
    timestamp: new Date().toISOString()
  });
}

// ---------- ASIGNACIÓN AUTOMÁTICA ----------
function findNearestAvailableAmbulance(emergencyLocation) {
  let best = null;
  let bestDist = Infinity;
  for (const [, amb] of activeAmbulances) {
    if (amb.status === 'disponible' && amb.location) {
      const d = calculateDistance(emergencyLocation.lat, emergencyLocation.lng, amb.location.lat, amb.location.lng);
      if (d < bestDist) { bestDist = d; best = amb; }
    }
  }
  return best;
}

// ---------- EMERGENCIA ----------
async function handleEmergencyCall(ws, data) {
  const { location, address, emergencyType, patientInfo, notes, timestamp } = data;
  if (!location) return sendError(ws, 'Datos incompletos');

  const callId = generateCallId();
  console.log(`🚨 Nueva emergencia ${callId} en ${JSON.stringify(location)}`);

  const emergency = {
    callId, location,
    address: address || 'Sin dirección',
    emergencyType: emergencyType || 'No especificado',
    patientInfo: patientInfo || {},
    notes: notes || '',
    timestamp: timestamp || new Date().toISOString(),
    status: 'pending',
    assignedAmbulanceId: null,
    assignedAmbulanceName: null,
    assignedAt: null,
    createdBy: ws._receptorId || 'desconocido'
  };
  activeEmergencies.set(callId, emergency);

  const ambulance = findNearestAvailableAmbulance(location);
  if (ambulance) {
    emergency.status = 'assigned';
    emergency.assignedAmbulanceId = ambulance.id;
    emergency.assignedAmbulanceName = ambulance.nombre || ambulance.placa;
    emergency.assignedAt = new Date().toISOString();
    ambulance.status = 'en_ruta';
    activeEmergencies.set(callId, emergency);

    console.log(`✅ ${callId} → Ambulancia ${ambulance.id}`);

    sendMessage(ambulance.ws, {
      type: 'new_emergency_assigned',
      callId, location, address, emergencyType, patientInfo, notes,
      timestamp: emergency.timestamp, assignedAt: emergency.assignedAt
    });

    sendMessage(ws, {
      type: 'emergency_assigned_ack',
      callId,
      ambulanceId: ambulance.id,
      ambulanceName: ambulance.nombre || ambulance.placa,
      assignedAt: emergency.assignedAt,
      message: `Ambulancia ${ambulance.nombre || ambulance.id} asignada`
    });

    broadcastToReceptors({
      type: 'emergency_assigned_broadcast',
      callId,
      ambulanceId: ambulance.id,
      ambulanceName: ambulance.nombre || ambulance.placa,
      emergencyType,
      address,
      assignedAt: emergency.assignedAt,
      timestamp: new Date().toISOString()
    });
  } else {
    emergency.status = 'pending_no_ambulance';
    activeEmergencies.set(callId, emergency);
    console.warn(`⚠️ ${callId} sin ambulancia disponible`);
    sendMessage(ws, {
      type: 'emergency_assignment_failed',
      callId,
      message: 'No hay ambulancias disponibles. En espera.'
    });
    broadcastToReceptors({
      type: 'emergency_pending_broadcast',
      callId,
      emergencyType,
      address,
      message: 'Emergencia sin ambulancia disponible — en espera',
      timestamp: new Date().toISOString()
    });
  }

  broadcastActiveEmergencies();
  broadcastActiveAmbulances();
}

function handleRequestActiveEmergencies(ws) {
  sendMessage(ws, {
    type: 'active_emergencies_update',
    emergencies: Array.from(activeEmergencies.values()),
    timestamp: new Date().toISOString()
  });
}

// ---------- LISTA DE HOSPITALES (MODIFICADO) ----------
async function handleRequestHospitalsList(ws) {
  const hospitals = await getHospitalsList();
  sendMessage(ws, {
    type: 'active_hospitals_update',
    hospitals: hospitals,
    total: hospitals.length,
    connected: activeHospitals.size,
    timestamp: new Date().toISOString()
  });
}

// ---------- TRANSFERENCIA DE PACIENTES ----------
async function handlePatientTransferNotification(data) {
  const notificationId = data.notificationId || `notif_${Date.now()}`;
  const payload = { ...data, notificationId, timestamp: new Date().toISOString(), status: 'pending' };
  pendingNotifications.set(notificationId, payload);

  if (data.routeGeometry) {
    pendingEmergencyRoutes.set(notificationId, {
      ambulanceId: data.ambulanceId,
      hospitalId: data.hospitalId,
      routeGeometry: data.routeGeometry,
      distance: data.distance,
      duration: data.duration,
      isEmergencyRoute: data.emergencyMode === 'atender_emergencia'
    });
  }

  if (data.hospitalId) {
    const hospital = activeHospitals.get(data.hospitalId);
    if (hospital && hospital.ws && hospital.ws.readyState === WebSocket.OPEN) {
      sendMessage(hospital.ws, { type: 'patient_transfer_notification', ...payload });
      console.log(`📩 Notificación enviada a hospital ${data.hospitalId}`);
    } else {
      console.log(`❌ Hospital ${data.hospitalId} no encontrado o desconectado`);
    }
  }

  const ambulance = activeAmbulances.get(data.ambulanceId);
  if (ambulance && ambulance.ws) {
    sendMessage(ambulance.ws, {
      type: 'notification_sent',
      notificationId,
      hospitalId: data.hospitalId,
      message: 'Notificación enviada'
    });
  }
}

async function handleHospitalAcceptPatient(data) {
  const notification = pendingNotifications.get(data.notificationId);
  if (!notification) return;
  const pendingRoute = pendingEmergencyRoutes.get(data.notificationId);
  const ambulance = activeAmbulances.get(notification.ambulanceId);

  if (ambulance && ambulance.ws) {
    if (pendingRoute) {
      sendMessage(ambulance.ws, {
        type: 'patient_accepted_with_route',
        notificationId: data.notificationId,
        hospitalId: data.hospitalId,
        hospitalInfo: data.hospitalInfo,
        message: 'Hospital ha aceptado al paciente. Ruta trazada.',
        routeGeometry: pendingRoute.routeGeometry,
        distance: pendingRoute.distance,
        duration: pendingRoute.duration,
        timestamp: new Date().toISOString(),
        isEmergencyRoute: pendingRoute.isEmergencyRoute
      });
    } else {
      sendMessage(ambulance.ws, {
        type: 'patient_accepted',
        notificationId: data.notificationId,
        hospitalId: data.hospitalId,
        hospitalInfo: data.hospitalInfo,
        message: 'Hospital ha aceptado al paciente.',
        timestamp: new Date().toISOString()
      });
    }
    ambulance.status = 'en_ruta';
    rejectedHospitals.delete(notification.ambulanceId);
    pendingEmergencyRoutes.delete(data.notificationId);
    console.log(`✅ Paciente aceptado por hospital ${data.hospitalId}`);
  }

  pendingNotifications.delete(data.notificationId);
  broadcastActiveAmbulances();
  broadcastActiveEmergencies();
}

async function handleHospitalRejectPatient(data) {
  const notification = pendingNotifications.get(data.notificationId);
  if (!notification) return;
  const ambulance = activeAmbulances.get(notification.ambulanceId);

  if (ambulance && ambulance.ws) {
    sendMessage(ambulance.ws, {
      type: 'patient_rejected',
      notificationId: data.notificationId,
      hospitalId: data.hospitalId,
      reason: data.reason || 'No especificado',
      message: 'Hospital no puede aceptar al paciente.',
      timestamp: new Date().toISOString()
    });

    const alreadyRejected = rejectedHospitals.get(notification.ambulanceId) || new Set();
    alreadyRejected.add(data.hospitalId);
    rejectedHospitals.set(notification.ambulanceId, alreadyRejected);
    const rejectedList = Array.from(alreadyRejected);

    const availableHospitals = Array.from(activeHospitals.values())
      .filter(h => !rejectedList.includes(h.info.id) && h.ws && h.ws.readyState === WebSocket.OPEN && h.info.activo !== false)
      .sort((a, b) => {
        if (!notification.ambulanceLocation) return 0;
        const distA = calculateDistance(notification.ambulanceLocation.lat, notification.ambulanceLocation.lng, a.info.lat, a.info.lng);
        const distB = calculateDistance(notification.ambulanceLocation.lat, notification.ambulanceLocation.lng, b.info.lat, b.info.lng);
        return distA - distB;
      });

    if (availableHospitals.length > 0) {
      const nextHospital = availableHospitals[0];
      const newNotificationId = `auto_${Date.now()}`;
      const newNotification = { ...notification, notificationId: newNotificationId, hospitalId: nextHospital.info.id, isAutomatic: true };
      pendingNotifications.set(newNotificationId, newNotification);
      sendMessage(nextHospital.ws, { type: 'patient_transfer_notification', ...newNotification });
      sendMessage(ambulance.ws, {
        type: 'automatic_redirect',
        originalHospitalId: data.hospitalId,
        newHospitalId: nextHospital.info.id,
        hospitalInfo: nextHospital.info,
        rejectedHospitals: rejectedList,
        message: `Solicitud enviada automáticamente a ${nextHospital.info.nombre}`,
        remainingHospitals: availableHospitals.length - 1
      });
    } else {
      sendMessage(ambulance.ws, {
        type: 'no_hospitals_available',
        message: 'Todos los hospitales disponibles han rechazado',
        timestamp: new Date().toISOString()
      });
      pendingEmergencyRoutes.delete(data.notificationId);
    }
  }

  pendingNotifications.delete(data.notificationId);
  console.log(`❌ Paciente rechazado por hospital ${data.hospitalId}`);
  broadcastActiveAmbulances();
}

// ---------- CANCELACIONES ----------
function handleCancelEmergencyMarker(data) {
  const { ambulanceId } = data;
  const ambulance = activeAmbulances.get(ambulanceId);
  if (ambulance && ambulance.ws) {
    sendMessage(ambulance.ws, { type: 'emergency_marker_cancelled', message: 'Marcador eliminado', timestamp: new Date().toISOString() });
  }
  for (const [key, route] of pendingEmergencyRoutes) {
    if (route.ambulanceId === ambulanceId && route.isEmergencyRoute) pendingEmergencyRoutes.delete(key);
  }
}

function handleCancelNavigation(data) {
  const { ambulanceId, hospitalId, routeKey, isEmergencyRoute } = data;
  const ambulance = activeAmbulances.get(ambulanceId);
  if (ambulance) ambulance.status = 'disponible';

  if (routeKey) activeRoutes.delete(routeKey);
  else {
    for (const [key, route] of activeRoutes) {
      if (route.ambulanceId === ambulanceId && route.hospitalId === hospitalId) activeRoutes.delete(key);
    }
  }
  rejectedHospitals.delete(ambulanceId);
  pendingNotifications.forEach((notif, id) => {
    if (notif.ambulanceId === ambulanceId && notif.hospitalId === hospitalId) pendingNotifications.delete(id);
  });
  if (isEmergencyRoute) {
    for (const [key, route] of pendingEmergencyRoutes) {
      if (route.ambulanceId === ambulanceId && route.isEmergencyRoute) pendingEmergencyRoutes.delete(key);
    }
  }
  if (ambulance && ambulance.ws) {
    sendMessage(ambulance.ws, { type: 'navigation_cancelled', message: 'Navegación cancelada', timestamp: new Date().toISOString(), isEmergencyRoute: isEmergencyRoute || false });
  }
  const hospital = activeHospitals.get(hospitalId);
  if (hospital && hospital.ws) {
    sendMessage(hospital.ws, { type: 'navigation_cancelled', ambulanceId, message: 'Ambulancia canceló la navegación', timestamp: new Date().toISOString() });
  }
  broadcastActiveAmbulances();
  broadcastActiveEmergencies();
}

// ---------- RUTAS ----------
async function handleRequestRouteRecompute(ws, data) {
  const { ambulanceId, hospitalId } = data;
  if (!ambulanceId || !hospitalId) return;
  const ambulance = activeAmbulances.get(ambulanceId);
  const hospital = activeHospitals.get(hospitalId);
  if (!ambulance || !ambulance.location || !hospital || !hospital.info.lat) return;

  try {
    const coords = `${ambulance.location.lng},${ambulance.location.lat};${hospital.info.lng},${hospital.info.lat}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}&language=es`;
    const resp = await fetch(url);
    if (!resp.ok) return;
    const json = await resp.json();
    if (!json.routes || json.routes.length === 0) return;
    const route = json.routes[0];
    const routeData = {
      ambulanceId,
      hospitalId,
      routeGeometry: route.geometry.coordinates,
      distance: route.distance,
      duration: route.duration,
      timestamp: new Date().toISOString()
    };
    activeRoutes.set(`${ambulanceId}-${hospitalId}`, { ...routeData, updatedAt: new Date() });
    if (ambulance.ws.readyState === WebSocket.OPEN) {
      sendMessage(ambulance.ws, { type: 'route_updated', ...routeData });
    }
    if (hospital.ws && hospital.ws.readyState === WebSocket.OPEN) {
      sendMessage(hospital.ws, { type: 'route_updated', ambulanceId, hospitalId, routeGeometry: route.geometry.coordinates, distance: route.distance, duration: route.duration });
    }
  } catch (err) {
    console.error('Error recalculando ruta:', err);
  }
}

function handleHospitalNote(data) {
  const { ambulanceId, note } = data;
  const ambulance = activeAmbulances.get(ambulanceId);
  if (ambulance && ambulance.ws) {
    sendMessage(ambulance.ws, { type: 'hospital_note', note: { ...note, timestamp: new Date().toISOString() } });
  }
}

function handleEmergencyCompleted(data) {
  const { ambulanceId, callId } = data;
  console.log(`✅ Emergencia ${callId} completada por ${ambulanceId}`);
  if (callId && activeEmergencies.has(callId)) {
    activeEmergencies.delete(callId);
    broadcastActiveEmergencies();
    broadcastToReceptors({
      type: 'emergency_completed_broadcast',
      callId,
      ambulanceId,
      message: 'Emergencia completada',
      timestamp: new Date().toISOString()
    });
  }
  const ambulance = activeAmbulances.get(ambulanceId);
  if (ambulance && ambulance.status === 'en_ruta') {
    ambulance.status = 'disponible';
    broadcastActiveAmbulances();
  }
}

// ---------- BROADCAST HOSPITALES ACTIVOS A AMBULANCIAS ----------
async function broadcastActiveHospitalsToAmbulances() {
  const hospitals = await getHospitalsList();
  broadcastToAmbulances({
    type: 'active_hospitals_update',
    hospitals: hospitals,
    total: hospitals.length,
    connected: activeHospitals.size,
    timestamp: new Date().toISOString()
  });
}

// ---------- UTILIDADES ----------
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------- LIMPIEZA ----------
function cleanupDisconnectedClient(ws) {
  // Receptores
  if (ws._receptorId) {
    activeReceptors.delete(ws._receptorId);
    console.log(`📞 Receptor ${ws._receptorId} desconectado`);
    return;
  }

  // Hospitales
  for (const [hospitalId, hospitalData] of activeHospitals) {
    if (hospitalData.ws === ws) {
      activeHospitals.delete(hospitalId);
      console.log(`🏥 Hospital ${hospitalId} desconectado`);
      broadcastActiveHospitalsToAmbulances();
      return;
    }
  }

  // Ambulancias
  for (const [ambulanceId, ambulanceData] of activeAmbulances) {
    if (ambulanceData.ws === ws) {
      activeAmbulances.delete(ambulanceId);
      console.log(`🚑 Ambulancia ${ambulanceId} desconectada`);

      for (const [callId, emergency] of activeEmergencies) {
        if (emergency.assignedAmbulanceId === ambulanceId) {
          emergency.status = 'pending';
          emergency.assignedAmbulanceId = null;
          emergency.assignedAmbulanceName = null;
          emergency.assignedAt = null;
          activeEmergencies.set(callId, emergency);
        }
      }
      for (const [key, route] of activeRoutes) {
        if (route.ambulanceId === ambulanceId) activeRoutes.delete(key);
      }
      rejectedHospitals.delete(ambulanceId);
      for (const [key, route] of pendingEmergencyRoutes) {
        if (route.ambulanceId === ambulanceId) pendingEmergencyRoutes.delete(key);
      }
      broadcastActiveAmbulances();
      broadcastActiveEmergencies();
      return;
    }
  }
}

// ---------- PROCESOS AUTOMÁTICOS ----------
setInterval(() => {
  wss.clients.forEach(ws => { if (ws.readyState === WebSocket.OPEN) { try { ws.ping(); } catch (e) {} } });
}, 30000);

setInterval(() => {
  const timeout = 5 * 60 * 1000;
  const now = Date.now();
  activeAmbulances.forEach((ambulance, id) => {
    if (ambulance.lastUpdate && (now - ambulance.lastUpdate.getTime()) > timeout) {
      console.log(`🕒 Limpiando ambulancia inactiva: ${id}`);
      activeAmbulances.delete(id);
      for (const [callId, emergency] of activeEmergencies) {
        if (emergency.assignedAmbulanceId === id) {
          emergency.status = 'pending';
          emergency.assignedAmbulanceId = null;
          emergency.assignedAmbulanceName = null;
          emergency.assignedAt = null;
          activeEmergencies.set(callId, emergency);
        }
      }
      broadcastActiveEmergencies();
      broadcastActiveAmbulances();
    }
  });
}, 60000);

// Recomputación automática de rutas cada 15s
setInterval(async () => {
  for (const [ambulanceId, ambulance] of activeAmbulances) {
    if (ambulance.status !== 'en_ruta' || !ambulance.location) continue;
    let hospitalId = null;
    for (const [, route] of activeRoutes) {
      if (route.ambulanceId === ambulanceId) { hospitalId = route.hospitalId; break; }
    }
    if (!hospitalId) continue;
    const hospital = activeHospitals.get(hospitalId);
    if (!hospital || !hospital.info.lat) continue;
    try {
      const coords = `${ambulance.location.lng},${ambulance.location.lat};${hospital.info.lng},${hospital.info.lat}`;
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}&language=es`;
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const json = await resp.json();
      if (!json.routes || json.routes.length === 0) continue;
      const route = json.routes[0];
      const routeData = {
        ambulanceId,
        hospitalId,
        routeGeometry: route.geometry.coordinates,
        distance: route.distance,
        duration: route.duration,
        timestamp: new Date().toISOString()
      };
      activeRoutes.set(`${ambulanceId}-${hospitalId}`, { ...routeData, updatedAt: new Date() });
      if (ambulance.ws.readyState === WebSocket.OPEN) {
        sendMessage(ambulance.ws, { type: 'route_updated', ...routeData });
      }
      if (hospital.ws && hospital.ws.readyState === WebSocket.OPEN) {
        sendMessage(hospital.ws, { type: 'route_updated', ambulanceId, hospitalId, routeGeometry: route.geometry.coordinates, distance: route.distance, duration: route.duration });
      }
    } catch (e) { /* ignorar */ }
  }
}, 15000);

// ---------- INICIO ----------
const PORT = process.env.WS_PORT || 3002;
server.listen(PORT, () => {
  console.log(`🚀 Servidor WebSocket en puerto ${PORT}`);
  console.log(`📡 WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
  console.log(`📊 Status: http://localhost:${PORT}/api/status`);
});

module.exports = { wss, activeAmbulances, activeHospitals, activeReceptors, activeEmergencies };