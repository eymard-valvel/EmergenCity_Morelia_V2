// src/components/operador/MapaOperador.jsx
// EmergenCity - Consola de navegación móvil

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

// -- Constantes de red y mapa --
const WS_URL = resolveWsUrl();
const DEFAULT_CENTER = { lat: 19.7024, lng: -101.1969 };
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT = 5;

// -- Constantes anti-costo Mapbox --
const ROUTE_POLL_INTERVAL = 20000;
const MIN_MOVE_FOR_POLL = 150;
const OFF_ROUTE_THRESHOLD_M = 120;
const OFF_ROUTE_CHECK_INTERVAL = 5000;
const OFF_ROUTE_RECALC_COOLDOWN = 20000;
const MAX_REASONABLE_ROUTE_FACTOR = 3;

// -- Catálogos operativos --
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

// -- Sesión local --
const SESSION_KEY = 'ambulanciaRegistrada';
const loadSavedAmbulance = () => { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; } };
const saveAmbulance = (data) => sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
const clearAmbulance = () => sessionStorage.removeItem(SESSION_KEY);

// -- Formateadores --
const fmtDist = (km) => km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
const fmtDur = (seconds) => {
  if (!seconds || !Number.isFinite(seconds)) return '—';
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

// -- Utilidades geográficas --
function bearingBetween(from, to) {
  const toRad = (d) => d * Math.PI / 180;
  const toDeg = (r) => r * 180 / Math.PI;
  const dLon = toRad(to.lng - from.lng);
  const y = Math.sin(dLon) * Math.cos(toRad(to.lat));
  const x = Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
            Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

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

function distanceToRouteMeters(location, geometry) {
  if (!location || !Array.isArray(geometry) || geometry.length < 2) return Infinity;
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const lat0 = toRad(location.lat);
  const px = toRad(location.lng) * R * Math.cos(lat0);
  const py = toRad(location.lat) * R;

  let minDist = Infinity;
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
  // ==================== ESTADOS Y REFS ====================
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

  // ==================== EFECTOS DE SINCRONIZACIÓN ====================
  useEffect(() => { isNavigatingRef.current = isNavigating; }, [isNavigating]);

  useEffect(() => { saveLocal('operador', 'assignedEmergency', assignedEmergency); }, [assignedEmergency]);
  useEffect(() => { saveLocal('operador', 'hospitalRequest', hospitalRequest); }, [hospitalRequest]);

  // ==================== WEBSOCKET ====================
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

            case 'operator_emergency_created':
              setAssignedEmergency(prev => ({
                ...(prev || {}),
                callId: data.callId,
                emergencyType: prev?.emergencyType || 'Iniciada por operador',
                address: prev?.address || 'Atención en campo',
                patientInfo: prev?.patientInfo || {},
                createdBy: 'operator'
              }));
              toast({
                title: 'Folio generado',
                description: data.callId,
                status: 'success',
                duration: 5000,
                position: 'bottom'
              });
              break;

            case 'auto_hospital_request_sent':
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
                description: `${data.hospitalName} · ${data.distanceKm} km`,
                status: 'success',
                duration: 6000,
                position: 'bottom'
              });
              break;

            case 'hospital_search_failed':
              setSearchingHospital(false);
              toast({
                title: 'Sin hospitales conectados',
                description: 'No hay hospitales con capacidad disponible.',
                status: 'warning',
                duration: 8000,
                position: 'bottom'
              });
              break;

            case 'new_emergency_assigned':
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

  // ==================== MAPBOX INICIALIZACIÓN ====================
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

  // ==================== GEOLOCALIZACIÓN CONTINUA ====================
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
            map.current.jumpTo({ center: [loc.lng, loc.lat], zoom: 18, pitch: 60 });
            isInitialMapCentered.current = true;
          } else {
            let bearing = hdg;
            const nextPoint = currentManeuver?.maneuver?.location;
            if (nextPoint) {
              bearing = bearingBetween(loc, { lat: nextPoint[1], lng: nextPoint[0] });
            }
            map.current.easeTo({
              center: [loc.lng, loc.lat],
              bearing,
              pitch: 60,
              zoom: 18,
              duration: 800,
              easing: (t) => t
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

  // ==================== MARCADORES ====================
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
        const stepsPendientes = route.steps.filter((s, idx) => idx === 0 || s.distance > 5);
        if (stepsPendientes.length > 0) setCurrentManeuver(stepsPendientes[0]);
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

  // ==================== POLLING Y OFF-ROUTE ====================
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

  // ==================== TRANSFERENCIA Y SOLICITUD HOSPITAL ====================
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

  // ==================== CREACIÓN DE EMERGENCIA POR OPERADOR ====================
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

  // ==================== CONFIRMACIONES Y OFERTAS ====================
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

  // ==================== UTILIDADES DE UI ====================
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

  // ==================== REGISTRO INICIAL ====================
  if (!ambulancia) {
    return <RegistrationModal onRegister={(d) => { setAmbulancia(d); changeStatus('disponible'); }} />;
  }

  const currentStatusOpt = STATUS_OPTIONS.find(s => s.value === ambulanceStatus) || STATUS_OPTIONS[0];

  // ==================== DATOS DERIVADOS PARA EL HUD ====================
  const nextStep = currentManeuver;
  const nextStepDistance = nextStep?.distance;
  const nextStepName = nextStep?.name || '';
  const arrivalDate = routeProgress?.durationRemaining
    ? new Date(Date.now() + routeProgress.durationRemaining * 1000)
    : null;
  const arrivalStr = arrivalDate
    ? arrivalDate.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })
    : '—';
  const etaSummary = routeProgress
    ? `${fmtDur(routeProgress.durationRemaining)} • ${fmtDist(routeProgress.distanceRemaining / 1000)}`
    : 'Calculando...';

  const wsDotColor = wsStatus === 'connected' ? '#4CAF50' : wsStatus === 'connecting' ? '#FFC107' : '#F44336';

  // Constantes de layout derivadas del XML
  const TRIP_PANEL_HEIGHT = 88;
  const ABOVE_PANEL = TRIP_PANEL_HEIGHT + 16;

  // ==================== RENDER ====================
  return (
    <Box
      position="relative"
      w="100vw"
      h="100vh"
      bg="#1E1E1E"
      overflow="hidden"
    >
      {/* -- Capa base del mapa (MapView) -- */}
      <Box ref={mapContainer} position="absolute" top={0} left={0} right={0} bottom={0} zIndex={0} />

      {/* ==================== MODO NAVEGACIÓN ==================== */}
      {isNavigating && (
        <>
          {/* -- topNavCard -- */}
          <Box
            position="absolute"
            top="16px"
            left="16px"
            right="16px"
            bg="#2C2C2C"
            borderRadius="16px"
            p="16px"
            zIndex={20}
            boxShadow="0 4px 16px rgba(0,0,0,0.45)"
          >
            <Flex align="center">
              <Flex
                w="48px"
                h="48px"
                minW="48px"
                align="center"
                justify="center"
                color="#FFFFFF"
                fontSize="30px"
              >
                {getManeuverIcon(nextStep)}
              </Flex>
              <Box ml="16px" minW={0} flex={1}>
                <Text
                  fontSize="28px"
                  fontWeight="900"
                  color="#FFFFFF"
                  lineHeight="1.15"
                  noOfLines={1}
                >
                  {nextStepDistance != null ? fmtDist(nextStepDistance / 1000) : '—'}
                </Text>
                <Text
                  fontSize="18px"
                  color="#FFFFFF"
                  lineHeight="1.2"
                  noOfLines={1}
                  opacity={0.92}
                >
                  {nextStepName || 'Continúe por la ruta'}
                </Text>
              </Box>
            </Flex>
          </Box>

          {/* -- speedLimitCard -- */}
          <Box
            position="absolute"
            left="16px"
            bottom={`${ABOVE_PANEL}px`}
            w="48px"
            h="48px"
            bg="#2C2C2C"
            borderRadius="8px"
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            zIndex={20}
            boxShadow="0 2px 10px rgba(0,0,0,0.45)"
          >
            <Text fontSize="15px" fontWeight="900" color="#4CAF50" lineHeight="1">
              {Math.round(mySpeed)}
            </Text>
            <Text fontSize="7px" fontWeight="900" color="#B0B0B0" lineHeight="1" mt="2px">
              KM/H
            </Text>
          </Box>

          {/* -- fabRecenter -- */}
          <IconButton
            aria-label="Centrar"
            icon={<MdCenterFocusStrong />}
            onClick={centerMapAction}
            position="absolute"
            left="50%"
            bottom={`${ABOVE_PANEL}px`}
            transform="translateX(-50%)"
            w="56px"
            h="56px"
            minW="56px"
            borderRadius="full"
            bg="#2C2C2C"
            color={isFollowing ? '#0ea5e9' : '#FFFFFF'}
            fontSize="24px"
            zIndex={20}
            boxShadow="0 4px 14px rgba(0,0,0,0.5)"
            _hover={{ bg: '#3A3A3A' }}
            _active={{ bg: '#454545' }}
          />

          {/* -- rightControls -- */}
          <VStack
            position="absolute"
            right="16px"
            bottom={`${ABOVE_PANEL}px`}
            spacing="12px"
            zIndex={20}
          >
            <IconButton
              aria-label="Alternar vista"
              icon={isGpsMode ? <FaMap /> : <FaLocationArrow />}
              onClick={toggleCameraAction}
              w="56px"
              h="56px"
              minW="56px"
              borderRadius="full"
              bg="#2C2C2C"
              color={isGpsMode ? '#0ea5e9' : '#FFFFFF'}
              fontSize="20px"
              boxShadow="0 4px 14px rgba(0,0,0,0.5)"
              _hover={{ bg: '#3A3A3A' }}
              _active={{ bg: '#454545' }}
            />
            <IconButton
              aria-label="Recalcular ruta"
              icon={<FaSyncAlt />}
              onClick={() => recalcRoute(false)}
              w="56px"
              h="56px"
              minW="56px"
              borderRadius="full"
              bg="#2C2C2C"
              color="#FFFFFF"
              fontSize="20px"
              boxShadow="0 4px 14px rgba(0,0,0,0.5)"
              _hover={{ bg: '#3A3A3A' }}
              _active={{ bg: '#454545' }}
              isLoading={isRecalculating}
            />
          </VStack>

          {/* -- bottomTripPanel -- */}
          <Box
            position="absolute"
            bottom="0"
            left="0"
            right="0"
            bg="#222222"
            p="16px"
            zIndex={25}
            boxShadow="0 -4px 14px rgba(0,0,0,0.5)"
          >
            {cancelStep === 'idle' && (
              <Flex align="center" justify="space-between" minH="56px">
                <IconButton
                  aria-label="Cancelar viaje"
                  icon={<FaTimes />}
                  onClick={() => setCancelStep('confirm')}
                  variant="ghost"
                  color="#FFFFFF"
                  fontSize="18px"
                  w="44px"
                  h="44px"
                  minW="44px"
                  borderRadius="full"
                  _hover={{ bg: '#3A3A3A' }}
                />
                <VStack spacing="2px" flex={1} align="center" justify="center" minW={0}>
                  <Text
                    fontSize="20px"
                    fontWeight="900"
                    color="#4CAF50"
                    lineHeight="1.2"
                    noOfLines={1}
                  >
                    {etaSummary}
                  </Text>
                  <Text
                    fontSize="14px"
                    color="#B0B0B0"
                    lineHeight="1.2"
                    noOfLines={1}
                  >
                    Llegada estimada {arrivalStr}
                  </Text>
                </VStack>
                <Box w="44px" h="44px" minW="44px" />
              </Flex>
            )}

            {cancelStep === 'confirm' && (
              <VStack spacing="12px" py="4px">
                <Text color="#ef4444" fontWeight="900" fontSize="16px" letterSpacing="0.5px">
                  ¿TERMINAR NAVEGACIÓN?
                </Text>
                <HStack w="100%" spacing="12px">
                  <Button
                    flex={1}
                    h="52px"
                    bg="#3A3A3A"
                    color="#FFFFFF"
                    fontSize="15px"
                    fontWeight="900"
                    borderRadius="12px"
                    _hover={{ bg: '#454545' }}
                    onClick={() => setCancelStep('idle')}
                  >
                    VOLVER
                  </Button>
                  <Button
                    flex={1}
                    h="52px"
                    bg="#ef4444"
                    color="#FFFFFF"
                    fontSize="15px"
                    fontWeight="900"
                    borderRadius="12px"
                    _hover={{ bg: '#dc2626' }}
                    onClick={() => setCancelStep('reason')}
                  >
                    SÍ, CONTINUAR
                  </Button>
                </HStack>
              </VStack>
            )}

            {cancelStep === 'reason' && (
              <VStack spacing="10px" py="4px">
                <Text color="#FFFFFF" fontWeight="900" fontSize="14px" letterSpacing="1px">
                  MOTIVO DE TÉRMINO
                </Text>
                <SimpleGrid columns={2} spacing="8px" w="100%">
                  <Button
                    h="50px"
                    bg="rgba(76,175,80,0.15)"
                    color="#4CAF50"
                    border="2px solid #4CAF50"
                    fontSize="11px"
                    fontWeight="900"
                    borderRadius="10px"
                    _hover={{ bg: 'rgba(76,175,80,0.25)' }}
                    onClick={() => handleCancelWithReason('completed')}
                  >
                    SERVICIO COMPLETADO
                  </Button>
                  <Button
                    h="50px"
                    bg="#3A3A3A"
                    color="#FFFFFF"
                    fontSize="11px"
                    fontWeight="900"
                    borderRadius="10px"
                    _hover={{ bg: '#454545' }}
                    onClick={() => handleCancelWithReason('averia')}
                  >
                    AVERÍA MECÁNICA
                  </Button>
                  <Button
                    h="50px"
                    bg="#3A3A3A"
                    color="#FFFFFF"
                    fontSize="11px"
                    fontWeight="900"
                    borderRadius="10px"
                    _hover={{ bg: '#454545' }}
                    onClick={() => handleCancelWithReason('pinchadura')}
                  >
                    LLANTA PONCHADA
                  </Button>
                  <Button
                    h="50px"
                    bg="#3A3A3A"
                    color="#FFFFFF"
                    fontSize="11px"
                    fontWeight="900"
                    borderRadius="10px"
                    _hover={{ bg: '#454545' }}
                    onClick={() => handleCancelWithReason('trafico_pesado')}
                  >
                    TRÁFICO IMPOSIBLE
                  </Button>
                </SimpleGrid>
                <Button
                  variant="ghost"
                  color="#B0B0B0"
                  fontSize="12px"
                  fontWeight="900"
                  onClick={() => setCancelStep('confirm')}
                >
                  ← VOLVER
                </Button>
              </VStack>
            )}
          </Box>
        </>
      )}

      {/* ==================== MODO IDLE (SIN NAVEGACIÓN) ==================== */}
      {!isNavigating && (
        <>
          {/* -- Barra superior compacta -- */}
          <Box
            position="absolute"
            top="16px"
            left="16px"
            right="16px"
            bg="#2C2C2C"
            borderRadius="16px"
            px="16px"
            py="10px"
            zIndex={10}
            boxShadow="0 4px 16px rgba(0,0,0,0.45)"
          >
            <Flex align="center" justify="space-between" gap="12px">
              <HStack spacing="10px" minW={0} flex={1}>
                <Box w="10px" h="10px" borderRadius="full" bg={wsDotColor} flexShrink={0} />
                <Box minW={0} flex={1}>
                  <Text
                    color="#FFFFFF"
                    fontSize="15px"
                    fontWeight="900"
                    letterSpacing="0.3px"
                    lineHeight="1.15"
                    noOfLines={1}
                  >
                    {ambulancia.id}
                  </Text>
                  <Text
                    color="#B0B0B0"
                    fontSize="10px"
                    fontWeight="700"
                    letterSpacing="0.4px"
                    lineHeight="1.15"
                    noOfLines={1}
                  >
                    {ambulancia.tipo}
                  </Text>
                </Box>
              </HStack>

              <HStack spacing="6px" flexShrink={0}>
                <Select
                  value={ambulanceStatus}
                  onChange={(e) => changeStatus(e.target.value)}
                  bg="#1E1E1E"
                  border="1px solid #3f3f46"
                  color={currentStatusOpt.color}
                  borderRadius="10px"
                  h="34px"
                  fontSize="11px"
                  fontWeight="900"
                  w="108px"
                  _focus={{ boxShadow: 'none' }}
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s.value} value={s.value} style={{ background: '#1E1E1E', color: s.color }}>
                      {s.label}
                    </option>
                  ))}
                </Select>
                <IconButton
                  aria-label="Cerrar sesión"
                  icon={<FaSignOutAlt />}
                  onClick={() => confirmAction(() => {
                    if (wsRef.current) wsRef.current.close();
                    clearAmbulance(); setAmbulancia(null);
                  }, 'FINALIZAR TURNO', '¿Desconectar unidad?')}
                  bg="transparent"
                  color="#B0B0B0"
                  borderRadius="10px"
                  w="34px"
                  h="34px"
                  minW="34px"
                  fontSize="14px"
                  _hover={{ bg: 'rgba(239,68,68,0.2)', color: '#ef4444' }}
                />
              </HStack>
            </Flex>
          </Box>

          {/* -- Controles laterales flotantes -- */}
          {!isDrawerOpen && (
            <VStack
              position="absolute"
              right="16px"
              top="88px"
              spacing="12px"
              zIndex={5}
            >
              <IconButton
                aria-label="Centrar GPS"
                icon={<MdCenterFocusStrong />}
                onClick={centerMapAction}
                w="48px"
                h="48px"
                minW="48px"
                borderRadius="full"
                bg="#2C2C2C"
                color={isFollowing ? '#0ea5e9' : '#FFFFFF'}
                fontSize="22px"
                boxShadow="0 4px 14px rgba(0,0,0,0.5)"
                _hover={{ bg: '#3A3A3A' }}
              />
              <IconButton
                aria-label="Alternar vista"
                icon={isGpsMode ? <FaMap /> : <FaLocationArrow />}
                onClick={toggleCameraAction}
                w="48px"
                h="48px"
                minW="48px"
                borderRadius="full"
                bg="#2C2C2C"
                color={isGpsMode ? '#0ea5e9' : '#FFFFFF'}
                fontSize="18px"
                boxShadow="0 4px 14px rgba(0,0,0,0.5)"
                _hover={{ bg: '#3A3A3A' }}
              />
            </VStack>
          )}

          {/* -- Botón inferior de emergencia -- */}
          {!isDrawerOpen && (
            <Box
              position="absolute"
              bottom="20px"
              left="16px"
              right="16px"
              zIndex={10}
            >
              <Button
                w="100%"
                h="68px"
                bg="#ef4444"
                color="#FFFFFF"
                fontSize="17px"
                fontWeight="900"
                letterSpacing="1px"
                borderRadius="18px"
                boxShadow="0 8px 24px rgba(239,68,68,0.4)"
                _hover={{ bg: '#dc2626' }}
                _active={{ bg: '#b91c1c' }}
                onClick={() => { setDrawerMode('operator-emergency'); onDrawerOpen(); }}
              >
                <Icon as={FaAmbulance} mr="12px" boxSize="20px" />
                NUEVA EMERGENCIA
              </Button>
            </Box>
          )}
        </>
      )}

      {/* ==================== DRAWER DE PROTOCOLO ==================== */}
      <Drawer isOpen={isDrawerOpen} placement="bottom" onClose={onDrawerClose} size="full">
        <DrawerOverlay backdropFilter="blur(5px)" bg="rgba(0,0,0,0.6)" />
        <DrawerContent
          bg="#1E1E1E"
          borderTopRadius="20px"
          h="85vh"
          mt="15vh"
          borderTop="1px solid #2C2C2C"
          zIndex={1400}
        >
          <Flex justify="center" pt="10px" pb="4px" onClick={onDrawerClose} cursor="pointer">
            <Box w="50px" h="5px" bg="#3f3f46" borderRadius="full" />
          </Flex>

          <DrawerHeader
            bg="#1E1E1E"
            py="6px"
            px="20px"
            display="flex"
            justifyContent="space-between"
            alignItems="center"
          >
            <Text fontSize="18px" fontWeight="900" color="#FFFFFF" letterSpacing="0.5px">
              {drawerMode === 'operator-emergency' ? 'NUEVA EMERGENCIA' : 'PROTOCOLO'}
            </Text>
            <IconButton
              aria-label="Cerrar"
              icon={<FaTimes />}
              variant="ghost"
              color="#ef4444"
              fontSize="20px"
              onClick={onDrawerClose}
            />
          </DrawerHeader>

          <DrawerBody p="16px" bg="#1E1E1E" overflowY="auto">
            {drawerMode === 'operator-emergency' && (
              <VStack spacing="16px" align="stretch" pb="120px">
                {/* -- Cantidad de pacientes -- */}
                <Box bg="#2C2C2C" p="16px" borderRadius="16px" border="1px solid #3f3f46">
                  <Text fontSize="11px" fontWeight="900" color="#B0B0B0" mb="12px" letterSpacing="0.5px">
                    1. CANTIDAD DE PACIENTES
                  </Text>
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
                      w="56px"
                      h="56px"
                      minW="56px"
                      bg="#3A3A3A"
                      color="#FFFFFF"
                      fontSize="18px"
                      borderRadius="12px"
                      _hover={{ bg: '#454545' }}
                      isDisabled={operatorPatientData.cantidad <= 1}
                    />
                    <Flex
                      flex={1}
                      bg="#1E1E1E"
                      h="56px"
                      border="2px solid #3f3f46"
                      borderRadius="12px"
                      align="center"
                      justify="center"
                    >
                      <Text fontSize="26px" fontWeight="900" color="#FFFFFF">
                        {operatorPatientData.cantidad}
                      </Text>
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
                      w="56px"
                      h="56px"
                      minW="56px"
                      bg="#3A3A3A"
                      color="#FFFFFF"
                      fontSize="18px"
                      borderRadius="12px"
                      _hover={{ bg: '#454545' }}
                    />
                  </HStack>
                </Box>

                {/* -- Datos de pacientes -- */}
                <Box bg="#2C2C2C" p="16px" borderRadius="16px" border="1px solid #3f3f46">
                  <Text fontSize="11px" fontWeight="900" color="#B0B0B0" mb="12px" letterSpacing="0.5px">
                    2. DATOS DE PACIENTES
                  </Text>
                  <VStack spacing="12px" align="stretch">
                    {operatorPatientData.pacientes.slice(0, operatorPatientData.cantidad).map((p, idx) => (
                      <Box key={idx} bg="#1E1E1E" p="14px" borderRadius="12px" border="1px solid #3f3f46">
                        <Text fontSize="12px" fontWeight="900" color="#4CAF50" mb="10px">
                          PACIENTE {idx + 1}
                        </Text>
                        <SimpleGrid columns={2} spacing="10px">
                          <Select
                            value={p.sexo}
                            onChange={(e) => setOperatorPatientData(prev => {
                              const copy = [...prev.pacientes];
                              copy[idx] = { ...copy[idx], sexo: e.target.value };
                              return { ...prev, pacientes: copy };
                            })}
                            placeholder="Sexo"
                            bg="#2C2C2C"
                            borderColor="#3f3f46"
                            color="#FFFFFF"
                            size="lg"
                            borderRadius="10px"
                          >
                            <option value="Hombre" style={{ background: '#2C2C2C' }}>Hombre</option>
                            <option value="Mujer" style={{ background: '#2C2C2C' }}>Mujer</option>
                            <option value="N/S" style={{ background: '#2C2C2C' }}>No se sabe</option>
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
                            bg="#2C2C2C"
                            border="2px solid #3f3f46"
                            color="#FFFFFF"
                            size="lg"
                            borderRadius="10px"
                          />
                          <Select
                            value={p.consciente}
                            onChange={(e) => setOperatorPatientData(prev => {
                              const copy = [...prev.pacientes];
                              copy[idx] = { ...copy[idx], consciente: e.target.value };
                              return { ...prev, pacientes: copy };
                            })}
                            placeholder="Conciencia"
                            bg="#2C2C2C"
                            borderColor="#3f3f46"
                            color="#FFFFFF"
                            size="lg"
                            borderRadius="10px"
                          >
                            <option value="Sí" style={{ background: '#2C2C2C' }}>Consciente</option>
                            <option value="No" style={{ background: '#2C2C2C' }}>Inconsciente</option>
                            <option value="N/S" style={{ background: '#2C2C2C' }}>No se sabe</option>
                          </Select>
                          <Select
                            value={p.respira}
                            onChange={(e) => setOperatorPatientData(prev => {
                              const copy = [...prev.pacientes];
                              copy[idx] = { ...copy[idx], respira: e.target.value };
                              return { ...prev, pacientes: copy };
                            })}
                            placeholder="Respira"
                            bg="#2C2C2C"
                            borderColor="#3f3f46"
                            color="#FFFFFF"
                            size="lg"
                            borderRadius="10px"
                          >
                            <option value="Sí" style={{ background: '#2C2C2C' }}>Respira</option>
                            <option value="No" style={{ background: '#2C2C2C' }}>No respira</option>
                            <option value="N/S" style={{ background: '#2C2C2C' }}>No se sabe</option>
                          </Select>
                          <Select
                            value={p.sangrado}
                            onChange={(e) => setOperatorPatientData(prev => {
                              const copy = [...prev.pacientes];
                              copy[idx] = { ...copy[idx], sangrado: e.target.value };
                              return { ...prev, pacientes: copy };
                            })}
                            placeholder="Sangrado"
                            bg="#2C2C2C"
                            borderColor="#3f3f46"
                            color="#FFFFFF"
                            size="lg"
                            borderRadius="10px"
                          >
                            <option value="Sí" style={{ background: '#2C2C2C' }}>Sangrado</option>
                            <option value="No" style={{ background: '#2C2C2C' }}>Sin sangrado</option>
                            <option value="N/S" style={{ background: '#2C2C2C' }}>No se sabe</option>
                          </Select>
                          <Select
                            value={p.atrapado}
                            onChange={(e) => setOperatorPatientData(prev => {
                              const copy = [...prev.pacientes];
                              copy[idx] = { ...copy[idx], atrapado: e.target.value };
                              return { ...prev, pacientes: copy };
                            })}
                            placeholder="Atrapado"
                            bg="#2C2C2C"
                            borderColor="#3f3f46"
                            color="#FFFFFF"
                            size="lg"
                            borderRadius="10px"
                          >
                            <option value="Sí" style={{ background: '#2C2C2C' }}>Atrapado</option>
                            <option value="No" style={{ background: '#2C2C2C' }}>No atrapado</option>
                          </Select>
                        </SimpleGrid>
                      </Box>
                    ))}
                  </VStack>
                </Box>

                {/* -- Impresión diagnóstica -- */}
                <Box bg="#2C2C2C" p="16px" borderRadius="16px" border="1px solid #3f3f46">
                  <Text fontSize="11px" fontWeight="900" color="#B0B0B0" mb="12px" letterSpacing="0.5px">
                    3. IMPRESIÓN DIAGNÓSTICA
                  </Text>
                  <Select
                    value={operatorPatientData.diagnostico}
                    onChange={(e) => setOperatorPatientData(prev => ({ ...prev, diagnostico: e.target.value }))}
                    h="56px"
                    fontSize="15px"
                    fontWeight="900"
                    bg="#1E1E1E"
                    color="#FFFFFF"
                    border="2px solid #3f3f46"
                    borderRadius="10px"
                  >
                    {DIAGNOSTICOS_RAPIDOS.map(d => (
                      <option key={d} value={d} style={{ background: '#1E1E1E' }}>{d}</option>
                    ))}
                  </Select>
                </Box>

                {/* -- Notas adicionales -- */}
                <Box bg="#2C2C2C" p="16px" borderRadius="16px" border="1px solid #3f3f46">
                  <Text fontSize="11px" fontWeight="900" color="#B0B0B0" mb="12px" letterSpacing="0.5px">
                    4. NOTAS ADICIONALES
                  </Text>
                  <Input
                    value={operatorPatientData.notas}
                    onChange={(e) => setOperatorPatientData(prev => ({ ...prev, notas: e.target.value }))}
                    placeholder="Observaciones breves..."
                    bg="#1E1E1E"
                    border="2px solid #3f3f46"
                    color="#FFFFFF"
                    h="56px"
                    fontSize="15px"
                    borderRadius="10px"
                  />
                </Box>
              </VStack>
            )}
          </DrawerBody>

          {drawerMode === 'operator-emergency' && (
            <DrawerFooter
              bg="#2C2C2C"
              borderTop="1px solid #3f3f46"
              p="16px"
              position="absolute"
              bottom={0}
              w="100%"
            >
              <Button
                w="100%"
                h="64px"
                bg="#ef4444"
                color="#FFFFFF"
                fontSize="17px"
                fontWeight="900"
                letterSpacing="1px"
                borderRadius="16px"
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

      {/* ==================== MODAL DE OFERTA ==================== */}
      <Modal isOpen={!!pendingOffer} onClose={() => {}} size="xl" isCentered closeOnOverlayClick={false} closeOnEsc={false}>
        <ModalOverlay bg="rgba(0,0,0,0.92)" backdropFilter="blur(8px)" />
        <ModalContent bg="#1E1E1E" border="3px solid #ef4444" borderRadius="20px" overflow="hidden" mx="16px">
          <Box bg="#ef4444" py="16px" textAlign="center">
            <HStack justify="center" spacing="12px">
              <Icon as={FaAmbulance} boxSize="28px" color="#FFFFFF" />
              <Text fontSize="20px" fontWeight="900" color="#FFFFFF" letterSpacing="2px">
                {pendingOffer?.isStandby ? 'EMERGENCIA — STANDBY' : 'NUEVA EMERGENCIA'}
              </Text>
            </HStack>
          </Box>

          <ModalBody p="20px">
            <Box mb="16px">
              <HStack justify="space-between" mb="6px">
                <Text fontSize="11px" fontWeight="900" color="#B0B0B0" letterSpacing="1px">
                  TIEMPO PARA RESPONDER
                </Text>
                <Text fontSize="20px" fontWeight="900" color={offerTimeLeft <= 5 ? '#ef4444' : '#f59e0b'}>
                  {offerTimeLeft}s
                </Text>
              </HStack>
              <Progress
                value={(offerTimeLeft / 20) * 100}
                h="8px"
                borderRadius="full"
                bg="#2C2C2C"
                sx={{
                  '& > div': {
                    background: offerTimeLeft <= 5 ? '#ef4444' : '#f59e0b',
                    transition: 'width 1s linear'
                  }
                }}
              />
            </Box>

            {pendingOffer?.isStandby && (
              <Box bg="rgba(245,158,11,0.15)" p="10px" borderRadius="10px" border="1px solid #f59e0b" mb="14px">
                <Text fontSize="11px" fontWeight="900" color="#f59e0b" letterSpacing="0.5px" textAlign="center">
                  ESTÁS FUERA DE SERVICIO. Si ACEPTAS, tu unidad cambiará a EN RUTA.
                </Text>
              </Box>
            )}

            <Box bg="#2C2C2C" p="16px" borderRadius="14px" border="1px solid #3f3f46" mb="14px">
              <Text fontSize="11px" fontWeight="900" color="#B0B0B0" mb="4px" letterSpacing="1px">
                TIPO DE EMERGENCIA
              </Text>
              <Text fontSize="22px" fontWeight="900" color="#FFFFFF" lineHeight="1.1">
                {pendingOffer?.emergencyType || 'No especificado'}
              </Text>
            </Box>

            <Box bg="#2C2C2C" p="16px" borderRadius="14px" border="1px solid #3f3f46" mb="14px">
              <Text fontSize="11px" fontWeight="900" color="#B0B0B0" mb="4px" letterSpacing="1px">
                DIRECCIÓN
              </Text>
              <Text fontSize="16px" fontWeight="800" color="#FFFFFF" mb="8px">
                {pendingOffer?.address || 'Sin dirección'}
              </Text>
              {pendingOffer?.distanceKm != null && (
                <Badge bg="#0ea5e9" color="#FFFFFF" px="10px" py="4px" borderRadius="8px" fontSize="13px" fontWeight="900">
                  DISTANCIA: {fmtDist(pendingOffer.distanceKm)}
                </Badge>
              )}
            </Box>

            {pendingOffer?.patientInfo && Object.keys(pendingOffer.patientInfo).length > 0 && (
              <Box bg="#2C2C2C" p="16px" borderRadius="14px" border="1px solid #3f3f46" mb="14px">
                <Text fontSize="11px" fontWeight="900" color="#B0B0B0" mb="10px" letterSpacing="1px">
                  INFO DEL PACIENTE
                </Text>
                <SimpleGrid columns={2} spacing="10px">
                  {pendingOffer.patientInfo.sexo && (
                    <Text fontSize="13px" fontWeight="800" color="#FFFFFF">SEXO: {pendingOffer.patientInfo.sexo}</Text>
                  )}
                  {pendingOffer.patientInfo.edad && (
                    <Text fontSize="13px" fontWeight="800" color="#FFFFFF">EDAD: {pendingOffer.patientInfo.edad}</Text>
                  )}
                  {pendingOffer.patientInfo.lesionados && (
                    <Text fontSize="13px" fontWeight="800" color="#FFFFFF">LESIONADOS: {pendingOffer.patientInfo.lesionados}</Text>
                  )}
                  {pendingOffer.patientInfo.consciente && (
                    <Text fontSize="13px" fontWeight="800" color="#FFFFFF">CONSCIENTE: {pendingOffer.patientInfo.consciente}</Text>
                  )}
                </SimpleGrid>
              </Box>
            )}
          </ModalBody>

          <ModalFooter p="16px" bg="#1E1E1E" borderTop="1px solid #2C2C2C">
            {!offerRejecting ? (
              <HStack w="100%" spacing="12px">
                <Button
                  flex={1}
                  h="72px"
                  bg="#2C2C2C"
                  color="#ef4444"
                  border="2px solid #ef4444"
                  fontSize="16px"
                  fontWeight="900"
                  borderRadius="16px"
                  _hover={{ bg: '#3A3A3A' }}
                  onClick={() => setOfferRejecting(true)}
                >
                  RECHAZAR
                </Button>
                <Button
                  flex={1.5}
                  h="72px"
                  bg="#10b981"
                  color="#FFFFFF"
                  fontSize="20px"
                  fontWeight="900"
                  letterSpacing="1px"
                  borderRadius="16px"
                  _hover={{ bg: '#059669' }}
                  onClick={acceptOffer}
                  boxShadow="0 8px 18px rgba(16,185,129,0.3)"
                >
                  ACEPTAR
                </Button>
              </HStack>
            ) : (
              <VStack w="100%" spacing="10px">
                <Text fontSize="13px" fontWeight="900" color="#ef4444" letterSpacing="1px">
                  MOTIVO DE RECHAZO
                </Text>
                <SimpleGrid columns={2} spacing="8px" w="100%">
                  <Button h="56px" bg="#2C2C2C" color="#FFFFFF" fontSize="12px" fontWeight="900" borderRadius="12px"
                    _hover={{ bg: '#3A3A3A' }} onClick={() => rejectOffer('Sin combustible')}>
                    SIN COMBUSTIBLE
                  </Button>
                  <Button h="56px" bg="#2C2C2C" color="#FFFFFF" fontSize="12px" fontWeight="900" borderRadius="12px"
                    _hover={{ bg: '#3A3A3A' }} onClick={() => rejectOffer('Problema mecánico')}>
                    PROBLEMA MECÁNICO
                  </Button>
                  <Button h="56px" bg="#2C2C2C" color="#FFFFFF" fontSize="12px" fontWeight="900" borderRadius="12px"
                    _hover={{ bg: '#3A3A3A' }} onClick={() => rejectOffer('Otra asignación')}>
                    OTRA ASIGNACIÓN
                  </Button>
                  <Button h="56px" bg="#2C2C2C" color="#FFFFFF" fontSize="12px" fontWeight="900" borderRadius="12px"
                    _hover={{ bg: '#3A3A3A' }} onClick={() => rejectOffer('No especificado')}>
                    OTRO
                  </Button>
                </SimpleGrid>
                <Button variant="ghost" color="#B0B0B0" fontSize="13px" fontWeight="900" onClick={() => setOfferRejecting(false)}>
                  ← VOLVER
                </Button>
              </VStack>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ==================== ALERTA DE CONFIRMACIÓN ==================== */}
      <Modal isOpen={isAlertOpen} onClose={onAlertClose} isCentered blockScrollOnMount={false} trapFocus={false}>
        <ModalOverlay bg="rgba(0,0,0,0.7)" backdropFilter="blur(3px)" />
        <ModalContent bg="#1E1E1E" border="2px solid #ef4444" borderRadius="20px" p="16px" mx="16px">
          <ModalHeader color="#ef4444" fontWeight="900" fontSize="18px" textAlign="center" pb="4px">
            {pendingAction?.title}
          </ModalHeader>
          <ModalBody color="#FFFFFF" fontSize="15px" textAlign="center" fontWeight="800" py="10px">
            {pendingAction?.body}
          </ModalBody>
          <ModalFooter mt="12px" gap="12px" display="flex" p={0}>
            <Button
              flex={1}
              h="52px"
              bg="#2C2C2C"
              color="#FFFFFF"
              fontSize="15px"
              fontWeight="900"
              borderRadius="12px"
              _hover={{ bg: '#3A3A3A' }}
              onClick={onAlertClose}
            >
              VOLVER
            </Button>
            <Button
              flex={1}
              h="52px"
              bg="#ef4444"
              color="#FFFFFF"
              fontSize="15px"
              fontWeight="900"
              borderRadius="12px"
              _hover={{ bg: '#dc2626' }}
              onClick={executeConfirmed}
            >
              CONFIRMAR
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

// ==================== REGISTRO INICIAL ====================
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
      <ModalContent bg="#1E1E1E" border="2px solid #0ea5e9" borderRadius="20px" p="16px" mx="16px">
        <ModalHeader textAlign="center">
          <Icon as={FaAmbulance} color="#0ea5e9" boxSize="40px" mb="8px" />
          <Text color="#FFFFFF" fontWeight="900" fontSize="18px">SISTEMA TÁCTICO MÓVIL</Text>
        </ModalHeader>
        <ModalBody py="8px">
          <VStack spacing="16px">
            <FormControl>
              <FormLabel color="#B0B0B0" fontWeight="900" fontSize="11px">ID OPERATIVO *</FormLabel>
              <Input
                bg="#2C2C2C"
                border="2px solid #3f3f46"
                color="#FFFFFF"
                h="50px"
                fontSize="17px"
                fontWeight="900"
                textAlign="center"
                textTransform="uppercase"
                borderRadius="12px"
                value={form.id}
                onChange={e => setForm(p => ({ ...p, id: e.target.value }))}
              />
            </FormControl>
            <FormControl>
              <FormLabel color="#B0B0B0" fontWeight="900" fontSize="11px">PLACA *</FormLabel>
              <Input
                bg="#2C2C2C"
                border="2px solid #3f3f46"
                color="#FFFFFF"
                h="50px"
                fontSize="17px"
                fontWeight="900"
                textAlign="center"
                textTransform="uppercase"
                borderRadius="12px"
                value={form.placa}
                onChange={e => setForm(p => ({ ...p, placa: e.target.value }))}
              />
            </FormControl>
            <FormControl>
              <FormLabel color="#B0B0B0" fontWeight="900" fontSize="11px">NOMBRE BASE *</FormLabel>
              <Input
                bg="#2C2C2C"
                border="2px solid #3f3f46"
                color="#FFFFFF"
                h="50px"
                fontSize="15px"
                fontWeight="900"
                textAlign="center"
                borderRadius="12px"
                value={form.nombre}
                onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
              />
            </FormControl>
            <FormControl>
              <FormLabel color="#B0B0B0" fontWeight="900" fontSize="11px">TIPO DE UNIDAD</FormLabel>
              <Select
                bg="#2C2C2C"
                border="2px solid #3f3f46"
                color="#FFFFFF"
                h="50px"
                fontSize="14px"
                fontWeight="900"
                borderRadius="12px"
                value={form.tipo}
                onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}
              >
                {TIPOS_AMBULANCIA.map(t => (
                  <option key={t} value={t} style={{ background: '#1E1E1E' }}>{t}</option>
                ))}
              </Select>
            </FormControl>
            {error && (
              <Text color="#ef4444" fontWeight="900" fontSize="12px" textAlign="center">
                {error}
              </Text>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button
            w="100%"
            h="56px"
            bg="#0ea5e9"
            color="#FFFFFF"
            fontSize="15px"
            fontWeight="900"
            borderRadius="14px"
            _hover={{ bg: '#0284c7' }}
            onClick={handleSubmit}
          >
            VINCULAR SISTEMA
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};