// src/components/receptor/ReceptorEmergencyForm.jsx — VERSIÓN MEJORADA Y COMPLETA
// Mejoras:
//   - Recibe wsRef (ref) en lugar de ws (state) para evitar stale closures
//   - callId ya NO se genera en el cliente; el servidor lo asigna y lo devuelve en el ACK
//   - Se usa requestId temporal para correlacionar envío con respuesta del servidor
//   - Manejo de respuesta 'emergency_assigned_ack' y 'emergency_assignment_failed' interno
//   - Compatibilidad total con el nuevo websocket-server.js

import React, { useState, useRef, useEffect, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  Box, Flex, VStack, HStack, Heading, Input, Textarea, Button, Spinner,
  InputGroup, InputRightElement, List, ListItem, Text, Icon, Grid, GridItem,
  Divider, ButtonGroup, Accordion, AccordionItem, AccordionButton,
  AccordionPanel, AccordionIcon, NumberInput, NumberInputField, Portal, useToast
} from '@chakra-ui/react';
import { SearchIcon, CloseIcon, CheckCircleIcon } from '@chakra-ui/icons';
import {
  FaMapMarkerAlt, FaHeartbeat, FaCarCrash, FaFire, FaBriefcaseMedical,
  FaLungs, FaSkullCrossbones, FaBaby, FaFistRaised, FaExclamationCircle, FaEllipsisH
} from 'react-icons/fa';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ||
  'pk.eyJ1IjoiZXltYXJkMjkiLCJhIjoiY21tcDY4YzNpMGw3bjJzb203YmZyNTVnMyJ9.OvZlnCMfUkUYe6Ib83DUVw';

const DEFAULT_CENTER       = { lat: 19.7024, lng: -101.1969 }; // Morelia
const SEARCH_DEBOUNCE_MS   = 250;
const SUCCESS_BANNER_MS    = 3500;

const EMERGENCY_TYPES = [
  { label: 'Accidente Tránsito',   icon: FaCarCrash        },
  { label: 'Incendio Estructural', icon: FaFire            },
  { label: 'Paro Cardíaco',        icon: FaHeartbeat       },
  { label: 'Trauma Grave',         icon: FaBriefcaseMedical},
  { label: 'Dif. Respiratoria',    icon: FaLungs           },
  { label: 'Intoxicación',         icon: FaSkullCrossbones },
  { label: 'Parto en Curso',       icon: FaBaby            },
  { label: 'Violencia/Agresión',   icon: FaFistRaised      },
  { label: 'Intento Suicidio',     icon: FaExclamationCircle},
  { label: 'Indeterminado',        icon: FaEllipsisH       },
];

const QUICK_NOTES = [
  'Vía Pública', 'Interior Domicilio', 'Escena Insegura',
  'Múltiples Víctimas', 'Prensado', 'Arma de Fuego',
];

// ---------- PROP wsRef: { current: WebSocket | null } ----------
const ReceptorEmergencyForm = ({ wsRef, wsConnected, onEmergencySent }) => {
  const toast = useToast();

  // Refs para lógica interna
  const mapContainer              = useRef(null);
  const map                       = useRef(null);
  const searchRequestId           = useRef(0);
  const reverseGeocodeRequestId   = useRef(0);
  const searchDebounceTimer       = useRef(null);
  const skipNextReverseGeocode    = useRef(false);
  const pendingDispatch            = useRef(null); // requestId en vuelo

  // Estado del mapa y búsqueda
  const [addressQuery, setAddressQuery]     = useState('');
  const [searchResults, setSearchResults]   = useState([]);
  const [isSearching, setIsSearching]       = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(DEFAULT_CENTER);

  // Estado del formulario
  const [emergencyType, setEmergencyType]       = useState('');
  const [patientAge, setPatientAge]             = useState('');
  const [patientSex, setPatientSex]             = useState('');
  const [patientCondition, setPatientCondition] = useState('');
  const [notes, setNotes]                       = useState('');
  const [isSubmitting, setIsSubmitting]         = useState(false);
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [lastAssignedCallId, setLastAssignedCallId] = useState(null);

  // Acordeón
  const [expandedIndices, setExpandedIndices] = useState([0]);

  // Validación
  const isFormValid = emergencyType !== '' &&
    patientCondition.trim().length >= 3 &&
    addressQuery.trim() !== '';

  // ==================== MAPA ====================
  const reverseGeocode = useCallback(async (lng, lat) => {
    const reqId = ++reverseGeocodeRequestId.current;
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxgl.accessToken}&language=es&types=address,poi,place`;
      const res  = await fetch(url);
      const data = await res.json();
      if (reqId !== reverseGeocodeRequestId.current) return;
      if (data.features?.length > 0) setAddressQuery(data.features[0].place_name);
    } catch (e) {
      console.error('RevGeocode Error:', e);
    }
  }, []);

  useEffect(() => {
    if (!mapContainer.current) return;

    const mapInstance = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
      zoom: 16,
      attributionControl: false,
    });

    mapInstance.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      'bottom-right'
    );

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

  // ==================== BÚSQUEDA DE DIRECCIONES ====================
  const searchAddresses = useCallback((query) => {
    if (searchDebounceTimer.current) clearTimeout(searchDebounceTimer.current);
    if (!query || query.trim().length < 3) {
      setSearchResults([]); setIsSearching(false); return;
    }
    setIsSearching(true);
    searchDebounceTimer.current = setTimeout(async () => {
      const reqId = ++searchRequestId.current;
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query.trim())}.json?access_token=${mapboxgl.accessToken}&country=mx&limit=5&language=es`;
        const res  = await fetch(url);
        const data = await res.json();
        if (reqId !== searchRequestId.current) return;
        setSearchResults((data.features || []).map(f => ({
          id: f.id, place_name: f.place_name, lat: f.center[1], lng: f.center[0],
        })));
      } catch (e) {
        if (reqId === searchRequestId.current) setSearchResults([]);
      } finally {
        if (reqId === searchRequestId.current) setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
  }, []);

  const selectSearchResult = useCallback((result) => {
    skipNextReverseGeocode.current = true;
    setAddressQuery(result.place_name);
    setSearchResults([]);
    setSelectedLocation({ lat: result.lat, lng: result.lng });
    map.current?.flyTo({ center: [result.lng, result.lat], zoom: 17 });
  }, []);

  const clearAddress = useCallback(() => {
    setAddressQuery('');
    setSearchResults([]);
  }, []);

  // ==================== ACORDEÓN ====================
  const handleSelectType = useCallback((type) => {
    setEmergencyType(type);
    setExpandedIndices([1]);
  }, []);

  const handleConfirmSection2 = useCallback(() => {
    if (patientCondition.trim().length >= 3) setExpandedIndices([2]);
  }, [patientCondition]);

  const handleQuickNote = useCallback((note) => {
    setNotes(prev => prev ? `${prev} | ${note}` : note);
  }, []);

  // ==================== ENVÍO ====================
  const resetForm = useCallback(() => {
    setEmergencyType('');
    setPatientAge('');
    setPatientSex('');
    setPatientCondition('');
    setNotes('');
    setExpandedIndices([0]);
  }, []);

  const executeDispatch = useCallback(async () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast({
        title: 'Sin conexión',
        description: 'No se puede enviar: el WebSocket no está abierto.',
        status: 'error', duration: 5000, isClosable: true, position: 'top-right',
      });
      return;
    }

    setIsSubmitting(true);

    // requestId para correlacionar respuesta (el callId real lo genera el servidor)
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    pendingDispatch.current = requestId;

    const payload = {
      type: 'emergency_call',
      requestId,                           // correlación cliente-servidor
      location: selectedLocation,
      address: addressQuery || 'Sin dirección registrada',
      emergencyType,
      patientInfo: { age: patientAge, sex: patientSex, condition: patientCondition },
      notes,
      timestamp: new Date().toISOString(),
    };

    console.log('📤 Enviando emergencia:', payload);

    try {
      ws.send(JSON.stringify(payload));

      // Escuchar la respuesta del servidor (ACK con callId real)
      const responseHandler = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Solo procesar si es la respuesta a ESTE envío
          if (
            data.type === 'emergency_assigned_ack' ||
            data.type === 'emergency_assignment_failed'
          ) {
            ws.removeEventListener('message', responseHandler);
            clearTimeout(responseTimeout);
            setIsSubmitting(false);
            pendingDispatch.current = null;

            if (data.type === 'emergency_assigned_ack') {
              setLastAssignedCallId(data.callId);
              setShowSuccessBanner(true);
              setTimeout(() => setShowSuccessBanner(false), SUCCESS_BANNER_MS);
              resetForm();
              if (onEmergencySent) onEmergencySent();
            } else {
              // Fallo — el folio queda en espera, pero igual limpiar el form
              toast({
                title: '⚠️ Sin unidad disponible',
                description: `${data.message || 'Folio creado en lista de espera.'}`,
                status: 'warning', duration: 7000, isClosable: true, position: 'top-right',
              });
              setShowSuccessBanner(true); // banner verde con callId aunque esté en espera
              setTimeout(() => setShowSuccessBanner(false), SUCCESS_BANNER_MS);
              resetForm();
              if (onEmergencySent) onEmergencySent();
            }
          }
        } catch { /* ignorar mensajes no JSON */ }
      };

      // Timeout de seguridad: si el servidor no responde en 8s, limpiar estado
      const responseTimeout = setTimeout(() => {
        ws.removeEventListener('message', responseHandler);
        setIsSubmitting(false);
        pendingDispatch.current = null;
        toast({
          title: 'Tiempo de espera agotado',
          description: 'No se recibió confirmación del servidor. Verifique la conexión.',
          status: 'warning', duration: 6000, isClosable: true, position: 'top-right',
        });
      }, 8000);

      ws.addEventListener('message', responseHandler);

    } catch (error) {
      console.error('❌ Error al enviar:', error);
      setIsSubmitting(false);
      pendingDispatch.current = null;
      toast({
        title: 'Error de envío',
        description: error.message || 'No se pudo enviar la emergencia.',
        status: 'error', duration: 5000, isClosable: true, position: 'top-right',
      });
    }
  }, [
    wsRef, selectedLocation, addressQuery, emergencyType,
    patientAge, patientSex, patientCondition, notes,
    toast, resetForm, onEmergencySent,
  ]);

  // ==================== RENDER ====================
  return (
    <Flex h="100%" w="100%" bg="#000000" direction={{ base: 'column', lg: 'row' }}>

      {/* ===== PANEL IZQUIERDO: FORMULARIO ===== */}
      <Flex
        w={{ base: '100%', lg: '450px', xl: '540px' }}
        flexShrink={0} direction="column" bg="#0a0a0a"
        borderRight={{ lg: '1px solid #262626' }}
        borderBottom={{ base: '1px solid #262626', lg: 'none' }}
        h={{ base: '60vh', lg: '100%' }}
      >
        {/* Header */}
        <Box p={5} borderBottom="1px solid #262626" bg="#171717">
          <Heading fontSize="15px" color="#e5e5e5" fontWeight="900" letterSpacing="1px" textTransform="uppercase">
            Matriz de Captura
          </Heading>
          <Text
            fontSize="11px" fontFamily="mono" mt={1} fontWeight="bold"
            color={isFormValid ? '#10b981' : '#ef4444'}
          >
            {isFormValid ? '✓ REQUISITOS CUMPLIDOS' : '⚠ SE REQUIEREN DATOS OBLIGATORIOS'}
          </Text>
        </Box>

        {/* Acordeón scrollable */}
        <Box
          flex={1} overflowY="auto"
          sx={{
            '&::-webkit-scrollbar': { width: '5px' },
            '&::-webkit-scrollbar-thumb': { bg: '#404040', borderRadius: '4px' },
          }}
        >
          <Accordion
            index={expandedIndices}
            onChange={(idx) => setExpandedIndices(idx)}
            allowMultiple
          >

            {/* ── SECCIÓN 1: CLASIFICACIÓN TÁCTICA ── */}
            <AccordionItem border="none" borderBottom="1px solid #262626">
              <h2>
                <AccordionButton
                  py={4}
                  bg={emergencyType ? '#1e293b' : '#171717'}
                  _hover={{ bg: '#262626' }}
                >
                  <Box as="span" flex="1" textAlign="left" fontSize="12px" fontWeight="bold"
                    color={emergencyType ? '#38bdf8' : '#e5e5e5'} letterSpacing="1px"
                  >
                    1. CLASIFICACIÓN TÁCTICA
                    {emergencyType && (
                      <Text as="span" color="#10b981" ml={2} fontWeight="900">[{emergencyType}]</Text>
                    )}
                  </Box>
                  <AccordionIcon color="#a3a3a3" />
                </AccordionButton>
              </h2>
              <AccordionPanel pb={5} bg="#0a0a0a">
                <Grid templateColumns={{ base: 'repeat(1,1fr)', sm: 'repeat(2,1fr)' }} gap={3}>
                  {EMERGENCY_TYPES.map((t) => (
                    <GridItem key={t.label}>
                      <Button
                        w="100%" h="44px" justifyContent="flex-start" borderRadius="md"
                        bg={emergencyType === t.label ? '#0284c7' : '#171717'}
                        color={emergencyType === t.label ? '#ffffff' : '#a3a3a3'}
                        border="1px solid"
                        borderColor={emergencyType === t.label ? '#38bdf8' : '#262626'}
                        _hover={{ bg: emergencyType === t.label ? '#0284c7' : '#262626' }}
                        onClick={() => handleSelectType(t.label)}
                        px={4}
                      >
                        <Icon as={t.icon} mr={3} boxSize={4} />
                        <Text fontSize="12px" fontWeight="bold" noOfLines={1}>{t.label}</Text>
                      </Button>
                    </GridItem>
                  ))}
                </Grid>
              </AccordionPanel>
            </AccordionItem>

            {/* ── SECCIÓN 2: DATOS DEL OBJETIVO ── */}
            <AccordionItem border="none" borderBottom="1px solid #262626">
              <h2>
                <AccordionButton
                  py={4}
                  bg={patientCondition.length >= 3 ? '#1e293b' : '#171717'}
                  _hover={{ bg: '#262626' }}
                >
                  <Box as="span" flex="1" textAlign="left" fontSize="12px" fontWeight="bold"
                    color={patientCondition.length >= 3 ? '#38bdf8' : '#e5e5e5'} letterSpacing="1px"
                  >
                    2. DATOS DEL OBJETIVO
                    {patientCondition.length >= 3 && (
                      <Text as="span" color="#10b981" ml={2}>[✓]</Text>
                    )}
                  </Box>
                  <AccordionIcon color="#a3a3a3" />
                </AccordionButton>
              </h2>
              <AccordionPanel pb={5} bg="#0a0a0a">
                <HStack spacing={4} mb={4}>
                  <Box flex={1}>
                    <Text fontSize="11px" color="#737373" mb={2} textTransform="uppercase" fontWeight="bold">
                      Edad (0-120)
                    </Text>
                    <NumberInput
                      value={patientAge}
                      onChange={(v) => setPatientAge(v)}
                      min={0} max={120}
                      clampValueOnBlur keepWithinRange
                    >
                      <NumberInputField
                        bg="#171717" border="1px solid #262626" color="#e5e5e5"
                        borderRadius="md" h="44px" fontSize="14px" fontFamily="mono"
                        placeholder="Años"
                        _focus={{ borderColor: '#38bdf8', boxShadow: 'none' }}
                      />
                    </NumberInput>
                  </Box>
                  <Box flex={2}>
                    <Text fontSize="11px" color="#737373" mb={2} textTransform="uppercase" fontWeight="bold">
                      Sexo
                    </Text>
                    <ButtonGroup isAttached w="100%" variant="outline">
                      {['M', 'F', 'N/D'].map(sex => (
                        <Button
                          key={sex} flex={1} h="44px" borderRadius="md"
                          fontSize="13px" fontWeight="bold"
                          bg={patientSex === sex ? '#3f3f46' : '#171717'}
                          color={patientSex === sex ? '#ffffff' : '#a3a3a3'}
                          borderColor="#262626"
                          onClick={() => setPatientSex(sex)}
                          _hover={{ bg: '#262626' }}
                        >
                          {sex}
                        </Button>
                      ))}
                    </ButtonGroup>
                  </Box>
                </HStack>

                <Box mb={4}>
                  <Text fontSize="11px" color="#ef4444" mb={2} textTransform="uppercase" fontWeight="bold">
                    * Condición Principal (Obligatorio)
                  </Text>
                  <Input
                    value={patientCondition}
                    onChange={(e) => setPatientCondition(e.target.value)}
                    bg="#171717"
                    border="1px solid"
                    borderColor={patientCondition.length >= 3 ? '#10b981' : '#262626'}
                    color="#e5e5e5" borderRadius="md" h="48px" fontSize="14px"
                    placeholder="Ej. Inconsciente, sangrado arterial..."
                    _focus={{ borderColor: '#38bdf8', boxShadow: 'none' }}
                    w="100%"
                  />
                </Box>

                <Button
                  w="100%" size="sm" colorScheme="blue" variant="outline"
                  isDisabled={patientCondition.trim().length < 3}
                  onClick={handleConfirmSection2}
                >
                  Confirmar Datos y Continuar
                </Button>
              </AccordionPanel>
            </AccordionItem>

            {/* ── SECCIÓN 3: REPORTE DE ENTORNO ── */}
            <AccordionItem border="none">
              <h2>
                <AccordionButton
                  py={4}
                  bg={notes ? '#1e293b' : '#171717'}
                  _hover={{ bg: '#262626' }}
                >
                  <Box as="span" flex="1" textAlign="left" fontSize="12px" fontWeight="bold"
                    color={notes ? '#38bdf8' : '#e5e5e5'} letterSpacing="1px"
                  >
                    3. REPORTE DE ENTORNO
                    {notes && <Text as="span" color="#10b981" ml={2}>[✓]</Text>}
                  </Box>
                  <AccordionIcon color="#a3a3a3" />
                </AccordionButton>
              </h2>
              <AccordionPanel pb={5} bg="#0a0a0a">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  bg="#171717" border="1px solid #262626" color="#e5e5e5"
                  borderRadius="md" h="100px" fontSize="14px" resize="vertical" mb={3}
                  placeholder="Describa riesgos en escena, accesos..."
                  _focus={{ borderColor: '#38bdf8', boxShadow: 'none' }}
                  w="100%"
                />
                <Grid templateColumns={{ base: 'repeat(2,1fr)', sm: 'repeat(3,1fr)' }} gap={2}>
                  {QUICK_NOTES.map(note => (
                    <Button
                      key={note} size="sm" h="32px" fontSize="10px" borderRadius="md"
                      bg="#1e293b" color="#94a3b8" border="1px solid #334155"
                      _hover={{ bg: '#334155', color: 'white' }}
                      onClick={() => handleQuickNote(note)}
                    >
                      {note}
                    </Button>
                  ))}
                </Grid>
              </AccordionPanel>
            </AccordionItem>

          </Accordion>
        </Box>

        {/* ── BOTÓN DE DESPACHO ── */}
        <Box p={5} bg="#0a0a0a" borderTop="1px solid #262626">
          <Button
            w="100%" h="60px"
            bg={isFormValid ? '#dc2626' : '#262626'}
            color={isFormValid ? 'white' : '#737373'}
            borderRadius="md" fontSize="14px" fontWeight="900" letterSpacing="1px"
            _hover={{ bg: isFormValid ? '#b91c1c' : '#262626' }}
            isDisabled={!wsConnected || !isFormValid || isSubmitting}
            isLoading={isSubmitting}
            loadingText="ENVIANDO..."
            onClick={executeDispatch}
          >
            {!wsConnected
              ? '⚡ SIN CONEXIÓN AL SERVIDOR'
              : isFormValid
                ? 'AUTORIZAR DESPACHO INMEDIATO'
                : 'FALTAN DATOS OBLIGATORIOS'
            }
          </Button>
        </Box>
      </Flex>

      {/* ===== BANNER DE ÉXITO (Portal) ===== */}
      <Portal>
        {showSuccessBanner && (
          <Box
            position="fixed" top="85px" left="50%"
            transform="translateX(-50%)"
            bg="#10b981" color="white"
            px={6} py={4} borderRadius="xl"
            boxShadow="0px 15px 40px rgba(16,185,129,0.5)"
            zIndex={20000}
            display="flex" alignItems="center" gap={4}
            border="2px solid #34d399" minW="340px"
          >
            <Icon as={CheckCircleIcon} boxSize={6} color="white" />
            <VStack align="start" spacing={0}>
              <Text fontWeight="900" fontSize="14px" letterSpacing="1.5px">REPORTE ACTIVO</Text>
              <Text fontSize="12px" fontWeight="bold" color="#ecfdf5">
                {lastAssignedCallId
                  ? `Folio ${lastAssignedCallId} — transmitido al sistema`
                  : 'Transmitido con éxito al sistema'
                }
              </Text>
            </VStack>
          </Box>
        )}
      </Portal>

      {/* ===== PANEL DERECHO: MAPA ===== */}
      <Box flex={1} position="relative" h={{ base: '40vh', lg: '100%' }}>

        {/* Barra superior del mapa */}
        <Box
          position="absolute" top={0} left={0} w="100%" zIndex={10}
          bg="rgba(15,23,42,0.9)" borderBottom="1px solid #1e293b"
          backdropFilter="blur(8px)"
        >
          <Flex align="center" px={4} py={3} gap={4}>

            {/* Coordenadas */}
            <Box flexShrink={0} display={{ base: 'none', md: 'block' }}>
              <Text fontSize="10px" color="#38bdf8" fontWeight="bold" letterSpacing="1px" mb={0.5}>
                COORDENADAS OBJETIVO
              </Text>
              <HStack spacing={3} fontFamily="mono" fontSize="11px" color="#f8fafc">
                <Text>LAT: <Text as="span" color="#10b981">{selectedLocation.lat.toFixed(6)}</Text></Text>
                <Text>LNG: <Text as="span" color="#10b981">{selectedLocation.lng.toFixed(6)}</Text></Text>
              </HStack>
            </Box>

            <Divider orientation="vertical" h="30px" borderColor="#334155" display={{ base: 'none', md: 'block' }} />

            {/* Búsqueda de dirección */}
            <Box flex={1} position="relative">
              <InputGroup size="md" w="100%">
                <Input
                  value={addressQuery}
                  onChange={(e) => {
                    setAddressQuery(e.target.value);
                    searchAddresses(e.target.value);
                  }}
                  bg="#1e293b"
                  border={!addressQuery ? '1px solid #ef4444' : '1px solid #334155'}
                  color="white" borderRadius="md" h="44px"
                  fontSize="13px" fontWeight="bold" w="100%"
                  placeholder="* Obligatorio: Ingrese vialidad o cruzamientos..."
                  _focus={{ borderColor: '#38bdf8', boxShadow: 'none' }}
                />
                <InputRightElement h="100%" w="44px">
                  {isSearching
                    ? <Spinner size="sm" color="#38bdf8" />
                    : addressQuery
                      ? <Button size="xs" variant="ghost" color="#94a3b8" onClick={clearAddress}><CloseIcon boxSize={2.5} /></Button>
                      : <SearchIcon color="#ef4444" />
                  }
                </InputRightElement>
              </InputGroup>

              {/* Resultados de búsqueda */}
              {searchResults.length > 0 && (
                <List
                  position="absolute" top="100%" left={0} w="100%" mt={2}
                  bg="#1e293b" border="1px solid #334155" borderRadius="md"
                  zIndex={20} shadow="2xl" overflow="hidden"
                >
                  {searchResults.map((res) => (
                    <ListItem
                      key={res.id} p={3} fontSize="13px" fontWeight="bold" color="#e2e8f0"
                      borderBottom="1px solid #334155" cursor="pointer"
                      _hover={{ bg: '#334155' }}
                      onClick={() => selectSearchResult(res)}
                    >
                      <HStack>
                        <Icon as={FaMapMarkerAlt} color="#dc2626" />
                        <Text noOfLines={1}>{res.place_name}</Text>
                      </HStack>
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>
          </Flex>
        </Box>

        {/* Mapa Mapbox */}
        <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

        {/* Crosshair central (mira estilo GPS) */}
        <Box
          position="absolute" top="50%" left="50%"
          transform="translate(-50%, -50%)"
          pointerEvents="none" zIndex={5}
        >
          {/* Anillo exterior */}
          <Box
            w="34px" h="34px" border="2px solid #ef4444" borderRadius="50%"
            display="flex" alignItems="center" justifyContent="center"
            bg="rgba(239,68,68,0.1)"
          >
            {/* Punto central */}
            <Box w="7px" h="7px" bg="#ef4444" borderRadius="50%" />
          </Box>
          {/* Líneas cruzadas */}
          <Box position="absolute" top="50%" left="50%"
            transform="translate(-50%, -50%)"
            w="50px" h="1px" bg="rgba(239,68,68,0.4)"
          />
          <Box position="absolute" top="50%" left="50%"
            transform="translate(-50%, -50%)"
            w="1px" h="50px" bg="rgba(239,68,68,0.4)"
          />
        </Box>
      </Box>

    </Flex>
  );
};

export default ReceptorEmergencyForm;
