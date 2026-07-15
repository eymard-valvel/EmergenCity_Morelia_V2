// websocket-server.js
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

// Almacenamiento
const activeAmbulances = new Map();
const activeHospitals = new Map();
const pendingNotifications = new Map();
const activeRoutes = new Map();
const rejectedHospitals = new Map();
const pendingEmergencyRoutes = new Map();
const activeEmergencies = new Map();

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || 'pk.eyJ1IjoiZXltYXJkMjkiLCJhIjoiY21tcDY4YzNpMGw3bjJzb203YmZyNTVnMyJ9.OvZlnCMfUkUYe6Ib83DUVw';
const geocodeCache = new Map();
const lastLocationBroadcast = new Map();

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
    const queryBase = cleanAddress.includes('méxico') || cleanAddress.includes('mexico')
      ? cleanAddress
      : `${cleanAddress}, México`;
    const q = encodeURIComponent(queryBase);
    const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${MAPBOX_TOKEN}&country=mx&types=address,poi&limit=1&language=es`;

    const mapboxResp = await fetch(mapboxUrl);
    if (mapboxResp.ok) {
      const mapboxData = await mapboxResp.json();
      if (mapboxData.features && mapboxData.features.length > 0) {
        const bestMatch = mapboxData.features[0];
        const result = {
          lat: bestMatch.center[1],
          lng: bestMatch.center[0],
          place_name: bestMatch.place_name,
          relevance: bestMatch.relevance || 1,
          address: bestMatch.place_name
        };
        geocodeCache.set(cleanAddress, result);
        return result;
      }
    }

    const nominatimQuery = encodeURIComponent(`${cleanAddress}, Michoacán, México`);
    const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${nominatimQuery}&countrycodes=mx&limit=1`;
    const fallbackResp = await fetch(fallbackUrl);
    if (fallbackResp.ok) {
      const fallbackData = await fallbackResp.json();
      if (fallbackData.length > 0) {
        const result = {
          lat: parseFloat(fallbackData[0].lat),
          lng: parseFloat(fallbackData[0].lon),
          place_name: fallbackData[0].display_name,
          address: fallbackData[0].display_name
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
async function broadcastActiveHospitalsToAmbulances() {
  try {
    const allHospitals = await getAllHospitalsFromDB();
    const enriched = allHospitals.map(h => {
      const active = activeHospitals.get(h.id);
      return {
        ...h,
        connected: !!active,
        lat: active?.info.lat || h.lat,
        lng: active?.info.lng || h.lng,
        especialidades: active?.info.especialidades || h.especialidades,
        camasDisponibles: active?.info.camasDisponibles ?? h.camasDisponibles,
        telefono: active?.info.telefono || h.telefono,
        activo: true
      };
    });

    broadcastToAmbulances({
      type: 'active_hospitals_update',
      hospitals: enriched,
      connectedIds: Array.from(activeHospitals.keys()),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error broadcastActiveHospitalsToAmbulances:', err);
  }
}

function broadcastToAmbulances(message) {
  const messageStr = JSON.stringify(message);
  let sentCount = 0;
  activeAmbulances.forEach((ambulance) => {
    if (ambulance.ws && ambulance.ws.readyState === WebSocket.OPEN) {
      try {
        ambulance.ws.send(messageStr);
        sentCount++;
      } catch (e) {
        console.error('Error enviando a ambulancia:', ambulance.id, e);
      }
    }
  });
  console.log(`📤 Broadcast a ${sentCount} ambulancias: ${message.type}`);
}

function broadcastToHospitals(message) {
  const messageStr = JSON.stringify(message);
  let sentCount = 0;
  activeHospitals.forEach((hospital) => {
    if (hospital.ws && hospital.ws.readyState === WebSocket.OPEN) {
      try {
        hospital.ws.send(messageStr);
        sentCount++;
      } catch (e) {
        console.error('Error enviando a hospital:', hospital.info.id, e);
      }
    }
  });
  console.log(`📤 Broadcast a ${sentCount} hospitales: ${message.type}`);
}

function broadcastActiveAmbulances() {
  const ambulancesList = Array.from(activeAmbulances.values()).map(ambulance => ({
    id: ambulance.id,
    placa: ambulance.placa,
    nombre: ambulance.nombre || ambulance.placa,
    tipo: ambulance.tipo,
    status: ambulance.status,
    location: ambulance.location,
    speed: ambulance.speed,
    heading: ambulance.heading,
    lastUpdate: ambulance.lastUpdate
  }));

  const message = {
    type: 'active_ambulances_update',
    ambulances: ambulancesList,
    timestamp: new Date().toISOString()
  };

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(message));
      } catch (e) {}
    }
  });
  broadcastToHospitals(message);
}

function broadcastActiveEmergencies() {
  const list = Array.from(activeEmergencies.values());
  const message = {
    type: 'active_emergencies_update',
    emergencies: list,
    timestamp: new Date().toISOString()
  };
  const messageStr = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(messageStr);
      } catch (e) {}
    }
  });
}

// ---------- CONSULTA HOSPITALES ----------
async function getAllHospitalsFromDB() {
  try {
    const hospitals = await prisma.hospitales.findMany({
      select: {
        id_hospitales: true,
        nombre: true,
        direccion: true
      }
    });

    return hospitals.map(hospital => ({
      id: hospital.id_hospitales.toString(),
      nombre: hospital.nombre || `Hospital ${hospital.id_hospitales}`,
      direccion: hospital.direccion || '',
      lat: null,
      lng: null,
      especialidades: ['General'],
      camasDisponibles: 10,
      telefono: '',
      activo: true,
      connected: false
    }));
  } catch (error) {
    console.error('❌ Error consultando hospitales desde DB:', error);
    return [];
  }
}

// ---------- HTTP ENDPOINTS ----------
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeAmbulances: activeAmbulances.size,
    activeHospitals: activeHospitals.size,
    pendingNotifications: pendingNotifications.size,
    activeRoutes: activeRoutes.size,
    activeEmergencies: activeEmergencies.size,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/all-hospitals', async (req, res) => {
  try {
    const hospitalsFromDB = await getAllHospitalsFromDB();
    const hospitalsWithCoords = await Promise.all(
      hospitalsFromDB.map(async (hospital) => {
        if (hospital.direccion && hospital.direccion.trim() !== '') {
          const activeHospital = activeHospitals.get(hospital.id);
          if (activeHospital && activeHospital.info.lat && activeHospital.info.lng) {
            hospital.lat = activeHospital.info.lat;
            hospital.lng = activeHospital.info.lng;
          } else {
            const geoResult = await geocodeAddress(hospital.direccion);
            if (geoResult) {
              hospital.lat = geoResult.lat;
              hospital.lng = geoResult.lng;
            }
          }
        }
        return hospital;
      })
    );

    const hospitalsWithStatus = hospitalsWithCoords.map(hospital => ({
      ...hospital,
      connected: activeHospitals.has(hospital.id),
      status: activeHospitals.has(hospital.id) ? 'active' : 'inactive'
    }));

    res.json({
      hospitals: hospitalsWithStatus,
      total: hospitalsWithStatus.length,
      connected: activeHospitals.size
    });
  } catch (error) {
    console.error('❌ Error en /api/all-hospitals:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/geocode', async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: 'Se requiere la dirección' });
    const result = await geocodeAddress(address);
    if (!result) return res.status(404).json({ error: 'No se pudo geocodificar la dirección' });
    res.json(result);
  } catch (error) {
    console.error('Error en /geocode:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
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
    const results = (data.features || []).map(feature => ({
      id: feature.id,
      place_name: feature.place_name,
      lat: feature.center[1],
      lng: feature.center[0],
      type: feature.place_type[0],
      address: feature.properties?.address || '',
      relevance: feature.relevance
    }));
    res.json(results);
  } catch (error) {
    console.error('Error en /search-addresses:', error);
    res.status(500).json({ error: 'Error en búsqueda' });
  }
});

app.post('/directions', async (req, res) => {
  try {
    const { startLng, startLat, endLng, endLat } = req.body;
    if (!startLng || !startLat || !endLng || !endLat) {
      return res.status(400).json({ error: 'Coordenadas incompletas' });
    }
    const coords = `${startLng},${startLat};${endLng},${endLat}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    if (!json.routes || json.routes.length === 0) {
      return res.status(404).json({ error: 'No se encontraron rutas' });
    }
    const route = json.routes[0];
    res.json({
      geometry: route.geometry.coordinates,
      distance: route.distance,
      duration: route.duration,
      summary: `${(route.distance / 1000).toFixed(1)} km, ${Math.round(route.duration / 60)} min`,
      steps: route.legs?.[0]?.steps || []
    });
  } catch (error) {
    console.error('Error en /directions:', error);
    res.status(500).json({ error: 'Error calculando ruta' });
  }
});

// ---------- WEBSOCKET ----------
wss.on('connection', (ws, req) => {
  console.log('✅ Nueva conexión WebSocket establecida');

  ws.send(JSON.stringify({
    type: 'connection_established',
    message: 'Conexión WebSocket establecida correctamente',
    timestamp: new Date().toISOString()
  }));

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`📨 Mensaje recibido: ${data.type} (desde ${ws._socket?.remoteAddress || 'desconocido'})`);
      await handleMessage(ws, data);
    } catch (error) {
      console.error('❌ Error procesando mensaje:', error);
      sendError(ws, 'Formato de mensaje JSON inválido');
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`🔌 Conexión cerrada: ${code} - ${reason}`);
    cleanupDisconnectedClient(ws);
  });

  ws.on('error', (error) => {
    console.error('❌ Error WebSocket:', error);
  });
});

async function handleMessage(ws, data) {
  switch (data.type) {
    case 'register_ambulance':
      await handleRegisterAmbulance(ws, data);
      break;
    case 'register_hospital':
      await handleRegisterHospital(ws, data);
      break;
    case 'register_receptor':
      console.log(`📞 Receptor registrado: ${data.receptorId || 'desconocido'}`);
      sendMessage(ws, {
        type: 'active_emergencies_update',
        emergencies: Array.from(activeEmergencies.values()),
        timestamp: new Date().toISOString()
      });
      broadcastActiveAmbulances();
      break;
    case 'location_update':
      handleLocationUpdate(data);
      break;
    case 'emergency_call':
      await handleEmergencyCall(ws, data);
      break;
    case 'request_active_emergencies':
      handleRequestActiveEmergencies(ws);
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
    case 'request_route_update':
      handleRequestRouteUpdate(ws, data);
      break;
    case 'request_route_recompute':
      await handleRequestRouteRecompute(ws, data);
      break;
    case 'hospital_note':
      handleHospitalNote(data);
      break;
    case 'request_hospitals_list':
      await handleRequestHospitalsList(ws);
      break;
    case 'get_all_hospitals':
      await handleGetAllHospitals(ws);
      break;
    case 'asignar_paciente_doctor':
      handleAsignarDoctor(ws, data);
      break;
    case 'nuevo_reporte_paciente':
      handleNuevoReportePaciente(ws, data);
      break;
    default:
      console.log('⚠️ Mensaje no manejado:', data.type);
      break;
  }
}

// ---------- REGISTROS ----------
async function handleRegisterAmbulance(ws, data) {
  if (!data.ambulance || !data.ambulance.id) {
    return sendError(ws, 'Datos de ambulancia incompletos');
  }

  const ambulanceData = {
    id: data.ambulance.id,
    placa: data.ambulance.placa || 'ABC123',
    nombre: data.ambulance.nombre || data.ambulance.placa || 'Ambulancia',
    tipo: data.ambulance.tipo || 'UVI Móvil',
    status: data.ambulance.status || 'disponible',
    location: data.ambulance.location || null,
    speed: 0,
    heading: 0,
    ws: ws,
    lastUpdate: new Date()
  };

  activeAmbulances.set(ambulanceData.id, ambulanceData);
  console.log(`🚑 Ambulancia registrada: ${ambulanceData.id} (${ambulanceData.nombre}) - Estado: ${ambulanceData.status}`);

  await handleRequestHospitalsList(ws);
  handleRequestActiveEmergencies(ws);
  broadcastActiveAmbulances();
  broadcastActiveEmergencies();
}

async function handleRegisterHospital(ws, data) {
  if (!data.hospital || !data.hospital.id) return sendError(ws, 'Datos de hospital incompletos');

  try {
    let hospitalData = {
      info: {
        id: data.hospital.id,
        nombre: data.hospital.nombre || 'Hospital',
        direccion: data.hospital.direccion || '',
        lat: data.hospital.lat || null,
        lng: data.hospital.lng || null,
        especialidades: data.hospital.especialidades || ['General'],
        camasDisponibles: data.hospital.camasDisponibles || 10,
        telefono: data.hospital.telefono || '',
        activo: data.hospital.activo !== undefined ? data.hospital.activo : true
      },
      ws: ws,
      connectedAt: new Date().toISOString()
    };

    if ((!hospitalData.info.lat || !hospitalData.info.lng) && hospitalData.info.direccion) {
      const geoResult = await geocodeAddress(hospitalData.info.direccion);
      if (geoResult) {
        hospitalData.info.lat = geoResult.lat;
        hospitalData.info.lng = geoResult.lng;
      } else {
        hospitalData.info.lat = 19.7024;
        hospitalData.info.lng = -101.1969;
      }
    }

    activeHospitals.set(hospitalData.info.id, hospitalData);
    console.log(`🏥 Hospital registrado: ${hospitalData.info.nombre} (${hospitalData.info.id})`);

    const ambulancesList = Array.from(activeAmbulances.values()).map(ambulance => ({
      id: ambulance.id,
      placa: ambulance.placa,
      nombre: ambulance.nombre,
      tipo: ambulance.tipo,
      status: ambulance.status,
      location: ambulance.location,
      speed: ambulance.speed,
      heading: ambulance.heading,
      lastUpdate: ambulance.lastUpdate
    }));

    sendMessage(ws, {
      type: 'active_ambulances_update',
      ambulances: ambulancesList,
      hospitalInfo: hospitalData.info,
      message: `${ambulancesList.length} ambulancias activas`
    });

    const relevantRoutes = [];
    for (let [key, route] of activeRoutes) {
      if (route.hospitalId === hospitalData.info.id) {
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
      sendMessage(ws, {
        type: 'active_routes_update',
        routes: relevantRoutes,
        message: 'Rutas activas hacia este hospital'
      });
    }

    await broadcastActiveHospitalsToAmbulances();
    sendMessage(ws, {
      type: 'hospital_registered',
      hospitalInfo: hospitalData.info,
      message: 'Hospital registrado correctamente'
    });

  } catch (error) {
    console.error('❌ Error en register hospital:', error);
    sendError(ws, 'Error interno del servidor');
  }
}

// ---------- UBICACIÓN ----------
function handleLocationUpdate(data) {
  const ambulanceId = data.ambulanceId;
  if (!ambulanceId) return;

  const ambulance = activeAmbulances.get(ambulanceId);
  if (ambulance) {
    ambulance.location = data.location || ambulance.location;
    ambulance.speed = data.speed || ambulance.speed;
    ambulance.heading = data.heading || ambulance.heading;
    if (data.status) ambulance.status = data.status;
    ambulance.lastUpdate = new Date();

    const now = Date.now();
    const last = lastLocationBroadcast.get(ambulanceId) || 0;
    if (now - last >= 2000) {
      lastLocationBroadcast.set(ambulanceId, now);
      broadcastToHospitals({
        type: 'location_update',
        ambulanceId: ambulanceId,
        location: ambulance.location,
        speed: ambulance.speed,
        heading: ambulance.heading,
        status: ambulance.status,
        timestamp: new Date().toISOString()
      });
    }
    console.log(`📍 Ubicación actualizada: ${ambulanceId} - ${ambulance.speed} km/h`);
  }
}

// ---------- ASIGNACIÓN AUTOMÁTICA ----------
function findNearestAvailableAmbulance(emergencyLocation) {
  let best = null;
  let bestDist = Infinity;
  for (const [id, amb] of activeAmbulances.entries()) {
    if (amb.status === 'disponible' && amb.location) {
      const d = calculateDistance(
        emergencyLocation.lat, emergencyLocation.lng,
        amb.location.lat, amb.location.lng
      );
      if (d < bestDist) {
        bestDist = d;
        best = amb;
      }
    }
  }
  return best;
}

async function handleEmergencyCall(ws, data) {
  const { callId, location, address, emergencyType, patientInfo, notes, timestamp } = data;
  if (!callId || !location) {
    return sendError(ws, 'Datos incompletos para emergencia');
  }

  console.log(`🚨 Procesando emergencia ${callId} en ubicación:`, location);
  console.log(`   Ambulancias disponibles: ${Array.from(activeAmbulances.values()).filter(a => a.status === 'disponible').length}`);

  // Crear registro
  const emergency = {
    callId,
    location,
    address: address || 'Sin dirección',
    emergencyType: emergencyType || 'No especificado',
    patientInfo: patientInfo || {},
    notes: notes || '',
    timestamp: timestamp || new Date().toISOString(),
    status: 'pending',
    assignedAmbulanceId: null,
    assignedAmbulanceName: null,
    assignedAt: null
  };
  activeEmergencies.set(callId, emergency);

  // Buscar ambulancia
  const ambulance = findNearestAvailableAmbulance(location);
  if (ambulance) {
    emergency.status = 'assigned';
    emergency.assignedAmbulanceId = ambulance.id;
    emergency.assignedAmbulanceName = ambulance.nombre || ambulance.placa;
    emergency.assignedAt = new Date().toISOString();
    ambulance.status = 'en_ruta';
    activeEmergencies.set(callId, emergency);

    console.log(`✅ Emergencia ${callId} asignada a ambulancia ${ambulance.id} (${ambulance.nombre})`);

    // Notificar a la ambulancia
    if (ambulance.ws && ambulance.ws.readyState === WebSocket.OPEN) {
      console.log(`📤 Enviando new_emergency_assigned a ambulancia ${ambulance.id}`);
      sendMessage(ambulance.ws, {
        type: 'new_emergency_assigned',
        callId,
        location,
        address,
        emergencyType,
        patientInfo,
        notes,
        timestamp,
        assignedAt: emergency.assignedAt
      });
    } else {
      console.error(`❌ No se pudo enviar a ambulancia ${ambulance.id}: WebSocket no abierto`);
    }

    // Confirmar al receptor
    sendMessage(ws, {
      type: 'emergency_assigned_ack',
      callId,
      ambulanceId: ambulance.id,
      ambulanceName: ambulance.nombre || ambulance.placa,
      assignedAt: emergency.assignedAt,
      message: `Ambulancia ${ambulance.nombre || ambulance.id} asignada`
    });

  } else {
    emergency.status = 'pending_no_ambulance';
    activeEmergencies.set(callId, emergency);
    console.warn(`⚠️ Emergencia ${callId} sin ambulancia disponible`);
    sendMessage(ws, {
      type: 'emergency_assignment_failed',
      callId,
      message: 'No hay ambulancias disponibles en este momento. Queda en espera.'
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

// ---------- FUNCIONES EXISTENTES (con ligeras adaptaciones) ----------
async function handlePatientTransferNotification(data) {
  const notificationId = data.notificationId || `notif_${Date.now()}`;

  const payload = {
    ...data,
    notificationId: notificationId,
    timestamp: new Date().toISOString(),
    status: 'pending',
    routeGeometry: null
  };

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
      sendMessage(hospital.ws, {
        type: 'patient_transfer_notification',
        ...payload
      });
      console.log(`📩 Notificación enviada a hospital ${data.hospitalId}`);
    } else {
      console.log(`❌ Hospital ${data.hospitalId} no encontrado o desconectado`);
    }
  }

  const ambulance = activeAmbulances.get(data.ambulanceId);
  if (ambulance && ambulance.ws) {
    sendMessage(ambulance.ws, {
      type: 'notification_sent',
      notificationId: notificationId,
      hospitalId: data.hospitalId,
      message: 'Notificación enviada correctamente'
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
        message: 'Hospital ha aceptado al paciente. Proceda con el traslado.',
        timestamp: new Date().toISOString()
      });
    }

    ambulance.status = 'en_ruta';

    if (rejectedHospitals.has(notification.ambulanceId)) {
      rejectedHospitals.delete(notification.ambulanceId);
    }

    pendingEmergencyRoutes.delete(data.notificationId);

    console.log(`✅ Paciente aceptado por hospital ${data.hospitalId}`);
  }

  pendingNotifications.delete(data.notificationId);
  broadcastActiveAmbulances();
  broadcastActiveEmergencies(); // por si la emergencia cambia de estado
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
    const rejectedList = Array.from(alreadyRejected);
    rejectedList.push(data.hospitalId);

    const availableHospitals = Array.from(activeHospitals.values())
      .filter(hospital => {
        const hasRejected = rejectedList.includes(hospital.info.id);
        const isConnected = hospital.ws && hospital.ws.readyState === WebSocket.OPEN;
        const isActive = hospital.info.activo !== false;

        return !hasRejected && isConnected && isActive;
      })
      .sort((a, b) => {
        const distA = calculateDistance(
          notification.ambulanceLocation.lat, notification.ambulanceLocation.lng,
          a.info.lat, a.info.lng
        );
        const distB = calculateDistance(
          notification.ambulanceLocation.lat, notification.ambulanceLocation.lng,
          b.info.lat, b.info.lng
        );
        return distA - distB;
      });

    if (availableHospitals.length > 0) {
      const nextHospital = availableHospitals[0];

      const newNotificationId = `auto_${Date.now()}`;
      const newNotification = {
        ...notification,
        notificationId: newNotificationId,
        hospitalId: nextHospital.info.id,
        isAutomatic: true
      };

      pendingNotifications.set(newNotificationId, newNotification);

      if (nextHospital.ws && nextHospital.ws.readyState === WebSocket.OPEN) {
        sendMessage(nextHospital.ws, {
          type: 'patient_transfer_notification',
          ...newNotification
        });

        sendMessage(ambulance.ws, {
          type: 'automatic_redirect',
          originalHospitalId: data.hospitalId,
          newHospitalId: nextHospital.info.id,
          hospitalInfo: nextHospital.info,
          rejectedHospitals: rejectedList,
          message: `Solicitud enviada automáticamente a ${nextHospital.info.nombre}`,
          remainingHospitals: availableHospitals.length - 1
        });

        console.log(`🔄 Solicitud enviada a hospital ${nextHospital.info.id}`);
      }
    } else {
      sendMessage(ambulance.ws, {
        type: 'no_hospitals_available',
        message: 'Todos los hospitales disponibles han rechazado la solicitud',
        timestamp: new Date().toISOString()
      });

      pendingEmergencyRoutes.delete(data.notificationId);
    }

    console.log(`❌ Paciente rechazado por hospital ${data.hospitalId}`);
  }

  pendingNotifications.delete(data.notificationId);
  broadcastActiveAmbulances();
}

function handleCancelEmergencyMarker(data) {
  const { ambulanceId } = data;
  console.log(`🗑️ Cancelando marcador de emergencia para ambulancia: ${ambulanceId}`);

  const ambulance = activeAmbulances.get(ambulanceId);
  if (ambulance && ambulance.ws) {
    sendMessage(ambulance.ws, {
      type: 'emergency_marker_cancelled',
      message: 'Marcador de emergencia eliminado',
      timestamp: new Date().toISOString()
    });
  }

  for (let [key, route] of pendingEmergencyRoutes.entries()) {
    if (route.ambulanceId === ambulanceId && route.isEmergencyRoute) {
      pendingEmergencyRoutes.delete(key);
    }
  }
}

function handleCancelNavigation(data) {
  const { ambulanceId, hospitalId, routeKey, isEmergencyRoute } = data;

  console.log(`🛑 Cancelando navegación: ambulancia ${ambulanceId}, hospital ${hospitalId}`);

  const ambulance = activeAmbulances.get(ambulanceId);
  if (ambulance) {
    ambulance.status = 'disponible';
  }

  if (routeKey) {
    activeRoutes.delete(routeKey);
  } else {
    for (let [key, route] of activeRoutes.entries()) {
      if (route.ambulanceId === ambulanceId && route.hospitalId === hospitalId) {
        activeRoutes.delete(key);
      }
    }
  }

  rejectedHospitals.delete(ambulanceId);

  pendingNotifications.forEach((notif, id) => {
    if (notif.ambulanceId === ambulanceId && notif.hospitalId === hospitalId) {
      pendingNotifications.delete(id);
    }
  });

  if (isEmergencyRoute) {
    for (let [key, route] of pendingEmergencyRoutes.entries()) {
      if (route.ambulanceId === ambulanceId && route.isEmergencyRoute) {
        pendingEmergencyRoutes.delete(key);
      }
    }
  }

  if (ambulance && ambulance.ws) {
    sendMessage(ambulance.ws, {
      type: 'navigation_cancelled',
      message: 'Navegación cancelada',
      timestamp: new Date().toISOString(),
      isEmergencyRoute: isEmergencyRoute || false
    });
  }

  const hospital = activeHospitals.get(hospitalId);
  if (hospital && hospital.ws) {
    sendMessage(hospital.ws, {
      type: 'navigation_cancelled',
      ambulanceId: ambulanceId,
      message: 'Ambulancia canceló la navegación',
      timestamp: new Date().toISOString()
    });
  }

  broadcastActiveAmbulances();
  broadcastActiveEmergencies();
}

function handleHospitalNote(data) {
  const { ambulanceId, note } = data;

  const ambulance = activeAmbulances.get(ambulanceId);
  if (ambulance && ambulance.ws) {
    sendMessage(ambulance.ws, {
      type: 'hospital_note',
      note: {
        ...note,
        timestamp: new Date().toISOString()
      }
    });
    console.log(`💌 Nota enviada a ambulancia ${ambulanceId}`);
  }
}

function handleRequestRouteUpdate(ws, data) {
  const { ambulanceId, hospitalId } = data;
  if (!ambulanceId) return;

  const routes = [];
  for (let [key, route] of activeRoutes.entries()) {
    if (route.ambulanceId === ambulanceId) {
      if (!hospitalId || route.hospitalId === hospitalId) {
        routes.push({
          routeKey: key,
          routeGeometry: route.routeGeometry,
          distance: route.distance,
          duration: route.duration,
          hospitalId: route.hospitalId
        });
      }
    }
  }

  sendMessage(ws, {
    type: 'route_update',
    ambulanceId: ambulanceId,
    routes: routes
  });
}

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

    activeRoutes.set(`${ambulanceId}-${hospitalId}`, {
      ...routeData,
      updatedAt: new Date()
    });

    if (ambulance.ws.readyState === WebSocket.OPEN) {
      sendMessage(ambulance.ws, {
        type: 'route_updated',
        ...routeData,
        message: 'Ruta actualizada con tráfico en tiempo real'
      });
    }

    if (hospital.ws.readyState === WebSocket.OPEN) {
      sendMessage(hospital.ws, {
        type: 'route_updated',
        ambulanceId,
        hospitalId,
        routeGeometry: route.geometry.coordinates,
        distance: route.distance,
        duration: route.duration,
        message: 'Ruta actualizada desde servidor con condiciones de tráfico'
      });
    }
  } catch (err) {
    console.error('Error recalculando ruta:', err);
  }
}

async function handleRequestHospitalsList(ws) {
  try {
    const hospitalsFromDB = await getAllHospitalsFromDB();

    const hospitalsWithCoords = [];
    for (const hospital of hospitalsFromDB) {
      try {
        if (hospital.direccion && hospital.direccion.trim() !== '') {
          const activeHospital = activeHospitals.get(hospital.id);
          if (activeHospital && activeHospital.info.lat && activeHospital.info.lng) {
            hospital.lat = activeHospital.info.lat;
            hospital.lng = activeHospital.info.lng;
          } else {
            const geoResult = await geocodeAddress(hospital.direccion);
            if (geoResult) {
              hospital.lat = geoResult.lat;
              hospital.lng = geoResult.lng;
            }
          }
        }
      } catch (err) {
        console.error(`Error geocoding hospital ${hospital.id}:`, err);
      }
      hospitalsWithCoords.push(hospital);
    }

    const hospitalsWithStatus = hospitalsWithCoords.map(hospital => ({
      ...hospital,
      connected: activeHospitals.has(hospital.id),
      activo: true,
      status: activeHospitals.has(hospital.id) ? 'active' : 'inactive'
    }));

    sendMessage(ws, {
      type: 'active_hospitals_update',
      hospitals: hospitalsWithStatus,
      total: hospitalsWithStatus.length,
      connected: activeHospitals.size,
      message: `${hospitalsWithStatus.length} hospitales en sistema (${activeHospitals.size} conectados)`
    });
  } catch (error) {
    console.error('❌ Error obteniendo hospitales:', error);
    sendError(ws, 'Error obteniendo lista de hospitales');
  }
}

async function handleGetAllHospitals(ws) {
  try {
    const hospitalsFromDB = await getAllHospitalsFromDB();

    const hospitalsWithCoords = await Promise.all(
      hospitalsFromDB.map(async (hospital) => {
        if (hospital.direccion && hospital.direccion.trim() !== '') {
          const activeHospital = activeHospitals.get(hospital.id);
          if (activeHospital && activeHospital.info.lat && activeHospital.info.lng) {
            hospital.lat = activeHospital.info.lat;
            hospital.lng = activeHospital.info.lng;
          } else {
            const geoResult = await geocodeAddress(hospital.direccion);
            if (geoResult) {
              hospital.lat = geoResult.lat;
              hospital.lng = geoResult.lng;
            }
          }
        }
        return hospital;
      })
    );

    const hospitalsWithStatus = hospitalsWithCoords.map(hospital => ({
      ...hospital,
      connected: activeHospitals.has(hospital.id),
      activo: hospital.activo
    }));

    sendMessage(ws, {
      type: 'all_hospitals_list',
      hospitals: hospitalsWithStatus,
      total: hospitalsWithStatus.length,
      connected: activeHospitals.size
    });
  } catch (error) {
    console.error('❌ Error obteniendo hospitales:', error);
    sendError(ws, 'Error obteniendo lista de hospitales');
  }
}

function handleAsignarDoctor(ws, data) {
  const { targetDoctorId, reporte, hospitalId } = data;

  console.log(`[SERVER] 👨‍⚕️ Hospital ${hospitalId} asigna paciente a Doctor ID: ${targetDoctorId}`);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'asignar_paciente_doctor',
        targetDoctorId: String(targetDoctorId),
        hospitalId: hospitalId,
        reporte: reporte
      }));
    }
  });

  sendMessage(ws, {
    type: 'doctor_asignado_ok',
    message: `Asignación enviada a la red.`
  });
}

function handleNuevoReportePaciente(ws, data) {
  try {
    const { targetHospitalId, reporte } = data;

    console.log(`[SERVER] 📥 Buscando hospital con ID: "${targetHospitalId}"`);

    let hospitalDestino = activeHospitals.get(targetHospitalId);

    if (!hospitalDestino) {
      hospitalDestino = activeHospitals.get(String(targetHospitalId));
    }

    if (!hospitalDestino) {
      hospitalDestino = activeHospitals.get(Number(targetHospitalId));
    }

    if (!hospitalDestino) {
      console.log(`[SERVER] ❌ Hospital ID ${targetHospitalId} NO ENCONTRADO en la lista de activos.`);
      sendError(ws, `El hospital seleccionado (ID: ${targetHospitalId}) no está conectado.`);
      return;
    }

    if (hospitalDestino.ws && hospitalDestino.ws.readyState === WebSocket.OPEN) {
      console.log(`[SERVER] 📤 Enviando reporte a: ${hospitalDestino.info.nombre}`);

      hospitalDestino.ws.send(JSON.stringify({
        type: 'recepcion_reporte_paciente',
        reporte: reporte
      }));

      sendMessage(ws, {
        type: 'reporte_enviado_ok',
        message: `Notificación enviada a ${hospitalDestino.info.nombre}`
      });

    } else {
      console.log(`[SERVER] ⚠️ El hospital existe pero el socket está cerrado.`);
      activeHospitals.delete(targetHospitalId);
    }

  } catch (error) {
    console.error('[SERVER] 💥 Error fatal en handleNuevoReportePaciente:', error);
  }
}

// ---------- UTILIDADES ----------
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

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

function cleanupDisconnectedClient(ws) {
  // Limpiar hospitales
  for (let [hospitalId, hospitalData] of activeHospitals.entries()) {
    if (hospitalData.ws === ws) {
      activeHospitals.delete(hospitalId);
      console.log(`🏥 Hospital ${hospitalId} desconectado`);
      broadcastActiveHospitalsToAmbulances();
      break;
    }
  }

  // Limpiar ambulancias
  for (let [ambulanceId, ambulanceData] of activeAmbulances.entries()) {
    if (ambulanceData.ws === ws) {
      activeAmbulances.delete(ambulanceId);
      console.log(`🚑 Ambulancia ${ambulanceId} desconectada`);
      // Actualizar emergencias asignadas
      for (let [callId, emergency] of activeEmergencies.entries()) {
        if (emergency.assignedAmbulanceId === ambulanceId) {
          emergency.status = 'pending';
          emergency.assignedAmbulanceId = null;
          emergency.assignedAmbulanceName = null;
          emergency.assignedAt = null;
          activeEmergencies.set(callId, emergency);
        }
      }
      // Limpiar rutas
      for (let [key, route] of activeRoutes.entries()) {
        if (route.ambulanceId === ambulanceId) activeRoutes.delete(key);
      }
      rejectedHospitals.delete(ambulanceId);
      for (let [key, route] of pendingEmergencyRoutes.entries()) {
        if (route.ambulanceId === ambulanceId) pendingEmergencyRoutes.delete(key);
      }
      broadcastActiveAmbulances();
      broadcastActiveEmergencies();
      break;
    }
  }
}

// ---------- CLEANUP Y HEARTBEAT ----------
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000;

  activeAmbulances.forEach((ambulance, id) => {
    if (ambulance.lastUpdate && (now - ambulance.lastUpdate.getTime()) > timeout) {
      console.log(`🕒 Limpiando ambulancia inactiva: ${id}`);
      activeAmbulances.delete(id);
      // Actualizar emergencias
      for (let [callId, emergency] of activeEmergencies.entries()) {
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

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.ping(); } catch (e) {}
    }
  });
}, 30000);

// ---------- RECOMPUTACIÓN DE RUTAS ----------
setInterval(async () => {
  for (let [ambulanceId, ambulance] of activeAmbulances) {
    if (ambulance.status !== 'en_ruta') continue;
    let hospitalId = null;
    for (let [key, route] of activeRoutes) {
      if (route.ambulanceId === ambulanceId) {
        hospitalId = route.hospitalId;
        break;
      }
    }
    if (!hospitalId) continue;
    const hospital = activeHospitals.get(hospitalId);
    if (!hospital || !hospital.info.lat) continue;
    if (!ambulance.location) continue;

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
      if (hospital.ws.readyState === WebSocket.OPEN) {
        sendMessage(hospital.ws, {
          type: 'route_updated',
          ambulanceId,
          hospitalId,
          routeGeometry: route.geometry.coordinates,
          distance: route.distance,
          duration: route.duration,
          timestamp: routeData.timestamp
        });
      }
    } catch (e) { /* ignorar */ }
  }
}, 15000);

// ---------- INICIO ----------
const PORT = process.env.WS_PORT || 3002;
server.listen(PORT, () => {
  console.log(`🚀 Servidor WebSocket ejecutándose en puerto ${PORT}`);
  console.log(`📡 Endpoint WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`🏥 API Hospitales (todos): http://localhost:${PORT}/api/all-hospitals`);
  console.log(`🗺️  Geocoding API: http://localhost:${PORT}/geocode`);
  console.log(`🔍 Search API: http://localhost:${PORT}/search-addresses`);
  console.log(`🛣️  Directions API: http://localhost:${PORT}/directions`);
});

module.exports = { wss, activeAmbulances, activeHospitals, rejectedHospitals, activeEmergencies };