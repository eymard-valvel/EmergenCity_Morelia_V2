const express = require('express')
const app = express()
const cors = require('cors')
const { swaggerUi, swaggerDocs } = require('./config/swagger')
const cookieParser = require('cookie-parser')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const dotenv = require('dotenv')
dotenv.config()

const seed = require('./routes/seed.js')
const auth = require('./routes/auth.js')
const ambulancia = require('./routes/ambulancias.js')
const paramedico = require('./routes/paramedico.js')
const hospital = require('./routes/hospital.js')
const operador = require('./routes/operador.js')
const doctor = require('./routes/doctor.js')
const reportePrehospitalario = require('./routes/reportePrehospitalario.js')
const receptor = require('./routes/receptor.js')
const nlpRoutes = require('./routes/nlp')
const FOURSQUARE_KEY = process.env.FOURSQUARE_KEY || '';
const FOURSQUARE_BASE = 'https://places-api.foursquare.com/places/search';

const { attachV2WebSocket } = require('./ws-core')

// CORS
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))

const PORT = process.env.PORT || 3000

// ==================== RUTAS EXISTENTES (SIN CAMBIOS) ====================
app.use(express.json())
app.use(cookieParser())
app.use(cors())

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs))
app.use('/seed', seed)
app.use('/auth', auth)
app.use('/ambulancias', ambulancia)
app.use('/paramedico', paramedico)
app.use('/hospital', hospital)
app.use('/operador', operador)
app.use('/doctor', doctor)
app.use('/reporte-prehospitalario', reportePrehospitalario)
app.use('/receptor', receptor)
app.use('/api/nlp', nlpRoutes)

// ==================== ESTADO COMPARTIDO CON WS ====================
// Después de attachV2WebSocket(server) tendremos acceso a estas estructuras.
let wsState = null

// ==================== RUTAS HTTP COMPATIBLES CON EL WS ====================
app.get('/api/ambulances/active', (req, res) => {
  if (!wsState) return res.json({ success: true, data: [], total: 0 })
  const ambulancesList = Array.from(wsState.activeAmbulances.values()).map(amb => ({
    id: amb.id, placa: amb.placa, tipo: amb.tipo,
    status: amb.status, location: amb.location,
    speed: amb.speed, lastUpdate: amb.lastUpdate
  }))
  res.json({ success: true, data: ambulancesList, total: ambulancesList.length })
})

// ==================== PROXY FOURSQUARE PLACES ====================
app.post('/api/places/search', async (req, res) => {
  // --- Logs de diagnóstico (temporal) ---
  console.log('[places/search] Content-Type:', req.headers['content-type']);
  console.log('[places/search] body:', JSON.stringify(req.body));
  console.log('[places/search] key presente:', !!FOURSQUARE_KEY, '· len:', FOURSQUARE_KEY.length);

  try {
    const body = req.body || {};
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    const lat = Number.isFinite(body.lat) ? body.lat : 19.7024;
    const lng = Number.isFinite(body.lng) ? body.lng : -101.1969;
    const radius = Number.isFinite(body.radius) ? body.radius : 15000;
    const limit = Number.isFinite(body.limit) ? body.limit : 10;

    if (query.length < 2) {
      console.warn('[places/search] 400 · query inválido:', JSON.stringify(query));
      return res.status(400).json({
        error: 'query requerido (min 2 caracteres)',
        received: { query, bodyKeys: Object.keys(body) }
      });
    }

    if (!FOURSQUARE_KEY) {
      return res.status(503).json({ error: 'FOURSQUARE_KEY no configurada' });
    }

    const params = new URLSearchParams({
      query,
      ll: `${lat},${lng}`,
      radius: String(radius),
      limit: String(limit),
      sort: 'RELEVANCE',
      fields: 'fsq_place_id,name,location,categories,distance,geocodes',
    });

    console.log('[places/search] → Foursquare:', params.toString());

    const resp = await fetch(`${FOURSQUARE_BASE}?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${FOURSQUARE_KEY}`,
        'X-Places-Api-Version': '2025-06-17',
        'Accept': 'application/json',
      },
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.warn('[places/search] Foursquare HTTP', resp.status, '·', errText.slice(0, 200));
      return res.status(resp.status).json({
        error: `Foursquare HTTP ${resp.status}`,
        detail: errText.slice(0, 200),
      });
    }

    const data = await resp.json();
    console.log('[places/search] OK · resultados:', (data.results || []).length);
    res.json({ results: data.results || [] });
  } catch (e) {
    console.error('[places/search] Error:', e.message, e.stack);
    res.status(500).json({ error: 'Error consultando Foursquare', detail: e.message });
  }
});

// TEMPORAL · verifica que el body parser funcione
app.post('/api/debug/echo', (req, res) => {
  res.json({
    receivedBody: req.body,
    contentType: req.headers['content-type'],
    bodyKeys: Object.keys(req.body || {}),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/ambulances/health', (req, res) => {
  if (!wsState) {
    return res.json({ status: 'ok', activeAmbulances: 0, activeHospitals: 0, timestamp: new Date().toISOString() })
  }
  res.json({
    status: 'ok',
    protocolVersion: 2,
    activeAmbulances: wsState.activeAmbulances.size,
    activeHospitals: wsState.activeHospitals.size,
    activeReceptors: wsState.activeReceptors.size,
    activeParamedics: wsState.activeParamedics.size,
    activeDoctors: wsState.activeDoctors.size,
    activeEmergencies: wsState.activeEmergencies.size,
    timestamp: new Date().toISOString()
  })
})

app.get('/api/doctores', async (req, res) => {
  try {
    const doctores = await prisma.doctor.findMany({
      select: { id: true, nombre: true, especialidad: true }
    })
    res.json(doctores)
  } catch (error) {
    console.error("Error obteniendo doctores:", error)
    res.status(500).json({ error: 'Error interno' })
  }
})

// Compatibilidad con Python: /api/pacientes broadcast crudo
app.post('/api/pacientes', async (req, res) => {
  try {
    const { seccion, datos } = req.body
    console.log('📨 Datos recibidos desde Python:', { seccion, datos })

    // Emitimos un mensaje estructurado hacia todos los clientes conectados.
    const message = JSON.stringify({
      type: 'recepcion_reporte_paciente',
      reporte: { seccion, datos, id: `pydata_${Date.now()}` }
    })
    if (wsState?.activeHospitals) {
      wsState.activeHospitals.forEach(h => {
        if (h.ws?.readyState === 1) try { h.ws.send(message) } catch (_) {}
      })
    }
    res.status(200).json({ success: true, message: 'Datos recibidos y enviados' })
  } catch (error) {
    console.error('❌ Error al enviar datos:', error)
    res.status(500).json({ success: false, message: 'Error al enviar datos' })
  }
})

app.get('/', (req, res) => {
  res.json({
    message: '🚑 ECMorelia Backend API',
    version: '2.0.0',
    protocolVersion: 2,
    endpoints: {
      docs: '/docs',
      ambulances: '/api/ambulances/active',
      health: '/api/ambulances/health',
      ws: 'wss://<host>/ws'
    }
  })
})

// ==================== ARRANQUE ====================
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Servidor ECMorelia en puerto ${PORT}`)
  console.log(`📚 Docs: http://localhost:${PORT}/docs`)
  console.log(`🏥 Health: http://localhost:${PORT}/api/ambulances/health`)
  console.log(`🚑 Ambulancias: http://localhost:${PORT}/api/ambulances/active\n`)
})

// Adjuntamos el WS v2 al mismo servidor HTTP
const attached = attachV2WebSocket(server, { path: '/ws' })
wsState = attached.state

console.log(`✅ WS v2 activo en ws://0.0.0.0:${PORT}/ws`)