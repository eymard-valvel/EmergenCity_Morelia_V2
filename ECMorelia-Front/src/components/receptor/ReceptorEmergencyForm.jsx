import React, { useState, useRef, useEffect, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  Box, Flex, VStack, HStack, Heading, Input, Textarea, Button, Spinner,
  InputGroup, InputRightElement, List, ListItem, Text, Icon, Grid,
  Portal, useToast, ButtonGroup, Accordion, AccordionItem, AccordionButton,
  AccordionPanel, AccordionIcon, SimpleGrid, IconButton, Select
} from '@chakra-ui/react';
import { SearchIcon, CloseIcon, CheckCircleIcon, AddIcon, MinusIcon } from '@chakra-ui/icons';
import { FaMapMarkerAlt, FaExclamationTriangle, FaUserInjured, FaShieldAlt } from 'react-icons/fa';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ||
  'pk.eyJ1IjoiZXltYXJkMjkiLCJhIjoiY21tcDY4YzNpMGw3bjJzb203YmZyNTVnMyJ9.OvZlnCMfUkUYe6Ib83DUVw';

const DEFAULT_CENTER = { lat: 19.7024, lng: -101.1969 };
const SEARCH_DEBOUNCE_MS = 250;
const SUCCESS_BANNER_MS = 3500;

// Tiempo máximo que la UI espera "en modo carga" antes de resetear visualmente.
// La escucha real sigue activa hasta ACK_TIMEOUT_MS para capturar confirmaciones tardías
// (el servidor puede auto-aceptar tras 20s si la ambulancia no responde).
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

const ReceptorEmergencyForm = ({ wsRef, wsConnected, onEmergencySent }) => {
  const toast = useToast();

  const mapContainer = useRef(null);
  const map = useRef(null);
  const searchRequestId = useRef(0);
  const reverseGeocodeRequestId = useRef(0);
  const searchDebounceTimer = useRef(null);
  const skipNextReverseGeocode = useRef(false);

  // Estados de Interfaz
  const [activeAccordion, setActiveAccordion] = useState(0);
  const [addressQuery, setAddressQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(DEFAULT_CENTER);

  // Datos del Formulario
  const [referencias, setReferencias] = useState('');
  const [tipoIncidente, setTipoIncidente] = useState('');
  const [otroIncidente, setOtroIncidente] = useState('');
  const [paciente, setPaciente] = useState({
    sexo: '', edad: '', consciente: '', respira: '', sangrado: '', atrapado: '', lesionados: 1, menores: ''
  });
  const [riesgos, setRiesgos] = useState([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [lastAssignedCallId, setLastAssignedCallId] = useState(null);

  // Validación
  const isFormValid = addressQuery.trim() !== '' && tipoIncidente !== '' && paciente.lesionados > 0;

  // Ícono verde solo si ya se empezó a llenar la evaluación
  const isPacienteIniciado = paciente.sexo !== '' || paciente.consciente !== '' || paciente.edad !== '';

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

  // ==================== BÚSQUEDA PANORÁMICA ====================
  const searchAddresses = useCallback((query) => {
    if (searchDebounceTimer.current) clearTimeout(searchDebounceTimer.current);
    if (!query || query.trim().length < 3) {
      setSearchResults([]); setIsSearching(false); return;
    }
    setIsSearching(true);
    searchDebounceTimer.current = setTimeout(async () => {
      const reqId = ++searchRequestId.current;
      try {
        const bbox = '-101.35,19.60,-101.05,19.80';
        const proximity = '-101.1969,19.7024';
        const q = encodeURIComponent(query.trim());
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${mapboxgl.accessToken}&country=mx&bbox=${bbox}&proximity=${proximity}&limit=5&language=es`;
        const res = await fetch(url);
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

  const clearAddress = () => { setAddressQuery(''); setSearchResults([]); };

  // ==================== HANDLERS DE FORMULARIO ====================
  const handleIncidenteSelect = (tipo) => {
    setTipoIncidente(tipo);
    if (tipo !== 'Otro') setActiveAccordion(2);
  };

  const handlePacienteChange = (campo, valor) => setPaciente(prev => ({ ...prev, [campo]: valor }));

  const adjustLesionados = (delta) => {
    setPaciente(prev => ({ ...prev, lesionados: Math.max(1, prev.lesionados + delta) }));
  };

  const handleRiesgoToggle = (riesgo) => {
    setRiesgos(prev => prev.includes(riesgo) ? prev.filter(r => r !== riesgo) : [...prev, riesgo]);
  };

  const resetForm = () => {
    setAddressQuery(''); setReferencias(''); setTipoIncidente(''); setOtroIncidente('');
    setPaciente({ sexo: '', edad: '', consciente: '', respira: '', sangrado: '', atrapado: '', lesionados: 1, menores: '' });
    setRiesgos([]); setActiveAccordion(0);
  };

  // ==================== DESPACHO ====================
  const executeDispatch = () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast({
        title: 'SISTEMA OFFLINE',
        description: 'Reconectando al servidor central.',
        status: 'error',
        duration: 4000
      });
      return;
    }

    setIsSubmitting(true);
    const requestId = `req_${Date.now()}`;
    const payload = {
      type: 'emergency_call',
      requestId,
      location: selectedLocation,
      address: addressQuery,
      referencias,
      emergencyType: tipoIncidente === 'Otro' ? otroIncidente : tipoIncidente,
      patientInfo: paciente,
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

      // Reset visual a los 4s (por si el handshake tarda por auto-accept)
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

      // Limpieza final del listener (red de seguridad)
      cleanupTimer = setTimeout(() => {
        if (ackReceived) return;
        try { ws.removeEventListener('message', responseHandler); } catch (_) {}
      }, ACK_TIMEOUT_MS);
    } catch (error) {
      setIsSubmitting(false);
      toast({
        title: 'ERROR CRÍTICO',
        description: 'Fallo al transmitir. Reintente.',
        status: 'error',
        duration: 4000
      });
    }
  };

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
                <Box flex="1" textAlign="left"><HStack><Icon as={FaMapMarkerAlt} color={referencias ? '#10b981' : '#a1a1aa'} /><Text fontSize="15px" fontWeight="900" color="#f8fafc">1. REFERENCIAS VISUALES</Text></HStack></Box>
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
                  onClick={() => setActiveAccordion(1)} transition="all 0.15s"
                >
                  CONFIRMAR Y CONTINUAR
                </Button>
              </AccordionPanel>
            </AccordionItem>

            {/* 2. TIPO DE INCIDENTE */}
            <AccordionItem border="none" borderBottom="1px solid #27272a">
              <AccordionButton py={5} bg={activeAccordion === 1 ? '#18181b' : 'transparent'} _hover={{ bg: '#18181b' }}>
                <Box flex="1" textAlign="left"><HStack><Icon as={FaExclamationTriangle} color={tipoIncidente ? '#10b981' : '#a1a1aa'} /><Text fontSize="15px" fontWeight="900" color="#f8fafc">2. TIPO DE INCIDENTE *</Text></HStack></Box>
                <AccordionIcon color="#a1a1aa" />
              </AccordionButton>
              <AccordionPanel pb={6} bg="#09090b">
                <Grid templateColumns="repeat(3, 1fr)" gap={3}>
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
                </Grid>
                {tipoIncidente === 'Otro' && (
                  <VStack mt={4} w="100%">
                    <Input size="lg" bg="#18181b" border="1px solid #3f3f46" color="white" placeholder="Especifique el incidente..." value={otroIncidente} onChange={e => setOtroIncidente(e.target.value)} _focus={{ borderColor: '#38bdf8', boxShadow: 'none' }} />
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

            {/* 3. ESTADO DEL PACIENTE */}
            <AccordionItem border="none" borderBottom="1px solid #27272a">
              <AccordionButton py={5} bg={activeAccordion === 2 ? '#18181b' : 'transparent'} _hover={{ bg: '#18181b' }}>
                <Box flex="1" textAlign="left"><HStack><Icon as={FaUserInjured} color={isPacienteIniciado ? '#10b981' : '#a1a1aa'} /><Text fontSize="15px" fontWeight="900" color="#f8fafc">3. EVALUACIÓN INICIAL *</Text></HStack></Box>
                <AccordionIcon color="#a1a1aa" />
              </AccordionButton>
              <AccordionPanel pb={6} bg="#09090b">
                <SimpleGrid columns={2} spacingX={6} spacingY={6}>
                  <Box>
                    <Text fontSize="12px" color="#a1a1aa" mb={2} fontWeight="800">SEXO</Text>
                    <Select size="lg" bg="#18181b" borderColor="#3f3f46" color="white" _focus={{ borderColor: '#38bdf8' }} value={paciente.sexo} onChange={e => handlePacienteChange('sexo', e.target.value)}>
                      <option style={{ background: '#18181b' }} value="">Seleccionar...</option>
                      <option style={{ background: '#18181b' }} value="Hombre">Hombre</option>
                      <option style={{ background: '#18181b' }} value="Mujer">Mujer</option>
                      <option style={{ background: '#18181b' }} value="N/S">No se sabe</option>
                    </Select>
                  </Box>
                  <Box>
                    <Text fontSize="12px" color="#a1a1aa" mb={2} fontWeight="800">EDAD APARENTE</Text>
                    <Input size="lg" bg="#18181b" border="1px solid #3f3f46" color="white" type="number" placeholder="Ej. 35" value={paciente.edad} onChange={e => handlePacienteChange('edad', e.target.value)} _focus={{ borderColor: '#38bdf8', boxShadow: 'none' }} />
                  </Box>
                  <Box>
                    <Text fontSize="12px" color="#a1a1aa" mb={2} fontWeight="800">¿CONSCIENTE?</Text>
                    <Select size="lg" bg="#18181b" borderColor="#3f3f46" color="white" _focus={{ borderColor: '#38bdf8' }} value={paciente.consciente} onChange={e => handlePacienteChange('consciente', e.target.value)}>
                      <option style={{ background: '#18181b' }} value="">Seleccionar...</option>
                      <option style={{ background: '#18181b' }} value="Sí">Sí</option>
                      <option style={{ background: '#18181b' }} value="No">No</option>
                      <option style={{ background: '#18181b' }} value="N/S">No se sabe</option>
                    </Select>
                  </Box>
                  <Box>
                    <Text fontSize="12px" color="#a1a1aa" mb={2} fontWeight="800">¿RESPIRA?</Text>
                    <Select size="lg" bg="#18181b" borderColor="#3f3f46" color="white" _focus={{ borderColor: '#38bdf8' }} value={paciente.respira} onChange={e => handlePacienteChange('respira', e.target.value)}>
                      <option style={{ background: '#18181b' }} value="">Seleccionar...</option>
                      <option style={{ background: '#18181b' }} value="Sí">Sí</option>
                      <option style={{ background: '#18181b' }} value="No">No</option>
                      <option style={{ background: '#18181b' }} value="N/S">No se sabe</option>
                    </Select>
                  </Box>
                  <Box>
                    <Text fontSize="12px" color="#a1a1aa" mb={2} fontWeight="800">¿SANGRADO?</Text>
                    <Select size="lg" bg="#18181b" borderColor="#3f3f46" color="white" _focus={{ borderColor: '#38bdf8' }} value={paciente.sangrado} onChange={e => handlePacienteChange('sangrado', e.target.value)}>
                      <option style={{ background: '#18181b' }} value="">Seleccionar...</option>
                      <option style={{ background: '#18181b' }} value="Sí">Sí</option>
                      <option style={{ background: '#18181b' }} value="No">No</option>
                      <option style={{ background: '#18181b' }} value="N/S">No se sabe</option>
                    </Select>
                  </Box>
                  <Box>
                    <Text fontSize="12px" color="#a1a1aa" mb={2} fontWeight="800">¿ATRAPADO / PRENSADO?</Text>
                    <Select size="lg" bg="#18181b" borderColor="#3f3f46" color="white" _focus={{ borderColor: '#38bdf8' }} value={paciente.atrapado} onChange={e => handlePacienteChange('atrapado', e.target.value)}>
                      <option style={{ background: '#18181b' }} value="">Seleccionar...</option>
                      <option style={{ background: '#18181b' }} value="Sí">Sí</option>
                      <option style={{ background: '#18181b' }} value="No">No</option>
                    </Select>
                  </Box>
                  <Box gridColumn="span 2">
                    <Text fontSize="12px" color="#a1a1aa" mb={2} fontWeight="800">NÚMERO DE LESIONADOS *</Text>
                    <HStack w="100%">
                      <IconButton size="lg" icon={<MinusIcon />} onClick={() => adjustLesionados(-1)} bg="#27272a" color="white" _hover={{ bg: '#3f3f46' }} aria-label="Menos lesionados" />
                      <Flex flex={1} bg="#18181b" border="1px solid #3f3f46" h="48px" borderRadius="md" alignItems="center" justifyContent="center">
                        <Text fontSize="20px" fontWeight="900" color="white">{paciente.lesionados}</Text>
                      </Flex>
                      <IconButton size="lg" icon={<AddIcon />} onClick={() => adjustLesionados(1)} bg="#27272a" color="white" _hover={{ bg: '#3f3f46' }} aria-label="Más lesionados" />
                    </HStack>
                  </Box>
                </SimpleGrid>
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
              <AccordionButton py={5} bg={activeAccordion === 3 ? '#18181b' : 'transparent'} _hover={{ bg: '#18181b' }}>
                <Box flex="1" textAlign="left"><HStack><Icon as={FaShieldAlt} color={riesgos.length > 0 ? '#f59e0b' : '#a1a1aa'} /><Text fontSize="15px" fontWeight="900" color="#f8fafc">4. RIESGOS EN LA ESCENA</Text></HStack></Box>
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

        {/* ── BOTÓN DE DESPACHO GIGANTE ── */}
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

      {/* ===== PANEL DERECHO: MAPA CON BUSCADOR ===== */}
      <Box flex={1} position="relative" h={{ base: '50vh', xl: '100%' }}>

        <Box position="absolute" top={0} left={0} right={0} zIndex={10} bg="rgba(9,9,11,0.9)" borderBottom="1px solid #27272a" p={4} backdropFilter="blur(10px)">
          <InputGroup size="lg" w="100%" h="60px">
            <Input
              h="60px" w="100%"
              value={addressQuery}
              onChange={(e) => { setAddressQuery(e.target.value); searchAddresses(e.target.value); }}
              bg="#18181b" border="2px solid" borderColor={addressQuery ? '#3f3f46' : '#ef4444'}
              color="white" borderRadius="md" fontSize="18px" fontWeight="800"
              placeholder="Busque vialidad, cruzamientos o punto de referencia..."
              _focus={{ borderColor: '#38bdf8', boxShadow: 'none' }}
            />
            {isSearching && (
              <InputRightElement h="60px">
                <Spinner color="#38bdf8" size="sm" />
              </InputRightElement>
            )}
            {!isSearching && addressQuery && (
              <InputRightElement h="60px">
                <IconButton
                  aria-label="Limpiar"
                  icon={<CloseIcon />}
                  size="sm"
                  variant="ghost"
                  color="#a1a1aa"
                  _hover={{ color: 'white', bg: '#27272a' }}
                  onClick={clearAddress}
                />
              </InputRightElement>
            )}
          </InputGroup>

          {searchResults.length > 0 && (
            <List w="100%" mt={2} bg="#18181b" border="1px solid #3f3f46" borderRadius="md" shadow="2xl">
              {searchResults.map((res) => (
                <ListItem key={res.id} p={4} fontSize="16px" fontWeight="700" color="#e4e4e7" borderBottom="1px solid #27272a" cursor="pointer" _hover={{ bg: '#27272a' }} onClick={() => selectSearchResult(res)}>
                  <HStack><Icon as={FaMapMarkerAlt} color="#ef4444" boxSize={5} /><Text noOfLines={1}>{res.place_name}</Text></HStack>
                </ListItem>
              ))}
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

export default ReceptorEmergencyForm;