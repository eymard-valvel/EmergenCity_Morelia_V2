// backend/services/medicalParser.js
/**
 * Parser médico optimizado para lenguaje paramédico mexicano
 * Versión definitiva con vocabulario ampliado y delimitación inteligente
 */

function parseMedicalText(rawText) {
    // Limpiar texto
    const text = rawText.replace(/\s+/g, ' ').trim();
    
    // Estructura de resultado
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

    // ================================================================
    // 1. DIVIDIR EN ORACIONES (para análisis contextual)
    // ================================================================
    const sentences = text.match(/[^.]+[.]?/g) || [text];
    
    // ================================================================
    // 2. DICCIONARIOS DE SINÓNIMOS Y PALABRAS CLAVE
    // ================================================================
    const keywords = {
        motivo: [
            'motivo', 'consulta', 'urgencia', 'por', 'presenta', 'refiere', 
            'manifiesta', 'comenta', 'dolor', 'fiebre', 'trauma', 'accidente',
            'caída', 'náuseas', 'vómito', 'hemorragia', 'dificultad respiratoria'
        ],
        lesion: [
            'lesión', 'trauma', 'herida', 'fractura', 'quemadura', 'golpe',
            'contusión', 'torácico', 'craneal', 'abdominal', 'policontundido',
            'tce', 'craneoencefálico'
        ],
        signos: [
            'signos vitales', 'frecuencia cardíaca', 'fc', 'pulso',
            'frecuencia respiratoria', 'fr', 'respiración',
            'presión arterial', 'tensión arterial', 'ta', 'presión', 'tensión',
            'saturación', 'spo2', 'o2 sat',
            'temperatura', 'temp'
        ],
        glasgow: [
            'glasgow', 'gcs', 'escala de glasgow',
            'ocular', 'ojos', 'apertura ocular',
            'verbal', 'respuesta verbal',
            'motor', 'respuesta motora'
        ],
        intervenciones: [
            'oxígeno', 'oxigenoterapia', 'o2', 'mascarilla',
            'vía intravenosa', 'iv', 'catéter', 'suero',
            'vendaje', 'inmovilización', 'férula',
            'medicación', 'analgesia', 'anestesia',
            'rcp', 'masaje cardíaco', 'desfibrilación',
            'intubación', 'ventilación'
        ]
    };

    // ================================================================
    // 3. CLASIFICAR CADA ORACIÓN POR CONTEXTO
    // ================================================================
    let motivoText = '';
    let lesionText = '';
    let signosText = '';
    let glasgowText = '';
    let intervencionesText = '';

    for (const sentence of sentences) {
        const lower = sentence.toLowerCase();
        
        // Detectar si la oración contiene palabras clave de cada sección
        const hasMotivo = keywords.motivo.some(kw => lower.includes(kw));
        const hasLesion = keywords.lesion.some(kw => lower.includes(kw));
        const hasSignos = keywords.signos.some(kw => lower.includes(kw));
        const hasGlasgow = keywords.glasgow.some(kw => lower.includes(kw));
        const hasIntervencion = keywords.intervenciones.some(kw => lower.includes(kw));

        // Asignar a la sección correspondiente (prioridad: más específica primero)
        if (hasGlasgow) {
            glasgowText += sentence + ' ';
        } else if (hasSignos) {
            signosText += sentence + ' ';
        } else if (hasIntervencion && !hasMotivo && !hasLesion) {
            intervencionesText += sentence + ' ';
        } else if (hasLesion) {
            lesionText += sentence + ' ';
        } else if (hasMotivo) {
            motivoText += sentence + ' ';
        } else {
            // Si no tiene palabras clave, asignar a hallazgos generales
            // pero también podría ser parte de motivo o lesión si está cerca
            // Por ahora lo dejamos como hallazgos (ya está en result.hallazgos_escena)
        }
    }

    // ================================================================
    // 4. EXTRAER DATOS DE CADA SECCIÓN
    // ================================================================

    // 4.1 Motivo de urgencia
    if (motivoText) {
        // Limpiar frases introductorias
        let cleaned = motivoText
            .replace(/^motivo\s+(?:de\s+)?(?:urgencia|consulta)\s*[:]?\s*/i, '')
            .replace(/^por\s+(?:presentar|tener|con)\s*/i, '')
            .trim();
        result.motivo_urgencia = cleaned;
    }

    // 4.2 Descripción de lesión
    if (lesionText) {
        let cleaned = lesionText
            .replace(/^lesión\s+(?:de|en|por)\s*/i, '')
            .replace(/^trauma\s+(?:de|en|por)\s*/i, '')
            .replace(/^herida\s+(?:de|en|por)\s*/i, '')
            .trim();
        result.descripcion_lesion = cleaned;
    }

    // ================================================================
    // 5. SIGNOS VITALES (regex mejoradas)
    // ================================================================
    const fullText = text;
    
    // FC: frecuencia cardíaca, FC, pulso
    const fcMatch = fullText.match(/\b(?:fc|frecuencia\s*card[ií]aca|pulso)\s*[:]?\s*(\d{2,3})\b/i);
    if (fcMatch) result.signos_vitales.frecuencia_cardiaca = fcMatch[1];

    // FR: frecuencia respiratoria, FR, respiración
    const frMatch = fullText.match(/\b(?:fr|frecuencia\s*respiratoria|respiración)\s*[:]?\s*(\d{2,3})\b/i);
    if (frMatch) result.signos_vitales.frecuencia_respiratoria = frMatch[1];

    // TA: presión arterial, tensión arterial, TA, presión, tensión
    // Ahora acepta "presión 130/85" sin "arterial"
    const taMatch = fullText.match(/\b(?:ta|tensi[oó]n\s*(?:arterial)?|presi[oó]n\s*(?:arterial)?)\s*[:]?\s*(\d{2,3})\s*[\/\-\s]+(?:sobre\s*)?(\d{2,3})\b/i);
    if (taMatch) {
        result.signos_vitales.tension_arterial = `${taMatch[1]}/${taMatch[2]}`;
    }

    // SpO2: saturación, SpO2, O2 sat
    const spo2Match = fullText.match(/\b(?:spo2|saturaci[oó]n|o2\s*sat)\s*[:]?\s*(\d{2,3})\b/i);
    if (spo2Match) result.signos_vitales.saturacion_oxigeno = spo2Match[1];

    // Temperatura: temperatura, temp
    const tempMatch = fullText.match(/\b(?:temperatura|temp)\s*[:]?\s*(\d{2,3}\.?\d*)\b/i);
    if (tempMatch) result.signos_vitales.temperatura = tempMatch[1];

    // ================================================================
    // 6. GLASGOW (con soporte para números escritos)
    // ================================================================
    const numberMap = {
        'uno': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5,
        'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10
    };
    const toNumber = (str) => {
        if (!str) return null;
        const lower = str.toLowerCase().trim();
        if (numberMap[lower]) return numberMap[lower];
        const num = parseInt(str, 10);
        return isNaN(num) ? null : num;
    };

    // Buscar Glasgow total
    const gcsMatch = fullText.match(/\b(?:glasgow|gcs)\s*[:]?\s*([\w]+)\b/i);
    if (gcsMatch) {
        const total = toNumber(gcsMatch[1]);
        if (total) result.glasgow.total = total;
    } else {
        // Buscar componentes individuales
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

    // ================================================================
    // 7. INTERVENCIONES (con descripción y normalización)
    // ================================================================
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

    const foundInterventions = [];
    const lowerFull = fullText.toLowerCase();

    for (const [key, data] of Object.entries(treatmentMap)) {
        for (const synonym of data.sinónimos) {
            if (lowerFull.includes(synonym)) {
                // Buscar descripción después de la intervención
                let descripcion = '';
                // Buscar patrones como "a 3 litros por minuto", "cada 8 horas", etc.
                const descRegex = new RegExp(`${synonym}[^.]*?(\\([^)]+\\)|(?:a|de|con|por)\\s+[^.,]+)`, 'i');
                const descMatch = fullText.match(descRegex);
                if (descMatch) {
                    descripcion = descMatch[1] || '';
                }
                foundInterventions.push({
                    tipo_intervencion: data.nombre,
                    descripcion: descripcion.trim(),
                    hora_intervencion: '' // Se asignará después
                });
                break; // Evitar duplicados del mismo tipo
            }
        }
    }

    // Eliminar duplicados por nombre
    const uniqueInterventions = [];
    const seen = new Set();
    for (const iv of foundInterventions) {
        if (!seen.has(iv.tipo_intervencion)) {
            seen.add(iv.tipo_intervencion);
            uniqueInterventions.push(iv);
        }
    }
    result.intervenciones = uniqueInterventions;

    // ================================================================
    // 8. DATOS DEMOGRÁFICOS (nombre, edad, sexo)
    // ================================================================
    // Nombre: después de "paciente" hasta edad, sexo, motivo, o coma
    const nombreMatch = fullText.match(/paciente\s+([A-Za-záéíóúñ\s]+?)(?=\s+\d+\s*años|\s+sexo|\s+motivo|,|\.|$)/i);
    if (nombreMatch) {
        result.paciente.nombre = nombreMatch[1].trim();
    }

    // Edad
    const edadMatch = fullText.match(/\b(\d{1,3})\s*(años|año|edad)\b/i);
    if (edadMatch) result.paciente.edad = parseInt(edadMatch[1], 10);

    // Sexo
    if (/\b(masculino|hombre|varón)\b/i.test(fullText)) result.paciente.sexo = 'M';
    else if (/\b(femenino|mujer)\b/i.test(fullText)) result.paciente.sexo = 'F';

    // ================================================================
    // 9. ASIGNAR HORA A LAS INTERVENCIONES (hora actual)
    // ================================================================
    const ahora = new Date();
    const horas = String(ahora.getHours()).padStart(2, '0');
    const minutos = String(ahora.getMinutes()).padStart(2, '0');
    const horaActual = `${horas}:${minutos}`;
    
    for (const iv of result.intervenciones) {
        iv.hora_intervencion = horaActual;
    }

    // ================================================================
    // 10. LIMPIAR MOTIVO Y LESIÓN (eliminar signos vitales y glasgow)
    // ================================================================
    // Si motivo contiene signos vitales o glasgow, cortar
    const signosPattern = /\b(?:signos\s*vitales|frecuencia\s*card[ií]aca|fc|frecuencia\s*respiratoria|fr|presi[oó]n\s*arterial|ta|saturaci[oó]n|spo2|temperatura)\b/i;
    const glasgowPattern = /\b(?:glasgow|gcs|escala\s+de\s+glasgow|ocular|verbal|motor)\b/i;
    
    // Cortar motivo en el primer signos vitales o glasgow
    const motivoCut = result.motivo_urgencia.search(signosPattern);
    if (motivoCut !== -1) {
        result.motivo_urgencia = result.motivo_urgencia.substring(0, motivoCut).trim();
    }
    const motivoCutGlasgow = result.motivo_urgencia.search(glasgowPattern);
    if (motivoCutGlasgow !== -1) {
        result.motivo_urgencia = result.motivo_urgencia.substring(0, motivoCutGlasgow).trim();
    }

    // Cortar lesión en el primer signos vitales o glasgow
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

module.exports = { parseMedicalText };