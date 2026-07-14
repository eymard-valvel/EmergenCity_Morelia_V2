// src/components/receptor/ReceptorDashboard.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, VStack, HStack, Heading, Text, Badge, useToast, Icon, Flex, Button
} from '@chakra-ui/react';
import { FaClipboardList, FaChevronRight, FaUserShield } from 'react-icons/fa';
import { FiActivity, FiWifiOff, FiLogOut } from 'react-icons/fi';
import logo from '../img/Logo.png';
import ReceptorEmergencyForm from './ReceptorEmergencyForm';

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

const ReceptorDashboard = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const [ws, setWs] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [activeEmergencies, setActiveEmergencies] = useState([]);
  const [monitorOpen, setMonitorOpen] = useState(false);

  const wsRef = useRef(null);
  const isMountedRef = useRef(true);
  const reconnectAttempts = useRef(0);
  const reconnectTimeoutRef = useRef(null);

  const wsConnected = connectionStatus === 'connected';

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
      };

      socket.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'active_emergencies_update') {
            setActiveEmergencies(data.emergencies || []);
          }
          if (data.type === 'new_emergency_broadcast' || data.type === 'emergency_pending_broadcast') {
            toast({
              title: 'NUEVA ALERTA CRÍTICA',
              description: `Folio: ${data.callId} requiere atención`,
              status: 'error',
              duration: 5000,
              isClosable: true,
              position: 'top-right'
            });
            socket.send(JSON.stringify({ type: 'request_active_emergencies' }));
          }
        } catch (error) {
          console.error('WS Error:', error);
        }
      };

      socket.onclose = () => {
        if (!isMountedRef.current) return;
        wsRef.current = null;
        if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          setConnectionStatus('disconnected');
          reconnectAttempts.current += 1;
          reconnectTimeoutRef.current = setTimeout(connectWS, RECONNECT_DELAY_MS);
        } else {
          setConnectionStatus('failed');
        }
      };

      setWs(socket);
    };

    connectWS();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.close();
    };
  }, [toast]);

  const requestRefresh = useCallback(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'request_active_emergencies' }));
    }
  }, [ws]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const statusMeta = {
    connected: { label: 'SISTEMA ONLINE', color: 'green', icon: FiActivity },
    connecting: { label: 'CONECTANDO...', color: 'yellow', icon: FiActivity },
    disconnected: { label: 'RECONECTANDO...', color: 'orange', icon: FiWifiOff },
    failed: { label: 'OFFLINE', color: 'red', icon: FiWifiOff },
  }[connectionStatus];

  return (
    <Box h="100vh" w="100vw" bg="#000000" overflow="hidden" display="flex" flexDirection="column">
      {/* HEADER INSTITUCIONAL C5 */}
      <Flex 
        as="nav" 
        h="65px" 
        w="100%" 
        background="linear-gradient(to right, #0f172a, #000000)" 
        px={6} 
        alignItems="center" 
        justifyContent="space-between" 
        borderBottom="2px solid #0284c7" 
        zIndex="1100" 
        shadow="lg"
      >
        <HStack spacing={5}>
          <img src={logo} alt="C5" style={{ width: '35px', height: 'auto', cursor: 'pointer' }} onClick={() => navigate('/')} />
          <VStack align="start" spacing={0} display={{ base: "none", sm: "flex" }}>
            <Heading size="sm" color="#ffffff" fontSize="15px" fontWeight="900" letterSpacing="2px">
              CONSOLA DE DESPACHO UNIFICADO
            </Heading>
            <Text color="#38bdf8" fontSize="10px" fontWeight="bold" letterSpacing="1px">CENTRO DE COMANDO C5</Text>
          </VStack>
        </HStack>

        <HStack spacing={6}>
          <Badge display="flex" alignItems="center" gap="6px" colorScheme={statusMeta.color} px={3} py={1.5} borderRadius="md" fontSize="11px" letterSpacing="1px">
            <Icon as={statusMeta.icon} boxSize={3.5} />
            {statusMeta.label}
          </Badge>
          
          <HStack spacing={3} bg="#1e293b" px={4} py={2} borderRadius="md" border="1px solid #334155" display={{ base: "none", md: "flex" }}>
            <Icon as={FaUserShield} color="#94a3b8" />
            <Text color="#e2e8f0" fontSize="12px" fontWeight="bold">OP: {user.nombre || 'RECEPCIÓN_01'}</Text>
          </HStack>

          <Button 
            leftIcon={<FiLogOut />} 
            bg="#dc2626" 
            color="#ffffff"
            variant="solid" 
            size="sm" 
            onClick={handleLogout}
            fontWeight="900"
            px={6}
            shadow="lg"
            _hover={{ bg: "#b91c1c", transform: "scale(1.03)" }}
            _active={{ bg: "#991b1b" }}
            transition="all 0.2s"
          >
            CERRAR SESIÓN
          </Button>
        </HStack>
      </Flex>

      {/* WORKSPACE PRINCIPAL */}
      <Flex flex={1} w="100%" overflow="hidden" position="relative">
        <Box flex={1} h="100%" overflow="hidden" minW={0}>
          <ReceptorEmergencyForm ws={ws} wsConnected={wsConnected} onEmergencySent={requestRefresh} />
        </Box>

        {/* BOTÓN LATERAL DE MONITOREO */}
        {!monitorOpen && (
          <Button
            position="absolute"
            right="0"
            top="50%"
            transform="translateY(-50%)"
            h="140px"
            w="45px"
            bg="#0284c7"
            color="white"
            onClick={() => setMonitorOpen(true)}
            zIndex={20}
            borderStartRadius="xl"
            borderEndRadius="0"
            boxShadow="-4px 0 15px rgba(2, 132, 199, 0.4)"
            _hover={{ bg: '#0369a1', w: '55px' }}
            transition="all 0.2s ease"
            p={0}
          >
            <VStack spacing={4}>
              <Icon as={FaClipboardList} boxSize={6} />
              {activeEmergencies.length > 0 && (
                <Badge colorScheme="red" borderRadius="full" px={2} fontSize="12px">
                  {activeEmergencies.length}
                </Badge>
              )}
            </VStack>
          </Button>
        )}

        <Box h="100%" w={monitorOpen ? { base: '100%', md: '350px' } : '0px'} minW={monitorOpen ? { base: '100%', md: '350px' } : '0px'} overflow="hidden" bg="#0f172a" borderLeft={monitorOpen ? '2px solid #1e293b' : 'none'} transition="width 0.3s cubic-bezier(0.4, 0, 0.2, 1)" position="relative" zIndex={15} shadow="2xl">
          <VStack spacing={0} h="100%" align="stretch" w="100%">
            <Flex align="center" justify="space-between" px={4} py={4} bg="#1e293b" borderBottom="1px solid #334155">
              <HStack>
                <Icon as={FaClipboardList} color="#38bdf8" />
                <Text fontSize="13px" fontWeight="900" color="#f8fafc" letterSpacing="1px">FOLIOS ACTIVOS ({activeEmergencies.length})</Text>
              </HStack>
              <Button size="sm" variant="ghost" color="#cbd5e1" _hover={{ bg: '#334155' }} onClick={() => setMonitorOpen(false)}>
                <FaChevronRight />
              </Button>
            </Flex>
            <Box flex={1} overflowY="auto" p={3} sx={{ '&::-webkit-scrollbar': { width: '6px' }, '&::-webkit-scrollbar-thumb': { background: '#475569', borderRadius: '10px' } }}>
              <VStack spacing={3} align="stretch">
                {activeEmergencies.length === 0 ? (
                  <Box p={4} bg="#1e293b" color="#94a3b8" borderRadius="md" border="1px solid #334155" textAlign="center">
                    <Text fontSize="13px" fontWeight="bold">Operaciones sin folios pendientes.</Text>
                  </Box>
                ) : (
                  activeEmergencies.map((em) => (
                    <Box key={em.callId} p={3} borderRadius="md" borderLeft="4px solid" borderLeftColor={em.status === 'assigned' ? '#10b981' : '#f59e0b'} bg="#1e293b" borderRight="1px solid #334155" borderTop="1px solid #334155" borderBottom="1px solid #334155" shadow="sm">
                      <Flex justify="space-between" align="center" mb={2}>
                        <Text fontWeight="bold" color="#e2e8f0" fontSize="13px">F-{em.callId.split('_')[1]}</Text>
                        <Text color="#94a3b8" fontSize="11px" fontFamily="mono">{new Date(em.timestamp).toLocaleTimeString()}</Text>
                      </Flex>
                      <Text fontSize="14px" fontWeight="bold" color="#38bdf8" isTruncated>{em.emergencyType}</Text>
                    </Box>
                  ))
                )}
              </VStack>
            </Box>
          </VStack>
        </Box>
      </Flex>
    </Box>
  );
};

export default ReceptorDashboard;