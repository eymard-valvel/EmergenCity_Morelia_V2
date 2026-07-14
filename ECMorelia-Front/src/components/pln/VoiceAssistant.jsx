import React, { useState, useEffect, useRef } from 'react';
import { parseText } from './nlpService';
import './VoiceAssistant.css';

const VoiceAssistant = ({ onDataExtracted, onError, onRecordingComplete }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [interimTranscript, setInterimTranscript] = useState('');
    const [processing, setProcessing] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const recognitionRef = useRef(null);

    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            const msg = '❌ Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.';
            setErrorMessage(msg);
            onError && onError(msg);
            return;
        }

        const rec = new SpeechRecognition();
        rec.lang = 'es-ES';
        rec.interimResults = true;
        rec.continuous = true;

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
            setTranscript(final);
            setInterimTranscript(interim);
            // Limpiar error cuando se recibe texto
            if (errorMessage) setErrorMessage('');
        };

        rec.onerror = (event) => {
            console.error('Error de reconocimiento:', event.error);
            setIsRecording(false);
            if (event.error === 'not-allowed') {
                setErrorMessage('❌ Permiso de micrófono denegado. Habilítalo en la configuración del navegador.');
            } else if (event.error === 'no-speech') {
                setErrorMessage('⚠️ No se detectó voz. Intenta de nuevo.');
            } else {
                setErrorMessage(`❌ Error: ${event.error}`);
            }
            onError && onError(event.error);
        };

        rec.onend = () => {
            setIsRecording(false);
            // Procesar automáticamente al finalizar la grabación si hay texto
            if (transcript.trim() && !processing) {
                handleProcess(transcript);
            }
        };

        recognitionRef.current = rec;

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.abort();
            }
        };
    }, []);

    // Abrir modal => iniciar grabación automática
    useEffect(() => {
        if (isOpen && recognitionRef.current && !isRecording && !processing) {
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
            // Cerrar el modal automáticamente después de procesar
            setTimeout(() => setIsOpen(false), 800);
        } catch (error) {
            console.error('Error al procesar texto:', error);
            const msg = '❌ Error al procesar el texto. Intenta de nuevo.';
            setErrorMessage(msg);
            onError && onError(msg);
        } finally {
            setProcessing(false);
        }
    };

    const stopAndProcess = () => {
        if (recognitionRef.current && isRecording) {
            // Detener la grabación (esto disparará onend y luego procesará)
            recognitionRef.current.stop();
        } else if (transcript.trim()) {
            // Si no está grabando, procesar el texto que ya tenemos
            handleProcess(transcript);
        } else {
            setErrorMessage('⚠️ No hay texto para procesar. Graba algo primero.');
        }
    };

    const closeModal = () => {
        if (isRecording && recognitionRef.current) {
            recognitionRef.current.stop();
            setIsRecording(false);
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
                🎤
            </button>

            {isOpen && (
                <div className="voice-modal-overlay" onClick={closeModal}>
                    <div className="voice-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="voice-modal-header">
                            <h3>🎙️ Asistente de voz</h3>
                            <button className="voice-modal-close" onClick={closeModal}>×</button>
                        </div>
                        <div className="voice-modal-body">
                            <p className={`voice-instruction ${isRecording ? 'recording' : ''}`}>
                                {isRecording ? '🔴 Grabando... habla claramente' : '⏸️ Grabación detenida'}
                            </p>

                            <div className="voice-transcript-box">
                                <p>
                                    {transcript || 'Esperando voz...'}
                                    {interimTranscript && <span className="interim"> ({interimTranscript})</span>}
                                </p>
                            </div>

                            {errorMessage && (
                                <div className="voice-error">
                                    {errorMessage}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button
                                    className={`voice-record-btn ${isRecording ? 'recording' : ''}`}
                                    onClick={stopAndProcess}
                                    disabled={processing || (!isRecording && !transcript.trim())}
                                    style={{ flex: 1 }}
                                >
                                    {isRecording ? '⏹️ Detener y procesar' : '▶️ Procesar texto'}
                                </button>
                            </div>

                            {processing && (
                                <div className="voice-processing">
                                    <span className="spinner">⏳</span> Procesando con IA médica...
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