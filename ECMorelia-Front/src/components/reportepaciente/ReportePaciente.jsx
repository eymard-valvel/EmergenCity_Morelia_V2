import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import VoiceAssistant from '../pln/VoiceAssistant';
import { useGlasgow } from '../hooks/useGlasgow';

const ReportePaciente = () => {
  const navigate = useNavigate();
  const [theme, setTheme] = useState('light');
  const [listaHospitales, setListaHospitales] = useState([]);
  const [hospitalSeleccionado, setHospitalSeleccionado] = useState('');
  const [mensajeNotificacion, setMensajeNotificacion] = useState({ texto: '', tipo: '' });
  const [socket, setSocket] = useState(null);
  const [intervencionActual, setIntervencionActual] = useState({ tipo_intervencion: '', descripcion: '', hora_intervencion: '' });
  const [ubicacion, setUbicacion] = useState({ lat: null, lng: null, direccion: '' });
  const [obteniendoUbicacion, setObteniendoUbicacion] = useState(false);

  // --- LÓGICA DE CONFIGURACIÓN INICIAL (SALA / TRIPULACIÓN) ---
  const [isConfigured, setIsConfigured] = useState(false);
  const [configInicial, setConfigInicial] = useState({
    ambulanciaId: '',
    operador: '',
    paramedico1: '',
    paramedico2: ''
  });

  useEffect(() => {
    // Verificar si ya existe configuración en el dispositivo
    const guardado = localStorage.getItem('tripulacionConfig');
    if (guardado) {
      const parsed = JSON.parse(guardado);
      setConfigInicial(parsed);
      setReporte(prev => ({ ...prev, id_ambulancia: parsed.ambulanciaId, tripulacion: parsed }));
      setIsConfigured(true);
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
  };
  // -------------------------------------------------------------

  // Estado del reporte con ID de emergencia (CRUM) y Tripulación
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

  const { ocular, setOcular, verbal, setVerbal, motor, setMotor, total, getTriageLevel, GLASGOW } = useGlasgow(4, 5, 6);
  const triaje = getTriageLevel(total);

  const API_URL = import.meta.env.VITE_API || 'http://localhost:3000/api';
  const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
  const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3002/ws';

  useEffect(() => {
    const cargarHospitales = async () => {
      try {
        const res = await fetch(`${API_URL}/hospital`);
        if (res.ok) {
          const data = await res.json();
          setListaHospitales(data);
        }
      } catch (error) { console.error('Error cargando hospitales:', error); }
    };
    cargarHospitales();
  }, [API_URL]);

  useEffect(() => {
    if (navigator.geolocation && isConfigured) {
      setObteniendoUbicacion(true);
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setUbicacion(prev => ({ ...prev, lat: latitude, lng: longitude }));
          try {
            const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${MAPBOX_TOKEN}&language=es`);
            if (response.ok) {
              const data = await response.json();
              const direccion = data.features[0]?.place_name || 'Ubicación desconocida';
              setUbicacion(prev => ({ ...prev, direccion }));
              if (!reporte.seccionC.direccion) {
                setReporte(prev => ({ ...prev, seccionC: { ...prev.seccionC, direccion } }));
              }
            }
          } catch (error) {}
          setObteniendoUbicacion(false);
        },
        () => setObteniendoUbicacion(false),
        { enableHighAccuracy: true }
      );
    }
  }, [MAPBOX_TOKEN, reporte.seccionC.direccion, isConfigured]);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  // Vinculación WebSocket (Solo arranca cuando ya está configurada la unidad)
  useEffect(() => {
    if (!isConfigured) return;

    const ws = new WebSocket(WS_URL);
    
    ws.onopen = () => {
      console.log('WS conectado al sistema central');
      if (configInicial.ambulanciaId) {
        ws.send(JSON.stringify({
          type: 'register_ambulance',
          ambulance: { id: configInicial.ambulanciaId, placa: configInicial.ambulanciaId, status: 'disponible' }
        }));
      }
    };

    ws.onmessage = async (event) => {
      const data = event.data instanceof Blob ? await event.data.text() : event.data;
      try {
        const parsed = JSON.parse(data);
        
        if (parsed.type === 'active_hospitals_update') {
          setListaHospitales(parsed.hospitals);
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
      } catch (e) { console.error('WS error:', e); }
    };
    
    ws.onclose = () => console.log('WS desconectado');
    setSocket(ws);
    return () => ws.close();
  }, [isConfigured, configInicial.ambulanciaId, WS_URL]);

  const handleChange = (path, value) => {
    setReporte(prev => {
      const updated = { ...prev };
      let current = updated;
      for (let i = 0; i < path.length - 1; i++) {
        if (!current[path[i]]) current[path[i]] = {};
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
        intervenciones: [...prev.intervenciones, { ...intervencionActual, hora_intervencion: intervencionActual.hora_intervencion || new Date().toTimeString().slice(0,5) }],
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
    mostrarNotificacion('Datos de voz procesados (Pendiente mapeo)', 'success');
  };

  const validarFormulario = () => {
    const errores = [];
    if (!hospitalSeleccionado) errores.push('Hospital Destino');
    if (errores.length > 0) {
      mostrarNotificacion(`Campos requeridos: ${errores.join(', ')}`, 'error');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validarFormulario()) return;

    const activeCallId = reporte.callId || `EM-LOCAL-${Date.now()}`;

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'patient_transfer_notification',
        callId: activeCallId,
        ambulanceId: reporte.id_ambulancia,
        patientInfo: {
          age: reporte.seccionD.edad,
          sex: reporte.seccionD.sexo,
          condition: triaje.label,
          glasgow: total,
        },
        eta: reporte.seccionN.eta,
        hospitalId: hospitalSeleccionado,
        ubicacion: reporte.seccionC.direccion,
      }));
    }

    const reporteParaEnviar = {
      ...reporte,
      callId: activeCallId,
      hospitalId: hospitalSeleccionado,
      glasgow: { ocular, verbal, motor, total },
      triaje: triaje
    };

    try {
      const response = await fetch(`${API_URL}/reporte-prehospitalario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reporteParaEnviar),
      });
      if (response.ok) {
        mostrarNotificacion('Reporte sincronizado con éxito', 'success');
      } else {
        mostrarNotificacion('Error al sincronizar', 'error');
      }
    } catch (error) {
      mostrarNotificacion('Error de conexión', 'error');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('tripulacionConfig'); // Limpiar datos de vinculación
    navigate('/login');
  };

  // VISTA 1: CONFIGURACIÓN INICIAL DE SALA/UNIDAD
  if (!isConfigured) {
    return (
      <div className={`reporte-root ${theme === 'dark' ? 'theme-dark' : 'theme-light'}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{`
          :root {
            --bg-light: #f5f7fa; --panel-light: #ffffff; --text-light: #2c3e50;
            --bg-dark: #0f172a; --panel-dark: #1e293b; --text-dark: #f1f5f9;
            --accent: #2563eb; --accent-hover: #1d4ed8; --border-light: #e2e8f0; --border-dark: #334155;
          }
          .setup-container { width: 100%; max-width: 400px; padding: 24px; background: var(--panel-light); border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border: 1px solid var(--border-light); }
          [data-theme="dark"] .setup-container { background: var(--panel-dark); border-color: var(--border-dark); }
          .setup-header { text-align: center; margin-bottom: 24px; }
          .setup-header h2 { margin: 0 0 8px 0; font-size: 1.5rem; }
          .setup-header p { opacity: 0.7; font-size: 0.9rem; margin: 0; }
          .form-group { margin-bottom: 16px; }
          .form-group label { display: block; font-size: 0.8rem; font-weight: 600; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.8; }
          .form-group input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border-light); background: var(--bg-light); color: inherit; font-size: 1rem; }
          [data-theme="dark"] .form-group input { border-color: var(--border-dark); background: rgba(0,0,0,0.2); }
          .btn-primary { width: 100%; padding: 14px; background: var(--accent); color: white; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: background 0.2s; }
          .btn-primary:hover { background: var(--accent-hover); }
        `}</style>

        <div className="setup-container">
          <div className="setup-header">
            <h2>Vincular Unidad</h2>
            <p>Por favor, ingrese los datos de la tripulación operativa. Esto solo se solicitará una vez.</p>
          </div>
          <form onSubmit={guardarConfiguracion}>
            <div className="form-group">
              <label>Identificador de Unidad *</label>
              <input type="text" value={configInicial.ambulanciaId} onChange={e => setConfigInicial({...configInicial, ambulanciaId: e.target.value})} placeholder="Ej. AMB-01" required />
            </div>
            <div className="form-group">
              <label>Paramédico Responsable *</label>
              <input type="text" value={configInicial.paramedico1} onChange={e => setConfigInicial({...configInicial, paramedico1: e.target.value})} placeholder="Nombre completo" required />
            </div>
            <div className="form-group">
              <label>Operador / Conductor</label>
              <input type="text" value={configInicial.operador} onChange={e => setConfigInicial({...configInicial, operador: e.target.value})} placeholder="Nombre completo (Opcional)" />
            </div>
            <div className="form-group">
              <label>Paramédico Auxiliar</label>
              <input type="text" value={configInicial.paramedico2} onChange={e => setConfigInicial({...configInicial, paramedico2: e.target.value})} placeholder="Nombre completo (Opcional)" />
            </div>
            <button type="submit" className="btn-primary">Iniciar Operación</button>
          </form>
        </div>
      </div>
    );
  }

  // VISTA 2: REPORTE PREHOSPITALARIO (PRINCIPAL)
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
        [data-theme="light"] .reporte-root { background: var(--bg-light); color: var(--text-light); min-height: 100vh; padding-bottom: 120px; font-family: system-ui, -apple-system, sans-serif; }
        [data-theme="dark"] .reporte-root { background: var(--bg-dark); color: var(--text-dark); min-height: 100vh; padding-bottom: 120px; font-family: system-ui, -apple-system, sans-serif; }
        
        .container { max-width: 768px; margin: 0 auto; padding: 16px; }
        
        /* HEADER ORIGINAL RESTAURADO */
        .header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 24px; background: var(--panel-light); padding: 16px; border-radius: 12px; border: 1px solid var(--border-light); }
        [data-theme="dark"] .header { background: var(--panel-dark); border-color: var(--border-dark); }
        .brand { display: flex; align-items: center; gap: 12px; }
        .logo { width: 36px; height: 36px; border-radius: 8px; background: linear-gradient(135deg, var(--accent), #0ea5e9); }
        .header-actions { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .triage-indicator { display: flex; align-items: center; gap: 8px; }
        .triage-circle { width: 40px; height: 40px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.2); }
        .logout-btn { background: transparent; border: 1px solid var(--danger); padding: 8px 16px; border-radius: 8px; cursor: pointer; color: var(--danger); font-weight: 600; font-size: 0.9rem; }
        .icon-btn { background: transparent; border: 1px solid var(--border-light); padding: 8px; border-radius: 8px; cursor: pointer; color: inherit; }
        [data-theme="dark"] .icon-btn { border-color: var(--border-dark); }

        .status-banner { background: var(--panel-light); border-left: 4px solid var(--accent); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 0.9rem; font-weight: 500; border: 1px solid var(--border-light); }
        [data-theme="dark"] .status-banner { background: var(--panel-dark); border-color: var(--border-dark); border-left-color: var(--accent); }
        
        details { background: var(--panel-light); border-radius: 10px; margin-bottom: 12px; border: 1px solid var(--border-light); transition: all 0.2s ease; overflow: hidden; }
        [data-theme="dark"] details { background: var(--panel-dark); border-color: var(--border-dark); }
        details[open] { box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        
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
        
        label { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7; margin-bottom: 6px; display: block; }
        input, select, textarea { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border-light); background: var(--bg-light); font-size: 1rem; color: inherit; font-family: inherit; transition: border-color 0.2s; }
        [data-theme="dark"] input, [data-theme="dark"] select, [data-theme="dark"] textarea { border-color: var(--border-dark); background: rgba(0,0,0,0.2); }
        input:focus, select:focus, textarea:focus { outline: none; border-color: var(--accent); }
        
        /* MEJORA EN BOTÓN DE SINCRONIZAR Y CONTENEDOR FLOTANTE */
        .bottom-action-area { position: fixed; bottom: 0; left: 0; width: 100%; background: var(--panel-light); border-top: 1px solid var(--border-light); padding: 16px; z-index: 100; box-shadow: 0 -10px 20px rgba(0,0,0,0.05); display: flex; flex-direction: column; gap: 12px; }
        [data-theme="dark"] .bottom-action-area { background: var(--panel-dark); border-top-color: var(--border-dark); }
        
        .pln-container { width: 100%; display: flex; justify-content: center; margin-bottom: 4px; }
        
        .btn-sync { width: 100%; padding: 16px; background: var(--accent); color: white; border: none; border-radius: 12px; font-size: 1.1rem; font-weight: 700; cursor: pointer; transition: background 0.2s; text-transform: uppercase; letter-spacing: 0.5px; }
        .btn-sync:hover { background: var(--accent-hover); }
        
        .toast { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); padding: 12px 24px; border-radius: 8px; color: white; font-weight: 500; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-size: 0.9rem; }
        .toast.success { background: var(--success); }
        .toast.error { background: var(--danger); }
        .toast.info { background: var(--accent); }
        
        @media (max-width: 480px) { .grid-3 { grid-template-columns: 1fr 1fr; } }
      `}</style>

      {mensajeNotificacion.texto && (
        <div className={`toast ${mensajeNotificacion.tipo}`}>{mensajeNotificacion.texto}</div>
      )}

      <div className="container">
        {/* HEADER RESTAURADO */}
        <div className="header">
          <div className="brand">
            <div className="logo" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Emergencity</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>Reporte prehospitalario</div>
            </div>
          </div>
          <div className="header-actions">
            <div className="triage-indicator">
              <div className="triage-circle" style={{ background: triaje.color }} />
              <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{triaje.label}</span>
              <span style={{ fontSize: '13px', opacity: 0.6 }}>GCS: {total}</span>
            </div>
            <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} className="icon-btn">
              {theme === 'light' ? 'Noche' : 'Día'}
            </button>
            <button onClick={handleLogout} className="logout-btn">
              Cerrar sesión
            </button>
          </div>
        </div>

        {reporte.callId ? (
          <div className="status-banner">
            <div><strong>Emergencia Asignada:</strong> {reporte.callId}</div>
            <div style={{ opacity: 0.8, fontSize: '0.8rem', marginTop: '4px' }}>Sincronizado con CRUM. Unidad {configInicial.ambulanciaId}.</div>
          </div>
        ) : (
          <div className="status-banner" style={{ borderLeftColor: 'var(--warning)' }}>
            <div style={{ opacity: 0.8, fontSize: '0.85rem' }}>Esperando asignación del sistema central (Unidad: {configInicial.ambulanciaId}).</div>
          </div>
        )}

        <form>
          <details className="priority-red" open>
            <summary>A y F. Datos y Motivo (Obligatorio)</summary>
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
                <label>Motivo principal / Notas de despacho</label>
                <textarea rows="3" value={reporte.seccionF.motivo_principal} onChange={e => handleChange(['seccionF', 'motivo_principal'], e.target.value)} placeholder="Describa el motivo..."></textarea>
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
                <div><label>Nombre del Paciente</label><input type="text" value={reporte.seccionD.nombre} onChange={e => handleChange(['seccionD', 'nombre'], e.target.value)} placeholder="Desconocido"/></div>
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
              <div style={{ padding: '16px', background: 'var(--bg-light)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-light)' }}>Total Glasgow: {total}</span>
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
            <summary>I. Signos Vitales y Tiempos</summary>
            <div className="section-content">
              <div className="grid-3">
                <div><label>FC</label><input type="number" value={reporte.seccionI.fc} onChange={e => handleChange(['seccionI', 'fc'], e.target.value)} /></div>
                <div><label>FR</label><input type="number" value={reporte.seccionI.fr} onChange={e => handleChange(['seccionI', 'fr'], e.target.value)} /></div>
                <div><label>SpO₂</label><input type="number" value={reporte.seccionI.spo2} onChange={e => handleChange(['seccionI', 'spo2'], e.target.value)} /></div>
                <div><label>T/A</label><input type="text" placeholder="120/80" value={reporte.seccionI.ta} onChange={e => handleChange(['seccionI', 'ta'], e.target.value)} /></div>
                <div><label>Temp</label><input type="number" step="0.1" value={reporte.seccionI.temp} onChange={e => handleChange(['seccionI', 'temp'], e.target.value)} /></div>
                <div><label>Gluc</label><input type="number" value={reporte.seccionI.glucemia} onChange={e => handleChange(['seccionI', 'glucemia'], e.target.value)} /></div>
              </div>
              <div className="grid-2" style={{ marginTop: '8px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
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
                  <label>Hospital Destino *</label>
                  <select value={hospitalSeleccionado} onChange={e => setHospitalSeleccionado(e.target.value)}>
                    <option value="">Seleccione un hospital...</option>
                    {listaHospitales.map(h => <option key={h.id} value={h.id}>{h.nombre}</option>)}
                  </select>
                </div>
                <div><label>ETA (Estimada)</label><input type="time" value={reporte.seccionN.eta} onChange={e => handleChange(['seccionN', 'eta'], e.target.value)} /></div>
                <div>
                  <label>Área Receptora</label>
                  <select value={reporte.seccionOP.area_receptora} onChange={e => handleChange(['seccionOP', 'area_receptora'], e.target.value)}>
                    <option>Urgencias</option><option>Choque</option><option>Tococirugía</option>
                  </select>
                </div>
              </div>
              <div className="grid-3" style={{ marginTop: '8px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
                <div><label>Llegada Hosp.</label><input type="time" value={reporte.seccionB.llegada_hospital} onChange={e => handleChange(['seccionB', 'llegada_hospital'], e.target.value)} /></div>
                <div><label>Entrega Paciente</label><input type="time" value={reporte.seccionB.entrega_paciente} onChange={e => handleChange(['seccionB', 'entrega_paciente'], e.target.value)} /></div>
                <div><label>Libera Unidad</label><input type="time" value={reporte.seccionB.liberacion_unidad} onChange={e => handleChange(['seccionB', 'liberacion_unidad'], e.target.value)} /></div>
              </div>
            </div>
          </details>
        </form>
        <Outlet />
      </div>

      {/* ÁREA DE ACCIÓN INFERIOR (MICRÓFONO Y ENVIAR) */}
      <div className="bottom-action-area">
        <div className="pln-container">
          <VoiceAssistant
            onDataExtracted={handleNLPData}
            onError={(msg) => mostrarNotificacion(msg, 'error')}
            onRecordingComplete={() => mostrarNotificacion('Grabación completada', 'success')}
          />
        </div>
        <button onClick={handleSubmit} className="btn-sync">
          Sincronizar Reporte
        </button>
      </div>
    </div>
  );
};

export default ReportePaciente;