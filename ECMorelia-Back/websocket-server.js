// websocket-server.js — Servidor WS standalone para desarrollo (puerto 3002)
const express = require('express')
const http = require('http')
const fetch = require('node-fetch')
const { attachV2WebSocket, PROTOCOL_VERSION } = require('./ws-core')

const app = express()
const server = http.createServer(app)

const MAPBOX_TOKEN =
  process.env.MAPBOX_TOKEN ||
  'pk.eyJ1IjoiZXltYXJkMjkiLCJhIjoiY21tcDY4YzNpMGw3bjJzb203YmZyNTVnMyJ9.OvZlnCMfUkUYe6Ib83DUVw'

// CORS
app.use(express.json())
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  next()
})
app.options('*', (req, res) => res.sendStatus(200))

// Adjuntamos el WS v2
const attached = attachV2WebSocket(server, { path: '/ws' })
const state = attached.state

// HTTP auxiliares (útiles para dev local)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    protocolVersion: PROTOCOL_VERSION,
    activeAmbulances: state.activeAmbulances.size,
    activeHospitals: state.activeHospitals.size,
    activeReceptors: state.activeReceptors.size,
    activeParamedics: state.activeParamedics.size,
    activeDoctors: state.activeDoctors.size,
    activeEmergencies: state.activeEmergencies.size,
    timestamp: new Date().toISOString()
  })
})

app.get('/api/status', (req, res) => {
  res.json({
    ambulances: Array.from(state.activeAmbulances.values()).map(a => ({
      id: a.id, placa: a.placa, nombre: a.nombre, status: a.status, location: a.location
    })),
    hospitals: Array.from(state.activeHospitals.keys()),
    emergencies: Array.from(state.activeEmergencies.values()),
    timestamp: new Date().toISOString()
  })
})

app.post('/search-addresses', async (req, res) => {
  try {
    const { query } = req.body
    if (!query || query.trim().length < 3) return res.json([])
    const q = encodeURIComponent(query.trim())
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${MAPBOX_TOKEN}&country=mx&limit=10&types=address,poi,place&language=es`
    const r = await fetch(url)
    if (!r.ok) return res.json([])
    const data = await r.json()
    res.json((data.features || []).map(f => ({
      id: f.id, place_name: f.place_name,
      lat: f.center[1], lng: f.center[0],
      type: f.place_type[0], relevance: f.relevance
    })))
  } catch (e) {
    res.status(500).json({ error: 'Error en búsqueda' })
  }
})

app.post('/directions', async (req, res) => {
  try {
    const { startLng, startLat, endLng, endLat } = req.body
    if (!startLng || !startLat || !endLng || !endLat) {
      return res.status(400).json({ error: 'Coordenadas incompletas' })
    }
    const coords = `${startLng},${startLat};${endLng},${endLat}`
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}`
    const r = await fetch(url)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const json = await r.json()
    if (!json.routes?.length) return res.status(404).json({ error: 'No se encontraron rutas' })
    const route = json.routes[0]
    res.json({
      geometry: route.geometry.coordinates,
      distance: route.distance, duration: route.duration,
      summary: `${(route.distance / 1000).toFixed(1)} km, ${Math.round(route.duration / 60)} min`,
      steps: route.legs?.[0]?.steps || []
    })
  } catch (e) {
    res.status(500).json({ error: 'Error calculando ruta' })
  }
})

const PORT = process.env.PORT || 3002
server.listen(PORT, () => {
  console.log(`🚀 WS standalone v${PROTOCOL_VERSION} en puerto ${PORT}`)
  console.log(`📡 WebSocket: ws://localhost:${PORT}/ws`)
  console.log(`🏥 Health:    http://localhost:${PORT}/health`)
  console.log(`📊 Status:    http://localhost:${PORT}/api/status`)
})

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM — cerrando…')
  server.close(() => process.exit(0))
})