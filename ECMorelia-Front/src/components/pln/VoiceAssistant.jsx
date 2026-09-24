// src/pln/VoiceAssistant.jsx
// Captura continua de voz con reinicio automático y sin repeticiones.
// El bug clásico de "palabras repetidas" viene de re-procesar índices ya
// finalizados. Aquí llevamos un índice explícito del último resultado
// procesado y solo leemos desde ahí en adelante.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { parseText } from './nlpService';
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

  const recognitionRef = useRef(null);
  const fullTextRef = useRef('');
  const lastResultIndexRef = useRef(0);
  const keepListeningRef = useRef(false);
  const processingRef = useRef(false);

  // Inicialización del reconocimiento (una sola vez)
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMessage('Este navegador no soporta reconocimiento de voz. Use Chrome o Edge.');
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = 'es-MX';
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setIsRecording(true);
    };

    rec.onresult = (event) => {
      let nuevosFinales = '';
      let interimActual = '';

      // Leer únicamente desde el último índice procesado
      for (let i = lastResultIndexRef.current; i < event.results.length; i++) {
        const resultado = event.results[i];
        const texto = resultado[0].transcript;

        if (resultado.isFinal) {
          nuevosFinales += texto + ' ';
          lastResultIndexRef.current = i + 1;
        } else {
          interimActual += texto;
        }
      }

      if (nuevosFinales) {
        fullTextRef.current = (fullTextRef.current + ' ' + nuevosFinales).trim();
        setTranscript(fullTextRef.current);
        // Analizar en vivo para poder mostrar feedback sección a sección
        analizarEnVivo(fullTextRef.current);
      }

      setInterimTranscript(interimActual);
    };

    rec.onerror = (event) => {
      if (event.error === 'not-allowed') {
        setErrorMessage('Permiso de micrófono denegado. Habilítelo en el navegador.');
        keepListeningRef.current = false;
        setIsRecording(false);
      } else if (event.error === 'no-speech') {
        // Silencio prolongado: no es error crítico, se reinicia solo
      } else if (event.error === 'aborted') {
        // Cierre normal
      } else {
        setErrorMessage(`Error de reconocimiento: ${event.error}`);
      }
    };

    rec.onend = () => {
      setIsRecording(false);
      // Si el usuario no pidió detener, reiniciar automáticamente
      // (el navegador suele cortar tras un minuto de silencio)
      if (keepListeningRef.current && recognitionRef.current) {
        try {
          lastResultIndexRef.current = 0; // nuevo ciclo del motor
          recognitionRef.current.start();
          return;
        } catch (_) {
          // Si falla el reinicio, esperar un poco y reintentar
          setTimeout(() => {
            if (keepListeningRef.current && recognitionRef.current) {
              try {
                lastResultIndexRef.current = 0;
                recognitionRef.current.start();
              } catch (_) {}
            }
          }, 500);
        }
      }
    };

    recognitionRef.current = rec;

    return () => {
      keepListeningRef.current = false;
      try { rec.abort(); } catch (_) {}
    };
  }, []);

  const analizarEnVivo = useCallback(async (texto) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    try {
      const parsed = await parseText(texto);
      if (onDataExtracted) onDataExtracted(parsed, { live: true });

      // Comandos de voz
      if (parsed.acciones.includes('detener_captura')) {
        detenerCaptura();
      } else if (parsed.acciones.includes('enviar_urgente')) {
        setLastAction('enviar_urgente');
        if (onDataExtracted) onDataExtracted(parsed, { action: 'enviar_urgente' });
      } else if (parsed.acciones.includes('enviar_completo')) {
        setLastAction('enviar_completo');
        if (onDataExtracted) onDataExtracted(parsed, { action: 'enviar_completo' });
      }
    } catch (e) {
      // Silencioso: el análisis en vivo no debe bloquear
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }, [onDataExtracted]);

  const detenerCaptura = useCallback(() => {
    keepListeningRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
    }
    setIsRecording(false);

    // Procesar el texto completo al detener
    if (fullTextRef.current.trim()) {
      procesarTextoFinal(fullTextRef.current);
    }
  }, []);

  const procesarTextoFinal = useCallback(async (texto) => {
    setProcessing(true);
    try {
      const parsed = await parseText(texto);
      if (onDataExtracted) onDataExtracted(parsed, { live: false, final: true });
      if (onRecordingComplete) onRecordingComplete(parsed);
    } catch (e) {
      setErrorMessage('Error procesando el texto.');
      if (onError) onError('No se pudo procesar el dictado.');
    } finally {
      setProcessing(false);
    }
  }, [onDataExtracted, onRecordingComplete, onError]);

  const iniciarCaptura = useCallback(() => {
    if (!recognitionRef.current) return;
    fullTextRef.current = '';
    lastResultIndexRef.current = 0;
    setTranscript('');
    setInterimTranscript('');
    setErrorMessage('');
    setLastAction(null);
    keepListeningRef.current = true;
    try {
      recognitionRef.current.start();
    } catch (_) {
      // Si ya estaba iniciado, reiniciar
      try {
        recognitionRef.current.stop();
        setTimeout(() => {
          lastResultIndexRef.current = 0;
          recognitionRef.current.start();
        }, 200);
      } catch (_) {}
    }
  }, []);

  // Abrir modal => iniciar captura
  useEffect(() => {
    if (isOpen && !isRecording) {
      iniciarCaptura();
    }
    if (!isOpen && isRecording) {
      detenerCaptura();
    }
  }, [isOpen, isRecording, iniciarCaptura, detenerCaptura]);

  const cerrarModal = () => {
    setIsOpen(false);
  };

  const enviarManual = (tipo) => {
    if (onDataExtracted) {
      onDataExtracted(
        { acciones: [tipo], secciones: {} },
        { action: tipo, manual: true }
      );
    }
    detenerCaptura();
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

              {errorMessage && <div className="voice-error">{errorMessage}</div>}

              {lastAction && (
                <div className="voice-instruction recording">
                  Comando detectado: {lastAction === 'enviar_urgente' ? 'envío urgente' : 'envío completo'}
                </div>
              )}

              <div className="voice-actions">
                <button
                  className={`voice-btn primary ${isRecording ? 'recording' : ''}`}
                  onClick={detenerCaptura}
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