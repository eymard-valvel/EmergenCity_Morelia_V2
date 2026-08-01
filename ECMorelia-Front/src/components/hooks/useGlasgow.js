import { useState, useCallback } from 'react';

const GLASGOW = {
  ocular: { 1: 'No abre', 2: 'Al dolor', 3: 'Al habla', 4: 'Espontánea' },
  verbal: { 1: 'Sin respuesta', 2: 'Sonidos incomprensibles', 3: 'Palabras inapropiadas', 4: 'Confuso', 5: 'Orientado' },
  motor: { 1: 'Sin movimiento', 2: 'Extensión anormal', 3: 'Flexión anormal', 4: 'Retirada al dolor', 5: 'Localiza dolor', 6: 'Obedece órdenes' },
};

export const useGlasgow = (initialOcular = 4, initialVerbal = 5, initialMotor = 6) => {
  const [ocular, setOcular] = useState(initialOcular);
  const [verbal, setVerbal] = useState(initialVerbal);
  const [motor, setMotor] = useState(initialMotor);
  const total = ocular + verbal + motor;

  const getTriageLevel = useCallback((total) => {
    if (total <= 8) return { color: '#ff4d4f', label: 'Crítico (Rojo)' };
    if (total <= 12) return { color: '#ff7a45', label: 'Urgente (Naranja)' };
    if (total <= 14) return { color: '#ffd666', label: 'Observación (Amarillo)' };
    return { color: '#52c41a', label: 'Estable (Verde)' };
  }, []);

  return { ocular, setOcular, verbal, setVerbal, motor, setMotor, total, getTriageLevel, GLASGOW };
};