// src/pln/nlpService.js
import { parseTextLocal } from './localParser';

const API_URL = import.meta.env.VITE_API || 'http://localhost:3000/api';

/**
 * Envía el texto al backend para procesamiento con Hugging Face.
 * Si falla, usa el parseo local como respaldo.
 */
export const parseText = async (text) => {
    if (!text || !text.trim()) {
        throw new Error('Texto vacío');
    }

    try {
        // Intentar con el backend (que usa Hugging Face)
        const response = await fetch(`${API_URL}/nlp/parse`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text }),
        });

        if (response.ok) {
            const data = await response.json();
            console.log('✅ Datos procesados con Hugging Face:', data);
            return data;
        } else {
            const errorText = await response.text();
            console.warn('⚠️ Backend respondió con error:', response.status, errorText);
        }
    } catch (error) {
        console.warn('⚠️ Error conectando al backend:', error.message);
    }

    // Fallback: parseo local
    console.log('🔄 Usando parseo local como respaldo');
    return parseTextLocal(text);
};