// src/pln/VoiceAssistant.jsx
// Captura continua de voz con reinicio automático y sin repeticiones.
// El bug clásico de "palabras repetidas" viene de re-procesar índices ya
// finalizados. Aquí llevamos un índice explícito del último resultado
// procesado y solo leemos desde ahí en adelante.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { parseText, parseTextConBert, getEstadoBert, setBertOpcion } from './nlpService';
import './VoiceAssistant.css';

const MicIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const VoiceAssistant = ({ onDataExtracted, onError, onRecordingComplete }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastAction, setLastAction] = useState(null);
  const [bertOpcion, setBertOpcionLocal] = useState(() => getEstadoBert().habilitado);
  const [bertEstado, setBertEstado] = useState(() => getEstadoBert());
  const [bertInfo, setBertInfo] = useState(null);

  const isMountedRef = useRef(true);
  const recognitionRef = useRef(null);
  const fullTextRef = useRef('');
  const lastResultIndexRef = useRef(0);
  const committedLengthRef = useRef(0);
  const keepListeningRef = useRef(false);
  const processingRef = useRef(false);
  const lastAnalyzeRef = useRef(0);
  const isMobileRef = useRef(false);
  const retryTimeoutRef = useRef(null);

  // Refs para callbacks y opciones actuales sin romper dependencias
  const bertOpcionRef = useRef(bertOpcion);
  bertOpcionRef.current = bertOpcion;

  const callbacksRef = useRef({ onDataExtracted, onError, onRecordingComplete });
  callbacksRef.current = { onDataExtracted, onError, onRecordingComplete };

  const analizarEnVivoRef = useRef(null);

  const procesarTextoFinal = useCallback(async (texto) => {
    if (!texto || !texto.trim()) return;
    if (isMountedRef.current) {
      setProcessing(true);
    }
    try {
      const parsed = bertOpcionRef.current
        ? await parseTextConBert(texto)
        : await parseText(texto);

      if (!isMountedRef.current) return;

      setBertEstado(getEstadoBert());
      setBertInfo(parsed?.bert || null);
      callbacksRef.current.onDataExtracted?.(parsed, { live: false, final: true });
      callbacksRef.current.onRecordingComplete?.(parsed);
    } catch (_) {
      if (!isMountedRef.current) return;
      setErrorMessage('Error procesando el texto.');
      callbacksRef.current.onError?.('No se pudo procesar el dictado.');
    } finally {
      if (isMountedRef.current) {
        setProcessing(false);
      }
    }
  }, []);

  const detenerCaptura = useCallback(
    ({ procesarFinal = true } = {}) => {
      keepListeningRef.current = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }

      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_) {}
      }

      if (isMountedRef.current) {
        setIsRecording(false);
        setInterimTranscript('');
      }

      if (procesarFinal && fullTextRef.current.trim()) {
        procesarTextoFinal(fullTextRef.current);
      }
    },
    [procesarTextoFinal]
  );

  const analizarEnVivo = useCallback(
    async (texto) => {
      if (!texto || !texto.trim()) return;
      if (processingRef.current) return;
      processingRef.current = true;
      if (isMountedRef.current) {
        setProcessing(true);
      }
      try {
        const parsed = await parseText(texto);
        if (!isMountedRef.current || !parsed) return;

        callbacksRef.current.onDataExtracted?.(parsed, { live: true });

        if (Array.isArray(parsed.acciones)) {
          if (parsed.acciones.includes('detener_captura')) {
            detenerCaptura({ procesarFinal: true });
          } else if (parsed.acciones.includes('enviar_urgente')) {
            setLastAction('enviar_urgente');
            callbacksRef.current.onDataExtracted?.(parsed, { action: 'enviar_urgente' });
          } else if (parsed.acciones.includes('enviar_completo')) {
            setLastAction('enviar_completo');
            callbacksRef.current.onDataExtracted?.(parsed, { action: 'enviar_completo' });
          }
        }
      } catch (_) {
        // Silencioso: el análisis en vivo no debe bloquear la captura
      } finally {
        processingRef.current = false;
        if (isMountedRef.current) {
          setProcessing(false);
        }
      }
    },
    [detenerCaptura]
  );

  analizarEnVivoRef.current = analizarEnVivo;

  const iniciarCaptura = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (!recognitionRef.current) {
      if (isMountedRef.current) {
        setErrorMessage('Este navegador no soporta reconocimiento de voz. Use Chrome o Edge.');
      }
      return;
    }

    fullTextRef.current = '';
    lastResultIndexRef.current = 0;
    committedLengthRef.current = 0;
    lastAnalyzeRef.current = 0;

    if (isMountedRef.current) {
      setTranscript('');
      setInterimTranscript('');
      setErrorMessage('');
      setLastAction(null);
      setBertInfo(null);
    }

    keepListeningRef.current = true;

    try {
      recognitionRef.current.start();
    } catch (_) {
      try {
        recognitionRef.current.stop();
        retryTimeoutRef.current = setTimeout(() => {
          if (keepListeningRef.current && recognitionRef.current && isMountedRef.current) {
            lastResultIndexRef.current = 0;
            committedLengthRef.current = 0;
            lastAnalyzeRef.current = 0;
            try {
              recognitionRef.current.start();
            } catch (_) {}
          }
        }, 200);
      } catch (_) {}
    }
  }, []);

  // Inicialización del reconocimiento (una sola vez)
  useEffect(() => {
    isMountedRef.current = true;

    if (typeof window === 'undefined') {
      return undefined;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMessage('Este navegador no soporta reconocimiento de voz. Use Chrome o Edge.');
      return () => {
        isMountedRef.current = false;
      };
    }

    if (window.isSecureContext === false && window.location.hostname !== 'localhost') {
      setErrorMessage('El reconocimiento de voz en la nube requiere conexión segura (HTTPS).');
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
      if (isMountedRef.current) {
        setIsRecording(true);
      }
    };

    rec.onresult = (event) => {
      if (!isMountedRef.current) return;

      let nuevosFinales = '';
      let interimActual = '';

      if (lastResultIndexRef.current > event.results.length) {
        lastResultIndexRef.current = 0;
      }

      for (let i = lastResultIndexRef.current; i < event.results.length; i++) {
        const resultado = event.results[i];
        const texto = resultado?.[0]?.transcript ? resultado[0].transcript : '';

        if (resultado.isFinal && texto.trim()) {
          nuevosFinales += texto + ' ';
          lastResultIndexRef.current = i + 1;
        } else if (!resultado.isFinal && texto) {
          interimActual += texto;
        }
      }

      if (nuevosFinales.trim()) {
        const agregado = nuevosFinales.replace(/\s+/g, ' ').trim();
        if (!agregado) {
          setInterimTranscript(interimActual);
          return;
        }

        const actual = fullTextRef.current;
        if (actual) {
          const agregadoLower = agregado.toLowerCase();
          const actualLower = actual.toLowerCase();
          if (actualLower.endsWith(agregadoLower)) {
            setInterimTranscript(interimActual);
            return;
          }

          const palabrasAgregadas = agregado.split(/\s+/);
          if (palabrasAgregadas.length > 0) {
            const ultimas = actual
              .split(/\s+/)
              .slice(-palabrasAgregadas.length)
              .join(' ')
              .toLowerCase();
            if (ultimas === agregadoLower) {
              setInterimTranscript(interimActual);
              return;
            }
          }

          fullTextRef.current = `${actual} ${agregado}`.replace(/\s+/g, ' ').trim();
        } else {
          fullTextRef.current = agregado;
        }

        setTranscript(fullTextRef.current);
        committedLengthRef.current = fullTextRef.current.length;

        const ahora = Date.now();
        if (ahora - lastAnalyzeRef.current > (isMobileRef.current ? 1000 : 800)) {
          lastAnalyzeRef.current = ahora;
          analizarEnVivoRef.current?.(fullTextRef.current);
        }
      }

      setInterimTranscript(interimActual);
    };

    rec.onerror = (event) => {
      if (!isMountedRef.current) return;

      const fatalErrors = ['not-allowed', 'service-not-allowed', 'audio-capture'];
      if (event.error === 'not-allowed') {
        setErrorMessage('Permiso de micrófono denegado. Habilítelo en el navegador.');
        keepListeningRef.current = false;
        setIsRecording(false);
      } else if (fatalErrors.includes(event.error)) {
        setErrorMessage(`Error de audio/permisos (${event.error}). Verifique el micrófono y HTTPS.`);
        keepListeningRef.current = false;
        setIsRecording(false);
      } else if (event.error === 'no-speech' || event.error === 'aborted') {
        // Silencio o cierre normal: no interrumpir
      } else {
        setErrorMessage(`Error de reconocimiento: ${event.error}`);
      }
    };

    rec.onend = () => {
      if (!isMountedRef.current) return;
      setIsRecording(false);

      if (keepListeningRef.current && recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (_) {
          retryTimeoutRef.current = setTimeout(() => {
            if (keepListeningRef.current && recognitionRef.current && isMountedRef.current) {
              try {
                recognitionRef.current.start();
              } catch (_) {}
            }
          }, 500);
        }
      }
    };

    recognitionRef.current = rec;

    return () => {
      isMountedRef.current = false;
      keepListeningRef.current = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      try {
        rec.abort();
      } catch (_) {}
      recognitionRef.current = null;
    };
  }, []);

  // Abrir modal => iniciar captura; cerrar modal => detener sin forzar envío final
  useEffect(() => {
    if (isOpen) {
      iniciarCaptura();
    } else if (keepListeningRef.current || isRecording) {
      detenerCaptura({ procesarFinal: false });
    }
  }, [isOpen, iniciarCaptura, detenerCaptura, isRecording]);

  const cerrarModal = () => {
    setIsOpen(false);
  };

  const enviarManual = (tipo) => {
    const texto = fullTextRef.current || transcript || '';
    callbacksRef.current.onDataExtracted?.(
      {
        acciones: [tipo],
        secciones: {},
        textoOriginal: texto,
        textoNormalizado: texto.toLowerCase().trim(),
      },
      { action: tipo, manual: true }
    );
    detenerCaptura({ procesarFinal: false });
  };

  const alternarBert = () => {
    const nuevo = !bertOpcion;
    setBertOpcion(nuevo);
    setBertOpcionLocal(nuevo);
    setBertEstado(getEstadoBert());
    setBertInfo(null);
  };

  return (
    <>
      <button
        className="voice-assistant-btn"
        onClick={() => setIsOpen(true)}
        title="Asistente de dictado"
        aria-label="Abrir asistente de dictado"
      >
        <MicIcon />
      </button>

      {isOpen && (
        <div className="voice-modal-overlay" onClick={cerrarModal}>
          <div className="voice-modal" onClick={(e) => e.stopPropagation()}>
            <div className="voice-modal-header">
              <h3>Dictado Clínico</h3>
              <button className="voice-modal-close" onClick={cerrarModal} aria-label="Cerrar">
                ×
              </button>
            </div>

            <div className="voice-modal-body">
              <p className={`voice-instruction ${isRecording ? 'recording' : ''}`}>
                {isRecording
                  ? 'Grabando. Dicte por secciones: motivo, signos vitales, Glasgow, intervenciones.'
                  : 'Captura detenida.'}
              </p>

              <div className="voice-transcript-box">
                <p>
                  {transcript || 'Esperando voz...'}
                  {interimTranscript && (
                    <span className="interim"> {interimTranscript}</span>
                  )}
                </p>
              </div>

              <div className="voice-bert-bar">
                <label className="voice-bert-toggle">
                  <input
                    type="checkbox"
                    checked={bertOpcion}
                    onChange={alternarBert}
                  />
                  BERT / RoBERTa
                </label>
                <span
                  className={`voice-bert-badge ${
                    bertOpcion ? (bertEstado.listo ? 'active' : 'loading') : ''
                  }`}
                >
                  {bertOpcion
                    ? bertEstado.listo
                      ? 'modelos activos'
                      : Object.keys(bertEstado.fallos || {}).length > 0
                        ? 'modelos indisponibles: se usa regex'
                        : 'pesos en caché del navegador (0 uso en Render)'
                    : 'desactivada'}
                </span>
              </div>

              {bertOpcion && bertInfo && (
                <div className="voice-bert-results">
                  {bertInfo.sentimiento && (
                    <span className={`voice-chip ${bertInfo.sentimiento.valor}`}>
                      Sentimiento: {bertInfo.sentimiento.valor} ({bertInfo.sentimiento.confianza})
                    </span>
                  )}
                  {bertInfo.seccionPrincipal && (
                    <span className="voice-chip">
                      Sección: {bertInfo.seccionPrincipal}
                    </span>
                  )}
                  {bertInfo.entidades?.medicas?.length > 0 && (
                    <span className="voice-chip">
                      Entidades: {bertInfo.entidades.medicas.slice(0, 5).join(', ')}
                    </span>
                  )}
                </div>
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
                <button
                  className="voice-btn secondary"
                  onClick={iniciarCaptura}
                  disabled={processing}
                >
                  Reiniciar
                </button>
              </div>

              <div className="voice-actions" style={{ marginTop: 8 }}>
                <button
                  className="voice-btn primary"
                  onClick={() => enviarManual('enviar_urgente')}
                  disabled={!transcript.trim()}
                >
                  Enviar urgente
                </button>
                <button
                  className="voice-btn primary"
                  onClick={() => enviarManual('enviar_completo')}
                  disabled={!transcript.trim()}
                >
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