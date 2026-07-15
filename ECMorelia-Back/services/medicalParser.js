// backend/services/medicalParser.js
// Versión definitiva - Extracción por secciones con detección contextual

function parseMedicalText(rawText) {
    const text = rawText.replace(/\s+/g, ' ').trim();

    // ================================================================
    // 1. DIVIDIR EN ORACIONES (por puntos, signos de puntuación)
    // ================================================================
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    // ================================================================
    // 2. CLASIFICAR ORACIONES POR SECCIÓN
    // ================================================================
    const sections = {
        motivo: [],
        lesion: [],
        signos: [],
        glasgow: [],
        intervenciones: [],
        demograficos: [],
        otros: []
    };

    // Palabras clave para cada sección
    const keywords = {
        motivo: [
            'motivo', 'consulta', 'urgencia', 'por', 'presenta', 'refiere',
            'manifiesta', 'dolor', 'fiebre', 'trauma', 'accidente', 'caída',
            'náuseas', 'vómito', 'hemorragia', 'disnea', 'dificultad respiratoria',
            'policontundido', 'politraumatizado'
        ],
        lesion: [
            'lesión', 'trauma', 'herida', 'fractura', 'quemadura', 'golpe',
            'contusión', 'torácico', 'craneal', 'abdominal', 'pélvico',
            'tce', 'craneoencefálico', 'policontundido'
        ],
        signos: [
            'signos vitales', 'frecuencia cardíaca', 'fc', 'pulso',
            'frecuencia respiratoria', 'fr', 'respiración',
            'presión arterial', 'tensión arterial', 'ta', 'presión', 'tensión',
            'saturación', 'spo2', 'o2 sat', 'temperatura', 'temp'
        ],
        glasgow: [
            'glasgow', 'gcs', 'escala de glasgow',
            'ocular', 'ojos', 'apertura ocular',
            'verbal', 'respuesta verbal',
            'motor', 'respuesta motora'
        ],
        intervenciones: [
            'oxigenoterapia', 'oxígeno', 'o2', 'mascarilla', 'cánula nasal',
            'vía intravenosa', 'iv', 'catéter', 'suero', 'periférica',
            'vendaje', 'inmovilización', 'férula', 'collarín',
            'medicación', 'analgesia', 'anestesia', 'antibiótico',
            'rcp', 'masaje cardíaco', 'desfibrilación', 'choque',
            'intubación', 'ventilación', 'bolsa-válvula', 'colocar', 'puso'
        ],
        demograficos: [
            'paciente', 'nombre', 'años', 'edad', 'sexo', 'masculino', 'femenino', 'hombre', 'mujer'
        ]
    };

    // Función para clasificar una oración
    function classifySentence(sentence) {
        const lower = sentence.toLowerCase();
        const assigned = new Set();

        // Verificar cada sección
        for (const [section, words] of Object.entries(keywords)) {
            for (const word of words) {
                if (lower.includes(word)) {
                    assigned.add(section);
                    break;
                }
            }
        }

        // Si tiene múltiples clasificaciones, priorizar
        if (assigned.size === 0) {
            return 'otros';
        } else if (assigned.has('glasgow')) {
            return 'glasgow';
        } else if (assigned.has('signos')) {
            return 'signos';
        } else if (assigned.has('intervenciones')) {
            return 'intervenciones';
        } else if (assigned.has('lesion')) {
            return 'lesion';
        } else if (assigned.has('motivo')) {
            return 'motivo';
        } else if (assigned.has('demograficos')) {
            return 'demograficos';
        } else {
            return 'otros';
        }
    }

    // Clasificar cada oración
    for (const sentence of sentences) {
        const section = classifySentence(sentence);
        if (sections[section]) {
            sections[section].push(sentence.trim());
        } else {
            sections.otros.push(sentence.trim());
        }
    }

    // ================================================================
    // 3. CONSTRUIR CAMPOS
    // ================================================================
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

    // Motivo de urgencia
    if (sections.motivo.length > 0) {
        let motivoText = sections.motivo.join(' ');
        // Limpiar prefijos
        motivoText = motivoText
            .replace(/^(motivo\s+(?:de\s+)?(?:urgencia|consulta)\s*[:]?\s*)/i, '')
            .replace(/^(por\s+(?:presentar|tener|con)\s*)/i, '')
            .trim();
        // Si el motivo tiene "lesión" o "signos" dentro, cortar ahí
        const stopWords = ['lesión', 'trauma', 'signos vitales', 'glasgow'];
        for (const sw of stopWords) {
            const idx = motivoText.toLowerCase().search(new RegExp(`\\b${sw}\\b`));
            if (idx !== -1) {
                motivoText = motivoText.substring(0, idx).trim();
                break;
            }
        }
        result.motivo_urgencia = motivoText;
    }

    // Descripción de lesión
    if (sections.lesion.length > 0) {
        let lesionText = sections.lesion.join(' ');
        lesionText = lesionText
            .replace(/^(lesión|trauma|herida|fractura|quemadura|golpe|contusión)\s+(?:de|en|por)\s*/i, '')
            .trim();
        // Cortar en signos o glasgow
        const stopWords = ['signos vitales', 'glasgow'];
        for (const sw of stopWords) {
            const idx = lesionText.toLowerCase().search(new RegExp(`\\b${sw}\\b`));
            if (idx !== -1) {
                lesionText = lesionText.substring(0, idx).trim();
                break;
            }
        }
        result.descripcion_lesion = lesionText;
    }

    // ================================================================
    // 4. SIGNOS VITALES (dentro de su sección o en todo el texto)
    // ================================================================
    const signosText = sections.signos.join(' ') || text;
    
    const fcMatch = signosText.match(/\b(?:fc|frecuencia\s*card[ií]aca|pulso)\s*[:]?\s*(\d{2,3})\b/i);
    if (fcMatch) result.signos_vitales.frecuencia_cardiaca = fcMatch[1];
    
    const frMatch = signosText.match(/\b(?:fr|frecuencia\s*respiratoria|respiración)\s*[:]?\s*(\d{2,3})\b/i);
    if (frMatch) result.signos_vitales.frecuencia_respiratoria = frMatch[1];
    
    const taMatch = signosText.match(/\b(?:ta|tensi[oó]n\s*(?:arterial)?|presi[oó]n\s*(?:arterial)?)\s*[:]?\s*(\d{2,3})\s*[\/\-\s]+(?:sobre\s*)?(\d{2,3})\b/i);
    if (taMatch) {
        result.signos_vitales.tension_arterial = `${taMatch[1]}/${taMatch[2]}`;
    }
    
    const spo2Match = signosText.match(/\b(?:spo2|saturaci[oó]n|o2\s*sat)\s*[:]?\s*(\d{2,3})\b/i);
    if (spo2Match) result.signos_vitales.saturacion_oxigeno = spo2Match[1];
    
    const tempMatch = signosText.match(/\b(?:temperatura|temp)\s*[:]?\s*(\d{2,3}\.?\d*)\b/i);
    if (tempMatch) result.signos_vitales.temperatura = tempMatch[1];

    // ================================================================
    // 5. GLASGOW (dentro de su sección)
    // ================================================================
    const glasgowText = sections.glasgow.join(' ') || text;
    const numberMap = {
        'uno': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5,
        'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10,
        'cero': 0
    };
    const toNumber = (str) => {
        if (!str) return null;
        const lower = str.toLowerCase().trim();
        if (numberMap[lower]) return numberMap[lower];
        const num = parseInt(str, 10);
        return isNaN(num) ? null : num;
    };

    const gcsMatch = glasgowText.match(/\b(?:glasgow|gcs|escala\s+de\s+glasgow)\s*[:]?\s*([\w]+)\b/i);
    if (gcsMatch) {
        const total = toNumber(gcsMatch[1]);
        if (total) result.glasgow.total = total;
    } else {
        const ocularMatch = glasgowText.match(/\b(?:ocular|ojos|apertura\s+ocular)\s*[:]?\s*([\w]+)\b/i);
        if (ocularMatch) result.glasgow.ocular = toNumber(ocularMatch[1]);
        const verbalMatch = glasgowText.match(/\b(?:verbal|respuesta\s+verbal)\s*[:]?\s*([\w]+)\b/i);
        if (verbalMatch) result.glasgow.verbal = toNumber(verbalMatch[1]);
        const motorMatch = glasgowText.match(/\b(?:motor|respuesta\s+motora)\s*[:]?\s*([\w]+)\b/i);
        if (motorMatch) result.glasgow.motor = toNumber(motorMatch[1]);
        
        if (result.glasgow.ocular && result.glasgow.verbal && result.glasgow.motor) {
            result.glasgow.total = result.glasgow.ocular + result.glasgow.verbal + result.glasgow.motor;
        }
    }

    // ================================================================
    // 6. INTERVENCIONES (con descripciones contextuales)
    // ================================================================
    const interventionText = sections.intervenciones.join(' ') || text;
    const treatmentMap = {
        'oxigenoterapia': { nombre: 'oxigenoterapia', sinónimos: ['oxigenoterapia', 'oxígeno', 'oxigeno', 'o2'] },
        'vía intravenosa': { nombre: 'vía intravenosa', sinónimos: ['vía intravenosa', 'iv', 'catéter', 'suero'] },
        'intubación': { nombre: 'intubación', sinónimos: ['intubación', 'intubar'] },
        'ventilación': { nombre: 'ventilación', sinónimos: ['ventilación', 'ventilar'] },
        'desfibrilación': { nombre: 'desfibrilación', sinónimos: ['desfibrilación', 'desfibrilar', 'choque'] },
        'masaje cardiaco': { nombre: 'masaje cardiaco', sinónimos: ['masaje cardiaco', 'rcp', 'compresiones'] },
        'vendaje': { nombre: 'vendaje', sinónimos: ['vendaje', 'vendar'] },
        'inmovilización': { nombre: 'inmovilización', sinónimos: ['inmovilización', 'inmovilizar', 'férula'] },
        'medicación': { nombre: 'medicación', sinónimos: ['medicación', 'medicar', 'analgesia', 'anestesia'] }
    };

    const found = [];
    const lowerIntervention = interventionText.toLowerCase();

    for (const [key, data] of Object.entries(treatmentMap)) {
        for (const synonym of data.sinónimos) {
            if (lowerIntervention.includes(synonym)) {
                // Buscar descripción en la misma oración o la siguiente
                let descripcion = '';
                const idx = lowerIntervention.indexOf(synonym);
                const start = Math.max(0, idx - 50);
                const end = Math.min(lowerIntervention.length, idx + 100);
                const context = interventionText.substring(start, end);
                
                // Buscar detalles como "a 3 L", "por minuto", "con suero", etc.
                const detalleRegex = /((?:a|de|con|por)\s+[^.,;:]+?)(?:[,;:]|\.|$)/i;
                const detalleMatch = context.match(detalleRegex);
                if (detalleMatch && detalleMatch[1].length < 50) {
                    descripcion = detalleMatch[1].trim();
                }

                found.push({
                    tipo_intervencion: data.nombre,
                    descripcion: descripcion,
                    hora_intervencion: ''
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

    // ================================================================
    // 7. DATOS DEMOGRÁFICOS
    // ================================================================
    const demograficosText = sections.demograficos.join(' ') || text;
    
    const nombreMatch = demograficosText.match(/paciente\s+([A-Za-záéíóúñ\s]+?)(?=\s+\d+\s*años|\s+sexo|\s+motivo|,|\.|$)/i);
    if (nombreMatch) result.paciente.nombre = nombreMatch[1].trim();
    
    const edadMatch = demograficosText.match(/\b(\d{1,3})\s*(años|año|edad)\b/i);
    if (edadMatch) result.paciente.edad = parseInt(edadMatch[1], 10);
    
    if (/\b(masculino|hombre|varón)\b/i.test(demograficosText)) result.paciente.sexo = 'M';
    else if (/\b(femenino|mujer)\b/i.test(demograficosText)) result.paciente.sexo = 'F';

    // ================================================================
    // 8. ASIGNAR HORA A INTERVENCIONES
    // ================================================================
    const ahora = new Date();
    const horas = String(ahora.getHours()).padStart(2, '0');
    const minutos = String(ahora.getMinutes()).padStart(2, '0');
    const horaActual = `${horas}:${minutos}`;
    for (const iv of result.intervenciones) {
        iv.hora_intervencion = horaActual;
    }

    return result;
}

module.exports = { parseMedicalText };