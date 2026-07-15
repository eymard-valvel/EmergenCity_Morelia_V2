// src/pln/localParser.js - Versión sincronizada con el backend
export function parseTextLocal(rawText) {
    const text = rawText.replace(/\s+/g, ' ').trim();

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

    // Diccionarios de palabras clave
    const keywords = {
        motivo: ['motivo', 'consulta', 'urgencia', 'por', 'presenta', 'refiere', 'manifiesta', 'dolor', 'fiebre', 'trauma'],
        lesion: ['lesión', 'trauma', 'herida', 'fractura', 'quemadura', 'golpe', 'contusión', 'torácico', 'craneal', 'abdominal'],
        signos: ['signos vitales', 'frecuencia cardíaca', 'fc', 'pulso', 'frecuencia respiratoria', 'fr', 'presión arterial', 'ta', 'saturación', 'spo2', 'temperatura'],
        glasgow: ['glasgow', 'gcs', 'escala de glasgow', 'ocular', 'verbal', 'motor']
    };

    // Dividir en oraciones
    const sentences = text.match(/[^.]+[.]?/g) || [text];
    let motivoText = '', lesionText = '', signosText = '', glasgowText = '', intervencionesText = '';

    for (const sentence of sentences) {
        const lower = sentence.toLowerCase();
        const hasMotivo = keywords.motivo.some(kw => lower.includes(kw));
        const hasLesion = keywords.lesion.some(kw => lower.includes(kw));
        const hasSignos = keywords.signos.some(kw => lower.includes(kw));
        const hasGlasgow = keywords.glasgow.some(kw => lower.includes(kw));

        if (hasGlasgow) glasgowText += sentence + ' ';
        else if (hasSignos) signosText += sentence + ' ';
        else if (hasLesion) lesionText += sentence + ' ';
        else if (hasMotivo) motivoText += sentence + ' ';
    }

    // Motivo
    if (motivoText) {
        result.motivo_urgencia = motivoText
            .replace(/^motivo\s+(?:de\s+)?(?:urgencia|consulta)\s*[:]?\s*/i, '')
            .replace(/^por\s+(?:presentar|tener|con)\s*/i, '')
            .trim();
    }

    // Lesión
    if (lesionText) {
        result.descripcion_lesion = lesionText
            .replace(/^lesión\s+(?:de|en|por)\s*/i, '')
            .replace(/^trauma\s+(?:de|en|por)\s*/i, '')
            .trim();
    }

    // Signos vitales
    const fullText = text;
    const fcMatch = fullText.match(/\b(?:fc|frecuencia\s*card[ií]aca|pulso)\s*[:]?\s*(\d{2,3})\b/i);
    if (fcMatch) result.signos_vitales.frecuencia_cardiaca = fcMatch[1];
    const frMatch = fullText.match(/\b(?:fr|frecuencia\s*respiratoria|respiración)\s*[:]?\s*(\d{2,3})\b/i);
    if (frMatch) result.signos_vitales.frecuencia_respiratoria = frMatch[1];
    const taMatch = fullText.match(/\b(?:ta|tensi[oó]n\s*(?:arterial)?|presi[oó]n\s*(?:arterial)?)\s*[:]?\s*(\d{2,3})\s*[\/\-\s]+(?:sobre\s*)?(\d{2,3})\b/i);
    if (taMatch) result.signos_vitales.tension_arterial = `${taMatch[1]}/${taMatch[2]}`;
    const spo2Match = fullText.match(/\b(?:spo2|saturaci[oó]n|o2\s*sat)\s*[:]?\s*(\d{2,3})\b/i);
    if (spo2Match) result.signos_vitales.saturacion_oxigeno = spo2Match[1];
    const tempMatch = fullText.match(/\b(?:temperatura|temp)\s*[:]?\s*(\d{2,3}\.?\d*)\b/i);
    if (tempMatch) result.signos_vitales.temperatura = tempMatch[1];

    // Glasgow (con soporte para números escritos)
    const numberMap = { 'uno':1, 'dos':2, 'tres':3, 'cuatro':4, 'cinco':5, 'seis':6, 'siete':7, 'ocho':8, 'nueve':9, 'diez':10 };
    const toNumber = (str) => {
        if (!str) return null;
        const lower = str.toLowerCase().trim();
        if (numberMap[lower]) return numberMap[lower];
        const num = parseInt(str, 10);
        return isNaN(num) ? null : num;
    };
    const gcsMatch = fullText.match(/\b(?:glasgow|gcs)\s*[:]?\s*([\w]+)\b/i);
    if (gcsMatch) {
        const total = toNumber(gcsMatch[1]);
        if (total) result.glasgow.total = total;
    } else {
        const ocularMatch = fullText.match(/\bocular\s*[:]?\s*([\w]+)\b/i);
        if (ocularMatch) result.glasgow.ocular = toNumber(ocularMatch[1]);
        const verbalMatch = fullText.match(/\bverbal\s*[:]?\s*([\w]+)\b/i);
        if (verbalMatch) result.glasgow.verbal = toNumber(verbalMatch[1]);
        const motorMatch = fullText.match(/\bmotor\s*[:]?\s*([\w]+)\b/i);
        if (motorMatch) result.glasgow.motor = toNumber(motorMatch[1]);
        if (result.glasgow.ocular && result.glasgow.verbal && result.glasgow.motor) {
            result.glasgow.total = result.glasgow.ocular + result.glasgow.verbal + result.glasgow.motor;
        }
    }

    // Intervenciones
    const treatmentMap = {
        'oxigenoterapia': { nombre: 'oxigenoterapia', sinónimos: ['oxígeno', 'oxigeno', 'o2'] },
        'vía intravenosa': { nombre: 'vía intravenosa', sinónimos: ['iv', 'catéter', 'suero'] },
        'intubación': { nombre: 'intubación', sinónimos: ['intubar'] },
        'ventilación': { nombre: 'ventilación', sinónimos: ['ventilar'] },
        'desfibrilación': { nombre: 'desfibrilación', sinónimos: ['desfibrilar', 'choque'] },
        'masaje cardiaco': { nombre: 'masaje cardiaco', sinónimos: ['rccp', 'compresiones'] },
        'vendaje': { nombre: 'vendaje', sinónimos: ['vendar'] },
        'inmovilización': { nombre: 'inmovilización', sinónimos: ['inmovilizar', 'férula'] },
        'medicación': { nombre: 'medicación', sinónimos: ['medicar', 'analgesia', 'anestesia'] }
    };

    const found = [];
    const lowerFull = fullText.toLowerCase();
    for (const [key, data] of Object.entries(treatmentMap)) {
        for (const synonym of data.sinónimos) {
            if (lowerFull.includes(synonym)) {
                let descripcion = '';
                const descRegex = new RegExp(`${synonym}[^.]*?(\\([^)]+\\)|(?:a|de|con|por)\\s+[^.,]+)`, 'i');
                const descMatch = fullText.match(descRegex);
                if (descMatch) descripcion = descMatch[1] || '';
                found.push({
                    tipo_intervencion: data.nombre,
                    descripcion: descripcion.trim(),
                    hora_intervencion: '' // se asigna después
                });
                break;
            }
        }
    }

    // Eliminar duplicados
    const seen = new Set();
    const unique = [];
    for (const iv of found) {
        if (!seen.has(iv.tipo_intervencion)) {
            seen.add(iv.tipo_intervencion);
            unique.push(iv);
        }
    }
    result.intervenciones = unique;

    // Hora actual para intervenciones
    const ahora = new Date();
    const horas = String(ahora.getHours()).padStart(2, '0');
    const minutos = String(ahora.getMinutes()).padStart(2, '0');
    const horaActual = `${horas}:${minutos}`;
    for (const iv of result.intervenciones) {
        iv.hora_intervencion = horaActual;
    }

    // Demográficos
    const nombreMatch = fullText.match(/paciente\s+([A-Za-záéíóúñ\s]+?)(?=\s+\d+\s*años|\s+sexo|\s+motivo|,|\.|$)/i);
    if (nombreMatch) result.paciente.nombre = nombreMatch[1].trim();
    const edadMatch = fullText.match(/\b(\d{1,3})\s*(años|año|edad)\b/i);
    if (edadMatch) result.paciente.edad = parseInt(edadMatch[1], 10);
    if (/\b(masculino|hombre|varón)\b/i.test(fullText)) result.paciente.sexo = 'M';
    else if (/\b(femenino|mujer)\b/i.test(fullText)) result.paciente.sexo = 'F';

    // Limpiar motivo y lesión (cortar en signos vitales o glasgow)
    const signosPattern = /\b(?:signos\s*vitales|frecuencia\s*card[ií]aca|fc|frecuencia\s*respiratoria|fr|presi[oó]n\s*arterial|ta|saturaci[oó]n|spo2|temperatura)\b/i;
    const glasgowPattern = /\b(?:glasgow|gcs|escala\s+de\s+glasgow|ocular|verbal|motor)\b/i;
    
    const motivoCut = result.motivo_urgencia.search(signosPattern);
    if (motivoCut !== -1) {
        result.motivo_urgencia = result.motivo_urgencia.substring(0, motivoCut).trim();
    }
    const motivoCutGlasgow = result.motivo_urgencia.search(glasgowPattern);
    if (motivoCutGlasgow !== -1) {
        result.motivo_urgencia = result.motivo_urgencia.substring(0, motivoCutGlasgow).trim();
    }

    const lesionCut = result.descripcion_lesion.search(signosPattern);
    if (lesionCut !== -1) {
        result.descripcion_lesion = result.descripcion_lesion.substring(0, lesionCut).trim();
    }
    const lesionCutGlasgow = result.descripcion_lesion.search(glasgowPattern);
    if (lesionCutGlasgow !== -1) {
        result.descripcion_lesion = result.descripcion_lesion.substring(0, lesionCutGlasgow).trim();
    }

    return result;
}