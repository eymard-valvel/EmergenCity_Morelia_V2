// backend/services/medicalParser.js
// VERSIÓN DEFINITIVA - Parser Ultra Robusto

function parseMedicalText(rawText) {
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

    // ================================================================
    // 1. DICCIONARIOS DE PALABRAS CLAVE (VOCABULARIO PARAMÉDICO MEXICANO)
    // ================================================================
    const sections = {
        motivo: [
            'motivo de urgencia', 'motivo de consulta', 'motivo', 
            'por', 'presenta', 'refiere', 'manifiesta', 'comenta',
            'dolor', 'fiebre', 'trauma', 'accidente', 'caída',
            'náuseas', 'vómito', 'hemorragia', 'disnea',
            'dificultad respiratoria', 'policontundido', 'politraumatizado',
            'quemadura', 'intoxicación', 'convulsión', 'desmayo'
        ],
        lesion: [
            'lesión', 'trauma', 'herida', 'fractura', 'quemadura',
            'golpe', 'contusión', 'torácico', 'craneal', 'abdominal',
            'pélvico', 'extremidades', 'tce', 'craneoencefálico',
            'policontundido', 'laceración', 'desgarro', 'esguince'
        ],
        signos: [
            'signos vitales', 'frecuencia cardíaca', 'fc', 'pulso',
            'frecuencia respiratoria', 'fr', 'respiración',
            'presión arterial', 'tensión arterial', 'ta', 'presión', 'tensión',
            'saturación', 'spo2', 'o2 sat', 'oxígeno',
            'temperatura', 'temp', 'fiebre'
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
            'intubación', 'ventilación', 'bolsa-válvula'
        ]
    };

    // ================================================================
    // 2. FUNCIÓN AUXILIAR: EXTRAER TEXTO ENTRE PALABRAS CLAVE
    // ================================================================
    function extractBetween(text, startWords, endWords) {
        let bestMatch = '';
        let bestStart = Infinity;
        let bestEnd = text.length;

        for (const sw of startWords) {
            const startIdx = text.toLowerCase().indexOf(sw.toLowerCase());
            if (startIdx === -1) continue;
            let endIdx = text.length;
            for (const ew of endWords) {
                const idx = text.toLowerCase().indexOf(ew.toLowerCase(), startIdx + sw.length);
                if (idx !== -1 && idx < endIdx) endIdx = idx;
            }
            // Si la palabra final es "signos", "glasgow", "se administró", cortamos ahí
            const cutWords = ['signos vitales', 'glasgow', 'gcs', 'se administró', 'se colocó', 'se puso'];
            for (const cw of cutWords) {
                const idx = text.toLowerCase().indexOf(cw.toLowerCase(), startIdx + sw.length);
                if (idx !== -1 && idx < endIdx) endIdx = idx;
            }
            const extracted = text.substring(startIdx, endIdx).trim();
            if (extracted.length > bestMatch.length) {
                bestMatch = extracted;
                bestStart = startIdx;
                bestEnd = endIdx;
            }
        }
        return bestMatch;
    }

    // ================================================================
    // 3. EXTRAER MOTIVO DE URGENCIA
    // ================================================================
    let motivoRaw = extractBetween(
        text,
        sections.motivo,
        ['lesión', 'trauma', 'signos vitales', 'glasgow', 'gcs', 'se administró', 'se colocó', 'se puso']
    );
    if (motivoRaw) {
        // Limpiar: eliminar la palabra clave inicial
        for (const kw of sections.motivo) {
            const regex = new RegExp(`^${kw}\\s*[:]?\\s*`, 'i');
            motivoRaw = motivoRaw.replace(regex, '');
        }
        result.motivo_urgencia = motivoRaw.trim();
    } else {
        // Fallback: buscar "dolor", "fiebre", etc.
        const fallbackMatch = text.match(/\b(dolor|fiebre|trauma|accidente|caída|náuseas|vómito|hemorragia|disnea)\s+[^.]+/i);
        if (fallbackMatch) {
            result.motivo_urgencia = fallbackMatch[0].trim();
        }
    }

    // ================================================================
    // 4. EXTRAER DESCRIPCIÓN DE LESIÓN
    // ================================================================
    let lesionRaw = extractBetween(
        text,
        sections.lesion,
        ['signos vitales', 'glasgow', 'gcs', 'se administró', 'se colocó', 'se puso']
    );
    if (lesionRaw) {
        for (const kw of sections.lesion) {
            const regex = new RegExp(`^${kw}\\s*[:]?\\s*`, 'i');
            lesionRaw = lesionRaw.replace(regex, '');
        }
        result.descripcion_lesion = lesionRaw.trim();
    }

    // ================================================================
    // 5. SIGNOS VITALES (regex mejoradas)
    // ================================================================
    const fullText = text;
    
    const fcMatch = fullText.match(/\b(?:fc|frecuencia\s*card[ií]aca|pulso|cardíaca)\s*[:]?\s*(\d{2,3})\b/i);
    if (fcMatch) result.signos_vitales.frecuencia_cardiaca = fcMatch[1];

    const frMatch = fullText.match(/\b(?:fr|frecuencia\s*respiratoria|respiración|respiratoria)\s*[:]?\s*(\d{2,3})\b/i);
    if (frMatch) result.signos_vitales.frecuencia_respiratoria = frMatch[1];

    const taMatch = fullText.match(/\b(?:ta|tensi[oó]n\s*(?:arterial)?|presi[oó]n\s*(?:arterial)?|presión|tensión)\s*[:]?\s*(\d{2,3})\s*[\/\-\s]+(?:sobre\s*)?(\d{2,3})\b/i);
    if (taMatch) {
        result.signos_vitales.tension_arterial = `${taMatch[1]}/${taMatch[2]}`;
    }

    const spo2Match = fullText.match(/\b(?:spo2|saturaci[oó]n|o2\s*sat)\s*[:]?\s*(\d{2,3})\b/i);
    if (spo2Match) result.signos_vitales.saturacion_oxigeno = spo2Match[1];

    const tempMatch = fullText.match(/\b(?:temperatura|temp)\s*[:]?\s*(\d{2,3}\.?\d*)\b/i);
    if (tempMatch) result.signos_vitales.temperatura = tempMatch[1];

    // ================================================================
    // 6. ESCALA DE GLASGOW (soporta números escritos)
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

    const gcsMatch = fullText.match(/\b(?:glasgow|gcs|escala\s+de\s+glasgow)\s*[:]?\s*([\w]+)\b/i);
    if (gcsMatch) {
        const total = toNumber(gcsMatch[1]);
        if (total) result.glasgow.total = total;
    } else {
        const ocularMatch = fullText.match(/\b(?:ocular|ojos|apertura\s+ocular)\s*[:]?\s*([\w]+)\b/i);
        if (ocularMatch) result.glasgow.ocular = toNumber(ocularMatch[1]);
        const verbalMatch = fullText.match(/\b(?:verbal|respuesta\s+verbal)\s*[:]?\s*([\w]+)\b/i);
        if (verbalMatch) result.glasgow.verbal = toNumber(verbalMatch[1]);
        const motorMatch = fullText.match(/\b(?:motor|respuesta\s+motora)\s*[:]?\s*([\w]+)\b/i);
        if (motorMatch) result.glasgow.motor = toNumber(motorMatch[1]);
        
        if (result.glasgow.ocular && result.glasgow.verbal && result.glasgow.motor) {
            result.glasgow.total = result.glasgow.ocular + result.glasgow.verbal + result.glasgow.motor;
        }
    }

    // ================================================================
    // 7. INTERVENCIONES (con descripción inteligente)
    // ================================================================
    const treatmentMap = {
        'oxigenoterapia': { nombre: 'oxigenoterapia', sinónimos: ['oxigenoterapia', 'oxígeno', 'oxigeno', 'o2', 'mascarilla', 'cánula nasal'] },
        'vía intravenosa': { nombre: 'vía intravenosa', sinónimos: ['vía intravenosa', 'iv', 'catéter', 'suero', 'periférica', 'bien travenosa'] },
        'intubación': { nombre: 'intubación', sinónimos: ['intubación', 'intubar'] },
        'ventilación': { nombre: 'ventilación', sinónimos: ['ventilación', 'ventilar', 'bolsa-válvula'] },
        'desfibrilación': { nombre: 'desfibrilación', sinónimos: ['desfibrilación', 'desfibrilar', 'choque'] },
        'masaje cardiaco': { nombre: 'masaje cardiaco', sinónimos: ['masaje cardiaco', 'rcp', 'compresiones'] },
        'vendaje': { nombre: 'vendaje', sinónimos: ['vendaje', 'vendar'] },
        'inmovilización': { nombre: 'inmovilización', sinónimos: ['inmovilización', 'inmovilizar', 'férula', 'collarín'] },
        'medicación': { nombre: 'medicación', sinónimos: ['medicación', 'medicar', 'analgesia', 'anestesia', 'antibiótico'] }
    };

    const found = [];
    const lowerFull = fullText.toLowerCase();

    // Buscar cada intervención y extraer su descripción
    for (const [key, data] of Object.entries(treatmentMap)) {
        for (const synonym of data.sinónimos) {
            const idx = lowerFull.indexOf(synonym);
            if (idx !== -1) {
                let descripcion = '';
                // Extraer desde el final de la palabra clave hasta el final de la frase o hasta la siguiente intervención
                const startIdx = idx + synonym.length;
                let endIdx = fullText.length;
                // Buscar punto, coma, o siguiente intervención
                const nextIntervention = lowerFull.substring(startIdx).search(/\b(?:oxigenoterapia|oxígeno|iv|suero|catéter|vendaje|inmovilización|medicación|rcp)\b/i);
                if (nextIntervention !== -1 && nextIntervention < 100) {
                    endIdx = startIdx + nextIntervention;
                } else {
                    // Buscar punto o coma cercano
                    const dotIdx = fullText.indexOf('.', startIdx);
                    const commaIdx = fullText.indexOf(',', startIdx);
                    if (dotIdx !== -1 && dotIdx < endIdx) endIdx = dotIdx + 1;
                    if (commaIdx !== -1 && commaIdx < endIdx) endIdx = commaIdx + 1;
                }
                descripcion = fullText.substring(startIdx, endIdx).trim();
                // Limpiar descripción: si empieza con "a", "de", "con", "por", mantener
                // Si contiene palabras de otra intervención, cortar
                found.push({
                    tipo_intervencion: data.nombre,
                    descripcion: descripcion,
                    hora_intervencion: ''
                });
                break;
            }
        }
    }

    // Eliminar duplicados y asignar hora actual
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
    // 8. DATOS DEMOGRÁFICOS
    // ================================================================
    const nombreMatch = fullText.match(/paciente\s+([A-Za-záéíóúñ\s]+?)(?=\s+\d+\s*años|\s+sexo|\s+motivo|,|\.|$)/i);
    if (nombreMatch) result.paciente.nombre = nombreMatch[1].trim();

    const edadMatch = fullText.match(/\b(\d{1,3})\s*(años|año|edad)\b/i);
    if (edadMatch) result.paciente.edad = parseInt(edadMatch[1], 10);

    if (/\b(masculino|hombre|varón)\b/i.test(fullText)) result.paciente.sexo = 'M';
    else if (/\b(femenino|mujer)\b/i.test(fullText)) result.paciente.sexo = 'F';

    // ================================================================
    // 9. ASIGNAR HORA ACTUAL A INTERVENCIONES Y HORA ESTIMADA
    // ================================================================
    const ahora = new Date();
    const horas = String(ahora.getHours()).padStart(2, '0');
    const minutos = String(ahora.getMinutes()).padStart(2, '0');
    const horaActual = `${horas}:${minutos}`;
    
    for (const iv of result.intervenciones) {
        iv.hora_intervencion = horaActual;
    }

    // Añadir hora estimada al resultado (se usará en el frontend)
    result.hora_estimada = horaActual;

    // ================================================================
    // 10. LIMPIEZA FINAL: eliminar signos vitales y glasgow de motivo y lesión
    // ================================================================
    const signosPattern = /\b(?:signos\s*vitales|frecuencia\s*card[ií]aca|fc|pulso|frecuencia\s*respiratoria|fr|presi[oó]n\s*arterial|ta|saturaci[oó]n|spo2|temperatura|temp)\b/i;
    const glasgowPattern = /\b(?:glasgow|gcs|escala\s+de\s+glasgow|ocular|verbal|motor)\b/i;
    
    if (result.motivo_urgencia) {
        let clean = result.motivo_urgencia;
        // Cortar en el primer signo vital o glasgow
        let cutIdx = clean.search(signosPattern);
        if (cutIdx !== -1) clean = clean.substring(0, cutIdx);
        cutIdx = clean.search(glasgowPattern);
        if (cutIdx !== -1) clean = clean.substring(0, cutIdx);
        result.motivo_urgencia = clean.trim();
    }

    if (result.descripcion_lesion) {
        let clean = result.descripcion_lesion;
        let cutIdx = clean.search(signosPattern);
        if (cutIdx !== -1) clean = clean.substring(0, cutIdx);
        cutIdx = clean.search(glasgowPattern);
        if (cutIdx !== -1) clean = clean.substring(0, cutIdx);
        result.descripcion_lesion = clean.trim();
    }

    return result;
}

module.exports = { parseMedicalText };