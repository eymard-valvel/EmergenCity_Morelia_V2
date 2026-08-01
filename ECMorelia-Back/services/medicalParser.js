// backend/services/medicalParser.js
// ═══════════════════════════════════════════════════════════════
//  VERSIÓN DEFINITIVA - Parser Contextual Avanzado
//  Diseñado para entender el lenguaje natural de paramédicos
// ═══════════════════════════════════════════════════════════════

function parseMedicalText(rawText) {
    // Limpieza inicial
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
        intervenciones: [],
        hora_estimada: ''
    };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 1. DETECTAR SECCIONES POR CONTEXTO SEMÁNTICO
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    const fullLower = text.toLowerCase();
    
    // Mapa de secciones con palabras clave y prioridad
    const sectionPatterns = {
        nombre: [
            { regex: /paciente\s+([A-Za-záéíóúñ\s]+?)(?=\s+\d+\s*años|\s+sexo|\s+motivo|,|\.|$)/i, clean: true }
        ],
        edad: [
            { regex: /\b(\d{1,3})\s*(años|año|edad)\b/i, clean: true }
        ],
        sexo: [
            { regex: /\b(masculino|hombre|varón)\b/i, value: 'M' },
            { regex: /\b(femenino|mujer)\b/i, value: 'F' }
        ],
        motivo: [
            { 
                start: /\b(?:motivo\s+(?:de\s+)?(?:urgencia|consulta)|por\s+(?:presentar|tener|con)|refiere|manifiesta)\s*[:]?\s*/i,
                end: /\b(?:lesión|trauma|herida|signos\s*vitales|glasgow|gcs|se\s+administró|se\s+colocó|se\s+puso)/i,
                fallback: /\b(dolor|fiebre|trauma|accidente|caída|náuseas|vómito|hemorragia|disnea|dificultad\s+respiratoria)\s+[^.]+/i
            }
        ],
        lesion: [
            {
                start: /\b(?:lesión|trauma|herida|fractura|quemadura|golpe|contusión)\s+(?:de|en|por)\s*/i,
                end: /\b(?:signos\s*vitales|glasgow|gcs|se\s+administró|se\s+colocó|se\s+puso|y\s+se)/i,
                fallback: /\b(?:trauma|lesión|herida|fractura|contusión)\s+[^.]*/i
            }
        ],
        signos: [
            { regex: /\b(?:fc|frecuencia\s*card[ií]aca|pulso)\s*[:]?\s*(\d{2,3})\b/i, field: 'frecuencia_cardiaca' },
            { regex: /\b(?:fr|frecuencia\s*respiratoria|respiración)\s*[:]?\s*(\d{2,3})\b/i, field: 'frecuencia_respiratoria' },
            { regex: /\b(?:ta|tensi[oó]n\s*(?:arterial)?|presi[oó]n\s*(?:arterial)?|presión|tensión)\s*[:]?\s*(\d{2,3})\s*[\/\-\s]+(?:sobre\s*)?(\d{2,3})\b/i, field: 'tension_arterial', format: (m) => `${m[1]}/${m[2]}` },
            { regex: /\b(?:spo2|saturaci[oó]n|o2\s*sat)\s*[:]?\s*(\d{2,3})\b/i, field: 'saturacion_oxigeno' },
            { regex: /\b(?:temperatura|temp)\s*[:]?\s*(\d{2,3}\.?\d*)\b/i, field: 'temperatura' }
        ],
        glasgow: [
            { regex: /\b(?:glasgow|gcs|escala\s+de\s+glasgow)\s*[:]?\s*(\d{1,2})\b/i, field: 'total' },
            { regex: /\bocular\s*[:]?\s*(\d)\b/i, field: 'ocular' },
            { regex: /\bverbal\s*[:]?\s*(\d)\b/i, field: 'verbal' },
            { regex: /\bmotor\s*[:]?\s*(\d)\b/i, field: 'motor' }
        ],
        intervenciones: {
            keywords: ['oxigenoterapia', 'oxígeno', 'oxigeno', 'o2', 'mascarilla', 'cánula nasal', 'vía intravenosa', 'iv', 'catéter', 'suero', 'vendaje', 'inmovilización', 'férula', 'collarín', 'medicación', 'analgesia', 'anestesia', 'rcp', 'masaje cardíaco', 'desfibrilación', 'intubación', 'ventilación'],
            map: {
                'oxigenoterapia': { nombre: 'oxigenoterapia', sinonimos: ['oxigenoterapia', 'oxígeno', 'oxigeno', 'o2', 'mascarilla', 'cánula nasal'] },
                'vía intravenosa': { nombre: 'vía intravenosa', sinonimos: ['vía intravenosa', 'iv', 'catéter', 'suero', 'bien travenosa', 'travenosa'] },
                'intubación': { nombre: 'intubación', sinonimos: ['intubación', 'intubar'] },
                'ventilación': { nombre: 'ventilación', sinonimos: ['ventilación', 'ventilar'] },
                'desfibrilación': { nombre: 'desfibrilación', sinonimos: ['desfibrilación', 'desfibrilar', 'choque'] },
                'masaje cardiaco': { nombre: 'masaje cardiaco', sinonimos: ['masaje cardiaco', 'rcp', 'compresiones'] },
                'vendaje': { nombre: 'vendaje', sinonimos: ['vendaje', 'vendar'] },
                'inmovilización': { nombre: 'inmovilización', sinonimos: ['inmovilización', 'inmovilizar', 'férula'] },
                'medicación': { nombre: 'medicación', sinonimos: ['medicación', 'medicar', 'analgesia', 'anestesia'] }
            }
        }
    };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 2. FUNCIÓN AUXILIAR: EXTRAER ENTRE PATRONES
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    function extractBetween(text, startPattern, endPattern, fallbackPattern = null) {
        let result = '';
        const startMatch = text.match(startPattern);
        if (startMatch) {
            const startIdx = startMatch.index + startMatch[0].length;
            let endIdx = text.length;
            if (endPattern) {
                const endMatch = text.substring(startIdx).match(endPattern);
                if (endMatch) {
                    endIdx = startIdx + endMatch.index;
                }
            }
            result = text.substring(startIdx, endIdx).trim();
        } else if (fallbackPattern) {
            const fallbackMatch = text.match(fallbackPattern);
            if (fallbackMatch) {
                result = fallbackMatch[0].trim();
            }
        }
        return result;
    }

    function findSection(text, sectionConfig) {
        if (Array.isArray(sectionConfig)) {
            for (const config of sectionConfig) {
                if (config.start) {
                    const result = extractBetween(text, config.start, config.end, config.fallback);
                    if (result) return result;
                }
            }
        }
        return '';
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 3. EXTRAER DATOS DEMOGRÁFICOS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    // Nombre
    const nombreMatch = text.match(sectionPatterns.nombre[0].regex);
    if (nombreMatch) {
        result.paciente.nombre = nombreMatch[1].trim();
    }

    // Edad
    const edadMatch = text.match(sectionPatterns.edad[0].regex);
    if (edadMatch) {
        result.paciente.edad = parseInt(edadMatch[1], 10);
    }

    // Sexo
    for (const pattern of sectionPatterns.sexo) {
        if (pattern.regex.test(text)) {
            result.paciente.sexo = pattern.value;
            break;
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 4. EXTRAER MOTIVO DE URGENCIA (CONTEXTUAL)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    let motivo = findSection(text, sectionPatterns.motivo);
    if (motivo) {
        // Limpiar: eliminar palabras clave iniciales
        for (const pattern of sectionPatterns.motivo) {
            if (pattern.start) {
                motivo = motivo.replace(pattern.start, '');
            }
        }
        // Limpiar: eliminar signos vitales y glasgow que pudieran haber quedado
        const signosPattern = /\b(?:signos\s*vitales|frecuencia\s*card[ií]aca|fc|pulso|frecuencia\s*respiratoria|fr|presi[oó]n\s*arterial|ta|saturaci[oó]n|spo2|temperatura|temp)\b/i;
        const glasgowPattern = /\b(?:glasgow|gcs|escala\s+de\s+glasgow|ocular|verbal|motor)\b/i;
        let cutIdx = motivo.search(signosPattern);
        if (cutIdx !== -1) motivo = motivo.substring(0, cutIdx);
        cutIdx = motivo.search(glasgowPattern);
        if (cutIdx !== -1) motivo = motivo.substring(0, cutIdx);
        result.motivo_urgencia = motivo.trim();
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 5. EXTRAER DESCRIPCIÓN DE LESIÓN (CONTEXTUAL)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    let lesion = findSection(text, sectionPatterns.lesion);
    if (lesion) {
        // Limpiar: eliminar palabras clave iniciales
        for (const pattern of sectionPatterns.lesion) {
            if (pattern.start) {
                lesion = lesion.replace(pattern.start, '');
            }
        }
        // Limpiar: eliminar signos vitales y glasgow
        const signosPattern = /\b(?:signos\s*vitales|frecuencia\s*card[ií]aca|fc|pulso|frecuencia\s*respiratoria|fr|presi[oó]n\s*arterial|ta|saturaci[oó]n|spo2|temperatura|temp)\b/i;
        const glasgowPattern = /\b(?:glasgow|gcs|escala\s+de\s+glasgow|ocular|verbal|motor)\b/i;
        let cutIdx = lesion.search(signosPattern);
        if (cutIdx !== -1) lesion = lesion.substring(0, cutIdx);
        cutIdx = lesion.search(glasgowPattern);
        if (cutIdx !== -1) lesion = lesion.substring(0, cutIdx);
        result.descripcion_lesion = lesion.trim();
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 6. EXTRAER SIGNOS VITALES (MULTI-REGEX)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    for (const pattern of sectionPatterns.signos) {
        const match = text.match(pattern.regex);
        if (match) {
            if (pattern.format) {
                result.signos_vitales[pattern.field] = pattern.format(match);
            } else {
                result.signos_vitales[pattern.field] = match[1];
            }
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 7. EXTRAER ESCALA DE GLASGOW (CON NÚMEROS EN LETRAS Y FALLBACK)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    const numberMap = {
        'uno': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5,
        'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10
    };
    
    function toNumber(str) {
        if (!str) return null;
        const lower = str.toLowerCase().trim();
        if (numberMap[lower]) return numberMap[lower];
        const num = parseInt(str, 10);
        return isNaN(num) ? null : num;
    }

    // Primero intentar Glasgow total
    let gcsFound = false;
    for (const pattern of sectionPatterns.glasgow) {
        if (pattern.field === 'total') {
            const match = text.match(pattern.regex);
            if (match) {
                const total = toNumber(match[1]);
                if (total !== null && total >= 3 && total <= 15) {
                    result.glasgow.total = total;
                    gcsFound = true;
                    // Intentar asignar valores por defecto si no se encontraron individuales
                    if (result.glasgow.ocular === null) result.glasgow.ocular = 4;
                    if (result.glasgow.verbal === null) result.glasgow.verbal = 5;
                    if (result.glasgow.motor === null) result.glasgow.motor = 6;
                }
            }
        }
    }

    // Si no se encontró total, buscar componentes individuales
    if (!gcsFound) {
        for (const pattern of sectionPatterns.glasgow) {
            if (pattern.field !== 'total') {
                const match = text.match(pattern.regex);
                if (match) {
                    const value = toNumber(match[1]);
                    if (value !== null && value >= 1 && value <= (pattern.field === 'ocular' ? 4 : pattern.field === 'verbal' ? 5 : 6)) {
                        result.glasgow[pattern.field] = value;
                    }
                }
            }
        }
        // Calcular total si tenemos los tres
        if (result.glasgow.ocular !== null && result.glasgow.verbal !== null && result.glasgow.motor !== null) {
            result.glasgow.total = result.glasgow.ocular + result.glasgow.verbal + result.glasgow.motor;
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 8. EXTRAER INTERVENCIONES CON DESCRIPCIONES
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    const interventionData = sectionPatterns.intervenciones;
    const found = [];
    const lowerText = text.toLowerCase();

    for (const [key, data] of Object.entries(interventionData.map)) {
        let foundMatch = false;
        for (const synonym of data.sinonimos) {
            const idx = lowerText.indexOf(synonym);
            if (idx !== -1) {
                let descripcion = '';
                // Extraer desde el final de la palabra clave hasta el final de la frase o siguiente intervención
                const startIdx = idx + synonym.length;
                let endIdx = text.length;
                
                // Buscar punto, coma, o siguiente intervención (en un radio de 150 caracteres)
                const searchSpace = text.substring(startIdx, Math.min(startIdx + 150, text.length));
                const nextIntervention = searchSpace.search(/\b(?:oxigenoterapia|oxígeno|iv|suero|catéter|vendaje|inmovilización|medicación|rcp|intubación|ventilación|desfibrilación|masaje)\b/i);
                if (nextIntervention !== -1 && nextIntervention < 50) {
                    endIdx = startIdx + nextIntervention;
                } else {
                    // Buscar punto o coma
                    const dotIdx = text.indexOf('.', startIdx);
                    const commaIdx = text.indexOf(',', startIdx);
                    if (dotIdx !== -1 && dotIdx < endIdx) endIdx = dotIdx + 1;
                    if (commaIdx !== -1 && commaIdx < endIdx) endIdx = commaIdx + 1;
                }
                descripcion = text.substring(startIdx, endIdx).trim();
                // Limpiar descripción: si contiene otra intervención, cortar
                const cutPatterns = ['oxigenoterapia', 'oxígeno', 'iv', 'suero', 'catéter', 'vendaje', 'inmovilización', 'medicación', 'rcp'];
                for (const cp of cutPatterns) {
                    const cpIdx = descripcion.toLowerCase().indexOf(cp);
                    if (cpIdx !== -1 && cpIdx < 20) {
                        descripcion = descripcion.substring(0, cpIdx).trim();
                    }
                }
                found.push({
                    tipo_intervencion: data.nombre,
                    descripcion: descripcion,
                    hora_intervencion: ''
                });
                foundMatch = true;
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

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 9. ASIGNAR HORA ACTUAL
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    const ahora = new Date();
    const horas = String(ahora.getHours()).padStart(2, '0');
    const minutos = String(ahora.getMinutes()).padStart(2, '0');
    const horaActual = `${horas}:${minutos}`;
    
    for (const iv of result.intervenciones) {
        iv.hora_intervencion = horaActual;
    }
    result.hora_estimada = horaActual;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 10. LIMPIEZA FINAL DE MOTIVO Y LESIÓN
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    const cleanPatterns = [
        /\b(?:signos\s*vitales|frecuencia\s*card[ií]aca|fc|pulso|frecuencia\s*respiratoria|fr|presi[oó]n\s*arterial|ta|saturaci[oó]n|spo2|temperatura|temp)\b/i,
        /\b(?:glasgow|gcs|escala\s+de\s+glasgow|ocular|verbal|motor)\b/i,
        /\b(?:se\s+administró|se\s+colocó|se\s+puso)\b/i
    ];

    if (result.motivo_urgencia) {
        let clean = result.motivo_urgencia;
        for (const pattern of cleanPatterns) {
            const idx = clean.search(pattern);
            if (idx !== -1) clean = clean.substring(0, idx);
        }
        result.motivo_urgencia = clean.trim();
    }

    if (result.descripcion_lesion) {
        let clean = result.descripcion_lesion;
        for (const pattern of cleanPatterns) {
            const idx = clean.search(pattern);
            if (idx !== -1) clean = clean.substring(0, idx);
        }
        result.descripcion_lesion = clean.trim();
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 11. VALIDACIÓN Y CORRECCIÓN DE GLASGOW
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    // Si Glasgow total es null pero tenemos datos individuales, calcular
    if (result.glasgow.total === null && 
        result.glasgow.ocular !== null && 
        result.glasgow.verbal !== null && 
        result.glasgow.motor !== null) {
        result.glasgow.total = result.glasgow.ocular + result.glasgow.verbal + result.glasgow.motor;
    }
    
    // Si tenemos total pero no individuales, asignar valores por defecto basados en el total
    if (result.glasgow.total !== null && 
        (result.glasgow.ocular === null || result.glasgow.verbal === null || result.glasgow.motor === null)) {
        // Asignar valores típicos según el total (aproximación)
        const total = result.glasgow.total;
        if (total >= 13) {
            result.glasgow.ocular = result.glasgow.ocular || 4;
            result.glasgow.verbal = result.glasgow.verbal || 5;
            result.glasgow.motor = result.glasgow.motor || 6;
        } else if (total >= 9) {
            result.glasgow.ocular = result.glasgow.ocular || 3;
            result.glasgow.verbal = result.glasgow.verbal || 4;
            result.glasgow.motor = result.glasgow.motor || 5;
        } else {
            result.glasgow.ocular = result.glasgow.ocular || 2;
            result.glasgow.verbal = result.glasgow.verbal || 3;
            result.glasgow.motor = result.glasgow.motor || 4;
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 12. CORRECCIÓN DE ERRORES COMUNES EN INTERVENCIONES
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    // Corregir descripciones que contienen texto de otras secciones
    for (const iv of result.intervenciones) {
        if (iv.descripcion) {
            // Eliminar texto que parezca ser de otra sección
            const badPatterns = [
                /\bmotivo\s+de\s+urgencia\b/i,
                /\blesión\b/i,
                /\btrauma\b/i,
                /\bsignos\s*vitales\b/i,
                /\bglasgow\b/i,
                /\bocular\b/i,
                /\bverbal\b/i,
                /\bmotor\b/i
            ];
            for (const bp of badPatterns) {
                const idx = iv.descripcion.search(bp);
                if (idx !== -1 && idx < 20) {
                    iv.descripcion = iv.descripcion.substring(0, idx).trim();
                }
            }
            // Si la descripción es muy larga (>50 caracteres), probablemente tiene texto extra
            if (iv.descripcion.length > 50) {
                // Buscar el primer punto, coma o "y" para cortar
                const cutIdx = iv.descripcion.search(/[,.;]|\s+y\s+/);
                if (cutIdx !== -1 && cutIdx < 40) {
                    iv.descripcion = iv.descripcion.substring(0, cutIdx).trim();
                }
            }
        }
    }

    return result;
}

module.exports = { parseMedicalText };