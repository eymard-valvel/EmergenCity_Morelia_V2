import React, { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/useAuth.js";
import { deleteCookie } from "../../helpers/cookies.js";
import { resolveWsUrl } from "../../helpers/wsUrl.js";
import logo from "../img/Logo.png";
import { useLiveQuery } from "dexie-react-hooks";
import { db, upsertReport, upsertManyReports, clearEmergencyDB } from "../db/emergencyDB";
import {
  ChakraProvider, Box, Button, VStack, Text, HStack, Badge, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalBody, ModalFooter, useDisclosure, useToast, Spinner, SimpleGrid,
  useMediaQuery, IconButton, Flex, ButtonGroup, Tooltip, Icon, Drawer, DrawerBody, DrawerHeader,
  DrawerOverlay, DrawerContent, DrawerCloseButton
} from "@chakra-ui/react";
import {
  FaBed, FaAmbulance, FaMapMarkerAlt, FaExclamationTriangle,
  FaCheckCircle, FaTimes, FaFolderOpen, FaRoute,
  FaPlus, FaMinus, FaSignOutAlt, FaFilePdf, FaHistory, FaEye
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

const hasValue = (v) => v !== undefined && v !== null && String(v).trim() !== '' && String(v).trim() !== '--';

const limpiarTexto = (texto) => {
  if (!texto) return '';
  return String(texto).replace(/\[VideoID:.*?\]/g, '').trim();
};

const normalizeExpediente = (r) => {
  if (!r) return null;
  const rep = r.report || {};
  const secD = rep.seccionD || r.seccionD;
  const secF = rep.seccionF || r.seccionF;
  const secH = rep.seccionH || r.seccionH;
  const secI = rep.seccionI || r.seccionI;
  const secN = rep.seccionN || r.seccionN;
  const triaje = r.triaje || rep.triaje;
  const glasgow = r.glasgow || rep.glasgow;

  return {
    ...r,
    callId: r.callId || (r.id_reporte ? `REST-${r.id_reporte}` : 'S/F'),
    version: r.version || 1,
    isFinal: r.isFinal ?? true,
    paciente: r.paciente || (secD || secF || secH || secN || r.patientInfo ? {
      nombre: secD?.nombre || r.patientInfo?.nombre || 'Paciente',
      edad: secD?.edad || r.patientInfo?.edad,
      sexo: secD?.sexo || r.patientInfo?.sexo,
      motivo_urgencia: secF?.motivo_principal || r.patientInfo?.condition,
      descripcion_lesion: secH?.lesiones_exposicion,
      observaciones: secN?.diagnostico_presuntivo
    } : null),
    signos_vitales: r.signos_vitales || (secI ? {
      frecuencia_cardiaca: secI.fc,
      frecuencia_respiratoria: secI.fr,
      saturacion_oxigeno: secI.spo2,
      tension_arterial: secI.ta,
      temperatura: secI.temp,
      nivel_glucosa: secI.glucemia
    } : null),
    intervenciones: r.intervenciones || rep.intervenciones || [],
    triaje,
    glasgow,
    codigo_prioridad_color: r.codigo_prioridad_color || triaje?.color || '#ef4444',
    codigo_prioridad: r.codigo_prioridad || triaje?.label || 'TRIAGE'
  };
};

export default function MapaHospitalOptimizado() {
  const navigate = useNavigate();
  const { setAuth } = useAuth();

  const closeSession = async () => {
    await clearEmergencyDB();
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
  const hiddenReportRef = useRef(null);
  const isConnectingRef = useRef(false);

  const [activeCases, setActiveCases] = useState([]);

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
  const [mapLoaded, setMapLoaded] = useState(false);

  const historialExpedientesRaw = useLiveQuery(
    () => db.hojas_prehospitalarias.toArray().then(arr => arr.sort((a, b) => (b.version || 0) - (a.version || 0))),
    []
  );
  const historialExpedientes = historialExpedientesRaw || [];

  const [patientNotifications, setPatientNotifications] = useState([]);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [selectedAmbulance, setSelectedAmbulance] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [pdfExportReport, setPdfExportReport] = useState(null);
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

  const exportarElementoAPDF = useCallback(async (input, reporteObj) => {
    if (!input) return;
    try {
      const canvas = await html2canvas(input, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: input.scrollWidth,
        windowHeight: input.scrollHeight
      });
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
      pdf.save(`Expediente_${reporteObj?.paciente?.nombre || 'Paciente'}_${reporteObj?.callId || ''}.pdf`);
      showToast('success', 'Expediente descargado', 'PDF generado correctamente');
    } catch (error) {
      console.error('Error PDF:', error);
      showToast('error', 'Error al generar PDF', 'Intente de nuevo');
    }
  }, [showToast]);

  useEffect(() => {
    if (!pdfExportReport) return;
    const timer = setTimeout(async () => {
      await exportarElementoAPDF(hiddenReportRef.current, pdfExportReport);
      setPdfExportReport(null);
    }, 150);
    return () => clearTimeout(timer);
  }, [pdfExportReport, exportarElementoAPDF]);

  const geocodeHospitalAddress = useCallback(async (address) => {
    if (!address || address.trim() === '') return null;
    try {
      const q = encodeURIComponent(`${address.trim()}, Morelia, Michoacán, México`);
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${mapboxgl.accessToken}&country=mx&types=address,poi,place&limit=1&language=es`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const feature = data.features?.[0];
      if (!feature) return null;
      return {
        lat: feature.center[1],
        lng: feature.center[0],
        place_name: feature.place_name
      };
    } catch (err) {
      console.warn('Geocoding falló:', err.message);
      return null;
    }
  }, []);

  useEffect(() => {
    if (hospitalInfo) {
      localStorage.setItem('hospitalBeds', JSON.stringify({
        camasEmergencia,
        camasDisponibles
      }));
    }
  }, [camasEmergencia, camasDisponibles, hospitalInfo]);

  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    if (ambulances.length > 0) {
      updateAmbulanceMarkers(ambulances);
    }
  }, [ambulances, mapLoaded]);

  useEffect(() => {
    isMounted.current = true;

    const loadHospital = async () => {
      try {
        const stored = JSON.parse(localStorage.getItem('hospitalInfo') || 'null');
        if (!stored || !stored.id) {
          showToast('error', 'Configuración requerida', 'Complete los datos del hospital');
          return;
        }

        const beds = JSON.parse(localStorage.getItem('hospitalBeds') || 'null');

        const h = {
          id: stored.id,
          nombre: stored.nombre || 'Hospital Base',
          direccion: stored.direccion || '',
          lat: stored.lat ?? null,
          lng: stored.lng ?? null,
          especialidades: stored.especialidades || ['General'],
          camasDisponibles: beds?.camasDisponibles ?? stored.camasDisponibles ?? 10,
          camasEmergencia: beds?.camasEmergencia ?? stored.camasEmergencia ?? stored.camasDisponibles ?? 10,
          telefono: stored.telefono || ''
        };

        if ((!h.lat || !h.lng) && h.direccion) {
          const geo = await geocodeHospitalAddress(h.direccion);
          if (geo) {
            h.lat = geo.lat;
            h.lng = geo.lng;
            const updated = { ...stored, lat: geo.lat, lng: geo.lng, direccion: geo.place_name || stored.direccion };
            localStorage.setItem('hospitalInfo', JSON.stringify(updated));
          }
        }

        if (!h.lat || !h.lng) {
          h.lat = 19.7024;
          h.lng = -101.1969;
        }

        if (isMounted.current) {
          setHospitalInfo(h);
          setCamasDisponibles(h.camasDisponibles);
          setCamasEmergencia(h.camasEmergencia);
        }
      } catch (err) {
        console.error('Error cargando hospital:', err);
        showToast('error', 'Error de configuración', 'No se pudieron cargar los datos');
      }
    };

    loadHospital();

    return () => { isMounted.current = false; };
  }, [geocodeHospitalAddress, showToast]);

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

            case 'prehospital_report_update':
            case 'prehospital_report_broadcast':
              setActiveCases(prev => prev.map(c =>
                c.callId === data.callId
                  ? { ...c, latestVersion: data.version, isFinal: data.isFinal }
                  : c
              ));
              handlePrehospitalReportUpdate(data);
              showToast(
                'info',
                `Reporte ${data.isFinal ? 'FINAL' : `v${data.version}`} recibido`,
                `Folio ${data.callId} · ${data.patientInfo?.nombre || 'Paciente'}`
              );
              break;

            case 'hospital_active_cases_update':
              setActiveCases(data.cases || []);
              break;

            case 'doctor_reports_history':
              if (data.reports && data.reports.length > 0) {
                upsertManyReports(data.reports.map(r => {
                  const report = r.report;
                  return {
                    callId: r.callId,
                    version: r.version,
                    urgentOnly: r.urgentOnly,
                    isFinal: r.isFinal,
                    hospitalId: hospitalInfo?.id,
                    ambulanceId: r.ambulanceId,
                    report,
                    patientInfo: r.patientInfo,
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
                      frecuencia_respiratoria: report.seccionI.fr,
                      saturacion_oxigeno: report.seccionI.spo2,
                      tension_arterial: report.seccionI.ta,
                      temperatura: report.seccionI.temp,
                      nivel_glucosa: report.seccionI.glucemia
                    } : null,
                    intervenciones: report?.intervenciones || [],
                    triaje: report?.triaje,
                    glasgow: report?.glasgow,
                    codigo_prioridad_color: report?.triaje?.color || '#ef4444',
                    codigo_prioridad: report?.triaje?.label || 'TRIAGE',
                    fecha: r.timestamp ? new Date(r.timestamp).toLocaleString() : new Date().toLocaleString()
                  };
                }));
              }
              break;

            case 'prehospital_report_snapshot':
              break;

            case 'hospital_registered':
              break;

            case 'hospital_beds_update':
              if (data.hospitalId === hospitalInfo?.id) {
                setCamasEmergencia(data.camasEmergencia ?? 0);
                setCamasDisponibles(data.camasDisponibles ?? 0);
                if (data.decrementedBy) {
                  showToast('info', 'Cama asignada', `Quedan ${data.camasEmergencia} camas de urgencia`);
                }
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

            case 'route_cleared':
              setActiveCases(prev => prev.filter(c => c.ambulanceId !== data.ambulanceId));
              break;

            case 'active_routes_update':
              (data.routes || []).forEach(handleRouteUpdated);
              break;

            case 'navigation_cancelled':
              setActiveCases(prev => prev.filter(c => c.ambulanceId !== data.ambulanceId));
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
              if (data.routeGeometry && data.ambulanceId) {
                drawAmbulanceRoute(data.ambulanceId, data.routeGeometry);
                setActiveRoutes(prev => {
                  const idx = prev.findIndex(r => r.ambulanceId === data.ambulanceId);
                  const newRoute = {
                    ambulanceId: data.ambulanceId,
                    hospitalId: data.hospitalInfo?.id || hospitalInfo?.id,
                    distance: data.distance,
                    duration: data.duration,
                    geometry: data.routeGeometry,
                    updatedAt: new Date().toISOString(),
                    origin: 'operator'
                  };
                  if (idx >= 0) {
                    const copy = [...prev];
                    copy[idx] = newRoute;
                    return copy;
                  }
                  return [...prev, newRoute];
                });
              }
              break;

            case 'doctor_connected':
              if (data.doctor) {
                setListaDoctores(prev => {
                  const exists = prev.some(d => d.id_doctor === data.doctor.doctorId);
                  return exists ? prev : [...prev, {
                    id_doctor: data.doctor.doctorId,
                    nombre: data.doctor.nombre,
                    apellidos: '',
                    licencia_medica: '',
                    especialidad: data.doctor.especialidad
                  }];
                });
              }
              break;

            case 'doctor_disconnected':
              setListaDoctores(prev => prev.filter(d => d.id_doctor !== data.doctorId));
              break;

            case 'error':
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
  }, [registerHospital, showToast, hospitalInfo?.id]);

  useEffect(() => {
    if (hospitalInfo) {
      const t = setTimeout(() => connectWebSocket(), 800);
      return () => clearTimeout(t);
    }
  }, [hospitalInfo, connectWebSocket]);

  useEffect(() => {
    if (wsConnected && hospitalInfo) {
      const t = setTimeout(() => registerHospital(), 400);
      return () => clearTimeout(t);
    }
  }, [camasDisponibles, camasEmergencia, wsConnected, hospitalInfo, registerHospital]);

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
      setMapLoaded(true);
    });

    return () => {
      cleanupMarkers();
      try { mapInstance.remove(); } catch (_) {}
    };
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
      el.style.cssText = `
        width:70px; height:70px;
        background:#09090b;
        border:4px solid #38bdf8;
        border-radius:50%;
        display:flex; align-items:center; justify-content:center;
        box-shadow:0 0 25px rgba(56,189,248,0.6);
        cursor:pointer;
      `;
      const label = document.createElement('span');
      label.style.cssText = 'color:#38bdf8; font-weight:900; font-size:28px;';
      label.textContent = 'H';
      el.appendChild(label);

      const popupNode = document.createElement('div');
      popupNode.style.textAlign = 'center';

      const titleNode = document.createElement('h3');
      titleNode.style.cssText = 'font-size:18px; font-weight:900; color:#38bdf8; margin-bottom:6px;';
      titleNode.textContent = hospitalInfo.nombre || 'Hospital';

      const addrNode = document.createElement('p');
      addrNode.style.cssText = 'font-size:13px; color:#a1a1aa; margin:0;';
      addrNode.textContent = hospitalInfo.direccion || 'Dirección no registrada';

      popupNode.appendChild(titleNode);
      popupNode.appendChild(addrNode);

      const popup = new mapboxgl.Popup({ offset: 35 }).setDOMContent(popupNode);

      hospitalMarker.current = new mapboxgl.Marker({ element: el })
        .setLngLat([hospitalInfo.lng, hospitalInfo.lat])
        .setPopup(popup)
        .addTo(map.current);
    } catch (err) {
      console.warn('Error marcador hospital:', err.message);
    }
  };

  const updateAmbulanceMarkers = (list) => {
    if (!map.current) return;

    Object.values(ambulanceMarkers.current).forEach(m => m.remove());
    ambulanceMarkers.current = {};

    list.forEach(amb => {
      if (!amb.location?.lat || !amb.location?.lng) return;
      const isRoute = amb.status === 'en_ruta';
      const color = isRoute ? '#10b981' : amb.status === 'fuera_de_servicio' ? '#64748b' : '#f59e0b';

      const el = document.createElement('div');
      el.style.cssText = `
        width:50px; height:50px;
        background:${color};
        border:4px solid #18181b;
        border-radius:50%;
        display:flex; align-items:center; justify-content:center;
        box-shadow:0 0 20px ${color}99;
        cursor:pointer;
      `;
      const label = document.createElement('span');
      label.style.cssText = 'color:#fff; font-weight:900; font-size:20px;';
      label.textContent = 'A';
      el.appendChild(label);

      const popupNode = document.createElement('div');
      popupNode.style.textAlign = 'center';

      const title = document.createElement('strong');
      title.style.cssText = `font-size:16px; color:${color};`;
      title.textContent = `UNIDAD ${amb.id}`;

      const state = document.createElement('p');
      state.style.cssText = 'margin-top:8px; font-size:13px; color:#d4d4d8;';
      state.textContent = `ESTADO: ${(amb.status || '').replace('_', ' ').toUpperCase()}`;

      const speed = document.createElement('p');
      speed.style.cssText = 'margin:4px 0 0 0; font-size:13px; color:#d4d4d8;';
      speed.textContent = `VELOCIDAD: ${amb.speed || 0} km/h`;

      popupNode.appendChild(title);
      popupNode.appendChild(state);
      popupNode.appendChild(speed);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([amb.location.lng, amb.location.lat])
        .setPopup(new mapboxgl.Popup({ offset: 30 }).setDOMContent(popupNode))
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

      const marker = ambulanceMarkers.current[ambulanceId];
      if (marker) {
        marker.getElement().style.zIndex = '100';
      }

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

    setActiveCases(prev => {
      const exists = prev.find(c => c.callId === data.callId);
      const entry = {
        callId: data.callId,
        ambulanceId: data.ambulanceId,
        ambulanceName: data.ambulanceName,
        emergencyType: data.emergencyType,
        patientInfo: data.patientInfo,
        distanceKm: data.distanceKm,
        receivedAt: new Date().toISOString(),
        isFinal: false
      };
      return exists
        ? prev.map(c => c.callId === data.callId ? { ...c, ...entry } : c)
        : [...prev, entry];
    });

    if (data.routeGeometry) {
      drawAmbulanceRoute(data.ambulanceId, data.routeGeometry);
    }

    if (data.routeGeometry && data.duration) {
      const etaMin = Math.round(data.duration / 60);
      const arrivalTime = new Date(Date.now() + data.duration * 1000)
        .toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      showToast(
        'info',
        `${data.ambulanceName || data.ambulanceId} en camino`,
        `ETA ${etaMin} min · Llegada aprox. ${arrivalTime}`
      );
    }

    onNotificationOpen();
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

  const handlePrehospitalReportUpdate = (data) => {
    const { callId, version, report, patientInfo, urgentOnly, isFinal, ambulanceId, timestamp, hospitalId } = data;

    const paciente = report?.seccionD ? {
      nombre: report.seccionD.nombre || 'Paciente',
      edad: report.seccionD.edad,
      sexo: report.seccionD.sexo,
      motivo_urgencia: report.seccionF?.motivo_principal,
      descripcion_lesion: report.seccionH?.lesiones_exposicion,
      observaciones: report.seccionN?.diagnostico_presuntivo
    } : null;

    const signos_vitales = report?.seccionI ? {
      frecuencia_cardiaca: report.seccionI.fc,
      frecuencia_respiratoria: report.seccionI.fr,
      saturacion_oxigeno: report.seccionI.spo2,
      tension_arterial: report.seccionI.ta,
      temperatura: report.seccionI.temp,
      nivel_glucosa: report.seccionI.glucemia
    } : null;

    upsertReport({
      callId,
      version,
      isFinal,
      urgentOnly,
      hospitalId: hospitalId || hospitalInfo?.id,
      ambulanceId,
      report,
      patientInfo,
      paciente,
      signos_vitales,
      intervenciones: report?.intervenciones || [],
      triaje: report?.triaje,
      glasgow: report?.glasgow,
      codigo_prioridad_color: report?.triaje?.color || '#ef4444',
      codigo_prioridad: report?.triaje?.label || 'TRIAGE',
      fecha: timestamp ? new Date(timestamp).toLocaleString() : new Date().toLocaleString()
    });

    if (selectedReport?.callId === callId) {
      setReportHistory(prev => [...prev, { version, report, timestamp: new Date().toISOString() }]);
      setSelectedReportVersion(version);
      setSelectedReport(prev => normalizeExpediente({ ...prev, ...data, report }));
    }

    const motivo = report?.seccionF?.motivo_principal || '';
    const espReq = clasificarEspecialidad(motivo);
    const docIdeal = listaDoctores.find(d => d.especialidad?.toLowerCase() === espReq.toLowerCase());
    if (docIdeal) setDoctorSeleccionado(docIdeal.id_doctor);

    showToast('info', `Reporte v${version} recibido`, urgentOnly ? 'Datos urgentes — preparar recursos' : 'Actualización de expediente');
  };

  const verDetalles = (exp) => {
    const normalizado = normalizeExpediente(exp);
    setSelectedReport(normalizado);
    setReportHistory(normalizado?._versions || []);
    setSelectedReportVersion(normalizado?._versions?.length || normalizado?.version || null);
    const motivo = normalizado?.paciente?.motivo_urgencia || '';
    const espReq = clasificarEspecialidad(motivo);
    const docIdeal = listaDoctores.find(d => d.especialidad?.toLowerCase() === espReq.toLowerCase());
    if (docIdeal) setDoctorSeleccionado(docIdeal.id_doctor);
    onReportModalOpen();
  };

  const descargarPDFDirecto = (exp) => {
    setPdfExportReport(normalizeExpediente(exp));
  };

  const generarPDF = async () => {
    await exportarElementoAPDF(reportRef.current, selectedReport);
  };

  const confirmarReporteYAsignar = async () => {
    if (selectedReport?.callId && doctorSeleccionado) {
      sendWS({
        type: 'assign_doctor',
        callId: selectedReport.callId,
        doctorId: doctorSeleccionado,
        reason: 'Asignación desde hospital'
      });
    }
    await generarPDF();
    setTimeout(() => {
      showToast('success', 'Recepción Confirmada', 'Paciente ingresado y doctor notificado');
      onReportModalClose();
    }, 800);
  };

  const centerOnHospital = () => {
    if (!map.current || !hospitalInfo) return;
    map.current.flyTo({ center: [hospitalInfo.lng, hospitalInfo.lat], zoom: 16, pitch: 45, duration: 1000 });
  };

  const renderReporteSheet = (reporteData, refTarget) => {
    if (!reporteData) return null;
    const sv = reporteData.signos_vitales || {};
    const vitals = [
      { label: 'FC', value: sv.frecuencia_cardiaca, unit: 'bpm', color: '#dc2626' },
      { label: 'FR', value: sv.frecuencia_respiratoria, unit: 'rpm', color: '#0ea5e9' },
      { label: 'SpO₂', value: sv.saturacion_oxigeno, unit: '%', color: '#0284c7' },
      { label: 'T/A', value: sv.tension_arterial, unit: 'mmHg', color: '#7c3aed' },
      { label: 'TEMP', value: sv.temperatura, unit: '°C', color: '#ea580c' },
      { label: 'GLUC', value: sv.nivel_glucosa, unit: 'mg/dL', color: '#16a34a' },
    ].filter(v => hasValue(v.value));

    const hasPaciente = hasValue(reporteData.paciente?.nombre) || hasValue(reporteData.paciente?.edad) || hasValue(reporteData.paciente?.sexo);
    const hasEvaluacion = hasValue(reporteData.paciente?.motivo_urgencia) || hasValue(reporteData.paciente?.descripcion_lesion);
    const intervencionesValidas = (reporteData.intervenciones || []).filter(iv => hasValue(iv.tipo_intervencion) || hasValue(iv.descripcion));
    const observacionesLimpias = limpiarTexto(reporteData.paciente?.observaciones);

    return (
      <Box ref={refTarget} p={5} bg="#ffffff" color="#0f172a" fontFamily="system-ui, -apple-system, sans-serif">
        <VStack spacing={3} align="stretch">
          <Flex align="center" justify="space-between" borderBottom="3px solid #0ea5e9" pb={2.5}>
            <HStack spacing={3} align="center">
              <Box w="54px" h="54px" display="flex" alignItems="center" justifyContent="center">
                <img src={logo} alt="EmergenCity" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} crossOrigin="anonymous" />
              </Box>
              <Box>
                <Text fontSize="19px" fontWeight="900" color="#0c4a6e" letterSpacing="1px" lineHeight="1.1">
                  EMERGENCITY MORELIA
                </Text>
                <Text fontSize="11px" fontWeight="800" color="#0284c7" letterSpacing="1px">
                  REPORTE DE ATENCIÓN PREHOSPITALARIA
                </Text>
              </Box>
            </HStack>
            <HStack spacing={3}>
              {hasValue(reporteData.triaje?.label) && (
                <Box bg="#f0f9ff" border="2px solid #0ea5e9" borderRadius="md" px={3} py={1.5} textAlign="center">
                  <Text fontSize="8px" color="#0c4a6e" fontWeight="900" letterSpacing="0.5px">TRIAGE</Text>
                  <Text fontSize="15px" fontWeight="900" color={reporteData.triaje?.color || '#ef4444'} lineHeight="1.1">
                    {reporteData.triaje.label}
                  </Text>
                </Box>
              )}
              {hasValue(reporteData.glasgow?.total) && (
                <Box bg="#f0f9ff" border="2px solid #0ea5e9" borderRadius="md" px={3} py={1.5} textAlign="center">
                  <Text fontSize="8px" color="#0c4a6e" fontWeight="900" letterSpacing="0.5px">GLASGOW</Text>
                  <Text fontSize="15px" fontWeight="900" color="#0c4a6e" lineHeight="1.1">
                    {reporteData.glasgow.total} / 15
                  </Text>
                </Box>
              )}
              <VStack align="end" spacing={0.5}>
                <Box px={2.5} py={0.5} bg="#0c4a6e" color="white" borderRadius="sm">
                  <Text fontSize="9px" fontWeight="900" letterSpacing="1px">FOLIO · v{reporteData.version || 1}</Text>
                </Box>
                <Text fontSize="13px" fontWeight="900" color="#0c4a6e">
                  {reporteData.callId || '--'}
                </Text>
                <Text fontSize="9px" color="#64748b" fontWeight="700">
                  {new Date().toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </Text>
              </VStack>
            </HStack>
          </Flex>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3} alignItems="stretch">
            <VStack spacing={3} align="stretch">
              {hasPaciente && (
                <Box>
                  <Flex align="center" mb={1.5} gap={2}>
                    <Box w="4px" h="14px" bg="#0ea5e9" borderRadius="full" />
                    <Text fontSize="11px" fontWeight="900" color="#0c4a6e" letterSpacing="1px">IDENTIFICACIÓN DEL PACIENTE</Text>
                  </Flex>
                  <SimpleGrid columns={3} spacing={2}>
                    {hasValue(reporteData.paciente?.nombre) && (
                      <Box bg="#f8fafc" p={2.5} borderRadius="md" border="1px solid #e2e8f0">
                        <Text fontSize="8px" color="#64748b" fontWeight="900">NOMBRE</Text>
                        <Text fontSize="13px" fontWeight="900" color="#0f172a">{reporteData.paciente.nombre}</Text>
                      </Box>
                    )}
                    {hasValue(reporteData.paciente?.edad) && (
                      <Box bg="#f8fafc" p={2.5} borderRadius="md" border="1px solid #e2e8f0">
                        <Text fontSize="8px" color="#64748b" fontWeight="900">EDAD</Text>
                        <Text fontSize="13px" fontWeight="900" color="#0f172a">{reporteData.paciente.edad} años</Text>
                      </Box>
                    )}
                    {hasValue(reporteData.paciente?.sexo) && (
                      <Box bg="#f8fafc" p={2.5} borderRadius="md" border="1px solid #e2e8f0">
                        <Text fontSize="8px" color="#64748b" fontWeight="900">SEXO</Text>
                        <Text fontSize="13px" fontWeight="900" color="#0f172a">{reporteData.paciente.sexo}</Text>
                      </Box>
                    )}
                  </SimpleGrid>
                </Box>
              )}

              {hasEvaluacion && (
                <Box flex={1}>
                  <Flex align="center" mb={1.5} gap={2}>
                    <Box w="4px" h="14px" bg="#f59e0b" borderRadius="full" />
                    <Text fontSize="11px" fontWeight="900" color="#0c4a6e" letterSpacing="1px">EVALUACIÓN CLÍNICA</Text>
                  </Flex>
                  <Box bg="#fffbeb" p={3} borderRadius="md" border="1px solid #fde68a">
                    {hasValue(reporteData.paciente?.motivo_urgencia) && (
                      <Box mb={hasValue(reporteData.paciente?.descripcion_lesion) ? 2 : 0}>
                        <Text fontSize="8px" color="#92400e" fontWeight="900">MOTIVO DE URGENCIA</Text>
                        <Text fontSize="12px" fontWeight="800" color="#0f172a">{reporteData.paciente.motivo_urgencia}</Text>
                      </Box>
                    )}
                    {hasValue(reporteData.paciente?.descripcion_lesion) && (
                      <Box>
                        <Text fontSize="8px" color="#92400e" fontWeight="900">DESCRIPCIÓN DE LESIONES</Text>
                        <Text fontSize="12px" fontWeight="700" color="#0f172a">{reporteData.paciente.descripcion_lesion}</Text>
                      </Box>
                    )}
                  </Box>
                </Box>
              )}

              {hasValue(observacionesLimpias) && (
                <Box>
                  <Flex align="center" mb={1.5} gap={2}>
                    <Box w="4px" h="14px" bg="#0ea5e9" borderRadius="full" />
                    <Text fontSize="11px" fontWeight="900" color="#0c4a6e" letterSpacing="1px">OBSERVACIONES</Text>
                  </Flex>
                  <Box bg="#f0f9ff" p={3} borderRadius="md" border="1px solid #bae6fd">
                    <Text fontSize="11px" color="#0f172a" fontWeight="600" whiteSpace="pre-wrap">
                      {observacionesLimpias}
                    </Text>
                  </Box>
                </Box>
              )}
            </VStack>

            <VStack spacing={3} align="stretch">
              {vitals.length > 0 && (
                <Box>
                  <Flex align="center" mb={1.5} gap={2}>
                    <Box w="4px" h="14px" bg="#dc2626" borderRadius="full" />
                    <Text fontSize="11px" fontWeight="900" color="#0c4a6e" letterSpacing="1px">SIGNOS VITALES</Text>
                  </Flex>
                  <SimpleGrid columns={3} spacing={2}>
                    {vitals.map((v, i) => (
                      <Box key={i} bg="#fef2f2" p={2} borderRadius="md" border="1px solid #fecaca" textAlign="center">
                        <Text fontSize="8px" color="#991b1b" fontWeight="900">{v.label}</Text>
                        <Text fontSize="17px" fontWeight="900" color={v.color} lineHeight="1.1">{v.value}</Text>
                        <Text fontSize="8px" color="#64748b" fontWeight="700">{v.unit}</Text>
                      </Box>
                    ))}
                  </SimpleGrid>
                </Box>
              )}

              {intervencionesValidas.length > 0 && (
                <Box flex={1}>
                  <Flex align="center" mb={1.5} gap={2}>
                    <Box w="4px" h="14px" bg="#10b981" borderRadius="full" />
                    <Text fontSize="11px" fontWeight="900" color="#0c4a6e" letterSpacing="1px">INTERVENCIONES REALIZADAS</Text>
                  </Flex>
                  <VStack align="stretch" spacing={1.5}>
                    {intervencionesValidas.map((iv, idx) => (
                      <Flex key={idx} bg="#ecfdf5" p={2} borderRadius="md" border="1px solid #a7f3d0" gap={2.5} align="center">
                        {hasValue(iv.hora_intervencion) && (
                          <Box bg="#10b981" color="white" px={2} py={0.5} borderRadius="sm">
                            <Text fontSize="10px" fontWeight="900">{iv.hora_intervencion}</Text>
                          </Box>
                        )}
                        <Box flex={1}>
                          {hasValue(iv.tipo_intervencion) && (
                            <Text fontSize="11px" fontWeight="900" color="#065f46">{iv.tipo_intervencion}</Text>
                          )}
                          {hasValue(iv.descripcion) && (
                            <Text fontSize="10px" color="#0f172a">{iv.descripcion}</Text>
                          )}
                        </Box>
                      </Flex>
                    ))}
                  </VStack>
                </Box>
              )}
            </VStack>
          </SimpleGrid>

          <Box borderTop="1px solid #e2e8f0" pt={2}>
            <Flex justify="space-between" align="center">
              <Text fontSize="9px" color="#64748b" fontWeight="700">
                EXPEDIENTE CLÍNICO PREHOSPITALARIO · EMERGENCITY
              </Text>
              <Text fontSize="9px" color="#64748b" fontWeight="700">
                {new Date().toLocaleString('es-MX')}
              </Text>
            </Flex>
          </Box>
        </VStack>
      </Box>
    );
  };

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
                      <Button w="100%" h="50px" bg="#27272a" color="white" _hover={{ bg: '#3f3f46' }} fontSize="12px" fontWeight="900"
                        onClick={() => { if (amb.location && map.current) map.current.flyTo({ center: [amb.location.lng, amb.location.lat], zoom: 16 }); }}>
                        UBICAR MAPA
                      </Button>
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

          <Box flex={1} position="relative" display="flex" flexDirection="column">
            <Box flex={1} position="relative">
              <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
            </Box>
          </Box>
        </Flex>

        {pdfExportReport && (
          <Box position="fixed" left="-10000px" top="0" w="950px" zIndex="-1" pointerEvents="none">
            {renderReporteSheet(pdfExportReport, hiddenReportRef)}
          </Box>
        )}

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
                  {historialExpedientes.map((exp, i) => {
                    const norm = normalizeExpediente(exp);
                    return (
                      <Box key={exp.callId || i} p={4} bg="#18181b" borderRadius="xl" border="1px solid #3f3f46">
                        <HStack justify="space-between" mb={2}>
                          <Text fontSize="15px" fontWeight="900" color="#38bdf8">{norm.callId}</Text>
                          <Badge
                            bg={norm.isFinal ? '#10b981' : '#f59e0b'}
                            color="white" px={2} py={1} borderRadius="md"
                            fontSize="10px" fontWeight="900"
                          >
                            {norm.isFinal ? `REPORTE FINAL v${norm.version}` : `URGENTE v${norm.version}`}
                          </Badge>
                        </HStack>
                        <Text fontSize="14px" fontWeight="800" color="white" mb={1}>
                          {norm.paciente?.nombre || 'Desconocido'}
                        </Text>
                        <Text fontSize="12px" color="#a1a1aa" mb={1}>
                          Motivo: {norm.paciente?.motivo_urgencia || 'General'}
                        </Text>
                        <Text fontSize="11px" color="#71717a" mb={3}>{exp.fecha}</Text>
                        <HStack spacing={2}>
                          <Button
                            flex={1} h="45px" bg="#27272a" color="white"
                            border="1px solid #3f3f46"
                            _hover={{ bg: '#3f3f46', borderColor: '#38bdf8' }}
                            fontSize="12px" fontWeight="900"
                            leftIcon={<FaEye />}
                            onClick={() => verDetalles(norm)}
                          >
                            VER EXPEDIENTE
                          </Button>
                          <Button
                            flex={1} h="45px" bg="#0284c7" color="white"
                            _hover={{ bg: '#0369a1' }}
                            fontSize="12px" fontWeight="900"
                            leftIcon={<FaFilePdf />}
                            onClick={() => descargarPDFDirecto(norm)}
                          >
                            DESCARGAR PDF
                          </Button>
                        </HStack>
                      </Box>
                    );
                  })}
                </VStack>
              )}
            </DrawerBody>
          </DrawerContent>
        </Drawer>

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

        <Modal isOpen={isReportModalOpen} onClose={onReportModalClose} size="6xl" isCentered scrollBehavior="inside">
          <ModalOverlay backdropFilter="blur(10px)" bg="rgba(0,0,0,0.85)" />
          <ModalContent maxW="1150px" bg="#09090b" border="1px solid #3f3f46" borderRadius="2xl" overflow="hidden">
            <ModalHeader bg="#18181b" borderBottom="1px solid #27272a" py={3}>
              <HStack justify="space-between">
                <HStack>
                  <Icon as={FaFolderOpen} color="#38bdf8" boxSize={5} />
                  <Text fontSize="18px" fontWeight="900" color="white">EXPEDIENTE CLÍNICO</Text>
                </HStack>
                {selectedReport?.codigo_prioridad_color && (
                  <Badge bg={selectedReport.codigo_prioridad_color} color="white" px={3} py={1.5} fontSize="13px" fontWeight="900" borderRadius="md">
                    {selectedReport.codigo_prioridad || 'TRIAGE'}
                  </Badge>
                )}
              </HStack>
            </ModalHeader>

            <ModalBody p={0} bg="#ffffff">
              {renderReporteSheet(selectedReport, reportRef)}
            </ModalBody>

            <ModalFooter bg="#18181b" borderTop="1px solid #27272a" py={3} px={5}>
              <HStack w="100%" spacing={4}>
                <Button flex={0.3} h="50px" variant="ghost" color="#a1a1aa"
                  fontSize="14px" fontWeight="900"
                  _hover={{ bg: '#27272a', color: 'white' }}
                  onClick={onReportModalClose}>
                  CERRAR
                </Button>
                <Button flex={0.7} h="50px"
                  bg="#0284c7" color="white"
                  fontSize="15px" fontWeight="900"
                  leftIcon={<FaFilePdf />}
                  _hover={{ bg: '#0369a1' }}
                  onClick={generarPDF}>
                  DESCARGAR PDF
                </Button>
              </HStack>
            </ModalFooter>
          </ModalContent>
        </Modal>

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