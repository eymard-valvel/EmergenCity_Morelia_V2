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
import logo from '../img/Logo.png';

const WS_URL = resolveWsUrl();
const API_URL = (import.meta.env.VITE_API || 'https://emergencity-morelia-v2.onrender.com').replace(/\/+$/, '');

const hasValue = (v) => v !== undefined && v !== null && String(v).trim() !== '' && String(v).trim() !== '--';

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
  const heartbeatRef = useRef(null);
  const toast = useToast();

  const { isOpen: isReportModalOpen, onOpen: onReportModalOpen, onClose: onReportModalClose } = useDisclosure();

  const showToast = useCallback((status, title, description) => {
    toast({ title, description, status, duration: 4000, isClosable: true, position: 'top-right' });
  }, [toast]);

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
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          try { socket.send(JSON.stringify({ type: 'heartbeat' })); } catch (_) {}
        }
      }, 20000);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'doctor_reports_history') {
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
          setLiveUpdates(prev => [data, ...prev].slice(0, 50));
          showToast('info', `Reporte v${data.version} recibido`, `Folio ${data.callId}`);
          fetchReports();
        }

        if (data.type === 'doctor_assigned') {
          showToast('success', 'Paciente asignado', `Folio ${data.callId}`);
        }
      } catch (e) {
        console.error('WS message error:', e);
      }
    };

    socket.onclose = () => {
      setWsConnected(false);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      try { socket.close(); } catch (_) {}
    };
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

      pdf.save(`Expediente_${selectedReport?.paciente?.nombre || 'Paciente'}_${selectedReport?.callId || ''}.pdf`);
      showToast('success', 'Expediente descargado', 'PDF generado correctamente');
    } catch (error) {
      console.error('Error PDF:', error);
      showToast('error', 'Error al generar PDF', 'Intente de nuevo');
    }
  };

  const limpiarTexto = (texto) => {
    if (!texto) return '';
    return texto.replace(/\[VideoID:.*?\]/g, '').trim();
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
                  <Box as="tr" key={idx} borderBottom="1px solid #27272a" _hover={{ bg: '#1f1f23' }}>
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
                      <Button size="sm" h="45px" px={4} bg="#0284c7" color="white"
                        fontSize="12px" fontWeight="900" _hover={{ bg: '#0369a1' }}
                        onClick={() => verDetalles(report)}>
                        VER EXPEDIENTE
                      </Button>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        )}

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
              <Box ref={reportRef} p={8} bg="#ffffff" color="#0f172a" fontFamily="system-ui, -apple-system, sans-serif">
                {selectedReport && (
                  <VStack spacing={5} align="stretch">
                    {/* HEADER CON LOGO */}
                    <Flex align="center" justify="space-between" borderBottom="3px solid #0ea5e9" pb={4}>
                      <HStack spacing={4} align="center">
                        <Box w="70px" h="70px" display="flex" alignItems="center" justifyContent="center">
                          <img src={logo} alt="EmergenCity" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} crossOrigin="anonymous" />
                        </Box>
                        <Box>
                          <Text fontSize="22px" fontWeight="900" color="#0c4a6e" letterSpacing="1px" lineHeight="1.1">
                            EMERGENCITY MORELIA
                          </Text>
                          <Text fontSize="12px" fontWeight="800" color="#0284c7" letterSpacing="1px">
                            REPORTE DE ATENCIÓN PREHOSPITALARIA
                          </Text>
                          <Text fontSize="11px" color="#64748b" mt={0.5}>
                            Centro Regulador de Urgencias Médicas (CRUM)
                          </Text>
                        </Box>
                      </HStack>
                      <VStack align="end" spacing={1}>
                        <Box px={3} py={1} bg="#0c4a6e" color="white" borderRadius="md">
                          <Text fontSize="10px" fontWeight="900" letterSpacing="1px">FOLIO</Text>
                        </Box>
                        <Text fontSize="14px" fontWeight="900" color="#0c4a6e">
                          {selectedReport.callId || '--'}
                        </Text>
                        <Text fontSize="10px" color="#64748b" fontWeight="700">
                          {new Date().toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </VStack>
                    </Flex>

                    {/* TRIAGE + GLASGOW */}
                    {(hasValue(selectedReport.triaje?.label) || hasValue(selectedReport.glasgow?.total)) && (
                      <SimpleGrid columns={2} spacing={3}>
                        {hasValue(selectedReport.triaje?.label) && (
                          <Box bg="#f0f9ff" border="2px solid #0ea5e9" borderRadius="lg" p={3} textAlign="center">
                            <Text fontSize="10px" color="#0c4a6e" fontWeight="900" letterSpacing="1px">CLASIFICACIÓN TRIAGE</Text>
                            <Text fontSize="20px" fontWeight="900" color={selectedReport.triaje?.color || '#ef4444'} mt={1}>
                              {selectedReport.triaje.label}
                            </Text>
                          </Box>
                        )}
                        {hasValue(selectedReport.glasgow?.total) && (
                          <Box bg="#f0f9ff" border="2px solid #0ea5e9" borderRadius="lg" p={3} textAlign="center">
                            <Text fontSize="10px" color="#0c4a6e" fontWeight="900" letterSpacing="1px">ESCALA DE GLASGOW</Text>
                            <Text fontSize="20px" fontWeight="900" color="#0c4a6e" mt={1}>
                              {selectedReport.glasgow.total} / 15
                            </Text>
                          </Box>
                        )}
                      </SimpleGrid>
                    )}

                    {/* IDENTIFICACIÓN DEL PACIENTE */}
                    {(hasValue(selectedReport.paciente?.nombre) || hasValue(selectedReport.paciente?.edad) || hasValue(selectedReport.paciente?.sexo)) && (
                      <Box>
                        <Flex align="center" mb={2} gap={2}>
                          <Box w="4px" h="16px" bg="#0ea5e9" borderRadius="full" />
                          <Text fontSize="12px" fontWeight="900" color="#0c4a6e" letterSpacing="1px">IDENTIFICACIÓN DEL PACIENTE</Text>
                        </Flex>
                        <SimpleGrid columns={3} spacing={3}>
                          {hasValue(selectedReport.paciente?.nombre) && (
                            <Box bg="#f8fafc" p={3} borderRadius="md" border="1px solid #e2e8f0">
                              <Text fontSize="9px" color="#64748b" fontWeight="900" letterSpacing="0.5px">NOMBRE</Text>
                              <Text fontSize="14px" fontWeight="900" color="#0f172a">{selectedReport.paciente.nombre}</Text>
                            </Box>
                          )}
                          {hasValue(selectedReport.paciente?.edad) && (
                            <Box bg="#f8fafc" p={3} borderRadius="md" border="1px solid #e2e8f0">
                              <Text fontSize="9px" color="#64748b" fontWeight="900" letterSpacing="0.5px">EDAD</Text>
                              <Text fontSize="14px" fontWeight="900" color="#0f172a">{selectedReport.paciente.edad} años</Text>
                            </Box>
                          )}
                          {hasValue(selectedReport.paciente?.sexo) && (
                            <Box bg="#f8fafc" p={3} borderRadius="md" border="1px solid #e2e8f0">
                              <Text fontSize="9px" color="#64748b" fontWeight="900" letterSpacing="0.5px">SEXO</Text>
                              <Text fontSize="14px" fontWeight="900" color="#0f172a">{selectedReport.paciente.sexo}</Text>
                            </Box>
                          )}
                        </SimpleGrid>
                      </Box>
                    )}

                    {/* SIGNOS VITALES */}
                    {(() => {
                      const sv = selectedReport.signos_vitales || {};
                      const vitals = [
                        { label: 'FC', value: sv.frecuencia_cardiaca, unit: 'bpm', color: '#dc2626' },
                        { label: 'FR', value: sv.frecuencia_respiratoria, unit: 'rpm', color: '#0ea5e9' },
                        { label: 'SpO₂', value: sv.saturacion_oxigeno, unit: '%', color: '#0284c7' },
                        { label: 'T/A', value: sv.tension_arterial, unit: 'mmHg', color: '#7c3aed' },
                        { label: 'TEMP', value: sv.temperatura, unit: '°C', color: '#ea580c' },
                        { label: 'GLUC', value: sv.nivel_glucosa, unit: 'mg/dL', color: '#16a34a' },
                      ].filter(v => hasValue(v.value));
                      if (vitals.length === 0) return null;
                      return (
                        <Box>
                          <Flex align="center" mb={2} gap={2}>
                            <Box w="4px" h="16px" bg="#dc2626" borderRadius="full" />
                            <Text fontSize="12px" fontWeight="900" color="#0c4a6e" letterSpacing="1px">SIGNOS VITALES</Text>
                          </Flex>
                          <SimpleGrid columns={vitals.length >= 4 ? 3 : 2} spacing={3}>
                            {vitals.map((v, i) => (
                              <Box key={i} bg="#fef2f2" p={3} borderRadius="md" border="1px solid #fecaca" textAlign="center">
                                <Text fontSize="9px" color="#991b1b" fontWeight="900" letterSpacing="0.5px">{v.label}</Text>
                                <Text fontSize="20px" fontWeight="900" color={v.color} lineHeight="1.1">{v.value}</Text>
                                <Text fontSize="9px" color="#64748b" fontWeight="700">{v.unit}</Text>
                              </Box>
                            ))}
                          </SimpleGrid>
                        </Box>
                      );
                    })()}

                    {/* EVALUACIÓN CLÍNICA */}
                    {(hasValue(selectedReport.paciente?.motivo_urgencia) || hasValue(selectedReport.paciente?.descripcion_lesion)) && (
                      <Box>
                        <Flex align="center" mb={2} gap={2}>
                          <Box w="4px" h="16px" bg="#f59e0b" borderRadius="full" />
                          <Text fontSize="12px" fontWeight="900" color="#0c4a6e" letterSpacing="1px">EVALUACIÓN CLÍNICA</Text>
                        </Flex>
                        <Box bg="#fffbeb" p={4} borderRadius="md" border="1px solid #fde68a">
                          {hasValue(selectedReport.paciente?.motivo_urgencia) && (
                            <Box mb={hasValue(selectedReport.paciente?.descripcion_lesion) ? 3 : 0}>
                              <Text fontSize="9px" color="#92400e" fontWeight="900" letterSpacing="0.5px">MOTIVO DE URGENCIA</Text>
                              <Text fontSize="13px" fontWeight="800" color="#0f172a">{selectedReport.paciente.motivo_urgencia}</Text>
                            </Box>
                          )}
                          {hasValue(selectedReport.paciente?.descripcion_lesion) && (
                            <Box>
                              <Text fontSize="9px" color="#92400e" fontWeight="900" letterSpacing="0.5px">DESCRIPCIÓN DE LESIONES</Text>
                              <Text fontSize="13px" fontWeight="700" color="#0f172a">{selectedReport.paciente.descripcion_lesion}</Text>
                            </Box>
                          )}
                        </Box>
                      </Box>
                    )}

                    {/* INTERVENCIONES */}
                    {selectedReport.intervenciones?.length > 0 && (
                      <Box>
                        <Flex align="center" mb={2} gap={2}>
                          <Box w="4px" h="16px" bg="#10b981" borderRadius="full" />
                          <Text fontSize="12px" fontWeight="900" color="#0c4a6e" letterSpacing="1px">INTERVENCIONES REALIZADAS</Text>
                        </Flex>
                        <VStack align="stretch" spacing={2}>
                          {selectedReport.intervenciones
                            .filter(iv => hasValue(iv.tipo_intervencion) || hasValue(iv.descripcion))
                            .map((iv, idx) => (
                              <Flex key={idx} bg="#ecfdf5" p={3} borderRadius="md" border="1px solid #a7f3d0" gap={3} align="center">
                                {hasValue(iv.hora_intervencion) && (
                                  <Box bg="#10b981" color="white" px={2} py={1} borderRadius="sm">
                                    <Text fontSize="11px" fontWeight="900">{iv.hora_intervencion}</Text>
                                  </Box>
                                )}
                                <Box flex={1}>
                                  {hasValue(iv.tipo_intervencion) && (
                                    <Text fontSize="12px" fontWeight="900" color="#065f46">{iv.tipo_intervencion}</Text>
                                  )}
                                  {hasValue(iv.descripcion) && (
                                    <Text fontSize="11px" color="#0f172a" mt={hasValue(iv.tipo_intervencion) ? 0.5 : 0}>{iv.descripcion}</Text>
                                  )}
                                </Box>
                              </Flex>
                            ))}
                        </VStack>
                      </Box>
                    )}

                    {/* OBSERVACIONES */}
                    {hasValue(limpiarTexto(selectedReport.paciente?.observaciones)) && (
                      <Box>
                        <Flex align="center" mb={2} gap={2}>
                          <Box w="4px" h="16px" bg="#0ea5e9" borderRadius="full" />
                          <Text fontSize="12px" fontWeight="900" color="#0c4a6e" letterSpacing="1px">OBSERVACIONES</Text>
                        </Flex>
                        <Box bg="#f0f9ff" p={4} borderRadius="md" border="1px solid #bae6fd">
                          <Text fontSize="12px" color="#0f172a" fontWeight="600" whiteSpace="pre-wrap">
                            {limpiarTexto(selectedReport.paciente.observaciones)}
                          </Text>
                        </Box>
                      </Box>
                    )}

                    {/* FOOTER */}
                    <Box borderTop="2px solid #e2e8f0" pt={3} mt={2}>
                      <Flex justify="space-between" align="center">
                        <Text fontSize="9px" color="#64748b" fontWeight="700">
                          Documento generado por EmergenCity Morelia · CRUM
                        </Text>
                        <Text fontSize="9px" color="#64748b" fontWeight="700">
                          {new Date().toLocaleString('es-MX')}
                        </Text>
                      </Flex>
                    </Box>
                  </VStack>
                )}
              </Box>
            </ModalBody>

            <ModalFooter bg="#18181b" borderTop="1px solid #27272a" p={5}>
              <HStack w="100%" spacing={4}>
                <Button flex={0.3} h="60px" variant="ghost" color="#a1a1aa"
                  fontSize="15px" fontWeight="900"
                  _hover={{ bg: '#27272a', color: 'white' }}
                  onClick={onReportModalClose}>
                  CERRAR
                </Button>
                <Button flex={0.7} h="60px"
                  bg="#0284c7" color="white"
                  fontSize="16px" fontWeight="900"
                  leftIcon={<FaFilePdf />}
                  _hover={{ bg: '#0369a1' }}
                  onClick={generarPDFVisual}>
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