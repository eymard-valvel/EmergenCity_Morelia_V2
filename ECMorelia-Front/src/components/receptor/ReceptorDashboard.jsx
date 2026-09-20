import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, VStack, HStack, Heading, Text, Badge, useToast, Icon, Flex, Button,
  Divider, Tooltip, IconButton, ButtonGroup
} from '@chakra-ui/react';
import {
  FaClipboardList, FaChevronRight, FaUserShield, FaAmbulance, FaCheckCircle,
  FaTimes, FaSignOutAlt
} from 'react-icons/fa';
import { FiActivity, FiWifiOff } from 'react-icons/fi';
import logo from '../img/Logo.png';
import ReceptorEmergencyForm from './ReceptorEmergencyForm';
import { useAuth } from '../../auth/useAuth.js';
import { deleteCookie } from '../../helpers/cookies.js';

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

function getReceptorId(user) {
  const base = user?.id || user?.nombre || 'receptor';
  const stored = sessionStorage.getItem('receptorId');
  if (stored) return stored;
  const newId = `${base}_${Date.now().toString(36)}`;
  sessionStorage.setItem('receptorId', newId);
  return newId;
}

const STATUS_META = {
  connected:    { label: 'SISTEMA ONLINE', color: '#10b981', icon: FiActivity },
  connecting:   { label: 'CONECTANDO...',  color: '#f59e0b', icon: FiActivity },
  disconnected: { label: 'RECONECTANDO...',color: '#f97316', icon: FiWifiOff  },
  failed:       { label: 'OFFLINE',        color: '#ef4444', icon: FiWifiOff  },
};

// Colores semánticos: verde = OK, ámbar = en proceso, rojo = problema, azul = info, slate = cerrado
const EMERGENCY_STATUS_COLORS = {
  assigned: '#10b981',
  offering: '#38bdf8',
  pending: '#f59e0b',
  pending_no_ambulance: '#ef4444',
  completed: '#64748b',
};

const EMERGENCY_STATUS_LABELS = {
  assigned: 'EN RUTA',
  offering: 'ASIGNANDO',
  pending: 'PENDIENTE',
  pending_no_ambulance: 'SIN UNIDAD',
  completed: 'CERRADA',
};

const ReceptorDashboard = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { setAuth } = useAuth();
  const user = useMemo(() => JSON.parse(localStorage.getItem('user') || '{}'), []);
  const receptorId = useMemo(() => getReceptorId(user), [user]);

  const wsRef = useRef(null);
  const isMountedRef = useRef(true);
  const reconnectAttempts = useRef(0);
  const reconnectTimerRef = useRef(null);

  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [activeEmergencies, setActiveEmergencies] = useState([]);
  const [activeAmbulances, setActiveAmbulances] = useState([]);
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('emergencies');

  const wsConnected = connectionStatus === 'connected';

  // ---------- CONEXIÓN WS ----------
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
        socket.send(JSON.stringify({
          type: 'register_receptor',
          receptorId,
          nombre: user.nombre || user.name || receptorId,
        }));
        socket.send(JSON.stringify({ type: 'request_active_emergencies' }));
      };

      socket.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try { handleServerMessage(JSON.parse(event.data), socket); } catch (_) {}
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

      socket.onerror = () => { if (isMountedRef.current) setConnectionStatus('disconnected'); };
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

  // ---------- MANEJO DE MENSAJES DEL SERVER ----------
  const handleServerMessage = useCallback((data, socket) => {
    switch (data.type) {
      // -------- Handshake --------
      case 'connection_established':
        if (data.protocolVersion) {
          // eslint-disable-next-line no-console
          console.info(`[WS] Protocolo v${data.protocolVersion} · ${data.message || ''}`);
        }
        break;

      // -------- Listas globales --------
      case 'active_emergencies_update':
        setActiveEmergencies(data.emergencies || []);
        break;

      case 'active_ambulances_update':
        setActiveAmbulances(data.ambulances || []);
        break;

      // -------- Alta de emergencia (broadcast a otros receptores) --------
      case 'new_emergency_broadcast':
      case 'emergency_pending_broadcast':
        socket.send(JSON.stringify({ type: 'request_active_emergencies' }));
        break;

      // -------- Confirmaciones al receptor emisor --------
      case 'emergency_assigned_ack':
      case 'emergency_assignment_failed':
        socket.send(JSON.stringify({ type: 'request_active_emergencies' }));
        break;

      // -------- Asignación confirmada (broadcast a todos) --------
      case 'emergency_assigned_broadcast':
        setActiveEmergencies(prev => {
          const exists = prev.some(em => em.callId === data.callId);
          if (!exists) return prev;
          return prev.map(em => em.callId === data.callId
            ? {
                ...em,
                status: 'assigned',
                assignedAmbulanceId: data.ambulanceId,
                assignedAmbulanceName: data.ambulanceName,
                assignedAt: data.assignedAt,
              }
            : em);
        });
        // Refresco defensivo por si el broadcast llega antes que el update general
        socket.send(JSON.stringify({ type: 'request_active_emergencies' }));
        break;

      // -------- Reasignación por imprevisto de unidad --------
      case 'emergency_reassigned_broadcast':
        setActiveEmergencies(prev => prev.map(em => em.callId === data.callId
          ? {
              ...em,
              status: 'offering',
              assignedAmbulanceId: null,
              assignedAmbulanceName: null,
              assignedAt: null,
              lastReassign: {
                previousAmbulanceId: data.previousAmbulanceId,
                newAmbulanceId: data.newAmbulanceId,
                newAmbulanceName: data.newAmbulanceName,
                reason: data.reason,
                at: data.timestamp,
              },
            }
          : em));
        break;

      // -------- Cierre de emergencia --------
      case 'emergency_completed_broadcast':
        setActiveEmergencies(prev => prev.filter(em => em.callId !== data.callId));
        break;

      // -------- Estado y ubicación de ambulancias --------
      case 'ambulance_status_changed':
        setActiveAmbulances(prev => prev.map(a =>
          a.id === data.ambulanceId ? { ...a, status: data.newStatus } : a
        ));
        break;

      case 'ambulance_connected':
        setActiveAmbulances(prev => {
          const exists = prev.some(a => a.id === data.ambulance.id);
          return exists
            ? prev.map(a => a.id === data.ambulance.id ? { ...a, ...data.ambulance } : a)
            : [...prev, data.ambulance];
        });
        break;

      case 'ambulance_disconnected':
        setActiveAmbulances(prev => prev.filter(a => a.id !== data.ambulanceId));
        break;

      case 'ambulance_location_update':
        setActiveAmbulances(prev => prev.map(a =>
          a.id === data.ambulanceId
            ? { ...a, location: data.location, speed: data.speed, status: data.status }
            : a
        ));
        break;

      default:
        break;
    }
  }, []);

  const requestRefresh = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'request_active_emergencies' }));
    }
  }, []);

  // ---------- LOGOUT ----------
  const handleLogout = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close(1000, 'Logout');
    }
    deleteCookie('role');
    if (setAuth) setAuth(false);
    sessionStorage.removeItem('receptorId');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  }, [navigate, setAuth]);

  // ---------- MÉTRICAS ----------
  const pendingCount = activeEmergencies.filter(e =>
    e.status === 'pending' || e.status === 'pending_no_ambulance' || e.status === 'offering'
  ).length;
  const assignedCount = activeEmergencies.filter(e => e.status === 'assigned').length;
  const disponiblesCount = activeAmbulances.filter(a => a.status === 'disponible').length;
  const statusMeta = STATUS_META[connectionStatus];

  return (
    <Box h="100vh" w="100vw" bg="#09090b" overflow="hidden" display="flex" flexDirection="column">

      {/* ==================== HEADER ==================== */}
      <Flex as="nav" h="85px" w="100%" bg="#09090b" px={6} alignItems="center" justifyContent="space-between" borderBottom="1px solid #27272a" zIndex="1100">
        <HStack spacing={4}>
          <Box p={2} bg="#18181b" borderRadius="xl" border="1px solid #27272a" display="flex" alignItems="center" justifyContent="center">
            <img src={logo} alt="C5" style={{ width: '42px', height: '42px', objectFit: 'contain' }} />
          </Box>
          <VStack align="start" spacing={0}>
            <Heading size="sm" color="#f8fafc" fontSize="20px" fontWeight="900" letterSpacing="1.5px">CONSOLA DE DESPACHO UNIFICADO</Heading>
            <Text color="#38bdf8" fontSize="12px" fontWeight="800" letterSpacing="1px">CENTRO REGULADOR DE URGENCIAS MÉDICAS (CRUM) - MORELIA</Text>
          </VStack>
        </HStack>

        <HStack spacing={5}>
          <Badge
            display="flex"
            alignItems="center"
            gap="8px"
            px={4}
            py={3}
            borderRadius="xl"
            bg={wsConnected ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}
            border="1px solid"
            borderColor={wsConnected ? '#10b981' : '#ef4444'}
            color={wsConnected ? '#10b981' : '#ef4444'}
            fontSize="13px"
            fontWeight="900"
            letterSpacing="1px"
          >
            <Icon as={statusMeta.icon} boxSize={4} />
            {statusMeta.label}
          </Badge>

          <HStack spacing={3} bg="#18181b" px={5} py={2.5} borderRadius="xl" border="1px solid #27272a">
            <Box p={1.5} bg="#27272a" borderRadius="lg">
              <Icon as={FaUserShield} color="#38bdf8" boxSize={4} />
            </Box>
            <VStack align="start" spacing={0}>
              <Text fontSize="10px" color="#a1a1aa" fontWeight="900" letterSpacing="1px">OPERADOR DESPACHADOR</Text>
              <Text color="#f8fafc" fontSize="13px" fontWeight="900">OP: {user.nombre || user.name || receptorId}</Text>
            </VStack>
          </HStack>

          <Tooltip label="Cerrar Sesión" placement="bottom" hasArrow bg="#18181b" color="#ef4444" fontWeight="bold">
            <IconButton
              icon={<FaSignOutAlt />}
              aria-label="Cerrar Sesión"
              onClick={handleLogout}
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

      {/* ==================== CUERPO ==================== */}
      <Flex flex={1} w="100%" overflow="hidden" position="relative">
        <Box flex={1} h="100%" overflow="hidden" minW={0}>
          <ReceptorEmergencyForm
  wsRef={wsRef}
  wsConnected={wsConnected}
  onEmergencySent={requestRefresh}
  activeAmbulances={activeAmbulances}
/>
        </Box>

        {!monitorOpen && (
          <Button
            position="absolute"
            right={0}
            top="50%"
            transform="translateY(-50%)"
            h="120px"
            w="60px"
            bg="#18181b"
            border="1px solid #27272a"
            borderRight="none"
            color="white"
            onClick={() => setMonitorOpen(true)}
            zIndex={20}
            borderStartRadius="2xl"
            borderEndRadius="0"
            _hover={{ bg: '#27272a', w: '70px' }}
            transition="all 0.2s"
          >
            <VStack spacing={3}>
              <Icon as={FaClipboardList} boxSize={6} color="#38bdf8" />
              {activeEmergencies.length > 0 && (
                <Badge colorScheme="red" borderRadius="full" px={3} py={1} fontSize="12px">
                  {activeEmergencies.length}
                </Badge>
              )}
            </VStack>
          </Button>
        )}

        <Box
          h="100%"
          w={monitorOpen ? '420px' : '0px'}
          minW={monitorOpen ? '420px' : '0px'}
          overflow="hidden"
          bg="#09090b"
          borderLeft={monitorOpen ? '1px solid #27272a' : 'none'}
          transition="width 0.3s cubic-bezier(0.4,0,0.2,1)"
          position="relative"
          zIndex={15}
          shadow="-10px 0 30px rgba(0,0,0,0.5)"
        >
          <VStack spacing={0} h="100%" align="stretch" w="100%">
            <Flex align="center" justify="space-between" px={5} py={4} bg="#18181b" borderBottom="1px solid #27272a">
              <Heading fontSize="16px" color="white" fontWeight="900">MONITOR ACTIVO EN CAMPO</Heading>
              <IconButton
                icon={<FaTimes />}
                size="sm"
                bg="transparent"
                color="#a1a1aa"
                _hover={{ bg: '#27272a', color: 'white' }}
                onClick={() => setMonitorOpen(false)}
                aria-label="Cerrar panel"
              />
            </Flex>

            <Flex p={3} bg="#09090b" borderBottom="1px solid #27272a">
              <ButtonGroup isAttached w="100%" size="sm">
                <Button
                  flex={1}
                  bg={activeTab === 'emergencies' ? '#0284c7' : '#18181b'}
                  color={activeTab === 'emergencies' ? 'white' : '#a1a1aa'}
                  borderColor="#27272a"
                  onClick={() => setActiveTab('emergencies')}
                  _hover={{ bg: activeTab === 'emergencies' ? '#0369a1' : '#27272a' }}
                  fontSize="12px"
                  fontWeight="800"
                >
                  FOLIOS ({activeEmergencies.length})
                </Button>
                <Button
                  flex={1}
                  bg={activeTab === 'ambulances' ? '#0284c7' : '#18181b'}
                  color={activeTab === 'ambulances' ? 'white' : '#a1a1aa'}
                  borderColor="#27272a"
                  onClick={() => setActiveTab('ambulances')}
                  _hover={{ bg: activeTab === 'ambulances' ? '#0369a1' : '#27272a' }}
                  fontSize="12px"
                  fontWeight="800"
                >
                  UNIDADES ({activeAmbulances.length})
                </Button>
              </ButtonGroup>
            </Flex>

            <Box flex={1} overflowY="auto" p={4} sx={{ '&::-webkit-scrollbar': { width: '8px' }, '&::-webkit-scrollbar-thumb': { bg: '#3f3f46', borderRadius: '4px' } }}>
              {activeTab === 'emergencies' && (
                <VStack spacing={4} align="stretch">
                  <HStack spacing={3} mb={2}>
                    <Box flex={1} bg="#18181b" p={3} borderRadius="lg" border="1px solid #27272a" textAlign="center">
                      <Text fontSize="24px" fontWeight="900" color="#f59e0b">{pendingCount}</Text>
                      <Text fontSize="10px" color="#a1a1aa" fontWeight="800">PENDIENTES</Text>
                    </Box>
                    <Box flex={1} bg="#18181b" p={3} borderRadius="lg" border="1px solid #27272a" textAlign="center">
                      <Text fontSize="24px" fontWeight="900" color="#10b981">{assignedCount}</Text>
                      <Text fontSize="10px" color="#a1a1aa" fontWeight="800">ASIGNADOS</Text>
                    </Box>
                  </HStack>
                  {activeEmergencies.length === 0 ? (
                    <Box p={8} bg="#18181b" color="#a1a1aa" borderRadius="lg" border="1px dashed #3f3f46" textAlign="center">
                      <Icon as={FaCheckCircle} boxSize={10} color="#27272a" mb={3} />
                      <Text fontSize="14px" fontWeight="800">Bandeja de Urgencias Limpia</Text>
                    </Box>
                  ) : (
                    activeEmergencies.map((em) => <EmergencyCard key={em.callId} emergency={em} />)
                  )}
                </VStack>
              )}

              {activeTab === 'ambulances' && (
                <VStack spacing={4} align="stretch">
                  <HStack spacing={3} mb={2}>
                    <Box flex={1} bg="#18181b" p={3} borderRadius="lg" border="1px solid #27272a" textAlign="center">
                      <Text fontSize="24px" fontWeight="900" color="#10b981">{disponiblesCount}</Text>
                      <Text fontSize="10px" color="#a1a1aa" fontWeight="800">DISPONIBLES</Text>
                    </Box>
                    <Box flex={1} bg="#18181b" p={3} borderRadius="lg" border="1px solid #27272a" textAlign="center">
                      <Text fontSize="24px" fontWeight="900" color="#f59e0b">{activeAmbulances.filter(a => a.status === 'en_ruta').length}</Text>
                      <Text fontSize="10px" color="#a1a1aa" fontWeight="800">EN RUTA</Text>
                    </Box>
                  </HStack>
                  {activeAmbulances.length === 0 ? (
                    <Box p={8} bg="#18181b" color="#a1a1aa" borderRadius="lg" border="1px dashed #3f3f46" textAlign="center">
                      <Icon as={FaAmbulance} boxSize={10} color="#27272a" mb={3} />
                      <Text fontSize="14px" fontWeight="800">Sin Unidades Registradas</Text>
                    </Box>
                  ) : (
                    activeAmbulances.map((amb) => <AmbulanceCard key={amb.id} ambulance={amb} />)
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

// ---------- SUB-COMPONENTES ----------
const EmergencyCard = ({ emergency: em }) => {
  const statusColor = EMERGENCY_STATUS_COLORS[em.status] || '#64748b';
  const statusLabel = EMERGENCY_STATUS_LABELS[em.status] || (em.status || '').toUpperCase();
  return (
    <Box p={4} borderRadius="xl" bg="#18181b" border="1px solid #27272a" borderLeft="6px solid" borderLeftColor={statusColor}>
      <Flex justify="space-between" align="center" mb={2}>
        <Text fontWeight="900" color="#f8fafc" fontSize="16px">{em.callId?.replace('EM-', 'F-') || em.callId}</Text>
        <Badge fontSize="10px" fontWeight="900" px={2} py={1} borderRadius="md" bg={statusColor} color="white">{statusLabel}</Badge>
      </Flex>
      <Text fontSize="14px" fontWeight="800" color="#38bdf8" mb={1}>{em.emergencyType}</Text>
      {em.address && <Text fontSize="12px" color="#a1a1aa" noOfLines={1} mb={2}>📍 {em.address}</Text>}
      {em.status === 'assigned' && (
        <HStack spacing={2} mt={3} pt={3} borderTop="1px solid #27272a">
          <Icon as={FaAmbulance} color="#10b981" />
          <Text fontSize="13px" fontWeight="800" color="#10b981">{em.assignedAmbulanceName || em.assignedAmbulanceId}</Text>
        </HStack>
      )}
    </Box>
  );
};

const AMBULANCE_STATUS = {
  disponible: { color: '#10b981', label: 'DISPONIBLE' },
  en_ruta: { color: '#f59e0b', label: 'EN RUTA' },
  ocupado: { color: '#ef4444', label: 'OCUPADO' },
  fuera_de_servicio: { color: '#64748b', label: 'FUERA' },
};

const AmbulanceCard = ({ ambulance: amb }) => {
  const cfg = AMBULANCE_STATUS[amb.status] || { color: '#64748b', label: amb.status?.toUpperCase() };
  return (
    <Box p={4} borderRadius="xl" bg="#18181b" border="1px solid #27272a" borderLeft="6px solid" borderLeftColor={cfg.color}>
      <Flex justify="space-between" align="center">
        <Text fontWeight="900" color="#f8fafc" fontSize="15px">{amb.nombre || amb.placa}</Text>
        <Badge fontSize="10px" fontWeight="900" px={2} py={1} borderRadius="md" bg={cfg.color} color="white">{cfg.label}</Badge>
      </Flex>
      <Text fontSize="12px" color="#71717a" mt={1} fontWeight="700">{amb.tipo || 'UVI Móvil'}</Text>
    </Box>
  );
};

export default ReceptorDashboard;