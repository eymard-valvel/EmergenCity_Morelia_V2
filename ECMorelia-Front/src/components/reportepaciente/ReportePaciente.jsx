import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import VoiceAssistant from '../pln/VoiceAssistant';
import { useGlasgow } from '../hooks/useGlasgow';
import { resolveWsUrl } from '../../helpers/wsUrl.js';

const WS_URL = resolveWsUrl();

const API_URL = (import.meta.env.VITE_API || 'https://emergencity-morelia-v2.onrender.com').replace(/\/+$/, '');
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const ReportePaciente = () => {
  const navigate = useNavigate();
  const [theme, setTheme] = useState('dark');
  const [listaHospitales, setListaHospitales] = useState([]);
  const [hospitalSeleccionado, setHospitalSeleccionado] = useState('');
  const [mensajeNotificacion, setMensajeNotificacion] = useState({ texto: '', tipo: '' });
  const [socket, setSocket] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [intervencionActual, setIntervencionActual] = useState({ tipo_intervencion: '', descripcion: '', hora_intervencion: '' });
  const [ubicacion, setUbicacion] = useState({ lat: null, lng: null, direccion: '' });
  const [obteniendoUbicacion, setObteniendoUbicacion] = useState(false);

  // Vinculación de unidad
  const [isConfigured, setIsConfigured] = useState(false);
  const [configInicial, setConfigInicial] = useState({
    ambulanciaId: '',
    operador: '',
    paramedico1: '',
    paramedico2: ''
  });
  const [listaAmbulancias, setListaAmbulancias] = useState([]);
  const [ambulanciasCargadas, setAmbulanciasCargadas] = useState(false);

  // Estado de hospital aceptado (desbloquea envío de versiones)
  const [hospitalAceptado, setHospitalAceptado] = useState(null);

  const [reporte, setReporte] = useState({
    id_ambulancia: '',
    callId: '',
    tripulacion: {},
    seccionA: { folio: '', fecha: new Date().toISOString().split('T')[0], tipo_servicio: 'Urgencia' },
    seccionB: { activacion: '', salida_base: '', llegada_escena: '', primer_contacto: '', salida_escena: '', llegada_hospital: '', entrega_paciente: '', liberacion_unidad: '' },
    seccionC: { direccion: '', municipio: '', estado: '', tipo_lugar: 'Vía pública', tipo_lugar_otro: '' },
    seccionD: { nombre: '', edad: '', sexo: '', peso: '', paciente_identificado: 'Sí', acompanante: '', telefono: '' },
    seccionE: { alergias: '', medicamentos: '', enfermedades: '', ultima_comida: '', embarazo: 'No' },
    seccionF: { tipo_urgencia: '', motivo_principal: '' },
    seccionG: { mecanismo: '', otro_mecanismo: '' },
    seccionH: { via_aerea: 'Libre', ventilacion: 'Adecuada', circulacion_pulso: 'Periférico', lesiones_exposicion: '' },
    seccionI: { fc: '', fr: '', ta: '', pam: '', spo2: '', temp: '', glucemia: '', eva: '', hora_toma: '' },
    seccionK: { cabeza: '', torax: '', abdomen: '', extremidades: '' },
    intervenciones: [],
    seccionN: { eta: '', diagnostico_presuntivo: '', necesidades: '' },
    seccionOP: { area_receptora: 'Urgencias', medico_recibe: '', estado_final: 'Estable' },
    riesgos_escena: ''
  });

  const { ocular, setOcular, verbal, setVerbal, motor, setMotor, total, getTriageLevel } = useGlasgow(4, 5, 6);
  const triaje = getTriageLevel(total);

  // ==================== WS PERMANENTE (para vinculación) ====================
  const wsRef = useRef(null);

  useEffect(() => {
    // Conexión temprana para poder listar ambulancias activas
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setWsConnected(true);
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'active_ambulances_update') {
          setListaAmbulancias(data.ambulances || []);
          setAmbulanciasCargadas(true);
        }
      } catch (_) {}
    };
    ws.onclose = () => setWsConnected(false);

    return () => { try { ws.close(); } catch (_) {} };
  }, []);

  useEffect(() => {
    // Solicitar la lista cada vez que se abre la vista
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'request_active_ambulances' }));
    }
  }, [wsConnected]);

  // Recuperar config guardada
  useEffect(() => {
    const guardado = localStorage.getItem('tripulacionConfig');
    if (guardado) {
      try {
        const parsed = JSON.parse(guardado);
        setConfigInicial(parsed);
        setReporte(prev => ({ ...prev, id_ambulancia: parsed.ambulanciaId, tripulacion: parsed }));
        setIsConfigured(true);
      } catch (_) {}
    }
  }, []);

  const guardarConfiguracion = (e) => {
    e.preventDefault();
    if (!configInicial.ambulanciaId.trim() || !configInicial.paramedico1.trim()) {
      mostrarNotificacion('Unidad y Paramédico responsable son obligatorios', 'error');
      return;
    }
    localStorage.setItem('tripulacionConfig', JSON.stringify(configInicial));
    setReporte(prev => ({ ...prev, id_ambulancia: configInicial.ambulanciaId, tripulacion: configInicial }));
    setIsConfigured(true);

    // Registrar como paramédico en el WS
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'register_paramedic',
        paramedicId: `pm_${configInicial.paramedico1}_${Date.now()}`,
        nombre: configInicial.paramedico1,
        ambulanceId: configInicial.ambulanciaId
      }));
    }
  };

  // ==================== WS OPERATIVO (tras vinculación) ====================
useEffect(() => {
  if (!isConfigured) return;
  const ws = wsRef.current;
  if (!ws) return;

  const safeSend = (payload) => {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(payload)); return true; } catch (_) { return false; }
    }
    return false;
  };

  const registerParamedic = () => {
    if (!configInicial.ambulanciaId || !configInicial.paramedico1) return;
    safeSend({
      type: 'register_paramedic',
      paramedicId: `pm_${configInicial.paramedico1}_${Date.now()}`,
      nombre: configInicial.paramedico1,
      ambulanceId: configInicial.ambulanciaId
    });
  };

  const handleMessage = async (event) => {
    // ⚠️ Pega aquí tu handler existente — no lo modifiques
    const data = event.data instanceof Blob ? await event.data.text() : event.data;
    try {
      const parsed = JSON.parse(data);

      if (parsed.type === 'active_hospitals_update') {
        setListaHospitales(parsed.hospitals || []);
      }
      if (parsed.type === 'new_emergency_assigned') {
        mostrarNotificacion(`Emergencia asignada: ${parsed.callId}`, 'success');
        setReporte(prev => ({
          ...prev,
          callId: parsed.callId,
          seccionA: { ...prev.seccionA, folio: parsed.callId },
          seccionC: { ...prev.seccionC, direccion: parsed.address || prev.seccionC.direccion },
          seccionF: {
            ...prev.seccionF,
            tipo_urgencia: parsed.emergencyType || '',
            motivo_principal: parsed.notes || ''
          },
          riesgos_escena: parsed.patientInfo?.riesgos || ''
        }));
      }
      if (parsed.type === 'operator_emergency_created') {
        mostrarNotificacion(`Emergencia creada: ${parsed.callId}`, 'success');
        setReporte(prev => ({
          ...prev,
          callId: parsed.callId,
          seccionA: { ...prev.seccionA, folio: parsed.callId }
        }));
      }
      if (parsed.type === 'hospital_accepted_for_call') {
        setHospitalAceptado({
          callId: parsed.callId,
          hospitalId: parsed.hospitalId,
          hospitalInfo: parsed.hospitalInfo
        });
        if (parsed.callId === reporte.callId) {
          setHospitalSeleccionado(parsed.hospitalId);
          mostrarNotificacion(`Hospital ${parsed.hospitalInfo?.nombre || ''} aceptó — reporte habilitado`, 'success');
        }
      }
      if (parsed.type === 'prehospital_report_ack') {
        mostrarNotificacion(`Reporte v${parsed.version} enviado`, 'success');
      }
      if (parsed.type === 'active_ambulances_update') {
        setListaAmbulancias(parsed.ambulances || []);
      }
    } catch (e) { console.error('WS error:', e); }
  };

  const handleOpen = () => {
    registerParamedic();
  };

  ws.addEventListener('message', handleMessage);
  ws.addEventListener('open', handleOpen);

  // Si el socket ya estaba abierto al montar este efecto, registrar ya
  if (ws.readyState === WebSocket.OPEN) {
    registerParamedic();
  }

  return () => {
    ws.removeEventListener('message', handleMessage);
    ws.removeEventListener('open', handleOpen);
  };
}, [isConfigured, configInicial.ambulanciaId, configInicial.paramedico1, reporte.callId]);

  // Cargar hospitales vía REST como respaldo
  useEffect(() => {
    const cargarHospitales = async () => {
      try {
        const r = await fetch(`${API_URL}/hospital`);
        if (r.ok) {
          const data = await r.json();
          if (Array.isArray(data) && data.length > 0) setListaHospitales(data);
        }
      } catch (_) {}
    };
    if (isConfigured) cargarHospitales();
  }, [isConfigured]);

  // Ubicación
  useEffect(() => {
    if (navigator.geolocation && isConfigured) {
      setObteniendoUbicacion(true);
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setUbicacion(prev => ({ ...prev, lat: latitude, lng: longitude }));
          try {
            const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${MAPBOX_TOKEN}&language=es`);
            if (r.ok) {
              const data = await r.json();
              const direccion = data.features?.[0]?.place_name || 'Ubicación desconocida';
              setUbicacion(prev => ({ ...prev, direccion }));
              setReporte(prev => (!prev.seccionC.direccion ? { ...prev, seccionC: { ...prev.seccionC, direccion } } : prev));
            }
          } catch (_) {}
          setObteniendoUbicacion(false);
        },
        () => setObteniendoUbicacion(false),
        { enableHighAccuracy: true }
      );
    }
  }, [isConfigured]);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  const handleChange = (path, value) => {
    setReporte(prev => {
      const updated = { ...prev };
      let current = updated;
      for (let i = 0; i < path.length - 1; i++) {
        current[path[i]] = { ...current[path[i]] };
        current = current[path[i]];
      }
      current[path[path.length - 1]] = value;
      return updated;
    });
  };

  const agregarIntervencion = () => {
    if (intervencionActual.tipo_intervencion.trim() || intervencionActual.descripcion.trim()) {
      setReporte(prev => ({
        ...prev,
        intervenciones: [...prev.intervenciones, {
          ...intervencionActual,
          hora_intervencion: intervencionActual.hora_intervencion || new Date().toTimeString().slice(0, 5)
        }]
      }));
      setIntervencionActual({ tipo_intervencion: '', descripcion: '', hora_intervencion: '' });
      mostrarNotificacion('Intervención agregada', 'success');
    }
  };

  const eliminarIntervencion = (index) => {
    setReporte(prev => ({ ...prev, intervenciones: prev.intervenciones.filter((_, i) => i !== index) }));
  };

  const mostrarNotificacion = (texto, tipo = 'info') => {
    setMensajeNotificacion({ texto, tipo });
    setTimeout(() => setMensajeNotificacion({ texto: '', tipo: '' }), 4000);
  };

  const handleNLPData = (data) => {
    // Mapeo simple: si VoiceAssistant envía datos estructurados, se fusionan
    if (data && typeof data === 'object') {
      setReporte(prev => {
        const updated = { ...prev };
        Object.entries(data).forEach(([key, value]) => {
          if (key.includes('.')) {
            const [section, field] = key.split('.');
            if (updated[section]) updated[section] = { ...updated[section], [field]: value };
          }
        });
        return updated;
      });
    }
    mostrarNotificacion('Datos de voz procesados', 'success');
  };


  const solicitarMedico = () => {
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
    mostrarNotificacion('Sin conexión al servidor', 'error');
    return;
  }
  if (!hospitalAceptado) {
    mostrarNotificacion('Esperando aceptación del hospital', 'warning');
    return;
  }

  wsRef.current.send(JSON.stringify({
    type: 'video_call_request',
    from: {
      role: 'paramedic',
      id: `pm_${configInicial.paramedico1}_${configInicial.ambulanciaId}`
    },
    to: {
      role: 'doctor',
      id: 'any' // broadcast a cualquier doctor disponible
    },
    callId: reporte.callId,
    ambulanceId: configInicial.ambulanciaId
  }));

  mostrarNotificacion('Solicitud de médico enviada...', 'info');
};

  // ==================== ENVÍO DE VERSIONES ====================
  const enviarVersion = (urgentOnly = false) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      mostrarNotificacion('Sin conexión al servidor', 'error');
      return;
    }

    const payload = {
      type: 'prehospital_report_update',
      callId: reporte.callId,
      ambulanceId: reporte.id_ambulancia,
      hospitalId: hospitalAceptado?.hospitalId || hospitalSeleccionado,
      urgentOnly,
      report: {
        seccionA: reporte.seccionA,
        seccionB: reporte.seccionB,
        seccionC: reporte.seccionC,
        seccionD: reporte.seccionD,
        seccionE: reporte.seccionE,
        seccionF: reporte.seccionF,
        seccionG: reporte.seccionG,
        seccionH: reporte.seccionH,
        seccionI: reporte.seccionI,
        seccionK: reporte.seccionK,
        seccionN: reporte.seccionN,
        seccionOP: reporte.seccionOP,
        intervenciones: reporte.intervenciones,
        glasgow: { ocular, verbal, motor, total },
        triaje,
        riesgos_escena: reporte.riesgos_escena
      },
      patientInfo: {
        nombre: reporte.seccionD.nombre,
        edad: reporte.seccionD.edad,
        sexo: reporte.seccionD.sexo,
        condition: triaje.label,
        glasgow: total
      }
    };

    wsRef.current.send(JSON.stringify(payload));
    mostrarNotificacion(urgentOnly ? 'Enviando datos urgentes...' : 'Enviando actualización completa...', 'info');
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!hospitalAceptado) {
      mostrarNotificacion('Esperando aceptación del hospital', 'error');
      return;
    }
    enviarVersion(false);

    // Persistir en backend
    try {
      const response = await fetch(`${API_URL}/reporte-prehospitalario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...reporte,
          hospitalId: hospitalAceptado.hospitalId,
          glasgow: { ocular, verbal, motor, total },
          triaje
        })
      });
      if (response.ok) mostrarNotificacion('Reporte sincronizado', 'success');
    } catch (_) {
      mostrarNotificacion('Error de conexión al persistir', 'error');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('tripulacionConfig');
    if (wsRef.current) try { wsRef.current.close(); } catch (_) {}
    navigate('/login');
  };

  // ==================== VISTA 1: VINCULACIÓN ====================
  if (!isConfigured) {
    return (
      <div className="reporte-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0f172a', color: '#f1f5f9', padding: '20px' }}>
        <style>{`
          .setup-container { width: 100%; max-width: 480px; padding: 28px; background: #1e293b; border-radius: 16px; border: 1px solid #334155; }
          .setup-header { text-align: center; margin-bottom: 24px; }
          .setup-header h2 { margin: 0 0 8px 0; font-size: 1.4rem; color: #38bdf8; letter-spacing: 1px; }
          .setup-header p { opacity: 0.7; font-size: 0.9rem; margin: 0; }
          .form-group { margin-bottom: 16px; }
          .form-group label { display: block; font-size: 0.75rem; font-weight: 700; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.8; }
          .form-group input, .form-group select { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #334155; background: rgba(0,0,0,0.2); color: #f1f5f9; font-size: 1rem; }
          .form-group select:focus, .form-group input:focus { outline: none; border-color: #38bdf8; }
          .btn-primary { width: 100%; padding: 14px; background: #2563eb; color: white; border: none; border-radius: 8px; font-size: 1rem; font-weight: 700; cursor: pointer; }
          .btn-primary:hover { background: #1d4ed8; }
          .btn-primary:disabled { background: #475569; cursor: not-allowed; }
          .ambulance-option { display: block; width: 100%; padding: 14px; margin-bottom: 8px; background: #0f172a; border: 2px solid #334155; border-radius: 10px; color: #f1f5f9; font-size: 0.95rem; cursor: pointer; text-align: left; }
          .ambulance-option:hover { border-color: #38bdf8; }
          .ambulance-option.selected { border-color: #10b981; background: rgba(16,185,129,0.1); }
          .status-line { font-size: 0.75rem; color: #94a3b8; margin-top: 4px; }
        `}</style>

        <div className="setup-container">
          <div className="setup-header">
            <h2>VINCULAR UNIDAD</h2>
            <p>Seleccione la ambulancia a la que estará asignado en este turno</p>
            {!wsConnected && <p style={{ color: '#f59e0b', marginTop: 8, fontSize: '0.8rem' }}>Conectando al servidor central...</p>}
          </div>

          <form onSubmit={guardarConfiguracion}>
            <div className="form-group">
              <label>Unidad activa en el sistema *</label>
              {!ambulanciasCargadas && <p className="status-line">Cargando unidades activas...</p>}
              {ambulanciasCargadas && listaAmbulancias.length === 0 && (
                <p className="status-line" style={{ color: '#f59e0b' }}>No hay ambulancias activas. Pida al operador conectarse primero.</p>
              )}
              {listaAmbulancias.map(amb => (
                <button
                  key={amb.id}
                  type="button"
                  className={`ambulance-option ${configInicial.ambulanciaId === amb.id ? 'selected' : ''}`}
                  onClick={() => setConfigInicial({ ...configInicial, ambulanciaId: amb.id })}
                >
                  <div style={{ fontWeight: 900, fontSize: '1rem' }}>{amb.id} — {amb.nombre || amb.placa}</div>
                  <div className="status-line">
                    {amb.tipo || 'UVI Móvil'} · {(amb.status || '').replace('_', ' ').toUpperCase()}
                  </div>
                </button>
              ))}
            </div>

            <div className="form-group">
              <label>Paramédico Responsable *</label>
              <input type="text" value={configInicial.paramedico1}
                onChange={e => setConfigInicial({ ...configInicial, paramedico1: e.target.value })}
                placeholder="Nombre completo" required />
            </div>

            <div className="form-group">
              <label>Operador / Conductor</label>
              <input type="text" value={configInicial.operador}
                onChange={e => setConfigInicial({ ...configInicial, operador: e.target.value })}
                placeholder="Opcional" />
            </div>

            <div className="form-group">
              <label>Paramédico Auxiliar</label>
              <input type="text" value={configInicial.paramedico2}
                onChange={e => setConfigInicial({ ...configInicial, paramedico2: e.target.value })}
                placeholder="Opcional" />
            </div>

            <button type="submit" className="btn-primary" disabled={!configInicial.ambulanciaId || !configInicial.paramedico1.trim()}>
              INICIAR OPERACIÓN
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ==================== VISTA 2: REPORTE ====================
  const puedeEnviar = !!hospitalAceptado;

  return (
    <div className={`reporte-root ${theme === 'dark' ? 'theme-dark' : 'theme-light'}`}>
      <style>{`
        :root {
          --bg-light: #f5f7fa; --panel-light: #ffffff; --text-light: #2c3e50;
          --bg-dark: #0f172a; --panel-dark: #1e293b; --text-dark: #f1f5f9;
          --accent: #2563eb; --accent-hover: #1d4ed8;
          --border-light: #e2e8f0; --border-dark: #334155;
          --danger: #ef4444; --warning: #f59e0b; --success: #10b981;
        }
        * { box-sizing: border-box; }
        .reporte-root { min-height: 100vh; padding-bottom: 140px; font-family: system-ui, -apple-system, sans-serif; }
        [data-theme="light"] .reporte-root { background: var(--bg-light); color: var(--text-light); }
        [data-theme="dark"] .reporte-root { background: var(--bg-dark); color: var(--text-dark); }
        .container { max-width: 768px; margin: 0 auto; padding: 16px; }
        .header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; background: var(--panel-light); padding: 16px; border-radius: 12px; border: 1px solid var(--border-light); }
        [data-theme="dark"] .header { background: var(--panel-dark); border-color: var(--border-dark); }
        .brand { display: flex; align-items: center; gap: 12px; }
        .logo { width: 36px; height: 36px; border-radius: 8px; background: linear-gradient(135deg, var(--accent), #0ea5e9); }
        .header-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .triage-indicator { display: flex; align-items: center; gap: 8px; }
        .triage-circle { width: 40px; height: 40px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.2); }
        .logout-btn { background: transparent; border: 1px solid var(--danger); padding: 8px 14px; border-radius: 8px; cursor: pointer; color: var(--danger); font-weight: 700; font-size: 0.85rem; }
        .icon-btn { background: transparent; border: 1px solid var(--border-light); padding: 8px; border-radius: 8px; cursor: pointer; color: inherit; }
        [data-theme="dark"] .icon-btn { border-color: var(--border-dark); }
        .status-banner { background: var(--panel-light); border-left: 4px solid var(--accent); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 0.9rem; border: 1px solid var(--border-light); }
        [data-theme="dark"] .status-banner { background: var(--panel-dark); border-color: var(--border-dark); }
        .banner-warn { border-left-color: var(--warning); }
        .banner-success { border-left-color: var(--success); background: rgba(16,185,129,0.08); }
        details { background: var(--panel-light); border-radius: 10px; margin-bottom: 12px; border: 1px solid var(--border-light); overflow: hidden; }
        [data-theme="dark"] details { background: var(--panel-dark); border-color: var(--border-dark); }
        .priority-red { border-left: 4px solid var(--danger); }
        .priority-yellow { border-left: 4px solid var(--warning); }
        .priority-green { border-left: 4px solid var(--success); }
        summary { font-weight: 600; padding: 16px; cursor: pointer; user-select: none; list-style: none; display: flex; justify-content: space-between; align-items: center; font-size: 1rem; }
        summary::-webkit-details-marker { display: none; }
        summary:after { content: '+'; font-size: 1.2em; font-weight: 300; opacity: 0.5; }
        details[open] summary:after { content: '-'; }
        details[open] summary { border-bottom: 1px solid var(--border-light); }
        [data-theme="dark"] details[open] summary { border-bottom-color: var(--border-dark); }
        .section-content { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        label { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.75; margin-bottom: 6px; display: block; }
        input, select, textarea { width: 100%; padding: 11px; border-radius: 8px; border: 1px solid var(--border-light); background: var(--bg-light); font-size: 1rem; color: inherit; font-family: inherit; }
        [data-theme="dark"] input, [data-theme="dark"] select, [data-theme="dark"] textarea { border-color: var(--border-dark); background: rgba(0,0,0,0.2); }
        input:focus, select:focus, textarea:focus { outline: none; border-color: var(--accent); }
        .bottom-action-area { position: fixed; bottom: 0; left: 0; width: 100%; background: var(--panel-light); border-top: 1px solid var(--border-light); padding: 14px; z-index: 100; box-shadow: 0 -10px 20px rgba(0,0,0,0.2); display: flex; flex-direction: column; gap: 10px; }
        [data-theme="dark"] .bottom-action-area { background: var(--panel-dark); border-top-color: var(--border-dark); }
        .pln-container { width: 100%; display: flex; justify-content: center; }
        .btn-row { display: flex; gap: 10px; }
        .btn-sync { flex: 1; padding: 16px; background: var(--success); color: white; border: none; border-radius: 12px; font-size: 1rem; font-weight: 700; cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px; }
        .btn-sync:hover:not(:disabled) { opacity: 0.9; }
        .btn-sync:disabled { background: #475569; cursor: not-allowed; opacity: 0.6; }
        .btn-urgent { flex: 0.6; padding: 16px; background: var(--warning); color: #000; border: none; border-radius: 12px; font-size: 0.95rem; font-weight: 700; cursor: pointer; text-transform: uppercase; }
        .btn-urgent:hover:not(:disabled) { opacity: 0.9; }
        .btn-urgent:disabled { background: #475569; color: #cbd5e1; cursor: not-allowed; opacity: 0.6; }
        .toast { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); padding: 12px 24px; border-radius: 8px; color: white; font-weight: 600; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-size: 0.9rem; }
        .toast.success { background: var(--success); }
        .toast.error { background: var(--danger); }
        .toast.info { background: var(--accent); }
        @media (max-width: 480px) { .grid-3 { grid-template-columns: 1fr 1fr; } }
      `}</style>

      {mensajeNotificacion.texto && (
        <div className={`toast ${mensajeNotificacion.tipo}`}>{mensajeNotificacion.texto}</div>
      )}

      <div className="container">
        <div className="header">
          <div className="brand">
            <div className="logo" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Emergencity</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Unidad {configInicial.ambulanciaId}</div>
            </div>
          </div>
          <div className="header-actions">
            <div className="triage-indicator">
              <div className="triage-circle" style={{ background: triaje.color }} />
              <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{triaje.label}</span>
              <span style={{ fontSize: '12px', opacity: 0.6 }}>GCS: {total}</span>
            </div>
            <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} className="icon-btn">
              {theme === 'light' ? 'NOCHE' : 'DÍA'}
            </button>
            <button onClick={handleLogout} className="logout-btn">CERRAR SESIÓN</button>
          </div>
        </div>

        {reporte.callId ? (
          hospitalAceptado ? (
            <div className="status-banner banner-success">
              <div><strong>Folio:</strong> {reporte.callId}</div>
              <div style={{ fontSize: '0.82rem', marginTop: 4 }}>
                Hospital destino: <strong>{hospitalAceptado.hospitalInfo?.nombre || hospitalAceptado.hospitalId}</strong>
              </div>
              <div style={{ fontSize: '0.78rem', opacity: 0.85, marginTop: 2 }}>
                Puede enviar versiones del reporte prehospitalario.
              </div>
            </div>
          ) : (
            <div className="status-banner banner-warn">
              <div><strong>Folio:</strong> {reporte.callId}</div>
              <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
                Esperando aceptación del hospital para habilitar el envío del reporte.
              </div>
            </div>
          )
        ) : (
          <div className="status-banner banner-warn">
            <div style={{ fontSize: '0.85rem' }}>
              Esperando asignación del sistema central (Unidad: {configInicial.ambulanciaId}).
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <details className="priority-red" open>
            <summary>A y F. Datos y Motivo</summary>
            <div className="section-content">
              <div className="grid-2">
                <div><label>Folio</label><input type="text" readOnly value={reporte.seccionA.folio || 'Pendiente'} disabled /></div>
                <div><label>Fecha</label><input type="date" value={reporte.seccionA.fecha} onChange={e => handleChange(['seccionA', 'fecha'], e.target.value)} /></div>
                <div>
                  <label>Tipo Servicio</label>
                  <select value={reporte.seccionA.tipo_servicio} onChange={e => handleChange(['seccionA', 'tipo_servicio'], e.target.value)}>
                    <option>Urgencia</option><option>Traslado</option><option>Cuidados Intensivos</option>
                  </select>
                </div>
                <div>
                  <label>Tipo Urgencia</label>
                  <select value={reporte.seccionF.tipo_urgencia} onChange={e => handleChange(['seccionF', 'tipo_urgencia'], e.target.value)}>
                    <option value="">Seleccione...</option>
                    <option>Accidente vehicular</option><option>Motociclista lesionado</option>
                    <option>Atropellamiento</option><option>Caída</option>
                    <option>Agresión</option><option>Persona inconsciente</option>
                    <option>Otro</option>
                  </select>
                </div>
              </div>
              <div>
                <label>Motivo principal / Notas</label>
                <textarea rows="3" value={reporte.seccionF.motivo_principal} onChange={e => handleChange(['seccionF', 'motivo_principal'], e.target.value)} placeholder="Describa el motivo..." />
              </div>
              {reporte.riesgos_escena && (
                <div>
                  <label>Riesgos en Escena</label>
                  <input type="text" readOnly value={reporte.riesgos_escena} disabled style={{ color: 'var(--danger)', fontWeight: 'bold' }} />
                </div>
              )}
              <div className="grid-3">
                <div><label>Activación</label><input type="time" value={reporte.seccionB.activacion} onChange={e => handleChange(['seccionB', 'activacion'], e.target.value)} /></div>
                <div><label>Salida Base</label><input type="time" value={reporte.seccionB.salida_base} onChange={e => handleChange(['seccionB', 'salida_base'], e.target.value)} /></div>
                <div><label>En Escena</label><input type="time" value={reporte.seccionB.llegada_escena} onChange={e => handleChange(['seccionB', 'llegada_escena'], e.target.value)} /></div>
              </div>
            </div>
          </details>

          <details className="priority-yellow">
            <summary>C y D. Localización y Paciente</summary>
            <div className="section-content">
              <div>
                <label>Dirección del Incidente</label>
                <input type="text" value={reporte.seccionC.direccion} onChange={e => handleChange(['seccionC', 'direccion'], e.target.value)} placeholder="Calle, Número, Colonia..." />
              </div>
              <div className="grid-2">
                <div>
                  <label>Tipo de lugar</label>
                  <select value={reporte.seccionC.tipo_lugar} onChange={e => handleChange(['seccionC', 'tipo_lugar'], e.target.value)}>
                    <option>Vía pública</option><option>Hogar</option><option>Trabajo</option><option>Otro</option>
                  </select>
                </div>
                <div><label>Nombre del Paciente</label><input type="text" value={reporte.seccionD.nombre} onChange={e => handleChange(['seccionD', 'nombre'], e.target.value)} placeholder="Desconocido" /></div>
                <div><label>Edad Aprox.</label><input type="number" value={reporte.seccionD.edad} onChange={e => handleChange(['seccionD', 'edad'], e.target.value)} /></div>
                <div>
                  <label>Sexo</label>
                  <select value={reporte.seccionD.sexo} onChange={e => handleChange(['seccionD', 'sexo'], e.target.value)}>
                    <option value="">Seleccione</option><option value="M">Masculino</option><option value="F">Femenino</option>
                  </select>
                </div>
              </div>
            </div>
          </details>

          <details className="priority-yellow">
            <summary>H. Evaluación Primaria y Glasgow</summary>
            <div className="section-content">
              <div className="grid-2">
                <div><label>Vía Aérea</label><select value={reporte.seccionH.via_aerea} onChange={e => handleChange(['seccionH', 'via_aerea'], e.target.value)}><option>Libre</option><option>Comprometida</option></select></div>
                <div><label>Ventilación</label><select value={reporte.seccionH.ventilacion} onChange={e => handleChange(['seccionH', 'ventilacion'], e.target.value)}><option>Adecuada</option><option>Dificultosa</option></select></div>
              </div>
              <div style={{ padding: '14px', background: 'var(--bg-light)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Total Glasgow: {total}</span>
                </div>
                <div className="grid-3">
                  <div><label>Ocular</label><select value={ocular} onChange={e => setOcular(Number(e.target.value))}><option value={4}>4</option><option value={3}>3</option><option value={2}>2</option><option value={1}>1</option></select></div>
                  <div><label>Verbal</label><select value={verbal} onChange={e => setVerbal(Number(e.target.value))}><option value={5}>5</option><option value={4}>4</option><option value={3}>3</option><option value={2}>2</option><option value={1}>1</option></select></div>
                  <div><label>Motor</label><select value={motor} onChange={e => setMotor(Number(e.target.value))}><option value={6}>6</option><option value={5}>5</option><option value={4}>4</option><option value={3}>3</option><option value={2}>2</option><option value={1}>1</option></select></div>
                </div>
              </div>
            </div>
          </details>

          <details className="priority-yellow">
            <summary>I. Signos Vitales</summary>
            <div className="section-content">
              <div className="grid-3">
                <div><label>FC</label><input type="number" value={reporte.seccionI.fc} onChange={e => handleChange(['seccionI', 'fc'], e.target.value)} /></div>
                <div><label>FR</label><input type="number" value={reporte.seccionI.fr} onChange={e => handleChange(['seccionI', 'fr'], e.target.value)} /></div>
                <div><label>SpO₂</label><input type="number" value={reporte.seccionI.spo2} onChange={e => handleChange(['seccionI', 'spo2'], e.target.value)} /></div>
                <div><label>T/A</label><input type="text" placeholder="120/80" value={reporte.seccionI.ta} onChange={e => handleChange(['seccionI', 'ta'], e.target.value)} /></div>
                <div><label>Temp</label><input type="number" step="0.1" value={reporte.seccionI.temp} onChange={e => handleChange(['seccionI', 'temp'], e.target.value)} /></div>
                <div><label>Gluc</label><input type="number" value={reporte.seccionI.glucemia} onChange={e => handleChange(['seccionI', 'glucemia'], e.target.value)} /></div>
              </div>
              <div className="grid-2" style={{ marginTop: '8px', borderTop: '1px solid var(--border-light)', paddingTop: '14px' }}>
                <div><label>Hora Contacto</label><input type="time" value={reporte.seccionB.primer_contacto} onChange={e => handleChange(['seccionB', 'primer_contacto'], e.target.value)} /></div>
                <div><label>Salida Escena</label><input type="time" value={reporte.seccionB.salida_escena} onChange={e => handleChange(['seccionB', 'salida_escena'], e.target.value)} /></div>
              </div>
            </div>
          </details>

          <details className="priority-green">
            <summary>N y O. Destino y Cierre</summary>
            <div className="section-content">
              <div className="grid-2">
                <div style={{ gridColumn: 'span 2' }}>
                  <label>Hospital Destino {hospitalAceptado ? '(aceptado)' : '*'}</label>
                  <select value={hospitalSeleccionado} onChange={e => setHospitalSeleccionado(e.target.value)} disabled={!!hospitalAceptado}>
                    <option value="">Seleccione un hospital...</option>
                    {listaHospitales.map(h => (
                      <option key={h.id} value={h.id}>{h.nombre}</option>
                    ))}
                  </select>
                  {hospitalAceptado && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--success)', marginTop: 6, fontWeight: 700 }}>
                      Hospital destino fijado por el sistema central.
                    </p>
                  )}
                </div>
                <div><label>ETA</label><input type="time" value={reporte.seccionN.eta} onChange={e => handleChange(['seccionN', 'eta'], e.target.value)} /></div>
                <div>
                  <label>Área Receptora</label>
                  <select value={reporte.seccionOP.area_receptora} onChange={e => handleChange(['seccionOP', 'area_receptora'], e.target.value)}>
                    <option>Urgencias</option><option>Choque</option><option>Tococirugía</option>
                  </select>
                </div>
              </div>
            </div>
          </details>
        </form>

        <Outlet />
      </div>

      <div className="bottom-action-area">
        <div className="pln-container">
          <VoiceAssistant
            onDataExtracted={handleNLPData}
            onError={(msg) => mostrarNotificacion(msg, 'error')}
            onRecordingComplete={() => mostrarNotificacion('Grabación completada', 'success')}
          />
        </div>
          <div className="btn-row">
  <button onClick={() => enviarVersion(true)} className="btn-urgent" disabled={!puedeEnviar}>
    URGENTE
  </button>
  <button onClick={handleSubmit} className="btn-sync" disabled={!puedeEnviar}>
    {puedeEnviar ? 'ENVIAR REPORTE COMPLETO' : 'ESPERANDO HOSPITAL'}
  </button>
</div>

{puedeEnviar && (
  <button
    onClick={solicitarMedico}
    className="btn-video"
    style={{
      width: '100%', padding: '16px', background: '#0ea5e9', color: 'white',
      border: 'none', borderRadius: '12px', fontSize: '1rem', fontWeight: 900,
      letterSpacing: '1px', cursor: 'pointer', textTransform: 'uppercase',
      marginTop: '8px'
    }}
  >
    SOLICITAR MÉDICO (VIDEOLLAMADA)
  </button>
)}

      </div>
    </div>
  );
};

export default ReportePaciente;