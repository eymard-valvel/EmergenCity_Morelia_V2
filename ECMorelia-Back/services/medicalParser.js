// backend/services/medicalParser.js
/**
 * Parser médico basado en reglas y expresiones regulares
 * No requiere modelos de IA, funciona con 512 MB de RAM
 */

/**
 * Función principal que extrae todos los datos del texto
 */
function parseMedicalText(text) {
    // Limpiar texto: eliminar saltos de línea y espacios extra
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

    // ============================================================
    // 1. EXTRAER POR SECCIONES USANDO FRASES CLAVE
    // ============================================================
    
    // Buscar sección "motivo de urgencia"
    const motivoRegex = /(?:motivo\s+(?:de\s+)?(?:urgencia|consulta|ingreso)|por\s+(?:presentar|tener|con))\s*[:]?\s*([^.]+)/i;
    const motivoMatch = cleanText.match(motivoRegex);
    if (motivoMatch) {
        result.motivo_urgencia = motivoMatch[1].trim();
    } else {
        // Fallback: buscar "dolor", "fiebre", etc.
        const fallbackMatch = cleanText.match(/\b(dolor|fiebre|trauma|accidente|caída|náuseas|vómito|hemorragia|dificultad respiratoria)\s+[^.]+\./i);
        if (fallbackMatch) {
            result.motivo_urgencia = fallbackMatch[0].trim();
        }
    }

    // Buscar sección "lesión"
    const lesionRegex = /(?:lesión|trauma|herida|fractura|quemadura|golpe|contusión)\s+(?:de|en|por)\s+([^.]+)/i;
    const lesionMatch = cleanText.match(lesionRegex);
    if (lesionMatch) {
        result.descripcion_lesion = lesionMatch[0].trim();
    } else {
        // Buscar frases con palabras clave
        const keywords = ['trauma', 'herida', 'fractura', 'lesión', 'torácico', 'craneal', 'abdominal'];
        for (const kw of keywords) {
            const match = cleanText.match(new RegExp(`[^.]*${kw}[^.]*\\.`, 'i'));
            if (match) {
                result.descripcion_lesion = match[0].trim();
                break;
            }
        }
    }

    // ============================================================
    // 2. SIGNOS VITALES (regex mejoradas)
    // ============================================================
    
    // FC: frecuencia cardíaca, FC, pulso
    const fcMatch = cleanText.match(/\b(?:fc|frecuencia\s*card[ií]aca|pulso)\s*[:]?\s*(\d{2,3})\b/i);
    if (fcMatch) result.signos_vitales.frecuencia_cardiaca = fcMatch[1];

    // FR: frecuencia respiratoria, FR, respiración
    const frMatch = cleanText.match(/\b(?:fr|frecuencia\s*respiratoria|respiración)\s*[:]?\s*(\d{2,3})\b/i);
    if (frMatch) result.signos_vitales.frecuencia_respiratoria = frMatch[1];

    // TA: presión arterial, TA, tensión
    const taMatch = cleanText.match(/\b(?:ta|tensi[oó]n\s*arterial|presi[oó]n\s*arterial)\s*[:]?\s*(\d{2,3})\s*[\/\-\s]+(?:sobre\s*)?(\d{2,3})\b/i);
    if (taMatch) {
        result.signos_vitales.tension_arterial = `${taMatch[1]}/${taMatch[2]}`;
    }

    // SpO2: saturación, SpO2, O2 sat
    const spo2Match = cleanText.match(/\b(?:spo2|saturaci[oó]n|o2\s*sat)\s*[:]?\s*(\d{2,3})\b/i);
    if (spo2Match) result.signos_vitales.saturacion_oxigeno = spo2Match[1];

    // Temperatura: temp, temperatura
    const tempMatch = cleanText.match(/\b(?:temperatura|temp)\s*[:]?\s*(\d{2,3}\.?\d*)\b/i);
    if (tempMatch) result.signos_vitales.temperatura = tempMatch[1];

    // ============================================================
    // 3. ESCALA DE GLASGOW
    // ============================================================
    
    // Buscar Glasgow total
    const gcsMatch = cleanText.match(/\b(?:glasgow|gcs)\s*[:]?\s*(\d{1,2})\b/i);
    if (gcsMatch) {
        result.glasgow.total = parseInt(gcsMatch[1], 10);
    } else {
        // Buscar componentes individuales
        const ocular = cleanText.match(/\bocular\s*[:]?\s*(\d)\b/i);
        if (ocular) result.glasgow.ocular = parseInt(ocular[1], 10);
        const verbal = cleanText.match(/\bverbal\s*[:]?\s*(\d)\b/i);
        if (verbal) result.glasgow.verbal = parseInt(verbal[1], 10);
        const motor = cleanText.match(/\bmotor\s*[:]?\s*(\d)\b/i);
        if (motor) result.glasgow.motor = parseInt(motor[1], 10);
        if (result.glasgow.ocular && result.glasgow.verbal && result.glasgow.motor) {
            result.glasgow.total = result.glasgow.ocular + result.glasgow.verbal + result.glasgow.motor;
        }
    }

    // ============================================================
    // 4. INTERVENCIONES (buscar tratamientos y procedimientos)
    // ============================================================
    
    const treatmentKeywords = [
        'oxigenoterapia', 'oxígeno', 'intubación', 'ventilación', 'desfibrilación',
        'masaje cardiaco', 'rccp', 'vendaje', 'inmovilización', 'férula', 'catéter',
        'sonda', 'drenaje', 'aspiración', 'medicación', 'suero', 'vía intravenosa',
        'iv', 'analgesia', 'anestesia', 'cura', 'limpieza', 'sutura', 'inyección'
    ];
    const found = treatmentKeywords.filter(kw => cleanText.toLowerCase().includes(kw));
    // Eliminar duplicados y ordenar
    const unique = [...new Set(found)];
    if (unique.length > 0) {
        result.intervenciones = unique.map(t => ({
            tipo_intervencion: t,
            descripcion: '',
            hora_intervencion: ''
        }));
    }

    // ============================================================
    // 5. DATOS DEMOGRÁFICOS
    // ============================================================
    
    // Nombre: después de "paciente" o "nombre"
    const nombreMatch = cleanText.match(/(?:paciente|nombre)\s+(?:de\s+)?([A-Za-záéíóúñ\s]+?)(?:\s+(?:de|con|que|y|,|\.|$))/i);
    if (nombreMatch) result.paciente.nombre = nombreMatch[1].trim();

    // Edad
    const edadMatch = cleanText.match(/\b(\d{1,3})\s*(años|año|edad)\b/i);
    if (edadMatch) result.paciente.edad = parseInt(edadMatch[1], 10);

    // Sexo
    if (/\b(masculino|hombre|varón)\b/i.test(cleanText)) result.paciente.sexo = 'M';
    else if (/\b(femenino|mujer)\b/i.test(cleanText)) result.paciente.sexo = 'F';

    return result;
}

module.exports = { parseMedicalText };