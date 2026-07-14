import React, { useState, useEffect } from 'react';
import { parseText } from './nlpService';

/**
 * Componente que permite grabar voz, transcribir y enviar al backend para extraer datos.
 * Recibe una función `onDataExtracted` para actualizar el formulario.
 */
const SpeechRecorder = ({ onDataExtracted, onError }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [recognition, setRecognition] = useState(null);

  useEffect(() => {
    // Verificar soporte de SpeechRecognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onError && onError('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.');
      return;
    }
    const recognitionInstance = new SpeechRecognition();
    recognitionInstance.lang = 'es-ES';
    recognitionInstance.interimResults = true;
    recognitionInstance.continuous = true;

    recognitionInstance.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptPiece = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcriptPiece;
        } else {
          interimText += transcriptPiece;
        }
      }
      // Mostrar el texto en tiempo real
      setTranscript(finalText + (interimText ? ' (en proceso...)' : ''));
    };

    recognitionInstance.onerror = (event) => {
      console.error('Error de reconocimiento:', event.error);
      setIsRecording(false);
      onError && onError('Error en el reconocimiento de voz: ' + event.error);
    };

    recognitionInstance.onend = () => {
      setIsRecording(false);
      // Cuando termina, procesar el texto final
      if (transcript.trim()) {
        handleProcessText(transcript);
      }
    };

    setRecognition(recognitionInstance);

    return () => {
      recognitionInstance.abort();
    };
  }, []);

  const handleProcessText = async (text) => {
    try {
      const parsedData = await parseText(text);
      // Llamar al callback para llenar el formulario
      onDataExtracted(parsedData);
    } catch (error) {
      console.error('Error al procesar el texto:', error);
      onError && onError('Error al procesar el texto con NLP');
    }
  };

  const toggleRecording = () => {
    if (!recognition) return;
    if (isRecording) {
      recognition.stop();
    } else {
      setTranscript('');
      recognition.start();
      setIsRecording(true);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <button
        type="button"
        onClick={toggleRecording}
        style={{
          background: isRecording ? '#ff4d4f' : '#1d8cf8',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          width: '48px',
          height: '48px',
          fontSize: '24px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: '0.2s',
        }}
        title={isRecording ? 'Detener grabación' : 'Iniciar grabación'}
      >
        {isRecording ? '⏹️' : '🎤'}
      </button>
      {transcript && (
        <div style={{ fontSize: '14px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {transcript}
        </div>
      )}
    </div>
  );
};

export default SpeechRecorder;