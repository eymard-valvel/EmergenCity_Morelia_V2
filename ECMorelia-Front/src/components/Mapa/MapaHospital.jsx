import React, { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/useAuth.js";
import { deleteCookie } from "../../helpers/cookies.js";
import { resolveWsUrl } from "../../helpers/wsUrl.js";
import {
  ChakraProvider, Box, Button, VStack, Text, HStack, Badge, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalBody, ModalFooter, useDisclosure, useToast, Spinner, SimpleGrid, Divider,
  useMediaQuery, IconButton, Flex, ButtonGroup, Tooltip, Icon, Drawer, DrawerBody, DrawerHeader,
  DrawerOverlay, DrawerContent, DrawerCloseButton, Select
} from "@chakra-ui/react";
import {
  FaUserMd, FaBed, FaAmbulance, FaMapMarkerAlt, FaVideo, FaExclamationTriangle,
  FaCheckCircle, FaTimes, FaFolderOpen, FaBolt, FaStethoscope, FaHeartbeat, FaRoute,
  FaPlus, FaMinus, FaSignOutAlt, FaFilePdf, FaHistory, FaSyncAlt
} from "react-icons/fa";
import { FiActivity, FiWifiOff } from "react-icons/fi";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ||
  'pk.eyJ1IjoiZXltYXJkMjkiLCJhIjoiY21tcDY4YzNpMGw3bjJzb203YmZyNTVnMyJ9.OvZlnCMfUkUYe6Ib83DUVw';

const WS_URL = resolveWsUrl();

const styleInject = document.createElement('style');
styleInject.textContent = `
  @keyframes pulseRed { 0%,100% { transform: scale(1); box-shadow: 0 0 15px rgba(220,38,38,0.4); } 50% { transform: scale(1.05); box-shadow: 0 0 30px rgba(220,38,38,0.8); } }
  .mapboxgl-popup-content { background-color: #18181b !important; color: #f8fafc !important; border: 1px solid #3f3f46 !important; border-radius: 8px !important; padding: 15px !important; }
  .mapboxgl-popup-anchor-bottom .mapboxgl-popup-tip { border-top-color: #3f3f46 !important; }
  ::-webkit-scrollbar { width: 8px; }
  ::-webkit-scrollbar-track { background: #09090b; }
  ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 4px; }
`;
document.head.appendChild(styleInject);

const clasificarEspecialidad = (motivo) => {
  const s = (motivo || '').toLowerCase();
  if (/torácic|infart|cardio|paro|taquicard/.test(s)) return 'Cardiología';
  if (/fractur|caíd|trauma|accident|choqu/.test(s)) return 'Traumatología';
  if (/convulsion|acv|cerebral|derrame/.test(s)) return 'Neurología';
  if (/quemadura/.test(s)) return 'Cirugía Plástica';
  if (/intoxic|veneno/.test(s)) return 'Toxicología';
  if (/respirator|asfixia|epoc/.test(s)) return 'Neumología';
  if (/parto|embaraz|sangrado transvaginal/.test(s)) return 'Ginecología';
  return 'Urgencias Médicas';
};

const RESPUESTAS_RAPIDAS = [
  "QUIRÓFANO PREPARADO",
  "RAMPA DE URGENCIAS DESPEJADA",
  "EQUIPO DE TRAUMA LISTO",
  "PASAR DIRECTO A SALA DE CHOQUE",
  "TRAER EXPEDIENTE CLÍNICO PREVIO",
  "ESPERANDO EN PUERTA PRINCIPAL"
];

export default function MapaHospitalOptimizado() {
  const navigate = useNavigate();
  const { setAuth } = useAuth();

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
  const isMounted = useRef(true);
  const reportRef = useRef(null);
  const isConnectingRef = useRef(false);

  const [isMobile] = useMediaQuery("(max-width: 768px)");
  const [isTablet] = useMediaQuery("(max-width: 1024px) and (min-width: 769px)");
  const sidebarWidth = isMobile ? "100%" : isTablet ? "400px" : "480px";

  const [hospitalInfo, setHospitalInfo] = useState(null);
  const [ambulances, setAmbulances] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [activeRoutes, setActiveRoutes] = useState([]);
  const [trafficEnabled, setTrafficEnabled] = useState(true);
  const [camasDisponibles, setCamasDisponibles] = useState(0);
  const [camasEmergencia, setCamasEmergencia] = useState(0);

  const [historialExpedientes, setHistorialExpedientes] = useState([]);
  const [patientNotifications, setPatientNotifications] = useState([]);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [selectedAmbulance, setSelectedAmbulance] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportHistory, setReportHistory] = useState([]);
  const [selectedReportVersion, setSelectedReportVersion] = useState(null);
  const [doctorSeleccionado, setDoctorSeleccionado] = useState("");
  const [listaDoctores, setListaDoctores] = useState([]);
  const [confirmReject, setConfirmReject] = useState(false);

  const { isOpen: isNoteOpen, onOpen: onNoteOpen, onClose: onNoteClose } = useDisclosure();
  const { isOpen: isNotificationOpen, onOpen: onNotificationOpen, onClose: onNotificationClose } = useDisclosure();
  const { isOpen: isReportModalOpen, onOpen: onReportModalOpen, onClose: onReportModalClose } = useDisclosure();
  const { isOpen: isExpedientesOpen, onOpen: onExpedientesOpen, onClose: onExpedientesClose } = useDisclosure();

  const [setupStep, setSetupStep] = useState(() => {
  const setupDone = localStorage.getItem('hospitalSetupComplete');
  return setupDone ? 'ready' : 'beds';
});
const [setupBeds, setSetupBeds] = useState(10);

  const toast = useToast();

  const showToast = useCallback((status, title, description) => {
    toast({ title, description, status, duration: 4000, isClosable: true, position: 'top-right' });
  }, [toast]);

  // ==================== CARGA INICIAL ====================
  useEffect(() => {
  if (hospitalInfo) {
    localStorage.setItem('hospitalBeds', JSON.stringify({
      camasEmergencia,
      camasDisponibles
    }));
  }
}, [camasEmergencia, camasDisponibles, hospitalInfo]);
  

  useEffect(() => {
    const cargarDoctores = async () => {
      try {
        const apiBase = (import.meta.env.VITE_API || 'https://emergencity-morelia-v2.onrender.com').replace(/\/+$/, '');
        const r = await fetch(`${apiBase}/api/doctores`);
        if (r.ok) {
          const data = await r.json();
          if (Array.isArray(data)) setListaDoctores(data);
        }
      } catch (_) {}
    };
    cargarDoctores();
  }, []);

  // ==================== WEBSOCKET ====================
  const registerHospital = useCallback(() => {
    if (!hospitalInfo || !ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    ws.current.send(JSON.stringify({
      type: 'register_hospital',
      hospital: {
        ...hospitalInfo,
        camasDisponibles,
        camasEmergencia
      }
    }));
  }, [hospitalInfo, camasDisponibles, camasEmergencia]);

  const sendWS = useCallback((payload) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!isMounted.current || isConnectingRef.current) return;
    if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) return;

    isConnectingRef.current = true;
    connectionAttempts.current += 1;

    try {
      const socket = new WebSocket(WS_URL);
      ws.current = socket;

      socket.onopen = () => {
        if (!isMounted.current) return;
        setWsConnected(true);
        isConnectingRef.current = false;
        connectionAttempts.current = 0;
        registerHospital();
        showToast('success', 'Sistema Conectado', 'Hospital conectado al servidor central');
      };

      socket.onmessage = (event) => {
        if (!isMounted.current) return;
        try {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case 'connection_established':
              break;

            case 'hospital_registered':
              break;

            case 'hospital_beds_update':
              // Sincronización autoritativa del server
              if (data.hospitalId === hospitalInfo?.id) {
                setCamasEmergencia(data.camasEmergencia ?? 0);
                setCamasDisponibles(data.camasDisponibles ?? 0);
              }
              break;

            case 'active_ambulances_update':
              setAmbulances(data.ambulances || []);
              updateAmbulanceMarkers(data.ambulances || []);
              break;

            case 'ambulance_location_broadcast':
            case 'location_update':
              handleAmbulanceLocationUpdate(data);
              break;

            case 'patient_transfer_notification':
              handlePatientTransferNotification(data);
              break;

            case 'patient_accepted_with_route':
            case 'patient_accepted':
              if (data.hospitalId === hospitalInfo?.id) {
                setPatientNotifications(prev => prev.filter(n => n.notificationId !== data.notificationId));
                showToast('success', 'Paciente Aceptado', 'Traslado confirmado — preparar recepción');
              }
              break;

            case 'patient_rejected':
              if (data.hospitalId === hospitalInfo?.id) {
                setPatientNotifications(prev => prev.filter(n => n.notificationId !== data.notificationId));
                clearAmbulanceRoute(data.ambulanceId);
                showToast('warning', 'Paciente Rechazado', 'Se ha notificado a la ambulancia');
              }
              break;

            case 'route_updated':
              handleRouteUpdated(data);
              break;

            case 'active_routes_update':
              (data.routes || []).forEach(handleRouteUpdated);
              break;

            case 'navigation_cancelled':
              handleNavigationCancelled(data);
              break;

            case 'prehospital_report_update':
              handlePrehospitalReportUpdate(data);
              break;

            case 'prehospital_report_history':
              if (data.callId === selectedReport?.callId) {
                setReportHistory(data.versions || []);
                setSelectedReportVersion(data.currentVersion || null);
              }
              break;

            case 'emergency_created_by_operator_broadcast':
              showToast('info', 'Emergencia iniciada por operador',
                `Unidad ${data.ambulanceName || data.ambulanceId} · ${data.emergencyType || ''}`);
              break;

            case 'doctor_connected':
              if (data.doctor) {
                setListaDoctores(prev => {
                  const exists = prev.some(d => d.id === data.doctor.doctorId);
                  return exists ? prev : [...prev, {
                    id: data.doctor.doctorId,
                    nombre: data.doctor.nombre,
                    especialidad: data.doctor.especialidad
                  }];
                });
              }
              break;

            case 'doctor_disconnected':
              setListaDoctores(prev => prev.filter(d => d.id !== data.doctorId));
              break;

            case 'error':
              // Silencioso — puede ser un mensaje transitorio
              break;

            default:
              break;
          }
        } catch (e) {
          console.error('WS message error:', e);
        }
      };

      socket.onclose = (event) => {
        if (!isMounted.current) return;
        setWsConnected(false);
        isConnectingRef.current = false;
        if (event.code !== 1000 && connectionAttempts.current < 5) {
          reconnectTimeout.current = setTimeout(() => connectWebSocket(), 5000);
        }
      };

      socket.onerror = () => {
        if (!isMounted.current) return;
        setWsConnected(false);
        isConnectingRef.current = false;
      };
    } catch (e) {
      isConnectingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerHospital, showToast, hospitalInfo?.id]);

  useEffect(() => {
    if (hospitalInfo) {
      const t = setTimeout(() => connectWebSocket(), 800);
      return () => clearTimeout(t);
    }
  }, [hospitalInfo, connectWebSocket]);

  // Cuando cambian las camas manualmente, actualizar al server
  useEffect(() => {
    if (wsConnected && hospitalInfo) {
      const t = setTimeout(() => registerHospital(), 400);
      return () => clearTimeout(t);
    }
  }, [camasDisponibles, camasEmergencia, wsConnected, hospitalInfo, registerHospital]);

  // ==================== MAPA ====================
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
      try { mapInstance.remove(); } catch (_) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospitalInfo]);

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
            'line-color': ['case',
              ['==', ['get', 'congestion'], 'low'], '#10b981',
              ['==', ['get', 'congestion'], 'moderate'], '#f59e0b',
              ['==', ['get', 'congestion'], 'heavy'], '#ef4444',
              '#10b981'],
            'line-width': isMobile ? 3 : 4,
            'line-opacity': 0.8
          }
        }, 'waterway-label');
      }
    } catch (_) {}
  };

  const add3DBuildings = () => {
    if (!map.current) return;
    try {
      const layers = map.current.getStyle().layers;
      const labelLayerId = layers.find(l => l.type === 'symbol' && l.layout?.['text-field'])?.id;
      if (map.current.getSource('composite') && !map.current.getLayer('3d-buildings-hospital')) {
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
    } catch (_) {}
  };

  const toggleTraffic = () => {
    if (!map.current) return;
    if (trafficEnabled) {
      if (map.current.getLayer('traffic-layer-hospital')) map.current.removeLayer('traffic-layer-hospital');
      setTrafficEnabled(false);
    } else {
      addTrafficLayer();
      setTrafficEnabled(true);
    }
  };

  const placeHospitalMarker = () => {
    if (!map.current || !hospitalInfo) return;
    try {
      if (hospitalMarker.current) hospitalMarker.current.remove();
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="width:70px;height:70px;background:#09090b;border:4px solid #38bdf8;border-radius:50%;
          display:flex;align-items:center;justify-content:center;font-size:32px;
          box-shadow:0 0 25px rgba(56,189,248,0.6);cursor:pointer;">
          <span style="color:#38bdf8;font-weight:900;font-size:28px;">H</span>
        </div>`;
      const popup = new mapboxgl.Popup({ offset: 35 }).setHTML(`
        <div style="text-align:center;">
          <h3 style="font-size:18px;font-weight:900;color:#38bdf8;margin-bottom:5px;">${hospitalInfo.nombre}</h3>
          <p style="font-size:13px;color:#a1a1aa;">${hospitalInfo.direccion}</p>
        </div>`);
      hospitalMarker.current = new mapboxgl.Marker({ element: el })
        .setLngLat([hospitalInfo.lng, hospitalInfo.lat])
        .setPopup(popup)
        .addTo(map.current);
    } catch (_) {}
  };

  const updateAmbulanceMarkers = (list) => {
    if (!map.current) return;
    Object.values(ambulanceMarkers.current).forEach(m => m.remove());
    ambulanceMarkers.current = {};

    list.forEach(amb => {
      if (!amb.location?.lat || !amb.location?.lng) return;
      const isRoute = amb.status === 'en_ruta';
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="width:50px;height:50px;background:${isRoute ? '#10b981' : '#f59e0b'};border:4px solid #18181b;
          border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;
          box-shadow:0 0 20px ${isRoute ? 'rgba(16,185,129,0.7)' : 'rgba(245,158,11,0.7)'};cursor:pointer;">
          <span style="color:#fff;font-weight:900;">A</span>
        </div>`;
      const popup = new mapboxgl.Popup({ offset: 30 }).setHTML(`
        <div style="text-align:center;">
          <strong style="font-size:16px;color:${isRoute ? '#10b981' : '#f59e0b'};">UNIDAD ${amb.id}</strong>
          <div style="margin-top:8px;font-size:13px;color:#d4d4d8;">
            <p>ESTADO: ${(amb.status || '').replace('_', ' ').toUpperCase()}</p>
            <p>VELOCIDAD: ${amb.speed || 0} km/h</p>
          </div>
        </div>`);
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([amb.location.lng, amb.location.lat])
        .setPopup(popup)
        .addTo(map.current);
      ambulanceMarkers.current[amb.id] = marker;
      el.addEventListener('click', () => {
        setSelectedAmbulance(amb);
        map.current.flyTo({ center: [amb.location.lng, amb.location.lat], zoom: 16, duration: 800 });
      });
    });
  };

  const handleAmbulanceLocationUpdate = (data) => {
    if (!data.ambulanceId || !data.location) return;
    const marker = ambulanceMarkers.current[data.ambulanceId];
    if (marker) {
      marker.setLngLat([data.location.lng, data.location.lat]);
    }
    setAmbulances(prev => prev.map(a =>
      a.id === data.ambulanceId
        ? { ...a, location: data.location, speed: data.speed, heading: data.heading, status: data.status || a.status }
        : a
    ));
  };

  const cleanupMarkers = () => {
    if (hospitalMarker.current) hospitalMarker.current.remove();
    Object.values(ambulanceMarkers.current).forEach(m => m.remove());
    ambulanceMarkers.current = {};
    Object.keys(routeLayersByAmbulance.current).forEach(id => clearAmbulanceRoute(id));
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

  const drawAmbulanceRoute = (ambulanceId, routeGeometry) => {
    if (!map.current || !routeGeometry) return;
    clearAmbulanceRoute(ambulanceId);

    const sourceId = `route-${ambulanceId}-${Date.now()}`;
    const glowId = `${sourceId}-glow`;

    try {
      map.current.addSource(sourceId, {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: routeGeometry }, properties: {} }
      });
      map.current.addLayer({
        id: glowId, type: 'line', source: sourceId,
        paint: { 'line-color': '#38bdf8', 'line-width': 16, 'line-opacity': 0.3, 'line-blur': 3 }
      });
      map.current.addLayer({
        id: sourceId, type: 'line', source: sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#38bdf8', 'line-width': 8, 'line-opacity': 0.9 }
      });
      routeLayersByAmbulance.current[ambulanceId] = [sourceId, glowId];
      routeSourcesByAmbulance.current[ambulanceId] = [sourceId];

      if (hospitalInfo) {
        const bounds = new mapboxgl.LngLatBounds();
        bounds.extend([hospitalInfo.lng, hospitalInfo.lat]);
        routeGeometry.forEach(c => bounds.extend([c[0], c[1]]));
        map.current.fitBounds(bounds, { padding: 80, duration: 1200 });
      }
    } catch (_) {}
  };

const handleRouteUpdated = (data) => {
  const { ambulanceId, hospitalId, routeGeometry, distance, duration } = data;
  if (hospitalId && hospitalId !== hospitalInfo?.id) return;

  if (routeGeometry) {
    drawAmbulanceRoute(ambulanceId, routeGeometry, distance, duration);

    // ⬅️ NUEVO: forzar visibilidad del marcador de la ambulancia
    const marker = ambulanceMarkers.current[ambulanceId];
    if (marker) {
      marker.getElement().style.zIndex = '100';
    }

    // ⬅️ NUEVO: auto-centrar en la ruta si es la primera vez que llega
    if (!activeRoutes.some(r => r.ambulanceId === ambulanceId)) {
      setTimeout(() => {
        if (!map.current) return;
        const bounds = new mapboxgl.LngLatBounds();
        bounds.extend([hospitalInfo.lng, hospitalInfo.lat]);
        routeGeometry.forEach(c => bounds.extend([c[0], c[1]]));
        map.current.fitBounds(bounds, { padding: 80, duration: 1200 });
      }, 300);
    }
  } else {
    clearAmbulanceRoute(ambulanceId);
    return;
  }

  setActiveRoutes(prev => {
    const idx = prev.findIndex(r => r.ambulanceId === ambulanceId);
    const newRoute = {
      ambulanceId,
      hospitalId: hospitalId || hospitalInfo?.id,
      distance, duration,
      geometry: routeGeometry,
      updatedAt: new Date().toISOString()
    };
    if (idx >= 0) {
      const copy = [...prev];
      copy[idx] = newRoute;
      return copy;
    }
    return [...prev, newRoute];
  });
};

  const handleNavigationCancelled = (data) => {
    if (data.ambulanceId) clearAmbulanceRoute(data.ambulanceId);
  };

  // ==================== NOTIFICACIONES ====================
  const handlePatientTransferNotification = (data) => {
    const notification = {
      ...data,
      id: data.notificationId || `notif_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      status: 'pending'
    };
    setPatientNotifications(prev => [...prev, notification]);
    setSelectedNotification(notification);
    setConfirmReject(false);

    if (data.routeGeometry) drawAmbulanceRoute(data.ambulanceId, data.routeGeometry);
    onNotificationOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  };

  const acceptPatient = () => {
    if (!sendWS({
      type: 'hospital_accept_patient',
      notificationId: selectedNotification.notificationId,
      hospitalId: hospitalInfo.id,
      hospitalInfo
    })) {
      showToast('error', 'Error', 'Sin conexión');
      return;
    }
    setPatientNotifications(prev => prev.filter(n => n.notificationId !== selectedNotification.notificationId));
    onNotificationClose();
  };

  const rejectPatient = () => {
    if (!confirmReject) { setConfirmReject(true); return; }
    if (!sendWS({
      type: 'hospital_reject_patient',
      notificationId: selectedNotification.notificationId,
      hospitalId: hospitalInfo.id,
      reason: 'Falta de camas / Capacidad superada'
    })) {
      showToast('error', 'Error', 'Sin conexión');
      return;
    }
    setPatientNotifications(prev => prev.filter(n => n.notificationId !== selectedNotification.notificationId));
    clearAmbulanceRoute(selectedNotification.ambulanceId);
    onNotificationClose();
  };

  const enviarRespuestaRapida = (mensaje) => {
    if (!selectedAmbulance) return;
    if (!sendWS({
      type: 'hospital_note',
      ambulanceId: selectedAmbulance.id,
      hospitalId: hospitalInfo.id,
      note: { id: Date.now(), message: mensaje, timestamp: new Date().toLocaleTimeString() }
    })) {
      showToast('error', 'Error', 'Sin conexión');
      return;
    }
    showToast('success', 'Aviso Enviado', `Comunicación enviada a la unidad ${selectedAmbulance.id}`);
    onNoteClose();
  };

  // ==================== REPORTES PREHOSPITALARIOS ====================
  const handlePrehospitalReportUpdate = (data) => {
    const { callId, version, report, patientInfo, urgentOnly } = data;

    // Guardar versión en historial local de expedientes
    setHistorialExpedientes(prev => {
      const existingIdx = prev.findIndex(e => e.callId === callId);
      const entry = {
        callId,
        version,
        urgentOnly,
        report,
        patientInfo,
        fecha: new Date().toLocaleString(),
        paciente: report?.seccionD ? {
          nombre: report.seccionD.nombre || 'Paciente',
          edad: report.seccionD.edad,
          sexo: report.seccionD.sexo,
          motivo_urgencia: report.seccionF?.motivo_principal,
          descripcion_lesion: report.seccionH?.lesiones_exposicion,
          observaciones: report.seccionN?.diagnostico_presuntivo
        } : null,
        signos_vitales: report?.seccionI ? {
          frecuencia_cardiaca: report.seccionI.fc,
          saturacion_oxigeno: report.seccionI.spo2,
          tension_arterial: report.seccionI.ta,
          nivel_glucosa: report.seccionI.glucemia
        } : null,
        intervenciones: report?.intervenciones || []
      };
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = { ...copy[existingIdx], ...entry };
        return copy;
      }
      return [entry, ...prev];
    });

    // Si hay un expediente abierto para ese callId, actualizar
    if (selectedReport?.callId === callId) {
      setReportHistory(prev => [...prev, { version, report, timestamp: new Date().toISOString() }]);
      setSelectedReportVersion(version);
      setSelectedReport(prev => ({ ...prev, ...report }));
    }

    // Pre-seleccionar especialista
    const motivo = report?.seccionF?.motivo_principal || '';
    const espReq = clasificarEspecialidad(motivo);
    const docIdeal = listaDoctores.find(d => d.especialidad?.toLowerCase() === espReq.toLowerCase());
    if (docIdeal) setDoctorSeleccionado(docIdeal.id);

    showToast('info', `Reporte v${version} recibido`, urgentOnly ? 'Datos urgentes — preparar recursos' : 'Actualización de expediente');
  };

  // ==================== PDF ====================
  const generarPDFConDatos = async (reporteMeta) => {
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.text("EXPEDIENTE CLÍNICO DE URGENCIAS", 20, 20);

      pdf.setFontSize(11);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Folio: ${reporteMeta?.callId || '--'}`, 20, 32);
      pdf.text(`Fecha: ${reporteMeta?.fecha || '--'}`, 20, 40);
      pdf.text(`Paciente: ${reporteMeta?.paciente?.nombre || 'Desconocido'}`, 20, 52);
      pdf.text(`Edad: ${reporteMeta?.paciente?.edad || '--'}  Sexo: ${reporteMeta?.paciente?.sexo || '--'}`, 20, 60);
      pdf.text(`Motivo: ${reporteMeta?.paciente?.motivo_urgencia || 'No especificado'}`, 20, 68);

      pdf.setFont("helvetica", "bold");
      pdf.text("Signos Vitales:", 20, 82);
      pdf.setFont("helvetica", "normal");
      pdf.text(`FC: ${reporteMeta?.signos_vitales?.frecuencia_cardiaca || '--'} bpm`, 25, 92);
      pdf.text(`SpO2: ${reporteMeta?.signos_vitales?.saturacion_oxigeno || '--'} %`, 25, 100);
      pdf.text(`TA: ${reporteMeta?.signos_vitales?.tension_arterial || '--'}`, 25, 108);
      pdf.text(`Glucosa: ${reporteMeta?.signos_vitales?.nivel_glucosa || '--'}`, 25, 116);

      pdf.save(`Expediente_${reporteMeta?.callId || Date.now()}.pdf`);
      showToast('success', 'PDF Generado', 'Documento descargado');
    } catch (_) {
      showToast('error', 'Error', 'No se pudo exportar el PDF');
    }
  };

  const generarPDF = async () => {
    const input = reportRef.current;
    if (!input) return;
    try {
      const canvas = await html2canvas(input, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfW = pdf.internal.pageSize.getWidth();
      const imgH = (canvas.height * pdfW) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, imgH);
      pdf.save(`Reporte_${selectedReport?.callId || Date.now()}.pdf`);
    } catch (_) {
      showToast('error', 'Error', 'Fallo al generar documento');
    }
  };

  const confirmarReporteYAsignar = () => {
    if (selectedReport?.callId && doctorSeleccionado) {
      sendWS({
        type: 'assign_doctor',
        callId: selectedReport.callId,
        doctorId: doctorSeleccionado,
        reason: 'Asignación desde hospital'
      });
    }
    generarPDF();
    setTimeout(() => {
      showToast('success', 'Recepción Confirmada', 'Paciente ingresado y doctor notificado');
      onReportModalClose();
    }, 1200);
  };

  const centerOnHospital = () => {
    if (!map.current || !hospitalInfo) return;
    map.current.flyTo({ center: [hospitalInfo.lng, hospitalInfo.lat], zoom: 16, pitch: 45, duration: 1000 });
  };

  // ==================== RENDER ====================
  if (!hospitalInfo) {
    return (
      <ChakraProvider>
        <Box h="100vh" bg="#09090b" display="flex" alignItems="center" justifyContent="center">
          <VStack spacing={6}>
            <Spinner size="xl" color="#38bdf8" thickness="4px" />
            <Text fontSize="20px" fontWeight="900" color="white" letterSpacing="2px">INICIALIZANDO SISTEMA...</Text>
          </VStack>
        </Box>
      </ChakraProvider>
    );
  }

    // ── BLOQUE 2: configuración inicial de camas ──
  if (setupStep === 'beds') {
    return (
      <ChakraProvider>
        <Box h="100vh" bg="#09090b" display="flex" alignItems="center" justifyContent="center" p={4}>
          <Box maxW="480px" w="100%" bg="#18181b" border="2px solid #38bdf8" borderRadius="2xl" p={6}>
            <VStack spacing={5}>
              <Icon as={FaBed} color="#38bdf8" boxSize={10} />
              <Text fontSize="20px" fontWeight="900" color="white" textAlign="center" letterSpacing="1px">
                CAPACIDAD DE URGENCIAS
              </Text>
              <Text fontSize="14px" color="#a1a1aa" textAlign="center">
                Indique cuántas camas de urgencias tiene disponibles en este momento.
              </Text>

              <HStack spacing={4} w="100%">
                <IconButton
                  aria-label="Restar"
                  icon={<FaMinus />}
                  onClick={() => setSetupBeds(v => Math.max(0, v - 1))}
                  w="60px" h="60px"
                  bg="#27272a" color="white"
                  _hover={{ bg: '#3f3f46' }}
                />
                <Flex flex={1} h="80px" bg="#09090b" border="2px solid #3f3f46" borderRadius="xl" align="center" justify="center">
                  <Text fontSize="36px" fontWeight="900" color="white">{setupBeds}</Text>
                </Flex>
                <IconButton
                  aria-label="Sumar"
                  icon={<FaPlus />}
                  onClick={() => setSetupBeds(v => v + 1)}
                  w="60px" h="60px"
                  bg="#27272a" color="white"
                  _hover={{ bg: '#3f3f46' }}
                />
              </HStack>

              <Button
                w="100%" h="65px"
                bg="#10b981" color="white"
                fontSize="16px" fontWeight="900" letterSpacing="1px"
                _hover={{ bg: '#059669' }}
                onClick={() => {
                  setCamasEmergencia(setupBeds);
                  setCamasDisponibles(setupBeds);
                  localStorage.setItem('hospitalSetupComplete', 'true');
                  localStorage.setItem('hospitalBeds', JSON.stringify({
                    camasEmergencia: setupBeds,
                    camasDisponibles: setupBeds
                  }));
                  setSetupStep('ready');
                }}
              >
                CONFIRMAR CAPACIDAD
              </Button>
            </VStack>
          </Box>
        </Box>
      </ChakraProvider>
    );
  }

  return (
    <ChakraProvider>
      <Box h="100vh" w="100vw" bg="#09090b" display="flex" flexDirection="column" overflow="hidden">
        {/* HEADER */}
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
            {/* Camas de emergencia */}
            <HStack bg="#18181b" px={4} py={2} borderRadius="xl" border="2px solid #27272a">
              <Icon as={FaBed} color={camasEmergencia > 2 ? "#10b981" : camasEmergencia > 0 ? "#f59e0b" : "#ef4444"} boxSize={6} />
              <VStack align="start" spacing={0} ml={2} mr={3}>
                <Text fontSize="10px" fontWeight="900" color="#a1a1aa" letterSpacing="1px">CAMAS URG.</Text>
                <Text fontSize="24px" fontWeight="900" color="#f8fafc" lineHeight="1">{camasEmergencia}</Text>
              </VStack>
              <ButtonGroup size="sm" isAttached>
                <IconButton
                  icon={<FaMinus />} aria-label="Restar cama"
                  onClick={() => setCamasEmergencia(v => Math.max(0, v - 1))}
                  bg="#27272a" color="white" _hover={{ bg: '#3f3f46' }}
                />
                <IconButton
                  icon={<FaPlus />} aria-label="Sumar cama"
                  onClick={() => setCamasEmergencia(v => v + 1)}
                  bg="#27272a" color="white" _hover={{ bg: '#3f3f46' }}
                />
              </ButtonGroup>
            </HStack>

            <Button
              h="55px" px={4} bg="#18181b" color="#38bdf8" border="1px solid #3f3f46"
              _hover={{ bg: '#27272a', borderColor: '#38bdf8' }}
              fontWeight="900" fontSize="14px" onClick={onExpedientesOpen} leftIcon={<FaHistory />}
            >
              EXPEDIENTES ({historialExpedientes.length})
            </Button>

            {patientNotifications.length > 0 && (
              <Button
                h="55px" px={5} bg="#ef4444" color="white" fontWeight="900" fontSize="15px"
                animation="pulseRed 2s infinite" onClick={onNotificationOpen}
                leftIcon={<FaExclamationTriangle />}
              >
                ALERTA ({patientNotifications.length})
              </Button>
            )}

            <Badge
              display="flex" alignItems="center" gap={2} px={4} py={3} borderRadius="xl"
              bg={wsConnected ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}
              border="1px solid" borderColor={wsConnected ? '#10b981' : '#ef4444'}
              color={wsConnected ? '#10b981' : '#ef4444'} fontSize="13px" fontWeight="900"
            >
              <Icon as={wsConnected ? FiActivity : FiWifiOff} boxSize={4} />
              {wsConnected ? 'ACTIVO' : 'DESCONECTADO'}
            </Badge>

            <Tooltip label="Cerrar Sesión" placement="bottom" hasArrow bg="#18181b" color="#ef4444" fontWeight="bold">
              <IconButton
                icon={<FaSignOutAlt />} aria-label="Cerrar Sesión" onClick={closeSession}
                bg="#18181b" color="#a1a1aa" border="1px solid #27272a" borderRadius="xl"
                w="50px" h="50px"
                _hover={{ bg: 'rgba(239,68,68,0.2)', color: '#ef4444', borderColor: '#ef4444' }}
              />
            </Tooltip>
          </HStack>
        </Flex>

        {/* BODY */}
        <Flex flex={1} overflow="hidden">
          <Box w={sidebarWidth} bg="#09090b" borderRight="1px solid #27272a" display="flex" flexDirection="column" zIndex={5}>
            <Box p={5} borderBottom="1px solid #27272a">
              <Text fontSize="16px" fontWeight="900" color="#f8fafc" letterSpacing="1px">MONITOREO DE UNIDADES</Text>
              <Text fontSize="12px" color="#a1a1aa" mt={1}>Gestión y seguimiento de ambulancias en campo</Text>
            </Box>

            <Box flex={1} overflowY="auto" p={5} sx={{ '&::-webkit-scrollbar': { width: '8px' }, '&::-webkit-scrollbar-thumb': { bg: '#3f3f46', borderRadius: '4px' } }}>
              {activeRoutes.length > 0 && (
                <Box mb={8}>
                  <HStack mb={4}><Icon as={FaRoute} color="#38bdf8" boxSize={5} /><Text fontSize="15px" fontWeight="900" color="#e4e4e7">RUTAS EN CURSO ({activeRoutes.length})</Text></HStack>
                  <VStack spacing={3} align="stretch">
                    {activeRoutes.map(route => (
                      <Box key={route.ambulanceId} p={4} bg="#18181b" borderRadius="xl" border="1px solid #38bdf8">
                        <Flex justify="space-between" align="center" mb={2}>
                          <Text fontSize="18px" fontWeight="900" color="#f8fafc">{route.ambulanceId}</Text>
                          <Badge bg="#0ea5e9" color="white" fontSize="13px" px={3} py={1} fontWeight="900">
                            {Math.round((route.duration || 0) / 60)} MIN
                          </Badge>
                        </Flex>
                        <Text fontSize="13px" fontWeight="700" color="#a1a1aa" mb={3}>
                          DISTANCIA: {((route.distance || 0) / 1000).toFixed(1)} km
                        </Text>
                        <HStack spacing={2}>
                          <Button flex={1} size="md" bg="#27272a" color="white" _hover={{ bg: '#3f3f46' }} fontSize="12px" fontWeight="800"
                            onClick={() => { if (route.geometry && map.current) { const b = new mapboxgl.LngLatBounds(); route.geometry.forEach(c => b.extend([c[0], c[1]])); map.current.fitBounds(b, { padding: 80 }); } }}>
                            ENFOCAR RUTA
                          </Button>
                          <Button size="md" bg="#27272a" color="#ef4444" _hover={{ bg: '#dc2626', color: 'white' }} onClick={() => clearAmbulanceRoute(route.ambulanceId)}>
                            <Icon as={FaTimes} />
                          </Button>
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
                  <Text fontSize="14px" fontWeight="800" color="#a1a1aa">Sin unidades activas</Text>
                </Box>
              ) : (
                <VStack spacing={4} align="stretch">
                  {ambulances.map(amb => (
                    <Box key={amb.id} p={4} bg="#18181b" borderRadius="xl" border="1px solid #27272a" borderLeft="6px solid"
                      borderLeftColor={amb.status === 'en_ruta' ? '#10b981' : amb.status === 'fuera_de_servicio' ? '#64748b' : '#f59e0b'}>
                      <Flex justify="space-between" align="center" mb={3}>
                        <Text fontSize="18px" fontWeight="900" color="#f8fafc">{amb.id}</Text>
                        <Badge bg={amb.status === 'en_ruta' ? '#10b981' : amb.status === 'fuera_de_servicio' ? '#64748b' : '#f59e0b'}
                          color="white" px={3} py={1} fontSize="11px" fontWeight="900">
                          {(amb.status || '').replace('_', ' ').toUpperCase()}
                        </Badge>
                      </Flex>
                      <HStack justify="space-between" spacing={3}>
                        <Button flex={1} h="50px" bg="#27272a" color="white" _hover={{ bg: '#3f3f46' }} fontSize="12px" fontWeight="900"
                          onClick={() => { if (amb.location && map.current) map.current.flyTo({ center: [amb.location.lng, amb.location.lat], zoom: 16 }); }}>
                          UBICAR MAPA
                        </Button>
                        <Button flex={1} h="50px" bg="#0284c7" color="white" _hover={{ bg: '#0369a1' }} fontSize="12px" fontWeight="900"
                          onClick={() => { setSelectedAmbulance(amb); onNoteOpen(); }}>
                          COMUNICAR
                        </Button>
                      </HStack>
                    </Box>
                  ))}
                </VStack>
              )}
            </Box>

            <Box p={5} borderTop="1px solid #27272a">
              <VStack spacing={3}>
                <Button w="100%" h="55px" bg="#27272a" color="white" _hover={{ bg: '#3f3f46' }} fontSize="14px" fontWeight="900"
                  leftIcon={<Icon as={FaMapMarkerAlt} />} onClick={centerOnHospital}>
                  CENTRAR EN HOSPITAL
                </Button>
                <Button w="100%" h="55px" bg={trafficEnabled ? "#f59e0b" : "#27272a"} color={trafficEnabled ? "black" : "white"}
                  _hover={{ bg: trafficEnabled ? '#d97706' : '#3f3f46' }} fontSize="14px" fontWeight="900" onClick={toggleTraffic}>
                  {trafficEnabled ? 'OCULTAR TRÁFICO' : 'MOSTRAR TRÁFICO'}
                </Button>
              </VStack>
            </Box>
          </Box>

          <Box flex={1} position="relative">
            <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
          </Box>
        </Flex>

        {/* DRAWER EXPEDIENTES */}
        <Drawer isOpen={isExpedientesOpen} placement="right" onClose={onExpedientesClose} size="md">
          <DrawerOverlay backdropFilter="blur(10px)" />
          <DrawerContent bg="#09090b" color="white" borderLeft="1px solid #27272a">
            <DrawerCloseButton color="white" />
            <DrawerHeader borderBottom="1px solid #27272a" fontSize="20px" fontWeight="900">
              HISTORIAL DE EXPEDIENTES
            </DrawerHeader>
            <DrawerBody p={6}>
              {historialExpedientes.length === 0 ? (
                <VStack spacing={4} mt={10} textAlign="center">
                  <Icon as={FaFolderOpen} boxSize={12} color="#52525b" />
                  <Text color="#a1a1aa" fontWeight="800">No hay expedientes registrados.</Text>
                </VStack>
              ) : (
                <VStack spacing={4} align="stretch">
                  {historialExpedientes.map((exp, i) => (
                    <Box key={i} p={4} bg="#18181b" borderRadius="xl" border="1px solid #3f3f46">
                      <HStack justify="space-between" mb={2}>
                        <Text fontSize="15px" fontWeight="900" color="white">{exp.callId || 'Sin folio'}</Text>
                        <Badge colorScheme="blue" fontSize="10px">v{exp.version || 1}</Badge>
                      </HStack>
                      <Text fontSize="13px" color="#a1a1aa" mb={1}>Paciente: {exp.paciente?.nombre || '--'}</Text>
                      <Text fontSize="12px" color="#71717a" mb={3}>{exp.fecha}</Text>
                      <Button w="100%" h="45px" bg="#0284c7" color="white" _hover={{ bg: '#0369a1' }} fontWeight="900"
                        leftIcon={<FaFilePdf />} onClick={() => generarPDFConDatos(exp)}>
                        DESCARGAR PDF
                      </Button>
                    </Box>
                  ))}
                </VStack>
              )}
            </DrawerBody>
          </DrawerContent>
        </Drawer>

        {/* MODAL NOTIFICACIÓN */}
        <Modal isOpen={isNotificationOpen} onClose={() => {}} size="2xl" isCentered closeOnOverlayClick={false}>
          <ModalOverlay backdropFilter="blur(20px)" bg="rgba(0,0,0,0.85)" />
          <ModalContent bg="#09090b" border="2px solid #3f3f46" borderRadius="2xl" overflow="hidden">
            <Box bg="#eab308" p={5} textAlign="center">
              <Text fontSize="22px" fontWeight="900" color="black" letterSpacing="2px">ALERTA DE TRASLADO</Text>
            </Box>
            <ModalBody p={8}>
              <SimpleGrid columns={2} spacing={6} mb={6}>
                <Box bg="#18181b" p={5} borderRadius="xl" border="1px solid #3f3f46" textAlign="center">
                  <Text fontSize="12px" color="#a1a1aa" fontWeight="900" mb={2}>UNIDAD</Text>
                  <Text fontSize="32px" fontWeight="900" color="#f8fafc">{selectedNotification?.ambulanceId}</Text>
                </Box>
                <Box bg="#18181b" p={5} borderRadius="xl" border="1px solid #3f3f46" textAlign="center">
                  <Text fontSize="12px" color="#a1a1aa" fontWeight="900" mb={2}>TIPO</Text>
                  <Text fontSize="20px" fontWeight="900" color="#ef4444" lineHeight="1.2">
                    {selectedNotification?.patientInfo?.condition || selectedNotification?.emergencyType || 'URGENCIA'}
                  </Text>
                </Box>
              </SimpleGrid>

              {selectedNotification?.patientInfo?.cantidad > 1 && (
                <Box bg="rgba(245,158,11,0.15)" p={4} borderRadius="md" border="1px solid #f59e0b" mb={5}>
                  <Text fontSize="14px" fontWeight="900" color="#f59e0b" textAlign="center">
                    INCIDENTE MÚLTIPLE — {selectedNotification.patientInfo.cantidad} PACIENTES
                  </Text>
                  {(selectedNotification.patientInfo.resumen || []).map((r, i) => (
                    <Text key={i} fontSize="12px" color="white" mt={1}>{r}</Text>
                  ))}
                </Box>
              )}

              <VStack spacing={4}>
                <HStack w="100%" spacing={4}>
                  <Button flex={1} h="80px" fontSize="18px" fontWeight="900" bg="#10b981" color="white"
                    _hover={{ bg: '#059669' }} onClick={acceptPatient}>
                    ACEPTAR RECEPCIÓN
                  </Button>
                  <Button flex={1} h="80px" fontSize="16px" fontWeight="900"
                    bg={confirmReject ? "#dc2626" : "#18181b"} color={confirmReject ? "white" : "#ef4444"}
                    border={confirmReject ? "none" : "2px solid #ef4444"} _hover={{ bg: '#b91c1c', color: 'white' }}
                    onClick={rejectPatient}>
                    {confirmReject ? "CONFIRMAR RECHAZO" : "RECHAZAR"}
                  </Button>
                </HStack>
              </VStack>
            </ModalBody>
          </ModalContent>
        </Modal>

        {/* MODAL REPORTE CLÍNICO */}
        <Modal isOpen={isReportModalOpen} onClose={onReportModalClose} size="5xl" scrollBehavior="inside" closeOnOverlayClick={false}>
          <ModalOverlay backdropFilter="blur(15px)" bg="rgba(0,0,0,0.85)" />
          <ModalContent bg="#09090b" border="1px solid #3f3f46" borderRadius="2xl">
            <Box p={6} bg="#18181b" borderBottom="1px solid #27272a">
              <HStack justify="space-between">
                <HStack>
                  <Icon as={FaFolderOpen} color="#38bdf8" boxSize={6} />
                  <Text fontSize="22px" fontWeight="900" color="white">REPORTE PREHOSPITALARIO</Text>
                </HStack>
                <Badge bg="#ef4444" color="white" px={4} py={2} fontSize="14px" fontWeight="900" borderRadius="md">
                  TRIAGE
                </Badge>
              </HStack>
            </Box>

            <ModalBody p={0} bg="#09090b">
              <Box ref={reportRef} p={8} bg="#09090b">
                <SimpleGrid columns={2} spacing={6} mb={6}>
                  <Box bg="#18181b" p={5} borderRadius="xl" border="1px solid #27272a">
                    <HStack mb={3}><Icon as={FaUserMd} color="#38bdf8"/><Text fontSize="13px" color="#a1a1aa" fontWeight="900">PACIENTE</Text></HStack>
                    <Text fontSize="24px" fontWeight="900" color="white" mb={1}>{selectedReport?.seccionD?.nombre || 'Desconocido'}</Text>
                    <Text fontSize="16px" fontWeight="700" color="#a1a1aa">{selectedReport?.seccionD?.edad || '--'} años · {selectedReport?.seccionD?.sexo || '--'}</Text>
                  </Box>
                  <Box bg="#18181b" p={5} borderRadius="xl" border="1px solid #27272a">
                    <HStack mb={3}><Icon as={FaHeartbeat} color="#ef4444"/><Text fontSize="13px" color="#a1a1aa" fontWeight="900">SIGNOS VITALES</Text></HStack>
                    <SimpleGrid columns={2} spacing={3}>
                      <Box textAlign="center"><Text fontSize="10px" color="#a1a1aa" fontWeight="900">FC</Text><Text fontSize="22px" fontWeight="900" color="#ef4444">{selectedReport?.seccionI?.fc || '--'}</Text></Box>
                      <Box textAlign="center"><Text fontSize="10px" color="#a1a1aa" fontWeight="900">SpO2</Text><Text fontSize="22px" fontWeight="900" color="#38bdf8">{selectedReport?.seccionI?.spo2 || '--'}</Text></Box>
                      <Box textAlign="center"><Text fontSize="10px" color="#a1a1aa" fontWeight="900">TA</Text><Text fontSize="18px" fontWeight="900" color="white">{selectedReport?.seccionI?.ta || '--'}</Text></Box>
                      <Box textAlign="center"><Text fontSize="10px" color="#a1a1aa" fontWeight="900">GLUC</Text><Text fontSize="18px" fontWeight="900" color="white">{selectedReport?.seccionI?.glucemia || '--'}</Text></Box>
                    </SimpleGrid>
                  </Box>
                </SimpleGrid>

                <Box bg="rgba(14,165,233,0.1)" p={5} borderRadius="xl" border="2px solid #0ea5e9" mb={6}>
                  <Text fontSize="14px" color="#0ea5e9" fontWeight="900" mb={3}>ASIGNACIÓN MÉDICA</Text>
                  <Select size="lg" bg="#09090b" border="1px solid #3f3f46" color="white" fontWeight="900"
                    h="55px" value={doctorSeleccionado} onChange={(e) => setDoctorSeleccionado(e.target.value)}>
                    <option value="" style={{ background: '#09090b' }}>-- SELECCIONAR MÉDICO --</option>
                    {listaDoctores.map(doc => (
                      <option key={doc.id} value={doc.id} style={{ background: '#09090b' }}>
                        {doc.nombre} — {doc.especialidad}
                      </option>
                    ))}
                  </Select>
                </Box>
              </Box>
            </ModalBody>

            <ModalFooter bg="#09090b" borderTop="1px solid #27272a" p={6}>
              <HStack w="100%" spacing={4}>
                <Button flex={0.3} h="65px" variant="ghost" color="#a1a1aa" fontSize="15px" fontWeight="900"
                  _hover={{ bg: '#27272a', color: 'white' }} onClick={onReportModalClose}>
                  CERRAR
                </Button>
                <Button flex={0.7} h="65px" bg="#10b981" color="white" fontSize="16px" fontWeight="900"
                  _hover={{ bg: '#059669' }} onClick={confirmarReporteYAsignar} leftIcon={<FaFolderOpen />}>
                  GENERAR PDF Y ASIGNAR
                </Button>
              </HStack>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* MODAL COMUNICACIÓN RÁPIDA */}
        <Modal isOpen={isNoteOpen} onClose={onNoteClose} size="3xl" isCentered>
          <ModalOverlay backdropFilter="blur(10px)" bg="rgba(0,0,0,0.8)" />
          <ModalContent bg="#09090b" border="1px solid #3f3f46" borderRadius="2xl" overflow="hidden">
            <Box p={6} bg="#18181b" borderBottom="1px solid #27272a">
              <Text fontSize="20px" fontWeight="900" color="white">AVISO A UNIDAD: {selectedAmbulance?.id}</Text>
            </Box>
            <ModalBody p={8}>
              <Text fontSize="13px" color="#a1a1aa" fontWeight="900" mb={5}>SELECCIONE UNA RESPUESTA:</Text>
              <SimpleGrid columns={2} spacing={5}>
                {RESPUESTAS_RAPIDAS.map((msg, i) => (
                  <Button key={i} h="85px" whiteSpace="normal" bg="#27272a" color="white" fontSize="16px" fontWeight="900"
                    _hover={{ bg: '#0284c7' }} onClick={() => enviarRespuestaRapida(msg)}>
                    {msg}
                  </Button>
                ))}
              </SimpleGrid>
            </ModalBody>
            <ModalFooter p={6} bg="#18181b" borderTop="1px solid #27272a">
              <Button w="100%" h="60px" bg="#3f3f46" color="white" fontSize="16px" fontWeight="900"
                _hover={{ bg: '#52525b' }} onClick={onNoteClose}>
                CANCELAR
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </Box>
    </ChakraProvider>
  );
}