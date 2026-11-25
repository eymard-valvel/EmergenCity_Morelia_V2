import React, { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  ChakraProvider,
  useToast,
  Button,
  Box,
  Text,
  Flex,
  Badge,
  HStack,
  VStack,
  Icon,
  IconButton,
  Drawer,
  DrawerBody,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  useDisclosure,
  useMediaQuery,
  Tooltip
} from "@chakra-ui/react";
import {
  FaSignOutAlt,
  FaFileMedical,
  FaVideo,
  FaBars,
  FaChevronLeft,
  FaChevronRight
} from "react-icons/fa";
import { FiActivity, FiWifiOff } from "react-icons/fi";
import logo from "../img/Logo.png";
import { useAuth } from "../../auth/useAuth";
import { deleteCookie } from "../../helpers/cookies";
import { resolveWsUrl } from "../../helpers/wsUrl.js";
import { clearEmergencyDB } from "../db/emergencyDB";

const WS_URL = resolveWsUrl();

function DoctorLayoutContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuth } = useAuth();
  const toast = useToast();
  const ws = useRef(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [unreadReports, setUnreadReports] = useState(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isDesktopLandscape] = useMediaQuery("(min-width: 1024px)");
  const { isOpen: isDrawerOpen, onOpen: onDrawerOpen, onClose: onDrawerClose } = useDisclosure();

  useEffect(() => {
    if (location.pathname.includes("/doctor/records")) {
      setUnreadReports(0);
    }
  }, [location.pathname]);

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
              <Box color="white" p={4} bg="#0ea5e9" borderRadius="lg" boxShadow="dark-lg" border="2px solid white" maxWidth="380px">
                <Flex align="center" mb={3}>
                  <Icon as={FaVideo} boxSize={7} mr={3} />
                  <Box>
                    <Text fontWeight="900" fontSize="md">SOLICITUD DE VIDEOLLAMADA</Text>
                    <Text fontSize="sm">Paramédico: {data.from?.id || 'EC-Paramedico'}</Text>
                    {data.callId && <Text fontSize="xs" opacity={0.9}>Folio: {data.callId}</Text>}
                    <Text fontSize="xs" opacity={0.9}>Sala: {sessionId}</Text>
                  </Box>
                </Flex>
                <HStack spacing={2}>
                  <Button
                    flex={1} h="46px" bg="white" color="#0ea5e9" fontWeight="900"
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
                    flex={0.6} h="46px" bg="transparent" color="white"
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
      } catch (e) {
        console.error('WS error:', e);
      }
    };

    socket.onclose = () => setWsConnected(false);

    return () => {
      try { socket.close(); } catch (_) {}
    };
  }, [toast]);

  const handleLogout = async () => {
    onDrawerClose();
    await clearEmergencyDB();
    setAuth(false);
    deleteCookie("role");
    if (ws.current) try { ws.current.close(); } catch (_) {}
    navigate("/login");
  };

  const renderSidebarContent = (compact = false, closeDrawerOnAction = false) => (
    <Flex direction="column" h="100%" w="100%" py={3}>
      <Flex
        align="center"
        justify={compact ? "center" : "space-between"}
        px={compact ? 2 : 4}
        pb={4}
        mb={4}
        borderBottom="1px solid #27272a"
        gap={2}
      >
        <Flex align="center" justify="center" flex={1}>
          <img
            src={logo}
            alt="EmergenCity"
            style={{
              maxWidth: compact ? '42px' : '82px',
              maxHeight: compact ? '42px' : '82px',
              objectFit: 'contain'
            }}
          />
        </Flex>
        {isDesktopLandscape && !closeDrawerOnAction && (
          <Tooltip label={compact ? "Expandir menú" : "Ocultar menú"} placement="right" hasArrow bg="#27272a" color="white">
            <IconButton
              size="sm"
              aria-label={compact ? "Expandir menú" : "Ocultar menú"}
              icon={compact ? <FaChevronRight /> : <FaChevronLeft />}
              bg="#27272a"
              color="#a1a1aa"
              _hover={{ bg: '#3f3f46', color: 'white' }}
              onClick={() => setIsSidebarCollapsed(prev => !prev)}
            />
          </Tooltip>
        )}
      </Flex>

      <VStack spacing={3} align="stretch" px={compact ? 2 : 3} flex={1} overflowY="auto">
        {compact ? (
          <Tooltip label={wsConnected ? 'EN LÍNEA' : 'DESCONECTADO'} placement="right" hasArrow bg="#27272a" color="white">
            <Flex
              justify="center"
              align="center"
              py={2.5}
              borderRadius="lg"
              bg={wsConnected ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}
              color={wsConnected ? '#10b981' : '#ef4444'}
            >
              <Icon as={wsConnected ? FiActivity : FiWifiOff} boxSize={4} />
            </Flex>
          </Tooltip>
        ) : (
          <Badge
            display="flex"
            alignItems="center"
            justifyContent="center"
            gap={2}
            px={3}
            py={2.5}
            borderRadius="lg"
            bg={wsConnected ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}
            color={wsConnected ? '#10b981' : '#ef4444'}
            fontSize="11px"
            fontWeight="900"
            letterSpacing="0.5px"
          >
            <Icon as={wsConnected ? FiActivity : FiWifiOff} boxSize={3.5} />
            {wsConnected ? 'EN LÍNEA' : 'DESCONECTADO'}
          </Badge>
        )}

        {compact ? (
          <Tooltip label="VIDEOLLAMADA" placement="right" hasArrow bg="#27272a" color="white">
            <IconButton
              id="botonLlamada"
              aria-label="Videollamada"
              icon={<FaVideo />}
              w="100%"
              h="50px"
              bg="#0ea5e9"
              color="white"
              fontSize="18px"
              _hover={{ bg: '#0284c7' }}
              onClick={() => {
                if (closeDrawerOnAction) onDrawerClose();
                navigate('/videocall');
              }}
            />
          </Tooltip>
        ) : (
          <Button
            id="botonLlamada"
            w="100%"
            h="52px"
            bg="#0ea5e9"
            color="white"
            fontSize="14px"
            fontWeight="900"
            leftIcon={<FaVideo />}
            _hover={{ bg: '#0284c7' }}
            onClick={() => {
              if (closeDrawerOnAction) onDrawerClose();
              navigate('/videocall');
            }}
          >
            VIDEOLLAMADA
          </Button>
        )}

        <NavLink
          to="/doctor/records"
          onClick={() => {
            setUnreadReports(0);
            if (closeDrawerOnAction) onDrawerClose();
          }}
          style={({ isActive }) => ({
            display: 'block',
            padding: compact ? '14px 8px' : '14px 16px',
            fontSize: '14px',
            fontWeight: 900,
            borderRadius: '8px',
            textDecoration: 'none',
            color: isActive ? '#38bdf8' : '#a1a1aa',
            background: isActive ? 'rgba(56,189,248,0.1)' : 'transparent',
            transition: 'all 0.15s'
          })}
        >
          {compact ? (
            <Tooltip label="REPORTES" placement="right" hasArrow bg="#27272a" color="white">
              <Flex align="center" justify="center" position="relative">
                <Icon as={FaFileMedical} boxSize={5} />
                {unreadReports > 0 && (
                  <Badge
                    position="absolute"
                    top="-6px"
                    right="4px"
                    bg="#ef4444"
                    color="white"
                    borderRadius="full"
                    fontSize="9px"
                    px={1.5}
                  >
                    {unreadReports}
                  </Badge>
                )}
              </Flex>
            </Tooltip>
          ) : (
            <Flex align="center" justify="space-between" gap={2}>
              <HStack spacing={3}>
                <Icon as={FaFileMedical} boxSize={4} />
                <Text>REPORTES</Text>
              </HStack>
              {unreadReports > 0 && (
                <Badge bg="#ef4444" color="white" borderRadius="full" px={2}>
                  {unreadReports}
                </Badge>
              )}
            </Flex>
          )}
        </NavLink>
      </VStack>

      <Box px={compact ? 2 : 3} pt={3} borderTop="1px solid #27272a">
        {compact ? (
          <Tooltip label="CERRAR SESIÓN" placement="right" hasArrow bg="#27272a" color="#ef4444">
            <IconButton
              aria-label="Cerrar sesión"
              icon={<FaSignOutAlt />}
              w="100%"
              h="48px"
              bg="transparent"
              color="#ef4444"
              border="1px solid #ef4444"
              _hover={{ bg: 'rgba(239,68,68,0.15)' }}
              onClick={handleLogout}
            />
          </Tooltip>
        ) : (
          <Button
            w="100%"
            h="48px"
            bg="transparent"
            color="#ef4444"
            border="1px solid #ef4444"
            fontSize="13px"
            fontWeight="900"
            leftIcon={<FaSignOutAlt />}
            _hover={{ bg: 'rgba(239,68,68,0.15)' }}
            onClick={handleLogout}
          >
            CERRAR SESIÓN
          </Button>
        )}
      </Box>
    </Flex>
  );

  return (
    <Flex
      direction={{ base: "column", lg: "row" }}
      w="100%"
      h="100dvh"
      bg="#09090b"
      color="#f8fafc"
      overflow="hidden"
    >
      {!isDesktopLandscape && (
        <Flex
          as="header"
          h="64px"
          w="100%"
          px={3}
          bg="#18181b"
          borderBottom="1px solid #27272a"
          align="center"
          justify="space-between"
          flexShrink={0}
          zIndex={20}
        >
          <HStack spacing={2.5} minW={0}>
            <Box position="relative">
              <IconButton
                aria-label="Abrir menú lateral"
                icon={<FaBars />}
                onClick={onDrawerOpen}
                bg="#27272a"
                color="white"
                border="1px solid #3f3f46"
                _hover={{ bg: '#3f3f46', borderColor: '#38bdf8' }}
                size="md"
              />
              {unreadReports > 0 && (
                <Badge
                  position="absolute"
                  top="-4px"
                  right="-4px"
                  bg="#ef4444"
                  color="white"
                  borderRadius="full"
                  fontSize="10px"
                  px={1.5}
                >
                  {unreadReports}
                </Badge>
              )}
            </Box>
            <img src={logo} alt="EmergenCity" style={{ width: '34px', height: '34px', objectFit: 'contain' }} />
            <Text fontSize="14px" fontWeight="900" letterSpacing="0.8px" color="white" noOfLines={1}>
              MÓDULO MÉDICO
            </Text>
          </HStack>

          <HStack spacing={2}>
            <Badge
              display="flex"
              alignItems="center"
              gap={1.5}
              px={2.5}
              py={1.5}
              borderRadius="lg"
              bg={wsConnected ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}
              color={wsConnected ? '#10b981' : '#ef4444'}
              fontSize="10px"
              fontWeight="900"
            >
              <Icon as={wsConnected ? FiActivity : FiWifiOff} boxSize={3} />
              <Text display={{ base: 'none', sm: 'inline' }}>
                {wsConnected ? 'EN LÍNEA' : 'OFFLINE'}
              </Text>
            </Badge>

            <Button
              size="sm"
              h="38px"
              px={3}
              bg="#0ea5e9"
              color="white"
              fontSize="12px"
              fontWeight="900"
              leftIcon={<FaVideo />}
              _hover={{ bg: '#0284c7' }}
              onClick={() => navigate('/videocall')}
            >
              <Text display={{ base: 'none', sm: 'inline' }}>VIDEOLLAMADA</Text>
            </Button>
          </HStack>
        </Flex>
      )}

      {isDesktopLandscape && (
        <Box
          as="nav"
          w={isSidebarCollapsed ? "76px" : "250px"}
          h="100%"
          bg="#18181b"
          borderRight="1px solid #27272a"
          flexShrink={0}
          transition="width 0.2s ease"
        >
          {renderSidebarContent(isSidebarCollapsed, false)}
        </Box>
      )}

      <Drawer isOpen={isDrawerOpen} placement="left" onClose={onDrawerClose} size="xs">
        <DrawerOverlay backdropFilter="blur(6px)" bg="rgba(0,0,0,0.75)" />
        <DrawerContent bg="#18181b" color="#f8fafc" borderRight="1px solid #27272a" maxW="270px">
          <DrawerCloseButton color="#a1a1aa" top={3} right={3} />
          <DrawerBody p={0}>
            {renderSidebarContent(false, true)}
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <Box flex={1} minW={0} h="100%" overflowY="auto" bg="#09090b">
        <Outlet />
      </Box>
    </Flex>
  );
}

export default function DoctorLayout() {
  return (
    <ChakraProvider>
      <DoctorLayoutContent />
    </ChakraProvider>
  );
}