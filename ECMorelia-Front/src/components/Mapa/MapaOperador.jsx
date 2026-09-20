// src/components/operador/MapaOperador.jsx
// ========================================================================
// EMERGENCITY - CONSOLA DE NAVEGACIÓN MÓVIL
// UI Dinámica (Confirmación Inline sin bloqueo de pantalla), GPS Inmediato
// ========================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  Box, Flex, VStack, HStack, Text, Button, Icon, Badge,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Drawer, DrawerOverlay, DrawerContent, DrawerHeader, DrawerBody, DrawerFooter,
  useToast, useDisclosure, FormControl, FormLabel,
  InputGroup, Input, IconButton, Select, ButtonGroup, Heading, SlideFade, Divider, Tooltip
} from '@chakra-ui/react';
import {
  FaAmbulance, FaHospital, FaMapMarkerAlt,
  FaSignOutAlt, FaLocationArrow, FaTrafficLight, FaArrowLeft, FaMap,
  FaArrowRight, FaPlus, FaMinus, FaSearch, FaTimes, FaUndo, FaArrowUp, FaTimesCircle
} from 'react-icons/fa';
import { MdCenterFocusStrong } from 'react-icons/md';

// ========================================================================
// CONFIGURACIÓN TÁCTICA Y DE RUTAS
// ========================================================================
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoiZXltYXJkMjkiLCJhIjoiY21tcDY4YzNpMGw3bjJzb203YmZyNTVnMyJ9.OvZlnCMfUkUYe6Ib83DUVw';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3002/ws';
const DEFAULT_CENTER = { lat: 19.7024, lng: -101.1969 }; // Morelia, Michoacán
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT = 5;
const ROUTE_POLLING_INTERVAL = 20000; // Recalcular tráfico cada 20s

const TIPOS_AMBULANCIA = ['UVI Móvil', 'Ambulancia Básica', 'Ambulancia Avanzada', 'Motocicleta de Respuesta'];
const DIAGNOSTICOS_RAPIDOS = ['Traumatismo / Caída', 'Evento Cardiovascular', 'Problema Respiratorio', 'Afectación Neurológica', 'Metabólico / Intoxicación', 'Gineco-Obstétrico', 'Quemaduras graves', 'Otro'];

const STATUS_OPTIONS = [
  { value: 'disponible', label: 'LIBRE', color: '#10b981' }, 
  { value: 'en_ruta', label: 'EN RUTA', color: '#0ea5e9' }, 
  { value: 'ocupado', label: 'OCUPADO', color: '#f59e0b' }, 
  { value: 'fuera_de_servicio', label: 'FUERA', color: '#64748b' },
];

const SESSION_KEY = 'ambulanciaRegistrada';
function loadSavedAmbulance() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; } }
function saveAmbulance(data) { sessionStorage.setItem(SESSION_KEY, JSON.stringify(data)); }
function clearAmbulance() { sessionStorage.removeItem(SESSION_KEY); }

function fmtDist(km) { return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`; }
function fmtDur(seconds) {
  if (!seconds) return '—';
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

// ========================================================================
// COMPONENTE PRINCIPAL
// ========================================================================
export default function MapaOperador() {
  const toast = useToast();
  const navigate = useNavigate();

  // ---- SESIÓN & WEBSOCKET ----
  const [ambulancia, setAmbulancia] = useState(() => loadSavedAmbulance());
  const wsRef = useRef(null);
  const isMounted = useRef(true);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef(null);
  const [wsStatus, setWsStatus] = useState('connecting');

  // ---- GPS & TRACKING ----
  const watchId = useRef(null);
  const gpsHeading = useRef(0);
  const isInitialMapCentered = useRef(false);
  const [myLocation, setMyLocation] = useState(null);
  const [mySpeed, setMySpeed] = useState(0);
  const [myHeading, setMyHeading] = useState(0);

  // ---- MAPA & NAVEGACIÓN ----
  const mapContainer = useRef(null);
  const map = useRef(null);
  const ambulanceMarker = useRef(null);
  const destinationMarker = useRef(null);
  
  const [isFollowing, setIsFollowing] = useState(true);
  const [isGpsMode, setIsGpsMode] = useState(true);
  const [trafficEnabled, setTrafficEnabled] = useState(true);

  // Estado del motor de rutas
  const activeDestination = useRef(null); 
  const routeIntervalRef = useRef(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentManeuver, setCurrentManeuver] = useState(null);
  const [routeProgress, setRouteProgress] = useState(null);
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false); // UI Dinámica sin bloquear pantalla

  // ---- ESTADO OPERATIVO ----
  const [ambulanceStatus, setAmbulanceStatus] = useState('disponible');
  const [hospitals, setHospitals] = useState([]);
  const [assignedEmergency, setAssignedEmergency] = useState(null);

  // ---- UI RESPONSIVA ----
  const { isOpen: isDrawerOpen, onOpen: onDrawerOpen, onClose: onDrawerClose } = useDisclosure();
  const { isOpen: isAlertOpen, onOpen: onAlertOpen, onClose: onAlertClose } = useDisclosure();
  
  const [drawerMode, setDrawerMode] = useState('atender'); 
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  
  const [selectedHospitalId, setSelectedHospitalId] = useState(null);
  const [patientData, setPatientData] = useState({ edad: 35, sexo: 'N/S', diagnostico: DIAGNOSTICOS_RAPIDOS[0] });
  const [isSending, setIsSending] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  // ========================================================================
  // WEBSOCKET
  // ========================================================================
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
        ws.send(JSON.stringify({ type: 'register_ambulance', ambulance: { id: ambulancia.id, placa: ambulancia.placa, nombre: ambulancia.nombre, tipo: ambulancia.tipo, status: ambulanceStatus, location: myLocation || DEFAULT_CENTER } }));
        ws.send(JSON.stringify({ type: 'request_hospitals_list' }));
      };

      ws.onmessage = (e) => {
        if (!isMounted.current) return;
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'active_hospitals_update') setHospitals(data.hospitals || []);
          if (data.type === 'new_emergency_assigned') {
            setAssignedEmergency(data);
            if (data.location) startNavigationEngine(data.location, 'emergency', data.address);
            toast({ title: '🚨 EMERGENCIA ASIGNADA', status: 'error', duration: 10000, position: 'bottom' });
          }
          if (data.type === 'patient_accepted_with_route' || data.type === 'patient_accepted') {
            toast({ title: '✅ HOSPITAL ACEPTÓ', description: 'Diríjase al centro receptor.', status: 'success', duration: 8000, position: 'bottom' });
          }
          if (data.type === 'patient_rejected') {
            toast({ title: '❌ HOSPITAL RECHAZÓ', description: 'Seleccione otra alternativa.', status: 'error', duration: 8000, position: 'bottom' });
            cancelCurrentRoute(true);
          }
          if (data.type === 'navigation_cancelled') {
            toast({ title: '🛑 RUTA CANCELADA', description: 'El CRUM canceló el servicio.', status: 'info', duration: 5000, position: 'bottom' });
            cancelCurrentRoute(true);
          }
        } catch {}
      };

      ws.onclose = () => {
        if (!isMounted.current) return;
        wsRef.current = null;
        if (reconnectAttempts.current < MAX_RECONNECT) {
          setWsStatus('disconnected');
          reconnectAttempts.current += 1;
          reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
        }
      };
    };

    connect();
    return () => { isMounted.current = false; clearTimeout(reconnectTimer.current); if (wsRef.current) wsRef.current.close(); };
  }, [ambulancia]);

  // ========================================================================
  // MAPBOX & TRACKING GPS INMEDIATO
  // ========================================================================
  useEffect(() => {
    if (!ambulancia || !mapContainer.current) return;

    // Obtener GPS Inmediatamente para asegurar el centrado rápido
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
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
      container: mapContainer.current, style: 'mapbox://styles/mapbox/dark-v11', center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat], zoom: 14, pitch: 0, bearing: 0, attributionControl: false, logoPosition: 'bottom-left'
    });

    mapInstance.on('load', () => { 
      map.current = mapInstance; 
      if (!mapInstance.getSource('mapbox-traffic')) mapInstance.addSource('mapbox-traffic', { type: 'vector', url: 'mapbox://mapbox.mapbox-traffic-v1' });
      if (!mapInstance.getLayer('traffic-layer-amb')) {
        mapInstance.addLayer({
          id: 'traffic-layer-amb', type: 'line', source: 'mapbox-traffic', 'source-layer': 'traffic',
          paint: { 'line-color': ['match', ['get', 'congestion'], 'low', '#00C853', 'moderate', '#FFD600', 'heavy', '#FF9100', 'severe', '#D50000', '#00C853'], 'line-width': 6, 'line-opacity': 0.8 },
          layout: { 'visibility': 'visible' }
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
        const spd = pos.coords.speed != null ? parseFloat((pos.coords.speed * 3.6).toFixed(1)) : 0;
        const hdg = pos.coords.heading != null && !isNaN(pos.coords.heading) ? pos.coords.heading : gpsHeading.current;

        if (spd >= 5) { gpsHeading.current = hdg; setMyHeading(hdg); updateMarkerRotation(hdg); }
        setMyLocation(loc); setMySpeed(spd);
        updateAmbulanceMarker(loc, hdg);

        if (isFollowing && map.current) {
          if (!isInitialMapCentered.current) {
            map.current.jumpTo({ center: [loc.lng, loc.lat], zoom: isGpsMode ? 18 : 14, pitch: isGpsMode ? 60 : 0 });
            isInitialMapCentered.current = true;
          } else {
            map.current.easeTo({ center: [loc.lng, loc.lat], bearing: isGpsMode ? hdg : 0, pitch: isGpsMode ? 60 : 0, zoom: isGpsMode ? 18 : 14, duration: 1000 });
          }
        }
        sendWS({ type: 'location_update', ambulanceId: ambulancia.id, location: loc, speed: spd, heading: hdg, status: ambulanceStatus });
      },
      () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => { window.removeEventListener('deviceorientation', handleOrientation, true); navigator.geolocation.clearWatch(watchId.current); };
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
      ambulanceMarker.current = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([loc.lng, loc.lat]).addTo(map.current);
    } else {
      ambulanceMarker.current.setLngLat([loc.lng, loc.lat]);
    }
  }, []);

  const placeDestinationMarker = useCallback((loc) => {
    if (!map.current) return;
    if (destinationMarker.current) destinationMarker.current.remove();
    const el = document.createElement('div');
    el.innerHTML = `<div style="width:20px;height:20px;border-radius:50%;background:#ef4444;border:3px solid #ffffff;box-shadow:0 0 12px rgba(0,0,0,0.6);"></div>`;
    destinationMarker.current = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([loc.lng, loc.lat]).addTo(map.current);
  }, []);

  // ========================================================================
  // MOTOR DE RUTAS Y TRÁFICO EN TIEMPO REAL
  // ========================================================================
  const computeRoute = useCallback(async (start, end) => {
    if (!start || !end) return null;
    try {
      const coords = `${start.lng},${start.lat};${end.lng},${end.lat}`;
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?geometries=geojson&overview=full&steps=true&access_token=${mapboxgl.accessToken}&language=es`;
      const resp = await fetch(url);
      const data = await resp.json();
      return data.routes?.[0] ? { geometry: data.routes[0].geometry.coordinates, distance: data.routes[0].distance, duration: data.routes[0].duration, steps: data.routes[0].legs?.[0]?.steps || [] } : null;
    } catch { return null; }
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
    map.current.addLayer({ id: `${routeKey}-glow`, type: 'line', source: routeKey, paint: { 'line-color': color, 'line-width': 18, 'line-opacity': 0.25, 'line-blur': 6 } });
    map.current.addLayer({ id: routeKey, type: 'line', source: routeKey, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': color, 'line-width': 8, 'line-opacity': 1 } });
  }, []);

  const startNavigationEngine = async (targetLoc, mode = 'manual', address = '') => {
    if (!myLocation) return;
    activeDestination.current = { ...targetLoc, mode, address };
    placeDestinationMarker(targetLoc);
    
    const routeColor = mode === 'emergency' ? '#ef4444' : '#0ea5e9';
    const route = await computeRoute(myLocation, targetLoc);
    
    if (route) {
      drawRoute(route.geometry, routeColor);
      setCurrentManeuver(route.steps[0]);
      setRouteProgress({ distanceRemaining: route.distance, durationRemaining: route.duration });
      setIsNavigating(true);
      setIsConfirmingCancel(false); // Reseteamos el UI de cancelación al arrancar
      changeStatus('en_ruta');
      setIsFollowing(true);
      onDrawerClose();
      
      if (map.current) {
        map.current.flyTo({ center: [myLocation.lng, myLocation.lat], zoom: 18, pitch: 60, bearing: myHeading, duration: 1200 });
        setIsGpsMode(true);
      }
    }
  };

  useEffect(() => {
    if (isNavigating && activeDestination.current) {
      routeIntervalRef.current = setInterval(async () => {
        if (!myLocation || !activeDestination.current) return;
        const route = await computeRoute(myLocation, activeDestination.current);
        if (route) {
          const routeColor = activeDestination.current.mode === 'emergency' ? '#ef4444' : '#0ea5e9';
          drawRoute(route.geometry, routeColor);
          setCurrentManeuver(route.steps[0]);
          setRouteProgress({ distanceRemaining: route.distance, durationRemaining: route.duration });
        }
      }, ROUTE_POLLING_INTERVAL);
    }
    return () => { if (routeIntervalRef.current) clearInterval(routeIntervalRef.current); };
  }, [isNavigating, myLocation, computeRoute, drawRoute]);

  // ========================================================================
  // BÚSQUEDA MANUAL - CAJÓN
  // ========================================================================
  const searchAddresses = useCallback(async (query) => {
    if (!query || query.trim().length < 3) { setSearchResults([]); return; }
    try {
      const prox = myLocation ? `${myLocation.lng},${myLocation.lat}` : '-101.1969,19.7024';
      const bbox = '-101.35,19.55,-101.00,19.85'; 
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query.trim())}.json?access_token=${mapboxgl.accessToken}&country=mx&proximity=${prox}&bbox=${bbox}&limit=5&language=es`;
      const res = await fetch(url);
      const data = await res.json();
      setSearchResults((data.features || []).map(f => ({ id: f.id, place_name: f.place_name, lat: f.center[1], lng: f.center[0] })));
    } catch (e) {}
  }, [myLocation]);

  const selectSearchResult = async (result) => {
    setSearchQuery(''); setSearchResults([]);
    const targetLoc = { lat: result.lat, lng: result.lng };
    startNavigationEngine(targetLoc, 'manual', result.place_name);
  };

  // ========================================================================
  // CANCELACIÓN DE RUTAS Y SERVICIOS
  // ========================================================================
  const cancelCurrentRoute = useCallback((silent = false) => {
    if (assignedEmergency) sendWS({ type: 'emergency_completed', ambulanceId: ambulancia?.id, callId: assignedEmergency.callId });
    if (destinationMarker.current) { destinationMarker.current.remove(); destinationMarker.current = null; }
    
    try {
      if (map.current.getLayer('active-route')) map.current.removeLayer('active-route');
      if (map.current.getLayer('active-route-glow')) map.current.removeLayer('active-route-glow');
      if (map.current.getSource('active-route')) map.current.removeSource('active-route');
    } catch {}

    activeDestination.current = null;
    setIsNavigating(false);
    setIsConfirmingCancel(false);
    setAssignedEmergency(null); 
    setCurrentManeuver(null); 
    setRouteProgress(null); 
    setSelectedHospitalId(null);
    changeStatus('disponible');
    
    centerMapAction();
    if (!silent) toast({ title: 'NAVEGACIÓN FINALIZADA', status: 'info', duration: 3000, position: 'bottom' });
  }, [assignedEmergency, ambulancia, sendWS, changeStatus, toast]);

  const handleSendTransfer = async () => {
    const hospital = hospitals.find(h => h.id === selectedHospitalId);
    if (!hospital || !myLocation) return;
    setIsSending(true);

    sendWS({
      type: 'patient_transfer_notification',
      notificationId: `notif_${Date.now()}`,
      ambulanceId: ambulancia.id, hospitalId: hospital.id, hospitalInfo: hospital,
      patientInfo: { nombre: 'Paciente Triage', edad: patientData.edad, sexo: patientData.sexo, condition: patientData.diagnostico },
      ambulanceLocation: myLocation, emergencyMode: 'trasladar_paciente',
    });

    toast({ title: '📩 SOLICITUD ENVIADA', description: `Navegando hacia ${hospital.nombre}`, status: 'success', duration: 4000, position: 'bottom' });
    startNavigationEngine({ lat: hospital.lat, lng: hospital.lng }, 'transfer', hospital.nombre);
    setIsSending(false);
  };

  // Confirmación genérica (Sólo usada para el botón de SALIR / LOGOUT en el header)
  const confirmAction = useCallback((action, title, body) => { setPendingAction({ fn: action, title, body }); onAlertOpen(); }, [onAlertOpen]);
  const executeConfirmed = useCallback(() => { if (pendingAction?.fn) pendingAction.fn(); onAlertClose(); setPendingAction(null); }, [pendingAction, onAlertClose]);

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
      map.current.flyTo({ center: [myLocation.lng, myLocation.lat], zoom: isGpsMode ? 18 : 14, pitch: isGpsMode ? 60 : 0, bearing: isGpsMode ? myHeading : 0, duration: 800 });
    }
  };

  const toggleCameraAction = () => {
    setIsGpsMode(!isGpsMode);
    setIsFollowing(true);
    if (map.current && myLocation) {
      map.current.flyTo({ center: [myLocation.lng, myLocation.lat], zoom: !isGpsMode ? 18 : 14, pitch: !isGpsMode ? 60 : 0, bearing: !isGpsMode ? myHeading : 0, duration: 1000 });
    }
  };

  if (!ambulancia) return <RegistrationModal onRegister={(d) => { setAmbulancia(d); changeStatus('disponible'); }} />;

  const currentStatusOpt = STATUS_OPTIONS.find(s => s.value === ambulanceStatus) || STATUS_OPTIONS[0];

  return (
    <Box h="100vh" w="100vw" bg="#000" overflow="hidden" position="relative" display="flex" flexDirection="column">
      
      {/* ===== MAPA ===== */}
      <Box ref={mapContainer} position="absolute" inset={0} zIndex={0} />

      {/* ===== HEADER NORMAL (CONDICIONADO: SE ELIMINA AL NAVEGAR) ===== */}
      {!isNavigating && (
        <SlideFade in={true} offsetY="-20px" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
          <Flex bg="rgba(9, 9, 11, 0.85)" backdropFilter="blur(12px)" px={4} py={3} alignItems="center" justify="space-between" borderBottom="1px solid #27272a">
            <VStack align="start" spacing={0}>
              <Heading size="md" color="#f8fafc" fontSize="18px" fontWeight="900" letterSpacing="1px">{ambulancia.id}</Heading>
              <Badge bg={wsStatus === 'connected' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'} color={wsStatus === 'connected' ? '#10b981' : '#ef4444'} fontSize="10px">{wsStatus === 'connected' ? 'ONLINE' : 'OFFLINE'}</Badge>
            </VStack>

            <HStack spacing={4}>
              <Select value={ambulanceStatus} onChange={(e) => changeStatus(e.target.value)} bg="#18181b" border="2px solid" borderColor={currentStatusOpt.color} color={currentStatusOpt.color} borderRadius="xl" h="45px" fontSize="15px" fontWeight="900" w="130px">
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value} style={{ background: '#09090b', color: s.color }}>{s.label}</option>)}
              </Select>
              <IconButton aria-label="Cerrar" icon={<FaSignOutAlt />} onClick={() => confirmAction(() => { if (wsRef.current) wsRef.current.close(); clearAmbulance(); setAmbulancia(null); }, 'FINALIZAR TURNO', '¿Desconectar unidad?')} bg="#18181b" color="#a1a1aa" border="1px solid #27272a" borderRadius="xl" w="45px" h="45px" _hover={{ bg: 'rgba(239,68,68,0.2)', color: '#ef4444' }} />
            </HStack>
          </Flex>
        </SlideFade>
      )}

      {/* ===== MODO NAVEGACIÓN: INDICACIONES Y VELOCÍMETRO ===== */}
      {isNavigating && (
        <>
          <SlideFade in={true} offsetY="-20px" style={{ position: 'absolute', top: '15px', left: '5%', right: '5%', zIndex: 20 }}>
            <Box bg="rgba(24, 24, 27, 0.95)" backdropFilter="blur(10px)" border="2px solid #0ea5e9" borderRadius="2xl" p={4} shadow="dark-lg">
              <HStack spacing={4}>
                <Box bg="#0ea5e9" p={4} borderRadius="xl" color="white" fontSize="3xl">{getManeuverIcon(currentManeuver)}</Box>
                <VStack align="start" spacing={1} flex={1}>
                  <Text fontSize="22px" fontWeight="900" color="white" lineHeight="1.1" noOfLines={2}>{currentManeuver?.maneuver?.instruction || 'Siga la ruta trazada'}</Text>
                  <HStack spacing={4} mt={1}>
                    <Text fontSize="18px" fontWeight="900" color="#38bdf8">{currentManeuver?.distance ? fmtDist(currentManeuver.distance) : ''}</Text>
                    {routeProgress && <Text fontSize="18px" fontWeight="900" color="#10b981">ETA: {fmtDur(routeProgress.durationRemaining)}</Text>}
                  </HStack>
                </VStack>
              </HStack>
            </Box>
          </SlideFade>

          <SlideFade in={true} offsetX="20px" style={{ position: 'absolute', right: '20px', bottom: '100px', zIndex: 20 }}>
            <Flex bg="rgba(9, 9, 11, 0.9)" border="2px solid #3f3f46" w="80px" h="80px" borderRadius="full" direction="column" justify="center" align="center" shadow="xl" backdropFilter="blur(10px)">
              <Text color="#10b981" fontWeight="900" fontSize="28px" lineHeight="1">{mySpeed}</Text>
              <Text color="#a1a1aa" fontSize="11px" fontWeight="900">KM/H</Text>
            </Flex>
          </SlideFade>
        </>
      )}

      {/* ===== CONTROLES LATERALES ===== */}
      {!isDrawerOpen && !isNavigating && (
        <SlideFade in={true} offsetX="20px" style={{ position: 'absolute', right: '12px', top: '15%', zIndex: 5 }}>
          <VStack spacing={4}>
            <Box bg="rgba(24,24,27,0.9)" backdropFilter="blur(10px)" borderRadius="xl" border="1px solid #3f3f46" overflow="hidden" shadow="lg">
              <Tooltip label="Centrar GPS" placement="left" hasArrow bg="#18181b" color="white">
                <IconButton aria-label="Centrar" icon={<MdCenterFocusStrong />} w="50px" h="50px" onClick={centerMapAction} color={isFollowing ? '#0ea5e9' : 'white'} variant="ghost" fontSize="22px" _hover={{ bg: '#27272a' }} />
              </Tooltip>
              <Divider borderColor="#3f3f46" />
              <Tooltip label={isGpsMode ? "Vista 2D Cenital" : "Vista 3D Navegación"} placement="left" hasArrow bg="#18181b" color="white">
                <IconButton aria-label="Alternar Vista" icon={isGpsMode ? <FaMap /> : <FaLocationArrow />} w="50px" h="50px" onClick={toggleCameraAction} color={isGpsMode ? '#0ea5e9' : 'white'} variant="ghost" fontSize="20px" _hover={{ bg: '#27272a' }} />
              </Tooltip>
            </Box>
          </VStack>
        </SlideFade>
      )}

      {/* ===== BARRA INFERIOR (BOTONES DE BÚSQUEDA Y TRASLADO) ===== */}
      {!isDrawerOpen && !isNavigating && (
        <SlideFade in={true} offsetY="20px" style={{ position: 'absolute', bottom: '20px', left: 0, right: 0, zIndex: 10 }}>
          <HStack px={4} spacing={3} w="100%" justify="center">
            <Button flex={0.5} h="65px" bg="#18181b" border="2px solid #3f3f46" color="white" fontSize="16px" fontWeight="900" borderRadius="2xl" shadow="2xl" onClick={() => { setDrawerMode('atender'); onDrawerOpen(); }}>
              <Icon as={FaSearch} mr={2} color="#0ea5e9" /> NAVEGAR A...
            </Button>
            <Button flex={0.5} h="65px" bg="#0ea5e9" color="white" fontSize="16px" fontWeight="900" borderRadius="2xl" shadow="2xl" onClick={() => { setDrawerMode('trasladar'); onDrawerOpen(); }}>
              <Icon as={FaHospital} mr={2} /> TRASLADO HOSP.
            </Button>
          </HStack>
        </SlideFade>
      )}

      {/* ===== INTERFAZ DINÁMICA DE CANCELACIÓN (SIN OSCURECER PANTALLA) ===== */}
      {isNavigating && (
        <SlideFade in={true} offsetY="20px" style={{ position: 'absolute', bottom: '20px', left: 0, right: 0, zIndex: 20 }}>
          <Box px={4}>
            {isConfirmingCancel ? (
              <VStack spacing={3} bg="rgba(24, 24, 27, 0.95)" p={4} borderRadius="2xl" border="2px solid #ef4444" shadow="2xl" backdropFilter="blur(10px)">
                <Text color="#ef4444" fontWeight="900" fontSize="18px">¿TERMINAR NAVEGACIÓN?</Text>
                <HStack w="100%" spacing={3}>
                  <Button flex={1} h="55px" bg="#27272a" color="white" fontSize="16px" fontWeight="900" borderRadius="xl" onClick={() => setIsConfirmingCancel(false)}>
                    VOLVER
                  </Button>
                  <Button flex={1} h="55px" bg="#ef4444" color="white" fontSize="16px" fontWeight="900" borderRadius="xl" onClick={() => cancelCurrentRoute(false)}>
                    SÍ, CANCELAR
                  </Button>
                </HStack>
              </VStack>
            ) : (
              <Button w="100%" h="65px" bg="#ef4444" color="white" fontSize="18px" fontWeight="900" borderRadius="2xl" shadow="dark-lg" _hover={{ bg: '#dc2626' }} onClick={() => setIsConfirmingCancel(true)}>
                <Icon as={FaTimesCircle} mr={2} boxSize={5} /> CANCELAR RUTA
              </Button>
            )}
          </Box>
        </SlideFade>
      )}

      {/* ==================== CAJÓN MULTIFUNCIÓN (BÚSQUEDA Y TRASLADO) ==================== */}
      <Drawer isOpen={isDrawerOpen} placement="bottom" onClose={onDrawerClose} size="full">
        <DrawerOverlay backdropFilter="blur(5px)" bg="rgba(0,0,0,0.6)" />
        <DrawerContent bg="#09090b" borderTopRadius="3xl" h="85vh" mt="15vh" borderTop="2px solid #27272a" zIndex={1400}>
          
          <Flex justify="center" pt={3} pb={1} onClick={onDrawerClose} cursor="pointer">
            <Box w="50px" h="5px" bg="#3f3f46" borderRadius="full" />
          </Flex>

          <DrawerHeader bg="#09090b" py={2} px={6} display="flex" justifyContent="space-between" alignItems="center">
             <Text fontSize="20px" fontWeight="900" color="white">{drawerMode === 'atender' ? 'BUSCAR DIRECCIÓN' : 'PROTOCOLO DE TRASLADO'}</Text>
             <IconButton aria-label="Cerrar" icon={<FaTimes />} variant="ghost" color="#ef4444" fontSize="22px" onClick={onDrawerClose} />
          </DrawerHeader>

          <DrawerBody p={4} bg="#09090b" overflowY="auto">
            {drawerMode === 'atender' ? (
              <VStack spacing={4} align="stretch" h="100%">
                <InputGroup size="lg">
                  <Input value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); searchAddresses(e.target.value); }} placeholder="Buscar calle, colonia..." bg="#18181b" width="100%" border="2px solid #3f3f46" color="white" h="65px" fontSize="18px" fontWeight="800" _focus={{ borderColor: '#0ea5e9' }} />
                </InputGroup>
                
                <Box flex={1} overflowY="auto">
                  {searchResults.map((r) => (
                    <Button key={r.id} w="100%" h="auto" py={4} mb={3} justifyContent="flex-start" bg="#18181b" border="1px solid #27272a" _hover={{ bg: '#27272a' }} onClick={() => selectSearchResult(r)}>
                      <HStack w="100%" spacing={4}>
                        <Icon as={FaMapMarkerAlt} color="#ef4444" boxSize={5} />
                        <Text color="white" fontSize="18px" fontWeight="800" whiteSpace="normal" textAlign="left">{r.place_name}</Text>
                      </HStack>
                    </Button>
                  ))}
                  {searchQuery.length > 2 && searchResults.length === 0 && (
                    <Text color="#a1a1aa" textAlign="center" mt={4} fontWeight="800">Buscando en Morelia...</Text>
                  )}
                </Box>
              </VStack>
            ) : (
              <VStack spacing={5} align="stretch" pb={24}>
                <Box bg="#18181b" p={5} borderRadius="2xl" border="1px solid #27272a">
                  <Text fontSize="12px" fontWeight="900" color="#a1a1aa" mb={4}>1. DATOS DEL PACIENTE</Text>
                  
                  <FormControl mb={4}>
                    <FormLabel color="#0ea5e9" fontWeight="900" fontSize="14px">EDAD APROXIMADA</FormLabel>
                    <HStack>
                      <IconButton aria-label="Menos edad" icon={<FaMinus />} onClick={() => setPatientData(p => ({ ...p, edad: Math.max(0, p.edad - 1) }))} w="60px" h="60px" bg="#27272a" color="white" fontSize="20px" _hover={{ bg: '#3f3f46' }} />
                      <Flex flex={1} bg="#09090b" h="60px" border="2px solid #3f3f46" borderRadius="xl" align="center" justify="center">
                        <Text fontSize="28px" fontWeight="900" color="white">{patientData.edad}</Text>
                      </Flex>
                      <IconButton aria-label="Más edad" icon={<FaPlus />} onClick={() => setPatientData(p => ({ ...p, edad: p.edad + 1 }))} w="60px" h="60px" bg="#27272a" color="white" fontSize="20px" _hover={{ bg: '#3f3f46' }} />
                    </HStack>
                  </FormControl>

                  <FormControl mb={4}>
                    <FormLabel color="#0ea5e9" fontWeight="900" fontSize="14px">SEXO</FormLabel>
                    <ButtonGroup w="100%" isAttached>
                      {['Hombre', 'Mujer', 'N/S'].map(s => (
                        <Button key={s} flex={1} h="50px" fontSize="16px" fontWeight="900" bg={patientData.sexo === s ? '#0ea5e9' : '#27272a'} color={patientData.sexo === s ? 'white' : '#a1a1aa'} _hover={{ bg: patientData.sexo === s ? '#0284c7' : '#3f3f46' }} onClick={() => setPatientData(p => ({ ...p, sexo: s }))}>{s}</Button>
                      ))}
                    </ButtonGroup>
                  </FormControl>

                  <FormControl>
                    <FormLabel color="#0ea5e9" fontWeight="900" fontSize="14px">IMPRESIÓN DIAGNÓSTICA</FormLabel>
                    <Select h="55px" fontSize="16px" fontWeight="900" bg="#09090b" color="white" border="2px solid #3f3f46" value={patientData.diagnostico} onChange={e => setPatientData(p => ({ ...p, diagnostico: e.target.value }))}>
                      {DIAGNOSTICOS_RAPIDOS.map(d => <option key={d} value={d} style={{ background: '#09090b' }}>{d}</option>)}
                    </Select>
                  </FormControl>
                </Box>

                <Box bg="#18181b" p={5} borderRadius="2xl" border="1px solid #27272a">
                  <Text fontSize="12px" fontWeight="900" color="#a1a1aa" mb={4}>2. CENTRO RECEPTOR CERCANO</Text>
                  <VStack spacing={3} align="stretch">
                    {hospitals.filter(h => h.connected).sort((a, b) => {
                      if (!myLocation) return 0;
                      return calcDistance(myLocation.lat, myLocation.lng, a.lat, a.lng) - calcDistance(myLocation.lat, myLocation.lng, b.lat, b.lng);
                    }).map(h => {
                      const isSelected = selectedHospitalId === h.id;
                      const dist = myLocation ? calcDistance(myLocation.lat, myLocation.lng, h.lat, h.lng) : 0;
                      return (
                        <Button key={h.id} h="75px" w="100%" justifyContent="space-between" px={4} bg={isSelected ? 'rgba(16,185,129,0.15)' : '#27272a'} border="2px solid" borderColor={isSelected ? '#10b981' : 'transparent'} _hover={{ bg: isSelected ? 'rgba(16,185,129,0.25)' : '#3f3f46' }} onClick={() => setSelectedHospitalId(h.id)}>
                          <VStack align="start" spacing={0}>
                            <Text fontSize="16px" fontWeight="900" color="white" noOfLines={1}>{h.nombre}</Text>
                            <Text fontSize="12px" color="#10b981" fontWeight="900">{h.camasDisponibles} CAMAS DISP.</Text>
                          </VStack>
                          <Text fontSize="16px" fontWeight="900" color="#a1a1aa">~{fmtDist(dist)} <span style={{fontSize: '10px'}}>(Dist. Lineal)</span></Text>
                        </Button>
                      );
                    })}
                    {hospitals.filter(h => h.connected).length === 0 && <Text color="#ef4444" fontWeight="900" textAlign="center">NO HAY HOSPITALES ACTIVOS</Text>}
                  </VStack>
                </Box>
              </VStack>
            )}
          </DrawerBody>
          
          {drawerMode === 'trasladar' && (
            <DrawerFooter bg="#18181b" borderTop="1px solid #27272a" p={4} position="absolute" bottom={0} w="100%">
              <Button w="100%" h="60px" bg="#10b981" color="white" fontSize="18px" fontWeight="900" letterSpacing="1px" _hover={{ bg: '#059669' }} isDisabled={!selectedHospitalId || isSending} isLoading={isSending} onClick={handleSendTransfer}>
                CONFIRMAR RUTA
              </Button>
            </DrawerFooter>
          )}
        </DrawerContent>
      </Drawer>

      {/* ==================== ALERTA DE LOGOUT (MODAL LIMPIO) ==================== */}
      <Modal isOpen={isAlertOpen} onClose={onAlertClose} isCentered blockScrollOnMount={false} trapFocus={false}>
        <ModalOverlay bg="rgba(0,0,0,0.7)" backdropFilter="blur(3px)" />
        <ModalContent bg="#09090b" border="2px solid #ef4444" borderRadius="2xl" p={4} mx={4}>
          <ModalHeader color="#ef4444" fontWeight="900" fontSize="20px" textAlign="center">{pendingAction?.title}</ModalHeader>
          <ModalBody color="white" fontSize="16px" textAlign="center" fontWeight="800">
            {pendingAction?.body}
          </ModalBody>
          <ModalFooter mt={4} gap={4} display="flex" p={0}>
            <Button flex={1} h="55px" bg="#27272a" color="white" fontSize="16px" fontWeight="900" onClick={onAlertClose}>VOLVER</Button>
            <Button flex={1} h="55px" bg="#ef4444" color="white" fontSize="16px" fontWeight="900" onClick={executeConfirmed}>CONFIRMAR</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

// ========================================================================
// MODAL REGISTRO INICIAL
// ========================================================================
const RegistrationModal = ({ onRegister }) => {
  const [form, setForm] = useState({ id: '', placa: '', nombre: '', tipo: 'UVI Móvil' });
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!form.id.trim() || !form.placa.trim() || !form.nombre.trim()) return setError('LLENE LOS DATOS OBLIGATORIOS');
    const data = { id: form.id.trim().toUpperCase(), placa: form.placa.trim().toUpperCase(), nombre: form.nombre.trim(), tipo: form.tipo };
    saveAmbulance(data); onRegister(data);
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
              <Input bg="#18181b" border="2px solid #3f3f46" color="white" h="50px" fontSize="18px" fontWeight="900" textAlign="center" textTransform="uppercase" value={form.id} onChange={e => setForm(p => ({ ...p, id: e.target.value }))} />
            </FormControl>
            <FormControl>
              <FormLabel color="#a1a1aa" fontWeight="900" fontSize="11px">PLACA *</FormLabel>
              <Input bg="#18181b" border="2px solid #3f3f46" color="white" h="50px" fontSize="18px" fontWeight="900" textAlign="center" textTransform="uppercase" value={form.placa} onChange={e => setForm(p => ({ ...p, placa: e.target.value }))} />
            </FormControl>
            <FormControl>
              <FormLabel color="#a1a1aa" fontWeight="900" fontSize="11px">NOMBRE BASE *</FormLabel>
              <Input bg="#18181b" border="2px solid #3f3f46" color="white" h="50px" fontSize="16px" fontWeight="900" textAlign="center" value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} />
            </FormControl>
            <FormControl>
              <FormLabel color="#a1a1aa" fontWeight="900" fontSize="11px">TIPO DE UNIDAD</FormLabel>
              <Select bg="#18181b" border="2px solid #3f3f46" color="white" h="50px" fontSize="14px" fontWeight="900" value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}>
                {TIPOS_AMBULANCIA.map(t => <option key={t} value={t} style={{ background: '#09090b' }}>{t}</option>)}
              </Select>
            </FormControl>
            {error && <Text color="#ef4444" fontWeight="900" fontSize="12px" textAlign="center">{error}</Text>}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button w="100%" h="60px" bg="#0ea5e9" color="white" fontSize="16px" fontWeight="900" onClick={handleSubmit}>VINCULAR SISTEMA</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180; const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}