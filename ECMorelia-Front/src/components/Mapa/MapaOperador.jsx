// MapaOperadorGPS.jsx - VERSIÓN FINAL CORREGIDA (USO EXCLUSIVO DE WEBSOCKET PARA HOSPITALES)
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

// Configuración del tema con breakpoints definidos correctamente
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
  // Refs
  const mapContainer = useRef(null);
  const map = useRef(null);
  const ambulanceMarker = useRef(null);
  const watchId = useRef(null);
  const ws = useRef(null);
  const hospitalMarkers = useRef([]);
  const emergencyMarker = useRef(null);
  const routeLayerIds = useRef([]);
  const routeSources = useRef([]);
  const reconnectTimeout = useRef(null);
  const connectionAttempts = useRef(0);
  const maxConnectionAttempts = 5;
  const lastPosition = useRef(null);
  const isMounted = useRef(true);
  const orientationListener = useRef(null);
  const routeStepsPanelRef = useRef(null);
  const sidebarRef = useRef(null);

  // Responsive hooks
  const [isMobile] = useMediaQuery("(max-width: 768px)");
  const [isTablet] = useMediaQuery("(max-width: 1024px) and (min-width: 769px)");
  const [isDesktop] = useMediaQuery("(min-width: 1025px)");
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
  const [isFullscreenMap, setIsFullscreenMap] = useState(false);
  
  // Valores calculados para responsive
  const sidebarWidth = isMobile ? "100%" : isTablet ? "320px" : "380px";
  const headerPadding = isMobile ? 2 : 3;
  const fontSizeTitle = isMobile ? "md" : "xl";
  const fontSizeStats = isMobile ? "sm" : "lg";
  const badgeSize = isMobile ? "xs" : "sm";
  
  // Estado principal
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

  // Estado de emergencia
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
  const [routeSteps, setRouteSteps] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [showRouteSteps, setShowRouteSteps] = useState(false);
  const [pendingEmergencyRoute, setPendingEmergencyRoute] = useState(null);
  const [mapZoom, setMapZoom] = useState(15);
  const [mapPitch, setMapPitch] = useState(60);
  const [isMapFollowing, setIsMapFollowing] = useState(true);

  const toast = useToast();
  const { colorMode } = useColorMode();

  // Colores dinámicos
  const bgColor = useColorModeValue('gray.50', 'gray.900');
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const textColor = useColorModeValue('gray.800', 'white');
  const headerBg = useColorModeValue('white', 'gray.800');
  const sidebarBg = useColorModeValue('white', 'gray.800');

  // URL base para las peticiones HTTP (no se usa para hospitales, solo directions/geocode si son necesarios)
  const apiBaseUrl = getApiBaseUrl();

  // ---------- ORIENTACIÓN DEL DISPOSITIVO ----------
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

  // ---------- FUNCIONES DE NAVEGACIÓN DEL DRAWER DE EMERGENCIA ----------
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

  // ---------- GEOLOCALIZACIÓN ----------
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

      // Seguimiento automático si está activado
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

  // ---------- OBTENER DIRECCIÓN ACTUAL ----------
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

  // ---------- MARCADOR DE AMBULANCIA 3D MEJORADO ----------
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
                <strong style="color: #FF4444; font-size: ${isMobile ? '14px' : '16px'};">AMBULANCIA UVI-01</strong>
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
                <strong style="color: #FF4444; font-size: ${isMobile ? '14px' : '16px'};">AMBULANCIA UVI-01</strong>
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
      }
    }

    // Seguimiento automático tipo GPS
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

  // ---------- WEBSOCKET CONNECTION MEJORADA (SIN DEPENDENCIA DE API REST) ----------
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

      ws.current = new WebSocket(import.meta.env.VITE_WS_URL);

      ws.current.onopen = () => {
        if (!isMounted.current) return;
        
        console.log('✅ Operador conectado al servidor WebSocket');
        setWsConnected(true);
        setIsConnecting(false);
        connectionAttempts.current = 0;
        
        safeSend({
          type: 'register_ambulance',
          ambulance: {
            id: 'UVI-01',
            placa: 'ABC123',
            tipo: 'UVI Móvil',
            status: ambulanceStatus,
            location: pos
          }
        });

        // Solicitamos la lista de hospitales a través del WebSocket
        safeSend({ type: 'request_hospitals_list' });
        showToast('success', 'Sistema Conectado', 'Conectado al servidor WebSocket');
      };

      ws.current.onmessage = (event) => {
        if (!isMounted.current) return;
        
        try {
          const data = JSON.parse(event.data);
          console.log('📨 Mensaje recibido:', data.type);

          switch (data.type) {
            case 'connection_established':
              console.log('✅ Conexión WebSocket confirmada');
              break;
            case 'active_hospitals_update':
              console.log('🏥 Hospitales activos actualizados via WS:', data.hospitals?.length);
              if (data.hospitals) processHospitalsList(data.hospitals);
              break;
            case 'all_hospitals_list':
              console.log('🏥 Todos los hospitales cargados vía WS:', data.hospitals?.length);
              if (data.hospitals) processHospitalsList(data.hospitals);
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

  // Función para procesar la lista de hospitales y actualizar el estado
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

  const updateHospitalMarkers = useCallback((hospitalsList) => {
    if (!map.current) return;

    hospitalMarkers.current.forEach(marker => marker.remove());
    hospitalMarkers.current = [];

    hospitalsList.forEach((hospital, index) => {
      if (!hospital.lat || !hospital.lng) return;

      const isConnected = hospital.connected;
      const isActiveInDB = hospital.activo;
      const isClosest = index === 0 && hospital.distance !== null;
      
      if (!isActiveInDB) return;

      let backgroundColor = 'linear-gradient(135deg, #FF9800, #F57C00)';
      let borderColor = '#FF9800';
      let opacity = 0.8;
      let icon = '🏢';
      let size = isMobile ? '50px' : '60px';
      let fontSize = isMobile ? '18px' : '22px';
      
      if (isConnected) {
        backgroundColor = 'linear-gradient(135deg, #4CAF50, #2E7D32)';
        borderColor = '#4CAF50';
        opacity = 1;
        icon = '🏥';
        if (isClosest) {
          size = isMobile ? '60px' : '70px';
          fontSize = isMobile ? '22px' : '26px';
        }
      }

      const el = document.createElement('div');
      el.innerHTML = `
        <div style="
          width: ${size};
          height: ${size};
          background: ${backgroundColor};
          border: ${isClosest ? '4px' : '3px'} solid white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: ${fontSize};
          box-shadow: 0 6px 20px rgba(0,0,0,0.3);
          cursor: ${isConnected ? 'pointer' : 'default'};
          opacity: ${opacity};
          position: relative;
          transition: all 0.3s ease;
          ${isClosest && isConnected ? 'animation: pulse 2s infinite;' : ''}
        ">
          ${icon}
          ${isClosest ? `
            <div style="
              position: absolute;
              top: -8px;
              right: -8px;
              background: #2196F3;
              color: white;
              border-radius: 50%;
              width: 20px;
              height: 20px;
              font-size: 10px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: bold;
              box-shadow: 0 2px 8px rgba(33,150,243,0.5);
            ">${index + 1}</div>
          ` : ''}
        </div>
        <style>
          @keyframes pulse {
            0% { transform: scale(1); box-shadow: 0 6px 20px rgba(76,175,80,0.3); }
            50% { transform: scale(1.05); box-shadow: 0 8px 25px rgba(76,175,80,0.5); }
            100% { transform: scale(1); box-shadow: 0 6px 20px rgba(76,175,80,0.3); }
          }
        </style>
      `;

      const popup = new mapboxgl.Popup({ offset: 25, closeButton: true, closeOnClick: false })
        .setHTML(`
          <div style="padding: ${isMobile ? '8px' : '12px'}; max-width: ${isMobile ? '240px' : '280px'}; font-family: Arial, sans-serif;">
            <strong style="font-size: ${isMobile ? '14px' : '16px'}; color: #333;">${hospital.nombre}</strong>
            <div style="margin: ${isMobile ? '6px 0' : '8px 0'}; font-size: ${isMobile ? '12px' : '14px'}; color: #666;">
              <div>📍 ${hospital.direccion || 'Dirección no disponible'}</div>
              ${hospital.distance ? `<div style="margin-top: 4px;">📏 ${hospital.distance.toFixed(1)} km de distancia</div>` : ''}
              ${hospital.estimatedTime ? `<div style="margin-top: 4px;">🕐 ~${hospital.estimatedTime} min (estimado)</div>` : ''}
              ${hospital.especialidades?.length > 0 ? 
                `<div style="margin-top: 4px;">🏥 ${hospital.especialidades.slice(0, 2).join(', ')}${hospital.especialidades.length > 2 ? '...' : ''}</div>` : ''}
              ${hospital.camasDisponibles ? 
                `<div style="margin-top: 4px;">🛏️ ${hospital.camasDisponibles} camas disponibles</div>` : ''}
              ${hospital.telefono ? 
                `<div style="margin-top: 4px;">📞 ${hospital.telefono}</div>` : ''}
              <div style="margin-top: 4px;">
                <span style="color: ${isConnected ? '#4CAF50' : '#FF9800'}; font-weight: bold;">
                  ${isConnected ? '✅ CONECTADO' : '🟡 ACTIVO (SIN CONEXIÓN)'}
                </span>
              </div>
            </div>
            ${isConnected ? `
              <button onclick="window.selectHospitalFromMap('${hospital.id}')" 
                style="width: 100%; padding: ${isMobile ? '8px 12px' : '10px 16px'}; background: #2196F3; color: white; 
                border: none; border-radius: 8px; cursor: pointer; margin-top: 8px; font-weight: bold;
                font-size: ${isMobile ? '12px' : '14px'};
                box-shadow: 0 2px 8px rgba(33,150,243,0.3); transition: all 0.2s;"
                onmouseover="this.style.background='#1976D2'" 
                onmouseout="this.style.background='#2196F3'">
                🚑 Seleccionar Destino
              </button>
            ` : 
            '<div style="padding: 8px; background: #FF9800; color: white; text-align: center; border-radius: 8px; margin-top: 8px; font-size: 12px;">Hospital no disponible para selección</div>'}
          </div>
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

  // Sincronizar marcadores cuando cambia la lista de hospitales
  useEffect(() => {
    updateHospitalMarkers(hospitals);
  }, [hospitals, updateHospitalMarkers]);

  // ---------- CAPA DE TRÁFICO REALISTA (colores oficiales Mapbox) ----------
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
              'low', '#00C853',      // verde
              'moderate', '#FFD600', // amarillo
              'heavy', '#FF9100',    // naranja
              'severe', '#D50000',   // rojo
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
        }, 'waterway-label'); // Se utiliza una capa que sí existe por defecto
      } else {
        map.current.setLayoutProperty('traffic-layer', 'visibility', trafficEnabled ? 'visible' : 'none');
      }

      // Leyenda de tráfico mejorada
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

  const handleRouteUpdate = (data) => {
    if (data.routes && data.routes.length > 0) {
      data.routes.forEach((route, index) => {
        const routeId = `route-${data.ambulanceId}-${route.hospitalId || 'emergency'}-${index}`;
        drawRoute(route.routeGeometry, routeId, index);
      });
      
      const newRoutes = data.routes.map(route => ({
        routeKey: route.routeKey,
        ambulanceId: data.ambulanceId,
        hospitalId: route.hospitalId,
        distance: route.distance,
        duration: route.duration,
        geometry: route.routeGeometry
      }));
      
      setActiveRoutes(prev => [...prev, ...newRoutes.filter(newRoute => 
        !prev.some(prevRoute => prevRoute.routeKey === newRoute.routeKey)
      )]);
      
    } else if (data.routeGeometry) {
      const routeId = `route-${data.ambulanceId}-${data.hospitalId || 'emergency'}`;
      drawRoute(data.routeGeometry, routeId);
      
      const newRoute = {
        routeKey: data.routeKey || routeId,
        ambulanceId: data.ambulanceId,
        hospitalId: data.hospitalId,
        distance: data.distance,
        duration: data.duration,
        geometry: data.routeGeometry
      };
      
      setActiveRoutes(prev => [...prev.filter(r => r.routeKey !== newRoute.routeKey), newRoute]);
    }
  };

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
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
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
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
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
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
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

      let dashArraySeq = [[0, 4, 3]];
      let timer = 0;
      
      const animateRoute = () => {
        timer = (timer + 1) % 1000;
        const newDashArray = dashArraySeq.map(arr => arr.map(num => num * (timer / 20)));
        
        if (map.current.getLayer(`${uniqueRouteId}-dots`)) {
          map.current.setPaintProperty(
            `${uniqueRouteId}-dots`,
            'line-dasharray',
            newDashArray[0]
          );
        }
        
        requestAnimationFrame(animateRoute);
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
      if (map.current.getLayer(layerId)) {
        map.current.removeLayer(layerId);
      }
    });
    
    routeSources.current.forEach(sourceId => {
      if (map.current.getSource(sourceId)) {
        map.current.removeSource(sourceId);
      }
    });
    
    routeLayerIds.current = [];
    routeSources.current = [];
    setActiveRoutes([]);
    setRouteSteps([]);
    setCurrentStep(0);
    setShowRouteSteps(false);
  };

  const clearSpecificRoute = (routeKey) => {
    if (!map.current) return;
    
    const layersToRemove = routeLayerIds.current.filter(id => id.includes(routeKey));
    layersToRemove.forEach(layerId => {
      if (map.current.getLayer(layerId)) {
        map.current.removeLayer(layerId);
      }
    });
    
    const sourcesToRemove = routeSources.current.filter(id => id.includes(routeKey));
    sourcesToRemove.forEach(sourceId => {
      if (map.current.getSource(sourceId)) {
        map.current.removeSource(sourceId);
      }
    });
    
    routeLayerIds.current = routeLayerIds.current.filter(id => !id.includes(routeKey));
    routeSources.current = routeSources.current.filter(id => !id.includes(routeKey));
    
    setActiveRoutes(prev => prev.filter(route => route.routeKey !== routeKey));
    
    if (activeRoutes.find(route => route.routeKey === routeKey)) {
      setShowRouteSteps(false);
    }
  };

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
      
      if (data.isEmergencyRoute) {
        removeEmergencyMarker();
      }
      
      const newRoute = {
        routeKey: routeId,
        ambulanceId: 'UVI-01',
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
      if (routeToRemove) {
        clearSpecificRoute(routeToRemove.routeKey);
      }
    }
    
    showToast('warning', 'Paciente Rechazado', 'Hospital no disponible para atender emergencia');
    
    setTimeout(() => setHospitalNotification(null), 6000);
  };

  const handleAutomaticRedirect = (data) => {
    showToast('info', 'Redirección Automática', data.message || 'Solicitud enviada a otro hospital');
    setSelectedHospital(data.newHospitalId);
    
    if (data.rejectedHospitals) {
      console.log('Hospitales rechazados:', data.rejectedHospitals);
    }
    
    if (data.remainingHospitals !== undefined) {
      console.log('Hospitales restantes disponibles:', data.remainingHospitals);
    }
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
    
    if (data.isEmergencyRoute) {
      removeEmergencyMarker();
    }
    
    if (data.routeKey) {
      clearSpecificRoute(data.routeKey);
    } else {
      clearAllRoutes();
    }
    
    setPendingEmergencyRoute(null);
    
    showToast('info', 'Navegación Cancelada', data.message || 'Ruta eliminada del sistema');
  };

  const handleEmergencyMarkerCancelled = (data) => {
    removeEmergencyMarker();
    showToast('info', 'Marcador Eliminado', 'Punto de emergencia removido');
  };

  const removeEmergencyMarker = () => {
    if (emergencyMarker.current) {
      emergencyMarker.current.remove();
      emergencyMarker.current = null;
      setSelectedLocation(null);
    }
  };

  const searchAddresses = async () => {
    if (!searchQuery.trim() || searchQuery.trim().length < 3) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);

    try {
      const query = encodeURIComponent(`${searchQuery}, Morelia, Michoacán, México`);
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${mapboxgl.accessToken}&country=mx&types=address,poi,place&limit=5&language=es`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Error en búsqueda');
      }

      const data = await response.json();
      
      const results = (data.features || []).map(f => ({
        id: f.id,
        place_name: f.place_name,
        lat: f.center[1],
        lng: f.center[0],
        type: f.place_type[0],
        relevance: f.relevance,
      }));
      
      setSearchResults(results);
    } catch (error) {
      console.error('❌ Error buscando direcciones:', error);
      showToast('error', 'Error de Búsqueda', 'No se pudieron obtener resultados');
    } finally {
      setIsSearching(false);
    }
  };

  const selectSearchResult = (result) => {
    setSearchQuery(result.place_name);
    setSearchResults([]);
    
    placeEmergencyMarker(
      { lat: result.lat, lng: result.lng },
      result.place_name
    );
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

    emergencyMarker.current = new mapboxgl.Marker({ 
      element: el,
      draggable: false
    })
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

  const calculateRoute = async (start, end) => {
    if (!start || !end) {
      showToast('error', 'Error de Ruta', 'Ubicaciones no válidas para calcular ruta');
      return null;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/directions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startLng: start.lng,
          startLat: start.lat,
          endLng: end.lng,
          endLat: end.lat
        })
      });

      if (!response.ok) {
        throw new Error('Error calculando ruta');
      }

      const routeData = await response.json();
      return routeData;
    } catch (error) {
      console.error('❌ Error calculando ruta:', error);
      showToast('error', 'Error de Ruta', 'No se pudo calcular la ruta al destino');
      return null;
    }
  };

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

    const startLocation = emergencyMode === 'atender_emergencia' ? selectedLocation : pos;
    const endLocation = emergencyMode === 'atender_emergencia' ? pos : hospital;

    try {
      const routeData = await calculateRoute(startLocation, endLocation);
      if (!routeData) return;

      const routeId = `route-pending-${emergencyMode === 'atender_emergencia' ? 'emergency' : hospital.id}-${Date.now()}`;
      
      setPendingEmergencyRoute({
        routeId: routeId,
        startLocation: startLocation,
        endLocation: endLocation,
        routeData: routeData,
        isEmergencyRoute: emergencyMode === 'atender_emergencia',
        hospital: hospital
      });
      
      if (routeData.steps && routeData.steps.length > 0) {
        const steps = routeData.steps.map((step, index) => ({
          number: index + 1,
          instruction: step.maneuver.instruction || `Continuar por ${step.name || 'la vía'}`,
          distance: (step.distance / 1000).toFixed(1),
          duration: Math.round(step.duration / 60),
          maneuver: step.maneuver.type || 'continue'
        }));
        setRouteSteps(steps);
        setCurrentStep(0);
        setShowRouteSteps(true);
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
          ambulanceId: 'UVI-01',
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

  const cancelNavigation = () => {
    if (destination) {
      safeSend({
        type: 'cancel_navigation',
        ambulanceId: 'UVI-01',
        hospitalId: destination.id,
        isEmergencyRoute: pendingEmergencyRoute?.isEmergencyRoute || false
      });
    }
    
    if (emergencyMarker.current) {
      safeSend({
        type: 'cancel_emergency_marker',
        ambulanceId: 'UVI-01'
      });
    }
    
    setIsNavigating(false);
    setDestination(null);
    setAmbulanceStatus('disponible');
    setHospitalNotification(null);
    removeEmergencyMarker();
    clearAllRoutes();
    setPendingEmergencyRoute(null);
    
    showToast('info', 'Navegación Cancelada', 'Ruta eliminada del sistema');
  };

  const cancelSpecificRoute = (routeKey) => {
    const route = activeRoutes.find(r => r.routeKey === routeKey);
    safeSend({
      type: 'cancel_navigation',
      ambulanceId: 'UVI-01',
      routeKey: routeKey,
      isEmergencyRoute: route?.isEmergencyRoute || false
    });
    
    clearSpecificRoute(routeKey);
    showToast('info', 'Ruta Cancelada', 'Ruta específica eliminada');
  };

  useEffect(() => {
    isMounted.current = true;

    if (!mapContainer.current) return;

    const mapStyle = colorMode === 'light' 
      ? 'mapbox://styles/mapbox/navigation-day-v1'
      : 'mapbox://styles/mapbox/navigation-night-v1';

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
      positionOptions: {
        enableHighAccuracy: true
      },
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

  const clearRouteSimple = () => {
    if (!map.current) return;

    routeLayerIds.current.forEach(layerId => {
      if (map.current.getLayer(layerId)) {
        map.current.removeLayer(layerId);
      }
      if (map.current.getSource(layerId)) {
        map.current.removeSource(layerId);
      }
    });
    routeLayerIds.current = [];
    routeSources.current = [];
  };

  const RouteStepsPanel = () => {
    if (!showRouteSteps || routeSteps.length === 0) return null;

    const getManeuverIcon = (maneuver) => {
      switch(maneuver) {
        case 'turn':
        case 'turn left':
          return '↰';
        case 'turn right':
          return '↱';
        case 'sharp left':
          return '↶';
        case 'sharp right':
          return '↷';
        case 'slight left':
          return '↖';
        case 'slight right':
          return '↗';
        case 'straight':
          return '↑';
        case 'uturn':
          return '↺';
        case 'ramp':
          return '⇪';
        case 'merge':
          return '⇗';
        case 'fork':
          return '⇉';
        case 'roundabout':
          return '⟲';
        default:
          return '→';
      }
    };

    return (
      <Box
        ref={routeStepsPanelRef}
        position="absolute"
        top={isMobile ? "70px" : "80px"}
        right={isMobile ? "10px" : "20px"}
        left={isMobile ? "10px" : "auto"}
        width={isMobile ? "calc(100% - 20px)" : "350px"}
        bg={cardBg}
        color={textColor}
        p={isMobile ? 3 : 4}
        borderRadius="md"
        boxShadow="xl"
        border="1px"
        borderColor={borderColor}
        zIndex="1000"
        maxHeight={isMobile ? "60vh" : "450px"}
        overflowY="auto"
      >
        <HStack justify="space-between" mb={3}>
          <Text fontWeight="bold" color="blue.600" fontSize={isMobile ? "md" : "lg"}>
            <FaDirections style={{ display: 'inline', marginRight: '8px' }} /> NAVEGACIÓN
          </Text>
          <IconButton
            aria-label="Cerrar panel"
            icon={<CloseIcon />}
            size="sm"
            onClick={() => setShowRouteSteps(false)}
          />
        </HStack>
        
        <VStack spacing={3} align="stretch">
          {routeSteps.map((step, index) => (
            <Box
              key={index}
              p={isMobile ? 2 : 3}
              bg={index === currentStep ? "blue.50" : "transparent"}
              borderLeft={index === currentStep ? "4px solid #2196F3" : "4px solid transparent"}
              borderRadius="md"
              border="1px"
              borderColor={borderColor}
              _hover={{ bg: "blue.50" }}
            >
              <HStack spacing={3}>
                <Box
                  width={isMobile ? "32px" : "40px"}
                  height={isMobile ? "32px" : "40px"}
                  borderRadius="md"
                  bg={index === currentStep ? "#2196F3" : "gray.200"}
                  color="white"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  fontSize={isMobile ? "16px" : "20px"}
                  fontWeight="bold"
                  boxShadow="sm"
                >
                  {getManeuverIcon(step.maneuver)}
                </Box>
                <VStack align="start" spacing={1} flex={1}>
                  <Text fontSize={isMobile ? "xs" : "sm"} fontWeight="medium">
                    {step.instruction}
                  </Text>
                  <Text fontSize="2xs" color="gray.500">
                    {step.distance} km • {step.duration} min
                  </Text>
                </VStack>
                <Badge 
                  colorScheme={index === currentStep ? "blue" : "gray"} 
                  fontSize="2xs"
                >
                  {index + 1}
                </Badge>
              </HStack>
            </Box>
          ))}
        </VStack>
        
        {routeSteps.length > 0 && (
          <HStack mt={4} justify="space-between" spacing={4}>
            <Button
              size="sm"
              leftIcon={<ChevronLeftIcon />}
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              isDisabled={currentStep === 0}
              flex={1}
            >
              Anterior
            </Button>
            <Box textAlign="center" minWidth="80px">
              <Text fontSize="xs" color="gray.500">
                Paso
              </Text>
              <Text fontSize="sm" fontWeight="bold">
                {currentStep + 1} de {routeSteps.length}
              </Text>
            </Box>
            <Button
              size="sm"
              rightIcon={<ChevronRightIcon />}
              onClick={() => setCurrentStep(Math.min(routeSteps.length - 1, currentStep + 1))}
              isDisabled={currentStep === routeSteps.length - 1}
              flex={1}
            >
              Siguiente
            </Button>
          </HStack>
        )}
        
        <Button 
          size="sm" 
          colorScheme="red" 
          mt={3} 
          width="100%"
          onClick={() => {
            setShowRouteSteps(false);
            setRouteSteps([]);
          }}
          leftIcon={<FaTimes />}
        >
          Cerrar Navegación
        </Button>
      </Box>
    );
  };

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
      ambulanceId: 'UVI-01',
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
    safeSend({
      type: 'request_hospitals_list'
    });
    showToast('info', 'Actualizando', 'Buscando hospitales disponibles...');
  };

  const reconnect = () => {
    if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    connectionAttempts.current = 0;
    connectWebSocket();
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSelectedLocation(null);
    if (emergencyMarker.current) {
      emergencyMarker.current.remove();
      emergencyMarker.current = null;
    }
    showToast('info', 'Búsqueda Limpiada', 'Campo de búsqueda vacío');
  };

  const cleanupMarkers = () => {
    hospitalMarkers.current.forEach(marker => marker.remove());
    hospitalMarkers.current = [];
    
    if (ambulanceMarker.current) {
      ambulanceMarker.current.remove();
      ambulanceMarker.current = null;
    }
    
    removeEmergencyMarker();
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
      if (map.current) {
        map.current.resize();
      }
    }, 100);
  };

  // Componente de barra lateral responsiva
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
          '&::-webkit-scrollbar': {
            width: '6px',
          },
          '&::-webkit-scrollbar-track': {
            width: '6px',
          },
          '&::-webkit-scrollbar-thumb': {
            background: borderColor,
            borderRadius: '24px',
          }
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

          {emergencyMarker.current && (
            <Button 
              colorScheme="red" 
              size={isMobile ? "sm" : "md"}
              onClick={() => {
                safeSend({
                  type: 'cancel_emergency_marker',
                  ambulanceId: 'UVI-01'
                });
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
                  <Box w="3" h="3" borderRadius="full" bg={wsConnected ? "green.400" : isConnecting ? "yellow.400" : "red.400"} />
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
              
              <Text fontSize="2xs" color="gray.600" mt={2}>
                {hospitals.filter(h => h.connected && h.activo).length} hospitales conectados de {hospitals.filter(h => h.activo).length} en sistema
              </Text>
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

          <Card>
            <CardBody p={isMobile ? 2 : 3}>
              <HStack justify="space-between" mb={3}>
                <Text fontSize={isMobile ? "sm" : "sm"} fontWeight="bold">
                  <FaHospital style={{ display: 'inline', marginRight: '8px' }} /> HOSPITALES CERCANOS
                </Text>
                <Button 
                  size="xs" 
                  onClick={refreshHospitals}
                  variant="ghost"
                  leftIcon={<FaSync />}
                >
                  Actualizar
                </Button>
              </HStack>
              
              <VStack spacing={2} align="stretch" maxH={isMobile ? "200px" : "250px"} overflowY="auto">
                {hospitals
                  .filter(h => h.activo && h.connected)
                  .slice(0, isMobile ? 3 : 4)
                  .map((hospital, index) => (
                    <HStack 
                      key={hospital.id}
                      p={isMobile ? 2 : 2}
                      bg={hospital.connected ? "green.50" : "orange.50"}
                      borderRadius="md"
                      border="1px"
                      borderColor={hospital.connected ? "green.200" : "orange.200"}
                      opacity={hospital.connected ? 1 : 0.8}
                    >
                      <Badge 
                        colorScheme={hospital.connected ? "green" : "orange"}
                        minW="24px"
                        height="24px"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                      >
                        {index + 1}
                      </Badge>
                      <VStack align="start" spacing={0} flex={1}>
                        <Text fontSize="xs" fontWeight="medium" noOfLines={1}>
                          {hospital.nombre}
                        </Text>
                        <Text fontSize="2xs" color="gray.600" noOfLines={1}>
                          {hospital.distance ? `${hospital.distance.toFixed(1)} km` : 'Distancia N/A'}
                        </Text>
                      </VStack>
                      <Badge 
                        colorScheme={hospital.connected ? "green" : "orange"}
                        fontSize="2xs"
                      >
                        {hospital.connected ? '✅' : '🟡'}
                      </Badge>
                    </HStack>
                  ))}
              </VStack>
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

  // Header responsivo con safe area
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
                AMBULANCIA UVI-01
              </Text>
              <Badge ml={2} colorScheme={
                ambulanceStatus === 'en_ruta' ? "red" : 
                ambulanceStatus === 'disponible' ? "green" : "yellow"
              } fontSize={badgeSize}>
                {ambulanceStatus.toUpperCase()}
              </Badge>
            </HStack>
            <Text fontSize="2xs" color={textColor}>
              Sistema de Navegación GPS • {isNavigating ? 'NAVEGACIÓN ACTIVA' : 'DISPONIBLE'}
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
          
          <Tooltip label="Hospitales Disponibles">
            <Badge colorScheme="purple" fontSize={badgeSize} p={isMobile ? 1 : 2} borderRadius="md">
              <FaHospital style={{ display: 'inline', marginRight: '2px' }} /> 
              {hospitals.filter(h => h.connected && h.activo).length}
            </Badge>
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

  // Botón flotante para móvil (mostrar/ocultar sidebar)
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
          {/* Sidebar */}
          <Sidebar />

          {/* Mapa */}
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
            
            {/* Panel de pasos de ruta */}
            <RouteStepsPanel />
            
            {/* Notificaciones */}
            {hospitalNotification && (
              <Box
                position="absolute"
                top={isMobile ? "10px" : "20px"}
                right={isMobile ? "10px" : (showRouteSteps ? (isMobile ? "10px" : "380px") : "20px")}
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
                transition="right 0.3s ease"
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
          </Box>

          {/* Botón flotante para móvil */}
          <FloatingMenuButton />

          {/* Indicador de seguimiento */}
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

      {/* Drawer de emergencia */}
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
              {/* Paso 1: Selección de modo */}
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

              {/* Paso 2: Información del paciente */}
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
                                    <NumberIncrementStepper>
                                      <AddIcon fontSize="10px" />
                                    </NumberIncrementStepper>
                                    <NumberDecrementStepper>
                                      <MinusIcon fontSize="10px" />
                                    </NumberDecrementStepper>
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

              {/* Paso 2: Ubicación de emergencia */}
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
                          if (e.target.value.length >= 3) {
                            searchAddresses();
                          } else {
                            setSearchResults([]);
                          }
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

              {/* Paso 3: Selección de hospital */}
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
                          Se calculará la ruta más rápida desde la emergencia hasta su ubicación
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

              {/* Navegación entre pasos */}
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

      {/* Drawer de hospitales */}
      <Drawer
        isOpen={isHospitalDrawerOpen}
        placement="right"
        onClose={onHospitalDrawerClose}
        size={isMobile ? "full" : "md"}
      >
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton color="white" />
          <DrawerHeader bg="blue.600" color="white">
            <FaHospital style={{ display: 'inline', marginRight: '12px' }} /> HOSPITALES DISPONIBLES
          </DrawerHeader>

          <DrawerBody>
            <VStack spacing={4} align="stretch" pt={4}>
              <HStack justify="space-between">
                <Text fontWeight="bold" fontSize={isMobile ? "md" : "lg"}>
                  {hospitals.filter(h => h.activo).length} hospitales activos en sistema
                </Text>
                <Button size="sm" onClick={refreshHospitals} variant="outline" leftIcon={<FaSync />}>
                  Actualizar
                </Button>
              </HStack>

              <Divider />

              <VStack spacing={3} align="stretch" maxH={isMobile ? "70vh" : "500px"} overflowY="auto">
                {hospitals
                  .filter(h => h.activo)
                  .map((hospital, index) => (
                    <Card
                      key={hospital.id}
                      border="1px"
                      borderColor={hospital.connected ? "green.200" : "orange.200"}
                      bg={hospital.connected ? "green.50" : "orange.50"}
                    >
                      <CardBody p={isMobile ? 2 : 3}>
                        <VStack align="start" spacing={2}>
                          <HStack justify="space-between" width="100%">
                            <VStack align="start" spacing={0}>
                              <HStack wrap="wrap">
                                <Text fontWeight="bold" fontSize={isMobile ? "sm" : "sm"}>
                                  {index + 1}. {hospital.nombre}
                                </Text>
                                {index === 0 && hospital.distance && (
                                  <Badge colorScheme="orange" fontSize="2xs">
                                    MÁS CERCANO
                                  </Badge>
                                )}
                              </HStack>
                              <Text fontSize="xs" color="gray.600" noOfLines={1}>
                                {hospital.direccion}
                              </Text>
                            </VStack>
                            <Badge 
                              colorScheme={hospital.connected ? "green" : "orange"} 
                              fontSize="2xs"
                            >
                              {hospital.connected ? '✅ CONECTADO' : '🟡 SIN CONEXIÓN'}
                            </Badge>
                          </HStack>
                          
                          <HStack spacing={4} fontSize="2xs" wrap="wrap">
                            {hospital.distance && (
                              <Box>
                                <Text fontWeight="bold" color="green.600">
                                  <FaRoad style={{ display: 'inline', marginRight: '2px' }} /> {hospital.distance.toFixed(1)} km
                                </Text>
                                <Text fontSize="2xs" color="gray.500">Distancia</Text>
                              </Box>
                            )}
                            
                            {hospital.estimatedTime && (
                              <Box>
                                <Text fontWeight="bold" color="blue.600">
                                  <FaClock style={{ display: 'inline', marginRight: '2px' }} /> ~{hospital.estimatedTime} min
                                </Text>
                                <Text fontSize="2xs" color="gray.500">Tiempo estimado</Text>
                              </Box>
                            )}
                            
                            {hospital.camasDisponibles && (
                              <Box>
                                <Text fontWeight="bold" color="purple.600">
                                  <FaBed style={{ display: 'inline', marginRight: '2px' }} /> {hospital.camasDisponibles}
                                </Text>
                                <Text fontSize="2xs" color="gray.500">Camas disp.</Text>
                              </Box>
                            )}
                          </HStack>
                          
                          {hospital.especialidades?.length > 0 && (
                            <Text fontSize="2xs" color="gray.600">
                              <FaHospital style={{ display: 'inline', marginRight: '4px' }} /> {hospital.especialidades.slice(0, 3).join(', ')}
                            </Text>
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
    </ChakraProvider>
  );
}