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

  // Ambulancia persistente (localStorage)
  const [ambulanciaId, setAmbulanciaId] = useState(() => {
    return localStorage.getItem('ambulanciaId') || '';
  });

  // Estado del reporte (sin triaje ni glasgow derivados)
  const [reporte, setReporte] = useState({
    id_ambulancia: ambulanciaId,
    hora_estimada_llegada: '',
    ubicacion_actual: '',
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
    intervenciones: [],
    hallazgos_escena: '',
    instrucciones_hospital: '',
  });

  // Hook de Glasgow
  const { ocular, setOcular, verbal, setVerbal, motor, setMotor, total, getTriageLevel, GLASGOW } = useGlasgow(4, 5, 6);
  const triaje = getTriageLevel(total);

  const API_URL = import.meta.env.VITE_API || 'http://localhost:3000/api';
  const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

  // Cargar hospitales
  useEffect(() => {
    const cargarHospitales = async () => {
      try {
        const res = await fetch(`${API_URL}/hospital`);
        if (res.ok) {
          const data = await res.json();
          setListaHospitales(data);
          // Si tenemos ubicación, sugerir hospital más cercano
          if (ubicacion.lat && ubicacion.lng) {
            sugerirHospitalCercano(data, ubicacion.lat, ubicacion.lng);
          }
        }
      } catch (error) {
        console.error('Error cargando hospitales:', error);
      }
    };
    cargarHospitales();
  }, [API_URL, ubicacion]);

  // Obtener ubicación automáticamente
  useEffect(() => {
    if (navigator.geolocation) {
      setObteniendoUbicacion(true);
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setUbicacion(prev => ({ ...prev, lat: latitude, lng: longitude }));
          // Obtener dirección con Mapbox
          try {
            const response = await fetch(
              `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${MAPBOX_TOKEN}&language=es`
            );
            if (response.ok) {
              const data = await response.json();
              const direccion = data.features[0]?.place_name || 'Ubicación desconocida';
              setUbicacion(prev => ({ ...prev, direccion }));
              setReporte(prev => ({ ...prev, ubicacion_actual: direccion }));
            }
          } catch (error) {
            console.error('Error al obtener dirección:', error);
          }
          setObteniendoUbicacion(false);
        },
        (error) => {
          console.error('Error de geolocalización:', error);
          setObteniendoUbicacion(false);
        },
        { enableHighAccuracy: true }
      );
    } else {
      setObteniendoUbicacion(false);
    }
  }, []);

  // Sugerir hospital más cercano (distancia de Haversine)
  const sugerirHospitalCercano = (hospitales, lat, lng) => {
    if (!hospitales.length) return;
    let closest = null;
    let minDist = Infinity;
    for (const h of hospitales) {
      if (h.lat && h.lng) {
        const dist = calcularDistancia(lat, lng, h.lat, h.lng);
        if (dist < minDist) {
          minDist = dist;
          closest = h;
        }
      }
    }
    if (closest) {
      setHospitalSeleccionado(closest.id);
    }
  };

  const calcularDistancia = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Tema
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // WebSocket (sin cambios relevantes)
  useEffect(() => {
    const ws = new WebSocket(import.meta.env.VITE_WS_URL);
    ws.onopen = () => console.log('✅ WS conectado');
    ws.onmessage = async (event) => {
      const data = event.data instanceof Blob ? await event.data.text() : event.data;
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'active_hospitals_update') {
          setListaHospitales(parsed.hospitals);
        }
      } catch (e) { console.error('WS error:', e); }
    };
    ws.onclose = () => console.log('WS desconectado');
    ws.onerror = (e) => console.error('WS error:', e);
    setSocket(ws);
    return () => ws.close();
  }, []);

  // Funciones de manejo de cambio
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

  // Intervenciones
  const agregarIntervencion = () => {
    if (intervencionActual.tipo_intervencion.trim() || intervencionActual.descripcion.trim()) {
      setReporte(prev => ({
        ...prev,
        intervenciones: [...prev.intervenciones, { ...intervencionActual, hora_intervencion: intervencionActual.hora_intervencion || '' }],
      }));
      setIntervencionActual({ tipo_intervencion: '', descripcion: '', hora_intervencion: '' });
      mostrarNotificacion('Intervención agregada', 'success');
    } else {
      mostrarNotificacion('Complete al menos tipo o descripción', 'error');
    }
  };
  const eliminarIntervencion = (index) => {
    setReporte(prev => ({
      ...prev,
      intervenciones: prev.intervenciones.filter((_, i) => i !== index),
    }));
  };

  // Notificaciones
  const mostrarNotificacion = (texto, tipo = 'info') => {
    setMensajeNotificacion({ texto, tipo });
    setTimeout(() => setMensajeNotificacion({ texto: '', tipo: '' }), 4000);
  };

  // Función para recibir datos del NLP

const handleNLPData = (data) => {
    // Limpiar intervenciones: eliminar duplicados y vacíos
    const cleanIntervenciones = data.intervenciones
        ? data.intervenciones.filter((iv, index, self) =>
            index === self.findIndex(t => t.tipo_intervencion === iv.tipo_intervencion)
          )
        : [];

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
        intervenciones: cleanIntervenciones.length > 0 ? cleanIntervenciones : prev.intervenciones,
    }));

    // Glasgow
    if (data.glasgow) {
        if (data.glasgow.ocular) setOcular(data.glasgow.ocular);
        if (data.glasgow.verbal) setVerbal(data.glasgow.verbal);
        if (data.glasgow.motor) setMotor(data.glasgow.motor);
    }

    // Hora estimada
    const ahora = new Date();
    const horas = String(ahora.getHours()).padStart(2, '0');
    const minutos = String(ahora.getMinutes()).padStart(2, '0');
    setReporte(prev => ({
        ...prev,
        hora_estimada_llegada: `${horas}:${minutos}`
    }));

    mostrarNotificacion('✅ Datos extraídos correctamente', 'success');
};
  // Al finalizar la grabación, se procesa automáticamente (ya está en VoiceAssistant)

  // Validación
  const validarFormulario = () => {
    const errores = [];
    if (!reporte.id_ambulancia.trim()) errores.push('Número de ambulancia');
    if (!reporte.hora_estimada_llegada.trim()) errores.push('Hora estimada de llegada');
    if (!reporte.ubicacion_actual.trim()) errores.push('Ubicación actual');
    if (!hospitalSeleccionado) errores.push('Hospital destino');
    if (!reporte.paciente.nombre.trim()) errores.push('Nombre del paciente');
    if (!reporte.paciente.edad) errores.push('Edad');
    if (!reporte.paciente.sexo) errores.push('Sexo');
    if (!reporte.paciente.motivo_urgencia.trim()) errores.push('Motivo de urgencia');
    if (errores.length > 0) {
      mostrarNotificacion(`Faltan campos: ${errores.join(', ')}`, 'error');
      return false;
    }
    return true;
  };

  // Envío
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validarFormulario()) return;

    const callId = Date.now().toString();

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'patient_transfer_notification',
        callId,
        ambulanceId: reporte.id_ambulancia,
        patientInfo: {
          age: reporte.paciente.edad,
          sex: reporte.paciente.sexo,
          condition: triaje.label,
          glasgow: total,
        },
        eta: reporte.hora_estimada_llegada,
        hospitalId: hospitalSeleccionado,
        ubicacion: reporte.ubicacion_actual,
      }));
    }

    window.open(`/videocall?room=${callId}`, '_blank');

    const reporteParaEnviar = {
      ...reporte,
      hospitalId: hospitalSeleccionado,
      glasgow: { ocular, verbal, motor, total },
      triaje: triaje,
      paciente: {
        ...reporte.paciente,
        observaciones: `[VideoID: ${callId}] ${reporte.paciente.observaciones || ''}`.trim(),
      },
      hora_estimada_llegada: combinarFechaYHora(reporte.hora_estimada_llegada),
    };

    try {
      const response = await fetch(`${API_URL}/reporte-prehospitalario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reporteParaEnviar),
      });
      if (response.ok) {
        mostrarNotificacion('✅ Reporte enviado exitosamente', 'success');
      } else {
        const errorText = await response.text();
        mostrarNotificacion(`❌ Error al guardar: ${errorText}`, 'error');
      }
    } catch (error) {
      mostrarNotificacion('❌ Error de red al enviar', 'error');
    }
  };

  const combinarFechaYHora = (hora) => {
    if (!hora) return '';
    const [horas, minutos] = hora.split(':');
    const fecha = new Date();
    fecha.setHours(parseInt(horas, 10), parseInt(minutos, 10), 0, 0);
    return fecha.toISOString();
  };

  // Cerrar sesión
  const handleLogout = () => {
    localStorage.removeItem('ambulanciaId');
    // Aquí también limpiar token de autenticación si existe
    navigate('/login');
  };

  // Actualizar ambulancia en localStorage y estado
  const handleAmbulanciaChange = (value) => {
    setAmbulanciaId(value);
    localStorage.setItem('ambulanciaId', value);
    setReporte(prev => ({ ...prev, id_ambulancia: value }));
  };

  return (
    <div className={`reporte-root ${theme === 'dark' ? 'theme-dark' : 'theme-light'}`}>
      <style>{`
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
        .container { max-width: 1100px; margin: 24px auto 120px; padding: 20px; background: var(--panel-light); border-radius: 12px; box-shadow: 0 6px 18px rgba(0,0,0,0.06); }
        [data-theme="dark"] .container { background: var(--panel-dark); box-shadow: none; }
        .header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
        .brand { display: flex; align-items: center; gap: 12px; }
        .logo { width: 36px; height: 36px; border-radius: 8px; background: linear-gradient(135deg, var(--accent), #0aa); }
        .header-actions { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .triage-indicator { display: flex; align-items: center; gap: 8px; }
        .triage-circle { width: 40px; height: 40px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.2); }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .signs-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
        .intervencion-item { padding: 10px; border-radius: 8px; background: rgba(0,0,0,0.03); border: 1px solid rgba(0,0,0,0.04); margin-bottom: 8px; }
        [data-theme="dark"] .intervencion-item { background: rgba(255,255,255,0.02); border-color: rgba(255,255,255,0.03); }
        fieldset { border: none; padding: 12px 0; margin: 0; }
        legend { font-weight: 700; font-size: 1.05rem; margin-bottom: 10px; }
        label { display: block; font-size: 0.85rem; margin-bottom: 4px; font-weight: 500; }
        input, select, textarea { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.08); background: transparent; color: inherit; font-size: 0.95rem; }
        [data-theme="dark"] input, [data-theme="dark"] select, [data-theme="dark"] textarea { border-color: rgba(255,255,255,0.04); background: rgba(255,255,255,0.02); }
        .btn { padding: 6px 12px; border-radius: 6px; border: none; cursor: pointer; }
        .btn-primary { background: var(--accent); color: white; }
        .btn-danger { background: #ff4d4f; color: white; }
        .icon-btn { background: transparent; border: 1px solid rgba(0,0,0,0.06); padding: 6px 10px; border-radius: 6px; cursor: pointer; }
        .sticky-submit { position: fixed; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.02); backdrop-filter: blur(6px); padding: 14px 20px; display: flex; justify-content: center; z-index: 60; }
        [data-theme="dark"] .sticky-submit { background: rgba(0,0,0,0.6); }
        .send-button { width: calc(100% - 20px); max-width: 420px; padding: 12px 22px; border-radius: 10px; font-weight: 700; border: none; cursor: pointer; background: var(--accent); color: white; }
        .send-button.dark { background: #e94b4b; }
        .toast { position: fixed; top: 20px; right: 20px; padding: 12px 20px; border-radius: 8px; color: white; font-weight: 500; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.15); max-width: 400px; }
        .toast.success { background: #52c41a; }
        .toast.error { background: #ff4d4f; }
        .toast.info { background: #1d8cf8; }
        .logout-btn { background: transparent; border: 1px solid rgba(0,0,0,0.1); padding: 6px 14px; border-radius: 6px; cursor: pointer; color: inherit; }
        [data-theme="dark"] .logout-btn { border-color: rgba(255,255,255,0.1); }
        @media (max-width: 700px) { .grid-2 { grid-template-columns: 1fr; } .signs-grid { grid-template-columns: 1fr 1fr; } }
      `}</style>

      {mensajeNotificacion.texto && (
        <div className={`toast ${mensajeNotificacion.tipo}`}>{mensajeNotificacion.texto}</div>
      )}

      <div className="container">
        <div className="header">
          <div className="brand">
            <div className="logo" />
            <div>
              <div style={{ fontWeight: 700 }}>Emergencity</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Reporte prehospitalario</div>
            </div>
          </div>
          <div className="header-actions">
            <div className="triage-indicator">
              <div className="triage-circle" style={{ background: triaje.color }} />
              <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{triaje.label}</span>
              <span style={{ fontSize: '13px', opacity: 0.6 }}>GCS: {total}</span>
            </div>
            <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} className="icon-btn">
              {theme === 'light' ? '🌙' : '🌤️'}
            </button>
            <button onClick={handleLogout} className="logout-btn">
              🚪 Cerrar sesión
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <fieldset>
            <legend>1. Identificación del Servicio</legend>
            <div className="grid-2">
              <div>
                <label>Número de ambulancia *</label>
                <input
                  type="text"
                  value={ambulanciaId}
                  onChange={(e) => handleAmbulanciaChange(e.target.value)}
                  placeholder="Ej. AMB-001"
                  required
                />
                <small style={{ opacity: 0.6 }}>Este dato se guarda automáticamente</small>
              </div>
              <div>
                <label>Hora estimada de llegada *</label>
                <input
                  type="time"
                  value={reporte.hora_estimada_llegada}
                  onChange={e => handleChange(['hora_estimada_llegada'], e.target.value)}
                  required
                />
                <small style={{ opacity: 0.6 }}>Se actualiza al grabar</small>
              </div>
            </div>
            <div>
              <label>Ubicación actual *</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  value={reporte.ubicacion_actual}
                  onChange={e => handleChange(['ubicacion_actual'], e.target.value)}
                  required
                  style={{ flex: 1 }}
                />
                {obteniendoUbicacion && <span>🔄 Obteniendo...</span>}
                {ubicacion.lat && <span style={{ fontSize: '12px', opacity: 0.6 }}>📍 {ubicacion.lat.toFixed(4)}, {ubicacion.lng.toFixed(4)}</span>}
              </div>
            </div>
            <div>
              <label>Hospital destino *</label>
              <select value={hospitalSeleccionado} onChange={e => setHospitalSeleccionado(e.target.value)} required>
  <option value="">-- Seleccionar --</option>
  {listaHospitales.map(h => (
    <option key={h.id} value={h.id}>
      {h.nombre} {h.camasDisponibles ? `(Camas: ${h.camasDisponibles})` : ''}
      {ubicacion.lat && h.lat && h.lng && ` (${calcularDistancia(ubicacion.lat, ubicacion.lng, h.lat, h.lng).toFixed(1)} km)`}
    </option>
  ))}
</select>
              {ubicacion.lat && <small style={{ opacity: 0.6 }}>Sugerencia: hospital más cercano seleccionado</small>}
            </div>
          </fieldset>

          <fieldset>
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
            <div>
              <label>Descripción de la lesión</label>
              <textarea value={reporte.paciente.descripcion_lesion} onChange={e => handleChange(['paciente', 'descripcion_lesion'], e.target.value)} />
            </div>
          </fieldset>

          <fieldset>
            <legend>3. Signos Vitales (opcional)</legend>
            <div className="signs-grid">
              <div><label>FC</label><input value={reporte.signos_vitales.frecuencia_cardiaca} onChange={e => handleChange(['signos_vitales', 'frecuencia_cardiaca'], e.target.value)} /></div>
              <div><label>FR</label><input value={reporte.signos_vitales.frecuencia_respiratoria} onChange={e => handleChange(['signos_vitales', 'frecuencia_respiratoria'], e.target.value)} /></div>
              <div><label>TA</label><input value={reporte.signos_vitales.tension_arterial} onChange={e => handleChange(['signos_vitales', 'tension_arterial'], e.target.value)} placeholder="120/80" /></div>
              <div><label>SpO₂</label><input value={reporte.signos_vitales.saturacion_oxigeno} onChange={e => handleChange(['signos_vitales', 'saturacion_oxigeno'], e.target.value)} /></div>
              <div><label>Temperatura</label><input value={reporte.signos_vitales.temperatura} onChange={e => handleChange(['signos_vitales', 'temperatura'], e.target.value)} /></div>
            </div>
          </fieldset>

          <fieldset>
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
                <div style={{ fontSize: '14px', marginTop: '4px' }}>Triaje: {triaje.label}</div>
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>5. Intervenciones</legend>
            {reporte.intervenciones.length === 0 && <div style={{ color: 'gray', fontSize: '14px' }}>No hay intervenciones registradas.</div>}
            {reporte.intervenciones.map((iv, idx) => (
              <div key={idx} className="intervencion-item">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div><strong>{iv.tipo_intervencion || 'Interv.'}</strong> {iv.hora_intervencion && `· ${iv.hora_intervencion}`}</div>
                  <button type="button" className="icon-btn" onClick={() => eliminarIntervencion(idx)}>🗑️</button>
                </div>
                <div style={{ fontSize: '14px' }}>{iv.descripcion || <i>Sin descripción</i>}</div>
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

          <fieldset>
            <legend>6. Observaciones / Hallazgos</legend>
            <label>Hallazgos en la escena</label>
            <textarea value={reporte.hallazgos_escena} onChange={e => handleChange(['hallazgos_escena'], e.target.value)} />
            <label style={{ marginTop: '8px' }}>Instrucciones para el hospital</label>
            <textarea value={reporte.instrucciones_hospital} onChange={e => handleChange(['instrucciones_hospital'], e.target.value)} />
          </fieldset>
        </form>
        <Outlet />
      </div>

      <VoiceAssistant
        onDataExtracted={handleNLPData}
        onError={(msg) => mostrarNotificacion(msg, 'error')}
        onRecordingComplete={() => mostrarNotificacion('Grabación procesada', 'success')}
      />

      <div className="sticky-submit">
        <button onClick={handleSubmit} className={`send-button ${theme === 'dark' ? 'dark' : ''}`}>
          Enviar reporte
        </button>
      </div>
    </div>
  );
};

export default ReportePaciente;