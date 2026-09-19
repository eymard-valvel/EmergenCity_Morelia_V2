import React, { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/useAuth.js";
import { deleteCookie } from "../../helpers/cookies.js";
import {
  ChakraProvider, Box, Button, VStack, Text, HStack, Badge, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalBody, ModalFooter, useDisclosure, Alert, AlertIcon, AlertTitle, AlertDescription, 
  useToast, Card, CardBody, Progress, Input, Select, Spinner, SimpleGrid, Divider, Tag, 
  useMediaQuery, IconButton, Flex, ButtonGroup, Tooltip, Icon, Drawer, DrawerBody, DrawerHeader, DrawerOverlay, DrawerContent, DrawerCloseButton
} from "@chakra-ui/react";
import { 
  FaUserMd, FaBed, FaAmbulance, FaMapMarkerAlt, FaVideo, FaExclamationTriangle, 
  FaCheckCircle, FaTimes, FaFolderOpen, FaBolt, FaStethoscope, FaHeartbeat, FaRoute, FaPlus, FaMinus, FaSignOutAlt, FaFilePdf, FaHistory
} from "react-icons/fa";
import { FiActivity, FiWifiOff } from "react-icons/fi";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoiZXltYXJkMjkiLCJhIjoiY21tcDY4YzNpMGw3bjJzb203YmZyNTVnMyJ9.OvZlnCMfUkUYe6Ib83DUVw';

// ---------- ESTILOS GLOBALES (MODO OSCURO Y ANIMACIONES) ----------
const styleInject = document.createElement('style');
styleInject.textContent = `
  @keyframes pulseGreen { 
    0%, 100% { transform: scale(1); opacity: 1; box-shadow: 0 0 15px rgba(16,185,129,0.4); } 
    50% { transform: scale(1.05); opacity: 0.8; box-shadow: 0 0 30px rgba(16,185,129,0.8); } 
  }
  @keyframes pulseRed { 
    0%, 100% { transform: scale(1); box-shadow: 0 0 15px rgba(220,38,38,0.4); } 
    50% { transform: scale(1.05); box-shadow: 0 0 30px rgba(220,38,38,0.8); } 
  }
  .glass-dark { 
    background: rgba(9, 9, 11, 0.85) !important; 
    backdrop-filter: blur(12px) !important; 
    -webkit-backdrop-filter: blur(12px) !important;
    border: 1px solid rgba(63, 63, 70, 0.5) !important; 
    border-radius: 12px !important; 
  }
  .mapboxgl-popup-content { 
    background-color: #18181b !important; 
    color: #f8fafc !important; 
    border: 1px solid #3f3f46 !important; 
    border-radius: 8px !important; 
    box-shadow: 0 10px 25px rgba(0,0,0,0.5) !important; 
    padding: 15px !important;
  }
  .mapboxgl-popup-anchor-bottom .mapboxgl-popup-tip { border-top-color: #3f3f46 !important; }
  
  ::-webkit-scrollbar { width: 8px; }
  ::-webkit-scrollbar-track { background: #09090b; }
  ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #52525b; }
`;
document.head.appendChild(styleInject);

const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API) {
    return import.meta.env.VITE_API.replace(/\/+$/, "");
  }
  const wsUrl = import.meta.env.VITE_WS_URL || 'wss://emergencity-morelia-v2.onrender.com';
  try {
    const url = new URL(wsUrl);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.pathname = url.pathname.replace('/ws', '');
    return url.origin;
  } catch (e) {
    return 'https://emergencity-morelia-v2.onrender.com';
  }
};

const clasificarEspecialidad = (motivo) => {
  const str = (motivo || '').toLowerCase();
  if (str.includes('torácico') || str.includes('infarto') || str.includes('cardio') || str.includes('paro') || str.includes('taquicardia')) return 'Cardiología';
  if (str.includes('fractura') || str.includes('caída') || str.includes('trauma') || str.includes('accidente') || str.includes('choque')) return 'Traumatología';
  if (str.includes('convulsiones') || str.includes('acv') || str.includes('cerebral') || str.includes('derrame')) return 'Neurología';
  if (str.includes('quemaduras')) return 'Cirugía Plástica';
  if (str.includes('intoxicación') || str.includes('veneno')) return 'Toxicología';
  if (str.includes('respiratoria') || str.includes('asfixia') || str.includes('epoc')) return 'Neumología';
  if (str.includes('parto') || str.includes('embarazo') || str.includes('sangrado transvaginal')) return 'Ginecología';
  return 'Urgencias Médicas';
};

const RESPUESTAS_RAPIDAS = [
  "✅ QUIRÓFANO PREPARADO", 
  "🚑 RAMPA DE URGENCIAS DESPEJADA", 
  "🩺 EQUIPO DE TRAUMA LISTO", 
  "⚡ PASAR DIRECTO A SALA DE CHOQUE", 
  "📁 TRAER EXPEDIENTE CLÍNICO PREVIO", 
  "🚪 ESPERANDO EN PUERTA PRINCIPAL"
];

export default function MapaHospitalOptimizado() {
  const navigate = useNavigate();
  const { setAuth } = useAuth();

  // Función de cierre de sesión basada en la estructura del Header provisto
  const closeSession = () => {
    deleteCookie("role");
    setAuth(false);
    navigate("/login");
  };

  const mapContainer = useRef(null);
  const map = useRef(null);
  const ws = useRef(null);
  const hospitalMarker = useRef(null);
  const ambulanceMarkers = useRef({});
  const routeLayersByAmbulance = useRef({});
  const routeSourcesByAmbulance = useRef({});
  const reconnectTimeout = useRef(null);
  const connectionAttempts = useRef(0);
  const maxConnectionAttempts = 5;
  const isMounted = useRef(true);
  const reportRef = useRef(null);

  const [isMobile] = useMediaQuery("(max-width: 768px)");
  const [isTablet] = useMediaQuery("(max-width: 1024px) and (min-width: 769px)");
  const sidebarWidth = isMobile ? "100%" : isTablet ? "400px" : "480px";

  const [hospitalInfo, setHospitalInfo] = useState(null);
  const [ambulances, setAmbulances] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [activeRoutes, setActiveRoutes] = useState([]); 
  const [trafficEnabled, setTrafficEnabled] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [camasDisponibles, setCamasDisponibles] = useState(0);

  // Estados de expedientes guardados en historial local de sesión
  const [historialExpedientes, setHistorialExpedientes] = useState([]);

  const [patientNotifications, setPatientNotifications] = useState([]);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [selectedAmbulance, setSelectedAmbulance] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [doctorSeleccionado, setDoctorSeleccionado] = useState("");
  const [listaDoctores, setListaDoctores] = useState([]);
  const [confirmReject, setConfirmReject] = useState(false);

  const { isOpen: isNoteOpen, onOpen: onNoteOpen, onClose: onNoteClose } = useDisclosure();
  const { isOpen: isNotificationOpen, onOpen: onNotificationOpen, onClose: onNotificationClose } = useDisclosure();
  const { isOpen: isReportModalOpen, onOpen: onReportModalOpen, onClose: onReportModalClose } = useDisclosure();
  
  // Drawer de Expedientes
  const { isOpen: isExpedientesOpen, onOpen: onExpedientesOpen, onClose: onExpedientesClose } = useDisclosure();

  const toast = useToast();
  const apiBaseUrl = getApiBaseUrl();

  const geocodeAddressDirect = async (address) => {
    if (!address || address.trim() === '') return null;
    setIsGeocoding(true);
    const cleanAddress = address.trim();

    try {
      const query = `${cleanAddress}, Morelia, Michoacán, México`;
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxgl.accessToken}&country=mx&types=address&limit=1&language=es`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (data.features && data.features.length > 0) {
          const feature = data.features[0];
          return { lat: feature.center[1], lng: feature.center[0], place_name: feature.place_name };
        }
      }
    } catch (error) { console.warn('⚠️ Falló Mapbox Geocoding:', error); }

    try {
      const nominatimQuery = `${cleanAddress}, Morelia, Michoacán, México`;
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(nominatimQuery)}&limit=1&countrycodes=mx`;
      const response = await fetch(url, { headers: { 'User-Agent': 'EmergenCity/1.0' } });
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), place_name: data[0].display_name };
        }
      }
    } catch (error) { console.warn('⚠️ Falló Nominatim Geocoding:', error); }

    setIsGeocoding(false);
    return null;
  };

  useEffect(() => {
    isMounted.current = true;
    const loadHospitalData = async () => {
      try {
        const stored = JSON.parse(localStorage.getItem("hospitalInfo") || "null");
        if (!stored || !stored.id) {
          showToast('error', 'Configuración Requerida', 'Complete la información del hospital en el sistema');
          return;
        }

        let hospitalData = {
          id: stored.id,
          nombre: stored.nombre || "Hospital Base",
          direccion: stored.direccion || "",
          lat: stored.lat,
          lng: stored.lng,
          especialidades: stored.especialidades || ['General'],
          camasDisponibles: stored.camasDisponibles || 10,
          telefono: stored.telefono || ''
        };

        if (hospitalData.direccion && (!hospitalData.lat || !hospitalData.lng)) {
          showToast('info', 'Geocodificando', 'Buscando coordenadas exactas del hospital...');
          const geoResult = await geocodeAddressDirect(hospitalData.direccion);
          setIsGeocoding(false);
          if (geoResult) {
            hospitalData.lat = geoResult.lat;
            hospitalData.lng = geoResult.lng;
            localStorage.setItem("hospitalInfo", JSON.stringify({ ...stored, lat: geoResult.lat, lng: geoResult.lng }));
          } else {
            hospitalData.lat = 19.7024;
            hospitalData.lng = -101.1969;
          }
        }

        if (isMounted.current) {
          setHospitalInfo(hospitalData);
          setCamasDisponibles(hospitalData.camasDisponibles);
          showToast('success', 'Hospital Configurado', hospitalData.nombre);
        }
      } catch (error) {
        console.error('❌ Error cargando datos del hospital:', error);
        showToast('error', 'Error de Configuración', 'No se pudieron cargar los datos del hospital');
      }
    };
    loadHospitalData();
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    const cargarDoctores = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/doctor`);
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) setListaDoctores(data);
        }
      } catch (error) { console.warn("Aviso: No se pudo conectar al endpoint de doctores, usando respaldo vacío.", error); }
    };
    cargarDoctores();
  }, [apiBaseUrl]);

  const connectWebSocket = useCallback(() => {
    if (!isMounted.current || isConnecting || connectionAttempts.current >= maxConnectionAttempts) return;
    try {
      if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) return;

      setIsConnecting(true);
      connectionAttempts.current += 1;
      ws.current = new WebSocket(import.meta.env.VITE_WS_URL);

      ws.current.onopen = () => {
        if (!isMounted.current) return;
        setWsConnected(true);
        setIsConnecting(false);
        connectionAttempts.current = 0;
        if (hospitalInfo) registerHospital();
        showToast('success', 'Sistema Conectado', 'Hospital conectado al servidor central');
      };

      ws.current.onmessage = (event) => {
        if (!isMounted.current) return;
        try {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case 'connection_established': break;
            case 'active_ambulances_update':
              setAmbulances(data.ambulances || []);
              updateAmbulanceMarkers(data.ambulances || []);
              break;
            case 'location_update':
              handleAmbulanceLocationUpdate(data);
              break;
            case 'patient_transfer_notification':
              handlePatientTransferNotification(data);
              break;
            case 'route_updated':
              handleRouteUpdated(data);
              break;
            case 'active_routes_update':
              if (data.routes && data.routes.length > 0) data.routes.forEach(route => handleRouteUpdated(route));
              break;
            case 'recepcion_reporte_paciente':
              procesarReporteMedico(data.reporte);
              break;
            case 'navigation_cancelled':
              handleNavigationCancelled(data);
              break;
            case 'patient_accepted':
              if (data.hospitalId === hospitalInfo?.id) {
                setPatientNotifications(prev => prev.filter(n => n.notificationId !== data.notificationId));
                showToast('success', 'Paciente Aceptado', 'Traslado confirmado - Preparar recepción');
              }
              break;
            case 'patient_rejected':
              if (data.hospitalId === hospitalInfo?.id) {
                setPatientNotifications(prev => prev.filter(n => n.notificationId !== data.notificationId));
                clearAmbulanceRoute(data.ambulanceId);
                showToast('warning', 'Paciente Rechazado', 'Se ha notificado a la ambulancia');
              }
              break;
            case 'error':
              showToast('error', 'Error del Sistema', data.message);
              break;
          }
        } catch (error) { console.error('❌ Error procesando mensaje:', error); }
      };

      ws.current.onclose = (event) => {
        if (!isMounted.current) return;
        setWsConnected(false);
        setIsConnecting(false);
        if (event.code !== 1000 && connectionAttempts.current < maxConnectionAttempts) {
          showToast('warning', 'Conexión Perdida', 'Reconectando automáticamente...');
          reconnectTimeout.current = setTimeout(() => connectWebSocket(), 5000);
        } else if (connectionAttempts.current >= maxConnectionAttempts) {
          showToast('error', 'Error Crítico', 'No se pudo reconectar al servidor');
        }
      };

      ws.current.onerror = () => {
        if (!isMounted.current) return;
        setWsConnected(false);
        setIsConnecting(false);
      };

    } catch (error) { setIsConnecting(false); }
  }, [hospitalInfo, isConnecting]);

  const registerHospital = useCallback(() => {
    if (!hospitalInfo || !ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    if (hospitalInfo.lat && hospitalInfo.lng) {
      ws.current.send(JSON.stringify({
        type: 'register_hospital',
        hospital: { ...hospitalInfo, camasDisponibles: camasDisponibles }
      }));
    }
  }, [hospitalInfo, camasDisponibles]);

  useEffect(() => {
    if (wsConnected && hospitalInfo) {
      registerHospital();
    }
  }, [camasDisponibles, wsConnected, hospitalInfo, registerHospital]);

  useEffect(() => {
    if (!hospitalInfo || !mapContainer.current) return;

    const mapInstance = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [hospitalInfo.lng, hospitalInfo.lat],
      zoom: 15,
      pitch: 45
    });

    mapInstance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    mapInstance.on('load', () => {
      map.current = mapInstance;
      placeHospitalMarker();
      if (trafficEnabled) addTrafficLayer();
      add3DBuildings();
    });

    return () => {
      cleanupMarkers();
      if (mapInstance) mapInstance.remove();
    };
  }, [hospitalInfo]);

  useEffect(() => {
    if (hospitalInfo) {
      const timeoutId = setTimeout(() => connectWebSocket(), 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [hospitalInfo, connectWebSocket]);

  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (ws.current) try { ws.current.close(1000); } catch (e) {}
    };
  }, []);

  const addTrafficLayer = () => {
    if (!map.current) return;
    try {
      if (!map.current.getSource('mapbox-traffic')) {
        map.current.addSource('mapbox-traffic', { type: 'vector', url: 'mapbox://mapbox.mapbox-traffic-v1' });
      }
      if (!map.current.getLayer('traffic-layer-hospital')) {
        map.current.addLayer({
          id: 'traffic-layer-hospital',
          type: 'line',
          source: 'mapbox-traffic',
          'source-layer': 'traffic',
          paint: {
            'line-color': ['case', ['==', ['get', 'congestion'], 'low'], '#10b981', ['==', ['get', 'congestion'], 'moderate'], '#f59e0b', ['==', ['get', 'congestion'], 'heavy'], '#ef4444', '#10b981'],
            'line-width': isMobile ? 3 : 4,
            'line-opacity': 0.8
          }
        }, 'waterway-label');
      }
    } catch (error) { console.warn('Error capa tráfico:', error); }
  };

  const add3DBuildings = () => {
    if (!map.current) return;
    try {
      const layers = map.current.getStyle().layers;
      const labelLayerId = layers.find(layer => layer.type === 'symbol' && layer.layout['text-field'])?.id;
      if (map.current.getSource('composite')) {
        map.current.addLayer({
          id: '3d-buildings-hospital',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 15,
          paint: {
            'fill-extrusion-color': '#27272a',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.7
          }
        }, labelLayerId);
      }
    } catch (error) { console.warn('Error edificios 3D:', error); }
  };

  const toggleTraffic = () => {
    if (!map.current) return;
    if (trafficEnabled) {
      if (map.current.getLayer('traffic-layer-hospital')) map.current.removeLayer('traffic-layer-hospital');
      setTrafficEnabled(false);
      showToast('info', 'Tráfico', 'Capa de tráfico desactivada');
    } else {
      addTrafficLayer();
      setTrafficEnabled(true);
      showToast('info', 'Tráfico', 'Capa de tráfico activada');
    }
  };

  const placeHospitalMarker = () => {
    if (!map.current || !hospitalInfo) return;
    try {
      if (hospitalMarker.current) hospitalMarker.current.remove();
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="width: 70px; height: 70px; background: #09090b; border: 4px solid #38bdf8; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 32px; box-shadow: 0 0 25px rgba(56,189,248,0.6); cursor: pointer; z-index: 10;">
          🏥
        </div>
      `;
      
      const popup = new mapboxgl.Popup({ offset: 35 }).setHTML(`
        <div style="text-align: center;">
          <h3 style="font-size: 18px; font-weight: 900; color: #38bdf8; margin-bottom: 5px;">${hospitalInfo.nombre}</h3>
          <p style="font-size: 13px; color: #a1a1aa;">${hospitalInfo.direccion}</p>
        </div>
      `);

      hospitalMarker.current = new mapboxgl.Marker({ element: el }).setLngLat([hospitalInfo.lng, hospitalInfo.lat]).setPopup(popup).addTo(map.current);
    } catch (error) { console.error('Error hospital marker:', error); }
  };

  const updateAmbulanceMarkers = (ambulancesList) => {
    if (!map.current) return;
    Object.values(ambulanceMarkers.current).forEach(marker => marker.remove());
    ambulanceMarkers.current = {};

    ambulancesList.forEach(ambulance => {
      if (!ambulance.location || !ambulance.location.lat || !ambulance.location.lng) return;
      const isRoute = ambulance.status === 'en_ruta';
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="width: 60px; height: 60px; background: ${isRoute ? '#10b981' : '#f59e0b'}; border: 4px solid #18181b; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 26px; box-shadow: 0 0 20px ${isRoute ? 'rgba(16,185,129,0.7)' : 'rgba(245,158,11,0.7)'}; cursor: pointer; transition: transform 0.2s;">
          🚑
        </div>
      `;

      const popup = new mapboxgl.Popup({ offset: 35 }).setHTML(`
        <div style="text-align: center;">
          <strong style="font-size: 18px; color: ${isRoute ? '#10b981' : '#f59e0b'};">UNIDAD ${ambulance.id}</strong>
          <div style="margin-top: 10px; font-size: 14px; font-weight: 700; color: #d4d4d8;">
            <p>ESTADO: ${ambulance.status.replace('_', ' ').toUpperCase()}</p>
            <p>VELOCIDAD: ${ambulance.speed || 0} km/h</p>
          </div>
        </div>
      `);

      const marker = new mapboxgl.Marker({ element: el }).setLngLat([ambulance.location.lng, ambulance.location.lat]).setPopup(popup).addTo(map.current);
      ambulanceMarkers.current[ambulance.id] = marker;

      el.addEventListener('click', () => {
        setSelectedAmbulance(ambulance);
        map.current.flyTo({ center: [ambulance.location.lng, ambulance.location.lat], zoom: 16, duration: 800 });
      });
    });
  };

  const handleAmbulanceLocationUpdate = (data) => {
    if (!data.ambulanceId || !data.location) return;
    const marker = ambulanceMarkers.current[data.ambulanceId];
    if (marker) {
      marker.setLngLat([data.location.lng, data.location.lat]);
      setAmbulances(prev => prev.map(amb => amb.id === data.ambulanceId ? { ...amb, location: data.location, speed: data.speed, heading: data.heading } : amb));
    }
  };

  const cleanupMarkers = () => {
    if (hospitalMarker.current) hospitalMarker.current.remove();
    Object.values(ambulanceMarkers.current).forEach(marker => marker.remove());
    ambulanceMarkers.current = {};
    Object.keys(routeLayersByAmbulance.current).forEach(ambId => clearAmbulanceRoute(ambId));
  };

  const clearAmbulanceRoute = (ambulanceId) => {
    if (!map.current) return;
    const layers = routeLayersByAmbulance.current[ambulanceId] || [];
    const sources = routeSourcesByAmbulance.current[ambulanceId] || [];
    layers.forEach(lid => { if (map.current.getLayer(lid)) map.current.removeLayer(lid); });
    sources.forEach(sid => { if (map.current.getSource(sid)) map.current.removeSource(sid); });
    delete routeLayersByAmbulance.current[ambulanceId];
    delete routeSourcesByAmbulance.current[ambulanceId];
    setActiveRoutes(prev => prev.filter(r => r.ambulanceId !== ambulanceId));
  };

  const drawAmbulanceRoute = (ambulanceId, routeGeometry, distance, duration) => {
    if (!map.current || !routeGeometry) return;
    clearAmbulanceRoute(ambulanceId);

    const sourceId = `route-${ambulanceId}-${Date.now()}`;
    const layerId = sourceId;
    const glowLayerId = `${sourceId}-glow`;

    try {
      map.current.addSource(sourceId, {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: routeGeometry }, properties: {} }
      });

      map.current.addLayer({
        id: layerId, type: 'line', source: sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#38bdf8', 'line-width': 8, 'line-opacity': 0.9 }
      });

      map.current.addLayer({
        id: glowLayerId, type: 'line', source: sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#38bdf8', 'line-width': 16, 'line-opacity': 0.3, 'line-blur': 3 }
      }, layerId);

      routeLayersByAmbulance.current[ambulanceId] = [layerId, glowLayerId];
      routeSourcesByAmbulance.current[ambulanceId] = [sourceId];

      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend([hospitalInfo.lng, hospitalInfo.lat]);
      routeGeometry.forEach(coord => bounds.extend([coord[0], coord[1]]));
      map.current.fitBounds(bounds, { padding: 80, duration: 1500, pitch: 45 });
    } catch (error) { console.error('Error dibujando ruta:', error); }
  };

  const handleRouteUpdated = (data) => {
    const { ambulanceId, hospitalId, routeGeometry, distance, duration } = data;
    if (hospitalId && hospitalId !== hospitalInfo?.id) return;
    if (routeGeometry) drawAmbulanceRoute(ambulanceId, routeGeometry, distance, duration);
    else { clearAmbulanceRoute(ambulanceId); return; }

    setActiveRoutes(prev => {
      const existing = prev.findIndex(r => r.ambulanceId === ambulanceId);
      const newRoute = { ambulanceId, hospitalId: hospitalId || hospitalInfo?.id, distance, duration, geometry: routeGeometry };
      if (existing >= 0) { const updated = [...prev]; updated[existing] = newRoute; return updated; }
      return [...prev, newRoute];
    });
  };

  const handleNavigationCancelled = (data) => {
    clearAmbulanceRoute(data.ambulanceId);
  };

  const handlePatientTransferNotification = (data) => {
    const notification = { ...data, id: data.notificationId || `notif_${Date.now()}`, timestamp: new Date().toLocaleTimeString(), status: 'pending' };
    setPatientNotifications(prev => [...prev, notification]);
    setSelectedNotification(notification);
    setConfirmReject(false);

    if (data.routeGeometry) drawAmbulanceRoute(data.ambulanceId, data.routeGeometry, data.distance, data.duration);
    onNotificationOpen();
  };

  const procesarReporteMedico = (reporte) => {
    setSelectedReport(reporte);
    
    // Almacenar en el historial local de expedientes
    setHistorialExpedientes(prev => [
      { id: reporte?.id || `exp_${Date.now()}`, fecha: new Date().toLocaleString(), ...reporte },
      ...prev
    ]);

    const urgencia = reporte?.paciente?.motivo_urgencia || '';
    const especialidadRequerida = clasificarEspecialidad(urgencia);
    
    const doctorIdeal = listaDoctores.find(d => d.especialidad && d.especialidad.toLowerCase() === especialidadRequerida.toLowerCase());
    
    if (doctorIdeal) {
      setDoctorSeleccionado(doctorIdeal.id);
      showToast('info', 'Especialista Pre-seleccionado', `Dr. ${doctorIdeal.nombre} (${especialidadRequerida}) asignado por protocolo automatizado.`);
    } else {
      setDoctorSeleccionado("");
    }
    
    const notif = {
      notificationId: `report_${Date.now()}`,
      type: 'reporte_medico',
      ambulanceId: reporte?.id_ambulancia || 'Externo',
      status: 'pending',
      fullReport: reporte
    };
    setPatientNotifications(prev => [...prev, notif]);
    onReportModalOpen();
  };

  const acceptPatient = () => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return showToast('error', 'Error', 'Sin conexión');
    ws.current.send(JSON.stringify({
      type: 'hospital_accept_patient',
      notificationId: selectedNotification.notificationId,
      hospitalId: hospitalInfo.id,
      hospitalInfo: hospitalInfo
    }));
    setPatientNotifications(prev => prev.filter(n => n.notificationId !== selectedNotification.notificationId));
    onNotificationClose();
  };

  const rejectPatient = () => {
    if (!confirmReject) {
      setConfirmReject(true);
      return;
    }
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return showToast('error', 'Error', 'Sin conexión');
    ws.current.send(JSON.stringify({
      type: 'hospital_reject_patient',
      notificationId: selectedNotification.notificationId,
      hospitalId: hospitalInfo.id,
      reason: 'Falta de camas / Capacidad superada'
    }));
    setPatientNotifications(prev => prev.filter(n => n.notificationId !== selectedNotification.notificationId));
    clearAmbulanceRoute(selectedNotification.ambulanceId);
    onNotificationClose();
  };

  const enviarRespuestaRapida = (mensaje) => {
    if (!selectedAmbulance) return;
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return showToast('error', 'Error', 'Sin conexión');
    ws.current.send(JSON.stringify({
      type: 'hospital_note',
      ambulanceId: selectedAmbulance.id,
      hospitalId: hospitalInfo.id,
      note: {
        id: Date.now(),
        message: mensaje,
        timestamp: new Date().toLocaleTimeString()
      }
    }));
    showToast('success', 'Aviso Enviado', `Comunicación enviada a la unidad ${selectedAmbulance.id}`);
    onNoteClose();
  };

  const generarPDFConDatos = async (reporteMeta) => {
    try {
      showToast('info', 'Procesando PDF', 'Generando documento oficial de expediente...');
      // Generación programática simple o utilizando el ref actual
      const pdf = new jsPDF('p', 'mm', 'a4');
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(20);
      pdf.text("EXPEDIENTE CLÍNICO DE URGENCIAS", 20, 20);
      
      pdf.setFontSize(12);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Paciente: ${reporteMeta?.paciente?.nombre || 'Desconocido'}`, 20, 35);
      pdf.text(`Edad: ${reporteMeta?.paciente?.edad || '--'} | Sexo: ${reporteMeta?.paciente?.sexo || '--'}`, 20, 45);
      pdf.text(`Motivo de Urgencia: ${reporteMeta?.paciente?.motivo_urgencia || 'No especificado'}`, 20, 55);
      
      pdf.text("Signos Vitales:", 20, 70);
      pdf.text(`- Frecuencia Cardíaca: ${reporteMeta?.signos_vitales?.frecuencia_cardiaca || '--'} bpm`, 25, 80);
      pdf.text(`- Saturación Oxígeno: ${reporteMeta?.signos_vitales?.saturacion_oxigeno || '--'} %`, 25, 90);
      pdf.text(`- Tensión Arterial: ${reporteMeta?.signos_vitales?.tension_arterial || '--'}`, 25, 100);

      pdf.save(`Expediente_${reporteMeta?.paciente?.nombre || 'Paciente'}_${Date.now()}.pdf`);
      showToast('success', 'Descarga Completa', 'Archivo PDF guardado con éxito.');
    } catch (e) {
      showToast('error', 'Error', 'No se pudo exportar el PDF');
    }
  };

  const generarPDF = async () => {
    const input = reportRef.current;
    if (!input) return;
    try {
      showToast('info', 'Procesando Expediente', 'Generando documento oficial...');
      
      const originalBg = input.style.backgroundColor;
      const originalColor = input.style.color;
      input.style.backgroundColor = '#ffffff';
      input.style.color = '#000000';
      
      const canvas = await html2canvas(input, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      
      input.style.backgroundColor = originalBg;
      input.style.color = originalColor;

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdf.internal.pageSize.getHeight();
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdf.internal.pageSize.getHeight();
      }
      pdf.save(`Expediente_${selectedReport?.paciente?.nombre || 'Urgencia'}_${Date.now()}.pdf`);
    } catch (error) { showToast('error', 'Error', 'Fallo al generar documento'); }
  };

  const confirmarReporteYAsignar = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'asignar_paciente_doctor',
        targetDoctorId: doctorSeleccionado,
        hospitalId: hospitalInfo.id,
        reporte: selectedReport
      }));
    }
    generarPDF();
    setTimeout(() => {
      showToast('success', 'Recepción Confirmada', 'Paciente ingresado, doctor notificado y expediente abierto.');
      onReportModalClose();
    }, 1500);
  };

  const showToast = (status, title, description) => {
    toast({ title, description, status, duration: 4000, isClosable: true, position: 'top-right' });
  };

  const centerOnHospital = () => {
    if (!map.current || !hospitalInfo) return;
    map.current.flyTo({ center: [hospitalInfo.lng, hospitalInfo.lat], zoom: 16, pitch: 45, duration: 1000 });
  };

  if (!hospitalInfo) {
    return (
      <ChakraProvider>
        <Box h="100vh" bg="#09090b" display="flex" alignItems="center" justifyContent="center">
          <VStack spacing={6}>
            <Spinner size="xl" color="#38bdf8" thickness="4px" />
            <Text fontSize="20px" fontWeight="900" color="white" letterSpacing="2px">INICIALIZANDO SISTEMA TÁCTICO...</Text>
          </VStack>
        </Box>
      </ChakraProvider>
    );
  }

  return (
    <ChakraProvider>
      <Box h="100vh" w="100vw" bg="#09090b" display="flex" flexDirection="column" overflow="hidden">
        
        {/* ==================== HEADER CON BOTÓN DE EXPEDIENTES Y CERRAR SESIÓN DISCRETO ==================== */}
        <Flex as="nav" h="85px" bg="#09090b" borderBottom="1px solid #27272a" px={6} align="center" justify="space-between" zIndex="10">
          <HStack spacing={4}>
            <Box p={3} bg="#18181b" borderRadius="xl" border="1px solid #27272a">
              <Icon as={FaMapMarkerAlt} color="#38bdf8" boxSize={6} />
            </Box>
            <VStack align="start" spacing={0}>
              <Text fontSize="22px" fontWeight="900" color="#f8fafc" letterSpacing="1px">{hospitalInfo.nombre.toUpperCase()}</Text>
              <Text fontSize="13px" fontWeight="800" color="#a1a1aa" letterSpacing="1px">CENTRO DE MANDO Y RECEPCIÓN</Text>
            </VStack>
          </HStack>

          <HStack spacing={5}>
            {/* CAMAS DE URGENCIAS CON BOTONES DE MÁS Y MENOS */}
            <HStack bg="#18181b" px={4} py={2} borderRadius="xl" border="2px solid #27272a">
              <Icon as={FaBed} color={camasDisponibles > 2 ? "#10b981" : "#ef4444"} boxSize={6} />
              <VStack align="start" spacing={0} ml={2} mr={3}>
                <Text fontSize="10px" fontWeight="900" color="#a1a1aa" letterSpacing="1px">CAMAS LIBRES</Text>
                <Text fontSize="24px" fontWeight="900" color="#f8fafc" lineHeight="1">{camasDisponibles}</Text>
              </VStack>
              <ButtonGroup size="sm" isAttached>
                <IconButton 
                  icon={<FaMinus />} 
                  aria-label="Restar cama" 
                  onClick={() => setCamasDisponibles(Math.max(0, camasDisponibles - 1))} 
                  bg="#27272a" 
                  color="white" 
                  _hover={{ bg: '#3f3f46' }}
                />
                <IconButton 
                  icon={<FaPlus />} 
                  aria-label="Sumar cama" 
                  onClick={() => setCamasDisponibles(camasDisponibles + 1)} 
                  bg="#27272a" 
                  color="white" 
                  _hover={{ bg: '#3f3f46' }}
                />
              </ButtonGroup>
            </HStack>

            {/* BOTÓN PARA ABRIR EXPEDIENTES (PANEL ABATIBLE) */}
            <Button 
              h="55px" 
              px={4} 
              bg="#18181b" 
              color="#38bdf8" 
              border="1px solid #3f3f46"
              _hover={{ bg: '#27272a', borderColor: '#38bdf8' }} 
              fontWeight="900" 
              fontSize="14px" 
              onClick={onExpedientesOpen} 
              leftIcon={<FaHistory />}
            >
              EXPEDIENTES ({historialExpedientes.length})
            </Button>

            {patientNotifications.length > 0 && (
              <Button h="55px" px={5} colorScheme="red" bg="#ef4444" color="white" fontWeight="900" fontSize="15px" animation="pulseRed 2s infinite" onClick={onNotificationOpen} leftIcon={<FaExclamationTriangle />}>
                ALERTA ({patientNotifications.length})
              </Button>
            )}

            <Badge display="flex" alignItems="center" gap={2} px={4} py={3} borderRadius="xl" bg={wsConnected ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'} border="1px solid" borderColor={wsConnected ? '#10b981' : '#ef4444'} color={wsConnected ? '#10b981' : '#ef4444'} fontSize="13px" fontWeight="900">
              <Icon as={wsConnected ? FiActivity : FiWifiOff} boxSize={4} />
              {wsConnected ? 'ACTIVO' : 'DESCONECTADO'}
            </Badge>

            {/* BOTÓN CERRAR SESIÓN DISCRETO CON TOOLTIP */}
            <Tooltip label="Cerrar Sesión" placement="bottom" hasArrow bg="#18181b" color="#ef4444" fontWeight="bold">
              <IconButton
                icon={<FaSignOutAlt />}
                aria-label="Cerrar Sesión"
                onClick={closeSession}
                bg="#18181b"
                color="#a1a1aa"
                border="1px solid #27272a"
                borderRadius="xl"
                w="50px"
                h="50px"
                _hover={{ bg: 'rgba(239,68,68,0.2)', color: '#ef4444', borderColor: '#ef4444' }}
                transition="all 0.2s"
              />
            </Tooltip>
          </HStack>
        </Flex>

        <Flex flex={1} overflow="hidden">
          {/* ==================== PANEL LATERAL ==================== */}
          <Box w={sidebarWidth} bg="#09090b" borderRight="1px solid #27272a" display="flex" flexDirection="column" zIndex={5}>
            <Box p={5} borderBottom="1px solid #27272a" bg="#09090b">
              <Text fontSize="16px" fontWeight="900" color="#f8fafc" letterSpacing="1px">MONITOREO DE UNIDADES</Text>
              <Text fontSize="12px" color="#a1a1aa" mt={1}>Gestión y seguimiento de ambulancias en campo</Text>
            </Box>

            <Box flex={1} overflowY="auto" p={5} sx={{ '&::-webkit-scrollbar': { width: '8px' }, '&::-webkit-scrollbar-thumb': { bg: '#3f3f46', borderRadius: '4px' } }}>
              
              {activeRoutes.length > 0 && (
                <Box mb={8}>
                  <HStack mb={4}><Icon as={FaRoute} color="#38bdf8" boxSize={5} /><Text fontSize="15px" fontWeight="900" color="#e4e4e7">RUTAS HACIA HOSPITAL ({activeRoutes.length})</Text></HStack>
                  <VStack spacing={3} align="stretch">
                    {activeRoutes.map(route => (
                      <Box key={route.ambulanceId} p={4} bg="#18181b" borderRadius="xl" border="1px solid #38bdf8" boxShadow="0 0 15px rgba(56,189,248,0.15)">
                        <Flex justify="space-between" align="center" mb={2}>
                          <Text fontSize="18px" fontWeight="900" color="#f8fafc">{route.ambulanceId}</Text>
                          <Badge colorScheme="blue" fontSize="14px" px={3} py={1} borderRadius="md" fontWeight="900">{Math.round(route.duration / 60)} MIN</Badge>
                        </Flex>
                        <Text fontSize="13px" fontWeight="700" color="#a1a1aa" mb={3}>DISTANCIA: {(route.distance / 1000).toFixed(1)} km</Text>
                        <HStack spacing={2}>
                          <Button flex={1} size="md" bg="#27272a" color="white" _hover={{ bg: '#3f3f46' }} fontSize="12px" fontWeight="800" onClick={() => { if(route.geometry) { const bounds = new mapboxgl.LngLatBounds(); route.geometry.forEach(c => bounds.extend([c[0], c[1]])); map.current.fitBounds(bounds, { padding: 80 }); } }}>ENFOCAR RUTA</Button>
                          <Button size="md" bg="#27272a" color="#ef4444" _hover={{ bg: '#dc2626', color: 'white' }} onClick={() => clearAmbulanceRoute(route.ambulanceId)}><Icon as={FaTimes} /></Button>
                        </HStack>
                      </Box>
                    ))}
                  </VStack>
                </Box>
              )}

              <HStack mb={4}><Icon as={FaAmbulance} color="#a1a1aa" boxSize={5} /><Text fontSize="15px" fontWeight="900" color="#e4e4e7">TODAS LAS UNIDADES ({ambulances.length})</Text></HStack>
              {ambulances.length === 0 ? (
                <Box p={8} bg="#18181b" borderRadius="xl" border="1px dashed #3f3f46" textAlign="center">
                  <Icon as={FaCheckCircle} boxSize={8} color="#52525b" mb={3} />
                  <Text fontSize="14px" fontWeight="800" color="#a1a1aa">Sin unidades activas en la red</Text>
                </Box>
              ) : (
                <VStack spacing={4} align="stretch">
                  {ambulances.map(amb => (
                    <Box key={amb.id} p={4} bg="#18181b" borderRadius="xl" border="1px solid #27272a" borderLeft="6px solid" borderLeftColor={amb.status === 'en_ruta' ? '#10b981' : '#f59e0b'} _hover={{ borderColor: '#3f3f46' }} transition="all 0.2s">
                      <Flex justify="space-between" align="center" mb={3}>
                        <Text fontSize="18px" fontWeight="900" color="#f8fafc">{amb.id}</Text>
                        <Badge colorScheme={amb.status === 'en_ruta' ? 'green' : 'orange'} px={3} py={1} fontSize="11px" fontWeight="900">{amb.status.replace('_', ' ').toUpperCase()}</Badge>
                      </Flex>
                      <HStack justify="space-between" spacing={3}>
                        <Button flex={1} h="50px" bg="#27272a" color="white" _hover={{ bg: '#3f3f46' }} fontSize="12px" fontWeight="900" onClick={() => { if(amb.location) map.current.flyTo({ center: [amb.location.lng, amb.location.lat], zoom: 16 }) }}>
                          UBICAR MAPA
                        </Button>
                        <Button flex={1} h="50px" bg="#0284c7" color="white" _hover={{ bg: '#0369a1' }} fontSize="12px" fontWeight="900" onClick={() => { setSelectedAmbulance(amb); onNoteOpen(); }}>
                          COMUNICAR
                        </Button>
                      </HStack>
                    </Box>
                  ))}
                </VStack>
              )}
            </Box>

            <Box p={5} borderTop="1px solid #27272a" bg="#09090b">
              <VStack spacing={3}>
                <Button w="100%" h="55px" bg="#27272a" color="white" _hover={{ bg: '#3f3f46' }} fontSize="14px" fontWeight="900" leftIcon={<Icon as={FaMapMarkerAlt} />} onClick={centerOnHospital}>
                  CENTRAR EN HOSPITAL
                </Button>
                <Button w="100%" h="55px" bg={trafficEnabled ? "#f59e0b" : "#27272a"} color={trafficEnabled ? "black" : "white"} _hover={{ bg: trafficEnabled ? '#d97706' : '#3f3f46' }} fontSize="14px" fontWeight="900" onClick={toggleTraffic}>
                  {trafficEnabled ? 'OCULTAR TRÁFICO' : 'MOSTRAR TRÁFICO'}
                </Button>
              </VStack>
            </Box>
          </Box>

          <Box flex={1} position="relative">
            <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
          </Box>
        </Flex>

        {/* ==================== PANEL ABATIBLE (DRAWER) DE EXPEDIENTES ==================== */}
        <Drawer isOpen={isExpedientesOpen} placement="right" onClose={onExpedientesClose} size="md">
          <DrawerOverlay backdropFilter="blur(10px)" />
          <DrawerContent bg="#09090b" color="white" borderLeft="1px solid #27272a">
            <DrawerCloseButton color="white" />
            <DrawerHeader borderBottom="1px solid #27272a" fontSize="20px" fontWeight="900">
              📁 HISTORIAL DE EXPEDIENTES
            </DrawerHeader>
            <DrawerBody p={6}>
              {historialExpedientes.length === 0 ? (
                <VStack spacing={4} mt={10} textAlign="center">
                  <Icon as={FaFolderOpen} boxSize={12} color="#52525b" />
                  <Text color="#a1a1aa" fontWeight="800">No hay expedientes registrados en esta sesión.</Text>
                </VStack>
              ) : (
                <VStack spacing={4} align="stretch">
                  {historialExpedientes.map((exp, index) => (
                    <Box key={index} p={4} bg="#18181b" borderRadius="xl" border="1px solid #3f3f46">
                      <HStack justify="space-between" mb={2}>
                        <Text fontSize="16px" fontWeight="900" color="white">{exp?.paciente?.nombre || 'Paciente'}</Text>
                        <Badge colorScheme="blue">{exp.fecha}</Badge>
                      </HStack>
                      <Text fontSize="13px" color="#a1a1aa" mb={3}>Motivo: {exp?.paciente?.motivo_urgencia || 'General'}</Text>
                      <Button 
                        w="100%" 
                        h="45px" 
                        bg="#0284c7" 
                        color="white" 
                        _hover={{ bg: '#0369a1' }} 
                        fontWeight="900" 
                        leftIcon={<FaFilePdf />}
                        onClick={() => generarPDFConDatos(exp)}
                      >
                        DESCARGAR PDF
                      </Button>
                    </Box>
                  ))}
                </VStack>
              )}
            </DrawerBody>
          </DrawerContent>
        </Drawer>

        {/* ==================== MODAL 1: ALERTA DE ARRIBO (FRICCIÓN) ==================== */}
        <Modal isOpen={isNotificationOpen} onClose={() => {}} size="2xl" isCentered closeOnOverlayClick={false}>
          <ModalOverlay backdropFilter="blur(20px)" bg="rgba(0,0,0,0.85)" />
          <ModalContent bg="#09090b" border="2px solid #3f3f46" borderRadius="2xl" overflow="hidden" boxShadow="0 0 50px rgba(0,0,0,0.9)">
            <Box bg="#eab308" p={5} textAlign="center">
              <Text fontSize="26px" fontWeight="900" color="black" letterSpacing="2px">⚠️ ALERTA DE TRASLADO EN CAMINO</Text>
            </Box>
            <ModalBody p={8}>
              <SimpleGrid columns={2} spacing={8} mb={8}>
                <Box bg="#18181b" p={6} borderRadius="xl" border="1px solid #3f3f46" textAlign="center">
                  <Text fontSize="13px" color="#a1a1aa" fontWeight="900" mb={2} letterSpacing="1px">UNIDAD ASIGNADA</Text>
                  <Text fontSize="36px" fontWeight="900" color="#f8fafc">{selectedNotification?.ambulanceId}</Text>
                  <Text fontSize="16px" fontWeight="700" color="#38bdf8" mt={2}>ETA: {selectedNotification?.eta || 'Calculando'}</Text>
                </Box>
                <Box bg="#18181b" p={6} borderRadius="xl" border="1px solid #3f3f46" textAlign="center">
                  <Text fontSize="13px" color="#a1a1aa" fontWeight="900" mb={2} letterSpacing="1px">CÓDIGO DE EMERGENCIA</Text>
                  <Text fontSize="28px" fontWeight="900" color="#ef4444" lineHeight="1.2">{selectedNotification?.patientInfo?.condition || selectedNotification?.patientInfo?.type || 'TRAUMA GRAVE'}</Text>
                </Box>
              </SimpleGrid>
              
              <VStack spacing={4}>
                <HStack w="100%" spacing={4}>
                  <Button flex={1} h="90px" fontSize="20px" fontWeight="900" bg="#10b981" color="white" _hover={{ bg: '#059669', transform: 'scale(1.02)' }} onClick={acceptPatient} transition="all 0.2s" boxShadow="0 10px 20px rgba(16,185,129,0.3)">
                    ✅ ACEPTAR RECEPCIÓN
                  </Button>
                  
                  <Button flex={1} h="90px" fontSize="18px" fontWeight="900" bg={confirmReject ? "#dc2626" : "#18181b"} color={confirmReject ? "white" : "#ef4444"} border={confirmReject ? "none" : "2px solid #ef4444"} _hover={{ bg: '#b91c1c', color: 'white' }} onClick={rejectPatient} transition="all 0.2s">
                    {confirmReject ? "⛔ CONFIRMAR RECHAZO (PELIGRO)" : "❌ RECHAZAR PACIENTE"}
                  </Button>
                </HStack>
                
                {selectedNotification?.callId && (
                  <Button w="100%" h="70px" bg="#0284c7" color="white" fontSize="18px" fontWeight="900" leftIcon={<Icon as={FaVideo} />} onClick={() => window.open(`/videocall?room=${selectedNotification.callId}`, '_blank')} _hover={{ bg: '#0369a1' }}>
                    ENTRAR A SALA DE VIDEOLLAMADA MÉDICA
                  </Button>
                )}
              </VStack>
            </ModalBody>
          </ModalContent>
        </Modal>

        {/* ==================== MODAL 2: REPORTE MÉDICO ==================== */}
        <Modal isOpen={isReportModalOpen} onClose={onReportModalClose} size="5xl" scrollBehavior="inside" closeOnOverlayClick={false}>
          <ModalOverlay backdropFilter="blur(15px)" bg="rgba(0,0,0,0.85)" />
          <ModalContent bg="#09090b" border="1px solid #3f3f46" borderRadius="2xl">
            <Box p={6} bg="#18181b" borderBottom="1px solid #27272a">
              <HStack justify="space-between">
                <HStack><Icon as={FaFolderOpen} color="#38bdf8" boxSize={6} /><Text fontSize="24px" fontWeight="900" color="white" letterSpacing="1px">REPORTE CLÍNICO PREHOSPITALARIO</Text></HStack>
                <Badge bg={selectedReport?.codigo_prioridad_color || '#ef4444'} color="white" px={5} py={2} fontSize="16px" fontWeight="900" borderRadius="md">TRIAGE ASIGNADO</Badge>
              </HStack>
            </Box>
            
            <ModalBody p={0} bg="#09090b">
              <Box ref={reportRef} p={8} bg="#09090b">
                <SimpleGrid columns={2} spacing={8} mb={8}>
                  <Box bg="#18181b" p={6} borderRadius="xl" border="1px solid #27272a">
                    <HStack mb={4}><Icon as={FaUserMd} color="#38bdf8"/><Text fontSize="15px" color="#a1a1aa" fontWeight="900" letterSpacing="1px">DATOS DEL PACIENTE</Text></HStack>
                    <Text fontSize="28px" fontWeight="900" color="white" mb={1}>{selectedReport?.paciente?.nombre || 'Paciente Desconocido'}</Text>
                    <Text fontSize="18px" fontWeight="700" color="#a1a1aa">{selectedReport?.paciente?.edad} Años • Sexo: {selectedReport?.paciente?.sexo}</Text>
                    
                    <Divider my={5} borderColor="#3f3f46" />
                    
                    <Text fontSize="13px" color="#a1a1aa" fontWeight="900" mb={2} letterSpacing="1px">MOTIVO DE URGENCIA / DIAGNÓSTICO INICIAL</Text>
                    <Text fontSize="22px" fontWeight="900" color="#f59e0b">{selectedReport?.paciente?.motivo_urgencia}</Text>
                    <Text fontSize="15px" color="#d4d4d8" mt={2} p={3} bg="#27272a" borderRadius="md">{selectedReport?.paciente?.descripcion_lesion || 'Sin descripción detallada del evento.'}</Text>
                  </Box>

                  <Box>
                    <HStack mb={4}><Icon as={FaHeartbeat} color="#ef4444"/><Text fontSize="15px" color="#a1a1aa" fontWeight="900" letterSpacing="1px">SIGNOS VITALES TOMADOS EN CAMPO</Text></HStack>
                    <SimpleGrid columns={2} spacing={4}>
                      <Box bg="#18181b" p={5} borderRadius="xl" border="1px solid #27272a" textAlign="center">
                        <Text fontSize="12px" color="#a1a1aa" fontWeight="900" letterSpacing="1px">FREQ. CARDÍACA</Text>
                        <Text fontSize="36px" fontWeight="900" color="#ef4444">{selectedReport?.signos_vitales?.frecuencia_cardiaca || '--'} <Text as="span" fontSize="16px" color="#a1a1aa">bpm</Text></Text>
                      </Box>
                      <Box bg="#18181b" p={5} borderRadius="xl" border="1px solid #27272a" textAlign="center">
                        <Text fontSize="12px" color="#a1a1aa" fontWeight="900" letterSpacing="1px">SPO2 (OXÍGENO)</Text>
                        <Text fontSize="36px" fontWeight="900" color="#38bdf8">{selectedReport?.signos_vitales?.saturacion_oxigeno || '--'} <Text as="span" fontSize="16px" color="#a1a1aa">%</Text></Text>
                      </Box>
                      <Box bg="#18181b" p={5} borderRadius="xl" border="1px solid #27272a" textAlign="center">
                        <Text fontSize="12px" color="#a1a1aa" fontWeight="900" letterSpacing="1px">TENS. ARTERIAL</Text>
                        <Text fontSize="28px" fontWeight="900" color="white">{selectedReport?.signos_vitales?.tension_arterial || '--'}</Text>
                      </Box>
                      <Box bg="#18181b" p={5} borderRadius="xl" border="1px solid #27272a" textAlign="center">
                        <Text fontSize="12px" color="#a1a1aa" fontWeight="900" letterSpacing="1px">GLUCOSA</Text>
                        <Text fontSize="28px" fontWeight="900" color="white">{selectedReport?.signos_vitales?.nivel_glucosa || '--'}</Text>
                      </Box>
                    </SimpleGrid>
                  </Box>
                </SimpleGrid>

                <Box bg="#18181b" p={6} borderRadius="xl" border="1px solid #27272a" mb={8}>
                  <HStack mb={4}><Icon as={FaStethoscope} color="#10b981"/><Text fontSize="15px" color="#a1a1aa" fontWeight="900" letterSpacing="1px">INTERVENCIONES Y HALLAZGOS EN RUTA</Text></HStack>
                  {selectedReport?.intervenciones?.length > 0 ? (
                    <SimpleGrid columns={2} spacing={4} mb={4}>
                      {selectedReport.intervenciones.map((iv, idx) => (
                        <Box key={idx} p={4} bg="#27272a" borderRadius="lg" borderLeft="4px solid #10b981">
                          <Text fontWeight="900" color="white" fontSize="16px">{iv.tipo_intervencion}</Text>
                          <Text fontSize="14px" color="#d4d4d8" mt={1}>{iv.descripcion}</Text>
                        </Box>
                      ))}
                    </SimpleGrid>
                  ) : <Text color="#a1a1aa" mb={4}>No se registraron procedimientos médicos durante el traslado.</Text>}
                  
                  <Divider borderColor="#3f3f46" my={4} />
                  
                  <Text fontSize="13px" color="#a1a1aa" fontWeight="900" mb={2}>OBSERVACIONES DE LA ESCENA / EXTRA</Text>
                  <Text fontSize="15px" color="white">{selectedReport?.descripcion_escena || selectedReport?.otros_hallazgos || selectedReport?.paciente?.observaciones || 'Sin observaciones adicionales registradas.'}</Text>
                </Box>

                <Box bg="rgba(14, 165, 233, 0.1)" p={6} borderRadius="xl" border="2px solid #0ea5e9">
                  <HStack mb={3}><Icon as={FaBolt} color="#0ea5e9" boxSize={5} /><Text fontSize="16px" color="#0ea5e9" fontWeight="900" letterSpacing="1px">ALGORITMO DE ASIGNACIÓN MÉDICA AUTOMATIZADA</Text></HStack>
                  <Text fontSize="14px" color="#a1a1aa" mb={4}>Basado en el motivo de urgencia, el sistema ha pre-seleccionado al especialista de guardia óptimo.</Text>
                  
                  <Select size="lg" bg="#09090b" border="1px solid #3f3f46" color="white" fontWeight="900" h="60px" fontSize="18px" value={doctorSeleccionado} onChange={(e) => setDoctorSeleccionado(e.target.value)}>
                    <option value="" style={{background: '#09090b'}}>-- SELECCIONAR MÉDICO MANUALMENTE --</option>
                    {listaDoctores.map(doc => (
                      <option key={doc.id} value={doc.id} style={{background: '#09090b'}}>Dr(a). {doc.nombre} — Especialidad: {doc.especialidad}</option>
                    ))}
                  </Select>
                </Box>
              </Box>
            </ModalBody>
            <ModalFooter bg="#09090b" borderTop="1px solid #27272a" p={6}>
              <HStack w="100%" spacing={4}>
                <Button flex={0.3} h="75px" variant="ghost" color="#a1a1aa" fontSize="16px" fontWeight="900" _hover={{ bg: '#27272a', color: 'white' }} onClick={onReportModalClose}>
                  CERRAR VISTA
                </Button>
                <Button flex={0.7} h="75px" bg="#10b981" color="white" fontSize="18px" fontWeight="900" letterSpacing="1px" _hover={{bg: '#059669', transform: 'scale(1.01)'}} onClick={confirmarReporteYAsignar} leftIcon={<Icon as={FaFolderOpen} boxSize={5}/>}>
                  GENERAR PDF Y ABRIR EXPEDIENTE CLÍNICO
                </Button>
              </HStack>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* ==================== MODAL 3: COMUNICACIÓN RÁPIDA (CERO TIPEO) ==================== */}
        <Modal isOpen={isNoteOpen} onClose={onNoteClose} size="3xl" isCentered>
          <ModalOverlay backdropFilter="blur(10px)" bg="rgba(0,0,0,0.8)" />
          <ModalContent bg="#09090b" border="1px solid #3f3f46" borderRadius="2xl" overflow="hidden">
            <Box p={6} bg="#18181b" borderBottom="1px solid #27272a">
              <Text fontSize="22px" fontWeight="900" color="white" letterSpacing="1px">ENVIAR AVISO A UNIDAD: {selectedAmbulance?.id}</Text>
            </Box>
            <ModalBody p={8}>
              <Text fontSize="14px" color="#a1a1aa" fontWeight="900" mb={5} letterSpacing="1px">SELECCIONE UNA RESPUESTA PREDEFINIDA (1 CLIC):</Text>
              <SimpleGrid columns={2} spacing={5}>
                {RESPUESTAS_RAPIDAS.map((msg, i) => (
                  <Button 
                    key={i} h="90px" whiteSpace="normal" bg="#27272a" color="white" fontSize="18px" fontWeight="900" lineHeight="1.2"
                    _hover={{ bg: '#0284c7', transform: 'scale(1.02)' }} onClick={() => enviarRespuestaRapida(msg)}
                    boxShadow="0 4px 10px rgba(0,0,0,0.3)" transition="all 0.2s"
                  >
                    {msg}
                  </Button>
                ))}
              </SimpleGrid>
            </ModalBody>
            <ModalFooter p={6} bg="#18181b" borderTop="1px solid #27272a">
              <Button w="100%" h="65px" bg="#3f3f46" color="white" fontSize="16px" fontWeight="900" _hover={{ bg: '#52525b' }} onClick={onNoteClose}>
                CANCELAR COMUNICACIÓN
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

      </Box>
    </ChakraProvider>
  );
}