// src/pln/localParser.js
export function parseTextLocal(text) {
    const cleanText = text.replace(/\s+/g, ' ').trim();

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
        hallazgos_escena: cleanText,
        intervenciones: []
    };

    // Nombre
    const nombreMatch = cleanText.match(/paciente\s+([A-Za-záéíóúñ\s]+?)(?=\s+\d+\s*años|\s+sexo|\s+motivo|,|\.)/i);
    if (nombreMatch) result.paciente.nombre = nombreMatch[1].trim();

    // Edad
    const edadMatch = cleanText.match(/\b(\d{1,3})\s*(años|año|edad)\b/i);
    if (edadMatch) result.paciente.edad = parseInt(edadMatch[1], 10);

    // Sexo
    if (/\b(masculino|hombre|varón)\b/i.test(cleanText)) result.paciente.sexo = 'M';
    else if (/\b(femenino|mujer)\b/i.test(cleanText)) result.paciente.sexo = 'F';

    // Motivo
    const motivoStart = cleanText.search(/\b(?:motivo\s+(?:de\s+)?(?:urgencia|consulta)|por\s+(?:presentar|tener|con))\s*[:]?\s*/i);
    if (motivoStart !== -1) {
        const fromMotivo = cleanText.substring(motivoStart);
        const endMatch = fromMotivo.match(/\.|(?=\s+(?:lesión|trauma|herida|signos\s*vitales|glasgow|gcs))/i);
        const motivo = endMatch ? fromMotivo.substring(0, endMatch.index) : fromMotivo;
        result.motivo_urgencia = motivo.replace(/^motivo\s+(?:de\s+)?(?:urgencia|consulta)\s*[:]?\s*/i, '').trim();
    } else {
        const fallbackMatch = cleanText.match(/\b(dolor|fiebre|trauma|accidente|caída|náuseas|vómito|hemorragia|dificultad respiratoria)\s+[^.]+/i);
        if (fallbackMatch) result.motivo_urgencia = fallbackMatch[0].trim();
    }

    // Lesión
    const lesionStart = cleanText.search(/\b(?:lesión|trauma|herida|fractura|quemadura|golpe|contusión)\s+(?:de|en|por)\s*/i);
    if (lesionStart !== -1) {
        const fromLesion = cleanText.substring(lesionStart);
        const endMatch = fromLesion.match(/\.|(?=\s+(?:signos\s*vitales|glasgow|gcs|escala))/i);
        const lesion = endMatch ? fromLesion.substring(0, endMatch.index) : fromLesion;
        result.descripcion_lesion = lesion.trim();
    }

    // Signos vitales
    const fcMatch = cleanText.match(/\b(?:fc|frecuencia\s*card[ií]aca|pulso)\s*[:]?\s*(\d{2,3})\b/i);
    if (fcMatch) result.signos_vitales.frecuencia_cardiaca = fcMatch[1];
    const frMatch = cleanText.match(/\b(?:fr|frecuencia\s*respiratoria|respiración)\s*[:]?\s*(\d{2,3})\b/i);
    if (frMatch) result.signos_vitales.frecuencia_respiratoria = frMatch[1];
    const taMatch = cleanText.match(/\b(?:ta|tensi[oó]n\s*arterial|presi[oó]n\s*arterial)\s*[:]?\s*(\d{2,3})\s*[\/\-\s]+(?:sobre\s*)?(\d{2,3})\b/i);
    if (taMatch) result.signos_vitales.tension_arterial = `${taMatch[1]}/${taMatch[2]}`;
    const spo2Match = cleanText.match(/\b(?:spo2|saturaci[oó]n|o2\s*sat)\s*[:]?\s*(\d{2,3})\b/i);
    if (spo2Match) result.signos_vitales.saturacion_oxigeno = spo2Match[1];
    const tempMatch = cleanText.match(/\b(?:temperatura|temp)\s*[:]?\s*(\d{2,3}\.?\d*)\b/i);
    if (tempMatch) result.signos_vitales.temperatura = tempMatch[1];

    // Glasgow con números en letras
    const numberMap = { 'uno':1,'dos':2,'tres':3,'cuatro':4,'cinco':5,'seis':6,'siete':7,'ocho':8,'nueve':9,'diez':10 };
    const toNumber = (str) => {
        const lower = str.toLowerCase().trim();
        if (numberMap[lower]) return numberMap[lower];
        const num = parseInt(str, 10);
        return isNaN(num) ? null : num;
    };

    const gcsMatch = cleanText.match(/\b(?:glasgow|gcs)\s*[:]?\s*([\w]+)\b/i);
    if (gcsMatch) {
        const total = toNumber(gcsMatch[1]);
        if (total) result.glasgow.total = total;
    } else {
        const ocularMatch = cleanText.match(/\bocular\s*[:]?\s*([\w]+)\b/i);
        if (ocularMatch) result.glasgow.ocular = toNumber(ocularMatch[1]);
        const verbalMatch = cleanText.match(/\bverbal\s*[:]?\s*([\w]+)\b/i);
        if (verbalMatch) result.glasgow.verbal = toNumber(verbalMatch[1]);
        const motorMatch = cleanText.match(/\bmotor\s*[:]?\s*([\w]+)\b/i);
        if (motorMatch) result.glasgow.motor = toNumber(motorMatch[1]);
        if (result.glasgow.ocular && result.glasgow.verbal && result.glasgow.motor) {
            result.glasgow.total = result.glasgow.ocular + result.glasgow.verbal + result.glasgow.motor;
        }
    }

    // Intervenciones normalizadas
    const treatmentMap = {
        'oxigenoterapia': 'oxigenoterapia',
        'oxígeno': 'oxigenoterapia',
        'oxigeno': 'oxigenoterapia',
        'intubación': 'intubación',
        'ventilación': 'ventilación',
        'desfibrilación': 'desfibrilación',
        'masaje cardiaco': 'masaje cardiaco',
        'rccp': 'rccp',
        'vendaje': 'vendaje',
        'inmovilización': 'inmovilización',
        'férula': 'férula',
        'catéter': 'catéter',
        'sonda': 'sonda',
        'drenaje': 'drenaje',
        'aspiración': 'aspiración',
        'medicación': 'medicación',
        'suero': 'suero',
        'vía intravenosa': 'vía intravenosa',
        'iv': 'vía intravenosa',
        'analgesia': 'analgesia',
        'anestesia': 'anestesia',
        'cura': 'cura',
        'limpieza': 'limpieza',
        'sutura': 'sutura',
        'inyección': 'inyección'
    };

    const found = [];
    const lowerText = cleanText.toLowerCase();
    for (const [key, normalized] of Object.entries(treatmentMap)) {
        if (lowerText.includes(key)) {
            found.push(normalized);
        }
    }
    const unique = [...new Set(found)];
    if (unique.length > 0) {
        result.intervenciones = unique.map(t => ({
            tipo_intervencion: t,
            descripcion: '',
            hora_intervencion: ''
        }));
    }

    return result;
}