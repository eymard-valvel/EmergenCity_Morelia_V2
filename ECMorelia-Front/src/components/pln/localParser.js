// src/pln/localParser.js
export function parseTextLocal(text) {
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
        hallazgos_escena: text,
        intervenciones: []
    };

    // Motivo de urgencia (buscar frases con palabras clave)
    const keywords = ['dolor', 'fiebre', 'trauma', 'accidente', 'caída', 'náuseas', 'vómito', 'hemorragia', 'dificultad respiratoria'];
    for (const kw of keywords) {
        const match = text.match(new RegExp(`[^.]*${kw}[^.]*\\.`, 'i'));
        if (match) {
            result.motivo_urgencia = match[0].trim();
            break;
        }
    }

    // Descripción de lesión
    const lesionKeywords = ['trauma', 'herida', 'fractura', 'lesión', 'quemadura', 'golpe', 'contusión', 'torácico', 'craneal'];
    for (const kw of lesionKeywords) {
        const match = text.match(new RegExp(`[^.]*${kw}[^.]*\\.`, 'i'));
        if (match) {
            result.descripcion_lesion = match[0].trim();
            break;
        }
    }

    // Signos vitales
    const fcMatch = text.match(/\b(?:fc|frecuencia\s*card[ií]aca)\s*[:]?\s*(\d{2,3})\b/i);
    if (fcMatch) result.signos_vitales.frecuencia_cardiaca = fcMatch[1];
    const frMatch = text.match(/\b(?:fr|frecuencia\s*respiratoria)\s*[:]?\s*(\d{2,3})\b/i);
    if (frMatch) result.signos_vitales.frecuencia_respiratoria = frMatch[1];
    const taMatch = text.match(/\b(?:ta|tensi[oó]n\s*arterial)\s*[:]?\s*(\d{2,3})\s*[\/\s]+(?:sobre\s*)?(\d{2,3})\b/i);
    if (taMatch) result.signos_vitales.tension_arterial = `${taMatch[1]}/${taMatch[2]}`;
    const spo2Match = text.match(/\b(?:spo2|saturaci[oó]n)\s*[:]?\s*(\d{2,3})\b/i);
    if (spo2Match) result.signos_vitales.saturacion_oxigeno = spo2Match[1];
    const tempMatch = text.match(/\b(?:temperatura)\s*[:]?\s*(\d{2,3}\.?\d*)\b/i);
    if (tempMatch) result.signos_vitales.temperatura = tempMatch[1];

    // Glasgow
    const gcsMatch = text.match(/\b(?:glasgow|gcs)\s*[:]?\s*(\d{1,2})\b/i);
    if (gcsMatch) {
        result.glasgow.total = parseInt(gcsMatch[1], 10);
    } else {
        const ocular = text.match(/\bocular\s*[:]?\s*(\d)\b/i);
        if (ocular) result.glasgow.ocular = parseInt(ocular[1], 10);
        const verbal = text.match(/\bverbal\s*[:]?\s*(\d)\b/i);
        if (verbal) result.glasgow.verbal = parseInt(verbal[1], 10);
        const motor = text.match(/\bmotor\s*[:]?\s*(\d)\b/i);
        if (motor) result.glasgow.motor = parseInt(motor[1], 10);
        if (result.glasgow.ocular && result.glasgow.verbal && result.glasgow.motor) {
            result.glasgow.total = result.glasgow.ocular + result.glasgow.verbal + result.glasgow.motor;
        }
    }

    // Intervenciones: buscar palabras clave de tratamientos
    const treatmentKeywords = ['oxigenoterapia', 'oxígeno', 'intubación', 'ventilación', 'desfibrilación',
        'masaje cardiaco', 'rccp', 'vendaje', 'inmovilización', 'férula', 'catéter', 'sonda',
        'drenaje', 'aspiración', 'medicación', 'suero', 'vía intravenosa'];
    const found = treatmentKeywords.filter(kw => text.toLowerCase().includes(kw));
    if (found.length > 0) {
        result.intervenciones = found.map(t => ({
            tipo_intervencion: t,
            descripcion: '',
            hora_intervencion: ''
        }));
    }

    // Nombre, edad, sexo
    const nombreMatch = text.match(/(?:paciente|nombre)\s+(?:de\s+)?([A-Za-záéíóúñ\s]+?)(?:\s+(?:de|con|que|y|,|\.|$))/i);
    if (nombreMatch) result.paciente.nombre = nombreMatch[1].trim();
    const edadMatch = text.match(/\b(\d{1,3})\s*(años|año|edad)\b/i);
    if (edadMatch) result.paciente.edad = parseInt(edadMatch[1], 10);
    if (/\b(masculino|hombre|varón)\b/i.test(text)) result.paciente.sexo = 'M';
    else if (/\b(femenino|mujer)\b/i.test(text)) result.paciente.sexo = 'F';

    return result;
}