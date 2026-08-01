// MapaOperadorGPS.jsx - VERSIÓN COMPLETA CON SINCRONIZACIÓN DE EMERGENCIAS, ASIGNACIÓN AUTOMÁTICA Y NAVEGACIÓN TURN-BY-TURN
import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  ChakraProvider,
  Box,
  Button,
  VStack,
  Text,
  HStack,
  Badge,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Input,
  Select,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  useToast,
  Card,
  CardBody,
  Progress,
  InputGroup,
  InputRightElement,
  IconButton,
  Spinner,
  useColorMode,
  useColorModeValue,
  extendTheme,
  Checkbox,
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  FormControl,
  FormLabel,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Divider,
  Tag,
  Switch,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  Flex,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  StatArrow,
  useMediaQuery,
  SimpleGrid,
  Grid,
  GridItem,
  Collapse,
  Icon,
  Tooltip,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Portal,
  FocusLock,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  PopoverArrow,
  ThemeProvider
} from '@chakra-ui/react';

import { 
  SearchIcon, 
  CloseIcon, 
  MoonIcon, 
  SunIcon,
  AddIcon,
  MinusIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  HamburgerIcon,
  InfoOutlineIcon
} from '@chakra-ui/icons';

import { 
  FaCompass,
  FaMapMarkerAlt,
  FaHospital,
  FaRoute,
  FaTachometerAlt,
  FaLocationArrow,
  FaAmbulance,
  FaUserMd,
  FaHeartbeat,
  FaBed,
  FaPhone,
  FaClock,
  FaRoad,
  FaExclamationTriangle,
  FaArrowLeft,
  FaArrowRight,
  FaSync,
  FaTimes,
  FaCheck,
  FaTimesCircle,
  FaHourglassHalf,
  FaDirections,
  FaMapPin,
  FaCar,
  FaUserInjured,
  FaStar,
  FaFilter,
  FaSortAmountDown,
  FaInfoCircle,
  FaExpandArrowsAlt,
  FaCompressArrowsAlt,
  FaChartLine,
  FaGripHorizontal
} from 'react-icons/fa';

// ========== CONFIGURACIÓN DEL TEMA ==========
const breakpoints = {
  sm: '320px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

const config = {
  initialColorMode: 'light',
  useSystemColorMode: false,
};

const theme = extendTheme({ 
  breakpoints,
  config,
  styles: {
    global: (props) => ({
      body: {
        overflow: 'hidden',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      },
      '.mapboxgl-map': {
        fontFamily: "'Inter', system-ui, sans-serif"
      },
      '.mapboxgl-popup': {
        zIndex: 1000,
        maxWidth: '300px'
      },
      '@media (max-width: 768px)': {
        '.mapboxgl-popup': {
          maxWidth: '260px'
        },
        '.mapboxgl-popup-content': {
          padding: '10px'
        }
      },
      '@keyframes pulseGreen': {
        '0%, 100%': { transform: 'scale(1)', opacity: '1' },
        '50%': { transform: 'scale(1.15)', opacity: '0.7' }
      },
      '.status-dot-green': {
        width: '10px', height: '10px', borderRadius: '50%',
        background: '#4CAF50',
        boxShadow: '0 0 8px rgba(76,175,80,0.8)',
        animation: 'pulseGreen 2s infinite'
      },
      '.status-dot-yellow': {
        width: '10px', height: '10px', borderRadius: '50%',
        background: '#FFC107',
        animation: 'pulseGreen 1.5s infinite'
      },
      '.status-dot-red': {
        width: '10px', height: '10px', borderRadius: '50%',
        background: '#F44336'
      },
      '.glass-card': {
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.3)',
        borderRadius: '16px'
      },
      '.glass-card-dark': {
        background: 'rgba(26, 32, 44, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '16px'
      }
    })
  },
  components: {
    Button: {
      baseStyle: {
        borderRadius: 'lg',
        fontWeight: 'semibold',
        _focus: { boxShadow: 'none' }
      }
    },
    Card: {
      baseStyle: {
        borderRadius: 'xl',
        overflow: 'hidden'
      }
    }
  }
});

mapboxgl.accessToken = 'pk.eyJ1IjoiZXltYXJkMjkiLCJhIjoiY21tcDY4YzNpMGw3bjJzb203YmZyNTVnMyJ9.OvZlnCMfUkUYe6Ib83DUVw';

// Inject global styles for animations
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  @keyframes pulseGreen {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.2); opacity: 0.6; }
  }
  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .glass-card {
    background: rgba(255, 255, 255, 0.85) !important;
    backdrop-filter: blur(12px) !important;
    -webkit-backdrop-filter: blur(12px) !important;
    border: 1px solid rgba(255,255,255,0.3) !important;
    border-radius: 16px !important;
  }
  .glass-card-dark {
    background: rgba(26, 32, 44, 0.85) !important;
    backdrop-filter: blur(12px) !important;
    -webkit-backdrop-filter: blur(12px) !important;
    border: 1px solid rgba(255,255,255,0.1) !important;
    border-radius: 16px !important;
  }
  .turn-by-turn-bar {
    background: rgba(0, 0, 0, 0.8) !important;
    backdrop-filter: blur(8px);
    color: white;
    padding: 8px 12px;
    border-radius: 12px;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1001;
    max-width: 90%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;
document.head.appendChild(globalStyle);

function ColorModeToggle() {
  const { colorMode, toggleColorMode } = useColorMode();
  return (
    <Tooltip label={colorMode === 'light' ? 'Modo Oscuro' : 'Modo Claro'}>
      <IconButton
        aria-label="Toggle color mode"
        icon={colorMode === 'light' ? <MoonIcon /> : <SunIcon />}
        onClick={toggleColorMode}
        variant="ghost"
        size="sm"
        borderRadius="full"
      />
    </Tooltip>
  );
}

// ---------- UTILIDAD: Obtener API base desde la URL del WebSocket ----------
const getApiBaseUrl = () => {
  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3002/ws';
  try {
    const url = new URL(wsUrl);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.pathname = url.pathname.replace('/ws', '');
    return url.origin;
  } catch (e) {
    return 'http://localhost:3002';
  }
};

export default function MapaOperadorGPS() {
  // ========== IDENTIFICACIÓN DE LA AMBULANCIA ==========
  // En producción, esto vendría del perfil del usuario logueado
  const AMBULANCE_ID = 'UVI-01';
  const AMBULANCE_PLACA = 'ABC123';
  const AMBULANCE_NOMBRE = 'Unidad de Vida UVI-01';

  // ========== REFS ==========
  const mapContainer = useRef(null);
  const map = useRef(null);
  const ambulanceMarker = useRef(null);
  const watchId = useRef(null);
  const ws = useRef(null);
  const hospitalMarkers = useRef([]);
  const emergencyMarker = useRef(null);
  const assignedEmergencyMarker = useRef(null);
  const routeLayerIds = useRef([]);
  const routeSources = useRef([]);
  const reconnectTimeout = useRef(null);
  const connectionAttempts = useRef(0);
  const maxConnectionAttempts = 5;
  const lastPosition = useRef(null);
  const isMounted = useRef(true);
  const orientationListener = useRef(null);
  const sidebarRef = useRef(null);
  const searchDebounceTimer = useRef(null);
  const searchRequestId = useRef(0);

  // ========== RESPONSIVE HOOKS ==========
  const [isMobile] = useMediaQuery("(max-width: 768px)");
  const [isTablet] = useMediaQuery("(max-width: 1024px) and (min-width: 769px)");
  const [isDesktop] = useMediaQuery("(min-width: 1025px)");
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
  const [isFullscreenMap, setIsFullscreenMap] = useState(false);
  
  const sidebarWidth = isMobile ? "100%" : isTablet ? "320px" : "380px";
  const headerPadding = isMobile ? 2 : 3;
  const fontSizeTitle = isMobile ? "md" : "xl";
  const fontSizeStats = isMobile ? "sm" : "lg";
  const badgeSize = isMobile ? "xs" : "sm";
  
  // ========== ESTADO PRINCIPAL ==========
  const [pos, setPos] = useState(null);
  const [speed, setSpeed] = useState(0);
  const [heading, setHeading] = useState(0);
  const [deviceOrientation, setDeviceOrientation] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const [destination, setDestination] = useState(null);
  const [hospitals, setHospitals] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [activeRoutes, setActiveRoutes] = useState([]);
  const [hospitalNotification, setHospitalNotification] = useState(null);
  const [trafficEnabled, setTrafficEnabled] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentAddress, setCurrentAddress] = useState('');
  const [accuracy, setAccuracy] = useState(null);
  const [selectedHospital, setSelectedHospital] = useState('');

  // ========== ESTADO DE EMERGENCIA ==========
  const { isOpen: isEmergencyDrawerOpen, onOpen: onEmergencyDrawerOpen, onClose: onEmergencyDrawerClose } = useDisclosure();
  const { isOpen: isHospitalDrawerOpen, onOpen: onHospitalDrawerOpen, onClose: onHospitalDrawerClose } = useDisclosure();
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');
  const [emergencyType, setEmergencyType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [emergencyStep, setEmergencyStep] = useState('mode');
  const [emergencyMode, setEmergencyMode] = useState('');
  const [includePatientInfo, setIncludePatientInfo] = useState(false);
  const [patientCondition, setPatientCondition] = useState('');
  const [vitalSigns, setVitalSigns] = useState({
    heartRate: '',
    bloodPressure: '',
    oxygenSaturation: '',
    respiratoryRate: ''
  });
  const [ambulanceStatus, setAmbulanceStatus] = useState('disponible');
  const [currentManeuver, setCurrentManeuver] = useState(null);
  const [nextManeuver, setNextManeuver] = useState(null);
  const [routeProgress, setRouteProgress] = useState(null);
  const [pendingEmergencyRoute, setPendingEmergencyRoute] = useState(null);
  const [mapZoom, setMapZoom] = useState(15);
  const [mapPitch, setMapPitch] = useState(60);
  const [isMapFollowing, setIsMapFollowing] = useState(true);
  
  // ========== ESTADO PARA EMERGENCIA ASIGNADA ==========
  const [assignedEmergency, setAssignedEmergency] = useState(null);
  // Modal de notificación de emergencia asignada
  const { isOpen: isEmergencyModalOpen, onOpen: onEmergencyModalOpen, onClose: onEmergencyModalClose } = useDisclosure();

  const toast = useToast();
  const { colorMode } = useColorMode();

  // Colores dinámicos
  const bgColor = useColorModeValue('gray.50', 'gray.900');
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const textColor = useColorModeValue('gray.800', 'white');
  const headerBg = useColorModeValue('white', 'gray.800');
  const sidebarBg = useColorModeValue('white', 'gray.800');

  const apiBaseUrl = getApiBaseUrl();

  // ========== FUNCIONES DE NAVEGACIÓN DEL DRAWER DE EMERGENCIA ==========
  const nextStep = () => {
    if (emergencyStep === 'mode' && emergencyMode) {
      if (emergencyMode === 'atender_emergencia') {
        setEmergencyStep('location');
      } else if (emergencyMode === 'trasladar_paciente') {
        setEmergencyStep('patient');
      }
    } else if (emergencyStep === 'patient') {
      setEmergencyStep('hospital');
    } else if (emergencyStep === 'location') {
      setEmergencyStep('hospital');
    }
  };

  const prevStep = () => {
    if (emergencyStep === 'patient' || emergencyStep === 'location') {
      setEmergencyStep('mode');
    } else if (emergencyStep === 'hospital') {
      if (emergencyMode === 'atender_emergencia') {
        setEmergencyStep('location');
      } else {
        setEmergencyStep('patient');
      }
    }
  };

  // ========== ORIENTACIÓN DEL DISPOSITIVO ==========
  useEffect(() => {
    if (typeof window !== 'undefined' && window.DeviceOrientationEvent) {
      const handleOrientation = (event) => {
        if (event.alpha !== null) {
          setDeviceOrientation(event.alpha);
        }
      };
      window.addEventListener('deviceorientation', handleOrientation);
      orientationListener.current = handleOrientation;
      return () => {
        if (orientationListener.current) {
          window.removeEventListener('deviceorientation', orientationListener.current);
        }
      };
    }
  }, []);

  // ========== GEOLOCALIZACIÓN ==========
  const startPreciseLocationTracking = useCallback(() => {
    if (!navigator.geolocation) {
      showToast('error', 'GPS No Disponible', 'Su dispositivo no soporta geolocalización');
      return;
    }

    const geoOptions = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    };

    const handlePositionSuccess = (position) => {
      if (!isMounted.current) return;

      const { 
        latitude, 
        longitude, 
        speed: spd, 
        heading: hdg,
        accuracy: acc 
      } = position.coords;

      const currentSpeed = spd ? Math.max(0, Math.round(spd * 3.6)) : 0;
      const currentHeading = hdg || heading;
      const currentAccuracy = acc || null;

      let finalHeading = currentHeading;
      if (deviceOrientation && currentSpeed < 5) {
        finalHeading = (deviceOrientation + 360) % 360;
      }

      lastPosition.current = { lat: latitude, lng: longitude };

      setPos({ lat: latitude, lng: longitude });
      setSpeed(currentSpeed);
      setHeading(finalHeading);
      setAccuracy(currentAccuracy);

      updateAmbulanceMarker({ lat: latitude, lng: longitude }, finalHeading);
      sendLocationUpdate({ lat: latitude, lng: longitude }, currentSpeed, finalHeading);
      
      if (currentSpeed < 5) {
        getCurrentAddress(latitude, longitude);
      }

      if (isMapFollowing && !isNavigating && map.current) {
        map.current.easeTo({
          center: [longitude, latitude],
          bearing: finalHeading,
          pitch: currentSpeed > 40 ? 60 : 70,
          zoom: mapZoom,
          duration: 1000,
          essential: true
        });
      }
    };

    const handlePositionError = (error) => {
      if (!isMounted.current) return;
      switch(error.code) {
        case error.PERMISSION_DENIED:
          showToast('error', 'Permiso Denegado', 'Se necesita permiso para acceder a la ubicación');
          break;
        default:
          console.error('Error de geolocalización:', error);
      }
    };

    navigator.permissions?.query({ name: 'geolocation' })
      .then(permissionStatus => {
        if (permissionStatus.state === 'granted') {
          watchId.current = navigator.geolocation.watchPosition(
            handlePositionSuccess,
            handlePositionError,
            geoOptions
          );
          navigator.geolocation.getCurrentPosition(
            handlePositionSuccess,
            handlePositionError,
            geoOptions
          );
        } else {
          navigator.geolocation.getCurrentPosition(
            () => {
              startPreciseLocationTracking();
            },
            handlePositionError,
            geoOptions
          );
        }
      })
      .catch(() => {
        watchId.current = navigator.geolocation.watchPosition(
          handlePositionSuccess,
          handlePositionError,
          geoOptions
        );
      });
  }, [deviceOrientation, isMapFollowing, mapZoom, isNavigating, heading]);

  // ========== OBTENER DIRECCIÓN ACTUAL ==========
  const getCurrentAddress = async (lat, lng) => {
    try {
      const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxgl.accessToken}&language=es`);
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        setCurrentAddress(data.features[0].place_name);
      }
    } catch (error) {
      console.error('Error obteniendo dirección:', error);
    }
  };

  // ========== MARCADOR DE AMBULANCIA ==========
  const updateAmbulanceMarker = useCallback((position, headingAngle) => {
    if (!map.current || !position) return;
    const rotationAngle = headingAngle || 0;
    
    if (!ambulanceMarker.current) {
      const el = document.createElement('div');
      el.className = 'ambulance-marker-3d-gps';
      const markerSize = isMobile ? '90px' : '120px';
      const markerTop = isMobile ? '30px' : '40px';
      const markerLeft = isMobile ? '22px' : '30px';
      const markerWidth = isMobile ? '45px' : '60px';
      const markerHeight = isMobile ? '22px' : '30px';
      
      el.innerHTML = `
        <div style="
          position: relative;
          width: ${markerSize};
          height: ${markerSize};
          transform: rotate(${rotationAngle}deg);
          transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
          filter: drop-shadow(0 4px 12px rgba(0,0,0,0.3));
        ">
          <div style="
            position: absolute;
            top: ${markerTop};
            left: ${markerLeft};
            width: ${markerWidth};
            height: ${markerHeight};
            background: linear-gradient(135deg, #FF4444, #CC0000);
            border-radius: 10px 10px 6px 6px;
            box-shadow: 0 6px 12px rgba(0,0,0,0.4), inset 0 3px 6px rgba(255,255,255,0.2), 3px 3px 8px rgba(0,0,0,0.5);
            transform: perspective(150px) rotateX(15deg);
          ">
            <div style="
              position: absolute;
              top: -10px;
              left: ${isMobile ? '15px' : '20px'};
              width: 6px;
              height: 8px;
              background: #FFD700;
              border-radius: 4px 4px 0 0;
              box-shadow: 0 0 15px #FFD700;
              animation: flashRed 0.5s infinite alternate;
            "></div>
            <div style="
              position: absolute;
              top: -10px;
              right: ${isMobile ? '15px' : '20px'};
              width: 6px;
              height: 8px;
              background: #FFD700;
              border-radius: 4px 4px 0 0;
              box-shadow: 0 0 15px #FFD700;
              animation: flashBlue 0.5s infinite alternate 0.25s;
            "></div>
          </div>
          
          <div style="
            position: absolute;
            top: ${isMobile ? '15px' : '20px'};
            left: ${isMobile ? '32px' : '45px'};
            width: ${isMobile ? '22px' : '30px'};
            height: ${isMobile ? '18px' : '25px'};
            background: linear-gradient(135deg, #FFFFFF, #E0E0E0);
            border-radius: 8px 8px 4px 4px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.4);
            transform: perspective(120px) rotateX(10deg);
          ">
            <div style="
              position: absolute;
              top: 4px;
              left: 4px;
              width: 6px;
              height: 6px;
              background: #87CEEB;
              border-radius: 3px;
            "></div>
            <div style="
              position: absolute;
              top: 4px;
              right: 4px;
              width: 6px;
              height: 6px;
              background: #87CEEB;
              border-radius: 3px;
            "></div>
          </div>
          
          <div style="
            position: absolute;
            top: ${isMobile ? '8px' : '10px'};
            left: ${isMobile ? '40px' : '55px'};
            width: ${isMobile ? '8px' : '10px'};
            height: ${isMobile ? '8px' : '10px'};
            background: conic-gradient(red, blue, red);
            border-radius: 50%;
            animation: spinSiren 1s linear infinite;
            box-shadow: 0 0 20px rgba(255,0,0,0.8);
            z-index: 10;
          "></div>
          
          <div style="
            position: absolute;
            bottom: ${isMobile ? '10px' : '15px'};
            left: ${isMobile ? '18px' : '25px'};
            width: ${isMobile ? '9px' : '12px'};
            height: ${isMobile ? '9px' : '12px'};
            background: #222;
            border-radius: 50%;
            border: 2px solid #444;
            box-shadow: 0 2px 4px rgba(0,0,0,0.6);
          "></div>
          <div style="
            position: absolute;
            bottom: ${isMobile ? '10px' : '15px'};
            right: ${isMobile ? '18px' : '25px'};
            width: ${isMobile ? '9px' : '12px'};
            height: ${isMobile ? '9px' : '12px'};
            background: #222;
            border-radius: 50%;
            border: 2px solid #444;
            box-shadow: 0 2px 4px rgba(0,0,0,0.6);
          "></div>
          
          <div style="
            position: absolute;
            top: ${isMobile ? '-8px' : '-10px'};
            left: ${isMobile ? '40px' : '55px'};
            width: 0;
            height: 0;
            border-left: ${isMobile ? '8px' : '10px'} solid transparent;
            border-right: ${isMobile ? '8px' : '10px'} solid transparent;
            border-bottom: ${isMobile ? '15px' : '20px'} solid #2196F3;
            transform: translateX(-${isMobile ? '8px' : '10px'});
            opacity: ${speed > 5 ? 0.8 : 0.3};
            transition: opacity 0.3s;
          "></div>
          
          <div style="
            position: absolute;
            bottom: -5px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.8);
            color: white;
            padding: ${isMobile ? '1px 4px' : '2px 6px'};
            border-radius: 12px;
            font-size: ${isMobile ? '8px' : '10px'};
            font-weight: bold;
            white-space: nowrap;
            z-index: 5;
          ">
            ${speed} km/h
          </div>
        </div>
        
        <style>
          @keyframes spinSiren {
            0% { transform: rotate(0deg); background: conic-gradient(red 0deg, blue 180deg, red 360deg); }
            100% { transform: rotate(360deg); background: conic-gradient(red 0deg, blue 180deg, red 360deg); }
          }
          @keyframes flashRed {
            0%, 100% { background: #FFD700; box-shadow: 0 0 10px #FFD700; }
            50% { background: #FF4444; box-shadow: 0 0 20px #FF4444; }
          }
          @keyframes flashBlue {
            0%, 100% { background: #FFD700; box-shadow: 0 0 10px #FFD700; }
            50% { background: #2196F3; box-shadow: 0 0 20px #2196F3; }
          }
          .ambulance-marker-3d-gps:hover {
            transform: scale(1.1) rotate(${rotationAngle}deg);
          }
        </style>
      `;
      
      ambulanceMarker.current = new mapboxgl.Marker({ 
        element: el,
        anchor: 'center',
        rotationAlignment: 'map',
        pitchAlignment: 'map',
        rotation: rotationAngle
      })
        .setLngLat([position.lng, position.lat])
        .addTo(map.current);

      const popup = new mapboxgl.Popup({ offset: 25, closeButton: false, closeOnClick: false })
        .setHTML(`
          <div style="padding: ${isMobile ? '8px' : '12px'}; min-width: ${isMobile ? '200px' : '250px'};">
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <div style="width: ${isMobile ? '32px' : '40px'}; height: ${isMobile ? '32px' : '40px'}; background: linear-gradient(135deg, #FF4444, #CC0000); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: ${isMobile ? '16px' : '20px'}; margin-right: 12px;">
                🚑
              </div>
              <div>
                <strong style="color: #FF4444; font-size: ${isMobile ? '14px' : '16px'};">${AMBULANCE_NOMBRE}</strong>
                <div style="font-size: ${isMobile ? '10px' : '12px'}; color: #666;">Estado: ${ambulanceStatus.toUpperCase()}</div>
              </div>
            </div>
            
            <div style="margin: ${isMobile ? '8px 0' : '12px 0'}; font-size: ${isMobile ? '12px' : '14px'};">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="color: #666;">Velocidad:</span>
                <span style="font-weight: bold; color: ${speed > 80 ? '#FF4444' : speed > 40 ? '#FF9800' : '#4CAF50'}">${speed} km/h</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="color: #666;">Dirección:</span>
                <span style="font-weight: bold;">${Math.round(rotationAngle)}° ${getCardinalDirection(rotationAngle)}</span>
              </div>
            </div>
            
            <div style="margin-top: ${isMobile ? '8px' : '12px'}; font-size: ${isMobile ? '9px' : '11px'}; color: #888; text-align: center;">
              ${new Date().toLocaleTimeString()} • GPS Activo
            </div>
          </div>
        `);

      ambulanceMarker.current.setPopup(popup);
    } else {
      ambulanceMarker.current.setLngLat([position.lng, position.lat]);
      
      const markerElement = ambulanceMarker.current.getElement();
      if (markerElement) {
        const containerDiv = markerElement.querySelector('div');
        if (containerDiv) {
          containerDiv.style.transform = `rotate(${rotationAngle}deg)`;
          
          const speedElement = containerDiv.querySelector('div > div:nth-child(7)');
          if (speedElement) {
            speedElement.textContent = `${speed} km/h`;
            speedElement.style.background = speed > 80 ? 'rgba(255,68,68,0.9)' : 
                                           speed > 40 ? 'rgba(255,152,0,0.9)' : 
                                           'rgba(76,175,80,0.9)';
          }
          
          const arrowElement = containerDiv.querySelector('div > div:nth-child(6)');
          if (arrowElement) {
            arrowElement.style.opacity = speed > 5 ? '0.8' : '0.3';
          }
        }
      }

      if (ambulanceMarker.current.getPopup()) {
        ambulanceMarker.current.getPopup().setHTML(`
          <div style="padding: ${isMobile ? '8px' : '12px'}; min-width: ${isMobile ? '200px' : '250px'};">
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <div style="width: ${isMobile ? '32px' : '40px'}; height: ${isMobile ? '32px' : '40px'}; background: linear-gradient(135deg, #FF4444, #CC0000); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: ${isMobile ? '16px' : '20px'}; margin-right: 12px;">
                🚑
              </div>
              <div>
                <strong style="color: #FF4444; font-size: ${isMobile ? '14px' : '16px'};">${AMBULANCE_NOMBRE}</strong>
                <div style="font-size: ${isMobile ? '10px' : '12px'}; color: #666;">Estado: ${ambulanceStatus.toUpperCase()}</div>
              </div>
            </div>
            
            <div style="margin: ${isMobile ? '8px' : '12px'}; font-size: ${isMobile ? '12px' : '14px'};">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="color: #666;">Velocidad:</span>
                <span style="font-weight: bold; color: ${speed > 80 ? '#FF4444' : speed > 40 ? '#FF9800' : '#4CAF50'}">${speed} km/h</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="color: #666;">Dirección:</span>
                <span style="font-weight: bold;">${Math.round(rotationAngle)}° ${getCardinalDirection(rotationAngle)}</span>
              </div>
            </div>
            
            <div style="margin-top: ${isMobile ? '8px' : '12px'}; font-size: ${isMobile ? '9px' : '11px'}; color: #888; text-align: center;">
              ${new Date().toLocaleTimeString()} • GPS Activo
            </div>
          </div>
        `);
      }
    }

    if (isMapFollowing && !isNavigating && pos && map.current) {
      map.current.easeTo({
        center: [position.lng, position.lat],
        bearing: rotationAngle,
        pitch: speed > 40 ? 60 : 70,
        zoom: mapZoom,
        duration: 1000,
        essential: true
      });
    }
  }, [speed, ambulanceStatus, isNavigating, pos, isMapFollowing, mapZoom, isMobile, heading]);

  const getCardinalDirection = (angle) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(((angle %= 360) < 0 ? angle + 360 : angle) / 45) % 8;
    return directions[index];
  };

  // ========== WEBSOCKET CONNECTION ==========
  const connectWebSocket = useCallback(() => {
    if (!isMounted.current || isConnecting || connectionAttempts.current >= maxConnectionAttempts) {
      return;
    }

    try {
      if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) {
        return;
      }

      console.log('🔗 Conectando operador al WebSocket...');
      setIsConnecting(true);
      connectionAttempts.current += 1;

      ws.current = new WebSocket(import.meta.env.VITE_WS_URL || 'ws://localhost:3002/ws');

      ws.current.onopen = () => {
        if (!isMounted.current) return;
        
        console.log('✅ Operador conectado al servidor WebSocket');
        setWsConnected(true);
        setIsConnecting(false);
        connectionAttempts.current = 0;
        
        // Registrar esta ambulancia con su ID, placa y nombre
        safeSend({
          type: 'register_ambulance',
          ambulance: {
            id: AMBULANCE_ID,
            placa: AMBULANCE_PLACA,
            nombre: AMBULANCE_NOMBRE,
            tipo: 'UVI Móvil',
            status: ambulanceStatus,
            location: pos
          }
        });

        safeSend({ type: 'request_hospitals_list' });
        safeSend({ type: 'request_active_emergencies' });
        showToast('success', 'Sistema Conectado', 'Ambulancia registrada en el sistema');
      };

      ws.current.onmessage = (event) => {
        if (!isMounted.current) return;
        console.log('📨 Mensaje recibido en ambulancia:', data.type);
        
        try {
          const data = JSON.parse(event.data);
          console.log('📨 Mensaje recibido:', data.type);

          switch (data.type) {
            case 'connection_established':
              console.log('✅ Conexión WebSocket confirmada');
              break;
            case 'active_hospitals_update':
              if (data.hospitals) {
                console.log('🏥 Hospitales recibidos vía WS:', data.hospitals.length, 'conectados:', data.connected);
                processHospitalsList(data.hospitals);
              } else if (data.connectedIds) {
                setHospitals(prev => {
                  if (prev.length === 0) return prev;
                  return prev.map(h => ({
                    ...h,
                    connected: data.connectedIds.includes(h.id)
                  }));
                });
              }
              break;
            case 'all_hospitals_list':
              if (data.hospitals) processHospitalsList(data.hospitals);
              break;
            case 'route_updated':
              handleRouteUpdate(data);
              break;
            case 'location_update':
              handleAmbulanceLocationUpdate(data);
              break;
            case 'hospital_note':
              showToast('info', 'Mensaje del Hospital', data.note?.message || 'Nueva comunicación');
              break;
            case 'patient_accepted':
              handlePatientAccepted(data);
              break;
            case 'patient_accepted_with_route':
              handlePatientAcceptedWithRoute(data);
              break;
            case 'patient_rejected':
              handlePatientRejected(data);
              break;
            case 'navigation_cancelled':
              handleNavigationCancelled(data);
              break;
            case 'emergency_marker_cancelled':
              handleEmergencyMarkerCancelled(data);
              break;
            case 'notification_sent':
              showToast('success', 'Notificación Enviada', 'Hospital notificado correctamente');
              break;
            case 'automatic_redirect':
              handleAutomaticRedirect(data);
              break;
            case 'route_update':
              handleRouteUpdate(data);
              break;
            case 'no_hospitals_available':
              handleNoHospitalsAvailable(data);
              break;
            // ========== NUEVO: EMERGENCIA ASIGNADA ==========
            case 'new_emergency_assigned':
              handleNewEmergencyAssigned(data);
              break;
            case 'active_emergencies_update':
              // Actualizar lista de emergencias (para información general)
              console.log('📋 Emergencias activas:', data.emergencies?.length || 0);
              break;
            case 'error':
              showToast('error', 'Error del Sistema', data.message);
              break;
            default:
              console.log('📨 Mensaje no procesado:', data.type);
          }
        } catch (error) {
          console.error('❌ Error procesando mensaje:', error);
        }
      };

      ws.current.onclose = (event) => {
        if (!isMounted.current) return;
        console.log('🔌 WebSocket cerrado:', event.code, event.reason);
        setWsConnected(false);
        setIsConnecting(false);

        if (event.code !== 1000 && connectionAttempts.current < maxConnectionAttempts) {
          showToast('warning', 'Conexión Perdida', 'Reconectando automáticamente...');
          reconnectTimeout.current = setTimeout(() => {
            connectWebSocket();
          }, 5000);
        } else if (connectionAttempts.current >= maxConnectionAttempts) {
          showToast('error', 'Error de Conexión', 'No se pudo conectar después de varios intentos');
        }
      };

      ws.current.onerror = (error) => {
        if (!isMounted.current) return;
        console.error('❌ Error WebSocket:', error);
        setWsConnected(false);
        setIsConnecting(false);
        showToast('error', 'Error de Conexión', 'Verifique su conexión a internet');
      };

    } catch (error) {
      console.error('❌ Error al conectar WebSocket:', error);
      setIsConnecting(false);
    }
  }, [isConnecting, pos, ambulanceStatus]);

  // ========== MANEJO DE LISTA DE HOSPITALES ==========
  const processHospitalsList = (hospitalsData) => {
    if (!hospitalsData || hospitalsData.length === 0) {
      console.log('❌ No hay hospitales para cargar');
      return;
    }

    const hospitalsWithDistance = hospitalsData.map(hospital => {
      let distance = null;
      let estimatedTime = null;
      if (pos && hospital.lat && hospital.lng) {
        distance = calculateDistance(
          pos.lat, pos.lng,
          hospital.lat, hospital.lng
        );
        estimatedTime = Math.round(distance * 2);
      }
      return {
        ...hospital,
        distance,
        estimatedTime,
        activo: true,
      };
    });

    const sortedHospitals = pos 
      ? hospitalsWithDistance.sort((a, b) => {
          if (a.distance === null && b.distance === null) return 0;
          if (a.distance === null) return 1;
          if (b.distance === null) return -1;
          return a.distance - b.distance;
        })
      : hospitalsWithDistance.sort((a, b) => a.nombre.localeCompare(b.nombre));

    setHospitals(sortedHospitals);
    console.log(`✅ ${sortedHospitals.length} hospitales procesados (${sortedHospitals.filter(h => h.connected).length} conectados)`);
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // ========== MARCADORES DE HOSPITALES ==========
  const updateHospitalMarkers = useCallback((hospitalsList) => {
    if (!map.current) return;

    hospitalMarkers.current.forEach(marker => marker.remove());
    hospitalMarkers.current = [];

    hospitalsList.forEach((hospital, index) => {
      if (!hospital.lat || !hospital.lng) return;

      const isConnected = hospital.connected;
      const isActiveInDB = hospital.activo !== false;
      const isClosest = index === 0 && hospital.distance !== null;
      
      if (!isActiveInDB) return;

      let backgroundColor = 'linear-gradient(135deg, #9E9E9E, #757575)';
      let borderColor = '#9E9E9E';
      let opacity = 0.6;
      let icon = '🏢';
      let size = isMobile ? '44px' : '52px';
      let fontSize = isMobile ? '16px' : '20px';
      let boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      let animation = '';
      
      if (isConnected) {
        backgroundColor = 'linear-gradient(135deg, #4CAF50, #1B5E20)';
        borderColor = '#4CAF50';
        opacity = 1;
        icon = '🏥';
        size = isMobile ? '56px' : '66px';
        fontSize = isMobile ? '22px' : '26px';
        boxShadow = '0 6px 25px rgba(76,175,80,0.4)';
        animation = 'pulseGreen 2s infinite';
        if (isClosest) {
          size = isMobile ? '64px' : '76px';
          fontSize = isMobile ? '24px' : '30px';
          boxShadow = '0 8px 30px rgba(76,175,80,0.6)';
        }
      }

      const el = document.createElement('div');
      el.innerHTML = `
        <div style="
          width: ${size};
          height: ${size};
          background: ${backgroundColor};
          border: ${isConnected ? (isClosest ? '4px' : '3px') : '2px'} solid white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: ${fontSize};
          box-shadow: ${boxShadow};
          cursor: ${isConnected ? 'pointer' : 'default'};
          opacity: ${opacity};
          position: relative;
          transition: all 0.3s ease;
          ${animation ? `animation: ${animation};` : ''}
          ${!isConnected ? 'filter: grayscale(0.5);' : ''}
        ">
          ${icon}
          ${isConnected ? `
            <div style="
              position: absolute;
              top: -2px;
              right: -2px;
              width: 14px;
              height: 14px;
              background: #4CAF50;
              border: 2px solid white;
              border-radius: 50%;
              box-shadow: 0 0 8px rgba(76,175,80,0.8);
            "></div>
          ` : ''}
          ${isClosest && isConnected ? `
            <div style="
              position: absolute;
              bottom: -4px;
              right: -4px;
              background: #FF6F00;
              color: white;
              border-radius: 10px;
              padding: 1px 5px;
              font-size: 8px;
              font-weight: bold;
              box-shadow: 0 2px 6px rgba(255,111,0,0.5);
            ">#1</div>
          ` : ''}
        </div>
        <style>
          @keyframes pulseGreen {
            0% { transform: scale(1); box-shadow: 0 6px 25px rgba(76,175,80,0.3); }
            50% { transform: scale(1.08); box-shadow: 0 10px 35px rgba(76,175,80,0.6); }
            100% { transform: scale(1); box-shadow: 0 6px 25px rgba(76,175,80,0.3); }
          }
        </style>
      `;

      const popup = new mapboxgl.Popup({ offset: 25, closeButton: true, closeOnClick: false })
        .setHTML(`
          <div style="padding: ${isMobile ? '8px' : '12px'}; max-width: ${isMobile ? '240px' : '280px'}; font-family: Arial, sans-serif;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              <div style="width: 10px; height: 10px; border-radius: 50%; background: ${isConnected ? '#4CAF50' : '#9E9E9E'}; box-shadow: ${isConnected ? '0 0 8px rgba(76,175,80,0.8)' : 'none'}; ${isConnected ? 'animation: pulseGreenPop 2s infinite;' : ''}"></div>
              <strong style="font-size: ${isMobile ? '14px' : '16px'}; color: #333;">${hospital.nombre}</strong>
              <span style="margin-left: auto; font-size: 10px; padding: 2px 8px; border-radius: 12px; background: ${isConnected ? '#E8F5E9' : '#F5F5F5'}; color: ${isConnected ? '#2E7D32' : '#9E9E9E'}; font-weight: bold;">
                ${isConnected ? 'EN LÍNEA' : 'INACTIVO'}
              </span>
            </div>
            <div style="margin: ${isMobile ? '6px 0' : '8px 0'}; font-size: ${isMobile ? '12px' : '14px'}; color: #666;">
              <div>📍 ${hospital.direccion || 'Dirección no disponible'}</div>
              ${hospital.distance ? `<div style="margin-top: 4px;">📏 ${hospital.distance.toFixed(1)} km de distancia</div>` : ''}
              ${hospital.estimatedTime ? `<div style="margin-top: 4px;">🕐 ~${hospital.estimatedTime} min (estimado)</div>` : ''}
              ${hospital.especialidades?.length > 0 ? 
                `<div style="margin-top: 4px;">🏥 ${hospital.especialidades.slice(0, 3).join(', ')}</div>` : ''}
              ${hospital.camasDisponibles ? 
                `<div style="margin-top: 4px;">🛏️ ${hospital.camasDisponibles} camas disponibles</div>` : ''}
              ${hospital.telefono ? 
                `<div style="margin-top: 4px;">📞 ${hospital.telefono}</div>` : ''}
            </div>
            ${isConnected ? `
              <button onclick="window.selectHospitalFromMap('${hospital.id}')" 
                style="width: 100%; padding: ${isMobile ? '8px 12px' : '10px 16px'}; background: linear-gradient(135deg, #4CAF50, #2E7D32); color: white; 
                border: none; border-radius: 8px; cursor: pointer; margin-top: 8px; font-weight: bold;
                font-size: ${isMobile ? '12px' : '14px'};
                box-shadow: 0 2px 8px rgba(76,175,80,0.3); transition: all 0.2s;"
                onmouseover="this.style.background='linear-gradient(135deg, #2E7D32, #1B5E20)'" 
                onmouseout="this.style.background='linear-gradient(135deg, #4CAF50, #2E7D32)'">
                🚑 Seleccionar como Destino
              </button>
            ` : 
            '<div style="padding: 8px; background: #F5F5F5; color: #9E9E9E; text-align: center; border-radius: 8px; margin-top: 8px; font-size: 12px; border: 1px dashed #CCC;">Hospital no conectado - No disponible</div>'}
          </div>
          <style>
            @keyframes pulseGreenPop {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.5; }
            }
          </style>
        `);

      const hospitalMarker = new mapboxgl.Marker({ element: el })
        .setLngLat([hospital.lng, hospital.lat])
        .setPopup(popup)
        .addTo(map.current);

      hospitalMarkers.current.push(hospitalMarker);

      if (isConnected) {
        el.addEventListener('click', () => {
          setSelectedHospital(hospital.id);
          showToast('info', 'Destino Seleccionado', hospital.nombre);
        });
      }
    });

    window.selectHospitalFromMap = (hospitalId) => {
      const hospital = hospitalsList.find(h => h.id === hospitalId);
      if (hospital) {
        setSelectedHospital(hospitalId);
        showToast('info', 'Destino Seleccionado', hospital.nombre);
        map.current.flyTo({
          center: [hospital.lng, hospital.lat],
          zoom: 16,
          duration: 1000
        });
      }
    };
  }, [isMobile]);

  useEffect(() => {
    updateHospitalMarkers(hospitals);
  }, [hospitals, updateHospitalMarkers]);

  // ========== CAPA DE TRÁFICO ==========
  const addTrafficLayer = () => {
    if (!map.current) return;
    try {
      if (!map.current.getSource('mapbox-traffic')) {
        map.current.addSource('mapbox-traffic', {
          type: 'vector',
          url: 'mapbox://mapbox.mapbox-traffic-v1'
        });
      }
      if (!map.current.getLayer('traffic-layer')) {
        map.current.addLayer({
          id: 'traffic-layer',
          type: 'line',
          source: 'mapbox-traffic',
          'source-layer': 'traffic',
          paint: {
            'line-color': [
              'match',
              ['get', 'congestion'],
              'low', '#00C853',
              'moderate', '#FFD600',
              'heavy', '#FF9100',
              'severe', '#D50000',
              '#00C853'
            ],
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, isMobile ? 2 : 3,
              14, isMobile ? 3 : 5,
              18, isMobile ? 6 : 8
            ],
            'line-opacity': 0.9
          },
          'layout': {
            'line-cap': 'round',
            'line-join': 'round',
            'visibility': trafficEnabled ? 'visible' : 'none'
          }
        }, 'waterway-label');
      } else {
        map.current.setLayoutProperty('traffic-layer', 'visibility', trafficEnabled ? 'visible' : 'none');
      }

      if (!document.querySelector('.traffic-legend')) {
        const legend = document.createElement('div');
        legend.className = 'traffic-legend';
        legend.style.cssText = `
          position: absolute;
          bottom: 30px;
          left: 10px;
          background: rgba(255, 255, 255, 0.9);
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          z-index: 500;
          backdrop-filter: blur(4px);
          line-height: 1.6;
        `;
        legend.innerHTML = `
          <div style="font-weight: bold; margin-bottom: 4px;">Tráfico</div>
          <div><span style="display: inline-block; width: 12px; height: 12px; background: #00C853; border-radius: 2px; margin-right: 6px;"></span> Fluido</div>
          <div><span style="display: inline-block; width: 12px; height: 12px; background: #FFD600; border-radius: 2px; margin-right: 6px;"></span> Moderado</div>
          <div><span style="display: inline-block; width: 12px; height: 12px; background: #FF9100; border-radius: 2px; margin-right: 6px;"></span> Congestionado</div>
          <div><span style="display: inline-block; width: 12px; height: 12px; background: #D50000; border-radius: 2px; margin-right: 6px;"></span> Severo</div>
        `;
        mapContainer.current.appendChild(legend);
      }

    } catch (error) {
      console.warn('No se pudo agregar capa de tráfico:', error);
    }
  };

  const toggleTraffic = () => {
    if (!map.current) return;
    if (trafficEnabled) {
      if (map.current.getLayer('traffic-layer')) {
        map.current.setLayoutProperty('traffic-layer', 'visibility', 'none');
      }
      const legend = document.querySelector('.traffic-legend');
      if (legend) legend.style.display = 'none';
      setTrafficEnabled(false);
      showToast('info', 'Tráfico', 'Capa de tráfico desactivada');
    } else {
      addTrafficLayer();
      setTrafficEnabled(true);
      showToast('info', 'Tráfico', 'Capa de tráfico activada');
    }
  };

  // ========== MANEJO DE RUTAS ==========
  const handleRouteUpdate = (data) => {
    if (data.routeGeometry) {
      const routeId = `route-${data.ambulanceId || AMBULANCE_ID}-${data.hospitalId || 'dest'}`;
      drawRoute(data.routeGeometry, routeId, 0);
      
      if (data.steps && data.steps.length > 0) {
        const steps = data.steps.map((step, idx) => ({
          number: idx + 1,
          instruction: step.maneuver.instruction || `Continuar por ${step.name || 'la vía'}`,
          distance: step.distance,
          duration: step.duration,
          maneuver: step.maneuver.type || 'straight'
        }));
        setCurrentManeuver(steps[0] || null);
        if (steps.length > 1) setNextManeuver(steps[1]);
        else setNextManeuver(null);
      }
      
      setRouteProgress({
        distanceRemaining: data.distance,
        durationRemaining: data.duration
      });
      
      const newRoute = {
        routeKey: routeId,
        ambulanceId: data.ambulanceId || AMBULANCE_ID,
        hospitalId: data.hospitalId,
        geometry: data.routeGeometry,
        distance: data.distance,
        duration: data.duration,
        isEmergencyRoute: data.isEmergencyRoute || false
      };
      setActiveRoutes(prev => [
        ...prev.filter(r => r.routeKey !== routeId),
        newRoute
      ]);
    }
  };

  // ========== DIBUJAR RUTA EN EL MAPA ==========
  const drawRoute = (routeGeometry, routeId, index = 0) => {
    if (!map.current || !routeGeometry) return;
    const uniqueRouteId = `${routeId}-${Date.now()}`;
    
    try {
      map.current.addSource(uniqueRouteId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: routeGeometry
          },
          properties: {}
        }
      });

      const colors = ['#2196F3', '#4CAF50', '#FF9800', '#9C27B0'];
      const routeColor = colors[index % colors.length];

      map.current.addLayer({
        id: uniqueRouteId,
        type: 'line',
        source: uniqueRouteId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': routeColor,
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, isMobile ? 3 : 4,
            14, isMobile ? 4 : 6,
            18, isMobile ? 6 : 8
          ],
          'line-opacity': 0.9,
          'line-dasharray': [1, 0]
        }
      });

      map.current.addLayer({
        id: `${uniqueRouteId}-dots`,
        type: 'line',
        source: uniqueRouteId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': routeColor,
          'line-width': isMobile ? 3 : 4,
          'line-opacity': 0.6,
          'line-dasharray': [0, 4, 3]
        }
      });

      map.current.addLayer({
        id: `${uniqueRouteId}-glow`,
        type: 'line',
        source: uniqueRouteId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': routeColor,
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, isMobile ? 6 : 8,
            14, isMobile ? 8 : 12,
            18, isMobile ? 14 : 20
          ],
          'line-opacity': 0.2,
          'line-blur': 2
        }
      }, uniqueRouteId);

      routeLayerIds.current.push(uniqueRouteId, `${uniqueRouteId}-dots`, `${uniqueRouteId}-glow`);
      routeSources.current.push(uniqueRouteId);

      let timer = 0;
      const animateRoute = () => {
        timer = (timer + 1) % 100;
        if (map.current.getLayer(`${uniqueRouteId}-dots`)) {
          map.current.setPaintProperty(
            `${uniqueRouteId}-dots`,
            'line-dasharray',
            [0, 4, 3].map(num => num * (Math.sin(timer / 10) * 0.5 + 0.5))
          );
        }
        if (isMounted.current) requestAnimationFrame(animateRoute);
      };
      animateRoute();

      if (pos) {
        const bounds = new mapboxgl.LngLatBounds();
        bounds.extend([pos.lng, pos.lat]);
        routeGeometry.forEach(coord => {
          bounds.extend([coord[0], coord[1]]);
        });
        map.current.fitBounds(bounds, {
          padding: isMobile ? 80 : 120,
          duration: 2000,
          pitch: 55,
          bearing: heading
        });
      }

    } catch (error) {
      console.error('❌ Error dibujando ruta:', error);
    }
  };

  const clearAllRoutes = () => {
    if (!map.current) return;
    routeLayerIds.current.forEach(layerId => {
      if (map.current.getLayer(layerId)) map.current.removeLayer(layerId);
    });
    routeSources.current.forEach(sourceId => {
      if (map.current.getSource(sourceId)) map.current.removeSource(sourceId);
    });
    routeLayerIds.current = [];
    routeSources.current = [];
    setActiveRoutes([]);
    setCurrentManeuver(null);
    setNextManeuver(null);
    setRouteProgress(null);
  };

  const clearSpecificRoute = (routeKey) => {
    if (!map.current) return;
    const layersToRemove = routeLayerIds.current.filter(id => id.includes(routeKey));
    layersToRemove.forEach(layerId => {
      if (map.current.getLayer(layerId)) map.current.removeLayer(layerId);
    });
    const sourcesToRemove = routeSources.current.filter(id => id.includes(routeKey));
    sourcesToRemove.forEach(sourceId => {
      if (map.current.getSource(sourceId)) map.current.removeSource(sourceId);
    });
    routeLayerIds.current = routeLayerIds.current.filter(id => !id.includes(routeKey));
    routeSources.current = routeSources.current.filter(id => !id.includes(routeKey));
    setActiveRoutes(prev => prev.filter(route => route.routeKey !== routeKey));
    if (activeRoutes.length === 0) {
      setCurrentManeuver(null);
      setNextManeuver(null);
      setRouteProgress(null);
    }
  };

  // ========== MANEJADORES DE EVENTOS DE PACIENTE / HOSPITAL ==========
  const handlePatientAccepted = (data) => {
    setHospitalNotification({
      type: 'accepted',
      message: `✅ ${data.hospitalInfo?.nombre || 'Hospital'} ha aceptado al paciente - Proceda al traslado`,
      hospitalInfo: data.hospitalInfo
    });
    setIsNavigating(true);
    setAmbulanceStatus('en_ruta');
    setDestination(data.hospitalInfo);
    const updatedHospitals = hospitals.map(h => 
      h.id === data.hospitalId ? { ...h, camasDisponibles: (h.camasDisponibles || 1) - 1 } : h
    );
    setHospitals(updatedHospitals);
    setTimeout(() => setHospitalNotification(null), 6000);
  };

  const handlePatientAcceptedWithRoute = (data) => {
    setHospitalNotification({
      type: 'accepted',
      message: `✅ ${data.hospitalInfo?.nombre || 'Hospital'} ha aceptado al paciente - Ruta trazada`,
      hospitalInfo: data.hospitalInfo
    });
    setIsNavigating(true);
    setAmbulanceStatus('en_ruta');
    setDestination(data.hospitalInfo);
    if (data.routeGeometry) {
      const routeId = `route-accepted-${data.hospitalId}-${Date.now()}`;
      drawRoute(data.routeGeometry, routeId, 0);
      if (data.isEmergencyRoute) removeEmergencyMarker();
      safeSend({
        type: 'request_route_recompute',
        ambulanceId: AMBULANCE_ID,
        hospitalId: data.hospitalId
      });
      const newRoute = {
        routeKey: routeId,
        ambulanceId: AMBULANCE_ID,
        hospitalId: data.hospitalId,
        distance: data.distance,
        duration: data.duration,
        geometry: data.routeGeometry,
        isEmergencyRoute: data.isEmergencyRoute || false
      };
      setActiveRoutes(prev => [...prev.filter(r => r.hospitalId !== data.hospitalId), newRoute]);
      setPendingEmergencyRoute(null);
    }
    const updatedHospitals = hospitals.map(h => 
      h.id === data.hospitalId ? { ...h, camasDisponibles: (h.camasDisponibles || 1) - 1 } : h
    );
    setHospitals(updatedHospitals);
    setTimeout(() => setHospitalNotification(null), 6000);
  };

  const handlePatientRejected = (data) => {
    setHospitalNotification({
      type: 'rejected', 
      message: `❌ ${data.hospitalInfo?.nombre || 'Hospital'} no puede aceptar al paciente. Razón: ${data.reason}`,
      hospitalInfo: data.hospitalInfo
    });
    setIsNavigating(false);
    setAmbulanceStatus('disponible');
    if (data.hospitalId) {
      const routeToRemove = activeRoutes.find(route => route.hospitalId === data.hospitalId);
      if (routeToRemove) clearSpecificRoute(routeToRemove.routeKey);
    }
    showToast('warning', 'Paciente Rechazado', 'Hospital no disponible para atender emergencia');
    setTimeout(() => setHospitalNotification(null), 6000);
  };

  const handleAutomaticRedirect = (data) => {
    showToast('info', 'Redirección Automática', data.message || 'Solicitud enviada a otro hospital');
    setSelectedHospital(data.newHospitalId);
    if (data.rejectedHospitals) console.log('Hospitales rechazados:', data.rejectedHospitals);
    if (data.remainingHospitals !== undefined) console.log('Hospitales restantes disponibles:', data.remainingHospitals);
  };

  const handleNoHospitalsAvailable = (data) => {
    setHospitalNotification({
      type: 'error',
      message: '❌ No hay más hospitales disponibles para atender la emergencia'
    });
    setIsNavigating(false);
    setAmbulanceStatus('disponible');
    clearAllRoutes();
    removeEmergencyMarker();
    showToast('error', 'Sin Hospitales Disponibles', 'Todos los hospitales han rechazado la solicitud');
    setTimeout(() => setHospitalNotification(null), 6000);
  };

  const handleNavigationCancelled = (data) => {
    setIsNavigating(false);
    setAmbulanceStatus('disponible');
    setHospitalNotification(null);
    if (data.isEmergencyRoute) removeEmergencyMarker();
    if (data.routeKey) clearSpecificRoute(data.routeKey);
    else clearAllRoutes();
    setPendingEmergencyRoute(null);
    showToast('info', 'Navegación Cancelada', data.message || 'Ruta eliminada del sistema');
  };

  const handleEmergencyMarkerCancelled = (data) => {
    removeEmergencyMarker();
    showToast('info', 'Marcador Eliminado', 'Punto de emergencia removido');
  };

  // ========== NUEVO: MANEJO DE EMERGENCIA ASIGNADA ==========
  const handleNewEmergencyAssigned = (data) => {
    console.log('🚨 Nueva emergencia asignada:', data);
    console.log('🚨 Emergencia asignada recibida en ambulancia:', data);
    
    // Guardar la emergencia asignada
    setAssignedEmergency({
      callId: data.callId,
      location: data.location,
      address: data.address || 'Sin dirección',
      emergencyType: data.emergencyType || 'No especificado',
      patientInfo: data.patientInfo || {},
      notes: data.notes || '',
      timestamp: data.timestamp,
      assignedAt: data.assignedAt
    });

    // Mostrar notificación push con modal de alerta
    showToast('error', '🚨 EMERGENCIA ASIGNADA', 
      `Folio: ${data.callId} - ${data.emergencyType || 'Emergencia'} en ${data.address || 'ubicación desconocida'}`
    );

    console.log('🚨 EMERGENCIA ASIGNADA RECIBIDA EN AMBULANCIA');
    // Abrir modal de confirmación de emergencia
    onEmergencyModalOpen();

    // Colocar marcador de emergencia en el mapa
    if (data.location && data.location.lat && data.location.lng) {
      placeAssignedEmergencyMarker(data.location, data.address);
      map.current.flyTo({
        center: [data.location.lng, data.location.lat],
        zoom: 17,
        pitch: 60,
        duration: 1500
      });
    }

    // Cambiar estado de la ambulancia a "en_ruta"
    setAmbulanceStatus('en_ruta');
    setIsNavigating(true);

    setDestination({
      id: `emergency-${data.callId}`,
      nombre: `EMERGENCIA ${data.callId}`,
      lat: data.location.lat,
      lng: data.location.lng,
      address: data.address
    });

    // Calcular ruta hacia la emergencia
    if (pos) {
      calculateRoute(pos, { lat: data.location.lat, lng: data.location.lng })
        .then(routeData => {
          if (routeData) {
            const routeId = `route-emergency-${data.callId}`;
            drawRoute(routeData.geometry, routeId, 0);
            setActiveRoutes(prev => [...prev, {
              routeKey: routeId,
              ambulanceId: AMBULANCE_ID,
              geometry: routeData.geometry,
              distance: (routeData.distance / 1000).toFixed(1),
              duration: Math.round(routeData.duration / 60),
              isEmergencyRoute: true
            }]);
            setCurrentManeuver(routeData.steps[0] || null);
            setRouteProgress({
              distanceRemaining: routeData.distance,
              durationRemaining: routeData.duration
            });
            showToast('success', 'Ruta Calculada', 'Navegando hacia la emergencia');
          }
        })
        .catch(err => console.error('Error calculando ruta a emergencia:', err));
    }
  };

  // ========== MARCADOR DE EMERGENCIA ASIGNADA ==========
  const placeAssignedEmergencyMarker = (location, address) => {
    if (!map.current) return;

    if (assignedEmergencyMarker.current) {
      assignedEmergencyMarker.current.remove();
      assignedEmergencyMarker.current = null;
    }

    const el = document.createElement('div');
    el.innerHTML = `
      <div style="
        position: relative;
        width: ${isMobile ? '65px' : '80px'};
        height: ${isMobile ? '65px' : '80px'};
        background: radial-gradient(circle, #FF1744, #D50000);
        border: 4px solid white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: ${isMobile ? '30px' : '40px'};
        box-shadow: 0 0 30px rgba(255,23,68,0.8);
        cursor: pointer;
        animation: pulseEmergencyAssigned 1.5s infinite;
      ">
        🚨
        <div style="
          position: absolute;
          top: -10px;
          right: -10px;
          width: ${isMobile ? '24px' : '30px'};
          height: ${isMobile ? '24px' : '30px'};
          background: #FFD600;
          border-radius: 50%;
          border: 3px solid white;
          animation: blink 1s infinite;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: ${isMobile ? '12px' : '16px'};
          font-weight: bold;
          color: black;
        ">!</div>
      </div>
      <style>
        @keyframes pulseEmergencyAssigned {
          0% { transform: scale(1); box-shadow: 0 0 30px rgba(255,23,68,0.8); }
          50% { transform: scale(1.15); box-shadow: 0 0 60px rgba(255,23,68,1); }
          100% { transform: scale(1); box-shadow: 0 0 30px rgba(255,23,68,0.8); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      </style>
    `;

    const popup = new mapboxgl.Popup({ offset: 35, closeButton: true, closeOnClick: false })
      .setHTML(`
        <div style="padding: ${isMobile ? '8px' : '12px'}; max-width: ${isMobile ? '260px' : '320px'};">
          <strong style="font-size: ${isMobile ? '16px' : '18px'}; color: #D50000;">🚨 EMERGENCIA ASIGNADA</strong>
          <div style="margin: ${isMobile ? '6px 0' : '8px 0'}; font-size: ${isMobile ? '13px' : '15px'}; color: #333;">
            <strong>Ubicación:</strong> ${address || 'No disponible'}
          </div>
          <div style="font-size: ${isMobile ? '12px' : '14px'}; color: #666;">
            <div><strong>Tipo:</strong> ${assignedEmergency?.emergencyType || 'No especificado'}</div>
            <div><strong>Folio:</strong> ${assignedEmergency?.callId || 'N/A'}</div>
            <div><strong>Asignada:</strong> ${new Date(assignedEmergency?.assignedAt).toLocaleTimeString()}</div>
          </div>
          <div style="margin-top: 10px; display: flex; gap: 8px;">
            <button onclick="window.navigateToEmergency()" 
              style="flex:1; padding: 8px; background: #D50000; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">
              🗺️ Navegar
            </button>
            <button onclick="window.clearAssignedEmergency()" 
              style="flex:1; padding: 8px; background: #757575; color: white; border: none; border-radius: 6px; cursor: pointer;">
              ✅ Completar
            </button>
          </div>
        </div>
      `);

    assignedEmergencyMarker.current = new mapboxgl.Marker({ element: el })
      .setLngLat([location.lng, location.lat])
      .setPopup(popup)
      .addTo(map.current);

    window.navigateToEmergency = () => {
      if (assignedEmergency && assignedEmergency.location) {
        map.current.flyTo({
          center: [assignedEmergency.location.lng, assignedEmergency.location.lat],
          zoom: 18,
          pitch: 70,
          duration: 1500
        });
        showToast('info', 'Navegando', 'Centrando en la emergencia');
      }
    };

    window.clearAssignedEmergency = () => {
      if (assignedEmergencyMarker.current) {
        assignedEmergencyMarker.current.remove();
        assignedEmergencyMarker.current = null;
      }
      setAssignedEmergency(null);
      setAmbulanceStatus('disponible');
      setIsNavigating(false);
      setDestination(null);
      clearAllRoutes();
      showToast('success', 'Emergencia Completada', 'Marcador eliminado y estado restaurado');
      // Notificar al servidor que la emergencia ha sido completada (opcional)
      safeSend({
        type: 'emergency_completed',
        ambulanceId: AMBULANCE_ID,
        callId: assignedEmergency?.callId
      });
    };
  };

  // ========== REMOVER MARCADOR DE EMERGENCIA (genérico) ==========
  const removeEmergencyMarker = () => {
    if (emergencyMarker.current) {
      emergencyMarker.current.remove();
      emergencyMarker.current = null;
      setSelectedLocation(null);
    }
  };

  // ========== BUSCADOR MEJORADO ==========
  const searchAddresses = useCallback((query) => {
    if (searchDebounceTimer.current) clearTimeout(searchDebounceTimer.current);
    if (!query || query.trim().length < 3) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchDebounceTimer.current = setTimeout(async () => {
      const requestId = ++searchRequestId.current;
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query.trim())}.json?access_token=${mapboxgl.accessToken}&country=mx&limit=6&language=es`;
        const res = await fetch(url);
        const data = await res.json();
        if (requestId !== searchRequestId.current) return;
        setSearchResults((data.features || []).map(f => ({
          id: f.id,
          place_name: f.place_name,
          lat: f.center[1],
          lng: f.center[0],
        })));
      } catch (e) {
        if (requestId === searchRequestId.current) setSearchResults([]);
      } finally {
        if (requestId === searchRequestId.current) setIsSearching(false);
      }
    }, 300);
  }, []);

  const selectSearchResult = (result) => {
    setSearchQuery(result.place_name);
    setSearchResults([]);
    placeEmergencyMarker({ lat: result.lat, lng: result.lng }, result.place_name);
    map.current.flyTo({ center: [result.lng, result.lat], zoom: 17 });
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSelectedLocation(null);
    removeEmergencyMarker();
    showToast('info', 'Búsqueda Limpiada', 'Campo de búsqueda vacío');
  };

  const placeEmergencyMarker = (location, address = 'Punto de Emergencia') => {
    if (!map.current) return;
    removeEmergencyMarker();

    const el = document.createElement('div');
    el.innerHTML = `
      <div style="
        position: relative;
        width: ${isMobile ? '55px' : '70px'};
        height: ${isMobile ? '55px' : '70px'};
        background: linear-gradient(135deg, #FF9800, #F57C00);
        border: 4px solid white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: ${isMobile ? '22px' : '28px'};
        box-shadow: 0 8px 25px rgba(255,152,0,0.5);
        cursor: pointer;
        animation: pulseEmergency 2s infinite;
      ">
        ⚠️
        <div style="
          position: absolute;
          top: -12px;
          right: -12px;
          width: ${isMobile ? '20px' : '24px'};
          height: ${isMobile ? '20px' : '24px'};
          background: #FF4444;
          border-radius: 50%;
          border: 3px solid white;
          animation: blink 1s infinite;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: ${isMobile ? '10px' : '12px'};
          font-weight: bold;
        ">!</div>
      </div>
      <style>
        @keyframes pulseEmergency {
          0% { transform: scale(1); box-shadow: 0 8px 25px rgba(255,152,0,0.5); }
          50% { transform: scale(1.1); box-shadow: 0 12px 30px rgba(255,152,0,0.7); }
          100% { transform: scale(1); box-shadow: 0 8px 25px rgba(255,152,0,0.5); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      </style>
    `;

    const popup = new mapboxgl.Popup({ offset: 25, closeButton: true, closeOnClick: false })
      .setHTML(`
        <div style="padding: ${isMobile ? '8px' : '12px'}; max-width: ${isMobile ? '240px' : '280px'};">
          <strong style="font-size: ${isMobile ? '14px' : '16px'}; color: #FF9800;">⚠️ PUNTO DE EMERGENCIA</strong>
          <div style="margin: ${isMobile ? '6px 0' : '8px 0'}; font-size: ${isMobile ? '12px' : '14px'}; color: #666;">
            ${address}
          </div>
          <div style="margin: ${isMobile ? '6px 0' : '8px 0'}; font-size: ${isMobile ? '10px' : '12px'}; color: #888;">
            Marcado: ${new Date().toLocaleTimeString()}
          </div>
          <div style="display: flex; gap: 8px; margin-top: 12px;">
            <button onclick="window.centerOnEmergency()" 
              style="flex: 1; padding: ${isMobile ? '6px' : '8px'}; background: #2196F3; color: white;
              border: none; border-radius: 6px; cursor: pointer; font-size: ${isMobile ? '11px' : '12px'};">
              🗺️ Centrar
            </button>
            <button onclick="window.removeEmergencyMarker()" 
              style="flex: 1; padding: ${isMobile ? '6px' : '8px'}; background: #FF4444; color: white;
              border: none; border-radius: 6px; cursor: pointer; font-size: ${isMobile ? '11px' : '12px'};">
              🗑️ Eliminar
            </button>
          </div>
        </div>
      `);

    emergencyMarker.current = new mapboxgl.Marker({ element: el, draggable: false })
      .setLngLat([location.lng, location.lat])
      .setPopup(popup)
      .addTo(map.current);

    window.centerOnEmergency = () => {
      map.current.flyTo({
        center: [location.lng, location.lat],
        zoom: 18,
        pitch: 70,
        duration: 1500
      });
    };

    window.removeEmergencyMarker = () => {
      removeEmergencyMarker();
      showToast('info', 'Marcador Eliminado', 'Punto de emergencia removido');
    };

    map.current.flyTo({
      center: [location.lng, location.lat],
      zoom: 18,
      pitch: 70,
      duration: 1500
    });

    setSelectedLocation(location);
    showToast('info', 'Ubicación de Emergencia', 'Punto de emergencia marcado en el mapa');
  };

  const goToEmergencyLocation = () => {
    if (!selectedLocation) {
      showToast('warning', 'Ubicación Requerida', 'Primero busque y seleccione una ubicación');
      return;
    }
    map.current.flyTo({
      center: [selectedLocation.lng, selectedLocation.lat],
      zoom: 18,
      duration: 1500,
      pitch: 70
    });
    showToast('info', 'Navegando a Emergencia', 'Ubicación de emergencia centrada en el mapa');
  };

  // ========== CALCULAR RUTA (ORIGEN = AMBULANCIA, DESTINO = EMERGENCIA/HOSPITAL) ==========
  const calculateRoute = async (start, end) => {
    if (!start || !end) {
      showToast('error', 'Error de Ruta', 'Ubicaciones no válidas');
      return null;
    }

    try {
      const startLng = start.lng || start.longitude;
      const startLat = start.lat || start.latitude;
      const endLng = end.lng || end.longitude;
      const endLat = end.lat || end.latitude;

      if (!startLng || !startLat || !endLng || !endLat) {
        throw new Error('Coordenadas inválidas');
      }

      const coords = `${startLng},${startLat};${endLng},${endLat}`;
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?geometries=geojson&overview=full&steps=true&access_token=${mapboxgl.accessToken}&language=es&alternatives=false`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Error calculando ruta');

      const data = await response.json();
      if (!data.routes || data.routes.length === 0) {
        throw new Error('No se encontraron rutas');
      }

      const route = data.routes[0];
      return {
        geometry: route.geometry.coordinates,
        distance: route.distance,
        duration: route.duration,
        summary: `${(route.distance / 1000).toFixed(1)} km, ${Math.round(route.duration / 60)} min`,
        steps: route.legs?.[0]?.steps || []
      };
    } catch (error) {
      console.error('❌ Error calculando ruta:', error);
      showToast('error', 'Error de Ruta', 'No se pudo calcular la ruta al destino');
      return null;
    }
  };

  // ========== INICIAR EMERGENCIA DESDE EL DRAWER ==========
  const startEmergency = async () => {
    if (emergencyMode === 'atender_emergencia' && !selectedLocation) {
      showToast('warning', 'Ubicación Requerida', 'Seleccione la ubicación de la emergencia');
      return;
    }

    if (emergencyMode === 'trasladar_paciente' && !selectedHospital) {
      showToast('warning', 'Hospital No Seleccionado', 'Seleccione un hospital destino');
      return;
    }

    const hospital = hospitals.find(h => h.id === selectedHospital && h.connected && h.activo);
    if (emergencyMode === 'trasladar_paciente' && !hospital) {
      showToast('error', 'Hospital No Disponible', 'El hospital seleccionado no está disponible');
      return;
    }

    if (!pos) {
      showToast('error', 'Ubicación No Disponible', 'Esperando señal GPS...');
      return;
    }

    const startLocation = pos;
    const endLocation = emergencyMode === 'atender_emergencia' ? selectedLocation : hospital;

    try {
      const routeData = await calculateRoute(startLocation, endLocation);
      if (!routeData) return;

      const routeId = `route-${emergencyMode === 'atender_emergencia' ? 'emergency' : hospital.id}-${Date.now()}`;
      drawRoute(routeData.geometry, routeId, 0);

      setActiveRoutes(prev => [...prev, {
        routeKey: routeId,
        ambulanceId: AMBULANCE_ID,
        geometry: routeData.geometry,
        distance: (routeData.distance / 1000).toFixed(1),
        duration: Math.round(routeData.duration / 60)
      }]);

      if (routeData.steps && routeData.steps.length > 0) {
        setCurrentManeuver(routeData.steps[0]);
        if (routeData.steps.length > 1) setNextManeuver(routeData.steps[1]);
        else setNextManeuver(null);
        setRouteProgress({
          distanceRemaining: routeData.distance,
          durationRemaining: routeData.duration
        });
      }
      
      const patientInfo = includePatientInfo ? {
        age: age,
        sex: sex,
        emergencyType: emergencyType,
        condition: patientCondition,
        vitalSigns: vitalSigns,
        timestamp: new Date().toLocaleString(),
        emergencyLocation: selectedLocation ? searchQuery : 'Ubicación actual'
      } : {
        timestamp: new Date().toLocaleString(),
        emergencyLocation: selectedLocation ? searchQuery : 'Ubicación actual',
        infoProvided: false
      };

      if (emergencyMode === 'trasladar_paciente') {
        safeSend({
          type: 'patient_transfer_notification',
          ambulanceId: AMBULANCE_ID,
          hospitalId: hospital.id,
          patientInfo: patientInfo,
          ambulanceLocation: startLocation,
          eta: Math.round(routeData.duration / 60),
          distance: (routeData.distance / 1000).toFixed(1),
          routeGeometry: routeData.geometry,
          rawDistance: routeData.distance,
          rawDuration: routeData.duration,
          emergencyMode: emergencyMode,
          isEmergencyRoute: false
        });

        setHospitalNotification({
          type: 'pending',
          message: `⏳ Esperando confirmación de ${hospital.nombre}...`
        });
      } else if (emergencyMode === 'atender_emergencia') {
        setHospitalNotification({
          type: 'info',
          message: `📍 Ruta a emergencia calculada. Navegue al punto marcado.`
        });
        setIsNavigating(true);
        setAmbulanceStatus('en_ruta');
      }

      onEmergencyDrawerClose();
      
      showToast('success', 
        emergencyMode === 'atender_emergencia' ? 'Ruta Calculada' : 'Emergencia Reportada', 
        emergencyMode === 'atender_emergencia' ? 'Navegue al punto de emergencia marcado' : 'Hospital notificado - esperando confirmación'
      );

      resetEmergencyForm();

    } catch (error) {
      console.error('❌ Error iniciando emergencia:', error);
      showToast('error', 'Error del Sistema', 'No se pudo procesar la emergencia');
    }
  };

  // ========== RECALCULAR RUTA MANUALMENTE ==========
  const recomputeRoute = () => {
    if (!destination) {
      showToast('warning', 'Sin Destino', 'No hay una ruta activa para recalcular');
      return;
    }
    if (!pos) {
      showToast('warning', 'Ubicación No Disponible', 'Esperando señal GPS');
      return;
    }

    const destLat = destination.lat || destination.latitude;
    const destLng = destination.lng || destination.longitude;
    if (!destLat || !destLng) {
      showToast('error', 'Destino Inválido', 'El destino no tiene coordenadas válidas');
      return;
    }

    calculateRoute(pos, { lat: destLat, lng: destLng })
      .then(routeData => {
        if (!routeData) return;
        if (destination.id) {
          const routeToClear = activeRoutes.find(r => r.hospitalId === destination.id || r.routeKey.includes(destination.id));
          if (routeToClear) clearSpecificRoute(routeToClear.routeKey);
        } else {
          clearAllRoutes();
        }
        const newRouteId = `route-recomputed-${Date.now()}`;
        drawRoute(routeData.geometry, newRouteId, 0);
        setActiveRoutes(prev => [...prev, {
          routeKey: newRouteId,
          ambulanceId: AMBULANCE_ID,
          geometry: routeData.geometry,
          distance: (routeData.distance / 1000).toFixed(1),
          duration: Math.round(routeData.duration / 60),
          isEmergencyRoute: !!assignedEmergency
        }]);
        setCurrentManeuver(routeData.steps[0] || null);
        setRouteProgress({
          distanceRemaining: routeData.distance,
          durationRemaining: routeData.duration
        });
        showToast('success', 'Ruta Recalculada', 'Nueva ruta con tráfico en tiempo real');
      })
      .catch(err => {
        console.error('Error recalculando ruta:', err);
        showToast('error', 'Error', 'No se pudo recalcular la ruta');
      });
  };

  // ========== CANCELAR NAVEGACIÓN (LIMPIA TODO) ==========
  const cancelNavigation = () => {
    // Eliminar marcador de emergencia asignada
    if (assignedEmergencyMarker.current) {
      assignedEmergencyMarker.current.remove();
      assignedEmergencyMarker.current = null;
    }
    setAssignedEmergency(null);

    // Eliminar marcador de emergencia manual
    removeEmergencyMarker();

    // Limpiar rutas y estado de navegación
    clearAllRoutes();

    // Enviar cancelación al servidor
    if (destination) {
      safeSend({
        type: 'cancel_navigation',
        ambulanceId: AMBULANCE_ID,
        hospitalId: destination.id,
        isEmergencyRoute: pendingEmergencyRoute?.isEmergencyRoute || false
      });
    }

    if (emergencyMarker.current) {
      safeSend({
        type: 'cancel_emergency_marker',
        ambulanceId: AMBULANCE_ID
      });
    }

    setIsNavigating(false);
    setDestination(null);
    setAmbulanceStatus('disponible');
    setHospitalNotification(null);
    setPendingEmergencyRoute(null);

    showToast('info', 'Navegación Cancelada', 'Rutas y marcadores eliminados');
  };

  const cancelSpecificRoute = (routeKey) => {
    const route = activeRoutes.find(r => r.routeKey === routeKey);
    safeSend({
      type: 'cancel_navigation',
      ambulanceId: AMBULANCE_ID,
      routeKey: routeKey,
      isEmergencyRoute: route?.isEmergencyRoute || false
    });
    clearSpecificRoute(routeKey);
    // Si no hay rutas, limpiar también marcadores si es una ruta de emergencia
    if (route?.isEmergencyRoute) {
      if (assignedEmergencyMarker.current) {
        assignedEmergencyMarker.current.remove();
        assignedEmergencyMarker.current = null;
      }
      setAssignedEmergency(null);
      setAmbulanceStatus('disponible');
      setIsNavigating(false);
      setDestination(null);
    }
    showToast('info', 'Ruta Cancelada', 'Ruta específica eliminada');
  };

  // ========== EFFECTS ==========
  useEffect(() => {
    isMounted.current = true;

    if (!mapContainer.current) return;

const mapStyle = colorMode === 'light' 
  ? 'mapbox://styles/mapbox/streets-v12'
  : 'mapbox://styles/mapbox/streets-v12';

    const mapInstance = new mapboxgl.Map({
      container: mapContainer.current,
      style: mapStyle,
      center: [-101.1969, 19.7024],
      zoom: mapZoom,
      pitch: mapPitch,
      bearing: 0,
      antialias: true,
      attributionControl: false
    });

    mapInstance.addControl(new mapboxgl.NavigationControl({ visualizePitch: true, showZoom: true, showCompass: true }), 'top-right');
    
    const geolocateControl = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserLocation: false,
      showAccuracyCircle: false
    });
    mapInstance.addControl(geolocateControl, 'top-right');

    mapInstance.addControl(new mapboxgl.ScaleControl({
      maxWidth: isMobile ? 80 : 100,
      unit: 'metric'
    }), 'bottom-left');

    mapInstance.on('load', () => {
      console.log('🗺️ Mapa GPS cargado correctamente');
      map.current = mapInstance;
      addTrafficLayer();
      startPreciseLocationTracking();
      connectWebSocket();
    });

    mapInstance.on('zoom', () => {
      setMapZoom(mapInstance.getZoom());
    });

    mapInstance.on('pitch', () => {
      setMapPitch(mapInstance.getPitch());
    });

    return () => {
      isMounted.current = false;
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (ws.current) {
        try {
          ws.current.close(1000, 'Componente desmontado');
        } catch (e) {}
      }
      cleanupMarkers();
      try { mapInstance.remove(); } catch (e) {}
    };
  }, [colorMode]);

  useEffect(() => {
    if (pos && hospitals.length > 0) {
      const updatedHospitals = hospitals.map(hospital => {
        if (hospital.lat && hospital.lng) {
          const distance = calculateDistance(
            pos.lat, pos.lng,
            hospital.lat, hospital.lng
          );
          const estimatedTime = Math.round(distance * 2);
          return { ...hospital, distance, estimatedTime };
        }
        return hospital;
      }).sort((a, b) => {
        if (a.distance === null && b.distance === null) return 0;
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
      });
      setHospitals(updatedHospitals);
    }
  }, [pos]);

  // ========== BOTÓN TURN-BY-TURN ==========
  const TurnByTurnBar = () => {
    if (!currentManeuver) return null;
    const distanceKm = currentManeuver.distance / 1000;
    const distanceText = distanceKm < 1 
      ? `${Math.round(currentManeuver.distance)} m` 
      : `${distanceKm.toFixed(1)} km`;
    const maneuverIcon = {
      'turn left': '↰',
      'turn right': '↱',
      'sharp left': '↶',
      'sharp right': '↷',
      'slight left': '↖',
      'slight right': '↗',
      'straight': '↑',
      'uturn': '↺',
      'roundabout': '⟲',
      'merge': '⇗',
      'fork': '⇉',
      'ramp': '⇪'
    }[currentManeuver.maneuver] || '→';

    return (
      <Box className="turn-by-turn-bar" onClick={() => {}}>
        <Text fontSize="2xl" lineHeight="1">{maneuverIcon}</Text>
        <Text fontSize="sm" fontWeight="bold" noOfLines={1}>
          {currentManeuver.instruction}
        </Text>
        <Text fontSize="sm" color="gray.300">
          en {distanceText}
        </Text>
        {routeProgress && (
          <Text fontSize="sm" color="gray.400" ml="auto">
            {Math.round(routeProgress.durationRemaining / 60)} min
          </Text>
        )}
      </Box>
    );
  };

  // ========== UTILIDADES ==========
  const safeSend = (message) => {
    try {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify(message));
      }
    } catch (error) {
      console.error('❌ Error enviando mensaje:', error);
    }
  };

  const sendLocationUpdate = (location, speed, heading) => {
    safeSend({
      type: 'location_update',
      ambulanceId: AMBULANCE_ID,
      location: location,
      speed: speed,
      heading: heading,
      status: ambulanceStatus,
      accuracy: accuracy,
      timestamp: new Date().toISOString()
    });
  };

  const showToast = (status, title, description) => {
    toast({
      title,
      description,
      status,
      duration: 4000,
      isClosable: true,
      position: isMobile ? 'top' : 'top-right'
    });
  };

  const refreshHospitals = () => {
    safeSend({ type: 'request_hospitals_list' });
    showToast('info', 'Actualizando', 'Buscando hospitales disponibles...');
  };

  const reconnect = () => {
    if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    connectionAttempts.current = 0;
    connectWebSocket();
  };

  const cleanupMarkers = () => {
    hospitalMarkers.current.forEach(marker => marker.remove());
    hospitalMarkers.current = [];
    if (ambulanceMarker.current) {
      ambulanceMarker.current.remove();
      ambulanceMarker.current = null;
    }
    removeEmergencyMarker();
    if (assignedEmergencyMarker.current) {
      assignedEmergencyMarker.current.remove();
      assignedEmergencyMarker.current = null;
    }
  };

  const resetEmergencyForm = () => {
    setEmergencyStep('mode');
    setEmergencyMode('');
    setIncludePatientInfo(false);
    setAge('');
    setSex('');
    setEmergencyType('');
    setPatientCondition('');
    setVitalSigns({
      heartRate: '',
      bloodPressure: '',
      oxygenSaturation: '',
      respiratoryRate: ''
    });
    setSelectedHospital('');
    setSearchQuery('');
    setSearchResults([]);
  };

  const centerOnMyLocation = () => {
    if (pos) {
      setIsMapFollowing(true);
      map.current.flyTo({
        center: [pos.lng, pos.lat],
        zoom: mapZoom,
        bearing: heading,
        pitch: mapPitch,
        duration: 1000
      });
    } else {
      showToast('warning', 'Ubicación No Disponible', 'Esperando señal GPS...');
    }
  };

  const toggleFollowMode = () => {
    setIsMapFollowing(!isMapFollowing);
    if (!isMapFollowing && pos) {
      map.current.easeTo({
        center: [pos.lng, pos.lat],
        bearing: heading,
        pitch: mapPitch,
        zoom: mapZoom,
        duration: 1000,
        essential: true
      });
      showToast('info', 'Seguimiento Activo', 'El mapa seguirá tu ubicación automáticamente');
    } else {
      showToast('info', 'Seguimiento Desactivado', 'Puedes mover el mapa libremente');
    }
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const toggleFullscreenMap = () => {
    setIsFullscreenMap(!isFullscreenMap);
    setTimeout(() => {
      if (map.current) map.current.resize();
    }, 100);
  };

  // ========== SIDEBAR ==========
  const Sidebar = () => {
    if (isMobile && !isSidebarOpen) return null;

    return (
      <Box
        ref={sidebarRef}
        width={sidebarWidth}
        bg={sidebarBg}
        p={isMobile ? 3 : 4}
        overflowY="auto"
        boxShadow="md"
        borderRight={isMobile ? "none" : `1px solid ${borderColor}`}
        position={isMobile ? "absolute" : "relative"}
        zIndex={isMobile ? "1000" : "auto"}
        left={isMobile && !isSidebarOpen ? "-100%" : "0"}
        transition="left 0.3s ease"
        height="100%"
        sx={{
          '&::-webkit-scrollbar': { width: '6px' },
          '&::-webkit-scrollbar-track': { width: '6px' },
          '&::-webkit-scrollbar-thumb': { background: borderColor, borderRadius: '24px' }
        }}
        pb={isMobile ? `calc(env(safe-area-inset-bottom) + 16px)` : 0}
      >
        <VStack spacing={isMobile ? 3 : 4} align="stretch">
          <Button 
            colorScheme="red" 
            size={isMobile ? "md" : "lg"} 
            onClick={onEmergencyDrawerOpen}
            leftIcon={<FaExclamationTriangle />}
            isDisabled={!wsConnected}
            height={isMobile ? "50px" : "60px"}
            fontSize={isMobile ? "sm" : "lg"}
            fontWeight="bold"
            bg="linear-gradient(135deg, #FF4444, #CC0000)"
            _hover={{ bg: 'linear-gradient(135deg, #CC0000, #990000)' }}
          >
            <FaExclamationTriangle style={{ marginRight: '8px' }} /> 
            SERVICIO DE EMERGENCIA
          </Button>

          {selectedLocation && (
            <Button 
              colorScheme="orange" 
              size={isMobile ? "sm" : "md"}
              onClick={goToEmergencyLocation}
              leftIcon={<FaMapMarkerAlt />}
              variant="outline"
            >
              IR AL PUNTO DE EMERGENCIA
            </Button>
          )}

          {assignedEmergency && (
            <Button 
              colorScheme="red" 
              size={isMobile ? "sm" : "md"}
              onClick={() => {
                if (assignedEmergencyMarker.current) {
                  assignedEmergencyMarker.current.remove();
                  assignedEmergencyMarker.current = null;
                }
                setAssignedEmergency(null);
                setAmbulanceStatus('disponible');
                setIsNavigating(false);
                setDestination(null);
                clearAllRoutes();
                showToast('success', 'Emergencia Completada', 'Marcador eliminado');
                // Notificar al servidor que la emergencia ha sido completada
                safeSend({
                  type: 'emergency_completed',
                  ambulanceId: AMBULANCE_ID,
                  callId: assignedEmergency?.callId
                });
              }}
              leftIcon={<FaCheck />}
              variant="solid"
            >
              COMPLETAR EMERGENCIA
            </Button>
          )}

          {emergencyMarker.current && (
            <Button 
              colorScheme="red" 
              size={isMobile ? "sm" : "md"}
              onClick={() => {
                safeSend({ type: 'cancel_emergency_marker', ambulanceId: AMBULANCE_ID });
              }}
              leftIcon={<FaTimes />}
              variant="outline"
            >
              ELIMINAR MARCADOR
            </Button>
          )}

          <Card bg={wsConnected ? "green.50" : isConnecting ? "yellow.50" : "red.50"} 
            border="1px" borderColor={wsConnected ? "green.200" : isConnecting ? "yellow.200" : "red.200"}>
            <CardBody p={isMobile ? 2 : 3}>
              <HStack justify="space-between">
                <HStack>
                  <Box className={wsConnected ? "status-dot-green" : isConnecting ? "status-dot-yellow" : "status-dot-red"} />
                  <Text fontSize={isMobile ? "xs" : "sm"} fontWeight="medium" color={wsConnected ? "green.800" : isConnecting ? "yellow.800" : "red.800"}>
                    {wsConnected ? 'Conectado al Sistema' : isConnecting ? 'Conectando...' : 'Desconectado'}
                  </Text>
                </HStack>
                {!wsConnected && (
                  <Button size="sm" onClick={reconnect} colorScheme="orange" isDisabled={isConnecting}>
                    {isConnecting ? <Spinner size="sm" /> : <FaSync />}
                  </Button>
                )}
              </HStack>
            </CardBody>
          </Card>

          {activeRoutes.length > 0 && (
            <Card bg="blue.50" border="1px" borderColor="blue.200">
              <CardBody p={isMobile ? 2 : 3}>
                <Text fontWeight="bold" mb={2} color="blue.800" fontSize={isMobile ? "sm" : "md"}>
                  <FaRoute style={{ display: 'inline', marginRight: '8px' }} /> RUTAS ACTIVAS ({activeRoutes.length})
                </Text>
                <VStack spacing={2} align="stretch" maxH={isMobile ? "150px" : "200px"} overflowY="auto">
                  {activeRoutes.map((route, index) => (
                    <Box
                      key={route.routeKey}
                      p={isMobile ? 2 : 2}
                      bg={index === 0 ? "blue.100" : "blue.50"}
                      borderRadius="md"
                      border="1px"
                      borderColor="blue.200"
                    >
                      <VStack align="start" spacing={1}>
                        <Text fontSize={isMobile ? "xs" : "sm"} fontWeight="medium">
                          {route.isEmergencyRoute ? '🚨 A EMERGENCIA' : '🏥 A HOSPITAL'}
                        </Text>
                        <Text fontSize="2xs" color="blue.700">
                          {route.distance} km • {route.duration} min
                        </Text>
                      </VStack>
                      <Button 
                        size="xs" 
                        mt={2} 
                        colorScheme="red" 
                        onClick={() => cancelSpecificRoute(route.routeKey)}
                        width="100%"
                        leftIcon={<FaTimesCircle />}
                      >
                        Cancelar
                      </Button>
                    </Box>
                  ))}
                </VStack>
                {activeRoutes.length > 1 && (
                  <Button 
                    size="sm" 
                    mt={3} 
                    colorScheme="red" 
                    onClick={clearAllRoutes}
                    width="100%"
                    variant="outline"
                    leftIcon={<FaTimes />}
                  >
                    Cancelar todas
                  </Button>
                )}
              </CardBody>
            </Card>
          )}

          {pendingEmergencyRoute && !pendingEmergencyRoute.isEmergencyRoute && (
            <Card bg="orange.50" border="1px" borderColor="orange.200">
              <CardBody p={isMobile ? 2 : 3}>
                <Text fontWeight="bold" mb={2} color="orange.800" fontSize={isMobile ? "sm" : "md"}>
                  <FaHourglassHalf style={{ display: 'inline', marginRight: '8px' }} /> ESPERANDO CONFIRMACIÓN
                </Text>
                <Text fontSize={isMobile ? "xs" : "sm"} color="orange.700">
                  Ruta calculada - Esperando que el hospital acepte al paciente
                </Text>
              </CardBody>
            </Card>
          )}

          {/* HOSPITALES ACTIVOS */}
          <Card border="1px" borderColor="green.200" bg="rgba(240, 255, 240, 0.7)">
            <CardBody p={isMobile ? 2 : 3}>
              <HStack justify="space-between" mb={2}>
                <Text fontSize={isMobile ? "sm" : "sm"} fontWeight="bold" color="green.700">
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#4CAF50', marginRight: 8, boxShadow: '0 0 8px #4CAF50', animation: 'pulseGreen 2s infinite' }} />
                  HOSPITALES ACTIVOS ({hospitals.filter(h => h.connected && h.activo).length})
                </Text>
                <Button size="xs" onClick={refreshHospitals} variant="ghost" leftIcon={<FaSync />} colorScheme="green">
                  Sinc.
                </Button>
              </HStack>
              
              <VStack spacing={2} align="stretch" maxH={isMobile ? "180px" : "220px"} overflowY="auto">
                {hospitals.filter(h => h.activo && h.connected).length === 0 ? (
                  <Text fontSize="2xs" color="gray.500" textAlign="center" py={1}>
                    No hay hospitales conectados
                  </Text>
                ) : (
                  hospitals
                    .filter(h => h.activo && h.connected)
                    .sort((a, b) => (a.distance || 999) - (b.distance || 999))
                    .slice(0, isMobile ? 4 : 6)
                    .map((hospital, index) => (
                      <HStack 
                        key={hospital.id}
                        p={2}
                        bg="white"
                        borderRadius="md"
                        border="1px"
                        borderColor="green.200"
                        boxShadow="0 2px 8px rgba(76,175,80,0.12)"
                        _hover={{ borderColor: 'green.400', transform: 'translateX(2px)' }}
                        transition="all 0.2s ease"
                        cursor="pointer"
                        onClick={() => {
                          setSelectedHospital(hospital.id);
                          if (hospital.lat && hospital.lng && map.current) {
                            map.current.flyTo({ center: [hospital.lng, hospital.lat], zoom: 16, duration: 800 });
                          }
                        }}
                      >
                        <Box
                          w="8px" h="8px" borderRadius="full" bg="#4CAF50"
                          boxShadow="0 0 6px #4CAF50"
                          animation="pulseGreen 2s infinite"
                        />
                        <VStack align="start" spacing={0} flex={1} ml={1}>
                          <Text fontSize="xs" fontWeight="semibold" color="green.800" noOfLines={1}>
                            {hospital.nombre}
                          </Text>
                          <HStack spacing={2}>
                            {hospital.distance && (
                              <Text fontSize="2xs" color="gray.500">
                                📏 {hospital.distance.toFixed(1)} km
                              </Text>
                            )}
                            {hospital.estimatedTime && (
                              <Text fontSize="2xs" color="blue.600" fontWeight="medium">
                                🕐 ~{hospital.estimatedTime} min
                              </Text>
                            )}
                          </HStack>
                        </VStack>
                        <Badge colorScheme="green" fontSize="2xs" variant="subtle">
                          EN LÍNEA
                        </Badge>
                      </HStack>
                    ))
                )}
              </VStack>
            </CardBody>
          </Card>

          {/* TODOS LOS HOSPITALES */}
          <Card>
            <CardBody p={isMobile ? 2 : 3}>
              <Accordion allowToggle>
                <AccordionItem border="none">
                  <AccordionButton px={0}>
                    <Box flex="1" textAlign="left">
                      <Text fontSize={isMobile ? "xs" : "sm"} fontWeight="bold" color="gray.600">
                        <FaHospital style={{ display: 'inline', marginRight: 6 }} />
                        TODOS LOS HOSPITALES ({hospitals.filter(h => h.activo).length})
                      </Text>
                    </Box>
                    <AccordionIcon />
                  </AccordionButton>
                  <AccordionPanel pb={2} px={0}>
                    <HStack mb={2}>
                      <Button size="xs" onClick={refreshHospitals} variant="ghost" leftIcon={<FaSync />} fontSize="2xs">
                        Actualizar
                      </Button>
                    </HStack>
                    <VStack spacing={1} align="stretch" maxH={isMobile ? "160px" : "200px"} overflowY="auto">
                      {hospitals
                        .filter(h => h.activo)
                        .slice(0, isMobile ? 6 : 10)
                        .map((hospital) => (
                          <HStack 
                            key={hospital.id}
                            p={1.5}
                            borderRadius="md"
                            border="1px"
                            borderColor={hospital.connected ? "green.200" : "gray.200"}
                            bg={hospital.connected ? "rgba(76,175,80,0.05)" : "transparent"}
                          >
                            <Box
                              w="6px" h="6px" borderRadius="full"
                              bg={hospital.connected ? "#4CAF50" : "#FF9800"}
                              boxShadow={hospital.connected ? '0 0 4px #4CAF50' : 'none'}
                            />
                            <VStack align="start" spacing={0} flex={1}>
                              <Text fontSize="2xs" fontWeight="medium" noOfLines={1}>
                                {hospital.nombre}
                              </Text>
                              {hospital.distance && (
                                <Text fontSize="2xs" color="gray.400">
                                  {hospital.distance.toFixed(1)} km
                                </Text>
                              )}
                            </VStack>
                            <Badge 
                              fontSize="2xs"
                              colorScheme={hospital.connected ? "green" : "gray"}
                            >
                              {hospital.connected ? 'ACTIVO' : 'INACTIVO'}
                            </Badge>
                          </HStack>
                        ))}
                    </VStack>
                  </AccordionPanel>
                </AccordionItem>
              </Accordion>
            </CardBody>
          </Card>

          <VStack spacing={2}>
            <Button 
              width="100%" 
              colorScheme="blue" 
              onClick={centerOnMyLocation}
              leftIcon={<FaLocationArrow />}
              variant="outline"
              size={isMobile ? "sm" : "md"}
            >
              CENTRAR EN MI POSICIÓN
            </Button>
            
            <Button 
              width="100%" 
              colorScheme="teal" 
              onClick={onHospitalDrawerOpen}
              leftIcon={<FaHospital />}
              variant="outline"
              size={isMobile ? "sm" : "md"}
            >
              VER TODOS LOS HOSPITALES
            </Button>
            
            <Button 
              width="100%" 
              colorScheme="purple" 
              onClick={toggleFollowMode}
              leftIcon={<FaCar />}
              variant={isMapFollowing ? "solid" : "ghost"}
              isDisabled={!pos}
              size={isMobile ? "sm" : "md"}
            >
              {isMapFollowing ? 'SEGUIMIENTO ACTIVO' : 'MODO SEGUIMIENTO'}
            </Button>
            
            {destination && (
              <Button 
                width="100%" 
                colorScheme="orange" 
                onClick={recomputeRoute}
                leftIcon={<FaSync />}
                variant="solid"
                size={isMobile ? "sm" : "md"}
                isDisabled={!pos || !destination}
              >
                🔄 RECALCULAR RUTA (TRÁFICO)
              </Button>
            )}
            
            {activeRoutes.length > 0 && (
              <Button 
                width="100%" 
                colorScheme="red" 
                onClick={cancelNavigation}
                leftIcon={<FaTimes />}
                variant="outline"
                size={isMobile ? "sm" : "md"}
              >
                CANCELAR TODAS LAS RUTAS
              </Button>
            )}
          </VStack>
        </VStack>
      </Box>
    );
  };

  // ========== HEADER ==========
  const Header = () => (
    <Box 
      bg={headerBg} 
      p={headerPadding} 
      boxShadow="sm" 
      borderBottom="1px" 
      borderColor={borderColor}
      pt={`calc(env(safe-area-inset-top) + 8px)`}
    >
      <HStack justifyContent="space-between" alignItems="center" flexWrap="wrap" spacing={2}>
        <HStack spacing={isMobile ? 2 : 3}>
          <IconButton
            aria-label="Menu"
            icon={<HamburgerIcon />}
            variant="ghost"
            size="sm"
            onClick={toggleSidebar}
            display={isMobile ? "flex" : "none"}
          />
          <VStack align="start" spacing={0}>
            <HStack>
              <FaAmbulance style={{ fontSize: isMobile ? '16px' : '20px' }} />
              <Text fontSize={fontSizeTitle} fontWeight="bold" color={textColor}>
                {AMBULANCE_NOMBRE}
              </Text>
              <Badge ml={2} colorScheme={
                ambulanceStatus === 'en_ruta' ? "red" : 
                ambulanceStatus === 'ocupado' ? "orange" :
                ambulanceStatus === 'disponible' ? "green" : "yellow"
              } fontSize={badgeSize}>
                {ambulanceStatus.toUpperCase()}
              </Badge>
              {assignedEmergency && (
                <Badge ml={1} colorScheme="red" fontSize={badgeSize}>
                  🚨 EMERGENCIA
                </Badge>
              )}
            </HStack>
            <Text fontSize="2xs" color={textColor}>
              Placa: {AMBULANCE_PLACA} • {isNavigating ? 'NAVEGACIÓN ACTIVA' : 'DISPONIBLE'}
            </Text>
          </VStack>
        </HStack>

        <HStack spacing={isMobile ? 1 : 3}>
          <Tooltip label="Velocidad">
            <Stat size="sm" minWidth={isMobile ? "60px" : "80px"}>
              <StatLabel fontSize="2xs">VELOCIDAD</StatLabel>
              <StatNumber fontSize={fontSizeStats} color={
                speed > 80 ? "red.500" : 
                speed > 40 ? "orange.500" : 
                "green.500"
              }>
                <FaTachometerAlt style={{ display: 'inline', marginRight: '2px', fontSize: isMobile ? '10px' : '12px' }} /> 
                {speed} km/h
              </StatNumber>
            </Stat>
          </Tooltip>
          
          <Tooltip label="Dirección">
            <Stat size="sm" minWidth={isMobile ? "60px" : "80px"}>
              <StatLabel fontSize="2xs">DIRECCIÓN</StatLabel>
              <StatNumber fontSize={fontSizeStats} color="blue.500">
                <FaCompass style={{ display: 'inline', marginRight: '2px', fontSize: isMobile ? '10px' : '12px' }} /> 
                {Math.round(heading)}°
              </StatNumber>
            </Stat>
          </Tooltip>
          
          <Tooltip label={`${hospitals.filter(h => h.connected && h.activo).length} hospitales en línea de ${hospitals.filter(h => h.activo).length} totales`}>
            <Box
              bg={hospitals.filter(h => h.connected && h.activo).length > 0 ? "green.500" : "gray.400"}
              color="white"
              fontSize={badgeSize}
              px={isMobile ? 2 : 3}
              py={1}
              borderRadius="full"
              display="flex"
              alignItems="center"
              gap={1.5}
              boxShadow={hospitals.filter(h => h.connected && h.activo).length > 0 ? "0 0 12px rgba(76,175,80,0.4)" : "none"}
            >
              <Box
                w="6px" h="6px" borderRadius="full" bg="white"
                animation={hospitals.filter(h => h.connected && h.activo).length > 0 ? "pulseGreen 2s infinite" : "none"}
              />
              {hospitals.filter(h => h.connected && h.activo).length}
              <Text as="span" fontWeight="normal" opacity={0.7}>/ {hospitals.filter(h => h.activo).length}</Text>
            </Box>
          </Tooltip>
          
          <Button 
            size="sm" 
            colorScheme={trafficEnabled ? "orange" : "blue"}
            onClick={toggleTraffic}
            variant={trafficEnabled ? "solid" : "outline"}
            leftIcon={trafficEnabled ? <FaTimes /> : <FaRoad />}
            display={isMobile ? "none" : "flex"}
          >
            TRÁFICO
          </Button>
          
          <Tooltip label="Pantalla completa">
            <IconButton
              aria-label="Fullscreen map"
              icon={isFullscreenMap ? <FaCompressArrowsAlt /> : <FaExpandArrowsAlt />}
              onClick={toggleFullscreenMap}
              variant="ghost"
              size="sm"
            />
          </Tooltip>
          
          <ColorModeToggle />
        </HStack>
      </HStack>
    </Box>
  );

  const FloatingMenuButton = () => {
    if (!isMobile || isSidebarOpen) return null;
    return (
      <IconButton
        aria-label="Abrir menú"
        icon={<HamburgerIcon />}
        position="absolute"
        bottom="20px"
        left="20px"
        zIndex="1000"
        colorScheme="blue"
        size="lg"
        borderRadius="full"
        boxShadow="lg"
        onClick={toggleSidebar}
      />
    );
  };

  // ========== MODAL DE NOTIFICACIÓN DE EMERGENCIA ASIGNADA ==========
  const EmergencyAssignmentModal = () => {
    if (!assignedEmergency) return null;
    return (
      <Modal isOpen={isEmergencyModalOpen} onClose={onEmergencyModalClose} size="lg" isCentered closeOnOverlayClick={false}>
        <ModalOverlay backdropFilter="blur(4px)" bg="rgba(0,0,0,0.7)" />
        <ModalContent borderRadius="xl" border="3px solid #D50000">
          <ModalHeader bg="red.600" color="white" borderTopRadius="xl" display="flex" alignItems="center" gap={3}>
            <FaExclamationTriangle size={24} />
            🚨 EMERGENCIA ASIGNADA
          </ModalHeader>
          <ModalBody py={6}>
            <VStack spacing={4} align="stretch">
              <Alert status="error" borderRadius="md">
                <AlertIcon />
                <Box>
                  <AlertTitle fontSize="lg">¡Nueva emergencia asignada a su unidad!</AlertTitle>
                  <AlertDescription>
                    <Text fontWeight="bold">Folio: {assignedEmergency.callId}</Text>
                  </AlertDescription>
                </Box>
              </Alert>
              
              <SimpleGrid columns={isMobile ? 1 : 2} spacing={4}>
                <Card>
                  <CardBody>
                    <Text fontSize="sm" color="gray.500">Tipo de emergencia</Text>
                    <Text fontWeight="bold">{assignedEmergency.emergencyType}</Text>
                  </CardBody>
                </Card>
                <Card>
                  <CardBody>
                    <Text fontSize="sm" color="gray.500">Asignada a las</Text>
                    <Text fontWeight="bold">{new Date(assignedEmergency.assignedAt).toLocaleTimeString()}</Text>
                  </CardBody>
                </Card>
              </SimpleGrid>
              
              <Card>
                <CardBody>
                  <Text fontSize="sm" color="gray.500">Ubicación</Text>
                  <Text fontWeight="medium">{assignedEmergency.address || 'No disponible'}</Text>
                  <Text fontSize="xs" color="gray.400" mt={1}>
                    Lat: {assignedEmergency.location.lat.toFixed(6)}, Lng: {assignedEmergency.location.lng.toFixed(6)}
                  </Text>
                </CardBody>
              </Card>
              
              {assignedEmergency.patientInfo && Object.keys(assignedEmergency.patientInfo).length > 0 && (
                <Card>
                  <CardBody>
                    <Text fontSize="sm" color="gray.500">Información del paciente</Text>
                    <SimpleGrid columns={2} spacing={2} mt={2}>
                      {assignedEmergency.patientInfo.age && (
                        <Box><Text fontSize="xs" color="gray.500">Edad</Text><Text fontSize="sm">{assignedEmergency.patientInfo.age}</Text></Box>
                      )}
                      {assignedEmergency.patientInfo.sex && (
                        <Box><Text fontSize="xs" color="gray.500">Sexo</Text><Text fontSize="sm">{assignedEmergency.patientInfo.sex}</Text></Box>
                      )}
                      {assignedEmergency.patientInfo.condition && (
                        <Box><Text fontSize="xs" color="gray.500">Condición</Text><Text fontSize="sm">{assignedEmergency.patientInfo.condition}</Text></Box>
                      )}
                    </SimpleGrid>
                  </CardBody>
                </Card>
              )}
              
              {assignedEmergency.notes && (
                <Card>
                  <CardBody>
                    <Text fontSize="sm" color="gray.500">Notas adicionales</Text>
                    <Text fontSize="sm">{assignedEmergency.notes}</Text>
                  </CardBody>
                </Card>
              )}
            </VStack>
          </ModalBody>

          <ModalFooter gap={3} flexWrap="wrap">
            <Button 
              colorScheme="green" 
              size="lg" 
              flex={1}
              leftIcon={<FaCheck />}
              onClick={() => {
                onEmergencyModalClose();
                // El conductor acepta la emergencia, ya se tiene la ruta calculada.
                showToast('success', 'Emergencia Aceptada', 'Dirigiéndose al punto de emergencia');
              }}
            >
              ACEPTAR Y NAVEGAR
            </Button>
            <Button 
              colorScheme="red" 
              size="lg" 
              flex={1}
              leftIcon={<FaTimes />}
              variant="outline"
              onClick={() => {
                onEmergencyModalClose();
                // Si el conductor rechaza, se cancela la asignación
                safeSend({
                  type: 'cancel_emergency_marker',
                  ambulanceId: AMBULANCE_ID
                });
                if (assignedEmergencyMarker.current) {
                  assignedEmergencyMarker.current.remove();
                  assignedEmergencyMarker.current = null;
                }
                setAssignedEmergency(null);
                setAmbulanceStatus('disponible');
                setIsNavigating(false);
                setDestination(null);
                clearAllRoutes();
                showToast('warning', 'Emergencia Rechazada', 'La unidad no puede atender esta emergencia');
              }}
            >
              RECHAZAR
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    );
  };

  // ========== RENDER PRINCIPAL ==========
  return (
    <ChakraProvider theme={theme}>
      <Box 
        height="100vh" 
        display="flex" 
        flexDirection="column" 
        bg={bgColor}
        position="relative"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <Header />

        <Box 
          flex={1} 
          display="flex" 
          position="relative"
          overflow="hidden"
        >
          <Sidebar />

          <Box 
            flex={1} 
            position="relative"
            transition="all 0.3s ease"
          >
            <div 
              ref={mapContainer} 
              style={{ 
                width: '100%', 
                height: '100%',
                position: 'relative'
              }} 
            />
            
            <TurnByTurnBar />
            
            {hospitalNotification && (
              <Box
                position="absolute"
                top={isMobile ? "50px" : "70px"}
                right={isMobile ? "10px" : "20px"}
                left={isMobile ? "10px" : "auto"}
                bg={hospitalNotification.type === 'accepted' ? "green.500" : 
                    hospitalNotification.type === 'rejected' ? "red.500" : 
                    hospitalNotification.type === 'pending' ? "orange.500" : "blue.500"}
                color="white"
                p={isMobile ? 3 : 4}
                borderRadius="md"
                boxShadow="xl"
                maxWidth={isMobile ? "calc(100% - 20px)" : "400px"}
                zIndex="1000"
              >
                <Alert status={hospitalNotification.type === 'accepted' ? 'success' : 
                              hospitalNotification.type === 'rejected' ? 'error' : 
                              hospitalNotification.type === 'pending' ? 'warning' : 'info'}>
                  <AlertIcon />
                  <Box>
                    <AlertTitle fontSize={isMobile ? "sm" : "md"}>
                      {hospitalNotification.type === 'accepted' ? 'Paciente Aceptado' :
                       hospitalNotification.type === 'rejected' ? 'Paciente Rechazado' : 
                       hospitalNotification.type === 'pending' ? 'Esperando Confirmación' : 'Notificación'}
                    </AlertTitle>
                    <AlertDescription fontSize={isMobile ? "xs" : "sm"}>
                      {hospitalNotification.message}
                    </AlertDescription>
                  </Box>
                </Alert>
              </Box>
            )}

            {assignedEmergency && (
              <Box
                position="absolute"
                top={isMobile ? "100px" : "80px"}
                left="50%"
                transform="translateX(-50%)"
                bg="rgba(213,0,0,0.9)"
                color="white"
                px={4}
                py={2}
                borderRadius="lg"
                boxShadow="0 0 30px rgba(255,0,0,0.6)"
                zIndex="1000"
                border="2px solid #FFD600"
                fontSize={isMobile ? "sm" : "md"}
                fontWeight="bold"
                textAlign="center"
                maxWidth="90%"
                cursor="pointer"
                onClick={() => onEmergencyModalOpen()}
              >
                🚨 EMERGENCIA ASIGNADA - Folio: {assignedEmergency.callId}
                <br />
                <span style={{ fontSize: '0.8em', fontWeight: 'normal' }}>
                  {assignedEmergency.address || 'Ubicación desconocida'}
                </span>
                <br />
                <Button size="xs" colorScheme="whiteAlpha" mt={1} onClick={(e) => { e.stopPropagation(); onEmergencyModalOpen(); }}>
                  Ver detalles
                </Button>
              </Box>
            )}
          </Box>

          <FloatingMenuButton />

          {isMapFollowing && pos && (
            <Box
              position="absolute"
              bottom={isMobile ? "20px" : "30px"}
              right={isMobile ? "20px" : "30px"}
              bg="blue.500"
              color="white"
              p={2}
              borderRadius="full"
              boxShadow="lg"
              zIndex="1000"
              cursor="pointer"
              onClick={toggleFollowMode}
              _hover={{ bg: "blue.600" }}
            >
              <FaLocationArrow />
            </Box>
          )}
        </Box>
      </Box>

      {/* ========== DRAWER DE EMERGENCIA ========== */}
      <Drawer
        isOpen={isEmergencyDrawerOpen}
        placement="right"
        onClose={() => {
          onEmergencyDrawerClose();
          resetEmergencyForm();
        }}
        size={isMobile ? "full" : "md"}
      >
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton color="white" />
          <DrawerHeader bg="red.600" color="white">
            <FaExclamationTriangle style={{ display: 'inline', marginRight: '12px' }} /> SERVICIO DE EMERGENCIA
          </DrawerHeader>

          <DrawerBody>
            <VStack spacing={isMobile ? 4 : 6} align="stretch" pt={4}>
              {emergencyStep === 'mode' && (
                <Box>
                  <Text fontSize={isMobile ? "md" : "lg"} fontWeight="bold" mb={4} textAlign="center">
                    ¿Qué tipo de servicio necesita?
                  </Text>
                  <VStack spacing={3}>
                    <Button
                      size="lg"
                      height={isMobile ? "70px" : "80px"}
                      width="100%"
                      colorScheme="orange"
                      onClick={() => {
                        setEmergencyMode('atender_emergencia');
                        setEmergencyStep('location');
                      }}
                      leftIcon={<FaMapMarkerAlt />}
                      justifyContent="flex-start"
                      textAlign="left"
                      px={4}
                    >
                      <VStack align="start" spacing={1}>
                        <Text fontWeight="bold">ATENDER EMERGENCIA</Text>
                        <Text fontSize="sm" opacity={0.8}>Ir a ubicación específica</Text>
                      </VStack>
                    </Button>

                    <Button
                      size="lg"
                      height={isMobile ? "70px" : "80px"}
                      width="100%"
                      colorScheme="blue"
                      onClick={() => {
                        setEmergencyMode('trasladar_paciente');
                        setEmergencyStep('patient');
                      }}
                      leftIcon={<FaHospital />}
                      justifyContent="flex-start"
                      textAlign="left"
                      px={4}
                    >
                      <VStack align="start" spacing={1}>
                        <Text fontWeight="bold">TRASLADAR PACIENTE</Text>
                        <Text fontSize="sm" opacity={0.8}>Llevar a hospital</Text>
                      </VStack>
                    </Button>
                  </VStack>
                </Box>
              )}

              {emergencyStep === 'patient' && (
                <Box>
                  <Text fontSize={isMobile ? "md" : "lg"} fontWeight="bold" mb={4}>
                    Información del Paciente
                  </Text>
                  <Accordion defaultIndex={[0]} allowMultiple>
                    <AccordionItem>
                      <AccordionButton>
                        <Box flex="1" textAlign="left">
                          <Text fontWeight="bold"><FaUserMd style={{ display: 'inline', marginRight: '8px' }} /> Información básica (Opcional)</Text>
                        </Box>
                        <AccordionIcon />
                      </AccordionButton>
                      <AccordionPanel pb={4}>
                        <Checkbox 
                          colorScheme="blue" 
                          isChecked={includePatientInfo}
                          onChange={(e) => setIncludePatientInfo(e.target.checked)}
                          mb={4}
                        >
                          Incluir información del paciente
                        </Checkbox>

                        {includePatientInfo && (
                          <VStack spacing={3}>
                            <SimpleGrid columns={isMobile ? 1 : 2} spacing={3} width="100%">
                              <FormControl>
                                <FormLabel fontSize="sm">Edad</FormLabel>
                                <NumberInput value={age} onChange={(value) => setAge(value)}>
                                  <NumberInputField placeholder="Años" />
                                  <NumberInputStepper>
                                    <NumberIncrementStepper><AddIcon fontSize="10px" /></NumberIncrementStepper>
                                    <NumberDecrementStepper><MinusIcon fontSize="10px" /></NumberDecrementStepper>
                                  </NumberInputStepper>
                                </NumberInput>
                              </FormControl>
                              
                              <FormControl>
                                <FormLabel fontSize="sm">Sexo</FormLabel>
                                <Select
                                  value={sex}
                                  onChange={(e) => setSex(e.target.value)}
                                  placeholder="Seleccionar"
                                >
                                  <option value="M">Masculino</option>
                                  <option value="F">Femenino</option>
                                  <option value="O">Otro</option>
                                </Select>
                              </FormControl>
                            </SimpleGrid>

                            <FormControl>
                              <FormLabel fontSize="sm">Tipo de emergencia</FormLabel>
                              <Input
                                value={emergencyType}
                                onChange={(e) => setEmergencyType(e.target.value)}
                                placeholder="Ej: Traumatismo, Infarto, etc."
                              />
                            </FormControl>

                            <FormControl>
                              <FormLabel fontSize="sm">Condición actual</FormLabel>
                              <Select
                                value={patientCondition}
                                onChange={(e) => setPatientCondition(e.target.value)}
                                placeholder="Seleccionar condición"
                              >
                                <option value="estable">Estable</option>
                                <option value="grave">Grave</option>
                                <option value="critico">Crítico</option>
                                <option value="inconsciente">Inconsciente</option>
                              </Select>
                            </FormControl>
                          </VStack>
                        )}
                      </AccordionPanel>
                    </AccordionItem>
                  </Accordion>
                </Box>
              )}

              {emergencyStep === 'location' && (
                <Box>
                  <Text fontSize={isMobile ? "md" : "lg"} fontWeight="bold" mb={4}>
                    <FaMapMarkerAlt style={{ display: 'inline', marginRight: '8px' }} /> Ubicación de la Emergencia
                  </Text>
                  <VStack spacing={3}>
                    <InputGroup size="lg">
                      <Input
                        placeholder="Buscar dirección en Morelia..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          searchAddresses(e.target.value);
                        }}
                      />
                      <InputRightElement>
                        {isSearching ? (
                          <Spinner size="sm" />
                        ) : searchQuery ? (
                          <IconButton
                            aria-label="Clear search"
                            icon={<CloseIcon />}
                            size="sm"
                            variant="ghost"
                            onClick={clearSearch}
                          />
                        ) : (
                          <SearchIcon color="gray.400" />
                        )}
                      </InputRightElement>
                    </InputGroup>

                    {searchResults.length > 0 && (
                      <Box maxH="200px" overflowY="auto" width="100%">
                        {searchResults.map((result, index) => (
                          <Box
                            key={result.id}
                            p={3}
                            borderBottom="1px"
                            borderColor="gray.200"
                            cursor="pointer"
                            _hover={{ bg: "blue.50" }}
                            onClick={() => selectSearchResult(result)}
                          >
                            <HStack>
                              <Box color="blue.500">{index + 1}.</Box>
                              <VStack align="start" spacing={0} flex={1}>
                                <Text fontSize="sm" fontWeight="medium">{result.place_name}</Text>
                                <Text fontSize="xs" color="gray.500">
                                  {result.type === 'address' ? 'Dirección exacta' : 'Lugar de interés'}
                                </Text>
                              </VStack>
                            </HStack>
                          </Box>
                        ))}
                      </Box>
                    )}

                    <Button 
                      colorScheme="blue" 
                      variant="outline"
                      onClick={() => {
                        if (pos) {
                          setSelectedLocation(pos);
                          setSearchQuery('Usando ubicación actual');
                          showToast('info', 'Usando Ubicación Actual', 'Se utilizará su ubicación GPS actual como emergencia');
                        }
                      }}
                      width="100%"
                      leftIcon={<FaLocationArrow />}
                      isDisabled={!pos}
                    >
                      Usar Mi Ubicación Actual
                    </Button>
                  </VStack>
                </Box>
              )}

              {emergencyStep === 'hospital' && (
                <Box>
                  <Text fontSize={isMobile ? "md" : "lg"} fontWeight="bold" mb={4}>
                    {emergencyMode === 'atender_emergencia' ? 
                      <><FaCheck style={{ display: 'inline', marginRight: '8px' }} /> Confirmar Destino</> : 
                      <><FaHospital style={{ display: 'inline', marginRight: '8px' }} /> Hospital Destino</>
                    }
                  </Text>
                  
                  {emergencyMode === 'atender_emergencia' ? (
                    <Alert status="info" borderRadius="md">
                      <AlertIcon />
                      <Box>
                        <AlertTitle>Ruta a Emergencia</AlertTitle>
                        <AlertDescription>
                          Se calculará la ruta más rápida desde su ubicación hasta el punto de emergencia
                        </AlertDescription>
                      </Box>
                    </Alert>
                  ) : (
                    <VStack spacing={3} maxH={isMobile ? "50vh" : "400px"} overflowY="auto">
                      {hospitals
                        .filter(h => h.activo && h.connected)
                        .map((hospital, index) => (
                          <Card
                            key={hospital.id}
                            bg={selectedHospital === hospital.id ? "blue.50" : "white"}
                            border="1px"
                            borderColor={
                              selectedHospital === hospital.id ? "blue.300" :
                              hospital.connected ? "green.300" : "orange.300"
                            }
                            cursor="pointer"
                            onClick={() => setSelectedHospital(hospital.id)}
                            _hover={{ borderColor: "blue.400" }}
                          >
                            <CardBody p={isMobile ? 2 : 3}>
                              <VStack align="start" spacing={2}>
                                <HStack justify="space-between" width="100%">
                                  <HStack>
                                    <Text fontWeight="bold" fontSize={isMobile ? "sm" : "sm"}>
                                      {index + 1}. {hospital.nombre}
                                    </Text>
                                    {index === 0 && hospital.distance && (
                                      <Badge colorScheme="orange" fontSize="2xs">
                                        MÁS CERCANO
                                      </Badge>
                                    )}
                                  </HStack>
                                  <Badge 
                                    colorScheme={hospital.connected ? "green" : "orange"} 
                                    fontSize="2xs"
                                  >
                                    {hospital.connected ? <FaCheck /> : <FaTimes />}
                                  </Badge>
                                </HStack>
                                
                                <Text fontSize="xs" color="gray.600" noOfLines={1}>
                                  {hospital.direccion}
                                </Text>
                                
                                <HStack spacing={4} fontSize="2xs" wrap="wrap">
                                  {hospital.distance && (
                                    <Text color="green.600" fontWeight="bold">
                                      <FaRoad style={{ display: 'inline', marginRight: '2px' }} /> {hospital.distance.toFixed(1)} km
                                    </Text>
                                  )}
                                  {hospital.estimatedTime && (
                                    <Text color="blue.600">
                                      <FaClock style={{ display: 'inline', marginRight: '2px' }} /> ~{hospital.estimatedTime} min
                                    </Text>
                                  )}
                                  {hospital.camasDisponibles && (
                                    <Text color="purple.600">
                                      <FaBed style={{ display: 'inline', marginRight: '2px' }} /> {hospital.camasDisponibles}
                                    </Text>
                                  )}
                                </HStack>
                              </VStack>
                            </CardBody>
                          </Card>
                        ))}
                    </VStack>
                  )}
                </Box>
              )}

              <HStack spacing={3} width="100%" justify="space-between" pt={4}>
                <Button 
                  variant="outline" 
                  onClick={emergencyStep === 'mode' ? () => {
                    onEmergencyDrawerClose();
                    resetEmergencyForm();
                  } : prevStep}
                  size={isMobile ? "md" : "lg"}
                  flex={1}
                  leftIcon={<FaArrowLeft />}
                >
                  {emergencyStep === 'mode' ? 'Cancelar' : 'Atrás'}
                </Button>
                
                {emergencyStep !== 'hospital' ? (
                  <Button 
                    colorScheme="blue" 
                    onClick={nextStep}
                    isDisabled={
                      (emergencyStep === 'mode' && !emergencyMode) ||
                      (emergencyStep === 'location' && !selectedLocation && !searchQuery)
                    }
                    size={isMobile ? "md" : "lg"}
                    flex={1}
                    leftIcon={<FaArrowRight />}
                  >
                    Siguiente
                  </Button>
                ) : (
                  <Button 
                    colorScheme="red" 
                    onClick={startEmergency}
                    isDisabled={emergencyMode === 'trasladar_paciente' && !selectedHospital}
                    size={isMobile ? "md" : "lg"}
                    flex={1}
                    fontSize={isMobile ? "sm" : "md"}
                    fontWeight="bold"
                    leftIcon={emergencyMode === 'atender_emergencia' ? <FaRoute /> : <FaHospital />}
                  >
                    {emergencyMode === 'atender_emergencia' ? 'CALCULAR RUTA' : 'CONFIRMAR ENVÍO'}
                  </Button>
                )}
              </HStack>
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* ========== DRAWER DE HOSPITALES ========== */}
      <Drawer
        isOpen={isHospitalDrawerOpen}
        placement="right"
        onClose={onHospitalDrawerClose}
        size={isMobile ? "full" : "md"}
      >
        <DrawerOverlay backdropFilter="blur(4px)" />
        <DrawerContent>
          <DrawerCloseButton color="white" />
          <DrawerHeader bg="linear-gradient(135deg, #1a73e8, #0d47a1)" color="white">
            <FaHospital style={{ display: 'inline', marginRight: '12px' }} /> HOSPITALES DEL SISTEMA
          </DrawerHeader>

          <DrawerBody>
            <VStack spacing={4} align="stretch" pt={4}>
              <Box 
                p={3} 
                borderRadius="xl" 
                bg="rgba(76,175,80,0.08)" 
                border="1px" 
                borderColor="rgba(76,175,80,0.2)"
                sx={{ backdropFilter: 'blur(8px)' }}
              >
                <HStack justify="space-around">
                  <VStack spacing={0}>
                    <Text fontSize="2xl" fontWeight="bold" color="green.600">
                      {hospitals.filter(h => h.connected && h.activo).length}
                    </Text>
                    <Text fontSize="xs" color="gray.500">CONECTADOS</Text>
                  </VStack>
                  <Box w="1px" h="40px" bg="gray.200" />
                  <VStack spacing={0}>
                    <Text fontSize="2xl" fontWeight="bold" color="blue.600">
                      {hospitals.filter(h => h.activo).length}
                    </Text>
                    <Text fontSize="xs" color="gray.500">TOTAL</Text>
                  </VStack>
                  <Box w="1px" h="40px" bg="gray.200" />
                  <VStack spacing={0}>
                    <Text fontSize="2xl" fontWeight="bold" color="orange.600">
                      {hospitals.filter(h => h.activo && !h.connected).length}
                    </Text>
                    <Text fontSize="xs" color="gray.500">INACTIVOS</Text>
                  </VStack>
                </HStack>
              </Box>

              <HStack justify="space-between">
                <Text fontSize="sm" fontWeight="bold" color="gray.600">
                  <FaHospital style={{ display: 'inline', marginRight: 6 }} /> LISTA DE HOSPITALES
                </Text>
                <Button size="sm" onClick={refreshHospitals} variant="ghost" leftIcon={<FaSync />} colorScheme="blue">
                  Actualizar
                </Button>
              </HStack>

              <Divider />

              <VStack spacing={2} align="stretch" maxH={isMobile ? "60vh" : "500px"} overflowY="auto">
                {hospitals
                  .filter(h => h.activo)
                  .sort((a, b) => {
                    if (a.connected !== b.connected) return a.connected ? -1 : 1;
                    return (a.distance || 999) - (b.distance || 999);
                  })
                  .map((hospital, index) => (
                    <Card
                      key={hospital.id}
                      border="1px"
                      borderColor={hospital.connected ? "green.200" : "gray.200"}
                      bg={hospital.connected ? "white" : "gray.50"}
                      boxShadow={hospital.connected ? "0 2px 12px rgba(76,175,80,0.15)" : "none"}
                      _hover={{ transform: 'translateY(-1px)', boxShadow: 'md' }}
                      transition="all 0.2s ease"
                      cursor={hospital.connected ? "pointer" : "default"}
                      onClick={() => {
                        if (hospital.connected && map.current) {
                          setSelectedHospital(hospital.id);
                          map.current.flyTo({ center: [hospital.lng, hospital.lat], zoom: 16, duration: 800 });
                        }
                      }}
                    >
                      <CardBody p={isMobile ? 2 : 3}>
                        <VStack align="start" spacing={1.5}>
                          <HStack justify="space-between" width="100%">
                            <HStack spacing={2}>
                              <Box
                                w="8px" h="8px" borderRadius="full"
                                bg={hospital.connected ? "#4CAF50" : "#BDBDBD"}
                                boxShadow={hospital.connected ? '0 0 8px #4CAF50' : 'none'}
                                animation={hospital.connected ? 'pulseGreen 2s infinite' : 'none'}
                              />
                              <Text fontWeight="bold" fontSize={isMobile ? "sm" : "sm"} color={hospital.connected ? "green.800" : "gray.500"}>
                                {hospital.nombre}
                              </Text>
                              {index === 0 && hospital.distance && hospital.connected && (
                                <Badge colorScheme="orange" fontSize="2xs" variant="solid" borderRadius="full">
                                  MÁS CERCANO
                                </Badge>
                              )}
                            </HStack>
                            <Badge 
                              colorScheme={hospital.connected ? "green" : "gray"} 
                              fontSize="2xs"
                              variant={hospital.connected ? "solid" : "subtle"}
                            >
                              {hospital.connected ? '● EN LÍNEA' : 'SIN CONEXIÓN'}
                            </Badge>
                          </HStack>
                          
                          <Text fontSize="xs" color="gray.500" noOfLines={1}>
                            {hospital.direccion || 'Dirección no disponible'}
                          </Text>
                          
                          <HStack spacing={3} fontSize="2xs" wrap="wrap">
                            {hospital.distance && (
                              <Badge colorScheme="green" variant="outline" borderRadius="full" px={2}>
                                📏 {hospital.distance.toFixed(1)} km
                              </Badge>
                            )}
                            {hospital.estimatedTime && (
                              <Badge colorScheme="blue" variant="outline" borderRadius="full" px={2}>
                                🕐 ~{hospital.estimatedTime} min
                              </Badge>
                            )}
                            {hospital.camasDisponibles && (
                              <Badge colorScheme="purple" variant="outline" borderRadius="full" px={2}>
                                🛏️ {hospital.camasDisponibles}
                              </Badge>
                            )}
                          </HStack>
                          
                          {hospital.especialidades?.length > 0 && (
                            <HStack spacing={1} mt={0.5}>
                              {hospital.especialidades.slice(0, 3).map((esp, i) => (
                                <Tag key={i} size="sm" variant="subtle" colorScheme={hospital.connected ? "green" : "gray"} fontSize="2xs">
                                  {esp}
                                </Tag>
                              ))}
                              {hospital.especialidades.length > 3 && (
                                <Text fontSize="2xs" color="gray.400">+{hospital.especialidades.length - 3}</Text>
                              )}
                            </HStack>
                          )}
                        </VStack>
                      </CardBody>
                    </Card>
                  ))}
              </VStack>
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* ========== MODAL DE EMERGENCIA ASIGNADA ========== */}
      <EmergencyAssignmentModal />
    </ChakraProvider>
  );
}