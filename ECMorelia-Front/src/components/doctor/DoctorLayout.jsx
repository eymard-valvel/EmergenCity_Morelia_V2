import React, { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { ChakraProvider, useToast, Button, Box, Text, Flex, Badge, HStack, VStack, Icon, Tooltip } from "@chakra-ui/react";
import { FaUserMd, FaPhone, FaSignOutAlt, FaFileMedical, FaVideo } from "react-icons/fa";
import { FiActivity, FiWifiOff } from "react-icons/fi";
import logo from "../img/Logo.png";
import { useAuth } from "../../auth/useAuth";
import { deleteCookie } from "../../helpers/cookies";
import { resolveWsUrl } from "../../helpers/wsUrl.js";

const WS_URL = resolveWsUrl();

function DoctorLayoutContent() {
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  const toast = useToast();
  const ws = useRef(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [unreadReports, setUnreadReports] = useState(0);

  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    ws.current = socket;

    socket.onopen = () => {
      setWsConnected(true);
      socket.send(JSON.stringify({
  type: 'register_doctor',
  doctorId: `doc_${Date.now()}`,
  nombre: 'EC-Doctor',
  especialidad: 'Urgenciólogo'
}));
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'video_call_incoming') {
  const sessionId = data.sessionId;
  toast({
    position: 'top-right',
    duration: null,
    isClosable: true,
    render: ({ onClose }) => (
      <Box color="white" p={4} bg="#0ea5e9" borderRadius="lg" boxShadow="dark-lg" border="2px solid white" maxWidth="400px">
        <Flex align="center" mb={3}>
          <Icon as={FaVideo} boxSize={8} mr={3} />
          <Box>
            <Text fontWeight="900" fontSize="lg">SOLICITUD DE VIDEOLLAMADA</Text>
            <Text fontSize="sm">Paramédico: {data.from?.id || 'EC-Paramedico'}</Text>
            {data.callId && <Text fontSize="xs" opacity={0.9}>Folio: {data.callId}</Text>}
            <Text fontSize="xs" opacity={0.9}>Sala: {sessionId}</Text>
          </Box>
        </Flex>
        <HStack spacing={2}>
          <Button
            flex={1} h="50px" bg="white" color="#0ea5e9" fontWeight="900"
            _hover={{ bg: 'gray.100' }}
            onClick={() => {
              onClose();
              socket.send(JSON.stringify({ type: 'video_call_accept', sessionId }));
              window.open(`/videollamada?room=${sessionId}&role=doctor&user=EC-Doctor`, '_blank');
            }}
          >
            ACEPTAR
          </Button>
          <Button
            flex={0.6} h="50px" bg="transparent" color="white"
            border="2px solid white" fontWeight="900"
            _hover={{ bg: 'rgba(255,255,255,0.2)' }}
            onClick={() => {
              onClose();
              socket.send(JSON.stringify({ type: 'video_call_reject', sessionId, reason: 'No disponible' }));
            }}
          >
            RECHAZAR
          </Button>
        </HStack>
      </Box>
    )
  });
}

        if (data.type === 'prehospital_report_broadcast') {
          setUnreadReports(prev => prev + 1);
          toast({
            title: `Reporte v${data.version} recibido`,
            description: `Folio ${data.callId}`,
            status: 'info',
            duration: 4000,
            position: 'top-right'
          });
        }

        if (data.type === 'doctor_assigned') {
          toast({
            title: 'Paciente asignado',
            description: `Folio ${data.callId}`,
            status: 'success',
            duration: 5000,
            position: 'top-right'
          });
        }
      } catch (e) { console.error('WS error:', e); }
    };

    socket.onclose = () => setWsConnected(false);

    return () => { try { socket.close(); } catch (_) {} };
  }, [toast]);

  const handleLogout = () => {
    setAuth(false);
    deleteCookie("role");
    if (ws.current) try { ws.current.close(); } catch (_) {}
    navigate("/login");
  };

  const activeTab = "text-sky-400 bg-sky-400/10 font-semibold";

  return (
    <Box display="flex" w="100%" minH="100vh" bg="#09090b" color="#f8fafc">
      {/* SIDEBAR */}
      <Box as="nav" w="260px" bg="#18181b" borderRight="1px solid #27272a" display="flex" flexDirection="column" py={4} flexShrink={0}>
        <Flex justify="center" p={4} mb={6} borderBottom="1px solid #27272a">
          <img src={logo} alt="EmergenCity" style={{ maxWidth: '100px', maxHeight: '100px' }} />
        </Flex>

        <VStack spacing={2} align="stretch" px={3} flex={1}>
          {/* Estado WS */}
          <Badge
            display="flex" alignItems="center" gap={2} px={3} py={2} borderRadius="lg"
            bg={wsConnected ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}
            color={wsConnected ? '#10b981' : '#ef4444'}
            fontSize="11px" fontWeight="900" letterSpacing="0.5px"
          >
            <Icon as={wsConnected ? FiActivity : FiWifiOff} boxSize={3} />
            {wsConnected ? 'EN LÍNEA' : 'DESCONECTADO'}
          </Badge>

          {/* Botón videollamada manual */}
          <Button
            id="botonLlamada"
            w="100%" h="55px"
            bg="#0ea5e9" color="white"
            fontSize="15px" fontWeight="900"
            leftIcon={<FaVideo />}
            _hover={{ bg: '#0284c7' }}
            onClick={() => navigate('/videocall')}
          >
            VIDEOLLAMADA
          </Button>

          {/* NavLink Reportes */}
          <NavLink
            to="/doctor/records"
            style={({ isActive }) => ({
              display: 'block',
              padding: '14px 16px',
              fontSize: '15px',
              fontWeight: 900,
              borderRadius: '8px',
              textDecoration: 'none',
              color: isActive ? '#38bdf8' : '#a1a1aa',
              background: isActive ? 'rgba(56,189,248,0.1)' : 'transparent',
              transition: 'all 0.15s'
            })}
          >
            <Flex align="center" gap={3}>
              <Icon as={FaFileMedical} />
              <Text>REPORTES</Text>
              {unreadReports > 0 && (
                <Badge bg="#ef4444" color="white" borderRadius="full" px={2}>{unreadReports}</Badge>
              )}
            </Flex>
          </NavLink>
        </VStack>

        {/* Logout */}
        <Box px={3} mt="auto">
          <Button
            w="100%" h="50px"
            bg="transparent" color="#ef4444"
            border="1px solid #ef4444"
            fontSize="14px" fontWeight="900"
            leftIcon={<FaSignOutAlt />}
            _hover={{ bg: 'rgba(239,68,68,0.15)' }}
            onClick={handleLogout}
          >
            CERRAR SESIÓN
          </Button>
        </Box>
      </Box>

      {/* CONTENIDO */}
      <Box flex={1} p={6} overflowY="auto" bg="#09090b">
        <Outlet />
      </Box>
    </Box>
  );
}

export default function DoctorLayout() {
  return (
    <ChakraProvider>
      <DoctorLayoutContent />
    </ChakraProvider>
  );
}