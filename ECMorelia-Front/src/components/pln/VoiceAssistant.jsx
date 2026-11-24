import React, { useState, useEffect, useRef, useCallback } from 'react';
import { parseText, parseTextConBert } from './nlpService';
import { detectarComandoEnFrase } from './localParser';
import { detectarComandoSemantico } from './bertNlp';
import './VoiceAssistant.css';

const MicIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const DEBOUNCE_MS = 350;
const ANTIRREBOTE_ENVIO_MS = 4000;

const recortar = (texto, max = 38) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);

function resumirDatos(parsed) {
  const s = parsed?.secciones || {};
  const chips = [];
  const sv = s.signos || {};
  if (s.demografia) {
    const d = s.demografia;
    const partes = [d.sexo === 'M' ? 'Masculino' : d.sexo === 'F' ? 'Femenino' : '', d.edad !== undefined ? `${d.edad} años` : ''].filter(Boolean);
    if (d.nombre) chips.push(recortar(d.nombre));
    if (partes.length) chips.push(partes.join(' · '));
  }
  if (s.motivo?.motivo_urgencia) chips.push(`Motivo: ${recortar(s.motivo.motivo_urgencia)}`);
  if (sv.frecuencia_cardiaca !== undefined) chips.push(`FC ${sv.frecuencia_cardiaca}`);
  if (sv.frecuencia_respiratoria !== undefined) chips.push(`FR ${sv.frecuencia_respiratoria}`);
  if (sv.tension_arterial) chips.push(`T/A ${sv.tension_arterial}`);
  if (sv.saturacion_oxigeno !== undefined) chips.push(`SpO₂ ${sv.saturacion_oxigeno}%`);
  if (sv.temperatura !== undefined) chips.push(`Temp ${sv.temperatura}°`);
  if (sv.glucemia !== undefined) chips.push(`Glucosa ${sv.glucemia}`);
  if (sv.eva !== undefined) chips.push(`Dolor ${sv.eva}/10`);
  if (s.glasgow?.total !== undefined) chips.push(`Glasgow ${s.glasgow.total}`);
  if (s.mecanismo?.mecanismo) chips.push(`Mecanismo: ${recortar(s.mecanismo.mecanismo)}`);
  if (s.lesiones?.descripcion_lesion) chips.push(`Lesión: ${recortar(s.lesiones.descripcion_lesion)}`);
  if (s.antecedentes?.alergias) chips.push(`Alergias: ${recortar(s.antecedentes.alergias)}`);
  if (s.antecedentes?.enfermedades) chips.push(`Antecedentes: ${recortar(s.antecedentes.enfermedades)}`);
  if (Array.isArray(s.intervenciones) && s.intervenciones.length) {
    chips.push(`Intervenciones: ${recortar([...new Set(s.intervenciones.map((i) => i.tipo_intervencion))].join(', '), 60)}`);
  }
  if (s.destino?.texto) chips.push(`Destino: ${recortar(s.destino.texto)}`);
  return chips;
}

const VoiceAssistant = ({ onDataExtracted, onError, onRecordingComplete }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastAction, setLastAction] = useState(null);
  const [resumen, setResumen] = useState([]);

  const isMountedRef = useRef(true);
  const recognitionRef = useRef(null);
  const corriendoRef = useRef(false);
  const keepListeningRef = useRef(false);
  const finalPendienteRef = useRef(false);
  const fullTextRef = useRef('');
  const interimRef = useRef('');
  const lastResultIndexRef = useRef(0);
  const sesionRef = useRef(0);
  const timerRef = useRef(null);
  const retryRef = useRef(null);
  const ultimoEnvioRef = useRef(0);
  const isMobileRef = useRef(false);

  const callbacksRef = useRef({ onDataExtracted, onError, onRecordingComplete });
  callbacksRef.current = { onDataExtracted, onError, onRecordingComplete };

  const analizar = useCallback(async () => {
    const texto = fullTextRef.current.trim();
    if (!texto) return;
    try {
      const parsed = await parseText(texto, { backend: false });
      if (!isMountedRef.current || !parsed) return;
      setResumen(resumirDatos(parsed));
      callbacksRef.current.onDataExtracted?.(parsed, { live: true, sesion: sesionRef.current });
    } catch (_) {
      return;
    }
  }, []);

  const programarAnalisis = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      analizar();
    }, DEBOUNCE_MS);
  }, [analizar]);

  const procesarFinal = useCallback(async () => {
    const texto = fullTextRef.current.trim();
    if (!texto) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (isMountedRef.current) setProcessing(true);
    try {
      const parsed = await parseTextConBert(texto);
      if (!isMountedRef.current) return;
      setResumen(resumirDatos(parsed));
      callbacksRef.current.onDataExtracted?.(parsed, { live: false, final: true, sesion: sesionRef.current });
      callbacksRef.current.onRecordingComplete?.(parsed);
    } catch (_) {
      if (!isMountedRef.current) return;
      setErrorMessage('No se pudo procesar el dictado. Intente de nuevo.');
      callbacksRef.current.onError?.('No se pudo procesar el dictado.');
    } finally {
      if (isMountedRef.current) setProcessing(false);
    }
  }, []);

  const agregarTextoRef = useRef(() => false);

  const confirmarInterim = useCallback(() => {
    const pendiente = interimRef.current.trim();
    interimRef.current = '';
    if (isMountedRef.current) setInterimTranscript('');
    if (!pendiente) return false;
    return agregarTextoRef.current(pendiente);
  }, []);

  const detenerCaptura = useCallback(
    ({ procesarFinal: procesar = true } = {}) => {
      keepListeningRef.current = false;
      if (retryRef.current) {
        clearTimeout(retryRef.current);
        retryRef.current = null;
      }
      if (procesar) finalPendienteRef.current = true;
      if (isMountedRef.current) setIsRecording(false);

      const rec = recognitionRef.current;
      if (rec && corriendoRef.current) {
        try {
          rec.stop();
        } catch (_) {
          corriendoRef.current = false;
        }
      }
      if (!corriendoRef.current) {
        confirmarInterim();
        if (finalPendienteRef.current) {
          finalPendienteRef.current = false;
          procesarFinal();
        }
      }
    },
    [procesarFinal, confirmarInterim]
  );

  const ejecutarEnvio = useCallback(
    async (accion) => {
      const ahora = Date.now();
      if (ahora - ultimoEnvioRef.current < ANTIRREBOTE_ENVIO_MS) return;
      ultimoEnvioRef.current = ahora;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      await analizar();
      if (!isMountedRef.current) return;
      setLastAction(accion);
      const texto = fullTextRef.current;
      callbacksRef.current.onDataExtracted?.(
        { acciones: [accion], secciones: {}, textoOriginal: texto, textoNormalizado: texto.toLowerCase().trim() },
        { action: accion, sesion: sesionRef.current }
      );
    },
    [analizar]
  );

  const reiniciarTexto = useCallback(() => {
    fullTextRef.current = '';
    interimRef.current = '';
    sesionRef.current += 1;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (isMountedRef.current) {
      setTranscript('');
      setInterimTranscript('');
      setResumen([]);
      setLastAction(null);
      setErrorMessage('');
    }
  }, []);

  const manejarComando = useCallback(
    (accion) => {
      if (accion === 'detener_captura') detenerCaptura({ procesarFinal: true });
      else if (accion === 'limpiar') {
        reiniciarTexto();
        if (recognitionRef.current && corriendoRef.current) {
          lastResultIndexRef.current = 0;
          try {
            recognitionRef.current.abort();
          } catch (_) {
            return;
          }
        }
      } else if (accion === 'enviar_urgente' || accion === 'enviar_completo') ejecutarEnvio(accion);
    },
    [detenerCaptura, reiniciarTexto, ejecutarEnvio]
  );

  agregarTextoRef.current = (agregado) => {
    const limpio = agregado.replace(/\s+/g, ' ').trim();
    if (!limpio) return false;
    const actual = fullTextRef.current;
    if (actual) {
      const limpioLower = limpio.toLowerCase();
      if (actual.toLowerCase().endsWith(limpioLower)) return false;
      const palabras = limpio.split(/\s+/).length;
      const ultimas = actual.split(/\s+/).slice(-palabras).join(' ').toLowerCase();
      if (ultimas === limpioLower) return false;
      fullTextRef.current = `${actual} ${limpio}`.replace(/\s+/g, ' ').trim();
    } else {
      fullTextRef.current = limpio;
    }
    if (isMountedRef.current) setTranscript(fullTextRef.current);

    const comandos = detectarComandoEnFrase(limpio);
    if (comandos.length > 0) {
      comandos.forEach((c) => manejarComando(c));
    } else {
      programarAnalisis();
      if (limpio.split(/\s+/).length <= 7) {
        detectarComandoSemantico(limpio)
          .then((c) => {
            if (c && isMountedRef.current) manejarComando(c);
          })
          .catch(() => null);
      }
    }
    return true;
  };

  const arrancar = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec || corriendoRef.current) return;
    try {
      rec.start();
      corriendoRef.current = true;
    } catch (_) {
      retryRef.current = setTimeout(() => {
        if (keepListeningRef.current && recognitionRef.current && !corriendoRef.current && isMountedRef.current) {
          try {
            recognitionRef.current.start();
            corriendoRef.current = true;
          } catch (_) {
            return;
          }
        }
      }, 400);
    }
  }, []);

  const iniciarCaptura = useCallback(() => {
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
    if (!recognitionRef.current) {
      if (isMountedRef.current) setErrorMessage('Este navegador no permite dictado por voz. Use Chrome o Edge.');
      return;
    }
    reiniciarTexto();
    finalPendienteRef.current = false;
    keepListeningRef.current = true;
    lastResultIndexRef.current = 0;
    if (corriendoRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (_) {
        return;
      }
    } else {
      arrancar();
    }
  }, [reiniciarTexto, arrancar]);

  useEffect(() => {
    isMountedRef.current = true;
    if (typeof window === 'undefined') return undefined;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMessage('Este navegador no permite dictado por voz. Use Chrome o Edge.');
      return () => {
        isMountedRef.current = false;
      };
    }

    if (window.isSecureContext === false && window.location.hostname !== 'localhost') {
      setErrorMessage('El dictado por voz requiere una conexión segura (HTTPS).');
    }

    try {
      isMobileRef.current = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    } catch (_) {
      isMobileRef.current = false;
    }

    const rec = new SpeechRecognition();
    rec.lang = 'es-MX';
    rec.interimResults = true;
    rec.continuous = !isMobileRef.current;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      corriendoRef.current = true;
      if (isMountedRef.current) setIsRecording(true);
    };

    rec.onresult = (event) => {
      if (!isMountedRef.current) return;
      let nuevosFinales = '';
      let interimActual = '';

      if (lastResultIndexRef.current > event.results.length) lastResultIndexRef.current = 0;

      for (let i = lastResultIndexRef.current; i < event.results.length; i++) {
        const resultado = event.results[i];
        const texto = resultado?.[0]?.transcript || '';
        if (resultado.isFinal && texto.trim()) {
          nuevosFinales += `${texto} `;
          lastResultIndexRef.current = i + 1;
        } else if (!resultado.isFinal && texto) {
          interimActual += texto;
        }
      }

      interimRef.current = interimActual;
      setInterimTranscript(interimActual);
      if (nuevosFinales.trim()) agregarTextoRef.current(nuevosFinales);
    };

    rec.onerror = (event) => {
      if (!isMountedRef.current) return;
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setErrorMessage('Permiso de micrófono denegado. Actívelo en la configuración del navegador.');
        keepListeningRef.current = false;
        setIsRecording(false);
      } else if (event.error === 'audio-capture') {
        setErrorMessage('No se detecta un micrófono disponible.');
        keepListeningRef.current = false;
        setIsRecording(false);
      } else if (event.error === 'network') {
        setErrorMessage('Sin conexión a internet: el dictado por voz la necesita para funcionar.');
      } else {
        setErrorMessage('Hubo un problema con el micrófono. Intente de nuevo.');
      }
    };

    rec.onend = () => {
      corriendoRef.current = false;
      lastResultIndexRef.current = 0;
      if (!isMountedRef.current) return;
      confirmarInterim();

      if (keepListeningRef.current) {
        arrancar();
        return;
      }
      setIsRecording(false);
      if (finalPendienteRef.current) {
        finalPendienteRef.current = false;
        procesarFinal();
      }
    };

    recognitionRef.current = rec;

    return () => {
      isMountedRef.current = false;
      keepListeningRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (retryRef.current) clearTimeout(retryRef.current);
      try {
        rec.abort();
      } catch (_) {
        recognitionRef.current = null;
      }
      recognitionRef.current = null;
    };
  }, [arrancar, confirmarInterim, procesarFinal]);

  useEffect(() => {
    if (isOpen) iniciarCaptura();
  }, [isOpen, iniciarCaptura]);

  const cerrarModal = () => {
    setIsOpen(false);
    detenerCaptura({ procesarFinal: true });
  };

  const enviarManual = async (tipo) => {
    confirmarInterim();
    await ejecutarEnvio(tipo);
    detenerCaptura({ procesarFinal: false });
  };

  const hayTexto = !!(transcript.trim() || interimTranscript.trim());

  return (
    <>
      <button className="voice-assistant-btn" onClick={() => setIsOpen(true)} title="Asistente de dictado" aria-label="Abrir asistente de dictado">
        <MicIcon />
      </button>

      {isOpen && (
        <div className="voice-modal-overlay" onClick={cerrarModal}>
          <div className="voice-modal" onClick={(e) => e.stopPropagation()}>
            <div className="voice-modal-header">
              <h3>Dictado clínico</h3>
              <button className="voice-modal-close" onClick={cerrarModal} aria-label="Cerrar">
                ×
              </button>
            </div>

            <div className="voice-modal-body">
              <p className={`voice-instruction ${isRecording ? 'recording' : ''}`}>
                {isRecording
                  ? 'Escuchando. Hable con naturalidad y en el orden que quiera: cada dato se coloca solo en el reporte.'
                  : 'Dictado detenido.'}
              </p>

              <div className="voice-transcript-box">
                <p>
                  {transcript || (isRecording ? 'Esperando voz...' : 'Sin texto.')}
                  {interimTranscript && <span className="interim"> {interimTranscript}</span>}
                </p>
              </div>

              {resumen.length > 0 && (
                <div className="voice-bert-results">
                  {resumen.map((chip) => (
                    <span key={chip} className="voice-chip">
                      {chip}
                    </span>
                  ))}
                </div>
              )}

              {!hayTexto && (
                <p className="voice-instruction">
                  Ejemplo: «Masculino de 45 años, dolor en el pecho desde hace una hora, pulso 90, presión 120 sobre 80, saturación 94, se le dio oxígeno». Para enviar diga «envía reporte urgente».
                </p>
              )}

              {errorMessage && <div className="voice-error">{errorMessage}</div>}

              {lastAction && (
                <div className="voice-instruction recording">
                  Comando detectado: {lastAction === 'enviar_urgente' ? 'envío urgente' : 'envío completo'}
                </div>
              )}

              <div className="voice-actions">
                <button
                  className={`voice-btn primary ${isRecording ? 'recording' : ''}`}
                  onClick={() => detenerCaptura({ procesarFinal: true })}
                  disabled={processing || !isRecording}
                >
                  {isRecording ? 'Detener y procesar' : 'Detenido'}
                </button>
                <button className="voice-btn secondary" onClick={iniciarCaptura} disabled={processing}>
                  Reiniciar
                </button>
              </div>

              <div className="voice-actions" style={{ marginTop: 8 }}>
                <button className="voice-btn primary" onClick={() => enviarManual('enviar_urgente')} disabled={!hayTexto}>
                  Enviar urgente
                </button>
                <button className="voice-btn primary" onClick={() => enviarManual('enviar_completo')} disabled={!hayTexto}>
                  Enviar completo
                </button>
              </div>

              {processing && (
                <div className="voice-processing">
                  <span className="spinner"></span> Procesando...
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default VoiceAssistant;