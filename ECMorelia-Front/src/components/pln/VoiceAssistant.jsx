import React, { useState, useEffect, useRef } from 'react';
import { parseText } from './nlpService';
import './VoiceAssistant.css';

// Icono micrófono (SVG simple)
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
    const [transcript, setTranscript] = useState(''); // texto acumulado final
    const [interimTranscript, setInterimTranscript] = useState('');
    const [processing, setProcessing] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const recognitionRef = useRef(null);
    const fullTextRef = useRef(''); // acumulador de texto final

    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setErrorMessage('❌ Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.');
            return;
        }

        const rec = new SpeechRecognition();
        rec.lang = 'es-ES';
        rec.interimResults = true;
        rec.continuous = true; // no se detiene por silencio

        rec.onresult = (event) => {
            let final = '';
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const piece = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    final += piece;
                } else {
                    interim += piece;
                }
            }
            // Acumular solo los finales
            if (final) {
                fullTextRef.current += (fullTextRef.current ? ' ' : '') + final;
                setTranscript(fullTextRef.current);
            }
            setInterimTranscript(interim);
        };

        rec.onerror = (event) => {
            console.error('Error de reconocimiento:', event.error);
            if (event.error === 'not-allowed') {
                setErrorMessage('❌ Permiso de micrófono denegado. Habilítalo en el navegador.');
            } else if (event.error === 'no-speech') {
                setErrorMessage('⚠️ No se detectó voz. Intenta de nuevo.');
            } else {
                setErrorMessage(`❌ Error: ${event.error}`);
            }
            setIsRecording(false);
        };

        rec.onend = () => {
            setIsRecording(false);
            // Si hay texto acumulado y no estamos procesando, procesar automáticamente
            if (fullTextRef.current.trim() && !processing) {
                handleProcess(fullTextRef.current);
            }
        };

        recognitionRef.current = rec;

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.abort();
            }
        };
    }, []);

    // Abrir modal => iniciar grabación
    useEffect(() => {
        if (isOpen && recognitionRef.current && !isRecording && !processing) {
            fullTextRef.current = ''; // reset al abrir
            setTranscript('');
            setInterimTranscript('');
            setErrorMessage('');
            recognitionRef.current.start();
            setIsRecording(true);
        }
        if (!isOpen && isRecording && recognitionRef.current) {
            recognitionRef.current.stop();
            setIsRecording(false);
        }
    }, [isOpen]);

    const handleProcess = async (text) => {
        if (!text || !text.trim()) {
            setErrorMessage('⚠️ No hay texto para procesar.');
            return;
        }
        setProcessing(true);
        setErrorMessage('');
        try {
            const parsedData = await parseText(text);
            onDataExtracted(parsedData);
            if (onRecordingComplete) onRecordingComplete();
            // Cerrar modal tras éxito
            setTimeout(() => setIsOpen(false), 800);
        } catch (error) {
            console.error('Error al procesar:', error);
            setErrorMessage('❌ Error al procesar el texto. Intenta de nuevo.');
        } finally {
            setProcessing(false);
        }
    };

    const stopAndProcess = () => {
        if (recognitionRef.current && isRecording) {
            recognitionRef.current.stop(); // onend procesará
        } else if (fullTextRef.current.trim()) {
            handleProcess(fullTextRef.current);
        } else {
            setErrorMessage('⚠️ No hay texto para procesar. Graba algo primero.');
        }
    };

    const resetAndRecord = () => {
        if (recognitionRef.current && isRecording) {
            recognitionRef.current.stop();
        }
        fullTextRef.current = '';
        setTranscript('');
        setInterimTranscript('');
        setErrorMessage('');
        if (recognitionRef.current) {
            recognitionRef.current.start();
            setIsRecording(true);
        }
    };

    const closeModal = () => {
        if (isRecording && recognitionRef.current) {
            recognitionRef.current.stop();
        }
        setIsOpen(false);
    };

    return (
        <>
            <button
                className="voice-assistant-btn"
                onClick={() => setIsOpen(true)}
                title="Asistente de voz"
                aria-label="Abrir asistente de voz"
            >
                <MicIcon />
            </button>

            {isOpen && (
                <div className="voice-modal-overlay" onClick={closeModal}>
                    <div className="voice-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="voice-modal-header">
                            <h3>Asistente de voz</h3>
                            <button className="voice-modal-close" onClick={closeModal}>×</button>
                        </div>
                        <div className="voice-modal-body">
                            <p className={`voice-instruction ${isRecording ? 'recording' : ''}`}>
                                {isRecording ? '🔴 Grabando... hable con claridad' : '⏸️ Grabación detenida'}
                            </p>

                            <div className="voice-transcript-box">
                                <p>
                                    {transcript || 'Esperando voz...'}
                                    {interimTranscript && <span className="interim"> ({interimTranscript})</span>}
                                </p>
                            </div>

                            {errorMessage && (
                                <div className="voice-error">{errorMessage}</div>
                            )}

                            <div className="voice-actions">
                                <button
                                    className={`voice-btn primary ${isRecording ? 'recording' : ''}`}
                                    onClick={stopAndProcess}
                                    disabled={processing || (!isRecording && !fullTextRef.current)}
                                >
                                    {isRecording ? 'Detener y procesar' : 'Procesar texto'}
                                </button>
                                <button
                                    className="voice-btn secondary"
                                    onClick={resetAndRecord}
                                    disabled={processing}
                                >
                                    Reiniciar
                                </button>
                            </div>

                            {processing && (
                                <div className="voice-processing">
                                    <span className="spinner">⏳</span> Procesando...
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