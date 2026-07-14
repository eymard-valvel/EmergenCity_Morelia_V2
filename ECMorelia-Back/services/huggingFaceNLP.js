// backend/services/huggingFaceNLP.js
const axios = require('axios');

const HF_API_URL = 'https://api-inference.huggingface.co/models/HUMADEX/spanish_medical_ner';
const HF_TOKEN = process.env.HUGGINGFACE_TOKEN; // Token de Hugging Face

/**
 * Extrae entidades médicas de un texto usando el modelo de Hugging Face
 * Retorna un objeto estructurado con los datos del paciente
 */
async function extractMedicalEntities(text) {
    try {
        // Llamada a la API de Hugging Face
        const response = await axios({
            method: 'post',
            url: HF_API_URL,
            headers: {
                'Authorization': `Bearer ${HF_TOKEN}`,
                'Content-Type': 'application/json'
            },
            data: { inputs: text },
            timeout: 30000 // 30 segundos
        });

        // Si la respuesta es exitosa, procesamos las entidades
        const entities = response.data;
        return parseEntitiesToStructuredData(entities, text);
    } catch (error) {
        console.error('Error en Hugging Face API:', error.message);
        // Si falla la API, hacemos fallback a parseo local
        console.warn('Usando fallback local...');
        return parseTextLocal(text); // Tu función local existente
    }
}

/**
 * Convierte las entidades de Hugging Face a nuestro formato estructurado
 */
function parseEntitiesToStructuredData(entities, originalText) {
    // Inicializamos el resultado
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

    // Agrupamos entidades por tipo
    const problems = [];
    const tests = [];
    const treatments = [];

    entities.forEach(entity => {
        const word = entity.word || entity.entity;
        const entityGroup = entity.entity_group || entity.label;

        if (entityGroup === 'PROBLEM') {
            problems.push(word);
        } else if (entityGroup === 'TEST') {
            tests.push(word);
        } else if (entityGroup === 'TREATMENT') {
            treatments.push(word);
        }
    });

    // 1. Motivo de urgencia: tomamos los PROBLEMS como motivo
    if (problems.length > 0) {
        result.motivo_urgencia = problems.join(', ');
    }

    // 2. Descripción de lesión: buscamos palabras clave en el texto
    const lesionKeywords = ['trauma', 'herida', 'fractura', 'lesión', 'quemadura', 'golpe', 'contusión'];
    const foundLesion = lesionKeywords.find(kw => originalText.toLowerCase().includes(kw));
    if (foundLesion) {
        // Extraemos la frase que contiene la palabra clave
        const match = originalText.match(new RegExp(`[^.]*${foundLesion}[^.]*\\.`, 'i'));
        if (match) {
            result.descripcion_lesion = match[0].trim();
        }
    }

    // 3. Signos vitales (usamos regex para valores numéricos)
    const fcMatch = originalText.match(/\b(?:fc|frecuencia\s*card[ií]aca)\s*[:]?\s*(\d{2,3})\b/i);
    if (fcMatch) result.signos_vitales.frecuencia_cardiaca = fcMatch[1];

    const frMatch = originalText.match(/\b(?:fr|frecuencia\s*respiratoria)\s*[:]?\s*(\d{2,3})\b/i);
    if (frMatch) result.signos_vitales.frecuencia_respiratoria = frMatch[1];

    const taMatch = originalText.match(/\b(?:ta|tensi[oó]n\s*arterial)\s*[:]?\s*(\d{2,3})\s*[/\s]+(\d{2,3})\b/i);
    if (taMatch) result.signos_vitales.tension_arterial = `${taMatch[1]}/${taMatch[2]}`;

    const spo2Match = originalText.match(/\b(?:spo2|saturaci[oó]n)\s*[:]?\s*(\d{2,3})\b/i);
    if (spo2Match) result.signos_vitales.saturacion_oxigeno = spo2Match[1];

    const tempMatch = originalText.match(/\b(?:temperatura)\s*[:]?\s*(\d{2,3}\.?\d*)\b/i);
    if (tempMatch) result.signos_vitales.temperatura = tempMatch[1];

    // 4. Glasgow
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

    // 5. Intervenciones (TREATMENTS de Hugging Face)
    if (treatments.length > 0) {
        result.intervenciones = treatments;
    }

    // 6. Intentar extraer nombre (palabras después de "paciente")
    const nombreMatch = originalText.match(/(?:paciente|nombre)\s+(?:de\s+)?([A-Za-záéíóúñ\s]+?)(?:\s+(?:de|con|que|y|,|\.|$))/i);
    if (nombreMatch) result.paciente.nombre = nombreMatch[1].trim();

    // 7. Edad
    const edadMatch = originalText.match(/\b(\d{1,3})\s*(años|año|edad)\b/i);
    if (edadMatch) result.paciente.edad = parseInt(edadMatch[1], 10);

    // 8. Sexo
    if (/\b(masculino|hombre|varón)\b/i.test(originalText)) result.paciente.sexo = 'M';
    else if (/\b(femenino|mujer)\b/i.test(originalText)) result.paciente.sexo = 'F';

    return result;
}

/**
 * Función de fallback local (usar tu implementación existente)
 */
function parseTextLocal(text) {
    // Esta es tu función localParser.js existente
    // La importamos o copiamos aquí
    const { parseTextLocal } = require('../../src/pln/localParser');
    return parseTextLocal(text);
}

module.exports = { extractMedicalEntities };