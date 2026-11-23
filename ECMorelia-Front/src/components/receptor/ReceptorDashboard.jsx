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
import { readLocal, saveLocal } from '../../helpers/persistence.js';

const HEARTBEAT_INTERVAL_MS = 25_000;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 15_000;

function getReceptorId(user) {
  const base = user?.id || user?.nombre || 'receptor';
  const stored = sessionStorage.getItem('receptorId');
  if (stored) return stored;
  const newId = `${base}_${Date.now().toString(36)}`;
  sessionStorage.setItem('receptorId', newId);
  return newId;
}

const STATUS_META = {
  connected:    { label: 'SISTEMA ONLINE',  color: '#10b981', icon: FiActivity },
  connecting:   { label: 'CONECTANDO...',   color: '#f59e0b', icon: FiActivity },
  disconnected: { label: 'RECONECTANDO...', color: '#f97316', icon: FiWifiOff  },
  failed:       { label: 'OFFLINE',         color: '#ef4444', icon: FiWifiOff  },
};

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
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const heartbeatTimerRef = useRef(null);

  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('emergencies');

  const wsConnected = connectionStatus === 'connected';

  const [activeEmergencies, setActiveEmergencies] = useState(
    () => readLocal('receptor', 'activeEmergencies', [])
  );
  const [activeAmbulances, setActiveAmbulances] = useState(
    () => readLocal('receptor', 'activeAmbulances', [])
  );
  const [serviceHistory, setServiceHistory] = useState(
    () => readLocal('receptor', 'serviceHistory', [])
  );

  useEffect(() => { saveLocal('receptor', 'activeEmergencies', activeEmergencies); }, [activeEmergencies]);
  useEffect(() => { saveLocal('receptor', 'activeAmbulances', activeAmbulances); }, [activeAmbulances]);
  useEffect(() => { saveLocal('receptor', 'serviceHistory', serviceHistory); }, [serviceHistory]);

  const send = useCallback((payload) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(payload)); return true; } catch (_) {}
    }
    return false;
  }, []);

  const startHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    heartbeatTimerRef.current = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })); } catch (_) {}
      }
    }, HEARTBEAT_INTERVAL_MS);
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const handleMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'active_emergencies_update':
        setActiveEmergencies(msg.emergencies || []);
        break;

      case 'active_ambulances_update':
        setActiveAmbulances(msg.ambulances || []);
        break;

      case 'ambulance_location_update':
        setActiveAmbulances(prev =>
          prev.map(a => a.id === msg.ambulanceId
            ? { ...a, location: msg.location, speed: msg.speed, heading: msg.heading, status: msg.status }
            : a)
        );
        break;

      case 'ambulance_status_changed':
        setActiveAmbulances(prev =>
          prev.map(a => a.id === msg.ambulanceId ? { ...a, status: msg.newStatus } : a)
        );
        break;

      case 'emergency_assigned_ack':
      case 'emergency_assigned_broadcast':
        toast({
          title: 'Ambulancia asignada',
          description: msg.message || `Unidad ${msg.ambulanceName || msg.ambulanceId} en camino`,
          status: 'success',
          duration: 4000,
          isClosable: true,
        });
        break;

      case 'emergency_assignment_failed':
      case 'emergency_pending_broadcast':
        toast({
          title: 'Sin unidades disponibles',
          description: msg.message || 'Tu emergencia está en espera',
          status: 'warning',
          duration: 5000,
          isClosable: true,
        });
        break;

      case 'emergency_completed_broadcast':
        setServiceHistory(prev => {
          const em = activeEmergencies.find(e => e.callId === msg.callId);
          if (!em) return prev;
          const entry = { ...em, completedAt: new Date().toISOString(), completedBy: msg.completedBy };
          return [entry, ...prev].slice(0, 50);
        });
        setActiveEmergencies(prev => prev.filter(e => e.callId !== msg.callId));
        toast({
          title: 'Servicio finalizado',
          description: `Folio ${msg.callId}`,
          status: 'info',
          duration: 4000,
          isClosable: true,
        });
        break;

      case 'heartbeat_ack':
      case 'connection_established':
      case 'receptor_registered':
        break;

      case 'error':
        console.warn('[WS error]', msg.code, msg.message);
        break;

      default:
        break;
    }
  }, [toast, activeEmergencies]);

  const resyncAfterReconnect = useCallback(() => {
    send({ type: 'register_receptor', receptorId, nombre: user.nombre || user.name || receptorId });
    send({ type: 'request_active_emergencies' });
    send({ type: 'request_active_ambulances' });
  }, [send, receptorId, user]);

  useEffect(() => {
    isMountedRef.current = true;

    const scheduleReconnect = () => {
      if (!isMountedRef.current) return;
      const attempt = reconnectAttemptsRef.current;
      const delay = Math.min(RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt), RECONNECT_MAX_DELAY_MS);
      reconnectAttemptsRef.current = attempt + 1;
      setConnectionStatus('disconnected');
      reconnectTimerRef.current = setTimeout(connectWS, delay);
    };

    const connectWS = () => {
      if (!isMountedRef.current) return;
      try {
        const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3002/ws';
        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;
        setConnectionStatus('connecting');

        socket.onopen = () => {
          if (!isMountedRef.current) { try { socket.close(); } catch (_) {} return; }
          setConnectionStatus('connected');
          reconnectAttemptsRef.current = 0;
          if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
          resyncAfterReconnect();
          startHeartbeat();
        };

        socket.onmessage = (event) => {
          if (!isMountedRef.current) return;
          let msg;
          try { msg = JSON.parse(event.data); } catch { return; }
          handleMessage(msg);
        };

        socket.onerror = () => {
          if (!isMountedRef.current) return;
          setConnectionStatus('disconnected');
        };

        socket.onclose = () => {
          if (!isMountedRef.current) return;
          stopHeartbeat();
          if (reconnectAttemptsRef.current >= 20) {
            setConnectionStatus('failed');
            return;
          }
          scheduleReconnect();
        };
      } catch (e) {
        setConnectionStatus('failed');
      }
    };

    connectWS();

    return () => {
      isMountedRef.current = false;
      stopHeartbeat();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      const ws = wsRef.current;
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        try { ws.close(); } catch (_) {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => {
    try { sessionStorage.removeItem('receptorId'); } catch (_) {}
    try { deleteCookie('token'); } catch (_) {}
    try { setAuth(null); } catch (_) {}
    navigate('/login');
  };

  const handleCompleteService = (callId) => {
    send({ type: 'receptor_complete_service', callId });
  };

  const statusMeta = STATUS_META[connectionStatus] || STATUS_META.connecting;

  return (
    <Box minH="100vh" bg="#0f172a" color="white" p={4}>
      <Flex justify="space-between" align="center" mb={4}>
        <HStack spacing={3}>
          <img src={logo} alt="EmergenCity" style={{ height: 40 }} />
          <Heading size="md">Central de Receptores</Heading>
        </HStack>
        <HStack spacing={3}>
          <HStack spacing={2} px={3} py={1} borderRadius="full" bg={`${statusMeta.color}22`}>
            <Icon as={statusMeta.icon} color={statusMeta.color} />
            <Text fontSize="xs" fontWeight="bold" color={statusMeta.color}>{statusMeta.label}</Text>
          </HStack>
          <Tooltip label="Cerrar sesión">
            <IconButton
              aria-label="Logout"
              icon={<FaSignOutAlt />}
              size="sm"
              variant="ghost"
              color="white"
              onClick={handleLogout}
            />
          </Tooltip>
        </HStack>
      </Flex>

      <HStack mb={4} spacing={2}>
        <Button
          size="sm"
          leftIcon={<FaClipboardList />}
          colorScheme={activeTab === 'emergencies' ? 'blue' : 'gray'}
          onClick={() => setActiveTab('emergencies')}
        >
          Emergencias ({activeEmergencies.length})
        </Button>
        <Button
          size="sm"
          leftIcon={<FaAmbulance />}
          colorScheme={activeTab === 'ambulances' ? 'blue' : 'gray'}
          onClick={() => setActiveTab('ambulances')}
        >
          Ambulancias ({activeAmbulances.length})
        </Button>
        <Button
          size="sm"
          leftIcon={<FaCheckCircle />}
          colorScheme={activeTab === 'history' ? 'blue' : 'gray'}
          onClick={() => setActiveTab('history')}
        >
          Historial ({serviceHistory.length})
        </Button>
        {!wsConnected && (
          <Badge colorScheme="red" ml={2}>
            Sin conexión — reconectando…
          </Badge>
        )}
      </HStack>

      <Divider mb={4} borderColor="#1e293b" />

      {activeTab === 'emergencies' && (
        <VStack align="stretch" spacing={3}>
          <ReceptorEmergencyForm wsConnected={wsConnected} sendMessage={send} />
          <Heading size="sm" mt={4}>Emergencias Activas</Heading>
          {activeEmergencies.length === 0 && (
            <Text color="#64748b" fontSize="sm">Sin emergencias activas.</Text>
          )}
          {activeEmergencies.map(em => (
            <Box key={em.callId} p={3} bg="#1e293b" borderRadius="md">
              <HStack justify="space-between" mb={1}>
                <Text fontWeight="bold" fontSize="sm">{em.callId}</Text>
                <Badge bg={EMERGENCY_STATUS_COLORS[em.status] || '#64748b'} color="white">
                  {EMERGENCY_STATUS_LABELS[em.status] || em.status}
                </Badge>
              </HStack>
              <Text fontSize="xs" color="#cbd5e1">{em.address}</Text>
              <Text fontSize="xs" color="#94a3b8">{em.emergencyType}</Text>
              {em.assignedAmbulanceName && (
                <HStack mt={2} spacing={2}>
                  <Icon as={FaAmbulance} color="#10b981" />
                  <Text fontSize="xs" color="#10b981">{em.assignedAmbulanceName}</Text>
                </HStack>
              )}
              <Button
                mt={2}
                size="xs"
                colorScheme="red"
                variant="outline"
                leftIcon={<FaTimes />}
                onClick={() => handleCompleteService(em.callId)}
              >
                Cerrar servicio
              </Button>
            </Box>
          ))}
        </VStack>
      )}

      {activeTab === 'ambulances' && (
        <VStack align="stretch" spacing={2}>
          {activeAmbulances.length === 0 && (
            <Text color="#64748b" fontSize="sm">Sin ambulancias conectadas.</Text>
          )}
          {activeAmbulances.map(a => (
            <Box key={a.id} p={3} bg="#1e293b" borderRadius="md">
              <HStack justify="space-between">
                <HStack spacing={2}>
                  <Icon as={FaAmbulance} color="#38bdf8" />
                  <Text fontWeight="bold" fontSize="sm">{a.nombre || a.placa}</Text>
                </HStack>
                <Badge colorScheme={a.status === 'disponible' ? 'green' : a.status === 'en_ruta' ? 'blue' : 'orange'}>
                  {a.status}
                </Badge>
              </HStack>
              {a.location && (
                <Text fontSize="xs" color="#94a3b8">
                  {a.location.lat?.toFixed(5)}, {a.location.lng?.toFixed(5)}
                </Text>
              )}
            </Box>
          ))}
        </VStack>
      )}

      {activeTab === 'history' && (
        <VStack align="stretch" spacing={2}>
          {serviceHistory.length === 0 && (
            <Text color="#64748b" fontSize="sm">Sin historial aún.</Text>
          )}
          {serviceHistory.map(h => (
            <Box key={`${h.callId}-${h.completedAt}`} p={3} bg="#1e293b" borderRadius="md">
              <HStack justify="space-between">
                <Text fontSize="sm" fontWeight="bold">{h.callId}</Text>
                <Badge colorScheme="green">CERRADA</Badge>
              </HStack>
              <Text fontSize="xs" color="#94a3b8">{h.address}</Text>
              <Text fontSize="xs" color="#64748b">
                {new Date(h.completedAt).toLocaleString('es-MX')}
              </Text>
            </Box>
          ))}
        </VStack>
      )}
    </Box>
  );
};

export default ReceptorDashboard;