import React, { useState, useRef, useEffect, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  Box, Flex, VStack, HStack, Heading, Input, Textarea, Button, Spinner,
  InputGroup, InputRightElement, List, ListItem, Text, Icon,
  Portal, useToast, Accordion, AccordionItem, AccordionButton,
  AccordionPanel, AccordionIcon, SimpleGrid, IconButton, Select, Tooltip
} from '@chakra-ui/react';
import { CheckCircleIcon, AddIcon, MinusIcon } from '@chakra-ui/icons';
import {
  FaMapMarkerAlt, FaExclamationTriangle, FaUserInjured, FaShieldAlt,
  FaCity, FaChevronDown, FaChevronUp, FaCheck
} from 'react-icons/fa';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ||
  'pk.eyJ1IjoiZXltYXJkMjkiLCJhIjoiY21tcDY4YzNpMGw3bjJzb203YmZyNTVnMyJ9.OvZlnCMfUkUYe6Ib83DUVw';

const DEFAULT_CENTER = { lat: 19.7024, lng: -101.1969 };
const MORELIA_CENTER = { lat: 19.7024, lng: -101.1969 };
const SEARCH_DEBOUNCE_MS = 250;
const SUCCESS_BANNER_MS = 3500;
const UI_RESET_MS = 4000;
const ACK_TIMEOUT_MS = 30000;

const TIPOS_INCIDENTE = [
  'Accidente vehicular', 'Motociclista lesionado', 'Atropellamiento', 'Caída',
  'Agresión', 'Persona inconsciente', 'Dolor torácico', 'Dificultad respiratoria',
  'Convulsiones', 'Quemaduras', 'Intoxicación', 'Otro'
];

const RIESGOS_ESCENA = [
  'Incendio', 'Fuga de gas', 'Cables eléctricos', 'Arma de fuego activa',
  'Derrame de combustible', 'Vehículo en barranco', 'Inundación', 'Material peligroso'
];

const OPCIONES_SINO_NS = ['Sí', 'No', 'N/S'];
const OPCIONES_SINO = ['Sí', 'No'];

const createEmptyPaciente = () => ({
  sexo: '', edad: '', consciente: '', respira: '', sangrado: '', atrapado: ''
});

const formatResumenPaciente = (p, idx) => {
  const parts = [`P${idx + 1}`];
  if (p.sexo) parts.push(p.sexo);
  if (p.edad !== '' && p.edad !== null && p.edad !== undefined) parts.push(`${p.edad} años`);
  else parts.push('Edad desconocida');
  if (p.consciente === 'Sí') parts.push('Consciente');
  else if (p.consciente === 'No') parts.push('Inconsciente');
  if (p.respira === 'Sí') parts.push('Respira');
  else if (p.respira === 'No') parts.push('No respira');
  if (p.sangrado === 'Sí') parts.push('Sangrado');
  if (p.atrapado === 'Sí') parts.push('Atrapado');
  return parts.join(' · ');
};

// Tipos de resultado con etiqueta legible para el dropdown
const PLACE_TYPE_LABEL = {
  address: 'DIRECCIÓN',
  poi: 'LUGAR',
  place: 'COLONIA / ZONA',
  locality: 'LOCALIDAD',
  neighborhood: 'FRACCIONAMIENTO',
  district: 'DISTRITO',
  region: 'REGIÓN',
  country: 'PAÍS',
};

const ReceptorEmergencyForm = ({ wsRef, wsConnected, onEmergencySent, activeAmbulances = [] }) => {
  const toast = useToast();

  const mapContainer = useRef(null);
  const map = useRef(null);
  const searchRequestId = useRef(0);
  const reverseGeocodeRequestId = useRef(0);
  const searchDebounceTimer = useRef(null);
  const skipNextReverseGeocode = useRef(false);
  const ambulanceMarkersRef = useRef({});

  // Estados de Interfaz
  const [activeAccordion, setActiveAccordion] = useState(0);
  const [addressQuery, setAddressQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(DEFAULT_CENTER);

  // Datos del Formulario
  const [referencias, setReferencias] = useState('');
  const [tipoIncidente, setTipoIncidente] = useState('');
  const [otroIncidente, setOtroIncidente] = useState('');
  const [cantidadPacientes, setCantidadPacientes] = useState(1);
  const [pacientes, setPacientes] = useState([createEmptyPaciente()]);
  const [riesgos, setRiesgos] = useState([]);

  // Estado de completado de secciones
  const [seccion1Completa, setSeccion1Completa] = useState(false);
  const [seccion4Revisada, setSeccion4Revisada] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [lastAssignedCallId, setLastAssignedCallId] = useState(null);

  // Validación: al menos 1 paciente con datos mínimos (sexo, consciente, respira)
  const firstPacienteOk = pacientes[0] && pacientes[0].sexo !== '' && pacientes[0].consciente !== '';
  const isFormValid =
    addressQuery.trim() !== '' &&
    tipoIncidente !== '' &&
    cantidadPacientes >= 1 &&
    pacientes.length === cantidadPacientes &&
    firstPacienteOk;

  const isPacienteIniciado = pacientes.some(p =>
    p.sexo !== '' || p.consciente !== '' || p.edad !== '' || p.respira !== ''
  );

  // ==================== GEOLOCALIZACIÓN INVERSA ====================
  const reverseGeocode = useCallback(async (lng, lat) => {
    const reqId = ++reverseGeocodeRequestId.current;
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxgl.accessToken}&language=es&types=address,poi,place`;
      const res = await fetch(url);
      const data = await res.json();
      if (reqId !== reverseGeocodeRequestId.current) return;
      if (data.features?.length > 0) {
        setAddressQuery(data.features[0].place_name);
      }
    } catch (e) {
      console.error('RevGeocode Error:', e);
    }
  }, []);

  // ==================== INICIALIZACIÓN DEL MAPA ====================
  useEffect(() => {
    if (!mapContainer.current) return;
    const mapInstance = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
      zoom: 15,
      attributionControl: false,
    });

    mapInstance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

    mapInstance.on('move', () => {
      const center = mapInstance.getCenter();
      setSelectedLocation({ lat: center.lat, lng: center.lng });
    });

    mapInstance.on('moveend', () => {
      if (skipNextReverseGeocode.current) {
        skipNextReverseGeocode.current = false;
        return;
      }
      const center = mapInstance.getCenter();
      reverseGeocode(center.lng, center.lat);
    });

    map.current = mapInstance;
    return () => mapInstance.remove();
  }, [reverseGeocode]);

  // ==================== MARCADORES DE AMBULANCIAS EN EL MAPA ====================
  useEffect(() => {
    if (!map.current) return;

    const activeIds = new Set();

    activeAmbulances.forEach(amb => {
      // Ocultar las que están en ruta u ocupadas (como se pidió)
      if (amb.status === 'en_ruta' || amb.status === 'ocupado') {
        // Si existía el marcador, lo quitamos
        const existing = ambulanceMarkersRef.current[amb.id];
        if (existing) {
          existing.remove();
          delete ambulanceMarkersRef.current[amb.id];
        }
        return;
      }

      if (!amb.location?.lat || !amb.location?.lng) return;

      activeIds.add(amb.id);
      const color = amb.status === 'disponible' ? '#10b981' : '#64748b';

      let marker = ambulanceMarkersRef.current[amb.id];
      if (!marker) {
        const el = document.createElement('div');
        el.style.cssText = `
          width: 14px; height: 14px; border-radius: 50%;
          background: ${color}; border: 3px solid #09090b;
          box-shadow: 0 0 8px ${color}99; cursor: pointer;
          transition: transform 0.2s;
        `;
        const popup = new mapboxgl.Popup({ offset: 12, closeButton: false }).setHTML(`
          <div style="text-align:center;">
            <strong style="color:${color}; font-size:13px;">${amb.nombre || amb.placa || amb.id}</strong>
            <div style="font-size:11px; color:#a1a1aa; font-weight:700; margin-top:4px;">
              ${(amb.status || '').replace('_', ' ').toUpperCase()}
            </div>
          </div>
        `);
        marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([amb.location.lng, amb.location.lat])
          .setPopup(popup)
          .addTo(map.current);
        ambulanceMarkersRef.current[amb.id] = marker;
      } else {
        marker.setLngLat([amb.location.lng, amb.location.lat]);
        const el = marker.getElement();
        el.style.background = color;
        el.style.boxShadow = `0 0 8px ${color}99`;
      }
    });

    // Limpiar marcadores de ambulancias que ya no están
    Object.keys(ambulanceMarkersRef.current).forEach(id => {
      if (!activeIds.has(id)) {
        ambulanceMarkersRef.current[id].remove();
        delete ambulanceMarkersRef.current[id];
      }
    });
  }, [activeAmbulances]);

  // ==================== BÚSQUEDA PANORÁMICA (Google-like) ====================
  const searchAddresses = useCallback((query) => {
    if (searchDebounceTimer.current) clearTimeout(searchDebounceTimer.current);
    if (!query || query.trim().length < 3) {
      setSearchResults([]);
      setHighlightedIndex(-1);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchDebounceTimer.current = setTimeout(async () => {
      const reqId = ++searchRequestId.current;
      try {
        const bbox = '-101.35,19.55,-101.00,19.85';
        const proximity = '-101.1969,19.7024';
        const q = encodeURIComponent(query.trim());
        // Sin restricción de types → permite POIs, plazas, fraccionamientos, colonias
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${mapboxgl.accessToken}&country=mx&bbox=${bbox}&proximity=${proximity}&limit=8&language=es&fuzzyMatch=true`;
        const res = await fetch(url);
        const data = await res.json();
        if (reqId !== searchRequestId.current) return;
        let results = (data.features || []).map(f => ({
          id: f.id,
          place_name: f.place_name,
          lat: f.center[1],
          lng: f.center[0],
          type: f.place_type?.[0] || 'place',
          relevance: f.relevance || 0,
        }));

        // Fallback: si nada apareció, intentar con "Morelia" pegado
        if (results.length === 0) {
          const q2 = encodeURIComponent(`${query.trim()} Morelia`);
          const url2 = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q2}.json?access_token=${mapboxgl.accessToken}&country=mx&proximity=${proximity}&limit=8&language=es&fuzzyMatch=true`;
          const res2 = await fetch(url2);
          const data2 = await res2.json();
          if (reqId !== searchRequestId.current) return;
          results = (data2.features || []).map(f => ({
            id: f.id,
            place_name: f.place_name,
            lat: f.center[1],
            lng: f.center[0],
            type: f.place_type?.[0] || 'place',
            relevance: f.relevance || 0,
          }));
        }
        setSearchResults(results);
        setHighlightedIndex(results.length > 0 ? 0 : -1);
      } catch (e) {
        if (reqId === searchRequestId.current) setSearchResults([]);
      } finally {
        if (reqId === searchRequestId.current) setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
  }, []);

  const selectSearchResult = useCallback((result) => {
    if (!result) return;
    skipNextReverseGeocode.current = true;
    setAddressQuery(result.place_name);
    setSearchResults([]);
    setHighlightedIndex(-1);
    setSelectedLocation({ lat: result.lat, lng: result.lng });
    map.current?.flyTo({ center: [result.lng, result.lat], zoom: 17 });
  }, []);

  const clearAddress = () => {
    setAddressQuery('');
    setSearchResults([]);
    setHighlightedIndex(-1);
  };

  const handleAddressKeyDown = (e) => {
    if (searchResults.length === 0) {
      if (e.key === 'Escape') setSearchResults([]);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % searchResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 + searchResults.length) % searchResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = highlightedIndex >= 0 ? highlightedIndex : 0;
      if (searchResults[idx]) selectSearchResult(searchResults[idx]);
    } else if (e.key === 'Escape') {
      setSearchResults([]);
      setHighlightedIndex(-1);
    }
  };

  // ==================== VISTA PANORÁMICA ====================
  const handleCityView = () => {
    if (!map.current) return;
    map.current.flyTo({
      center: [MORELIA_CENTER.lng, MORELIA_CENTER.lat],
      zoom: 11.5,
      pitch: 0,
      bearing: 0,
      duration: 1200
    });
  };

  // ==================== HANDLERS DE FORMULARIO ====================
  const handleIncidenteSelect = (tipo) => {
    setTipoIncidente(tipo);
    if (tipo !== 'Otro') setActiveAccordion(2);
  };

  const handleRiesgoToggle = (riesgo) => {
    setRiesgos(prev => prev.includes(riesgo) ? prev.filter(r => r !== riesgo) : [...prev, riesgo]);
  };

  const handlePacienteChange = (idx, campo, valor) => {
    setPacientes(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [campo]: valor };
      return copy;
    });
  };

  const adjustCantidadPacientes = (delta) => {
    setCantidadPacientes(prev => {
      const next = Math.max(1, Math.min(20, prev + delta));
      setPacientes(actuales => {
        if (next > actuales.length) {
          const added = Array(next - actuales.length).fill(0).map(() => createEmptyPaciente());
          return [...actuales, ...added];
        }
        return actuales.slice(0, next);
      });
      return next;
    });
  };

  const resetForm = () => {
    setAddressQuery('');
    setReferencias('');
    setTipoIncidente('');
    setOtroIncidente('');
    setCantidadPacientes(1);
    setPacientes([createEmptyPaciente()]);
    setRiesgos([]);
    setActiveAccordion(0);
    setSeccion1Completa(false);
    setSeccion4Revisada(false);
  };

  // ==================== DESPACHO ====================
  const executeDispatch = () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast({ title: 'SISTEMA OFFLINE', description: 'Reconectando al servidor central.', status: 'error', duration: 4000 });
      return;
    }

    setIsSubmitting(true);
    setSeccion4Revisada(true);

    const requestId = `req_${Date.now()}`;
    const resumenLineas = pacientes.map((p, i) => formatResumenPaciente(p, i));

    // patientInfo compatible: mantiene campos del primer paciente al nivel superior
    // y añade estructura multi-paciente.
    const patientInfo = {
      // ---- Compatibilidad con formato anterior ----
      sexo: pacientes[0]?.sexo || '',
      edad: pacientes[0]?.edad || '',
      consciente: pacientes[0]?.consciente || '',
      respira: pacientes[0]?.respira || '',
      sangrado: pacientes[0]?.sangrado || '',
      atrapado: pacientes[0]?.atrapado || '',
      lesionados: cantidadPacientes,
      // ---- Nueva estructura multi-paciente ----
      cantidad: cantidadPacientes,
      pacientes: pacientes.map(p => ({ ...p })),
      resumen: resumenLineas,
    };

    const payload = {
      type: 'emergency_call',
      requestId,
      location: selectedLocation,
      address: addressQuery,
      referencias,
      emergencyType: tipoIncidente === 'Otro' ? otroIncidente : tipoIncidente,
      patientInfo,
      riesgos,
      timestamp: new Date().toISOString(),
    };

    let ackReceived = false;
    let uiResetDone = false;
    let cleanupTimer = null;

    const finalizeOnAck = (data) => {
      if (ackReceived) return;
      ackReceived = true;

      if (cleanupTimer) clearTimeout(cleanupTimer);
      try { ws.removeEventListener('message', responseHandler); } catch (_) {}

      if (data.type === 'emergency_assigned_ack') {
        setLastAssignedCallId(data.callId);
        setShowSuccessBanner(true);
        setTimeout(() => setShowSuccessBanner(false), SUCCESS_BANNER_MS);
        setIsSubmitting(false);
        resetForm();
      } else if (data.type === 'emergency_assignment_failed') {
        setIsSubmitting(false);
        toast({
          title: 'ALERTA EN ESPERA',
          description: 'Folio generado. No hay unidades disponibles actualmente.',
          status: 'warning',
          duration: 7000
        });
        resetForm();
      }

      if (onEmergencySent) onEmergencySent();
    };

    const responseHandler = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'emergency_assigned_ack' || data.type === 'emergency_assignment_failed') {
          finalizeOnAck(data);
        }
      } catch (_) { /* ignorar */ }
    };

    try {
      ws.send(JSON.stringify(payload));
      ws.addEventListener('message', responseHandler);

      setTimeout(() => {
        if (ackReceived || uiResetDone) return;
        uiResetDone = true;
        setIsSubmitting(false);
        resetForm();
        toast({
          title: 'FOLIO GENERADO',
          description: 'Buscando unidad disponible. Revise el panel de monitoreo.',
          status: 'info',
          duration: 5000
        });
        if (onEmergencySent) onEmergencySent();
      }, UI_RESET_MS);

      cleanupTimer = setTimeout(() => {
        if (ackReceived) return;
        try { ws.removeEventListener('message', responseHandler); } catch (_) {}
      }, ACK_TIMEOUT_MS);
    } catch (error) {
      setIsSubmitting(false);
      toast({ title: 'ERROR CRÍTICO', description: 'Fallo al transmitir. Reintente.', status: 'error', duration: 4000 });
    }
  };

  // ==================== RENDER ====================
  return (
    <Flex h="100%" w="100%" bg="#09090b" direction={{ base: 'column-reverse', xl: 'row' }}>

      {/* ===== PANEL IZQUIERDO: FORMULARIO ACORDEÓN ===== */}
      <Flex w={{ base: '100%', xl: '680px' }} flexShrink={0} direction="column" bg="#09090b" borderRight="1px solid #27272a" h="100%" zIndex={2}>
        <Box p={5} borderBottom="1px solid #27272a" bg="#09090b">
          <Heading fontSize="18px" color="#f8fafc" fontWeight="900" letterSpacing="1px">MATRIZ DE CAPTURA</Heading>
          <Text fontSize="13px" color="#a1a1aa" mt={1}>Utilice la tecla TAB para navegar. Seleccione una opción para auto-avanzar.</Text>
        </Box>

        <Box flex={1} overflowY="auto" sx={{ '&::-webkit-scrollbar': { width: '8px' }, '&::-webkit-scrollbar-thumb': { bg: '#3f3f46', borderRadius: '4px' } }}>
          <Accordion index={[activeAccordion]} onChange={(idx) => setActiveAccordion(idx)} allowToggle>

            {/* 1. REFERENCIAS */}
            <AccordionItem border="none" borderBottom="1px solid #27272a">
              <AccordionButton py={5} bg={activeAccordion === 0 ? '#18181b' : 'transparent'} _hover={{ bg: '#18181b' }}>
                <Box flex="1" textAlign="left">
                  <HStack>
                    <Icon as={FaMapMarkerAlt} color={seccion1Completa ? '#10b981' : (referencias ? '#10b981' : '#a1a1aa')} />
                    <Text fontSize="15px" fontWeight="900" color="#f8fafc">1. REFERENCIAS VISUALES</Text>
                    {seccion1Completa && <Icon as={FaCheck} color="#10b981" boxSize={3} />}
                  </HStack>
                </Box>
                <AccordionIcon color="#a1a1aa" />
              </AccordionButton>
              <AccordionPanel pb={6} bg="#09090b">
                <Text fontSize="12px" color="#a1a1aa" mb={2} fontWeight="700" textTransform="uppercase">Referencias de acceso (Opcional)</Text>
                <Textarea
                  w="100%" size="lg" bg="#18181b" border="1px solid #3f3f46" color="white" rows={3}
                  value={referencias} onChange={e => setReferencias(e.target.value)}
                  placeholder="Ej. Frente al parque central, portón negro..." _focus={{ borderColor: '#38bdf8', boxShadow: 'none' }}
                />
                <Button
                  mt={4} w="100%" h="50px" bg="#3f3f46" color="white" fontWeight="900" letterSpacing="1px"
                  _hover={{ bg: '#dc2626', transform: 'scale(1.01)' }}
                  _focus={{ bg: '#dc2626', outline: 'none', boxShadow: '0 0 0 3px rgba(220,38,38,0.4)' }}
                  onClick={() => { setSeccion1Completa(true); setActiveAccordion(1); }}
                  transition="all 0.15s"
                >
                  CONFIRMAR Y CONTINUAR
                </Button>
              </AccordionPanel>
            </AccordionItem>

            {/* 2. TIPO DE INCIDENTE */}
            <AccordionItem border="none" borderBottom="1px solid #27272a">
              <AccordionButton py={5} bg={activeAccordion === 1 ? '#18181b' : 'transparent'} _hover={{ bg: '#18181b' }}>
                <Box flex="1" textAlign="left">
                  <HStack>
                    <Icon as={FaExclamationTriangle} color={tipoIncidente ? '#10b981' : '#a1a1aa'} />
                    <Text fontSize="15px" fontWeight="900" color="#f8fafc">2. TIPO DE INCIDENTE *</Text>
                  </HStack>
                </Box>
                <AccordionIcon color="#a1a1aa" />
              </AccordionButton>
              <AccordionPanel pb={6} bg="#09090b">
                <SimpleGrid columns={3} spacing={3} gap={3}>
                  {TIPOS_INCIDENTE.map(tipo => (
                    <Button key={tipo} size="md" whiteSpace="normal" height="100%" minH="60px"
                      bg={tipoIncidente === tipo ? '#0284c7' : '#18181b'} color={tipoIncidente === tipo ? 'white' : '#d4d4d8'}
                      border="1px solid" borderColor={tipoIncidente === tipo ? '#38bdf8' : '#3f3f46'}
                      onClick={() => handleIncidenteSelect(tipo)} _hover={{ bg: tipoIncidente === tipo ? '#0369a1' : '#27272a' }}
                      _focus={{ boxShadow: '0 0 0 3px rgba(2,132,199,0.5)' }}
                      fontSize="13px" fontWeight="800"
                    >
                      {tipo}
                    </Button>
                  ))}
                </SimpleGrid>
                {tipoIncidente === 'Otro' && (
                  <VStack mt={4} w="100%">
                    <Input
                      size="lg" bg="#18181b" border="1px solid #3f3f46" color="white"
                      placeholder="Especifique el incidente..." value={otroIncidente}
                      onChange={e => setOtroIncidente(e.target.value)}
                      _focus={{ borderColor: '#38bdf8', boxShadow: 'none' }}
                    />
                    <Button
                      w="100%" h="50px" bg="#3f3f46" color="white" fontWeight="900" letterSpacing="1px"
                      _hover={{ bg: '#dc2626', transform: 'scale(1.01)' }}
                      _focus={{ bg: '#dc2626', outline: 'none', boxShadow: '0 0 0 3px rgba(220,38,38,0.4)' }}
                      onClick={() => setActiveAccordion(2)} transition="all 0.15s"
                    >
                      CONTINUAR
                    </Button>
                  </VStack>
                )}
              </AccordionPanel>
            </AccordionItem>

            {/* 3. PERSONAS AFECTADAS (MULTI-PACIENTE) */}
            <AccordionItem border="none" borderBottom="1px solid #27272a">
              <AccordionButton py={5} bg={activeAccordion === 2 ? '#18181b' : 'transparent'} _hover={{ bg: '#18181b' }}>
                <Box flex="1" textAlign="left">
                  <HStack>
                    <Icon as={FaUserInjured} color={isPacienteIniciado ? '#10b981' : '#a1a1aa'} />
                    <Text fontSize="15px" fontWeight="900" color="#f8fafc">3. PERSONAS AFECTADAS *</Text>
                  </HStack>
                </Box>
                <AccordionIcon color="#a1a1aa" />
              </AccordionButton>
              <AccordionPanel pb={6} bg="#09090b">
                {/* Cantidad de afectados */}
                <Box mb={6}>
                  <Text fontSize="12px" color="#a1a1aa" mb={2} fontWeight="800">¿CUÁNTAS PERSONAS ESTÁN AFECTADAS?</Text>
                  <HStack w="100%">
                    <IconButton
                      size="lg" icon={<MinusIcon />} aria-label="Menos personas"
                      onClick={() => adjustCantidadPacientes(-1)}
                      bg="#27272a" color="white" _hover={{ bg: '#3f3f46' }}
                      isDisabled={cantidadPacientes <= 1}
                    />
                    <Flex flex={1} bg="#18181b" border="2px solid" borderColor={cantidadPacientes > 1 ? '#f59e0b' : '#3f3f46'} h="56px" borderRadius="md" alignItems="center" justifyContent="center">
                      <Text fontSize="26px" fontWeight="900" color={cantidadPacientes > 1 ? '#f59e0b' : 'white'}>{cantidadPacientes}</Text>
                      <Text fontSize="13px" fontWeight="800" color="#a1a1aa" ml={2}>{cantidadPacientes === 1 ? 'PERSONA' : 'PERSONAS'}</Text>
                    </Flex>
                    <IconButton
                      size="lg" icon={<AddIcon />} aria-label="Más personas"
                      onClick={() => adjustCantidadPacientes(1)}
                      bg="#27272a" color="white" _hover={{ bg: '#3f3f46' }}
                    />
                  </HStack>
                  {cantidadPacientes > 1 && (
                    <Text fontSize="11px" color="#f59e0b" mt={2} fontWeight="800" letterSpacing="0.5px">
                      INCIDENTE MÚLTIPLE — REGISTRE CADA PERSONA AFECTADA
                    </Text>
                  )}
                </Box>

                {/* Fichas: 1 paciente → ficha simple; 2+ → tarjetas colapsables */}
                {cantidadPacientes === 1 ? (
                  <PacienteFields
                    paciente={pacientes[0]}
                    onChange={(campo, valor) => handlePacienteChange(0, campo, valor)}
                  />
                ) : (
                  <VStack spacing={3} align="stretch">
                    {pacientes.slice(0, cantidadPacientes).map((p, idx) => (
                      <PacienteCardCompacto
                        key={idx}
                        idx={idx}
                        paciente={p}
                        onChange={(campo, valor) => handlePacienteChange(idx, campo, valor)}
                        defaultOpen={idx === 0}
                      />
                    ))}
                  </VStack>
                )}

                <Button
                  mt={6} w="100%" h="50px" bg="#3f3f46" color="white" fontWeight="900" letterSpacing="1px"
                  _hover={{ bg: '#dc2626', transform: 'scale(1.01)' }}
                  _focus={{ bg: '#dc2626', outline: 'none', boxShadow: '0 0 0 3px rgba(220,38,38,0.4)' }}
                  onClick={() => setActiveAccordion(3)} transition="all 0.15s"
                >
                  CONFIRMAR Y CONTINUAR
                </Button>
              </AccordionPanel>
            </AccordionItem>

            {/* 4. RIESGOS EN LA ESCENA */}
            <AccordionItem border="none">
              <AccordionButton
                py={5}
                bg={activeAccordion === 3 ? '#18181b' : 'transparent'}
                _hover={{ bg: '#18181b' }}
                onClick={() => setSeccion4Revisada(true)}
              >
                <Box flex="1" textAlign="left">
                  <HStack>
                    <Icon as={FaShieldAlt} color={riesgos.length > 0 ? '#f59e0b' : (seccion4Revisada ? '#10b981' : '#a1a1aa')} />
                    <Text fontSize="15px" fontWeight="900" color="#f8fafc">4. RIESGOS EN LA ESCENA</Text>
                    {seccion4Revisada && riesgos.length === 0 && <Icon as={FaCheck} color="#10b981" boxSize={3} />}
                  </HStack>
                </Box>
                <AccordionIcon color="#a1a1aa" />
              </AccordionButton>
              <AccordionPanel pb={6} bg="#09090b">
                <SimpleGrid columns={2} spacing={3}>
                  {RIESGOS_ESCENA.map(riesgo => {
                    const isSelected = riesgos.includes(riesgo);
                    return (
                      <Button key={riesgo} onClick={() => handleRiesgoToggle(riesgo)}
                        size="lg" justifyContent="flex-start" px={4} whiteSpace="normal" height="auto" minH="60px"
                        bg={isSelected ? '#f59e0b' : '#18181b'} color={isSelected ? '#000000' : '#a1a1aa'}
                        border={isSelected ? '2px solid #f59e0b' : '1px solid #3f3f46'}
                        _hover={{ bg: isSelected ? '#d97706' : '#27272a' }}
                        _focus={{ boxShadow: '0 0 0 3px rgba(245,158,11,0.5)' }} transition="all 0.1s"
                      >
                        <Text fontSize="14px" fontWeight={isSelected ? '900' : '600'}>{riesgo}</Text>
                      </Button>
                    );
                  })}
                </SimpleGrid>
              </AccordionPanel>
            </AccordionItem>
          </Accordion>
        </Box>

        {/* BOTÓN DE DESPACHO GIGANTE */}
        <Box p={6} bg="#09090b" borderTop="1px solid #27272a" boxShadow="0 -10px 30px rgba(0,0,0,0.5)">
          <Button
            w="100%" h="80px" bg={isFormValid ? '#dc2626' : '#18181b'} color={isFormValid ? 'white' : '#52525b'}
            borderRadius="xl" fontSize="18px" fontWeight="900" letterSpacing="2px"
            _hover={{ bg: isFormValid ? '#b91c1c' : '#18181b', transform: isFormValid ? 'translateY(-2px)' : 'none' }}
            _focus={{ boxShadow: '0 0 0 4px rgba(220,38,38,0.5)' }} transition="all 0.2s"
            isDisabled={!wsConnected || !isFormValid || isSubmitting}
            isLoading={isSubmitting} loadingText="DETONANDO DESPACHO..." onClick={executeDispatch}
          >
            {isFormValid ? 'AUTORIZAR DESPACHO' : 'COMPLETE LOS CAMPOS REQUERIDOS'}
          </Button>
        </Box>
      </Flex>

      {/* ===== PANEL DERECHO: MAPA ===== */}
      <Box flex={1} position="relative" h={{ base: '50vh', xl: '100%' }}>

        {/* BUSCADOR PANORÁMICO */}
        <Box position="absolute" top={0} left={0} right={0} zIndex={10} bg="rgba(9,9,11,0.9)" borderBottom="1px solid #27272a" p={4} backdropFilter="blur(10px)">
          <InputGroup size="lg" w="100%" h="60px">
            <Input
              h="60px" w="100%"
              value={addressQuery}
              onChange={(e) => { setAddressQuery(e.target.value); searchAddresses(e.target.value); }}
              onKeyDown={handleAddressKeyDown}
              bg="#18181b" border="2px solid" borderColor={addressQuery ? '#3f3f46' : '#ef4444'}
              color="white" borderRadius="md" fontSize="18px" fontWeight="800"
              placeholder="Busque lugar, plaza, fraccionamiento, calle..."
              _focus={{ borderColor: '#38bdf8', boxShadow: 'none' }}
              autoComplete="off"
            />
            {isSearching && (
              <InputRightElement h="60px">
                <Spinner color="#38bdf8" size="sm" />
              </InputRightElement>
            )}
          </InputGroup>

          {searchResults.length > 0 && (
            <List
              w="100%" mt={2} bg="#18181b" border="1px solid #3f3f46"
              borderRadius="md" shadow="2xl" maxH="400px" overflowY="auto"
            >
              {searchResults.map((res, idx) => {
                const isHighlighted = idx === highlightedIndex;
                const typeLabel = PLACE_TYPE_LABEL[res.type] || 'LUGAR';
                return (
                  <ListItem
                    key={res.id}
                    p={4}
                    borderBottom={idx < searchResults.length - 1 ? '1px solid #27272a' : 'none'}
                    cursor="pointer"
                    bg={isHighlighted ? '#27272a' : 'transparent'}
                    _hover={{ bg: '#27272a' }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => selectSearchResult(res)}
                  >
                    <HStack align="start" spacing={3}>
                      <Icon as={FaMapMarkerAlt} color={isHighlighted ? '#38bdf8' : '#ef4444'} boxSize={5} mt={0.5} />
                      <VStack align="start" spacing={1} flex={1}>
                        <HStack spacing={2}>
                          <Box px={2} py={0.5} bg="#27272a" borderRadius="sm">
                            <Text fontSize="9px" fontWeight="900" color="#38bdf8" letterSpacing="0.5px">{typeLabel}</Text>
                          </Box>
                        </HStack>
                        <Text fontSize="15px" fontWeight="700" color="#e4e4e7" noOfLines={2} textAlign="left">
                          {res.place_name}
                        </Text>
                      </VStack>
                    </HStack>
                  </ListItem>
                );
              })}
            </List>
          )}
        </Box>

        <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

        {/* Mira central estilo GPS */}
        <Box position="absolute" top="50%" left="50%" transform="translate(-50%, -50%)" pointerEvents="none" zIndex={5}>
          <Box w="50px" h="50px" border="2px solid #ef4444" borderRadius="50%" display="flex" alignItems="center" justifyContent="center" bg="rgba(239,68,68,0.15)">
            <Box w="10px" h="10px" bg="#ef4444" borderRadius="50%" />
          </Box>
        </Box>

        {/* Botón vista panorámica (Morelia) */}
        <Box position="absolute" bottom={100} right={16} zIndex={8}>
          <Tooltip label="Ver Morelia completa" placement="left" hasArrow bg="#18181b" color="white" fontWeight="bold">
            <IconButton
              aria-label="Vista panorámica"
              icon={<FaCity />}
              onClick={handleCityView}
              w="50px" h="50px"
              bg="#18181b" color="#a1a1aa"
              border="1px solid #27272a"
              borderRadius="xl"
              _hover={{ bg: '#27272a', color: '#38bdf8', borderColor: '#38bdf8' }}
              transition="all 0.2s"
            />
          </Tooltip>
        </Box>
      </Box>

      {/* BANNER DE ÉXITO */}
      <Portal>
        {showSuccessBanner && (
          <Box position="fixed" top="100px" left="50%" transform="translateX(-50%)" bg="#10b981" color="white" px={8} py={5} borderRadius="xl" zIndex={20000} display="flex" alignItems="center" gap={5} boxShadow="0 20px 40px rgba(16,185,129,0.4)">
            <Icon as={CheckCircleIcon} boxSize={8} />
            <VStack align="start" spacing={1}>
              <Text fontWeight="900" fontSize="16px" letterSpacing="1px">FOLIO ASIGNADO</Text>
              <Text fontSize="13px" fontWeight="700" color="#ecfdf5">{lastAssignedCallId ? `ID: ${lastAssignedCallId}` : 'Transmitido'}</Text>
            </VStack>
          </Box>
        )}
      </Portal>
    </Flex>
  );
};

// ==================== SUB-COMPONENTES ====================

/** Ficha de paciente simple (usada cuando hay 1 sola persona afectada). */
const PacienteFields = ({ paciente, onChange }) => (
  <SimpleGrid columns={2} spacingX={6} spacingY={6}>
    <Box>
      <Text fontSize="12px" color="#a1a1aa" mb={2} fontWeight="800">SEXO</Text>
      <Select size="lg" bg="#18181b" borderColor="#3f3f46" color="white" _focus={{ borderColor: '#38bdf8' }} value={paciente.sexo} onChange={e => onChange('sexo', e.target.value)}>
        <option style={{ background: '#18181b' }} value="">Seleccionar...</option>
        <option style={{ background: '#18181b' }} value="Hombre">Hombre</option>
        <option style={{ background: '#18181b' }} value="Mujer">Mujer</option>
        <option style={{ background: '#18181b' }} value="N/S">No se sabe</option>
      </Select>
    </Box>
    <Box>
      <Text fontSize="12px" color="#a1a1aa" mb={2} fontWeight="800">EDAD APARENTE</Text>
      <Input size="lg" bg="#18181b" border="1px solid #3f3f46" color="white" type="number" placeholder="Ej. 35" value={paciente.edad} onChange={e => onChange('edad', e.target.value)} _focus={{ borderColor: '#38bdf8', boxShadow: 'none' }} />
    </Box>
    <Box>
      <Text fontSize="12px" color="#a1a1aa" mb={2} fontWeight="800">¿CONSCIENTE?</Text>
      <Select size="lg" bg="#18181b" borderColor="#3f3f46" color="white" _focus={{ borderColor: '#38bdf8' }} value={paciente.consciente} onChange={e => onChange('consciente', e.target.value)}>
        <option style={{ background: '#18181b' }} value="">Seleccionar...</option>
        {OPCIONES_SINO_NS.map(o => <option key={o} style={{ background: '#18181b' }} value={o}>{o === 'N/S' ? 'No se sabe' : o}</option>)}
      </Select>
    </Box>
    <Box>
      <Text fontSize="12px" color="#a1a1aa" mb={2} fontWeight="800">¿RESPIRA?</Text>
      <Select size="lg" bg="#18181b" borderColor="#3f3f46" color="white" _focus={{ borderColor: '#38bdf8' }} value={paciente.respira} onChange={e => onChange('respira', e.target.value)}>
        <option style={{ background: '#18181b' }} value="">Seleccionar...</option>
        {OPCIONES_SINO_NS.map(o => <option key={o} style={{ background: '#18181b' }} value={o}>{o === 'N/S' ? 'No se sabe' : o}</option>)}
      </Select>
    </Box>
    <Box>
      <Text fontSize="12px" color="#a1a1aa" mb={2} fontWeight="800">¿SANGRADO?</Text>
      <Select size="lg" bg="#18181b" borderColor="#3f3f46" color="white" _focus={{ borderColor: '#38bdf8' }} value={paciente.sangrado} onChange={e => onChange('sangrado', e.target.value)}>
        <option style={{ background: '#18181b' }} value="">Seleccionar...</option>
        {OPCIONES_SINO_NS.map(o => <option key={o} style={{ background: '#18181b' }} value={o}>{o === 'N/S' ? 'No se sabe' : o}</option>)}
      </Select>
    </Box>
    <Box>
      <Text fontSize="12px" color="#a1a1aa" mb={2} fontWeight="800">¿ATRAPADO / PRENSADO?</Text>
      <Select size="lg" bg="#18181b" borderColor="#3f3f46" color="white" _focus={{ borderColor: '#38bdf8' }} value={paciente.atrapado} onChange={e => onChange('atrapado', e.target.value)}>
        <option style={{ background: '#18181b' }} value="">Seleccionar...</option>
        {OPCIONES_SINO.map(o => <option key={o} style={{ background: '#18181b' }} value={o}>{o}</option>)}
      </Select>
    </Box>
  </SimpleGrid>
);

/** Tarjeta compacta colapsable para el modo multi-paciente. */
const PacienteCardCompacto = ({ idx, paciente, onChange, defaultOpen }) => {
  const [open, setOpen] = useState(!!defaultOpen);
  const resumen = formatResumenPaciente(paciente, idx);
  const isEmpty = !paciente.sexo && !paciente.consciente && !paciente.edad;
  const isComplete = !!paciente.sexo && !!paciente.consciente;

  return (
    <Box bg="#18181b" border="1px solid" borderColor={isComplete ? '#10b981' : '#3f3f46'} borderRadius="xl" overflow="hidden">
      <Flex
        px={4} py={3}
        align="center" justify="space-between"
        cursor="pointer"
        onClick={() => setOpen(o => !o)}
        _hover={{ bg: '#27272a' }}
        transition="all 0.15s"
      >
        <HStack spacing={3} flex={1} minW={0}>
          <Box
            px={3} py={1}
            bg={isComplete ? '#10b981' : '#3f3f46'}
            color={isComplete ? 'white' : '#a1a1aa'}
            borderRadius="md"
            fontSize="12px" fontWeight="900"
          >
            P{idx + 1}
          </Box>
          <Text fontSize="14px" fontWeight="800" color={isEmpty ? '#a1a1aa' : '#f8fafc'} noOfLines={1} flex={1}>
            {isEmpty ? 'Sin datos aún' : resumen.replace(/^P\d+ · /, '')}
          </Text>
        </HStack>
        <Icon as={open ? FaChevronUp : FaChevronDown} color="#a1a1aa" boxSize={3} />
      </Flex>
      {open && (
        <Box px={4} pb={4} pt={1} borderTop="1px solid #27272a">
          <Box mt={4}>
            <PacienteFields paciente={paciente} onChange={onChange} />
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default ReceptorEmergencyForm;