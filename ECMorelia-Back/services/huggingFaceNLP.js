// backend/services/huggingFaceNLP.js
const axios = require('axios');

const HF_API_URL = 'https://api-inference.huggingface.co/models/HUMADEX/spanish_medical_ner';
const HF_TOKEN = process.env.HUGGINGFACE_TOKEN;

async function extractMedicalEntities(text) {
    try {
        const response = await axios({
            method: 'post',
            url: HF_API_URL,
            headers: {
                'Authorization': `Bearer ${HF_TOKEN}`,
                'Content-Type': 'application/json'
            },
            data: { inputs: text },
            timeout: 20000
        });

        // La respuesta puede ser un array de arrays o un objeto
        let entities = response.data;
        if (Array.isArray(entities) && entities.length > 0 && Array.isArray(entities[0])) {
            entities = entities[0];
        }

        return parseEntities(entities, text);
    } catch (error) {
        console.error('Error en Hugging Face API:', error.message);
        console.warn('Usando fallback local...');
        return parseLocal(text);
    }
}

function parseEntities(entities, originalText) {
    const result = {
        paciente: { nombre: '', edad: '', sexo: '' },
        signos_vitales: {
            frecuencia_cardiaca: '',
            frecuencia_respiratoria: '',
            tension_arterial: '',
            saturacion_oxigeno: '',
            temperatura: ''
        },
        glasgow: { ocular: null, verbal: null, motor: null, total: null },
        motivo_urgencia: '',
        descripcion_lesion: '',
        hallazgos_escena: originalText,
        intervenciones: []
    };

    // Agrupar entidades por tipo
    const groups = { PROBLEM: [], TEST: [], TREATMENT: [] };
    entities.forEach(ent => {
        const group = ent.entity_group || ent.label;
        const word = ent.word || ent.entity || '';
        if (groups[group]) {
            groups[group].push(word);
        }
    });

    // Motivo de urgencia = todos los PROBLEM concatenados
    if (groups.PROBLEM.length > 0) {
        result.motivo_urgencia = groups.PROBLEM.join(', ');
    } else {
        // Fallback: buscar frases con palabras clave
        const keywords = ['dolor', 'fiebre', 'trauma', 'accidente', 'caída', 'náuseas', 'vómito', 'hemorragia', 'dificultad respiratoria'];
        for (const kw of keywords) {
            const match = originalText.match(new RegExp(`[^.]*${kw}[^.]*\\.`, 'i'));
            if (match) {
                result.motivo_urgencia = match[0].trim();
                break;
            }
        }
    }

    // Descripción de lesión
    const lesionKeywords = ['trauma', 'herida', 'fractura', 'lesión', 'quemadura', 'golpe', 'contusión', 'torácico', 'craneal', 'abdominal'];
    for (const kw of lesionKeywords) {
        const match = originalText.match(new RegExp(`[^.]*${kw}[^.]*\\.`, 'i'));
        if (match) {
            result.descripcion_lesion = match[0].trim();
            break;
        }
    }

    // Signos vitales (regex mejorados)
    const fcMatch = originalText.match(/\b(?:fc|frecuencia\s*card[ií]aca)\s*[:]?\s*(\d{2,3})\b/i);
    if (fcMatch) result.signos_vitales.frecuencia_cardiaca = fcMatch[1];

    const frMatch = originalText.match(/\b(?:fr|frecuencia\s*respiratoria)\s*[:]?\s*(\d{2,3})\b/i);
    if (frMatch) result.signos_vitales.frecuencia_respiratoria = frMatch[1];

    const taMatch = originalText.match(/\b(?:ta|tensi[oó]n\s*arterial)\s*[:]?\s*(\d{2,3})\s*[\/\s]+(?:sobre\s*)?(\d{2,3})\b/i);
    if (taMatch) result.signos_vitales.tension_arterial = `${taMatch[1]}/${taMatch[2]}`;

    const spo2Match = originalText.match(/\b(?:spo2|saturaci[oó]n)\s*[:]?\s*(\d{2,3})\b/i);
    if (spo2Match) result.signos_vitales.saturacion_oxigeno = spo2Match[1];

    const tempMatch = originalText.match(/\b(?:temperatura)\s*[:]?\s*(\d{2,3}\.?\d*)\b/i);
    if (tempMatch) result.signos_vitales.temperatura = tempMatch[1];

    // Glasgow
    const gcsMatch = originalText.match(/\b(?:glasgow|gcs)\s*[:]?\s*(\d{1,2})\b/i);
    if (gcsMatch) {
        result.glasgow.total = parseInt(gcsMatch[1], 10);
    } else {
        const ocular = originalText.match(/\bocular\s*[:]?\s*(\d)\b/i);
        if (ocular) result.glasgow.ocular = parseInt(ocular[1], 10);
        const verbal = originalText.match(/\bverbal\s*[:]?\s*(\d)\b/i);
        if (verbal) result.glasgow.verbal = parseInt(verbal[1], 10);
        const motor = originalText.match(/\bmotor\s*[:]?\s*(\d)\b/i);
        if (motor) result.glasgow.motor = parseInt(motor[1], 10);
        if (result.glasgow.ocular && result.glasgow.verbal && result.glasgow.motor) {
            result.glasgow.total = result.glasgow.ocular + result.glasgow.verbal + result.glasgow.motor;
        }
    }

    // Intervenciones (TREATMENT) → como objetos con tipo y descripción
    if (groups.TREATMENT.length > 0) {
        result.intervenciones = groups.TREATMENT.map(t => ({
            tipo_intervencion: t,
            descripcion: '',
            hora_intervencion: ''
        }));
    }

    // Nombre
    const nombreMatch = originalText.match(/(?:paciente|nombre)\s+(?:de\s+)?([A-Za-záéíóúñ\s]+?)(?:\s+(?:de|con|que|y|,|\.|$))/i);
    if (nombreMatch) result.paciente.nombre = nombreMatch[1].trim();

    // Edad
    const edadMatch = originalText.match(/\b(\d{1,3})\s*(años|año|edad)\b/i);
    if (edadMatch) result.paciente.edad = parseInt(edadMatch[1], 10);

    // Sexo
    if (/\b(masculino|hombre|varón)\b/i.test(originalText)) result.paciente.sexo = 'M';
    else if (/\b(femenino|mujer)\b/i.test(originalText)) result.paciente.sexo = 'F';

    return result;
}

// Función local de respaldo
function parseLocal(text) {
    // Reutilizamos la misma lógica sin entidades
    return parseEntities([], text);
}

module.exports = { extractMedicalEntities };