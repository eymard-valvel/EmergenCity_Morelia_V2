import { parseTextLocal } from './localParser';

const API_URL = import.meta.env.VITE_API || 'http://localhost:3000/api';

export const parseText = async (text) => {
    if (!text || !text.trim()) {
        throw new Error('Texto vacío');
    }

    try {
        const response = await fetch(`${API_URL}/nlp/parse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });

        if (response.ok) {
            const data = await response.json();
            console.log('✅ NLP con Hugging Face:', data);
            return data;
        } else {
            console.warn('⚠️ Backend error, usando fallback local');
        }
    } catch (error) {
        console.warn('⚠️ Error de red, usando fallback local:', error.message);
    }

    // Fallback local
    return parseTextLocal(text);
};