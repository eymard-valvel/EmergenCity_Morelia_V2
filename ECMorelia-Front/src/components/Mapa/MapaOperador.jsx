// src/components/operador/MapaOperador.jsx
// EmergenCity - Consola de navegación móvil
// v3: rutas con validación, auto-recalculo inteligente, sin emojis

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { searchPlaces, getPlaceTypeLabel } from '../../helpers/placeSearch.js';
import { useNavigate } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { readLocal, saveLocal } from '../../helpers/persistence.js';

import {
  Box, Flex, VStack, HStack, Text, Button, Icon, Badge,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Drawer, DrawerOverlay, DrawerContent, DrawerHeader, DrawerBody, DrawerFooter,
  useToast, useDisclosure, FormControl, FormLabel,
  InputGroup, Input, IconButton, Select, ButtonGroup, Heading, SlideFade, Divider, Tooltip,
  Progress, SimpleGrid
} from '@chakra-ui/react';
import {
  FaAmbulance, FaHospital, FaMapMarkerAlt,
  FaSignOutAlt, FaLocationArrow, FaArrowLeft, FaMap,
  FaArrowRight, FaPlus, FaMinus, FaSearch, FaTimes, FaUndo, FaArrowUp, FaTimesCircle,
  FaSyncAlt
} from 'react-icons/fa';
import { MdCenterFocusStrong } from 'react-icons/md';
import { resolveWsUrl } from '../../helpers/wsUrl.js';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ||
  'pk.eyJ1IjoiZXltYXJkMjkiLCJhIjoiY21tcDY4YzNpMGw3bjJzb203YmZyNTVnMyI';

const WS_URL = resolveWsUrl();
const DEFAULT_CENTER = { lat: 19.7024, lng: -101.1969 };
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT = 5;

// === Estrategia anti-costo Mapbox (100k req/mes free tier) ===
const ROUTE_POLL_INTERVAL = 20000;      // Poll cada 20s
const MIN_MOVE_FOR_POLL = 150;          // Solo recalcular si se movió >150m
const OFF_ROUTE_THRESHOLD_M = 120;      // Desvío considerado "fuera de ruta"
const OFF_ROUTE_CHECK_INTERVAL = 5000;  // Chequeo local cada 5s
const OFF_ROUTE_RECALC_COOLDOWN = 20000;// Mín 20s entre recalculos por desvío
const MAX_REASONABLE_ROUTE_FACTOR = 3;  // Ruta > 3x línea recta = sospechosa

const TIPOS_AMBULANCIA = ['UVI Móvil', 'Ambulancia Básica', 'Ambulancia Avanzada', 'Motocicleta de Respuesta'];
const DIAGNOSTICOS_RAPIDOS = [
  'Traumatismo / Caída', 'Evento Cardiovascular', 'Problema Respiratorio',
  'Afectación Neurológica', 'Metabólico / Intoxicación', 'Gineco-Obstétrico',
  'Quemaduras graves', 'Otro'
];

const STATUS_OPTIONS = [
  { value: 'disponible', label: 'LIBRE', color: '#10b981' },
  { value: 'en_ruta', label: 'EN RUTA', color: '#0ea5e9' },
  { value: 'ocupado', label: 'OCUPADO', color: '#f59e0b' },
  { value: 'fuera_de_servicio', label: 'FUERA', color: '#64748b' },
];

const SESSION_KEY = 'ambulanciaRegistrada';
const loadSavedAmbulance = () => { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; } };
const saveAmbulance = (data) => sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
const clearAmbulance = () => sessionStorage.removeItem(SESSION_KEY);

const fmtDist = (km) => km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
const fmtDur = (seconds) => {
  if (!seconds || !Number.isFinite(seconds)) return '—';
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isValidCoord(c) {
  return c &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng) &&
    Math.abs(c.lat) <= 90 &&
    Math.abs(c.lng) <= 180 &&
    !(Math.abs(c.lat) < 0.0001 && Math.abs(c.lng) < 0.0001);
}

// Distancia mínima de un punto a una polilínea (aprox, en metros)
function distanceToRouteMeters(location, geometry) {
  if (!location || !Array.isArray(geometry) || geometry.length < 2) return Infinity;
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const lat0 = toRad(location.lat);
  const px = toRad(location.lng) * R * Math.cos(lat0);
  const py = toRad(location.lat) * R;

  let minDist = Infinity;
  // Muestreamos cada ~2 puntos de la polilínea para eficiencia
  const step = geometry.length > 200 ? 2 : 1;
  for (let i = 0; i < geometry.length - step; i += step) {
    const a = geometry[i];
    const b = geometry[i + step];
    const ax = toRad(a[0]) * R * Math.cos(lat0);
    const ay = toRad(a[1]) * R;
    const bx = toRad(b[0]) * R * Math.cos(lat0);
    const by = toRad(b[1]) * R;

    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 0) t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    const projX = ax + t * dx;
    const projY = ay + t * dy;
    const dist = Math.hypot(px - projX, py - projY);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

export default function MapaOperador() {
  const toast = useToast();
  const navigate = useNavigate();

const [searchingHospital, setSearchingHospital] = useState(false);


  const wsRef = useRef(null);
  const isMounted = useRef(true);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef(null);
  const [wsStatus, setWsStatus] = useState('connecting');

  const watchId = useRef(null);
  const gpsHeading = useRef(0);
  const isInitialMapCentered = useRef(false);
  const [myLocation, setMyLocation] = useState(null);
  const [mySpeed, setMySpeed] = useState(0);
  const [myHeading, setMyHeading] = useState(0);

  const mapContainer = useRef(null);
  const map = useRef(null);
  const ambulanceMarker = useRef(null);
  const destinationMarker = useRef(null);

  const [isFollowing, setIsFollowing] = useState(true);
  const [isGpsMode, setIsGpsMode] = useState(true);

  const activeDestination = useRef(null);
  const routeIntervalRef = useRef(null);
  const offRouteCheckRef = useRef(null);
  const lastRouteCalcRef = useRef({ loc: null, time: 0 });
  const lastOffRouteRecalcRef = useRef(0);
  const searchAbortRef = useRef(null);
const searchDebounceRef = useRef(null);
  const currentRouteGeometry = useRef(null);
  const isNavigatingRef = useRef(false);

  const [isNavigating, setIsNavigating] = useState(false);
  const [currentManeuver, setCurrentManeuver] = useState(null);
  const [routeProgress, setRouteProgress] = useState(null);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [cancelStep, setCancelStep] = useState('idle');

  const [pendingOffer, setPendingOffer] = useState(null);
  const [offerTimeLeft, setOfferTimeLeft] = useState(20);
  const [offerRejecting, setOfferRejecting] = useState(false);
  const offerTimerRef = useRef(null);

  const [ambulanceStatus, setAmbulanceStatus] = useState('disponible');
  const [hospitals, setHospitals] = useState([]);


  const { isOpen: isDrawerOpen, onOpen: onDrawerOpen, onClose: onDrawerClose } = useDisclosure();
  const { isOpen: isAlertOpen, onOpen: onAlertOpen, onClose: onAlertClose } = useDisclosure();

  const [ambulancia, setAmbulancia] = useState(() => loadSavedAmbulance());
const [assignedEmergency, setAssignedEmergency] = useState(
  () => readLocal('operador', 'assignedEmergency', null)
);
const [hospitalRequest, setHospitalRequest] = useState(
  () => readLocal('operador', 'hospitalRequest', null)
);

  const [drawerMode, setDrawerMode] = useState('atender');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState(null);
  const [patientData, setPatientData] = useState({ edad: 35, sexo: 'N/S', diagnostico: DIAGNOSTICOS_RAPIDOS[0] });
  const [operatorPatientData, setOperatorPatientData] = useState(() => {
  try {
    const saved = localStorage.getItem('operatorPatientTemplate');
    if (saved) return JSON.parse(saved);
  } catch (_) {}
  return {
    cantidad: 1,
    pacientes: [{ sexo: '', edad: '', consciente: '', respira: '', sangrado: '', atrapado: '' }],
    diagnostico: DIAGNOSTICOS_RAPIDOS[0],
    notas: '',
  };
});
const [isCreatingEmergency, setIsCreatingEmergency] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  useEffect(() => { isNavigatingRef.current = isNavigating; }, [isNavigating]);

  const sendWS = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  const changeStatus = useCallback((newStatus) => {
    setAmbulanceStatus(newStatus);
    sendWS({ type: 'ambulance_status_update', ambulanceId: ambulancia?.id, status: newStatus });
  }, [ambulancia, sendWS]);

  const handleEmergencyOffer = useCallback((data) => {
    if (isNavigatingRef.current) {
      sendWS({ type: 'emergency_reject', offerId: data.offerId, reason: 'Unidad en servicio' });
      return;
    }
    if (offerTimerRef.current) clearInterval(offerTimerRef.current);
    setPendingOffer(data);
    setOfferRejecting(false);
    const secs = Math.max(5, Math.ceil((data.expiresInMs || 20000) / 1000));
    setOfferTimeLeft(secs);
    offerTimerRef.current = setInterval(() => {
      setOfferTimeLeft(prev => {
        if (prev <= 1) { clearInterval(offerTimerRef.current); setPendingOffer(null); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, [sendWS]);

  useEffect(() => { saveLocal('operador', 'assignedEmergency', assignedEmergency); }, [assignedEmergency]);
useEffect(() => { saveLocal('operador', 'hospitalRequest', hospitalRequest); }, [hospitalRequest]);

  // ==================== WS ====================
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
            id: ambulancia.id, placa: ambulancia.placa,
            nombre: ambulancia.nombre, tipo: ambulancia.tipo,
            status: ambulanceStatus,
            location: myLocation || DEFAULT_CENTER
          }
        }));
        ws.send(JSON.stringify({ type: 'request_hospitals_list' }));
      };

ws.onmessage = async (e) => {
        if (!isMounted.current) return;
        try {
          const data = JSON.parse(e.data);
          switch (data.type) {
            case 'connection_established': break;
            case 'active_hospitals_update': setHospitals(data.hospitals || []); break;
            case 'emergency_offer': handleEmergencyOffer(data); break;
            case 'hospital_request_sent':
  setSearchingHospital(false);
  setHospitalRequest({
    hospitalName: data.hospitalName,
    hospitalId: data.hospitalId,
    distanceKm: data.distanceKm,
    callId: data.callId,
    sentAt: new Date().toISOString()
  });
  toast({
    title: 'Solicitud enviada',
    description: `${data.hospitalName} (${data.distanceKm} km)`,
    status: 'success',
    duration: 6000,
    position: 'bottom'
  });
  break;

case 'hospital_search_failed':
  setSearchingHospital(false);
  toast({
    title: 'Sin hospitales conectados',
    description: 'No hay hospitales disponibles en este momento.',
    status: 'warning',
    duration: 8000,
    position: 'bottom'
  });
  break;
            case 'new_emergency_assigned':
              // Guardar datos del receptor como template local para reutilizar
if (data.patientInfo && Object.keys(data.patientInfo).length > 0) {
  try {
    const template = {
      cantidad: data.patientInfo.cantidad || 1,
      pacientes: data.patientInfo.pacientes || [{
        sexo: data.patientInfo.sexo || '',
        edad: data.patientInfo.edad || '',
        consciente: data.patientInfo.consciente || '',
        respira: data.patientInfo.respira || '',
        sangrado: data.patientInfo.sangrado || '',
        atrapado: data.patientInfo.atrapado || '',
      }],
      diagnostico: data.emergencyType || DIAGNOSTICOS_RAPIDOS[0],
      notas: data.notes || '',
    };
    localStorage.setItem('operatorPatientTemplate', JSON.stringify(template));
    setOperatorPatientData(template);
  } catch (_) {}
}
              setPendingOffer(null);
              if (offerTimerRef.current) clearInterval(offerTimerRef.current);
              setAssignedEmergency(data);
              if (data.location) startNavigationEngine(data.location, 'emergency', data.address);
              toast({ title: 'Emergencia asignada', description: data.address || 'Diríjase al punto', status: 'error', duration: 10000, position: 'bottom' });
              break;

              case 'patient_accepted_with_route': {
  const hospitalName = data.hospitalInfo?.nombre || data.hospitalId;
  const hospitalLat = data.hospitalInfo?.lat;
  const hospitalLng = data.hospitalInfo?.lng;

  toast({
    title: 'Hospital aceptó',
    description: `Redirigiendo a ${hospitalName}`,
    status: 'success',
    duration: 6000,
    position: 'bottom'
  });

  if (hospitalLat && hospitalLng) {
    const dest = { lat: hospitalLat, lng: hospitalLng };
    activeDestination.current = { ...dest, mode: 'transfer', address: hospitalName };
    placeDestinationMarker(dest);

    if (data.routeGeometry) {
      drawRoute(data.routeGeometry, '#ef4444');
      currentRouteGeometry.current = data.routeGeometry;
      setRouteProgress({
        distanceRemaining: data.distance,
        durationRemaining: data.duration
      });
    }

    if (myLocation) {
      const route = await computeRoute(myLocation, dest);
      if (route) {
        drawRoute(route.geometry, '#ef4444');
        currentRouteGeometry.current = route.geometry;
        setCurrentManeuver(route.steps[0]);
        setRouteProgress({
          distanceRemaining: route.distance,
          durationRemaining: route.duration
        });
        lastRouteCalcRef.current = { loc: { ...myLocation }, time: Date.now() };
      }
    }

    setIsNavigating(true);
    setCancelStep('idle');
    changeStatus('en_ruta');
    setHospitalRequest(null);

    if (map.current && myLocation) {
      setIsGpsMode(true);
      setIsFollowing(true);
      map.current.flyTo({
        center: [myLocation.lng, myLocation.lat],
        zoom: 18, pitch: 60, bearing: myHeading, duration: 1200
      });
    }
  }
  break;
}

case 'patient_accepted': {
  toast({
    title: 'Hospital aceptó',
    description: data.hospitalInfo?.nombre || data.hospitalId,
    status: 'success',
    duration: 6000,
    position: 'bottom'
  });
  setHospitalRequest(null);
  break;
}

            case 'patient_rejected':
              toast({ title: 'Hospital rechazó', description: 'Seleccione otra alternativa.', status: 'error', duration: 8000, position: 'bottom' });
              silentCleanupNavigation();
              break;
            case 'automatic_redirect':
              toast({ title: 'Reenvío automático', description: `Nueva solicitud a ${data.hospitalInfo?.nombre || data.newHospitalId}`, status: 'info', duration: 5000, position: 'bottom' });
              break;
            case 'no_hospitals_available':
              toast({ title: 'Sin hospitales', description: 'Todos los hospitales rechazaron.', status: 'warning', duration: 8000, position: 'bottom' });
              break;
            case 'navigation_cancelled':
              toast({ title: 'Ruta cancelada', description: 'El CRUM canceló el servicio.', status: 'info', duration: 5000, position: 'bottom' });
              silentCleanupNavigation();
              break;
            case 'paramedic_paired':
              toast({ title: 'Paramédico vinculado', description: `${data.nombre || data.paramedicId} en esta unidad`, status: 'success', duration: 5000, position: 'bottom' });
              break;
            case 'error':
              console.warn('[WS error]', data.message);
              break;
            default: break;
          }
        } catch (_) {}
      };

      ws.onclose = () => {
        if (!isMounted.current) return;
        wsRef.current = null;
        if (reconnectAttempts.current < MAX_RECONNECT) {
          setWsStatus('disconnected');
          reconnectAttempts.current += 1;
          reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
        } else setWsStatus('failed');
      };

      ws.onerror = () => { if (isMounted.current) setWsStatus('disconnected'); };
    };

    connect();
    return () => {
      isMounted.current = false;
      clearTimeout(reconnectTimer.current);
      if (offerTimerRef.current) clearInterval(offerTimerRef.current);
      if (wsRef.current) try { wsRef.current.close(); } catch (_) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambulancia]);

  // ==================== MAPBOX ====================
  useEffect(() => {
    if (!ambulancia || !mapContainer.current) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!isValidCoord(loc)) return;
        setMyLocation(loc);
        if (map.current && !isInitialMapCentered.current) {
          map.current.jumpTo({ center: [loc.lng, loc.lat], zoom: 18, pitch: 60 });
          isInitialMapCentered.current = true;
          updateAmbulanceMarker(loc, 0);
        }
      },
      () => {}, { enableHighAccuracy: true, timeout: 5000 }
    );

    const mapInstance = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
      zoom: 14, pitch: 0, bearing: 0,
      attributionControl: false, logoPosition: 'bottom-left'
    });

    mapInstance.on('load', () => {
      map.current = mapInstance;
      if (!mapInstance.getSource('mapbox-traffic')) {
        mapInstance.addSource('mapbox-traffic', { type: 'vector', url: 'mapbox://mapbox.mapbox-traffic-v1' });
      }
      if (!mapInstance.getLayer('traffic-layer-amb')) {
        mapInstance.addLayer({
          id: 'traffic-layer-amb', type: 'line', source: 'mapbox-traffic', 'source-layer': 'traffic',
          paint: {
            'line-color': ['match', ['get', 'congestion'],
              'low', '#00C853', 'moderate', '#FFD600', 'heavy', '#FF9100', 'severe', '#D50000', '#00C853'],
            'line-width': 6, 'line-opacity': 0.8
          }
        }, 'waterway-label');
      }

      setMyLocation((prevLoc) => {
        if (prevLoc && !isInitialMapCentered.current) {
          mapInstance.jumpTo({ center: [prevLoc.lng, prevLoc.lat], zoom: 18, pitch: 60 });
          isInitialMapCentered.current = true;
          updateAmbulanceMarker(prevLoc, 0);
        }
        return prevLoc;
      });
    });

    mapInstance.on('dragstart', () => setIsFollowing(false));
    return () => mapInstance.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambulancia]);

  useEffect(() => {
    if (!ambulancia) return;
    const handleOrientation = (e) => {
      const hdg = e.webkitCompassHeading != null ? e.webkitCompassHeading : (360 - (e.alpha || 0));
      if (mySpeed < 5) { gpsHeading.current = hdg; setMyHeading(hdg); updateMarkerRotation(hdg); }
    };
    window.addEventListener('deviceorientation', handleOrientation, true);

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!isValidCoord(loc)) return;
        const spd = pos.coords.speed != null ? parseFloat((pos.coords.speed * 3.6).toFixed(1)) : 0;
        const hdg = pos.coords.heading != null && !isNaN(pos.coords.heading) ? pos.coords.heading : gpsHeading.current;

        if (spd >= 5) { gpsHeading.current = hdg; setMyHeading(hdg); updateMarkerRotation(hdg); }
        setMyLocation(loc);
        setMySpeed(spd);
        updateAmbulanceMarker(loc, hdg);

        if (isFollowing && map.current) {
          if (!isInitialMapCentered.current) {
            map.current.jumpTo({ center: [loc.lng, loc.lat], zoom: isGpsMode ? 18 : 14, pitch: isGpsMode ? 60 : 0 });
            isInitialMapCentered.current = true;
          } else {
            map.current.easeTo({
              center: [loc.lng, loc.lat], bearing: isGpsMode ? hdg : 0,
              pitch: isGpsMode ? 60 : 0, zoom: isGpsMode ? 18 : 14, duration: 1000
            });
          }
        }
        sendWS({
          type: 'location_update', ambulanceId: ambulancia.id,
          location: loc, speed: spd, heading: hdg, status: ambulanceStatus
        });
      },
      () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation, true);
      navigator.geolocation.clearWatch(watchId.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambulancia, ambulanceStatus, sendWS, isFollowing, isGpsMode, mySpeed]);

  const updateMarkerRotation = useCallback((hdg) => {
    if (ambulanceMarker.current) {
      const el = ambulanceMarker.current.getElement().querySelector('.amb-body');
      if (el) el.style.transform = `translate(-50%,-50%) rotate(${hdg}deg)`;
    }
  }, []);

  const updateAmbulanceMarker = useCallback((loc, hdg) => {
    if (!map.current) return;
    if (!ambulanceMarker.current) {
      const el = document.createElement('div');
      el.style.cssText = 'position:relative;width:60px;height:60px;';
      el.innerHTML = `
        <div class="amb-body" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
          width:30px;height:30px;border-radius:50%; background:#0ea5e9;
          border:4px solid #ffffff; box-shadow:0 0 15px rgba(0,0,0,0.5);
          display:flex;align-items:center;justify-content:center;">
          <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:10px solid white;position:absolute;top:3px;"></div>
        </div>`;
      ambulanceMarker.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([loc.lng, loc.lat]).addTo(map.current);
    } else ambulanceMarker.current.setLngLat([loc.lng, loc.lat]);
  }, []);

  const placeDestinationMarker = useCallback((loc) => {
    if (!map.current) return;
    if (destinationMarker.current) destinationMarker.current.remove();
    const el = document.createElement('div');
    el.innerHTML = `<div style="width:20px;height:20px;border-radius:50%;background:#ef4444;border:3px solid #ffffff;box-shadow:0 0 12px rgba(0,0,0,0.6);"></div>`;
    destinationMarker.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([loc.lng, loc.lat]).addTo(map.current);
  }, []);

  // ==================== MOTOR DE RUTAS ====================
  const computeRoute = useCallback(async (start, end) => {
    if (!isValidCoord(start) || !isValidCoord(end)) {
      console.warn('[route] Coordenadas inválidas:', start, end);
      return null;
    }

    const straightKm = calcDistance(start.lat, start.lng, end.lat, end.lng);
    // Sanity check 1: no rutas absurdas (>500 km en Morelia es imposible)
    if (straightKm > 500) {
      console.warn('[route] Distancia lineal irreal:', straightKm, 'km');
      return null;
    }

    try {
      const coords = `${start.lng},${start.lat};${end.lng},${end.lat}`;
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?geometries=geojson&overview=full&steps=true&access_token=${mapboxgl.accessToken}&language=es`;
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const data = await resp.json();
      const route = data.routes?.[0];
      if (!route) return null;

      const routeKm = route.distance / 1000;
      // Sanity check 2: ruta > 3x línea recta + margen = corrupta
      if (routeKm > straightKm * MAX_REASONABLE_ROUTE_FACTOR + 5) {
        console.warn(`[route] Ruta sospechosa: ${routeKm.toFixed(1)}km vs ${straightKm.toFixed(1)}km recto`);
        return null;
      }

      return {
        geometry: route.geometry.coordinates,
        distance: route.distance,
        duration: route.duration,
        steps: route.legs?.[0]?.steps || []
      };
    } catch (e) {
      console.warn('[route] Error:', e.message);
      return null;
    }
  }, []);

  const drawRoute = useCallback((geometry, color = '#0ea5e9') => {
    if (!map.current) return;
    const routeKey = 'active-route';
    try {
      if (map.current.getLayer(routeKey)) map.current.removeLayer(routeKey);
      if (map.current.getLayer(`${routeKey}-glow`)) map.current.removeLayer(`${routeKey}-glow`);
      if (map.current.getSource(routeKey)) map.current.removeSource(routeKey);
    } catch {}

    const geojson = { type: 'Feature', geometry: { type: 'LineString', coordinates: geometry } };
    map.current.addSource(routeKey, { type: 'geojson', data: geojson });
    map.current.addLayer({
      id: `${routeKey}-glow`, type: 'line', source: routeKey,
      paint: { 'line-color': color, 'line-width': 18, 'line-opacity': 0.25, 'line-blur': 6 }
    });
    map.current.addLayer({
      id: routeKey, type: 'line', source: routeKey,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': color, 'line-width': 8, 'line-opacity': 1 }
    });
  }, []);

  const recalcRoute = useCallback(async (silent = false) => {
    if (!activeDestination.current || !myLocation) return;
    if (isRecalculating) return;
    setIsRecalculating(true);
    try {
      const route = await computeRoute(myLocation, activeDestination.current);
      if (route) {
        const color = activeDestination.current.mode === 'emergency' ? '#ef4444' : '#0ea5e9';
        drawRoute(route.geometry, color);
        currentRouteGeometry.current = route.geometry;
        setCurrentManeuver(route.steps[0]);
        setRouteProgress({ distanceRemaining: route.distance, durationRemaining: route.duration });
        lastRouteCalcRef.current = { loc: { ...myLocation }, time: Date.now() };
        if (!silent) toast({ title: 'Ruta actualizada', status: 'info', duration: 2000, position: 'bottom' });
      }
    } finally {
      setIsRecalculating(false);
    }
  }, [myLocation, computeRoute, drawRoute, isRecalculating, toast]);

  const startNavigationEngine = async (targetLoc, mode = 'manual', address = '') => {
    let loc = myLocation;
    if (!loc) {
      try {
        loc = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            err => reject(err), { enableHighAccuracy: true, timeout: 5000 }
          );
        });
        if (isValidCoord(loc)) setMyLocation(loc);
        else loc = null;
      } catch {
        toast({ title: 'Sin GPS', description: 'No se pudo obtener ubicación. La ruta visual no está disponible.', status: 'warning', duration: 5000, position: 'bottom' });
        loc = null;
      }
    }

    activeDestination.current = { ...targetLoc, mode, address };
    placeDestinationMarker(targetLoc);
    setIsNavigating(true);
    setCancelStep('idle');
    changeStatus('en_ruta');
    setIsFollowing(true);
    onDrawerClose();

    if (map.current) {
      if (loc) {
        map.current.flyTo({ center: [loc.lng, loc.lat], zoom: 18, pitch: 60, bearing: myHeading, duration: 1200 });
      } else {
        map.current.flyTo({ center: [targetLoc.lng, targetLoc.lat], zoom: 15, duration: 1200 });
      }
      setIsGpsMode(true);
    }

    if (loc) {
      const color = mode === 'emergency' ? '#ef4444' : '#0ea5e9';
      const route = await computeRoute(loc, targetLoc);
      if (route) {
        drawRoute(route.geometry, color);
        currentRouteGeometry.current = route.geometry;
        setCurrentManeuver(route.steps[0]);
        setRouteProgress({ distanceRemaining: route.distance, durationRemaining: route.duration });
        lastRouteCalcRef.current = { loc: { ...loc }, time: Date.now() };
      } else {
        toast({ title: 'Ruta no disponible', description: 'Mostrando destino. Reintente al moverse.', status: 'warning', duration: 5000, position: 'bottom' });
      }
    }
  };

  // Poll regular (20s, solo si se movió >150m)
  useEffect(() => {
    if (!isNavigating || !activeDestination.current) return;
    routeIntervalRef.current = setInterval(async () => {
      if (!myLocation || !activeDestination.current) return;
      const last = lastRouteCalcRef.current;
      const moved = last.loc
        ? calcDistance(last.loc.lat, last.loc.lng, myLocation.lat, myLocation.lng) * 1000
        : Infinity;
      if (moved < MIN_MOVE_FOR_POLL) return;
      await recalcRoute(true);
    }, ROUTE_POLL_INTERVAL);
    return () => { if (routeIntervalRef.current) clearInterval(routeIntervalRef.current); };
  }, [isNavigating, myLocation, recalcRoute]);

  // Detección de fuera de ruta (cada 5s, cálculo local)
  useEffect(() => {
    if (!isNavigating) return;
    offRouteCheckRef.current = setInterval(() => {
      if (!myLocation || !currentRouteGeometry.current) return;
      const distM = distanceToRouteMeters(myLocation, currentRouteGeometry.current);
      const now = Date.now();
      if (distM > OFF_ROUTE_THRESHOLD_M && now - lastOffRouteRecalcRef.current > OFF_ROUTE_RECALC_COOLDOWN) {
        lastOffRouteRecalcRef.current = now;
        console.info(`[route] Fuera de ruta (${Math.round(distM)}m). Recalculando…`);
        recalcRoute(true);
      }
    }, OFF_ROUTE_CHECK_INTERVAL);
    return () => { if (offRouteCheckRef.current) clearInterval(offRouteCheckRef.current); };
  }, [isNavigating, myLocation, recalcRoute]);

  // ==================== BÚSQUEDA ====================
const searchAddresses = useCallback((query) => {
  if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  if (!query || query.trim().length < 2) {
    setSearchResults([]);
    return;
  }
  searchDebounceRef.current = setTimeout(async () => {
    if (searchAbortRef.current) searchAbortRef.current.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    try {
      const results = await searchPlaces(query, {
  proximity: myLocation || DEFAULT_CENTER,
  mapboxToken: mapboxgl.accessToken,
  foursquareKey: import.meta.env.VITE_FOURSQUARE_KEY,
  signal: controller.signal,
});
      setSearchResults(results);
    } catch (e) {
      if (e.name !== 'AbortError') setSearchResults([]);
    }
  }, 250);
}, [myLocation]);

  const selectSearchResult = async (result) => {
    setSearchQuery(''); setSearchResults([]);
    const targetLoc = { lat: result.lat, lng: result.lng };
    startNavigationEngine(targetLoc, 'manual', result.place_name);
  };

  // ==================== CANCELACIÓN ====================
  const silentCleanupNavigation = useCallback(() => {
    setHospitalRequest(null);
setSearchingHospital(false);
    if (destinationMarker.current) { destinationMarker.current.remove(); destinationMarker.current = null; }
    try {
      if (map.current?.getLayer('active-route')) map.current.removeLayer('active-route');
      if (map.current?.getLayer('active-route-glow')) map.current.removeLayer('active-route-glow');
      if (map.current?.getSource('active-route')) map.current.removeSource('active-route');
    } catch {}
    activeDestination.current = null;
    currentRouteGeometry.current = null;
    lastRouteCalcRef.current = { loc: null, time: 0 };
    setIsNavigating(false);
    setCancelStep('idle');
    setCurrentManeuver(null);
    setRouteProgress(null);
    setSelectedHospitalId(null);
    centerMapAction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancelWithReason = useCallback((reasonCode) => {
  const callId = assignedEmergency?.callId;

  if (!callId && !activeDestination.current) {
    silentCleanupNavigation();
    changeStatus('disponible');
    toast({ title: 'Sin servicio activo', status: 'info', duration: 3000, position: 'bottom' });
    return;
  }

  if (reasonCode === 'completed') {
    if (callId) {
      sendWS({ type: 'emergency_completed', ambulanceId: ambulancia?.id, callId, completedBy: 'operador' });
    } else {
      sendWS({ type: 'ambulance_status_update', ambulanceId: ambulancia?.id, status: 'disponible' });
    }
    silentCleanupNavigation();
    setAssignedEmergency(null);
    setHospitalRequest(null);
    changeStatus('disponible');
    toast({ title: 'Servicio completado', status: 'success', duration: 4000, position: 'bottom' });
    return;
  }

  if (callId) {
    sendWS({
      type: 'ambulance_emergency_cancel',
      ambulanceId: ambulancia?.id,
      callId,
      reason: reasonCode,
      notes: ''
    });
  }

  silentCleanupNavigation();
  setAssignedEmergency(null);
  setHospitalRequest(null);

  if (reasonCode === 'averia' || reasonCode === 'pinchadura') {
    changeStatus('fuera_de_servicio');
    toast({
      title: 'Unidad fuera de servicio',
      description: 'Servicio reasignado a otra unidad',
      status: 'warning',
      duration: 6000,
      position: 'bottom'
    });
  } else {
    changeStatus('disponible');
    toast({
      title: 'Servicio cancelado',
      description: 'Unidad disponible para nuevo despacho',
      status: 'info',
      duration: 5000,
      position: 'bottom'
    });
  }
}, [assignedEmergency, ambulancia, sendWS, changeStatus, toast, silentCleanupNavigation]);

  const handleSendTransfer = async () => {
    const hospital = hospitals.find(h => h.id === selectedHospitalId);
    if (!hospital || !myLocation) return;
    setIsSending(true);
    sendWS({
      type: 'patient_transfer_notification',
      notificationId: `notif_${Date.now()}`,
      callId: assignedEmergency?.callId || null,
      ambulanceId: ambulancia.id,
      hospitalId: hospital.id,
      hospitalInfo: hospital,
      patientInfo: {
        nombre: 'Paciente Triage',
        edad: patientData.edad,
        sexo: patientData.sexo,
        condition: patientData.diagnostico
      },
      ambulanceLocation: myLocation,
      emergencyMode: 'trasladar_paciente'
    });
    toast({ title: 'Solicitud enviada', description: `Esperando confirmación de ${hospital.nombre}`, status: 'success', duration: 4000, position: 'bottom' });
    setIsSending(false);
    onDrawerClose();
  };

const requestHospitalNow = useCallback(() => {
  if (!sendWS({
    type: 'auto_request_hospital',
    callId: assignedEmergency?.callId,
    ambulanceId: ambulancia?.id,
    patientInfo: assignedEmergency?.patientInfo || {},
    emergencyType: assignedEmergency?.emergencyType || 'Urgencia',
    notes: assignedEmergency?.notes || ''
  })) {
    toast({
      title: 'Sin conexión',
      description: 'Reintente cuando vuelva la señal.',
      status: 'error',
      duration: 4000,
      position: 'bottom'
    });
    return;
  }
  setSearchingHospital(true);
  toast({
    title: 'Buscando hospital conectado...',
    status: 'info',
    duration: 3000,
    position: 'bottom'
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [assignedEmergency, ambulancia, sendWS, toast]);

  const handleCreateOperatorEmergency = useCallback(async () => {
  if (!myLocation) {
    toast({
      title: 'Sin ubicación GPS',
      description: 'Esperando señal para registrar la emergencia.',
      status: 'warning', duration: 4000, position: 'bottom',
    });
    return;
  }
  const validPacientes = operatorPatientData.pacientes.filter(p => p.sexo && p.consciente);
  if (validPacientes.length === 0) {
    toast({
      title: 'Datos incompletos',
      description: 'Registre sexo y estado de conciencia del primer paciente.',
      status: 'warning', duration: 4000, position: 'bottom',
    });
    return;
  }

  setIsCreatingEmergency(true);

  // Persistir template local
  try { localStorage.setItem('operatorPatientTemplate', JSON.stringify(operatorPatientData)); } catch (_) {}

  sendWS({
    type: 'operator_initiated_emergency',
    ambulanceId: ambulancia.id,
    location: myLocation,
    address: 'Emergencia iniciada por operador',
    emergencyType: operatorPatientData.diagnostico || 'Atención en campo',
    patientInfo: {
      cantidad: validPacientes.length,
      pacientes: validPacientes,
      // Compatibilidad con formato del receptor
      sexo: validPacientes[0]?.sexo || '',
      edad: validPacientes[0]?.edad || '',
      consciente: validPacientes[0]?.consciente || '',
      respira: validPacientes[0]?.respira || '',
      sangrado: validPacientes[0]?.sangrado || '',
      atrapado: validPacientes[0]?.atrapado || '',
      lesionados: validPacientes.length,
    },
    notes: operatorPatientData.notas || '',
  });

  toast({
    title: 'Emergencia registrada',
    description: 'Notificando al hospital más cercano.',
    status: 'success', duration: 4000, position: 'bottom',
  });
  setIsCreatingEmergency(false);
  onDrawerClose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [myLocation, operatorPatientData, ambulancia, sendWS, toast, onDrawerClose]);

  const confirmAction = useCallback((action, title, body) => {
    setPendingAction({ fn: action, title, body });
    onAlertOpen();
  }, [onAlertOpen]);

  const executeConfirmed = useCallback(() => {
    if (pendingAction?.fn) pendingAction.fn();
    onAlertClose();
    setPendingAction(null);
  }, [pendingAction, onAlertClose]);

  const acceptOffer = useCallback(() => {
    if (!pendingOffer) return;
    sendWS({ type: 'emergency_accept', offerId: pendingOffer.offerId });
    if (offerTimerRef.current) clearInterval(offerTimerRef.current);
    setPendingOffer(null);
    setOfferRejecting(false);
  }, [pendingOffer, sendWS]);

  const rejectOffer = useCallback((reason) => {
    if (!pendingOffer) return;
    sendWS({ type: 'emergency_reject', offerId: pendingOffer.offerId, reason });
    if (offerTimerRef.current) clearInterval(offerTimerRef.current);
    setPendingOffer(null);
    setOfferRejecting(false);
    toast({ title: 'Rechazo enviado', description: 'Se buscará otra unidad', status: 'info', duration: 3000, position: 'bottom' });
  }, [pendingOffer, sendWS, toast]);

  const getManeuverIcon = (step) => {
    if (!step) return <FaArrowUp />;
    const m = step.maneuver?.modifier || '';
    const t = step.maneuver?.type || '';
    if (m.includes('left')) return <FaArrowLeft />;
    if (m.includes('right')) return <FaArrowRight />;
    if (t === 'uturn') return <FaUndo />;
    return <FaArrowUp />;
  };

  const centerMapAction = () => {
    setIsFollowing(true);
    if (map.current && myLocation) {
      map.current.flyTo({
        center: [myLocation.lng, myLocation.lat],
        zoom: isGpsMode ? 18 : 14,
        pitch: isGpsMode ? 60 : 0,
        bearing: isGpsMode ? myHeading : 0,
        duration: 800
      });
    }
  };

  const toggleCameraAction = () => {
    setIsGpsMode(!isGpsMode);
    setIsFollowing(true);
    if (map.current && myLocation) {
      map.current.flyTo({
        center: [myLocation.lng, myLocation.lat],
        zoom: !isGpsMode ? 18 : 14,
        pitch: !isGpsMode ? 60 : 0,
        bearing: !isGpsMode ? myHeading : 0,
        duration: 1000
      });
    }
  };

  if (!ambulancia) {
    return <RegistrationModal onRegister={(d) => { setAmbulancia(d); changeStatus('disponible'); }} />;
  }

  const currentStatusOpt = STATUS_OPTIONS.find(s => s.value === ambulanceStatus) || STATUS_OPTIONS[0];

  return (
    <Box h="100vh" w="100vw" bg="#000" overflow="hidden" position="relative" display="flex" flexDirection="column">

      <Box ref={mapContainer} position="absolute" inset={0} zIndex={0} />

      {/* HEADER NORMAL */}
      {!isNavigating && (
        <SlideFade in={true} offsetY="-20px" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
          <Flex bg="rgba(9, 9, 11, 0.85)" backdropFilter="blur(12px)" px={4} py={3} alignItems="center" justify="space-between" borderBottom="1px solid #27272a">
            <VStack align="start" spacing={0}>
              <Heading size="md" color="#f8fafc" fontSize="18px" fontWeight="900" letterSpacing="1px">{ambulancia.id}</Heading>
              <Badge
                bg={wsStatus === 'connected' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}
                color={wsStatus === 'connected' ? '#10b981' : '#ef4444'}
                fontSize="10px"
              >
                {wsStatus === 'connected' ? 'ONLINE' : wsStatus === 'connecting' ? 'CONECTANDO' : 'OFFLINE'}
              </Badge>
            </VStack>

            <HStack spacing={4}>
              <Select
                value={ambulanceStatus}
                onChange={(e) => changeStatus(e.target.value)}
                bg="#18181b" border="2px solid" borderColor={currentStatusOpt.color}
                color={currentStatusOpt.color} borderRadius="xl" h="45px" fontSize="15px" fontWeight="900" w="130px"
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s.value} value={s.value} style={{ background: '#09090b', color: s.color }}>{s.label}</option>
                ))}
              </Select>
              <IconButton
                aria-label="Cerrar" icon={<FaSignOutAlt />}
                onClick={() => confirmAction(() => {
                  if (wsRef.current) wsRef.current.close();
                  clearAmbulance(); setAmbulancia(null);
                }, 'FINALIZAR TURNO', '¿Desconectar unidad?')}
                bg="#18181b" color="#a1a1aa" border="1px solid #27272a" borderRadius="xl"
                w="45px" h="45px"
                _hover={{ bg: 'rgba(239,68,68,0.2)', color: '#ef4444' }}
              />
            </HStack>
          </Flex>
        </SlideFade>
      )}

{/* ZONA INFERIOR: SOLICITUD HOSPITAL + CANCELACIÓN */}
{isNavigating && (
  <SlideFade in={true} offsetY="20px" style={{ position: 'absolute', bottom: '20px', left: 0, right: 0, zIndex: 20 }}>
    <Box px={4}>
      <VStack spacing={3} align="stretch">

        {/* ── BOTÓN SOLICITAR HOSPITAL (solo si cancelStep = idle) ── */}
        {cancelStep === 'idle' && assignedEmergency && !hospitalRequest && (
          <Button
            w="100%" h="70px"
            bg="#10b981" color="white"
            fontSize="17px" fontWeight="900" letterSpacing="1px"
            borderRadius="2xl" shadow="dark-lg"
            _hover={{ bg: '#059669', transform: 'scale(1.01)' }}
            isLoading={searchingHospital}
            loadingText="BUSCANDO HOSPITAL..."
            onClick={requestHospitalNow}
          >
            <Icon as={FaHospital} mr={3} boxSize={5} />
            SOLICITAR HOSPITAL AHORA
          </Button>
        )}

        {/* ── BANNER VERDE: solicitud enviada (solo si cancelStep = idle) ── */}
        {cancelStep === 'idle' && hospitalRequest && (
          <Box
            bg="rgba(16,185,129,0.15)"
            border="2px solid #10b981"
            borderRadius="2xl"
            p={4}
            backdropFilter="blur(10px)"
          >
            <HStack spacing={3} justify="center">
              <Icon as={FaHospital} color="#10b981" boxSize={6} />
              <VStack align="start" spacing={0}>
                <Text color="#10b981" fontWeight="900" fontSize="13px" letterSpacing="0.5px">
                  SOLICITUD ENVIADA
                </Text>
                <Text color="white" fontWeight="900" fontSize="16px">
                  {hospitalRequest.hospitalName}
                </Text>
                <Text color="#a1a1aa" fontSize="11px" fontWeight="800">
                  {hospitalRequest.distanceKm} km · Esperando aceptación
                </Text>
              </VStack>
            </HStack>
          </Box>
        )}

        {/* ── BOTÓN CANCELAR RUTA (solo si cancelStep = idle) ── */}
        {cancelStep === 'idle' && (assignedEmergency || activeDestination.current) && (
  <Button
    w="100%" h="65px"
    bg="#ef4444" color="white"
    fontSize="18px" fontWeight="900" borderRadius="2xl" shadow="dark-lg"
    _hover={{ bg: '#dc2626' }}
    onClick={() => setCancelStep('confirm')}
  >
    <Icon as={FaTimesCircle} mr={2} boxSize={5} /> FINALIZAR SERVICIO
  </Button>
)}

        {/* ── CONFIRMAR CANCELACIÓN ── */}
        {cancelStep === 'confirm' && (
          <VStack spacing={3} bg="rgba(24, 24, 27, 0.95)" p={4} borderRadius="2xl" border="2px solid #ef4444" shadow="2xl" backdropFilter="blur(10px)">
            <Text color="#ef4444" fontWeight="900" fontSize="18px">¿TERMINAR NAVEGACIÓN?</Text>
            <HStack w="100%" spacing={3}>
              <Button flex={1} h="55px" bg="#27272a" color="white" fontSize="16px" fontWeight="900" borderRadius="xl" onClick={() => setCancelStep('idle')}>
                VOLVER
              </Button>
              <Button flex={1} h="55px" bg="#ef4444" color="white" fontSize="16px" fontWeight="900" borderRadius="xl" onClick={() => setCancelStep('reason')}>
                SÍ, CONTINUAR
              </Button>
            </HStack>
          </VStack>
        )}

        {/* ── MOTIVO DE TÉRMINO ── */}
        {cancelStep === 'reason' && (
          <VStack spacing={3} bg="rgba(24, 24, 27, 0.97)" p={4} borderRadius="2xl" border="2px solid #3f3f46" shadow="2xl" backdropFilter="blur(10px)">
            <Text color="#f8fafc" fontWeight="900" fontSize="16px" letterSpacing="1px">MOTIVO DE TÉRMINO</Text>
            <SimpleGrid columns={2} spacing={3} w="100%">
              <Button h="60px" bg="rgba(16,185,129,0.15)" color="#10b981" border="2px solid #10b981"
                fontSize="14px" fontWeight="900" borderRadius="xl"
                _hover={{ bg: 'rgba(16,185,129,0.25)' }} onClick={() => handleCancelWithReason('completed')}>
                SERVICIO COMPLETADO
              </Button>
              <Button h="60px" bg="#27272a" color="white" fontSize="14px" fontWeight="900" borderRadius="xl"
                _hover={{ bg: '#3f3f46' }} onClick={() => handleCancelWithReason('averia')}>
                AVERÍA MECÁNICA
              </Button>
              <Button h="60px" bg="#27272a" color="white" fontSize="14px" fontWeight="900" borderRadius="xl"
                _hover={{ bg: '#3f3f46' }} onClick={() => handleCancelWithReason('pinchadura')}>
                LLANTA PONCHADA
              </Button>
              <Button h="60px" bg="#27272a" color="white" fontSize="14px" fontWeight="900" borderRadius="xl"
                _hover={{ bg: '#3f3f46' }} onClick={() => handleCancelWithReason('trafico_pesado')}>
                TRÁFICO IMPOSIBLE
              </Button>
            </SimpleGrid>
            <Button variant="ghost" color="#a1a1aa" fontSize="14px" fontWeight="900" onClick={() => setCancelStep('confirm')}>
              ← VOLVER
            </Button>
          </VStack>
        )}

      </VStack>
    </Box>
  </SlideFade>
)}

      {/* CONTROLES LATERALES */}
      {!isDrawerOpen && !isNavigating && (
        <SlideFade in={true} offsetX="20px" style={{ position: 'absolute', right: '12px', top: '15%', zIndex: 5 }}>
          <VStack spacing={4}>
            <Box bg="rgba(24,24,27,0.9)" backdropFilter="blur(10px)" borderRadius="xl" border="1px solid #3f3f46" overflow="hidden" shadow="lg">
              <Tooltip label="Centrar GPS" placement="left" hasArrow bg="#18181b" color="white">
                <IconButton aria-label="Centrar" icon={<MdCenterFocusStrong />} w="50px" h="50px"
                  onClick={centerMapAction} color={isFollowing ? '#0ea5e9' : 'white'}
                  variant="ghost" fontSize="22px" _hover={{ bg: '#27272a' }} />
              </Tooltip>
              <Divider borderColor="#3f3f46" />
              <Tooltip label={isGpsMode ? 'Vista 2D Cenital' : 'Vista 3D Navegación'} placement="left" hasArrow bg="#18181b" color="white">
                <IconButton aria-label="Alternar Vista" icon={isGpsMode ? <FaMap /> : <FaLocationArrow />}
                  w="50px" h="50px" onClick={toggleCameraAction}
                  color={isGpsMode ? '#0ea5e9' : 'white'} variant="ghost" fontSize="20px" _hover={{ bg: '#27272a' }} />
              </Tooltip>
            </Box>
          </VStack>
        </SlideFade>
      )}

      {/* BARRA INFERIOR */}
      {!isDrawerOpen && !isNavigating && (
        <SlideFade in={true} offsetY="20px" style={{ position: 'absolute', bottom: '20px', left: 0, right: 0, zIndex: 10 }}>
<HStack px={4} spacing={3} w="100%" justify="center">
  <Button
    w="100%" h="75px"
    bg="#ef4444" color="white"
    fontSize="20px" fontWeight="900" letterSpacing="1px"
    borderRadius="2xl" shadow="2xl"
    _hover={{ bg: '#dc2626', transform: 'scale(1.02)' }}
    onClick={() => { setDrawerMode('operator-emergency'); onDrawerOpen(); }}
  >
    <Icon as={FaAmbulance} mr={3} boxSize={6} /> NUEVA EMERGENCIA
  </Button>
</HStack>
        </SlideFade>
      )}

      {/* CANCELACIÓN CON MOTIVO */}
      {isNavigating && (
        <SlideFade in={true} offsetY="20px" style={{ position: 'absolute', bottom: '20px', left: 0, right: 0, zIndex: 20 }}>
          <Box px={4}>
            {cancelStep === 'idle' && (
              <Button w="100%" h="65px" bg="#ef4444" color="white"
                fontSize="18px" fontWeight="900" borderRadius="2xl" shadow="dark-lg"
                _hover={{ bg: '#dc2626' }} onClick={() => setCancelStep('confirm')}>
                <Icon as={FaTimesCircle} mr={2} boxSize={5} /> CANCELAR RUTA
              </Button>
            )}

            {cancelStep === 'confirm' && (
              <VStack spacing={3} bg="rgba(24, 24, 27, 0.95)" p={4} borderRadius="2xl" border="2px solid #ef4444" shadow="2xl" backdropFilter="blur(10px)">
                <Text color="#ef4444" fontWeight="900" fontSize="18px">¿TERMINAR NAVEGACIÓN?</Text>
                <HStack w="100%" spacing={3}>
                  <Button flex={1} h="55px" bg="#27272a" color="white" fontSize="16px" fontWeight="900" borderRadius="xl" onClick={() => setCancelStep('idle')}>
                    VOLVER
                  </Button>
                  <Button flex={1} h="55px" bg="#ef4444" color="white" fontSize="16px" fontWeight="900" borderRadius="xl" onClick={() => setCancelStep('reason')}>
                    SÍ, CONTINUAR
                  </Button>
                </HStack>
              </VStack>
            )}

            {cancelStep === 'reason' && (
              <VStack spacing={3} bg="rgba(24, 24, 27, 0.97)" p={4} borderRadius="2xl" border="2px solid #3f3f46" shadow="2xl" backdropFilter="blur(10px)">
                <Text color="#f8fafc" fontWeight="900" fontSize="16px" letterSpacing="1px">MOTIVO DE TÉRMINO</Text>
                <SimpleGrid columns={2} spacing={3} w="100%">
                  <Button h="60px" bg="rgba(16,185,129,0.15)" color="#10b981" border="2px solid #10b981"
                    fontSize="14px" fontWeight="900" borderRadius="xl"
                    _hover={{ bg: 'rgba(16,185,129,0.25)' }} onClick={() => handleCancelWithReason('completed')}>
                    SERVICIO COMPLETADO
                  </Button>
                  <Button h="60px" bg="#27272a" color="white" fontSize="14px" fontWeight="900" borderRadius="xl"
                    _hover={{ bg: '#3f3f46' }} onClick={() => handleCancelWithReason('averia')}>
                    AVERÍA MECÁNICA
                  </Button>
                  <Button h="60px" bg="#27272a" color="white" fontSize="14px" fontWeight="900" borderRadius="xl"
                    _hover={{ bg: '#3f3f46' }} onClick={() => handleCancelWithReason('pinchadura')}>
                    LLANTA PONCHADA
                  </Button>
                  <Button h="60px" bg="#27272a" color="white" fontSize="14px" fontWeight="900" borderRadius="xl"
                    _hover={{ bg: '#3f3f46' }} onClick={() => handleCancelWithReason('trafico_pesado')}>
                    TRÁFICO IMPOSIBLE
                  </Button>
                </SimpleGrid>
                <Button variant="ghost" color="#a1a1aa" fontSize="14px" fontWeight="900" onClick={() => setCancelStep('confirm')}>
                  ← VOLVER
                </Button>
              </VStack>
            )}
          </Box>
        </SlideFade>
      )}

      {/* DRAWER */}
      <Drawer isOpen={isDrawerOpen} placement="bottom" onClose={onDrawerClose} size="full">
        <DrawerOverlay backdropFilter="blur(5px)" bg="rgba(0,0,0,0.6)" />
        <DrawerContent bg="#09090b" borderTopRadius="3xl" h="85vh" mt="15vh" borderTop="2px solid #27272a" zIndex={1400}>

          <Flex justify="center" pt={3} pb={1} onClick={onDrawerClose} cursor="pointer">
            <Box w="50px" h="5px" bg="#3f3f46" borderRadius="full" />
          </Flex>

          <DrawerHeader bg="#09090b" py={2} px={6} display="flex" justifyContent="space-between" alignItems="center">
<Text fontSize="20px" fontWeight="900" color="white">
  {drawerMode === 'operator-emergency' ? 'NUEVA EMERGENCIA' : 'PROTOCOLO'}
</Text>
            <IconButton aria-label="Cerrar" icon={<FaTimes />} variant="ghost" color="#ef4444" fontSize="22px" onClick={onDrawerClose} />
          </DrawerHeader>

<DrawerBody p={4} bg="#09090b" overflowY="auto">
  {drawerMode === 'operator-emergency' && (
    <VStack spacing={5} align="stretch" pb={24}>
      <Box bg="#18181b" p={5} borderRadius="2xl" border="1px solid #27272a">
        <Text fontSize="12px" fontWeight="900" color="#a1a1aa" mb={4}>1. CANTIDAD DE PACIENTES</Text>
        <HStack w="100%">
          <IconButton
            aria-label="Menos pacientes"
            icon={<FaMinus />}
            onClick={() => setOperatorPatientData(prev => {
              const next = Math.max(1, prev.cantidad - 1);
              return {
                ...prev,
                cantidad: next,
                pacientes: prev.pacientes.slice(0, next).length < next
                  ? [...prev.pacientes, ...Array(next - prev.pacientes.length).fill(0).map(() => ({ sexo: '', edad: '', consciente: '', respira: '', sangrado: '', atrapado: '' }))]
                  : prev.pacientes.slice(0, next)
              };
            })}
            w="60px" h="60px" bg="#27272a" color="white" fontSize="20px"
            _hover={{ bg: '#3f3f46' }}
            isDisabled={operatorPatientData.cantidad <= 1}
          />
          <Flex flex={1} bg="#09090b" h="60px" border="2px solid #3f3f46" borderRadius="xl" align="center" justify="center">
            <Text fontSize="28px" fontWeight="900" color="white">{operatorPatientData.cantidad}</Text>
          </Flex>
          <IconButton
            aria-label="Más pacientes"
            icon={<FaPlus />}
            onClick={() => setOperatorPatientData(prev => {
              const next = Math.min(20, prev.cantidad + 1);
              return {
                ...prev,
                cantidad: next,
                pacientes: prev.pacientes.length < next
                  ? [...prev.pacientes, ...Array(next - prev.pacientes.length).fill(0).map(() => ({ sexo: '', edad: '', consciente: '', respira: '', sangrado: '', atrapado: '' }))]
                  : prev.pacientes
              };
            })}
            w="60px" h="60px" bg="#27272a" color="white" fontSize="20px"
            _hover={{ bg: '#3f3f46' }}
          />
        </HStack>
      </Box>

      <Box bg="#18181b" p={5} borderRadius="2xl" border="1px solid #27272a">
        <Text fontSize="12px" fontWeight="900" color="#a1a1aa" mb={4}>2. DATOS DE PACIENTES</Text>
        <VStack spacing={4} align="stretch">
          {operatorPatientData.pacientes.slice(0, operatorPatientData.cantidad).map((p, idx) => (
            <Box key={idx} bg="#09090b" p={4} borderRadius="xl" border="1px solid #3f3f46">
              <Text fontSize="13px" fontWeight="900" color="#38bdf8" mb={3}>PACIENTE {idx + 1}</Text>
              <SimpleGrid columns={2} spacing={3}>
                <Select
                  value={p.sexo}
                  onChange={(e) => setOperatorPatientData(prev => {
                    const copy = [...prev.pacientes];
                    copy[idx] = { ...copy[idx], sexo: e.target.value };
                    return { ...prev, pacientes: copy };
                  })}
                  placeholder="Sexo"
                  bg="#18181b" borderColor="#3f3f46" color="white" size="lg"
                >
                  <option value="Hombre" style={{ background: '#18181b' }}>Hombre</option>
                  <option value="Mujer" style={{ background: '#18181b' }}>Mujer</option>
                  <option value="N/S" style={{ background: '#18181b' }}>No se sabe</option>
                </Select>
                <Input
                  type="number"
                  value={p.edad}
                  onChange={(e) => setOperatorPatientData(prev => {
                    const copy = [...prev.pacientes];
                    copy[idx] = { ...copy[idx], edad: e.target.value };
                    return { ...prev, pacientes: copy };
                  })}
                  placeholder="Edad"
                  bg="#18181b" border="2px solid #3f3f46" color="white" size="lg"
                />
                <Select
                  value={p.consciente}
                  onChange={(e) => setOperatorPatientData(prev => {
                    const copy = [...prev.pacientes];
                    copy[idx] = { ...copy[idx], consciente: e.target.value };
                    return { ...prev, pacientes: copy };
                  })}
                  placeholder="Conciencia"
                  bg="#18181b" borderColor="#3f3f46" color="white" size="lg"
                >
                  <option value="Sí" style={{ background: '#18181b' }}>Consciente</option>
                  <option value="No" style={{ background: '#18181b' }}>Inconsciente</option>
                  <option value="N/S" style={{ background: '#18181b' }}>No se sabe</option>
                </Select>
                <Select
                  value={p.respira}
                  onChange={(e) => setOperatorPatientData(prev => {
                    const copy = [...prev.pacientes];
                    copy[idx] = { ...copy[idx], respira: e.target.value };
                    return { ...prev, pacientes: copy };
                  })}
                  placeholder="Respira"
                  bg="#18181b" borderColor="#3f3f46" color="white" size="lg"
                >
                  <option value="Sí" style={{ background: '#18181b' }}>Respira</option>
                  <option value="No" style={{ background: '#18181b' }}>No respira</option>
                  <option value="N/S" style={{ background: '#18181b' }}>No se sabe</option>
                </Select>
                <Select
                  value={p.sangrado}
                  onChange={(e) => setOperatorPatientData(prev => {
                    const copy = [...prev.pacientes];
                    copy[idx] = { ...copy[idx], sangrado: e.target.value };
                    return { ...prev, pacientes: copy };
                  })}
                  placeholder="Sangrado"
                  bg="#18181b" borderColor="#3f3f46" color="white" size="lg"
                >
                  <option value="Sí" style={{ background: '#18181b' }}>Sangrado</option>
                  <option value="No" style={{ background: '#18181b' }}>Sin sangrado</option>
                  <option value="N/S" style={{ background: '#18181b' }}>No se sabe</option>
                </Select>
                <Select
                  value={p.atrapado}
                  onChange={(e) => setOperatorPatientData(prev => {
                    const copy = [...prev.pacientes];
                    copy[idx] = { ...copy[idx], atrapado: e.target.value };
                    return { ...prev, pacientes: copy };
                  })}
                  placeholder="Atrapado"
                  bg="#18181b" borderColor="#3f3f46" color="white" size="lg"
                >
                  <option value="Sí" style={{ background: '#18181b' }}>Atrapado</option>
                  <option value="No" style={{ background: '#18181b' }}>No atrapado</option>
                </Select>
              </SimpleGrid>
            </Box>
          ))}
        </VStack>
      </Box>

      <Box bg="#18181b" p={5} borderRadius="2xl" border="1px solid #27272a">
        <Text fontSize="12px" fontWeight="900" color="#a1a1aa" mb={4}>3. IMPRESIÓN DIAGNÓSTICA</Text>
        <Select
          value={operatorPatientData.diagnostico}
          onChange={(e) => setOperatorPatientData(prev => ({ ...prev, diagnostico: e.target.value }))}
          h="60px" fontSize="16px" fontWeight="900"
          bg="#09090b" color="white" border="2px solid #3f3f46"
        >
          {DIAGNOSTICOS_RAPIDOS.map(d => (
            <option key={d} value={d} style={{ background: '#09090b' }}>{d}</option>
          ))}
        </Select>
      </Box>

      <Box bg="#18181b" p={5} borderRadius="2xl" border="1px solid #27272a">
        <Text fontSize="12px" fontWeight="900" color="#a1a1aa" mb={4}>4. NOTAS ADICIONALES</Text>
        <Input
          value={operatorPatientData.notas}
          onChange={(e) => setOperatorPatientData(prev => ({ ...prev, notas: e.target.value }))}
          placeholder="Observaciones breves..."
          bg="#09090b" border="2px solid #3f3f46" color="white" h="60px" fontSize="15px"
        />
      </Box>
    </VStack>
  )}
</DrawerBody>

          {drawerMode === 'operator-emergency' && (
  <DrawerFooter bg="#18181b" borderTop="1px solid #27272a" p={4} position="absolute" bottom={0} w="100%">
    <Button
      w="100%" h="70px"
      bg="#ef4444" color="white"
      fontSize="18px" fontWeight="900" letterSpacing="1px"
      _hover={{ bg: '#dc2626' }}
      isLoading={isCreatingEmergency}
      loadingText="REGISTRANDO..."
      onClick={handleCreateOperatorEmergency}
    >
      NOTIFICAR HOSPITAL
    </Button>
  </DrawerFooter>
)}
        </DrawerContent>
      </Drawer>

      {/* MODAL DE OFERTA */}
      <Modal isOpen={!!pendingOffer} onClose={() => {}} size="xl" isCentered closeOnOverlayClick={false} closeOnEsc={false}>
        <ModalOverlay bg="rgba(0,0,0,0.92)" backdropFilter="blur(8px)" />
        <ModalContent bg="#09090b" border="3px solid #ef4444" borderRadius="2xl" overflow="hidden" mx={4}>
          <Box bg="#ef4444" py={4} textAlign="center">
            <HStack justify="center" spacing={3}>
              <Icon as={FaAmbulance} boxSize={7} color="white" />
              <Text fontSize="22px" fontWeight="900" color="white" letterSpacing="2px">
                {pendingOffer?.isStandby ? 'EMERGENCIA — ESTÁS EN STANDBY' : 'NUEVA EMERGENCIA'}
              </Text>
            </HStack>
          </Box>

          <ModalBody p={6}>
            <Box mb={5}>
              <HStack justify="space-between" mb={2}>
                <Text fontSize="12px" fontWeight="900" color="#a1a1aa" letterSpacing="1px">
                  TIEMPO PARA RESPONDER
                </Text>
                <Text fontSize="22px" fontWeight="900" color={offerTimeLeft <= 5 ? '#ef4444' : '#f59e0b'}>
                  {offerTimeLeft}s
                </Text>
              </HStack>
              <Progress value={(offerTimeLeft / 20) * 100} h="10px" borderRadius="full" bg="#27272a"
                sx={{
                  '& > div': {
                    background: offerTimeLeft <= 5 ? '#ef4444' : '#f59e0b',
                    transition: 'width 1s linear'
                  }
                }} />
            </Box>

            {pendingOffer?.isStandby && (
              <Box bg="rgba(245,158,11,0.15)" p={3} borderRadius="md" border="1px solid #f59e0b" mb={4}>
                <Text fontSize="12px" fontWeight="900" color="#f59e0b" letterSpacing="0.5px" textAlign="center">
                  ESTÁS EN FUERA DE SERVICIO. Si ACEPTAS, tu unidad cambiará a EN RUTA.
                </Text>
              </Box>
            )}

            <Box bg="#18181b" p={5} borderRadius="xl" border="1px solid #3f3f46" mb={4}>
              <Text fontSize="12px" fontWeight="900" color="#a1a1aa" mb={1} letterSpacing="1px">
                TIPO DE EMERGENCIA
              </Text>
              <Text fontSize="26px" fontWeight="900" color="#f8fafc" lineHeight="1.1">
                {pendingOffer?.emergencyType || 'No especificado'}
              </Text>
            </Box>

            <Box bg="#18181b" p={5} borderRadius="xl" border="1px solid #3f3f46" mb={4}>
              <Text fontSize="12px" fontWeight="900" color="#a1a1aa" mb={1} letterSpacing="1px">
                DIRECCIÓN
              </Text>
              <Text fontSize="18px" fontWeight="800" color="#f8fafc" mb={2}>
                {pendingOffer?.address || 'Sin dirección'}
              </Text>
              {pendingOffer?.distanceKm != null && (
                <Badge bg="#0ea5e9" color="white" px={3} py={1} borderRadius="md" fontSize="14px" fontWeight="900">
                  DISTANCIA: {fmtDist(pendingOffer.distanceKm)}
                </Badge>
              )}
            </Box>

            {pendingOffer?.patientInfo && Object.keys(pendingOffer.patientInfo).length > 0 && (
              <Box bg="#18181b" p={5} borderRadius="xl" border="1px solid #3f3f46" mb={4}>
                <Text fontSize="12px" fontWeight="900" color="#a1a1aa" mb={3} letterSpacing="1px">
                  INFO DEL PACIENTE
                </Text>
                <SimpleGrid columns={2} spacing={3}>
                  {pendingOffer.patientInfo.sexo && (
                    <Text fontSize="14px" fontWeight="800" color="white">SEXO: {pendingOffer.patientInfo.sexo}</Text>
                  )}
                  {pendingOffer.patientInfo.edad && (
                    <Text fontSize="14px" fontWeight="800" color="white">EDAD: {pendingOffer.patientInfo.edad}</Text>
                  )}
                  {pendingOffer.patientInfo.lesionados && (
                    <Text fontSize="14px" fontWeight="800" color="white">LESIONADOS: {pendingOffer.patientInfo.lesionados}</Text>
                  )}
                  {pendingOffer.patientInfo.consciente && (
                    <Text fontSize="14px" fontWeight="800" color="white">CONSCIENTE: {pendingOffer.patientInfo.consciente}</Text>
                  )}
                </SimpleGrid>
              </Box>
            )}
          </ModalBody>

          <ModalFooter p={6} bg="#09090b" borderTop="1px solid #27272a">
            {!offerRejecting ? (
              <HStack w="100%" spacing={4}>
                <Button flex={1} h="80px" bg="#27272a" color="#ef4444"
                  border="2px solid #ef4444" fontSize="18px" fontWeight="900" borderRadius="xl"
                  _hover={{ bg: '#3f3f46' }} onClick={() => setOfferRejecting(true)}>
                  RECHAZAR
                </Button>
                <Button flex={1.5} h="80px" bg="#10b981" color="white"
                  fontSize="22px" fontWeight="900" letterSpacing="1px" borderRadius="xl"
                  _hover={{ bg: '#059669', transform: 'scale(1.02)' }}
                  onClick={acceptOffer} boxShadow="0 10px 20px rgba(16,185,129,0.3)">
                  ACEPTAR
                </Button>
              </HStack>
            ) : (
              <VStack w="100%" spacing={3}>
                <Text fontSize="14px" fontWeight="900" color="#ef4444" letterSpacing="1px">
                  MOTIVO DE RECHAZO
                </Text>
                <SimpleGrid columns={2} spacing={3} w="100%">
                  <Button h="60px" bg="#27272a" color="white" fontSize="14px" fontWeight="900" borderRadius="xl"
                    _hover={{ bg: '#3f3f46' }} onClick={() => rejectOffer('Sin combustible')}>
                    SIN COMBUSTIBLE
                  </Button>
                  <Button h="60px" bg="#27272a" color="white" fontSize="14px" fontWeight="900" borderRadius="xl"
                    _hover={{ bg: '#3f3f46' }} onClick={() => rejectOffer('Problema mecánico')}>
                    PROBLEMA MECÁNICO
                  </Button>
                  <Button h="60px" bg="#27272a" color="white" fontSize="14px" fontWeight="900" borderRadius="xl"
                    _hover={{ bg: '#3f3f46' }} onClick={() => rejectOffer('Otra asignación')}>
                    OTRA ASIGNACIÓN
                  </Button>
                  <Button h="60px" bg="#27272a" color="white" fontSize="14px" fontWeight="900" borderRadius="xl"
                    _hover={{ bg: '#3f3f46' }} onClick={() => rejectOffer('No especificado')}>
                    OTRO
                  </Button>
                </SimpleGrid>
                <Button variant="ghost" color="#a1a1aa" fontSize="14px" fontWeight="900" onClick={() => setOfferRejecting(false)}>
                  ← VOLVER
                </Button>
              </VStack>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ALERTA LOGOUT */}
      <Modal isOpen={isAlertOpen} onClose={onAlertClose} isCentered blockScrollOnMount={false} trapFocus={false}>
        <ModalOverlay bg="rgba(0,0,0,0.7)" backdropFilter="blur(3px)" />
        <ModalContent bg="#09090b" border="2px solid #ef4444" borderRadius="2xl" p={4} mx={4}>
          <ModalHeader color="#ef4444" fontWeight="900" fontSize="20px" textAlign="center">
            {pendingAction?.title}
          </ModalHeader>
          <ModalBody color="white" fontSize="16px" textAlign="center" fontWeight="800">
            {pendingAction?.body}
          </ModalBody>
          <ModalFooter mt={4} gap={4} display="flex" p={0}>
            <Button flex={1} h="55px" bg="#27272a" color="white" fontSize="16px" fontWeight="900" onClick={onAlertClose}>
              VOLVER
            </Button>
            <Button flex={1} h="55px" bg="#ef4444" color="white" fontSize="16px" fontWeight="900" onClick={executeConfirmed}>
              CONFIRMAR
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

// ==================== REGISTRO ====================
const RegistrationModal = ({ onRegister }) => {
  const [form, setForm] = useState({ id: '', placa: '', nombre: '', tipo: 'UVI Móvil' });
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!form.id.trim() || !form.placa.trim() || !form.nombre.trim()) {
      return setError('LLENE LOS DATOS OBLIGATORIOS');
    }
    const data = {
      id: form.id.trim().toUpperCase(),
      placa: form.placa.trim().toUpperCase(),
      nombre: form.nombre.trim(),
      tipo: form.tipo
    };
    saveAmbulance(data);
    onRegister(data);
  };

  return (
    <Modal isOpen isCentered size="md" closeOnOverlayClick={false}>
      <ModalOverlay bg="rgba(0,0,0,0.95)" />
      <ModalContent bg="#09090b" border="2px solid #0ea5e9" borderRadius="2xl" p={4} mx={4}>
        <ModalHeader textAlign="center">
          <Icon as={FaAmbulance} color="#0ea5e9" boxSize={10} mb={2} />
          <Text color="white" fontWeight="900" fontSize="20px">SISTEMA TÁCTICO MÓVIL</Text>
        </ModalHeader>
        <ModalBody py={2}>
          <VStack spacing={4}>
            <FormControl>
              <FormLabel color="#a1a1aa" fontWeight="900" fontSize="11px">ID OPERATIVO *</FormLabel>
              <Input bg="#18181b" border="2px solid #3f3f46" color="white"
                h="50px" fontSize="18px" fontWeight="900" textAlign="center" textTransform="uppercase"
                value={form.id} onChange={e => setForm(p => ({ ...p, id: e.target.value }))} />
            </FormControl>
            <FormControl>
              <FormLabel color="#a1a1aa" fontWeight="900" fontSize="11px">PLACA *</FormLabel>
              <Input bg="#18181b" border="2px solid #3f3f46" color="white"
                h="50px" fontSize="18px" fontWeight="900" textAlign="center" textTransform="uppercase"
                value={form.placa} onChange={e => setForm(p => ({ ...p, placa: e.target.value }))} />
            </FormControl>
            <FormControl>
              <FormLabel color="#a1a1aa" fontWeight="900" fontSize="11px">NOMBRE BASE *</FormLabel>
              <Input bg="#18181b" border="2px solid #3f3f46" color="white"
                h="50px" fontSize="16px" fontWeight="900" textAlign="center"
                value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} />
            </FormControl>
            <FormControl>
              <FormLabel color="#a1a1aa" fontWeight="900" fontSize="11px">TIPO DE UNIDAD</FormLabel>
              <Select bg="#18181b" border="2px solid #3f3f46" color="white"
                h="50px" fontSize="14px" fontWeight="900"
                value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}>
                {TIPOS_AMBULANCIA.map(t => (
                  <option key={t} value={t} style={{ background: '#09090b' }}>{t}</option>
                ))}
              </Select>
            </FormControl>
            {error && <Text color="#ef4444" fontWeight="900" fontSize="12px" textAlign="center">{error}</Text>}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button w="100%" h="60px" bg="#0ea5e9" color="white" fontSize="16px" fontWeight="900" onClick={handleSubmit}>
            VINCULAR SISTEMA
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};