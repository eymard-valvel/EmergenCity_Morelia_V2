// src/components/receptor/ReceptorDashboard.jsx — VERSIÓN MEJORADA Y COMPLETA
// Mejoras:
//   - wsRef usado en callbacks (sin stale closures)
//   - receptorId único basado en user.id + timestamp
//   - Panel de folios muestra ambulancia asignada claramente
//   - Nuevo: lista de ambulancias activas visible para el receptor
//   - Nuevo: recibe ambulance_status_changed y ambulance_connected/disconnected
//   - Nuevo: emergencias completadas se eliminan automáticamente del panel
//   - Compatibilidad total con el nuevo websocket-server.js

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, VStack, HStack, Heading, Text, Badge, useToast, Icon, Flex, Button, Divider, Tooltip
} from '@chakra-ui/react';
import {
  FaClipboardList, FaChevronRight, FaUserShield, FaAmbulance, FaCheckCircle
} from 'react-icons/fa';
import { FiActivity, FiWifiOff, FiLogOut, FiUsers } from 'react-icons/fi';
import logo from '../img/Logo.png';
import ReceptorEmergencyForm from './ReceptorEmergencyForm';

const RECONNECT_DELAY_MS     = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

// Genera un ID de receptor persistente por sesión de usuario
function getReceptorId(user) {
  const base = user?.id || user?.nombre || 'receptor';
  const stored = sessionStorage.getItem('receptorId');
  if (stored) return stored;
  const newId = `${base}_${Date.now().toString(36)}`;
  sessionStorage.setItem('receptorId', newId);
  return newId;
}

const STATUS_META = {
  connected:    { label: 'SISTEMA ONLINE',    color: 'green',  icon: FiActivity },
  connecting:   { label: 'CONECTANDO...',      color: 'yellow', icon: FiActivity },
  disconnected: { label: 'RECONECTANDO...',    color: 'orange', icon: FiWifiOff  },
  failed:       { label: 'OFFLINE',            color: 'red',    icon: FiWifiOff  },
};

const EMERGENCY_STATUS_COLORS = {
  assigned:            '#10b981',
  pending:             '#f59e0b',
  pending_no_ambulance:'#f97316',
  completed:           '#6b7280',
};

const EMERGENCY_STATUS_LABELS = {
  assigned:             'ASIGNADA',
  pending:              'PENDIENTE',
  pending_no_ambulance: 'SIN UNIDAD',
  completed:            'COMPLETADA',
};

const ReceptorDashboard = () => {
  const navigate  = useNavigate();
  const toast     = useToast();
  const user      = useMemo(() => JSON.parse(localStorage.getItem('user') || '{}'), []);
  const receptorId = useMemo(() => getReceptorId(user), [user]);

  // WebSocket — solo como ref para evitar stale closures en callbacks
  const wsRef              = useRef(null);
  const isMountedRef       = useRef(true);
  const reconnectAttempts  = useRef(0);
  const reconnectTimerRef  = useRef(null);

  const [connectionStatus, setConnectionStatus]     = useState('connecting');
  const [activeEmergencies, setActiveEmergencies]   = useState([]);
  const [activeAmbulances, setActiveAmbulances]     = useState([]);
  const [monitorOpen, setMonitorOpen]               = useState(false);
  const [activeTab, setActiveTab]                   = useState('emergencies'); // 'emergencies' | 'ambulances'

  const wsConnected = connectionStatus === 'connected';

  // ---------- CONEXIÓN WEBSOCKET ----------
  useEffect(() => {
    isMountedRef.current = true;

    const connectWS = () => {
      if (!isMountedRef.current) return;

      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3002/ws';
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (!isMountedRef.current) return;
        setConnectionStatus('connected');
        reconnectAttempts.current = 0;

        // Registro con ID único
        socket.send(JSON.stringify({
          type: 'register_receptor',
          receptorId,
          nombre: user.nombre || user.name || receptorId,
        }));
        // Pedir estado actual
        socket.send(JSON.stringify({ type: 'request_active_emergencies' }));
      };

      socket.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const data = JSON.parse(event.data);
          handleServerMessage(data, socket);
        } catch (error) {
          console.error('WS parse error:', error);
        }
      };

      socket.onclose = () => {
        if (!isMountedRef.current) return;
        wsRef.current = null;
        if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          setConnectionStatus('disconnected');
          reconnectAttempts.current += 1;
          reconnectTimerRef.current = setTimeout(connectWS, RECONNECT_DELAY_MS);
        } else {
          setConnectionStatus('failed');
        }
      };

      socket.onerror = () => {
        if (!isMountedRef.current) return;
        setConnectionStatus('disconnected');
      };
    };

    connectWS();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close(1000, 'Component unmounted');
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receptorId]);

  // ---------- MANEJADOR DE MENSAJES ----------
  const handleServerMessage = useCallback((data, socket) => {
    console.log('📨 Receptor recibió:', data.type);

    switch (data.type) {

      case 'receptor_registered':
        console.log(`✅ Receptor registrado. Total receptores: ${data.totalReceptors}`);
        break;

      case 'active_emergencies_update':
        setActiveEmergencies(data.emergencies || []);
        break;

      case 'active_ambulances_update':
        setActiveAmbulances(data.ambulances || []);
        break;

      // Emergencia nueva — notificación crítica
      case 'new_emergency_broadcast':
      case 'emergency_pending_broadcast':
        toast({
          title: '🚨 NUEVA ALERTA CRÍTICA',
          description: `Folio ${data.callId || '—'} — sin ambulancia disponible`,
          status: 'error',
          duration: 6000,
          isClosable: true,
          position: 'top-right',
        });
        socket.send(JSON.stringify({ type: 'request_active_emergencies' }));
        break;

      // Emergencia asignada exitosamente (respuesta al receptor que la creó)
      case 'emergency_assigned_ack':
        toast({
          title: '✅ EMERGENCIA ASIGNADA',
          description: `Folio ${data.callId} → ${data.ambulanceName || data.ambulanceId}`,
          status: 'success',
          duration: 7000,
          isClosable: true,
          position: 'top-right',
        });
        socket.send(JSON.stringify({ type: 'request_active_emergencies' }));
        break;

      // Broadcast a TODOS los receptores cuando se asigna una emergencia
      case 'emergency_assigned_broadcast':
        toast({
          title: '🚑 UNIDAD DESPACHADA',
          description: `Folio ${data.callId} — ${data.emergencyType || 'Emergencia'} → ${data.ambulanceName}`,
          status: 'info',
          duration: 7000,
          isClosable: true,
          position: 'top-right',
        });
        // Actualizar lista local sin esperar al servidor
        setActiveEmergencies(prev => prev.map(em =>
          em.callId === data.callId
            ? { ...em, status: 'assigned', assignedAmbulanceId: data.ambulanceId, assignedAmbulanceName: data.ambulanceName, assignedAt: data.assignedAt }
            : em
        ));
        break;

      // No hay ambulancia disponible (respuesta al receptor que creó la llamada)
      case 'emergency_assignment_failed':
        toast({
          title: '⚠️ SIN AMBULANCIA DISPONIBLE',
          description: data.message || 'No hay unidades disponibles. Folio en espera.',
          status: 'warning',
          duration: 7000,
          isClosable: true,
          position: 'top-right',
        });
        socket.send(JSON.stringify({ type: 'request_active_emergencies' }));
        break;

      // Emergencia completada — quitar del panel
      case 'emergency_completed_broadcast':
        toast({
          title: '✅ EMERGENCIA COMPLETADA',
          description: `Folio ${data.callId} cerrado`,
          status: 'success',
          duration: 4000,
          isClosable: true,
          position: 'top-right',
        });
        setActiveEmergencies(prev => prev.filter(em => em.callId !== data.callId));
        break;

      // Cambio de estado de ambulancia
      case 'ambulance_status_changed':
        setActiveAmbulances(prev => prev.map(a =>
          a.id === data.ambulanceId ? { ...a, status: data.newStatus } : a
        ));
        if (data.newStatus === 'disponible' && data.prevStatus === 'en_ruta') {
          toast({
            title: '🟢 UNIDAD DISPONIBLE',
            description: `${data.nombre || data.ambulanceId} ha regresado a servicio`,
            status: 'success',
            duration: 4000,
            isClosable: true,
            position: 'top-right',
          });
        }
        break;

      // Nueva ambulancia conectada
      case 'ambulance_connected':
        setActiveAmbulances(prev => {
          const exists = prev.some(a => a.id === data.ambulance.id);
          return exists ? prev.map(a => a.id === data.ambulance.id ? { ...a, ...data.ambulance } : a) : [...prev, data.ambulance];
        });
        break;

      // Ambulancia desconectada
      case 'ambulance_disconnected':
        setActiveAmbulances(prev => prev.filter(a => a.id !== data.ambulanceId));
        break;

      // Actualización de ubicación de ambulancia (para conteo en tiempo real)
      case 'ambulance_location_update':
        setActiveAmbulances(prev => prev.map(a =>
          a.id === data.ambulanceId ? { ...a, location: data.location, speed: data.speed, status: data.status } : a
        ));
        break;

      default:
        console.log('📨 Tipo no manejado en receptor:', data.type);
    }
  }, [toast]);

  // ---------- ACCIONES ----------
  const requestRefresh = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'request_active_emergencies' }));
    }
  }, []);

  const handleLogout = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close(1000, 'Logout');
    }
    sessionStorage.removeItem('receptorId');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  }, [navigate]);

  // ---------- CÓMPUTOS DERIVADOS ----------
  const pendingCount    = activeEmergencies.filter(e => e.status === 'pending' || e.status === 'pending_no_ambulance').length;
  const assignedCount   = activeEmergencies.filter(e => e.status === 'assigned').length;
  const disponiblesCount = activeAmbulances.filter(a => a.status === 'disponible').length;
  const statusMeta = STATUS_META[connectionStatus];

  // ---------- RENDER ----------
  return (
    <Box h="100vh" w="100vw" bg="#000000" overflow="hidden" display="flex" flexDirection="column">

      {/* ===== NAVBAR ===== */}
      <Flex
        as="nav" h="65px" w="100%"
        background="linear-gradient(to right, #0f172a, #000000)"
        px={6} alignItems="center" justifyContent="space-between"
        borderBottom="2px solid #0284c7" zIndex="1100" shadow="lg"
      >
        <HStack spacing={5}>
          <img
            src={logo} alt="C5"
            style={{ width: '35px', height: 'auto', cursor: 'pointer' }}
            onClick={() => navigate('/')}
          />
          <VStack align="start" spacing={0} display={{ base: 'none', sm: 'flex' }}>
            <Heading size="sm" color="#ffffff" fontSize="15px" fontWeight="900" letterSpacing="2px">
              CONSOLA DE DESPACHO UNIFICADO
            </Heading>
            <Text color="#38bdf8" fontSize="10px" fontWeight="bold" letterSpacing="1px">
              CENTRO DE COMANDO C5
            </Text>
          </VStack>
        </HStack>

        <HStack spacing={4}>
          {/* Estado de conexión */}
          <Badge
            display="flex" alignItems="center" gap="6px"
            colorScheme={statusMeta.color} px={3} py={1.5}
            borderRadius="md" fontSize="11px" letterSpacing="1px"
          >
            <Icon as={statusMeta.icon} boxSize={3.5} />
            {statusMeta.label}
          </Badge>

          {/* Ambulancias disponibles */}
          <Tooltip label="Unidades disponibles">
            <Badge
              display={{ base: 'none', md: 'flex' }}
              alignItems="center" gap="6px"
              colorScheme={disponiblesCount > 0 ? 'green' : 'red'}
              px={3} py={1.5} borderRadius="md" fontSize="11px"
            >
              <Icon as={FaAmbulance} boxSize={3.5} />
              {disponiblesCount}/{activeAmbulances.length} UNIDADES
            </Badge>
          </Tooltip>

          {/* Operador */}
          <HStack
            spacing={3} bg="#1e293b" px={4} py={2}
            borderRadius="md" border="1px solid #334155"
            display={{ base: 'none', md: 'flex' }}
          >
            <Icon as={FaUserShield} color="#94a3b8" />
            <Text color="#e2e8f0" fontSize="12px" fontWeight="bold">
              OP: {user.nombre || receptorId}
            </Text>
          </HStack>

          {/* Cerrar sesión */}
          <Button
            leftIcon={<FiLogOut />}
            bg="#dc2626" color="#ffffff"
            variant="solid" size="sm"
            onClick={handleLogout}
            fontWeight="900" px={6} shadow="lg"
            _hover={{ bg: '#b91c1c', transform: 'scale(1.03)' }}
            _active={{ bg: '#991b1b' }}
            transition="all 0.2s"
          >
            CERRAR SESIÓN
          </Button>
        </HStack>
      </Flex>

      {/* ===== CUERPO PRINCIPAL ===== */}
      <Flex flex={1} w="100%" overflow="hidden" position="relative">

        {/* Formulario principal */}
        <Box flex={1} h="100%" overflow="hidden" minW={0}>
          <ReceptorEmergencyForm
            wsRef={wsRef}
            wsConnected={wsConnected}
            onEmergencySent={requestRefresh}
          />
        </Box>

        {/* Botón apertura panel lateral */}
        {!monitorOpen && (
          <Button
            position="absolute" right="0" top="50%"
            transform="translateY(-50%)"
            h="140px" w="45px"
            bg="#0284c7" color="white"
            onClick={() => setMonitorOpen(true)}
            zIndex={20}
            borderStartRadius="xl" borderEndRadius="0"
            boxShadow="-4px 0 15px rgba(2,132,199,0.4)"
            _hover={{ bg: '#0369a1', w: '55px' }}
            transition="all 0.2s ease"
            p={0}
          >
            <VStack spacing={3}>
              <Icon as={FaClipboardList} boxSize={5} />
              {activeEmergencies.length > 0 && (
                <Badge colorScheme="red" borderRadius="full" px={2} fontSize="11px">
                  {activeEmergencies.length}
                </Badge>
              )}
            </VStack>
          </Button>
        )}

        {/* ===== PANEL LATERAL ===== */}
        <Box
          h="100%"
          w={monitorOpen ? { base: '100%', md: '380px' } : '0px'}
          minW={monitorOpen ? { base: '100%', md: '380px' } : '0px'}
          overflow="hidden"
          bg="#0f172a"
          borderLeft={monitorOpen ? '2px solid #1e293b' : 'none'}
          transition="width 0.3s cubic-bezier(0.4,0,0.2,1)"
          position="relative" zIndex={15} shadow="2xl"
        >
          <VStack spacing={0} h="100%" align="stretch" w="100%">

            {/* Header del panel */}
            <Flex
              align="center" justify="space-between"
              px={4} py={3} bg="#1e293b"
              borderBottom="1px solid #334155"
            >
              <HStack spacing={3}>
                {/* Tabs */}
                <Button
                  size="xs"
                  bg={activeTab === 'emergencies' ? '#0284c7' : 'transparent'}
                  color={activeTab === 'emergencies' ? 'white' : '#94a3b8'}
                  border="1px solid"
                  borderColor={activeTab === 'emergencies' ? '#0284c7' : '#334155'}
                  _hover={{ bg: '#0284c7', color: 'white', borderColor: '#0284c7' }}
                  onClick={() => setActiveTab('emergencies')}
                  fontSize="10px" fontWeight="900" letterSpacing="0.5px"
                  leftIcon={<Icon as={FaClipboardList} />}
                >
                  FOLIOS {activeEmergencies.length > 0 && `(${activeEmergencies.length})`}
                </Button>
                <Button
                  size="xs"
                  bg={activeTab === 'ambulances' ? '#0284c7' : 'transparent'}
                  color={activeTab === 'ambulances' ? 'white' : '#94a3b8'}
                  border="1px solid"
                  borderColor={activeTab === 'ambulances' ? '#0284c7' : '#334155'}
                  _hover={{ bg: '#0284c7', color: 'white', borderColor: '#0284c7' }}
                  onClick={() => setActiveTab('ambulances')}
                  fontSize="10px" fontWeight="900" letterSpacing="0.5px"
                  leftIcon={<Icon as={FaAmbulance} />}
                >
                  UNIDADES {activeAmbulances.length > 0 && `(${activeAmbulances.length})`}
                </Button>
              </HStack>
              <Button
                size="sm" variant="ghost" color="#cbd5e1"
                _hover={{ bg: '#334155' }}
                onClick={() => setMonitorOpen(false)}
                minW="32px"
              >
                <FaChevronRight />
              </Button>
            </Flex>

            {/* Contenido scrollable */}
            <Box
              flex={1} overflowY="auto" p={3}
              sx={{
                '&::-webkit-scrollbar': { width: '5px' },
                '&::-webkit-scrollbar-thumb': { background: '#475569', borderRadius: '10px' },
              }}
            >

              {/* ===== TAB: FOLIOS / EMERGENCIAS ===== */}
              {activeTab === 'emergencies' && (
                <VStack spacing={3} align="stretch">

                  {/* Resumen rápido */}
                  <HStack spacing={2} mb={1}>
                    <Box flex={1} bg="#1e293b" p={2} borderRadius="md" border="1px solid #334155" textAlign="center">
                      <Text fontSize="18px" fontWeight="900" color="#f59e0b">{pendingCount}</Text>
                      <Text fontSize="9px" color="#94a3b8" fontWeight="bold">PENDIENTES</Text>
                    </Box>
                    <Box flex={1} bg="#1e293b" p={2} borderRadius="md" border="1px solid #334155" textAlign="center">
                      <Text fontSize="18px" fontWeight="900" color="#10b981">{assignedCount}</Text>
                      <Text fontSize="9px" color="#94a3b8" fontWeight="bold">EN RUTA</Text>
                    </Box>
                    <Box flex={1} bg="#1e293b" p={2} borderRadius="md" border="1px solid #334155" textAlign="center">
                      <Text fontSize="18px" fontWeight="900" color="#38bdf8">{activeEmergencies.length}</Text>
                      <Text fontSize="9px" color="#94a3b8" fontWeight="bold">TOTAL</Text>
                    </Box>
                  </HStack>

                  {activeEmergencies.length === 0 ? (
                    <Box p={5} bg="#1e293b" color="#94a3b8" borderRadius="md" border="1px dashed #334155" textAlign="center">
                      <Icon as={FaCheckCircle} boxSize={8} color="#334155" mb={2} />
                      <Text fontSize="13px" fontWeight="bold">Sin folios activos</Text>
                      <Text fontSize="11px" mt={1} color="#475569">Las emergencias aparecerán aquí</Text>
                    </Box>
                  ) : (
                    activeEmergencies.map((em) => (
                      <EmergencyCard key={em.callId} emergency={em} />
                    ))
                  )}
                </VStack>
              )}

              {/* ===== TAB: UNIDADES / AMBULANCIAS ===== */}
              {activeTab === 'ambulances' && (
                <VStack spacing={3} align="stretch">
                  <HStack spacing={2} mb={1}>
                    <Box flex={1} bg="#1e293b" p={2} borderRadius="md" border="1px solid #334155" textAlign="center">
                      <Text fontSize="18px" fontWeight="900" color="#10b981">{disponiblesCount}</Text>
                      <Text fontSize="9px" color="#94a3b8" fontWeight="bold">DISPONIBLES</Text>
                    </Box>
                    <Box flex={1} bg="#1e293b" p={2} borderRadius="md" border="1px solid #334155" textAlign="center">
                      <Text fontSize="18px" fontWeight="900" color="#f59e0b">
                        {activeAmbulances.filter(a => a.status === 'en_ruta').length}
                      </Text>
                      <Text fontSize="9px" color="#94a3b8" fontWeight="bold">EN RUTA</Text>
                    </Box>
                    <Box flex={1} bg="#1e293b" p={2} borderRadius="md" border="1px solid #334155" textAlign="center">
                      <Text fontSize="18px" fontWeight="900" color="#94a3b8">{activeAmbulances.length}</Text>
                      <Text fontSize="9px" color="#94a3b8" fontWeight="bold">TOTAL</Text>
                    </Box>
                  </HStack>

                  {activeAmbulances.length === 0 ? (
                    <Box p={5} bg="#1e293b" color="#94a3b8" borderRadius="md" border="1px dashed #334155" textAlign="center">
                      <Icon as={FaAmbulance} boxSize={8} color="#334155" mb={2} />
                      <Text fontSize="13px" fontWeight="bold">Sin unidades activas</Text>
                      <Text fontSize="11px" mt={1} color="#475569">Las ambulancias conectadas aparecerán aquí</Text>
                    </Box>
                  ) : (
                    activeAmbulances.map((amb) => (
                      <AmbulanceCard key={amb.id} ambulance={amb} />
                    ))
                  )}
                </VStack>
              )}
            </Box>
          </VStack>
        </Box>
      </Flex>
    </Box>
  );
};

// ===== SUB-COMPONENTE: TARJETA DE EMERGENCIA =====
const EmergencyCard = ({ emergency: em }) => {
  const statusColor = EMERGENCY_STATUS_COLORS[em.status] || '#6b7280';
  const statusLabel = EMERGENCY_STATUS_LABELS[em.status] || em.status?.toUpperCase();
  const folioShort  = em.callId?.replace('EM-', 'F-') || em.callId;

  return (
    <Box
      p={3} borderRadius="md"
      borderLeft="4px solid" borderLeftColor={statusColor}
      bg="#1e293b"
      border="1px solid #334155"
      borderLeftWidth="4px"
      shadow="sm"
      _hover={{ bg: '#1a2744' }}
      transition="background 0.15s"
    >
      {/* Fila superior: folio + hora + badge estado */}
      <Flex justify="space-between" align="center" mb={1.5}>
        <Text fontWeight="900" color="#e2e8f0" fontSize="14px" letterSpacing="0.5px">
          {folioShort}
        </Text>
        <HStack spacing={2}>
          <Badge
            fontSize="9px" fontWeight="900" letterSpacing="0.5px"
            px={2} py={0.5} borderRadius="sm"
            bg={statusColor} color="white"
          >
            {statusLabel}
          </Badge>
          <Text color="#475569" fontSize="10px" fontFamily="mono">
            {new Date(em.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </HStack>
      </Flex>

      {/* Tipo de emergencia */}
      <Text fontSize="13px" fontWeight="700" color="#38bdf8" noOfLines={1} mb={1}>
        {em.emergencyType}
      </Text>

      {/* Dirección */}
      {em.address && em.address !== 'Sin dirección' && (
        <Text fontSize="11px" color="#94a3b8" noOfLines={1} mb={1}>
          📍 {em.address}
        </Text>
      )}

      {/* Info del paciente si existe */}
      {em.patientInfo && (em.patientInfo.condition || em.patientInfo.age) && (
        <Text fontSize="11px" color="#64748b" noOfLines={1} mb={1}>
          👤 {[em.patientInfo.age && `${em.patientInfo.age} años`, em.patientInfo.sex, em.patientInfo.condition].filter(Boolean).join(' · ')}
        </Text>
      )}

      <Divider borderColor="#334155" my={1.5} />

      {/* Ambulancia asignada */}
      {em.status === 'assigned' && em.assignedAmbulanceId && (
        <HStack spacing={2} mt={0.5}>
          <Icon as={FaAmbulance} color="#10b981" boxSize={3.5} />
          <Text fontSize="11px" fontWeight="bold" color="#10b981">
            {em.assignedAmbulanceName || em.assignedAmbulanceId}
          </Text>
          {em.assignedAt && (
            <Text fontSize="10px" color="#475569" fontFamily="mono" ml="auto">
              {new Date(em.assignedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </Text>
          )}
        </HStack>
      )}

      {em.status === 'pending_no_ambulance' && (
        <HStack spacing={2} mt={0.5}>
          <Text fontSize="10px" fontWeight="bold" color="#f97316">
            ⚠️ Sin unidad disponible — en lista de espera
          </Text>
        </HStack>
      )}

      {em.status === 'pending' && (
        <Text fontSize="10px" color="#f59e0b" fontWeight="bold">
          ⏳ Buscando unidad disponible...
        </Text>
      )}
    </Box>
  );
};

// ===== SUB-COMPONENTE: TARJETA DE AMBULANCIA =====
const AMBULANCE_STATUS_CONFIG = {
  disponible:        { color: '#10b981', label: 'DISPONIBLE',      dot: '#10b981' },
  en_ruta:           { color: '#f59e0b', label: 'EN RUTA',         dot: '#f59e0b' },
  ocupado:           { color: '#f97316', label: 'OCUPADO',         dot: '#f97316' },
  fuera_de_servicio: { color: '#6b7280', label: 'FUERA SERVICIO',  dot: '#6b7280' },
};

const AmbulanceCard = ({ ambulance: amb }) => {
  const cfg = AMBULANCE_STATUS_CONFIG[amb.status] || { color: '#6b7280', label: amb.status?.toUpperCase(), dot: '#6b7280' };

  return (
    <Box
      p={3} borderRadius="md" bg="#1e293b"
      border="1px solid #334155"
      borderLeft="4px solid" borderLeftColor={cfg.color}
      shadow="sm"
    >
      <Flex justify="space-between" align="center">
        <HStack spacing={2}>
          <Box w="8px" h="8px" borderRadius="full" bg={cfg.dot} flexShrink={0} />
          <VStack align="start" spacing={0}>
            <Text fontWeight="900" color="#e2e8f0" fontSize="13px">
              {amb.nombre || amb.placa}
            </Text>
            <Text fontSize="10px" color="#64748b" fontFamily="mono">
              {amb.placa} · {amb.tipo || 'UVI Móvil'}
            </Text>
          </VStack>
        </HStack>
        <Badge fontSize="9px" fontWeight="900" px={2} py={0.5} borderRadius="sm" bg={cfg.color} color="white">
          {cfg.label}
        </Badge>
      </Flex>

      {typeof amb.speed === 'number' && amb.speed > 0 && (
        <Text fontSize="10px" color="#64748b" mt={1.5} fontFamily="mono">
          🏎️ {amb.speed} km/h
        </Text>
      )}

      {amb.lastUpdate && (
        <Text fontSize="9px" color="#334155" mt={0.5} fontFamily="mono">
          Actualización: {new Date(amb.lastUpdate).toLocaleTimeString('es-MX')}
        </Text>
      )}
    </Box>
  );
};

export default ReceptorDashboard;
