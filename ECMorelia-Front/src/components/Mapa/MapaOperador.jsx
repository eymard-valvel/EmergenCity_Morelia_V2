// src/components/operador/MapaOperador.jsx
// ========================================================================
// VERSIÓN DEFINITIVA – OPTIMIZADA PARA NAVEGACIÓN AVANZADA
// (Corrección: importación de DrawerFooter añadida)
// ========================================================================

import React, {
  useState, useEffect, useRef, useCallback, useMemo
} from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  Box, Flex, VStack, HStack, Text, Button, Icon, Badge, Spinner, Portal,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Drawer, DrawerOverlay, DrawerContent, DrawerHeader, DrawerBody,
  DrawerCloseButton, DrawerFooter,  // <--- AÑADIDO DrawerFooter
  Divider, Input, Textarea, Select, NumberInput, NumberInputField,
  useToast, useDisclosure, Tooltip, Progress, List, ListItem, Avatar,
  Heading, SimpleGrid, FormControl, FormLabel, AlertDialog,
  AlertDialogOverlay, AlertDialogContent, AlertDialogHeader,
  AlertDialogBody, AlertDialogFooter, InputGroup, InputRightElement,
  IconButton, useColorModeValue
} from '@chakra-ui/react';
import {
  FaAmbulance, FaHospital, FaMapMarkerAlt, FaRoute, FaPhone,
  FaUser, FaHeartbeat, FaExclamationTriangle, FaCheckCircle,
  FaTimesCircle, FaBed, FaTimes, FaArrowRight, FaStethoscope,
  FaWifi, FaStop, FaPlay, FaSignOutAlt, FaShieldAlt, FaSearch,
  FaCompass, FaTachometerAlt, FaLocationArrow, FaSync, FaClock,
  FaRoad, FaCar, FaArrowLeft, FaArrowRight as FaArrowRightIcon
} from 'react-icons/fa';
import { FiNavigation, FiWifiOff, FiActivity, FiSettings } from 'react-icons/fi';
import { MdMyLocation, MdSpeed, MdExplore } from 'react-icons/md';
import { CloseIcon, SearchIcon } from '@chakra-ui/icons';

// ========================================================================
// CONFIGURACIÓN
// ========================================================================
mapboxgl.accessToken =
  import.meta.env.VITE_MAPBOX_TOKEN ||
  'pk.eyJ1IjoiZXltYXJkMjkiLCJhIjoiY21tcDY4YzNpMGw3bjJzb203YmZyNTVnMyJ9.OvZlnCMfUkUYe6Ib83DUVw';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3002/ws';
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3002';
const DEFAULT_CENTER = { lat: 19.7024, lng: -101.1969 };
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT = 5;
const ROUTE_UPDATE_INTERVAL = 30000; // 30 segundos

const TIPOS_AMBULANCIA = [
  'UVI Móvil', 'Ambulancia Básica', 'Ambulancia Avanzada',
  'Motocicleta de Respuesta', 'Helicóptero'
];

const STATUS_OPTIONS = [
  { value: 'disponible', label: 'DISPONIBLE', color: '#10b981' },
  { value: 'en_ruta', label: 'EN RUTA', color: '#f59e0b' },
  { value: 'ocupado', label: 'OCUPADO', color: '#f97316' },
  { value: 'fuera_de_servicio', label: 'FUERA SERVICIO', color: '#6b7280' },
];

// ========================================================================
// PERSISTENCIA DE SESIÓN
// ========================================================================
const SESSION_KEY = 'ambulanciaRegistrada';
function loadSavedAmbulance() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function saveAmbulance(data) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
}
function clearAmbulance() {
  sessionStorage.removeItem(SESSION_KEY);
}

// ========================================================================
// UTILIDADES
// ========================================================================
function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function fmtDist(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}
function fmtDur(seconds) {
  if (!seconds) return '—';
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}min`;
}

// ========================================================================
// COMPONENTE PRINCIPAL
// ========================================================================
const MapaOperador = () => {
  const toast = useToast();

  // ---- SESIÓN ----
  const [ambulancia, setAmbulancia] = useState(() => loadSavedAmbulance());

  // ---- WEBSOCKET ----
  const wsRef = useRef(null);
  const isMounted = useRef(true);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef(null);
  const [wsStatus, setWsStatus] = useState('disconnected');

  // ---- GPS ----
  const watchId = useRef(null);
  const gpsHeading = useRef(0);
  const deviceHeading = useRef(null);
  const [myLocation, setMyLocation] = useState(null);
  const [mySpeed, setMySpeed] = useState(0);
  const [myHeading, setMyHeading] = useState(0);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);

  // ---- MAPA ----
  const mapContainer = useRef(null);
  const map = useRef(null);
  const ambulanceMarker = useRef(null);
  const emergencyMarker = useRef(null);
  const markerEl = useRef(null);
  const routeLayerIds = useRef(new Set());
  const routeSourceIds = useRef(new Set());
  const animFrameIds = useRef({});
  const routeUpdateInterval = useRef(null);

  // ---- ESTADO GENERAL ----
  const [ambulanceStatus, setAmbulanceStatus] = useState('disponible');
  const [hospitals, setHospitals] = useState([]);
  const [activeEmergencies, setActiveEmergencies] = useState([]);
  const [assignedEmergency, setAssignedEmergency] = useState(null);
  const [activeRoutes, setActiveRoutes] = useState({}); // key -> { hospitalId, distance, duration, geometry, isEmergency }
  const [currentManeuver, setCurrentManeuver] = useState(null);
  const [routeProgress, setRouteProgress] = useState(null);
  const [rejectedHospitalIds, setRejectedHospitalIds] = useState([]);

  // ---- DRAWERS ----
  const { isOpen: isEmergencyDrawerOpen, onOpen: onEmergencyDrawerOpen, onClose: onEmergencyDrawerClose } = useDisclosure();
  const { isOpen: isHospitalDrawerOpen, onOpen: onHospitalDrawerOpen, onClose: onHospitalDrawerClose } = useDisclosure();
  const { isOpen: isEmergencyModalOpen, onOpen: onEmergencyModalOpen, onClose: onEmergencyModalClose } = useDisclosure();
  const { isOpen: isAlertOpen, onOpen: onAlertOpen, onClose: onAlertClose } = useDisclosure();
  const cancelRef = useRef();

  // ---- ESTADO DEL DRAWER DE EMERGENCIA ----
  const [drawerMode, setDrawerMode] = useState('atender'); // 'atender' | 'trasladar'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedHospitalId, setSelectedHospitalId] = useState(null);
  const [patientData, setPatientData] = useState({ nombre: '', edad: '', diagnostico: '', notas: '' });
  const [isSending, setIsSending] = useState(false);
  const [hospitalSearchQ, setHospitalSearchQ] = useState('');

  // ---- DIÁLOGO DE CONFIRMACIÓN ----
  const [pendingAction, setPendingAction] = useState(null);

  // ---- CALLBACKS PARA POPUPS ----
  useEffect(() => {
    window.__mapCb = {};
    return () => { delete window.__mapCb; };
  }, []);

  // ========================================================================
  // 1. WEBSOCKET
  // ========================================================================
  const sendWS = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (!ambulancia) return;
    isMounted.current = true;

    const connect = () => {
      if (!isMounted.current) return;
      setWsStatus('connecting');
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMounted.current) return;
        setWsStatus('connected');
        reconnectAttempts.current = 0;
        ws.send(JSON.stringify({
          type: 'register_ambulance',
          ambulance: {
            id: ambulancia.id,
            placa: ambulancia.placa,
            nombre: ambulancia.nombre,
            tipo: ambulancia.tipo,
            status: 'disponible',
            location: myLocation || DEFAULT_CENTER,
          },
        }));
        // Solicitar listas
        ws.send(JSON.stringify({ type: 'request_hospitals_list' }));
        ws.send(JSON.stringify({ type: 'request_active_emergencies' }));
      };

      ws.onmessage = (e) => {
        if (!isMounted.current) return;
        try { handleServerMessage(JSON.parse(e.data)); } catch {}
      };

      ws.onclose = () => {
        if (!isMounted.current) return;
        wsRef.current = null;
        if (reconnectAttempts.current < MAX_RECONNECT) {
          setWsStatus('disconnected');
          reconnectAttempts.current += 1;
          reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
        } else {
          setWsStatus('failed');
        }
      };

      ws.onerror = () => setWsStatus('disconnected');
    };

    connect();

    return () => {
      isMounted.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.close(1000, 'unmount');
    };
  }, [ambulancia, myLocation]);

  // ========================================================================
  // 2. MANEJADOR DE MENSAJES DEL SERVIDOR
  // ========================================================================
  const handleServerMessage = useCallback((data) => {
    switch (data.type) {
      case 'connection_established':
        console.log('✅ WS conectado');
        break;

      case 'active_hospitals_update':
        setHospitals(data.hospitals || []);
        break;

      case 'active_emergencies_update':
        setActiveEmergencies(data.emergencies || []);
        break;

      case 'new_emergency_assigned':
        handleEmergencyAssigned(data);
        break;

      case 'emergency_marker_cancelled':
        removeEmergencyMarker();
        toast({ title: '🔴 Marcador eliminado', status: 'info', duration: 4000, position: 'top-right' });
        break;

      case 'patient_accepted_with_route':
        handlePatientAcceptedWithRoute(data);
        break;

      case 'patient_accepted':
        toast({ title: '✅ Hospital aceptó', description: `Diríjase a ${data.hospitalInfo?.nombre || data.hospitalId}`, status: 'success', duration: 7000, position: 'top-right' });
        setAmbulanceStatus('en_ruta');
        onEmergencyDrawerClose();
        break;

      case 'patient_rejected':
        toast({ title: '❌ Hospital rechazó', description: data.reason || 'Motivo no especificado', status: 'error', duration: 7000, position: 'top-right' });
        setRejectedHospitalIds(prev => [...prev, data.hospitalId]);
        break;

      case 'automatic_redirect':
        toast({ title: '🔄 Redirigiendo', description: data.message, status: 'warning', duration: 7000, position: 'top-right' });
        setSelectedHospitalId(data.hospitalInfo?.id || null);
        setRejectedHospitalIds(data.rejectedHospitals || []);
        break;

      case 'no_hospitals_available':
        toast({ title: '⚠️ Sin hospitales disponibles', description: data.message, status: 'error', duration: 8000, position: 'top-right' });
        break;

      case 'route_updated':
        if (data.routeGeometry && ambulancia?.id) {
          const routeKey = `${ambulancia.id}-${data.hospitalId}`;
          drawRoute(routeKey, data.routeGeometry, '#0284c7', data.isEmergencyRoute || false);
          setActiveRoutes(prev => ({
            ...prev,
            [routeKey]: { hospitalId: data.hospitalId, distance: data.distance, duration: data.duration, geometry: data.routeGeometry, isEmergency: data.isEmergencyRoute || false }
          }));
          // Actualizar turn-by-turn si es emergencia
          if (data.isEmergencyRoute && data.steps) {
            const steps = data.steps.map((s, i) => ({
              number: i + 1,
              instruction: s.maneuver?.instruction || 'Continuar',
              distance: s.distance,
              duration: s.duration,
              maneuver: s.maneuver?.type || 'straight'
            }));
            setCurrentManeuver(steps[0] || null);
            setRouteProgress({ distanceRemaining: data.distance, durationRemaining: data.duration });
          }
        }
        break;

      case 'navigation_cancelled':
        toast({ title: '🛑 Navegación cancelada', status: 'info', duration: 4000, position: 'top-right' });
        setActiveRoutes({});
        setAmbulanceStatus('disponible');
        setCurrentManeuver(null);
        setRouteProgress(null);
        setRejectedHospitalIds([]);
        break;

      case 'status_updated':
        console.log(`✅ Estado confirmado: ${data.status}`);
        break;

      case 'hospital_note':
        toast({ title: `📋 Nota de hospital`, description: data.note?.texto || data.note, status: 'info', duration: 6000, position: 'top-right' });
        break;

      default:
        break;
    }
  }, [ambulancia, toast]);

  // ========================================================================
  // 3. GEOLOCALIZACIÓN
  // ========================================================================
  useEffect(() => {
    if (!ambulancia) return;

    const handleOrientation = (e) => {
      const heading = e.webkitCompassHeading != null ? e.webkitCompassHeading : (360 - (e.alpha || 0));
      deviceHeading.current = heading;
      if (mySpeed < 5) {
        gpsHeading.current = heading;
        setMyHeading(heading);
        updateMarkerRotation(heading);
      }
    };

    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(r => {
        if (r === 'granted') window.addEventListener('deviceorientation', handleOrientation, true);
      }).catch(() => {});
    } else {
      window.addEventListener('deviceorientation', handleOrientation, true);
    }

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const spd = pos.coords.speed != null ? parseFloat((pos.coords.speed * 3.6).toFixed(1)) : 0;
        const hdg = pos.coords.heading != null && !isNaN(pos.coords.heading) ? pos.coords.heading : gpsHeading.current;

        if (spd >= 5) {
          gpsHeading.current = hdg;
          setMyHeading(hdg);
          updateMarkerRotation(hdg);
        }

        setMyLocation(loc);
        setMySpeed(spd);
        setGpsAccuracy(pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null);

        updateAmbulanceMarker(loc, hdg, spd);
        centerMapOnLocation(loc);

        sendWS({
          type: 'location_update',
          ambulanceId: ambulancia.id,
          location: loc,
          speed: spd,
          heading: hdg,
          status: ambulanceStatus,
        });
      },
      (err) => console.warn('GPS error:', err.message),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation, true);
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [ambulancia, ambulanceStatus, sendWS]);

  // ========================================================================
  // 4. MAPA MAPBOX
  // ========================================================================
  useEffect(() => {
    if (!ambulancia || !mapContainer.current) return;

    const mapInstance = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
      zoom: 15,
      attributionControl: false,
    });

    mapInstance.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'bottom-right');

    map.current = mapInstance;

    return () => {
      Object.values(animFrameIds.current).forEach(id => cancelAnimationFrame(id));
      if (routeUpdateInterval.current) clearInterval(routeUpdateInterval.current);
      mapInstance.remove();
    };
  }, [ambulancia]);

  // ========================================================================
  // 5. MARCADOR DE AMBULANCIA (3D)
  // ========================================================================
  const buildMarkerEl = useCallback((placa, speed) => {
    const el = document.createElement('div');
    el.style.cssText = 'position:relative;width:56px;height:56px;cursor:pointer;';
    el.innerHTML = `
      <style>
        @keyframes siren-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse-ring { 0%,100% { opacity:0.7; transform:scale(1); } 50% { opacity:0.2; transform:scale(1.5); } }
        @keyframes blink-red { 0%,100% { background:#ef4444; } 50% { background:transparent; } }
        @keyframes blink-blue { 0%,100% { background:#3b82f6; } 50% { background:transparent; } }
      </style>
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
        width:70px;height:70px;border-radius:50%;
        border:2px solid rgba(59,130,246,0.4);
        animation:pulse-ring 2s ease-in-out infinite;pointer-events:none;"></div>
      <div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);
        width:32px;height:32px;border-radius:50%;pointer-events:none;
        background:conic-gradient(#ef4444 0deg 60deg,transparent 60deg 180deg,#3b82f6 180deg 240deg,transparent 240deg 360deg);
        animation:siren-spin 0.8s linear infinite;opacity:0.9;
        filter:drop-shadow(0 0 6px rgba(239,68,68,0.8));"></div>
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
        width:46px;height:46px;border-radius:50%;
        background:linear-gradient(135deg,#1e40af,#1d4ed8);
        border:3px solid #60a5fa;
        box-shadow:0 0 20px rgba(96,165,250,0.6),0 4px 15px rgba(0,0,0,0.5);
        display:flex;align-items:center;justify-content:center;">
        <span style="color:white;font-size:20px;line-height:1;">🚑</span>
      </div>
      <div style="position:absolute;top:14px;left:8px;width:7px;height:7px;border-radius:50%;
        animation:blink-red 0.5s infinite;box-shadow:0 0 8px #ef4444;"></div>
      <div style="position:absolute;top:14px;right:8px;width:7px;height:7px;border-radius:50%;
        animation:blink-blue 0.5s 0.25s infinite;box-shadow:0 0 8px #3b82f6;"></div>
      <div style="position:absolute;bottom:-22px;left:50%;transform:translateX(-50%);
        background:rgba(0,0,0,0.85);border:1px solid #334155;border-radius:4px;
        padding:2px 7px;white-space:nowrap;font-size:9px;font-weight:900;
        color:#60a5fa;font-family:monospace;letter-spacing:1px;">${placa}</div>
      <div id="amb-speed" style="position:absolute;bottom:-40px;left:50%;transform:translateX(-50%);
        background:rgba(0,0,0,0.7);border-radius:3px;padding:1px 5px;
        font-size:8px;font-weight:bold;color:#10b981;font-family:monospace;white-space:nowrap;">
        ${speed} km/h</div>
    `;
    return el;
  }, []);

  const updateMarkerRotation = useCallback((heading) => {
    if (!markerEl.current) return;
    const body = markerEl.current.querySelector('div:nth-child(3)');
    if (body) body.style.transform = `translate(-50%,-50%) rotate(${heading}deg)`;
  }, []);

  const updateSpeedDisplay = useCallback((speed) => {
    if (!markerEl.current) return;
    const el = markerEl.current.querySelector('#amb-speed');
    if (el) el.textContent = `${speed} km/h`;
  }, []);

  const updateAmbulanceMarker = useCallback((loc, heading, speed) => {
    if (!map.current) return;
    if (!ambulanceMarker.current) {
      const el = buildMarkerEl(ambulancia?.placa || '', speed);
      markerEl.current = el;
      ambulanceMarker.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([loc.lng, loc.lat])
        .addTo(map.current);
    } else {
      ambulanceMarker.current.setLngLat([loc.lng, loc.lat]);
      updateSpeedDisplay(speed);
    }
  }, [ambulancia, buildMarkerEl, updateSpeedDisplay]);

  const centerMapOnLocation = useCallback((loc) => {
    if (!map.current) return;
    map.current.easeTo({ center: [loc.lng, loc.lat], duration: 1000, essential: true });
  }, []);

  // ========================================================================
  // 6. BÚSQUEDA DE DIRECCIONES (estilo Receptor)
  // ========================================================================
  const searchAddresses = useCallback(async (query) => {
    if (!query || query.trim().length < 3) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query.trim())}.json?access_token=${mapboxgl.accessToken}&country=mx&limit=6&language=es`;
      const res = await fetch(url);
      const data = await res.json();
      const results = (data.features || []).map(f => ({
        id: f.id,
        place_name: f.place_name,
        lat: f.center[1],
        lng: f.center[0],
      }));
      setSearchResults(results);
    } catch (e) {
      console.error('Error en búsqueda:', e);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const selectSearchResult = useCallback((result) => {
    setSearchQuery(result.place_name);
    setSearchResults([]);
    setSelectedLocation({ lat: result.lat, lng: result.lng });
    if (map.current) {
      map.current.flyTo({ center: [result.lng, result.lat], zoom: 17, duration: 1000 });
    }
    // Colocar marcador de emergencia (opcional)
    placeEmergencyMarker({ lat: result.lat, lng: result.lng }, result.place_name);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setSelectedLocation(null);
    removeEmergencyMarker();
  }, []);

  // ========================================================================
  // 7. MARCADOR DE EMERGENCIA (manual y asignada)
  // ========================================================================
  const placeEmergencyMarker = useCallback((location, address) => {
    if (!map.current) return;
    removeEmergencyMarker();
    const el = document.createElement('div');
    el.style.cssText = 'position:relative;width:52px;height:52px;cursor:pointer;';
    el.innerHTML = `
      <style>
        @keyframes em-pulse { 0%,100%{transform:translate(-50%,-50%) scale(1);opacity:0.8;} 50%{transform:translate(-50%,-50%) scale(1.6);opacity:0;} }
      </style>
      <div style="position:absolute;top:50%;left:50%;width:60px;height:60px;border-radius:50%;
        border:3px solid #ef4444;animation:em-pulse 1.2s ease-out infinite;"></div>
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
        width:42px;height:42px;border-radius:50%;
        background:radial-gradient(circle,#dc2626,#991b1b);
        border:3px solid #fca5a5;
        box-shadow:0 0 25px rgba(220,38,38,0.8),0 4px 15px rgba(0,0,0,0.5);
        display:flex;align-items:center;justify-content:center;font-size:20px;">🚨</div>
      <div style="position:absolute;bottom:-26px;left:50%;transform:translateX(-50%);
        background:rgba(220,38,38,0.9);border-radius:4px;padding:2px 8px;
        font-size:9px;font-weight:900;color:white;font-family:monospace;
        white-space:nowrap;letter-spacing:0.5px;">${address || 'EMERGENCIA'}</div>
    `;
    emergencyMarker.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([location.lng, location.lat])
      .addTo(map.current);
  }, []);

  const removeEmergencyMarker = useCallback(() => {
    if (emergencyMarker.current) {
      emergencyMarker.current.remove();
      emergencyMarker.current = null;
    }
  }, []);

  // ========================================================================
  // 8. CÁLCULO DE RUTAS (con tráfico y alternativas)
  // ========================================================================
  const computeRoute = useCallback(async (start, end, alternatives = false) => {
    if (!start || !end) return null;
    try {
      const coords = `${start.lng},${start.lat};${end.lng},${end.lat}`;
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?geometries=geojson&overview=full&steps=true&access_token=${mapboxgl.accessToken}&language=es&alternatives=${alternatives}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP error');
      const data = await resp.json();
      if (!data.routes || data.routes.length === 0) return null;
      // Tomar la primera ruta (la más rápida)
      const route = data.routes[0];
      return {
        geometry: route.geometry.coordinates,
        distance: route.distance,
        duration: route.duration,
        summary: `${(route.distance / 1000).toFixed(1)} km, ${Math.round(route.duration / 60)} min`,
        steps: route.legs?.[0]?.steps || [],
        alternatives: data.routes.slice(1).map(r => ({
          geometry: r.geometry.coordinates,
          distance: r.distance,
          duration: r.duration,
        }))
      };
    } catch (error) {
      console.error('Error calculando ruta:', error);
      return null;
    }
  }, []);

  // ========================================================================
  // 9. DIBUJADO DE RUTA EN EL MAPA
  // ========================================================================
  const drawRoute = useCallback((routeKey, geometry, color = '#0284c7', isEmergency = false) => {
    if (!map.current) return;

    // Limpiar ruta anterior con misma key
    const layers = [`${routeKey}`, `${routeKey}-dots`, `${routeKey}-glow`];
    layers.forEach(id => {
      if (routeLayerIds.current.has(id)) {
        try {
          if (map.current.getLayer(id)) map.current.removeLayer(id);
          if (map.current.getSource(id)) map.current.removeSource(id);
        } catch {}
        routeLayerIds.current.delete(id);
        routeSourceIds.current.delete(id);
      }
    });
    if (animFrameIds.current[routeKey]) {
      cancelAnimationFrame(animFrameIds.current[routeKey]);
      delete animFrameIds.current[routeKey];
    }

    const geojson = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: geometry },
      properties: {}
    };

    const addLayer = (id, source, layer) => {
      try {
        if (!map.current.getSource(id)) map.current.addSource(id, source);
        if (!map.current.getLayer(id)) map.current.addLayer(layer);
        routeLayerIds.current.add(id);
        routeSourceIds.current.add(id);
      } catch (e) { console.warn('drawRoute error:', e.message); }
    };

    // Glow
    addLayer(`${routeKey}-glow`, { type: 'geojson', data: geojson }, {
      id: `${routeKey}-glow`, type: 'line', source: `${routeKey}-glow`,
      paint: { 'line-color': color, 'line-width': 14, 'line-opacity': 0.2, 'line-blur': 6 },
    });

    // Línea principal
    addLayer(routeKey, { type: 'geojson', data: geojson }, {
      id: routeKey, type: 'line', source: routeKey,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': color, 'line-width': 5, 'line-opacity': 0.9 },
    });

    // Puntos animados (solo para emergencia)
    if (isEmergency) {
      addLayer(`${routeKey}-dots`, { type: 'geojson', data: geojson }, {
        id: `${routeKey}-dots`, type: 'line', source: `${routeKey}-dots`,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-opacity': 0.5, 'line-dasharray': [0.5, 4] },
      });
      let offset = 0;
      const animate = () => {
        if (!map.current || !map.current.getLayer(`${routeKey}-dots`)) return;
        offset = (offset + 0.3) % 20;
        try {
          map.current.setPaintProperty(`${routeKey}-dots`, 'line-dasharray', [0.5, 4]);
          map.current.setPaintProperty(`${routeKey}-dots`, 'line-opacity', 0.4 + 0.3 * Math.sin(offset));
        } catch {}
        animFrameIds.current[routeKey] = requestAnimationFrame(animate);
      };
      animFrameIds.current[routeKey] = requestAnimationFrame(animate);
    }
  }, []);

  const clearRoute = useCallback((routeKey) => {
    if (!map.current) return;
    [`${routeKey}`, `${routeKey}-dots`, `${routeKey}-glow`].forEach(id => {
      try {
        if (map.current.getLayer(id)) map.current.removeLayer(id);
        if (map.current.getSource(id)) map.current.removeSource(id);
      } catch {}
      routeLayerIds.current.delete(id);
      routeSourceIds.current.delete(id);
    });
    if (animFrameIds.current[routeKey]) {
      cancelAnimationFrame(animFrameIds.current[routeKey]);
      delete animFrameIds.current[routeKey];
    }
  }, []);

  // ========================================================================
  // 10. MANEJO DE EMERGENCIA ASIGNADA
  // ========================================================================
  const handleEmergencyAssigned = useCallback((data) => {
    console.log('🚨 Emergencia asignada:', data.callId);
    setAssignedEmergency(data);
    setAmbulanceStatus('en_ruta');
    toast({
      title: '🚨 ¡EMERGENCIA ASIGNADA!',
      description: `${data.emergencyType} — ${data.address || 'Ver mapa'}`,
      status: 'error', duration: null, isClosable: true, position: 'top',
    });
    onEmergencyModalOpen();

    if (data.location && map.current) {
      placeEmergencyMarker(data.location, data.address);
      map.current.flyTo({ center: [data.location.lng, data.location.lat], zoom: 16, speed: 1.4 });
      if (myLocation) {
        // Calcular ruta automáticamente
        computeRoute(myLocation, data.location, true).then(route => {
          if (route) {
            const routeKey = `emergency-${data.callId}`;
            drawRoute(routeKey, route.geometry, '#ef4444', true);
            setActiveRoutes(prev => ({
              ...prev,
              [routeKey]: { callId: data.callId, distance: route.distance, duration: route.duration, geometry: route.geometry, isEmergency: true }
            }));
            // Turn-by-turn
            if (route.steps && route.steps.length > 0) {
              setCurrentManeuver(route.steps[0]);
              setRouteProgress({ distanceRemaining: route.distance, durationRemaining: route.duration });
            }
            // Iniciar actualización automática de ruta
            if (routeUpdateInterval.current) clearInterval(routeUpdateInterval.current);
            routeUpdateInterval.current = setInterval(() => {
              if (myLocation && data.location) {
                computeRoute(myLocation, data.location, true).then(newRoute => {
                  if (newRoute) {
                    const newKey = `emergency-${data.callId}`;
                    drawRoute(newKey, newRoute.geometry, '#ef4444', true);
                    setActiveRoutes(prev => ({
                      ...prev,
                      [newKey]: { ...prev[newKey], distance: newRoute.distance, duration: newRoute.duration, geometry: newRoute.geometry }
                    }));
                    if (newRoute.steps && newRoute.steps.length > 0) {
                      setCurrentManeuver(newRoute.steps[0]);
                      setRouteProgress({ distanceRemaining: newRoute.distance, durationRemaining: newRoute.duration });
                    }
                  }
                });
              }
            }, ROUTE_UPDATE_INTERVAL);
          }
        });
      }
    }
  }, [myLocation, computeRoute, drawRoute, toast, onEmergencyModalOpen]);

  // ========================================================================
  // 11. TRANSFERENCIA DE PACIENTE (traslado a hospital)
  // ========================================================================
  const handleSendTransfer = useCallback(async () => {
    const hospital = hospitals.find(h => h.id === selectedHospitalId);
    if (!hospital || !myLocation) return;
    setIsSending(true);

    // Calcular ruta
    const route = await computeRoute(myLocation, { lat: hospital.lat, lng: hospital.lng }, true);
    if (route) {
      const routeKey = `transfer-${hospital.id}`;
      drawRoute(routeKey, route.geometry, '#10b981');
      setActiveRoutes(prev => ({
        ...prev,
        [routeKey]: { hospitalId: hospital.id, distance: route.distance, duration: route.duration, geometry: route.geometry, isEmergency: false }
      }));
    }

    const payload = {
      type: 'patient_transfer_notification',
      notificationId: `notif_${Date.now()}`,
      ambulanceId: ambulancia.id,
      ambulanceInfo: { placa: ambulancia.placa, nombre: ambulancia.nombre, tipo: ambulancia.tipo },
      hospitalId: hospital.id,
      hospitalInfo: hospital,
      patientInfo: {
        nombre: patientData.nombre || 'No especificado',
        edad: patientData.edad || 'Desconocida',
        condition: patientData.diagnostico || 'No especificado',
        notes: patientData.notas,
        timestamp: new Date().toLocaleString()
      },
      ambulanceLocation: myLocation,
      routeGeometry: route?.geometry || null,
      distance: route?.distance || null,
      duration: route?.duration || null,
      eta: route ? Math.round(route.duration / 60) : null,
      emergencyMode: drawerMode === 'atender' ? 'atender_emergencia' : 'trasladar_paciente',
      emergencyCallId: assignedEmergency?.callId || null,
    };

    sendWS(payload);
    toast({ title: '📩 Notificación enviada', description: `Esperando respuesta de ${hospital.nombre}`, status: 'info', duration: 7000, position: 'top-right' });
    setIsSending(false);
    onEmergencyDrawerClose();
  }, [selectedHospitalId, hospitals, myLocation, ambulancia, patientData, drawerMode, assignedEmergency, computeRoute, drawRoute, sendWS, toast, onEmergencyDrawerClose]);

  // ========================================================================
  // 12. ACEPTAR / RECHAZAR TRASLADO (respuesta del hospital)
  // ========================================================================
  const handlePatientAcceptedWithRoute = useCallback((data) => {
    toast({ title: '✅ Hospital aceptó', description: `Ruta hacia ${data.hospitalInfo?.nombre || data.hospitalId}`, status: 'success', duration: 7000, position: 'top-right' });
    if (data.routeGeometry) {
      const routeKey = `transfer-${data.hospitalId}`;
      drawRoute(routeKey, data.routeGeometry, '#10b981');
      setActiveRoutes(prev => ({
        ...prev,
        [routeKey]: { hospitalId: data.hospitalId, distance: data.distance, duration: data.duration, geometry: data.routeGeometry, isEmergency: false }
      }));
    }
    setAmbulanceStatus('en_ruta');
    onEmergencyDrawerClose();
  }, [drawRoute, toast, onEmergencyDrawerClose]);

  // ========================================================================
  // 13. COMPLETAR EMERGENCIA
  // ========================================================================
  const handleCompleteEmergency = useCallback(() => {
    if (!assignedEmergency) return;
    sendWS({
      type: 'emergency_completed',
      ambulanceId: ambulancia?.id,
      callId: assignedEmergency.callId,
    });
    removeEmergencyMarker();
    // Limpiar ruta de emergencia
    const routeKey = `emergency-${assignedEmergency.callId}`;
    clearRoute(routeKey);
    setActiveRoutes(prev => { const n = { ...prev }; delete n[routeKey]; return n; });
    setAssignedEmergency(null);
    setAmbulanceStatus('disponible');
    setCurrentManeuver(null);
    setRouteProgress(null);
    if (routeUpdateInterval.current) clearInterval(routeUpdateInterval.current);
    onEmergencyModalClose();
    toast({ title: '✅ Emergencia completada', description: 'Unidad disponible nuevamente', status: 'success', duration: 5000, position: 'top-right' });
  }, [assignedEmergency, ambulancia, sendWS, removeEmergencyMarker, clearRoute, onEmergencyModalClose, toast]);

  // ========================================================================
  // 14. CAMBIO DE ESTADO DE LA AMBULANCIA
  // ========================================================================
  const changeStatus = useCallback((newStatus) => {
    setAmbulanceStatus(newStatus);
    sendWS({ type: 'ambulance_status_update', ambulanceId: ambulancia?.id, status: newStatus });
  }, [ambulancia, sendWS]);

  // ========================================================================
  // 15. DIÁLOGO DE CONFIRMACIÓN
  // ========================================================================
  const confirmAction = useCallback((action, title, body) => {
    setPendingAction({ fn: action, title, body });
    onAlertOpen();
  }, [onAlertOpen]);

  const executeConfirmed = useCallback(() => {
    if (pendingAction?.fn) pendingAction.fn();
    onAlertClose();
    setPendingAction(null);
  }, [pendingAction, onAlertClose]);

  // ========================================================================
  // 16. RENDER – MODAL DE REGISTRO
  // ========================================================================
  if (!ambulancia) {
    return <RegistrationModal onRegister={(data) => {
      setAmbulancia(data);
      setAmbulanceStatus('disponible');
    }} />;
  }

  // ========================================================================
  // 17. RENDER PRINCIPAL
  // ========================================================================
  const wsStatusConfig = {
    connected: { color: 'green', label: 'ONLINE', icon: FiActivity },
    connecting: { color: 'yellow', label: 'CONECTANDO...', icon: FiActivity },
    disconnected: { color: 'orange', label: 'RECONECTANDO...', icon: FiWifiOff },
    failed: { color: 'red', label: 'OFFLINE', icon: FiWifiOff },
  };
  const wsC = wsStatusConfig[wsStatus] || wsStatusConfig.disconnected;
  const currentStatusOpt = STATUS_OPTIONS.find(s => s.value === ambulanceStatus) || STATUS_OPTIONS[0];
  const isMobile = window.innerWidth < 768;

  return (
    <Box h="100vh" w="100vw" bg="#000" overflow="hidden" position="relative">

      {/* MAPA */}
      <Box ref={mapContainer} position="absolute" inset={0} zIndex={0} />

      {/* HUD SUPERIOR */}
      <Flex
        position="absolute" top={0} left={0} right={0}
        h="64px" zIndex={100}
        bg="rgba(2,8,23,0.88)" backdropFilter="blur(10px)"
        borderBottom="1px solid rgba(51,65,85,0.7)"
        px={4} alignItems="center" justifyContent="space-between"
        gap={3}
      >
        <HStack spacing={3} flexShrink={0}>
          <Icon as={FaAmbulance} color="#60a5fa" boxSize={5} />
          <VStack align="start" spacing={0} display={{ base: 'none', sm: 'flex' }}>
            <Text color="#f8fafc" fontWeight="900" fontSize="13px" letterSpacing="0.5px" lineHeight="1.1">
              {ambulancia.nombre}
            </Text>
            <Text color="#64748b" fontSize="10px" fontFamily="mono">
              {ambulancia.id} · {ambulancia.placa}
            </Text>
          </VStack>
        </HStack>

        <HStack spacing={3} display={{ base: 'none', md: 'flex' }}>
          <VStack spacing={0} align="center">
            <Text fontFamily="mono" fontWeight="900" color="#10b981" fontSize="18px" lineHeight="1">{mySpeed}</Text>
            <Text fontSize="8px" color="#64748b" fontWeight="bold">KM/H</Text>
          </VStack>
          <Divider orientation="vertical" h="30px" borderColor="#334155" />
          <VStack spacing={0} align="center">
            <Icon as={MdExplore} color="#f59e0b" boxSize={4} />
            <Text fontSize="8px" color="#64748b" fontWeight="bold">{Math.round(myHeading)}°</Text>
          </VStack>
          {gpsAccuracy != null && (
            <>
              <Divider orientation="vertical" h="30px" borderColor="#334155" />
              <VStack spacing={0} align="center">
                <Icon as={MdMyLocation} color={gpsAccuracy < 20 ? '#10b981' : '#f59e0b'} boxSize={4} />
                <Text fontSize="8px" color="#64748b" fontWeight="bold">±{gpsAccuracy}m</Text>
              </VStack>
            </>
          )}
        </HStack>

        <Badge colorScheme={wsC.color} px={2} py={1} borderRadius="md" fontSize="9px" letterSpacing="1px" flexShrink={0}>
          <HStack spacing={1}>
            <Icon as={wsC.icon} />
            <Text>{wsC.label}</Text>
          </HStack>
        </Badge>

        <Select
          value={ambulanceStatus}
          onChange={(e) => changeStatus(e.target.value)}
          bg="#1e293b"
          border="1px solid"
          borderColor={currentStatusOpt.color}
          color={currentStatusOpt.color}
          borderRadius="md" h="38px"
          fontSize="11px" fontWeight="bold" w={{ base: '120px', md: '150px' }}
          _focus={{ boxShadow: 'none' }}
          cursor="pointer"
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s.value} value={s.value} style={{ background: '#1e293b', color: s.color }}>
              {s.label}
            </option>
          ))}
        </Select>

        <Tooltip label="Cerrar sesión">
          <Button
            size="sm" variant="ghost" color="#64748b"
            _hover={{ bg: '#1e293b', color: '#ef4444' }}
            onClick={() => confirmAction(() => {
              if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.close(1000, 'Logout');
              clearAmbulance();
              setAmbulancia(null);
              setAssignedEmergency(null);
            }, 'Cerrar sesión', '¿Está seguro? Se perderá la sesión de esta unidad.')}
            flexShrink={0}
          >
            <Icon as={FaSignOutAlt} boxSize={4} />
          </Button>
        </Tooltip>
      </Flex>

      {/* PANEL INFERIOR DE ACCIONES */}
      <Flex
        position="absolute" bottom={0} left={0} right={0}
        zIndex={100}
        bg="rgba(2,8,23,0.88)" backdropFilter="blur(10px)"
        borderTop="1px solid rgba(51,65,85,0.7)"
        px={4} py={3} gap={3} flexWrap="wrap" justifyContent="center"
        alignItems="center"
      >
        <Button
          leftIcon={<FaRoute />}
          bg={assignedEmergency ? '#dc2626' : '#0284c7'}
          color="white" size="sm" fontWeight="900" fontSize="11px" letterSpacing="0.5px"
          borderRadius="md" px={4}
          _hover={{ bg: assignedEmergency ? '#b91c1c' : '#0369a1' }}
          onClick={() => {
            setDrawerMode('atender');
            setSearchQuery('');
            setSearchResults([]);
            setSelectedLocation(null);
            setSelectedHospitalId(null);
            setPatientData({ nombre: '', edad: '', diagnostico: '', notas: '' });
            onEmergencyDrawerOpen();
          }}
        >
          {assignedEmergency ? '🚨 VER EMERGENCIA' : 'ATENDER EMERGENCIA'}
        </Button>

        <Button
          leftIcon={<FaHospital />}
          bg="#7c3aed" color="white" size="sm" fontWeight="900" fontSize="11px" letterSpacing="0.5px"
          borderRadius="md" px={4}
          _hover={{ bg: '#6d28d9' }}
          onClick={() => {
            setDrawerMode('trasladar');
            setSelectedHospitalId(null);
            setPatientData({ nombre: '', edad: '', diagnostico: '', notas: '' });
            onEmergencyDrawerOpen();
          }}
        >
          TRASLADAR PACIENTE
        </Button>

        {assignedEmergency && (
          <Button
            leftIcon={<FaCheckCircle />}
            bg="#10b981" color="white" size="sm" fontWeight="900" fontSize="11px" letterSpacing="0.5px"
            borderRadius="md" px={4}
            _hover={{ bg: '#059669' }}
            onClick={() => confirmAction(handleCompleteEmergency, 'Completar Emergencia', `¿Confirma que la emergencia ${assignedEmergency.callId} ha sido atendida?`)}
          >
            COMPLETAR
          </Button>
        )}

        {Object.entries(activeRoutes).map(([key, route]) => (
          !route.isEmergency && (
            <Button
              key={key} leftIcon={<FaTimes />}
              bg="#374151" color="#94a3b8" size="sm" fontSize="10px"
              _hover={{ bg: '#4b5563', color: '#ef4444' }}
              onClick={() => confirmAction(
                () => {
                  sendWS({ type: 'cancel_navigation', ambulanceId: ambulancia?.id, hospitalId: route.hospitalId, routeKey: key });
                  clearRoute(key);
                  setActiveRoutes(prev => { const n = { ...prev }; delete n[key]; return n; });
                  changeStatus('disponible');
                },
                'Cancelar navegación',
                `¿Cancelar ruta hacia ${route.hospitalId}?`
              )}
            >
              {fmtDist((route.distance || 0) / 1000)} · {fmtDur(route.duration)}
            </Button>
          )
        ))}
      </Flex>

      {/* BADGE DE EMERGENCIA ACTIVA */}
      {assignedEmergency && (
        <Box
          position="absolute" top="80px" right={4} zIndex={90}
          bg="rgba(220,38,38,0.95)" color="white"
          px={4} py={3} borderRadius="xl" shadow="2xl"
          border="2px solid #fca5a5" cursor="pointer" maxW="240px"
          onClick={onEmergencyModalOpen}
        >
          <Text fontWeight="900" fontSize="11px" letterSpacing="1px">🚨 FOLIO ACTIVO</Text>
          <Text fontWeight="bold" fontSize="13px" fontFamily="mono">{assignedEmergency.callId}</Text>
          <Text fontSize="10px" color="#fecaca" noOfLines={1}>{assignedEmergency.emergencyType}</Text>
          <Text fontSize="9px" color="#fca5a5" noOfLines={1}>{assignedEmergency.address}</Text>
        </Box>
      )}

      {/* TURN-BY-TURN BAR */}
      {currentManeuver && (
        <Box
          position="absolute" top="72px" left="50%" transform="translateX(-50%)" zIndex={90}
          bg="rgba(0,0,0,0.8)" backdropFilter="blur(8px)"
          color="white" p={2} borderRadius="lg"
          display="flex" alignItems="center" gap={3}
          maxW="90%" whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis"
        >
          <Text fontSize="xl">{(() => {
            const m = currentManeuver.maneuver || 'straight';
            const icons = {
              'turn left': '↰', 'turn right': '↱', 'sharp left': '↶', 'sharp right': '↷',
              'slight left': '↖', 'slight right': '↗', 'straight': '↑', 'uturn': '↺',
              'roundabout': '⟲', 'merge': '⇗', 'fork': '⇉', 'ramp': '⇪'
            };
            return icons[m] || '→';
          })()}</Text>
          <Text fontSize="sm" fontWeight="bold" noOfLines={1}>{currentManeuver.instruction}</Text>
          <Text fontSize="sm" color="gray.300">
            {currentManeuver.distance ? fmtDist(currentManeuver.distance / 1000) : ''}
          </Text>
          {routeProgress && (
            <Text fontSize="sm" color="gray.400" ml="auto">
              {fmtDur(routeProgress.durationRemaining)}
            </Text>
          )}
        </Box>
      )}

      {/* ====================================================================
          DRAWER DE EMERGENCIA
          ==================================================================== */}
      <Drawer
        isOpen={isEmergencyDrawerOpen}
        placement="bottom"
        onClose={onEmergencyDrawerClose}
        size="xl"
      >
        <DrawerOverlay bg="rgba(0,0,0,0.7)" backdropFilter="blur(6px)" />
        <DrawerContent
          bg="#0f172a" borderTopRadius="2xl" maxH="85vh"
          border="1px solid #1e293b"
        >
          <DrawerCloseButton color="#94a3b8" mt={2} />
          <DrawerHeader borderBottom="1px solid #1e293b" pb={4}>
            <HStack spacing={3}>
              <Icon as={drawerMode === 'atender' ? FaExclamationTriangle : FaHospital} color="#38bdf8" boxSize={5} />
              <VStack align="start" spacing={0}>
                <Text color="#f8fafc" fontWeight="900" fontSize="15px" letterSpacing="1px">
                  {drawerMode === 'atender' ? '🚨 ATENDER EMERGENCIA' : '🏥 TRASLADAR PACIENTE'}
                </Text>
                <Text color="#64748b" fontSize="11px">
                  {drawerMode === 'atender'
                    ? 'Busque la ubicación del incidente o seleccione un punto en el mapa'
                    : 'Seleccione el hospital destino y complete los datos del paciente'}
                </Text>
              </VStack>
            </HStack>
          </DrawerHeader>

          <DrawerBody overflowY="auto" py={4}>
            <Flex gap={4} direction={{ base: 'column', lg: 'row' }}>

              {/* Columna izquierda: según modo */}
              {drawerMode === 'atender' ? (
                <VStack spacing={4} flex={1} align="stretch">
                  <Text color="#94a3b8" fontWeight="bold" fontSize="11px" letterSpacing="1px">📍 UBICACIÓN DE LA EMERGENCIA</Text>
                  <InputGroup size="md">
                    <Input
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        searchAddresses(e.target.value);
                      }}
                      placeholder="Buscar dirección, colonia, punto de interés..."
                      bg="#1e293b" border="1px solid #334155" color="#f8fafc"
                      borderRadius="md" h="44px" fontSize="13px"
                      _focus={{ borderColor: '#0284c7', boxShadow: 'none' }}
                    />
                    <InputRightElement h="44px">
                      {isSearching ? <Spinner size="sm" color="#38bdf8" /> :
                        searchQuery ? <IconButton aria-label="Limpiar" icon={<CloseIcon />} size="sm" variant="ghost" onClick={clearSearch} /> :
                        <SearchIcon color="#64748b" />}
                    </InputRightElement>
                  </InputGroup>

                  {searchResults.length > 0 && (
                    <Box maxH="200px" overflowY="auto" width="100%">
                      {searchResults.map((result, idx) => (
                        <Box
                          key={result.id}
                          p={2} borderBottom="1px solid #334155" cursor="pointer"
                          _hover={{ bg: '#1e293b' }}
                          onClick={() => selectSearchResult(result)}
                        >
                          <HStack>
                            <Icon as={FaMapMarkerAlt} color="#ef4444" boxSize={3} />
                            <Text color="#e2e8f0" fontSize="13px">{result.place_name}</Text>
                          </HStack>
                        </Box>
                      ))}
                    </Box>
                  )}

                  {selectedLocation && (
                    <Box bg="#14532d" p={3} borderRadius="md" border="1px solid #166534">
                      <Text color="#4ade80" fontWeight="bold" fontSize="12px">✅ Ubicación seleccionada</Text>
                      <Text color="#86efac" fontSize="11px">{searchQuery || 'Punto marcado'}</Text>
                      <HStack mt={1} spacing={2}>
                        <Button size="xs" colorScheme="green" onClick={() => {
                          if (map.current && selectedLocation) {
                            map.current.flyTo({ center: [selectedLocation.lng, selectedLocation.lat], zoom: 17, duration: 1000 });
                          }
                        }}>🗺️ Ver en mapa</Button>
                        <Button size="xs" colorScheme="red" onClick={() => {
                          setSelectedLocation(null);
                          setSearchQuery('');
                          removeEmergencyMarker();
                        }}>🔄 Cambiar</Button>
                      </HStack>
                    </Box>
                  )}

                  {selectedLocation && (
                    <Button
                      w="100%" h="52px" bg="#0284c7" color="white"
                      fontWeight="900" fontSize="13px"
                      _hover={{ bg: '#0369a1' }}
                      isDisabled={!myLocation}
                      onClick={async () => {
                        if (!myLocation || !selectedLocation) return;
                        const route = await computeRoute(myLocation, selectedLocation, true);
                        if (route) {
                          const routeKey = `manual-${Date.now()}`;
                          drawRoute(routeKey, route.geometry, '#ef4444', true);
                          setActiveRoutes(prev => ({
                            ...prev,
                            [routeKey]: { callId: null, distance: route.distance, duration: route.duration, geometry: route.geometry, isEmergency: true }
                          }));
                          if (route.steps && route.steps.length > 0) {
                            setCurrentManeuver(route.steps[0]);
                            setRouteProgress({ distanceRemaining: route.distance, durationRemaining: route.duration });
                          }
                          setAmbulanceStatus('en_ruta');
                          toast({ title: '✅ Ruta calculada', description: 'Navegando hacia la emergencia', status: 'success', duration: 5000, position: 'top-right' });
                          onEmergencyDrawerClose();
                        }
                      }}
                    >
                      🗺️ CALCULAR RUTA
                    </Button>
                  )}
                </VStack>
              ) : (
                // Modo trasladar
                <VStack spacing={4} flex={1} align="stretch">
                  <Text color="#94a3b8" fontWeight="bold" fontSize="11px" letterSpacing="1px">DATOS DEL PACIENTE</Text>
                  <FormControl>
                    <FormLabel color="#64748b" fontSize="11px" mb={1}>Nombre (opcional)</FormLabel>
                    <Input
                      value={patientData.nombre}
                      onChange={(e) => setPatientData(p => ({ ...p, nombre: e.target.value }))}
                      bg="#1e293b" border="1px solid #334155" color="#f8fafc"
                      borderRadius="md" h="44px" _focus={{ borderColor: '#0284c7', boxShadow: 'none' }}
                    />
                  </FormControl>
                  <HStack spacing={3}>
                    <FormControl flex={1}>
                      <FormLabel color="#64748b" fontSize="11px" mb={1}>Edad</FormLabel>
                      <NumberInput min={0} max={120} value={patientData.edad} onChange={(v) => setPatientData(p => ({ ...p, edad: v }))}>
                        <NumberInputField bg="#1e293b" border="1px solid #334155" color="#f8fafc" h="44px" _focus={{ borderColor: '#0284c7', boxShadow: 'none' }} />
                      </NumberInput>
                    </FormControl>
                    <FormControl flex={1}>
                      <FormLabel color="#64748b" fontSize="11px" mb={1}>Sexo</FormLabel>
                      <Select
                        value={patientData.sexo || ''}
                        onChange={(e) => setPatientData(p => ({ ...p, sexo: e.target.value }))}
                        bg="#1e293b" border="1px solid #334155" color="#f8fafc" h="44px" _focus={{ borderColor: '#0284c7', boxShadow: 'none' }}
                      >
                        <option value="">Seleccionar</option>
                        <option value="M">Masculino</option>
                        <option value="F">Femenino</option>
                      </Select>
                    </FormControl>
                  </HStack>
                  <FormControl>
                    <FormLabel color="#64748b" fontSize="11px" mb={1}>Diagnóstico / Condición *</FormLabel>
                    <Input
                      value={patientData.diagnostico}
                      onChange={(e) => setPatientData(p => ({ ...p, diagnostico: e.target.value }))}
                      placeholder="Ej. TCE moderado, fractura de fémur..."
                      bg="#1e293b" border="1px solid #334155" color="#f8fafc"
                      borderRadius="md" h="44px" _focus={{ borderColor: '#0284c7', boxShadow: 'none' }}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel color="#64748b" fontSize="11px" mb={1}>Notas adicionales</FormLabel>
                    <Textarea
                      value={patientData.notas}
                      onChange={(e) => setPatientData(p => ({ ...p, notas: e.target.value }))}
                      placeholder="Signos vitales, alergias, medicación..."
                      bg="#1e293b" border="1px solid #334155" color="#f8fafc"
                      borderRadius="md" rows={3} resize="none"
                      _focus={{ borderColor: '#0284c7', boxShadow: 'none' }}
                    />
                  </FormControl>
                </VStack>
              )}

              {/* Columna derecha: lista de hospitales (solo en modo trasladar) */}
              {drawerMode === 'trasladar' && (
                <VStack spacing={3} flex={1.5} align="stretch">
                  <HStack justify="space-between">
                    <Text color="#94a3b8" fontWeight="bold" fontSize="11px" letterSpacing="1px">
                      HOSPITALES DISPONIBLES ({hospitals.filter(h => h.connected).length})
                    </Text>
                    {rejectedHospitalIds.length > 0 && (
                      <Badge colorScheme="red" fontSize="9px">{rejectedHospitalIds.length} rechazados</Badge>
                    )}
                  </HStack>

                  <Input
                    value={hospitalSearchQ}
                    onChange={(e) => setHospitalSearchQ(e.target.value)}
                    placeholder="Buscar hospital..."
                    bg="#1e293b" border="1px solid #334155" color="#f8fafc"
                    borderRadius="md" h="44px" fontSize="13px"
                    _focus={{ borderColor: '#0284c7', boxShadow: 'none' }}
                  />

                  <Box overflowY="auto" maxH="350px">
                    {hospitals
                      .filter(h => h.connected && h.activo !== false)
                      .filter(h => {
                        const q = hospitalSearchQ.toLowerCase().trim();
                        if (!q) return true;
                        return h.nombre?.toLowerCase().includes(q) ||
                               h.direccion?.toLowerCase().includes(q) ||
                               h.especialidades?.some(e => e.toLowerCase().includes(q));
                      })
                      .sort((a, b) => {
                        if (!myLocation) return 0;
                        const dA = calcDistance(myLocation.lat, myLocation.lng, a.lat, a.lng);
                        const dB = calcDistance(myLocation.lat, myLocation.lng, b.lat, b.lng);
                        return dA - dB;
                      })
                      .map(h => {
                        const dist = myLocation && h.lat ? calcDistance(myLocation.lat, myLocation.lng, h.lat, h.lng) : null;
                        const isSelected = selectedHospitalId === h.id;
                        const isRejected = rejectedHospitalIds.includes(h.id);
                        return (
                          <Box
                            key={h.id}
                            p={3} borderRadius="md" cursor="pointer"
                            bg={isSelected ? '#1e3a5f' : '#1e293b'}
                            border="1px solid"
                            borderColor={isSelected ? '#0284c7' : '#334155'}
                            _hover={{ bg: '#1e3a5f', borderColor: '#0284c7' }}
                            onClick={() => {
                              if (isRejected) {
                                toast({ title: 'Hospital rechazado', description: 'Este hospital ya ha rechazado al paciente', status: 'warning', duration: 3000, position: 'top-right' });
                                return;
                              }
                              setSelectedHospitalId(h.id);
                              if (map.current && h.lat && h.lng) {
                                map.current.flyTo({ center: [h.lng, h.lat], zoom: 15, duration: 800 });
                              }
                            }}
                            transition="all 0.15s"
                            opacity={isRejected ? 0.4 : 1}
                            pointerEvents={isRejected ? 'none' : 'auto'}
                          >
                            <HStack justify="space-between">
                              <VStack align="start" spacing={0.5} minW={0}>
                                <HStack spacing={2}>
                                  <Icon as={FaHospital} color={h.connected ? '#10b981' : '#64748b'} boxSize={3.5} />
                                  <Text color="#f8fafc" fontWeight="bold" fontSize="13px" noOfLines={1}>{h.nombre}</Text>
                                  {isSelected && <Badge colorScheme="blue" fontSize="8px">SELECCIONADO</Badge>}
                                  {isRejected && <Badge colorScheme="red" fontSize="8px">RECHAZADO</Badge>}
                                </HStack>
                                {h.direccion && (
                                  <Text color="#64748b" fontSize="11px" noOfLines={1} pl={6}>{h.direccion}</Text>
                                )}
                                {h.especialidades?.length > 0 && (
                                  <HStack spacing={1} pl={6} flexWrap="wrap">
                                    {h.especialidades.slice(0, 3).map(e => (
                                      <Badge key={e} fontSize="8px" colorScheme="gray" variant="subtle">{e}</Badge>
                                    ))}
                                  </HStack>
                                )}
                              </VStack>
                              <VStack align="end" spacing={0.5} flexShrink={0} ml={2}>
                                {dist != null && (
                                  <Text color="#38bdf8" fontWeight="bold" fontSize="12px" fontFamily="mono">
                                    {fmtDist(dist)}
                                  </Text>
                                )}
                                {h.camasDisponibles != null && (
                                  <HStack spacing={1}>
                                    <Icon as={FaBed} color="#94a3b8" boxSize={3} />
                                    <Text color="#94a3b8" fontSize="10px">{h.camasDisponibles}</Text>
                                  </HStack>
                                )}
                                <Badge fontSize="8px" colorScheme={h.connected ? 'green' : 'gray'}>
                                  {h.connected ? 'ONLINE' : 'OFFLINE'}
                                </Badge>
                              </VStack>
                            </HStack>
                          </Box>
                        );
                      })}
                  </Box>
                </VStack>
              )}
            </Flex>
          </DrawerBody>

          <DrawerFooter borderTop="1px solid #1e293b" gap={3}>
            <Button variant="ghost" onClick={onEmergencyDrawerClose}>Cancelar</Button>
            {drawerMode === 'trasladar' && (
              <Button
                colorScheme="blue"
                leftIcon={<FaHospital />}
                isDisabled={!selectedHospitalId || !patientData.diagnostico.trim() || isSending}
                isLoading={isSending}
                loadingText="Enviando..."
                onClick={handleSendTransfer}
              >
                ENVIAR NOTIFICACIÓN
              </Button>
            )}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* ====================================================================
          MODAL DE EMERGENCIA ASIGNADA
          ==================================================================== */}
      <Modal isOpen={isEmergencyModalOpen} onClose={onEmergencyModalClose} isCentered size="lg">
        <ModalOverlay bg="rgba(0,0,0,0.85)" backdropFilter="blur(8px)" />
        <ModalContent bg="#0f172a" border="2px solid #dc2626" borderRadius="xl" mx={3}>
          <ModalHeader bg="#7f1d1d" borderTopRadius="xl" py={4}>
            <HStack spacing={3}>
              <Icon as={FaExclamationTriangle} color="#fca5a5" boxSize={5} />
              <VStack align="start" spacing={0}>
                <Text color="white" fontWeight="900" fontSize="14px" letterSpacing="1px">EMERGENCIA ASIGNADA</Text>
                <Text color="#fca5a5" fontSize="11px" fontFamily="mono">{assignedEmergency?.callId}</Text>
              </VStack>
            </HStack>
          </ModalHeader>

          <ModalBody py={5}>
            {assignedEmergency && (
              <VStack spacing={4} align="stretch">
                <Box bg="#1e293b" p={3} borderRadius="md" border="1px solid #334155">
                  <Text fontSize="10px" color="#64748b" mb={1} fontWeight="bold">TIPO DE EMERGENCIA</Text>
                  <Text color="#f8fafc" fontWeight="900" fontSize="16px">{assignedEmergency.emergencyType}</Text>
                </Box>

                <Box bg="#1e293b" p={3} borderRadius="md" border="1px solid #334155">
                  <Text fontSize="10px" color="#64748b" mb={1} fontWeight="bold">UBICACIÓN DEL INCIDENTE</Text>
                  <HStack spacing={2}>
                    <Icon as={FaMapMarkerAlt} color="#ef4444" />
                    <Text color="#e2e8f0" fontSize="13px" fontWeight="bold">{assignedEmergency.address}</Text>
                  </HStack>
                  {assignedEmergency.location && (
                    <Text fontFamily="mono" fontSize="10px" color="#64748b" mt={1}>
                      {assignedEmergency.location.lat?.toFixed(6)}, {assignedEmergency.location.lng?.toFixed(6)}
                    </Text>
                  )}
                </Box>

                {assignedEmergency.patientInfo && Object.values(assignedEmergency.patientInfo).some(Boolean) && (
                  <Box bg="#1e293b" p={3} borderRadius="md" border="1px solid #334155">
                    <Text fontSize="10px" color="#64748b" mb={2} fontWeight="bold">DATOS DEL PACIENTE</Text>
                    <SimpleGrid columns={2} gap={2}>
                      {assignedEmergency.patientInfo.age && (
                        <HStack spacing={2}>
                          <Icon as={FaUser} color="#94a3b8" boxSize={3} />
                          <Text color="#e2e8f0" fontSize="12px">{assignedEmergency.patientInfo.age} años</Text>
                        </HStack>
                      )}
                      {assignedEmergency.patientInfo.sex && (
                        <Text color="#e2e8f0" fontSize="12px">Sexo: {assignedEmergency.patientInfo.sex}</Text>
                      )}
                      {assignedEmergency.patientInfo.condition && (
                        <Text color="#fbbf24" fontSize="12px" fontWeight="bold" gridColumn="1 / -1">
                          {assignedEmergency.patientInfo.condition}
                        </Text>
                      )}
                    </SimpleGrid>
                  </Box>
                )}

                {assignedEmergency.notes && (
                  <Box bg="#1e293b" p={3} borderRadius="md" border="1px solid #334155">
                    <Text fontSize="10px" color="#64748b" mb={1} fontWeight="bold">NOTAS DEL ENTORNO</Text>
                    <Text color="#94a3b8" fontSize="12px">{assignedEmergency.notes}</Text>
                  </Box>
                )}

                {Object.values(activeRoutes).filter(r => r.isEmergency).map((r, i) => (
                  <Box key={i} bg="#14532d" p={3} borderRadius="md" border="1px solid #166534">
                    <HStack spacing={3}>
                      <Icon as={FaRoute} color="#4ade80" />
                      <Text color="#4ade80" fontWeight="bold" fontSize="13px">
                        Ruta calculada: {fmtDist((r.distance || 0) / 1000)} · {fmtDur(r.duration)}
                      </Text>
                    </HStack>
                  </Box>
                ))}
              </VStack>
            )}
          </ModalBody>

          <ModalFooter borderTop="1px solid #1e293b" gap={3}>
            <Button flex={1} bg="#dc2626" color="white" fontWeight="bold" _hover={{ bg: '#b91c1c' }} leftIcon={<FaRoute />} onClick={() => {
              if (assignedEmergency?.location && myLocation) {
                computeRoute(myLocation, assignedEmergency.location, true).then(route => {
                  if (route) {
                    const routeKey = `emergency-${assignedEmergency.callId}`;
                    drawRoute(routeKey, route.geometry, '#ef4444', true);
                    setActiveRoutes(prev => ({
                      ...prev,
                      [routeKey]: { callId: assignedEmergency.callId, distance: route.distance, duration: route.duration, geometry: route.geometry, isEmergency: true }
                    }));
                    if (route.steps && route.steps.length > 0) {
                      setCurrentManeuver(route.steps[0]);
                      setRouteProgress({ distanceRemaining: route.distance, durationRemaining: route.duration });
                    }
                  }
                });
              }
            }}>RECALCULAR RUTA</Button>
            <Button flex={1} bg="#10b981" color="white" fontWeight="bold" _hover={{ bg: '#059669' }} leftIcon={<FaCheckCircle />} onClick={() => confirmAction(handleCompleteEmergency, 'Completar Emergencia', `¿Confirma que la emergencia ${assignedEmergency?.callId} ha sido atendida?`)}>COMPLETAR</Button>
            <Button flex={1} bg="#1e293b" color="#94a3b8" _hover={{ bg: '#334155' }} onClick={onEmergencyModalClose}>CERRAR</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ====================================================================
          DIÁLOGO DE CONFIRMACIÓN
          ==================================================================== */}
      <AlertDialog isOpen={isAlertOpen} leastDestructiveRef={cancelRef} onClose={onAlertClose} isCentered>
        <AlertDialogOverlay bg="rgba(0,0,0,0.7)" backdropFilter="blur(6px)" />
        <AlertDialogContent bg="#0f172a" border="1px solid #334155" borderRadius="xl" mx={4}>
          <AlertDialogHeader color="#f8fafc" fontWeight="900" fontSize="14px" borderBottom="1px solid #1e293b">
            {pendingAction?.title || 'Confirmar'}
          </AlertDialogHeader>
          <AlertDialogBody color="#94a3b8" fontSize="13px" py={5}>
            {pendingAction?.body || '¿Está seguro de continuar?'}
          </AlertDialogBody>
          <AlertDialogFooter gap={3} borderTop="1px solid #1e293b">
            <Button ref={cancelRef} onClick={onAlertClose} bg="#1e293b" color="#94a3b8" _hover={{ bg: '#334155' }}>Cancelar</Button>
            <Button bg="#dc2626" color="white" _hover={{ bg: '#b91c1c' }} onClick={executeConfirmed}>Confirmar</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </Box>
  );
};

// ========================================================================
// COMPONENTE: REGISTRATION MODAL
// ========================================================================
const RegistrationModal = ({ onRegister }) => {
  const [form, setForm] = useState({ id: '', placa: '', nombre: '', tipo: 'UVI Móvil' });
  const [error, setError] = useState('');

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleSubmit = () => {
    if (!form.id.trim() || !form.placa.trim() || !form.nombre.trim()) {
      setError('Todos los campos marcados con * son obligatorios.');
      return;
    }
    const data = {
      id: form.id.trim().toUpperCase(),
      placa: form.placa.trim().toUpperCase(),
      nombre: form.nombre.trim(),
      tipo: form.tipo,
    };
    saveAmbulance(data);
    onRegister(data);
  };

  return (
    <Modal isOpen isCentered size="md" closeOnOverlayClick={false} closeOnEsc={false}>
      <ModalOverlay bg="rgba(0,0,0,0.85)" backdropFilter="blur(8px)" />
      <ModalContent bg="#0f172a" border="2px solid #0284c7" borderRadius="xl" shadow="2xl" mx={4}>
        <ModalHeader borderBottom="1px solid #1e293b" pb={4}>
          <HStack spacing={3}>
            <Icon as={FaAmbulance} color="#0284c7" boxSize={6} />
            <VStack align="start" spacing={0}>
              <Text color="#f8fafc" fontWeight="900" fontSize="15px" letterSpacing="1px">
                IDENTIFICACIÓN DE UNIDAD
              </Text>
              <Text color="#64748b" fontSize="11px">Centro de Comando C5 — Morelia</Text>
            </VStack>
          </HStack>
        </ModalHeader>

        <ModalBody py={6}>
          <VStack spacing={5}>
            <FormControl isRequired>
              <FormLabel color="#94a3b8" fontSize="11px" fontWeight="bold" letterSpacing="0.5px" mb={2}>
                * ID DE UNIDAD (ej. UVI-01)
              </FormLabel>
              <Input
                value={form.id}
                onChange={handleChange('id')}
                placeholder="UVI-01"
                bg="#1e293b" border="1px solid #334155" color="#f8fafc"
                borderRadius="md" h="46px" fontSize="15px" fontFamily="mono" fontWeight="bold"
                textTransform="uppercase"
                _focus={{ borderColor: '#0284c7', boxShadow: '0 0 0 1px #0284c7' }}
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel color="#94a3b8" fontSize="11px" fontWeight="bold" letterSpacing="0.5px" mb={2}>
                * PLACA
              </FormLabel>
              <Input
                value={form.placa}
                onChange={handleChange('placa')}
                placeholder="ABC-123"
                bg="#1e293b" border="1px solid #334155" color="#f8fafc"
                borderRadius="md" h="46px" fontSize="15px" fontFamily="mono" fontWeight="bold"
                textTransform="uppercase"
                _focus={{ borderColor: '#0284c7', boxShadow: '0 0 0 1px #0284c7' }}
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel color="#94a3b8" fontSize="11px" fontWeight="bold" letterSpacing="0.5px" mb={2}>
                * NOMBRE DE LA UNIDAD
              </FormLabel>
              <Input
                value={form.nombre}
                onChange={handleChange('nombre')}
                placeholder="Unidad de Vida UVI-01"
                bg="#1e293b" border="1px solid #334155" color="#f8fafc"
                borderRadius="md" h="46px" fontSize="14px"
                _focus={{ borderColor: '#0284c7', boxShadow: '0 0 0 1px #0284c7' }}
              />
            </FormControl>

            <FormControl>
              <FormLabel color="#94a3b8" fontSize="11px" fontWeight="bold" letterSpacing="0.5px" mb={2}>
                TIPO DE UNIDAD
              </FormLabel>
              <Select
                value={form.tipo}
                onChange={handleChange('tipo')}
                bg="#1e293b" border="1px solid #334155" color="#f8fafc"
                borderRadius="md" h="46px" fontSize="14px"
                _focus={{ borderColor: '#0284c7', boxShadow: 'none' }}
              >
                {TIPOS_AMBULANCIA.map(t => (
                  <option key={t} value={t} style={{ background: '#1e293b' }}>{t}</option>
                ))}
              </Select>
            </FormControl>

            {error && (
              <Box w="100%" bg="#450a0a" border="1px solid #dc2626" borderRadius="md" p={3}>
                <Text color="#fca5a5" fontSize="12px" fontWeight="bold">{error}</Text>
              </Box>
            )}
          </VStack>
        </ModalBody>

        <ModalFooter borderTop="1px solid #1e293b" pt={4}>
          <Button
            w="100%" h="52px" bg="#0284c7" color="white"
            fontWeight="900" fontSize="14px" letterSpacing="1px"
            borderRadius="md"
            _hover={{ bg: '#0369a1' }} _active={{ bg: '#075985' }}
            onClick={handleSubmit}
          >
            INICIAR SERVICIO
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default MapaOperador;