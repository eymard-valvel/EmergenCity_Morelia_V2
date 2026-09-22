import React, { useEffect, useState, useRef, useCallback } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  ChakraProvider, Box, Button, VStack, Text, HStack, Badge, Modal, ModalOverlay,
  ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Spinner,
  SimpleGrid, Divider, Tag, useToast, Icon, Flex, Tooltip, IconButton, Alert, AlertIcon
} from "@chakra-ui/react";
import {
  FaUserMd, FaHeartbeat, FaAmbulance, FaFilePdf, FaSyncAlt, FaFolderOpen,
  FaCheckCircle, FaExclamationTriangle, FaClock, FaMapMarkerAlt
} from "react-icons/fa";
import { FiActivity, FiWifiOff } from "react-icons/fi";
import { resolveWsUrl } from '../../helpers/wsUrl.js';

const WS_URL = resolveWsUrl();
const API_URL = (import.meta.env.VITE_API || 'https://emergencity-morelia-v2.onrender.com').replace(/\/+$/, '');

const ReportesPage = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [liveUpdates, setLiveUpdates] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportHistory, setReportHistory] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const reportRef = useRef(null);
  const wsRef = useRef(null);
  const toast = useToast();

  const { isOpen: isReportModalOpen, onOpen: onReportModalOpen, onClose: onReportModalClose } = useDisclosure();

  const showToast = useCallback((status, title, description) => {
    toast({ title, description, status, duration: 4000, isClosable: true, position: 'top-right' });
  }, [toast]);

  // ==================== CARGA REST ====================
  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/reporte-prehospitalario/`);
      if (!response.ok) throw new Error('Error al cargar historial');
      const data = await response.json();
      const sorted = Array.isArray(data) ? data.sort((a, b) => (b.id_reporte || 0) - (a.id_reporte || 0)) : [];
      setReports(sorted);
    } catch (err) {
      console.warn('No se pudo cargar historial REST:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  // ==================== WS EN VIVO ====================
  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    wsRef.current = socket;

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

        if (data.type === 'doctor_reports_history') {
          // Cargar expedientes previos que el server tiene en memoria
          const historical = (data.reports || []).map(r => ({
            callId: r.callId,
            paciente: r.report?.seccionD ? {
              nombre: r.report.seccionD.nombre || 'Paciente',
              edad: r.report.seccionD.edad,
              sexo: r.report.seccionD.sexo,
              motivo_urgencia: r.report.seccionF?.motivo_principal,
              descripcion_lesion: r.report.seccionH?.lesiones_exposicion,
              observaciones: r.report.seccionN?.diagnostico_presuntivo
            } : null,
            signos_vitales: r.report?.seccionI ? {
              frecuencia_cardiaca: r.report.seccionI.fc,
              saturacion_oxigeno: r.report.seccionI.spo2,
              tension_arterial: r.report.seccionI.ta,
              nivel_glucosa: r.report.seccionI.glucemia
            } : null,
            intervenciones: r.report?.intervenciones || [],
            codigo_prioridad_color: r.report?.triaje?.color || '#ef4444',
            codigo_prioridad: r.report?.triaje?.label || 'TRIAGE',
            hora_estimada_llegada: r.report?.seccionN?.eta,
            id_ambulancia: r.ambulanceId,
            ubicacion_actual: r.report?.seccionC?.direccion,
            triaje: r.report?.triaje,
            glasgow: r.report?.glasgow,
            _live: true
          }));
          if (historical.length > 0) {
            setReports(prev => {
              const merged = [...historical];
              prev.forEach(p => {
                if (!merged.some(m => m.callId === p.callId)) merged.push(p);
              });
              return merged;
            });
          }
        }

        if (data.type === 'prehospital_report_broadcast') {
          // Reporte en vivo
          setLiveUpdates(prev => [data, ...prev].slice(0, 50));
          showToast('info', `Reporte v${data.version} recibido`, `Folio ${data.callId}`);
          // Refrescar tabla con datos del broadcast
          fetchReports();
        }

        if (data.type === 'doctor_assigned') {
          showToast('success', 'Paciente asignado', `Folio ${data.callId}`);
        }

        if (data.type === 'doctor_ack_broadcast') {
          // Confirmación de nuestro propio ack
        }
      } catch (e) {
        console.error('WS message error:', e);
      }
    };

    socket.onclose = () => setWsConnected(false);

    return () => { try { socket.close(); } catch (_) {} };
  }, [fetchReports, showToast]);

  // ==================== PDF ====================
  const generarPDFVisual = async () => {
    const input = reportRef.current;
    if (!input) return;

    try {
      const canvas = await html2canvas(input, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: input.scrollWidth,
        windowHeight: input.scrollHeight
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdf.internal.pageSize.getHeight();

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdf.internal.pageSize.getHeight();
      }

      pdf.save(`Expediente_${selectedReport?.paciente?.nombre || 'Paciente'}.pdf`);
      showToast('success', 'Expediente descargado', 'PDF generado correctamente');
    } catch (error) {
      console.error('Error PDF:', error);
      showToast('error', 'Error al generar PDF', 'Intente de nuevo');
    }
  };

  const limpiarTexto = (texto) => {
    if (!texto) return 'Ninguna.';
    return texto.replace(/\[VideoID:.*?\]/g, '').trim() || 'Ninguna.';
  };

  const verDetalles = (reporte) => {
    setSelectedReport(reporte);
    setReportHistory(reporte._versions || []);
    setSelectedVersion(reporte._versions?.length || null);
    onReportModalOpen();
  };

  return (
    <ChakraProvider>
      <Box bg="#09090b" minH="100vh" p={6} color="#f8fafc">
        {/* HEADER */}
        <Flex justify="space-between" align="center" mb={6}>
          <VStack align="start" spacing={0}>
            <Text fontSize="26px" fontWeight="900" letterSpacing="1px" color="white">
              PANEL MÉDICO
            </Text>
            <Text fontSize="13px" color="#a1a1aa">Pacientes y reportes prehospitalarios</Text>
          </VStack>
          <HStack spacing={3}>
            <Tooltip label="Actualizar historial" hasArrow bg="#18181b" color="white">
              <IconButton
                icon={<FaSyncAlt />} aria-label="Actualizar"
                onClick={fetchReports}
                bg="#18181b" color="#38bdf8"
                border="1px solid #3f3f46"
                _hover={{ bg: '#27272a', borderColor: '#38bdf8' }}
              />
            </Tooltip>
            <Badge
              display="flex" alignItems="center" gap={2} px={4} py={3} borderRadius="xl"
              bg={wsConnected ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}
              border="1px solid"
              borderColor={wsConnected ? '#10b981' : '#ef4444'}
              color={wsConnected ? '#10b981' : '#ef4444'}
              fontSize="12px" fontWeight="900"
            >
              <Icon as={wsConnected ? FiActivity : FiWifiOff} boxSize={4} />
              {wsConnected ? 'EN LÍNEA' : 'DESCONECTADO'}
            </Badge>
          </HStack>
        </Flex>

        {/* TABLA */}
        {loading ? (
          <Flex justify="center" py={20}>
            <Spinner size="xl" color="#38bdf8" thickness="4px" />
          </Flex>
        ) : (
          <Box bg="#18181b" borderRadius="xl" border="1px solid #27272a" overflow="hidden">
            <Box as="table" w="100%">
              <Box as="thead" bg="#0f0f10" borderBottom="1px solid #27272a">
                <Box as="tr">
                  <Box as="th" p={4} textAlign="left" fontSize="11px" fontWeight="900" color="#a1a1aa" letterSpacing="1px">FOLIO</Box>
                  <Box as="th" p={4} textAlign="left" fontSize="11px" fontWeight="900" color="#a1a1aa" letterSpacing="1px">PACIENTE</Box>
                  <Box as="th" p={4} textAlign="left" fontSize="11px" fontWeight="900" color="#a1a1aa" letterSpacing="1px">EDAD/SEXO</Box>
                  <Box as="th" p={4} textAlign="left" fontSize="11px" fontWeight="900" color="#a1a1aa" letterSpacing="1px">MOTIVO</Box>
                  <Box as="th" p={4} textAlign="left" fontSize="11px" fontWeight="900" color="#a1a1aa" letterSpacing="1px">PRIORIDAD</Box>
                  <Box as="th" p={4} textAlign="center" fontSize="11px" fontWeight="900" color="#a1a1aa" letterSpacing="1px">ACCIONES</Box>
                </Box>
              </Box>
              <Box as="tbody">
                {reports.length === 0 ? (
                  <Box as="tr">
                    <Box as="td" colSpan={6} p={10} textAlign="center">
                      <Icon as={FaFolderOpen} boxSize={10} color="#52525b" mb={3} />
                      <Text color="#a1a1aa" fontWeight="800">Sin expedientes pendientes.</Text>
                    </Box>
                  </Box>
                ) : reports.map((report, idx) => (
                  <Box as="tr" key={idx} borderBottom="1px solid #27272a" _hover={{ bg: '#1f1f23' }} transition="background 0.15s">
                    <Box as="td" p={4}>
                      <Text fontWeight="900" color="#38bdf8" fontSize="13px">
                        {report.callId || report.id_reporte || 'S/F'}
                      </Text>
                    </Box>
                    <Box as="td" p={4}>
                      <Text fontWeight="800" color="white">{report.paciente?.nombre || 'Desconocido'}</Text>
                    </Box>
                    <Box as="td" p={4}>
                      <Text color="#d4d4d8" fontSize="13px">
                        {report.paciente?.edad || '--'} años / {report.paciente?.sexo || '--'}
                      </Text>
                    </Box>
                    <Box as="td" p={4}>
                      <Text color="#d4d4d8" fontSize="13px" noOfLines={1} maxW="200px">
                        {report.paciente?.motivo_urgencia || 'General'}
                      </Text>
                    </Box>
                    <Box as="td" p={4}>
                      <Badge bg={report.codigo_prioridad_color || '#ef4444'} color="white" px={3} py={1} borderRadius="md" fontSize="11px" fontWeight="900">
                        {report.codigo_prioridad || 'TRIAGE'}
                      </Badge>
                    </Box>
                    <Box as="td" p={4} textAlign="center">
                      <Button
                        size="sm" h="45px" px={4}
                        bg="#0284c7" color="white"
                        fontSize="12px" fontWeight="900"
                        _hover={{ bg: '#0369a1' }}
                        onClick={() => verDetalles(report)}
                      >
                        VER EXPEDIENTE
                      </Button>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        )}

        {/* MODAL DE EXPEDIENTE */}
        <Modal isOpen={isReportModalOpen} onClose={onReportModalClose} size="5xl" scrollBehavior="inside">
          <ModalOverlay backdropFilter="blur(10px)" bg="rgba(0,0,0,0.85)" />
          <ModalContent bg="#09090b" border="1px solid #3f3f46" borderRadius="2xl" overflow="hidden">
            <ModalHeader bg="#18181b" borderBottom="1px solid #27272a" py={4}>
              <HStack justify="space-between">
                <HStack>
                  <Icon as={FaFolderOpen} color="#38bdf8" boxSize={6} />
                  <Text fontSize="20px" fontWeight="900" color="white">EXPEDIENTE CLÍNICO</Text>
                </HStack>
                {selectedReport?.codigo_prioridad_color && (
                  <Badge bg={selectedReport.codigo_prioridad_color} color="white" px={4} py={2} fontSize="14px" fontWeight="900" borderRadius="md">
                    {selectedReport.codigo_prioridad || 'TRIAGE'}
                  </Badge>
                )}
              </HStack>
            </ModalHeader>

            <ModalBody p={0} bg="#09090b">
              <Box ref={reportRef} p={8} bg="#09090b" color="white">
                {selectedReport && (
                  <VStack spacing={6} align="stretch">
                    {/* ENCABEZADO */}
                    <Box borderBottom="2px solid #38bdf8" pb={4}>
                      <Text fontSize="22px" fontWeight="900" color="#38bdf8">EMERGENCITY MORELIA</Text>
                      <Text fontSize="13px" color="#a1a1aa">
                        Reporte de Atención Prehospitalaria · Folio: {selectedReport.callId || '--'}
                      </Text>
                    </Box>

                    {/* PACIENTE */}
                    <Box bg="#18181b" p={5} borderRadius="xl" border="1px solid #27272a">
                      <HStack mb={3}>
                        <Icon as={FaUserMd} color="#38bdf8" />
                        <Text fontWeight="900" color="#38bdf8" fontSize="14px">IDENTIFICACIÓN</Text>
                      </HStack>
                      <SimpleGrid columns={2} spacing={4}>
                        <Box>
                          <Text fontSize="11px" color="#a1a1aa" fontWeight="900">NOMBRE</Text>
                          <Text fontSize="20px" fontWeight="900" color="white">
                            {selectedReport.paciente?.nombre || 'Desconocido'}
                          </Text>
                        </Box>
                        <HStack spacing={8}>
                          <Box>
                            <Text fontSize="11px" color="#a1a1aa" fontWeight="900">EDAD</Text>
                            <Text fontSize="18px" fontWeight="900" color="white">
                              {selectedReport.paciente?.edad || '--'} años
                            </Text>
                          </Box>
                          <Box>
                            <Text fontSize="11px" color="#a1a1aa" fontWeight="900">SEXO</Text>
                            <Text fontSize="18px" fontWeight="900" color="white">
                              {selectedReport.paciente?.sexo || '--'}
                            </Text>
                          </Box>
                        </HStack>
                      </SimpleGrid>
                    </Box>

                    {/* SIGNOS VITALES */}
                    <Box>
                      <HStack mb={3}>
                        <Icon as={FaHeartbeat} color="#ef4444" />
                        <Text fontWeight="900" color="#ef4444" fontSize="14px">SIGNOS VITALES</Text>
                      </HStack>
                      <SimpleGrid columns={4} spacing={3}>
                        {[
                          { label: 'FC', value: selectedReport.signos_vitales?.frecuencia_cardiaca, unit: 'bpm', color: '#ef4444' },
                          { label: 'SpO2', value: selectedReport.signos_vitales?.saturacion_oxigeno, unit: '%', color: '#38bdf8' },
                          { label: 'TA', value: selectedReport.signos_vitales?.tension_arterial, unit: 'mmHg', color: '#a78bfa' },
                          { label: 'GLUC', value: selectedReport.signos_vitales?.nivel_glucosa, unit: 'mg/dL', color: '#f59e0b' }
                        ].map((s, i) => (
                          <Box key={i} bg="#18181b" p={4} borderRadius="xl" border="1px solid #27272a" textAlign="center">
                            <Text fontSize="10px" color="#a1a1aa" fontWeight="900">{s.label}</Text>
                            <Text fontSize="26px" fontWeight="900" color={s.color} lineHeight="1">
                              {s.value || '--'}
                            </Text>
                            <Text fontSize="10px" color="#71717a">{s.unit}</Text>
                          </Box>
                        ))}
                      </SimpleGrid>
                    </Box>

                    {/* EVALUACIÓN */}
                    <Box bg="#18181b" p={5} borderRadius="xl" border="1px solid #27272a">
                      <HStack mb={3}>
                        <Icon as={FaExclamationTriangle} color="#f59e0b" />
                        <Text fontWeight="900" color="#f59e0b" fontSize="14px">EVALUACIÓN CLÍNICA</Text>
                      </HStack>
                      <VStack align="start" spacing={4}>
                        <Box w="100%">
                          <Text fontSize="11px" color="#a1a1aa" fontWeight="900">MOTIVO DE URGENCIA</Text>
                          <Text fontSize="16px" fontWeight="800" color="white">
                            {selectedReport.paciente?.motivo_urgencia || 'No especificado'}
                          </Text>
                        </Box>
                        <Box w="100%">
                          <Text fontSize="11px" color="#a1a1aa" fontWeight="900">DESCRIPCIÓN DE LESIONES</Text>
                          <Text fontSize="14px" color="#d4d4d8" mt={1}>
                            {selectedReport.paciente?.descripcion_lesion || 'Sin descripción detallada.'}
                          </Text>
                        </Box>
                      </VStack>
                    </Box>

                    {/* INTERVENCIONES */}
                    <Box>
                      <HStack mb={3}>
                        <Icon as={FaAmbulance} color="#10b981" />
                        <Text fontWeight="900" color="#10b981" fontSize="14px">INTERVENCIONES</Text>
                      </HStack>
                      {selectedReport.intervenciones?.length > 0 ? (
                        <VStack align="stretch" spacing={2}>
                          {selectedReport.intervenciones.map((iv, idx) => (
                            <Box key={idx} p={3} bg="#18181b" borderRadius="lg" border="1px solid #27272a" borderLeft="4px solid #10b981">
                              <HStack justify="space-between">
                                <Text fontWeight="900" color="white" fontSize="14px">{iv.tipo_intervencion}</Text>
                                <Badge bg="#27272a" color="#d4d4d8" fontSize="10px">{iv.hora_intervencion || 'S/H'}</Badge>
                              </HStack>
                              <Text fontSize="13px" color="#a1a1aa" mt={1}>{iv.descripcion}</Text>
                            </Box>
                          ))}
                        </VStack>
                      ) : (
                        <Text fontSize="13px" color="#71717a" fontStyle="italic">
                          No se registraron intervenciones.
                        </Text>
                      )}
                    </Box>

                    {/* OBSERVACIONES */}
                    <Box bg="#18181b" p={5} borderRadius="xl" border="1px solid #27272a">
                      <Text fontSize="11px" color="#a1a1aa" fontWeight="900" mb={2}>OBSERVACIONES</Text>
                      <Text fontSize="14px" color="white">
                        {limpiarTexto(selectedReport.paciente?.observaciones)}
                      </Text>
                    </Box>

                    {/* TRIAGE Y GLASGOW */}
                    {(selectedReport.triaje || selectedReport.glasgow) && (
                      <SimpleGrid columns={2} spacing={4}>
                        {selectedReport.triaje && (
                          <Box bg="#18181b" p={5} borderRadius="xl" border="1px solid #27272a" textAlign="center">
                            <Text fontSize="11px" color="#a1a1aa" fontWeight="900" mb={2}>TRIAGE</Text>
                            <Badge bg={selectedReport.triaje.color} color="white" px={4} py={2} fontSize="16px" fontWeight="900" borderRadius="md">
                              {selectedReport.triaje.label}
                            </Badge>
                          </Box>
                        )}
                        {selectedReport.glasgow && (
                          <Box bg="#18181b" p={5} borderRadius="xl" border="1px solid #27272a" textAlign="center">
                            <Text fontSize="11px" color="#a1a1aa" fontWeight="900" mb={2}>GLASGOW</Text>
                            <Text fontSize="26px" fontWeight="900" color="#38bdf8">
                              {selectedReport.glasgow.total}
                            </Text>
                          </Box>
                        )}
                      </SimpleGrid>
                    )}
                  </VStack>
                )}
              </Box>
            </ModalBody>

            <ModalFooter bg="#18181b" borderTop="1px solid #27272a" p={5}>
              <HStack w="100%" spacing={4}>
                <Button
                  flex={0.3} h="60px" variant="ghost" color="#a1a1aa"
                  fontSize="15px" fontWeight="900"
                  _hover={{ bg: '#27272a', color: 'white' }}
                  onClick={onReportModalClose}
                >
                  CERRAR
                </Button>
                <Button
                  flex={0.7} h="60px"
                  bg="#0284c7" color="white"
                  fontSize="16px" fontWeight="900"
                  leftIcon={<FaFilePdf />}
                  _hover={{ bg: '#0369a1' }}
                  onClick={generarPDFVisual}
                >
                  DESCARGAR PDF
                </Button>
              </HStack>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </Box>
    </ChakraProvider>
  );
};

export default ReportesPage;