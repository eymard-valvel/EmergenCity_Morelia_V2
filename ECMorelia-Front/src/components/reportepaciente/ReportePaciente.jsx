import React, { useState, useEffect, useRef } from 'react';
import { Outlet } from "react-router-dom";
import SpeechRecorder from '../pln/SpeechRecorder';
import { useGlasgow } from '../hooks/useGlasgow';

/**
 * ReportePaciente.jsx - Versión simplificada con PLN y Glasgow
 */
const ReportePaciente = () => {
  const [theme, setTheme] = useState('light');

  // Lista de hospitales
  const [listaHospitales, setListaHospitales] = useState([]);
  const [hospitalSeleccionado, setHospitalSeleccionado] = useState('');

  // Estado del reporte (simplificado)
  const [reporte, setReporte] = useState({
    paciente: {
      nombre: '',
      edad: '',
      sexo: '',
      motivo_urgencia: '',
      descripcion_lesion: '',
    },
    signos_vitales: {
      frecuencia_cardiaca: '',
      frecuencia_respiratoria: '',
      tension_arterial: '',
      saturacion_oxigeno: '',
      temperatura: '',
    },
    id_ambulancia: '',
    hora_estimada_llegada: '',
    ubicacion_actual: '',
    hallazgos_escena: '',
    instrucciones_hospital: '',
    intervenciones: [],
    glasgow: { ocular: 4, verbal: 5, motor: 6, total: 15 },
    triaje: { color: '#52c41a', label: 'Estable (Verde)' },
  });

  // Hook para Glasgow
  const { ocular, setOcular, verbal, setVerbal, motor, setMotor, total, getTriageLevel, GLASGOW } = useGlasgow(
    reporte.glasgow.ocular,
    reporte.glasgow.verbal,
    reporte.glasgow.motor
  );

  // Actualizar el reporte cuando cambie el Glasgow
  useEffect(() => {
    const triaje = getTriageLevel(total);
    setReporte(prev => ({
      ...prev,
      glasgow: { ocular, verbal, motor, total },
      triaje: triaje,
      // También podríamos actualizar codigo_prioridad si lo usas
    }));
  }, [ocular, verbal, motor, total, getTriageLevel]);

  // Para scroll de secciones
  const [seccionActiva, setSeccionActiva] = useState('');
  const seccionRefs = {
    identificacion_servicio: useRef(null),
    datos_paciente: useRef(null),
    signos_vitales: useRef(null),
    glasgow: useRef(null),
    intervenciones: useRef(null),
    hallazgos: useRef(null),
  };

  const [socket, setSocket] = useState(null);
  const [mensajeError, setMensajeError] = useState('');
  const [intervencionActual, setIntervencionActual] = useState({
    tipo_intervencion: '',
    descripcion: '',
    hora_intervencion: '',
  });

  // Variable para el triaje manual (por si se quiere cambiar)
  // Ya no es necesaria, pues usamos el triaje derivado de Glasgow, pero dejamos opción manual

  // URL de API
  const API_URL = import.meta.env.VITE_API || 'http://localhost:3000/api';

  // Cargar hospitales
  useEffect(() => {
    const cargarHospitales = async () => {
      try {
        const response = await fetch(`${API_URL}/hospital`);
        if (response.ok) {
          const data = await response.json();
          setListaHospitales(data);
        } else {
          console.error("Error al cargar hospitales");
        }
      } catch (error) {
        console.error("Error de conexión:", error);
      }
    };
    cargarHospitales();
  }, [API_URL]);

  // Tema
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // WebSocket (similar al original, pero con actualizaciones)
  useEffect(() => {
    const ws = new WebSocket(import.meta.env.VITE_WS_URL);

    ws.onopen = () => console.log('✅ Conectado WS');
    ws.onmessage = async (event) => {
      let data = event.data instanceof Blob ? await event.data.text() : event.data;
      try {
        const parsed = JSON.parse(data);
        if (parsed.tipo === 'navegacion') {
          setSeccionActiva(parsed.seccion);
        } else if (parsed.tipo === 'llenado') {
          // Llenado automático (similar)
          const keys = Object.keys(parsed.datos);
          keys.forEach((key) => {
            const path = key.split('.');
            setReporte(prev => {
              const updated = { ...prev };
              let current = updated;
              for (let i = 0; i < path.length - 1; i++) {
                if (!current[path[i]]) current[path[i]] = {};
                current[path[i]] = { ...current[path[i]] };
                current = current[path[i]];
              }
              current[path[path.length - 1]] = parsed.datos[key];
              return updated;
            });
          });
        }
        if (parsed.type === 'active_hospitals_update') {
          setListaHospitales(parsed.hospitals);
        }
      } catch (error) {
        console.error('Error parsing WS message:', error);
        setMensajeError('Error al procesar datos del servidor');
      }
    };
    ws.onclose = () => console.log('WS desconectado');
    ws.onerror = (error) => console.error('WS error:', error);
    setSocket(ws);
    return () => ws.close();
  }, []);

  // Scroll a sección activa
  useEffect(() => {
    if (seccionActiva && seccionRefs[seccionActiva]?.current) {
      seccionRefs[seccionActiva].current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [seccionActiva]);

  // Funciones auxiliares
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

  // Manejo de intervenciones (igual)
  const agregarIntervencion = () => {
    if (intervencionActual.tipo_intervencion.trim() || intervencionActual.descripcion.trim()) {
      setReporte(prev => ({
        ...prev,
        intervenciones: [...prev.intervenciones, { ...intervencionActual, hora_intervencion: intervencionActual.hora_intervencion || '' }],
      }));
      setIntervencionActual({ tipo_intervencion: '', descripcion: '', hora_intervencion: '' });
    } else {
      alert('Complete al menos tipo o descripción');
    }
  };
  const eliminarIntervencion = (index) => {
    setReporte(prev => ({
      ...prev,
      intervenciones: prev.intervenciones.filter((_, i) => i !== index),
    }));
  };

  // Validación simplificada
  const validarFormulario = () => {
    const errores = {};
    if (!reporte.id_ambulancia.trim()) errores.id_ambulancia = 'Requerido';
    if (!reporte.hora_estimada_llegada.trim()) errores.hora_estimada_llegada = 'Requerido';
    if (!reporte.ubicacion_actual.trim()) errores.ubicacion_actual = 'Requerido';
    if (!hospitalSeleccionado) errores.hospital = 'Seleccione un hospital';
    if (!reporte.paciente.nombre.trim()) errores['paciente.nombre'] = 'Requerido';
    if (!reporte.paciente.edad) errores['paciente.edad'] = 'Requerido';
    if (!reporte.paciente.sexo) errores['paciente.sexo'] = 'Requerido';
    if (!reporte.paciente.motivo_urgencia.trim()) errores['paciente.motivo_urgencia'] = 'Requerido';
    // Otras validaciones (signos vitales opcionales)
    // Si hay errores, mostrarlos en un alert o en el formulario (mejor en el formulario)
    if (Object.keys(errores).length > 0) {
      const mensaje = Object.values(errores).join('\n');
      alert(`Faltan campos obligatorios:\n${mensaje}`);
      return false;
    }
    return true;
  };

  // Envío del reporte
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validarFormulario()) return;

    // Generar ID de videollamada
    const callId = Date.now().toString();

    // Notificar por WebSocket
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'patient_transfer_notification',
        callId,
        ambulanceId: reporte.id_ambulancia,
        patientInfo: {
          age: reporte.paciente.edad,
          sex: reporte.paciente.sexo,
          condition: reporte.triaje.label,
          glasgow: reporte.glasgow.total,
        },
        eta: reporte.hora_estimada_llegada,
        hospitalId: hospitalSeleccionado,
      }));
    }

    // Abrir videollamada
    window.open(`/videocall?room=${callId}`, '_blank');

    // Preparar datos para BD
    const reporteParaEnviar = {
      ...reporte,
      hospitalId: hospitalSeleccionado,
      // Añadir el ID de video en observaciones (si existe)
      paciente: {
        ...reporte.paciente,
        observaciones: reporte.paciente.observaciones ? `${reporte.paciente.observaciones} [VideoID: ${callId}]` : `[VideoID: ${callId}]`,
      },
      // Convertir hora estimada a ISO (usando la función corregida)
      hora_estimada_llegada: combinarFechaYHora(reporte.hora_estimada_llegada),
    };

    try {
      const response = await fetch(`${API_URL}/reporte-prehospitalario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reporteParaEnviar),
      });
      if (response.ok) {
        console.log('✅ Reporte guardado');
      } else {
        const errorText = await response.text();
        console.error('❌ Error al guardar:', errorText);
      }
    } catch (error) {
      console.error('Error de red:', error);
    }
  };

  // Función para combinar fecha y hora (corregida)
  const combinarFechaYHora = (hora) => {
    if (!hora) return '';
    const [horas, minutos] = hora.split(':');
    const fecha = new Date();
    fecha.setHours(parseInt(horas, 10), parseInt(minutos, 10), 0, 0);
    // Retornar ISO sin ajuste de zona horaria (se asume que la hora es local)
    return fecha.toISOString();
  };

  // Función para recibir datos del NLP y llenar el formulario
  const handleNLPData = (data) => {
    // Mapear los datos extraídos al estado del reporte
    setReporte(prev => ({
      ...prev,
      paciente: {
        ...prev.paciente,
        nombre: data.paciente.nombre || prev.paciente.nombre,
        edad: data.paciente.edad || prev.paciente.edad,
        sexo: data.paciente.sexo || prev.paciente.sexo,
        motivo_urgencia: data.motivo_urgencia || prev.paciente.motivo_urgencia,
        descripcion_lesion: data.descripcion_lesion || prev.paciente.descripcion_lesion,
      },
      signos_vitales: {
        ...prev.signos_vitales,
        frecuencia_cardiaca: data.signos_vitales.frecuencia_cardiaca || prev.signos_vitales.frecuencia_cardiaca,
        frecuencia_respiratoria: data.signos_vitales.frecuencia_respiratoria || prev.signos_vitales.frecuencia_respiratoria,
        tension_arterial: data.signos_vitales.tension_arterial || prev.signos_vitales.tension_arterial,
        saturacion_oxigeno: data.signos_vitales.saturacion_oxigeno || prev.signos_vitales.saturacion_oxigeno,
        temperatura: data.signos_vitales.temperatura || prev.signos_vitales.temperatura,
      },
      hallazgos_escena: data.hallazgos_escena || prev.hallazgos_escena,
    }));

    // Actualizar Glasgow si se extrajo
    if (data.glasgow) {
      if (data.glasgow.ocular) setOcular(data.glasgow.ocular);
      if (data.glasgow.verbal) setVerbal(data.glasgow.verbal);
      if (data.glasgow.motor) setMotor(data.glasgow.motor);
      // Si se extrajo total, podríamos usarlo para ajustar, pero mejor mantener coherencia
    }
  };

  return (
    <div className={`reporte-root ${theme === 'dark' ? 'theme-dark' : 'theme-light'}`}>
      <style>{`
        /* Estilos base (igual que antes, pero con ajustes menores) */
        :root {
          --bg-light: #f5f7f8;
          --panel-light: #ffffff;
          --text-light: #1f2d3d;
          --bg-dark: #111418;
          --panel-dark: #1f262a;
          --text-dark: #e6eef6;
          --accent: #1d8cf8;
        }
        [data-theme="light"] .reporte-root { background: var(--bg-light); color: var(--text-light); min-height: 100vh; }
        [data-theme="dark"] .reporte-root { background: var(--bg-dark); color: var(--text-dark); min-height: 100vh; }
        .container { max-width: 1100px; margin: 24px auto 120px; padding: 20px; background: var(--panel-light); border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,0.08); }
        [data-theme="dark"] .container { background: var(--panel-dark); box-shadow: none; }
        .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
        .brand { display: flex; gap: 12px; align-items: center; }
        .logo { width: 36px; height: 36px; border-radius: 6px; background: linear-gradient(135deg, var(--accent), #0aa); }
        .triage-circle { width: 48px; height: 48px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.2); }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .signs-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
        .intervencion-item { padding: 12px; border-radius: 8px; background: rgba(0,0,0,0.03); border: 1px solid rgba(0,0,0,0.04); margin-bottom: 8px; }
        [data-theme="dark"] .intervencion-item { background: rgba(255,255,255,0.02); border-color: rgba(255,255,255,0.03); }
        fieldset { border: none; padding: 12px 0; }
        legend { font-weight: 700; margin-bottom: 8px; font-size: 1.05rem; }
        label { display: block; font-size: 0.9rem; margin-bottom: 4px; }
        input, select, textarea { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.08); background: transparent; color: inherit; }
        [data-theme="dark"] input, [data-theme="dark"] select, [data-theme="dark"] textarea { border-color: rgba(255,255,255,0.04); background: rgba(255,255,255,0.02); }
        .btn { padding: 6px 12px; border-radius: 6px; border: none; cursor: pointer; }
        .btn-primary { background: var(--accent); color: white; }
        .btn-danger { background: #ff4d4f; color: white; }
        .icon-btn { background: transparent; border: 1px solid rgba(0,0,0,0.06); padding: 6px 10px; border-radius: 6px; cursor: pointer; }
        .sticky-submit { position: fixed; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.02); backdrop-filter: blur(6px); padding: 14px 20px; display: flex; justify-content: center; z-index: 60; }
        [data-theme="dark"] .sticky-submit { background: rgba(0,0,0,0.6); }
        .send-button { width: calc(100% - 20px); max-width: 420px; padding: 12px 22px; border-radius: 10px; font-weight: 700; border: none; cursor: pointer; background: var(--accent); color: white; }
        .send-button.dark { background: #e94b4b; }
        @media (max-width: 700px) { .grid-2 { grid-template-columns: 1fr; } .signs-grid { grid-template-columns: 1fr 1fr; } }
      `}</style>

      <div className="container">
        <div className="header">
          <div className="brand">
            <div className="logo" />
            <div>
              <div style={{ fontWeight: 700 }}>Emergencity</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Reporte prehospitalario</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            {/* Componente de grabación de voz */}
            <SpeechRecorder onDataExtracted={handleNLPData} onError={setMensajeError} />

            {/* Visualización del triaje (se actualiza con Glasgow) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="triage-circle" style={{ background: reporte.triaje.color }} />
              <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{reporte.triaje.label}</span>
              <span style={{ fontSize: '12px', opacity: 0.7 }}>GCS: {total}</span>
            </div>

            {/* Botón de tema */}
            <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} className="icon-btn" aria-label="Toggle theme">
              {theme === 'light' ? '🌙' : '🌤️'}
            </button>
          </div>
        </div>

        {mensajeError && (
          <div style={{ background: '#ffe5e5', color: '#721c24', padding: '10px', borderRadius: '6px', marginBottom: '12px' }}>
            {mensajeError}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* 1. Identificación del Servicio */}
          <fieldset ref={seccionRefs.identificacion_servicio}>
            <legend>1. Identificación del Servicio</legend>
            <div className="grid-2">
              <div>
                <label>Número de ambulancia *</label>
                <input type="text" value={reporte.id_ambulancia} onChange={e => handleChange(['id_ambulancia'], e.target.value)} required />
              </div>
              <div>
                <label>Hora estimada de llegada *</label>
                <input type="time" value={reporte.hora_estimada_llegada} onChange={e => handleChange(['hora_estimada_llegada'], e.target.value)} required />
              </div>
            </div>
            <div style={{ marginTop: '8px' }}>
              <label>Ubicación actual *</label>
              <input type="text" value={reporte.ubicacion_actual} onChange={e => handleChange(['ubicacion_actual'], e.target.value)} required />
            </div>
            <div style={{ marginTop: '8px' }}>
              <label>🏥 Hospital destino *</label>
              <select value={hospitalSeleccionado} onChange={e => setHospitalSeleccionado(e.target.value)} required>
                <option value="">-- Seleccionar --</option>
                {listaHospitales.map(h => (
                  <option key={h.id} value={h.id}>{h.nombre} {h.camasDisponibles ? `(Camas: ${h.camasDisponibles})` : ''}</option>
                ))}
              </select>
            </div>
          </fieldset>

          {/* 2. Datos del Paciente */}
          <fieldset ref={seccionRefs.datos_paciente}>
            <legend>2. Datos del Paciente</legend>
            <div className="grid-2">
              <div>
                <label>Nombre completo *</label>
                <input type="text" value={reporte.paciente.nombre} onChange={e => handleChange(['paciente', 'nombre'], e.target.value)} required />
              </div>
              <div>
                <label>Edad (años) *</label>
                <input type="number" value={reporte.paciente.edad} onChange={e => handleChange(['paciente', 'edad'], e.target.value)} required />
              </div>
            </div>
            <div style={{ margin: '8px 0' }}>
              <label>Sexo *</label>
              <div style={{ display: 'flex', gap: '16px' }}>
                <label><input type="radio" name="sexo" value="M" checked={reporte.paciente.sexo === 'M'} onChange={e => handleChange(['paciente', 'sexo'], e.target.value)} /> Masculino</label>
                <label><input type="radio" name="sexo" value="F" checked={reporte.paciente.sexo === 'F'} onChange={e => handleChange(['paciente', 'sexo'], e.target.value)} /> Femenino</label>
              </div>
            </div>
            <div>
              <label>Motivo de urgencia *</label>
              <textarea value={reporte.paciente.motivo_urgencia} onChange={e => handleChange(['paciente', 'motivo_urgencia'], e.target.value)} required />
            </div>
            <div style={{ marginTop: '8px' }}>
              <label>Descripción de la lesión</label>
              <textarea value={reporte.paciente.descripcion_lesion} onChange={e => handleChange(['paciente', 'descripcion_lesion'], e.target.value)} />
            </div>
          </fieldset>

          {/* 3. Signos Vitales (opcionales) */}
          <fieldset ref={seccionRefs.signos_vitales}>
            <legend>3. Signos Vitales (opcional)</legend>
            <div className="signs-grid">
              <div><label>FC</label><input value={reporte.signos_vitales.frecuencia_cardiaca} onChange={e => handleChange(['signos_vitales', 'frecuencia_cardiaca'], e.target.value)} /></div>
              <div><label>FR</label><input value={reporte.signos_vitales.frecuencia_respiratoria} onChange={e => handleChange(['signos_vitales', 'frecuencia_respiratoria'], e.target.value)} /></div>
              <div><label>TA</label><input value={reporte.signos_vitales.tension_arterial} onChange={e => handleChange(['signos_vitales', 'tension_arterial'], e.target.value)} placeholder="120/80" /></div>
              <div><label>SpO₂</label><input value={reporte.signos_vitales.saturacion_oxigeno} onChange={e => handleChange(['signos_vitales', 'saturacion_oxigeno'], e.target.value)} /></div>
              <div><label>Temperatura</label><input value={reporte.signos_vitales.temperatura} onChange={e => handleChange(['signos_vitales', 'temperatura'], e.target.value)} /></div>
            </div>
          </fieldset>

          {/* 4. Escala de Glasgow */}
          <fieldset ref={seccionRefs.glasgow}>
            <legend>4. Escala de Glasgow</legend>
            <div className="grid-2">
              <div>
                <label>Ocular</label>
                <select value={ocular} onChange={e => setOcular(Number(e.target.value))}>
                  {Object.entries(GLASGOW.ocular).map(([key, desc]) => (
                    <option key={key} value={key}>{key} - {desc}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Verbal</label>
                <select value={verbal} onChange={e => setVerbal(Number(e.target.value))}>
                  {Object.entries(GLASGOW.verbal).map(([key, desc]) => (
                    <option key={key} value={key}>{key} - {desc}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Motor</label>
                <select value={motor} onChange={e => setMotor(Number(e.target.value))}>
                  {Object.entries(GLASGOW.motor).map(([key, desc]) => (
                    <option key={key} value={key}>{key} - {desc}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Total: <strong>{total}</strong></label>
                <div style={{ fontSize: '14px', marginTop: '4px' }}>Triaje: {reporte.triaje.label}</div>
              </div>
            </div>
          </fieldset>

          {/* 5. Intervenciones */}
          <fieldset ref={seccionRefs.intervenciones}>
            <legend>5. Intervenciones Realizadas</legend>
            {reporte.intervenciones.length === 0 && <div style={{ color: 'gray' }}>No hay intervenciones.</div>}
            {reporte.intervenciones.map((iv, idx) => (
              <div key={idx} className="intervencion-item">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div><strong>Interv. {idx+1}</strong> {iv.tipo_intervencion} {iv.hora_intervencion && `· ${iv.hora_intervencion}`}</div>
                  <button type="button" className="icon-btn" onClick={() => eliminarIntervencion(idx)}>🗑️</button>
                </div>
                <div>{iv.descripcion || <i>Sin descripción</i>}</div>
              </div>
            ))}
            <div style={{ marginTop: '12px', padding: '12px', border: '1px dashed rgba(0,0,0,0.1)', borderRadius: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold' }}>Agregar</span>
                <button type="button" className="btn btn-primary" onClick={agregarIntervencion}>➕ Agregar</button>
              </div>
              <div className="grid-2" style={{ marginTop: '8px' }}>
                <div><label>Tipo</label><input value={intervencionActual.tipo_intervencion} onChange={e => setIntervencionActual({...intervencionActual, tipo_intervencion: e.target.value})} placeholder="Ej. Oxigenoterapia" /></div>
                <div><label>Hora</label><input type="time" value={intervencionActual.hora_intervencion} onChange={e => setIntervencionActual({...intervencionActual, hora_intervencion: e.target.value})} /></div>
              </div>
              <div><label>Descripción</label><textarea value={intervencionActual.descripcion} onChange={e => setIntervencionActual({...intervencionActual, descripcion: e.target.value})} /></div>
            </div>
          </fieldset>

          {/* 6. Hallazgos y observaciones */}
          <fieldset ref={seccionRefs.hallazgos}>
            <legend>6. Hallazgos en la escena e instrucciones</legend>
            <label>Descripción de la escena / otros hallazgos</label>
            <textarea value={reporte.hallazgos_escena} onChange={e => handleChange(['hallazgos_escena'], e.target.value)} />
            <label style={{ marginTop: '8px' }}>Instrucciones para el hospital</label>
            <textarea value={reporte.instrucciones_hospital} onChange={e => handleChange(['instrucciones_hospital'], e.target.value)} />
          </fieldset>

          {/* Botón de envío (no sticky, pero se mantiene el sticky inferior) */}
        </form>
        <Outlet />
      </div>

      {/* Sticky submit */}
      <div className="sticky-submit">
        <button onClick={handleSubmit} className={`send-button ${theme === 'dark' ? 'dark' : ''}`}>
          Enviar reporte
        </button>
      </div>
    </div>
  );
};

export default ReportePaciente;