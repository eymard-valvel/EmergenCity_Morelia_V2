// src/pln/localParser.js
// VERSIÓN DEFINITIVA - Sincronizada con el backend

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
        intervenciones: [],
        hora_estimada: ''
    };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // FUNCIONES AUXILIARES
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

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // DATOS DEMOGRÁFICOS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    const nombreMatch = text.match(/paciente\s+([A-Za-záéíóúñ\s]+?)(?=\s+\d+\s*años|\s+sexo|\s+motivo|,|\.|$)/i);
    if (nombreMatch) result.paciente.nombre = nombreMatch[1].trim();

    const edadMatch = text.match(/\b(\d{1,3})\s*(años|año|edad)\b/i);
    if (edadMatch) result.paciente.edad = parseInt(edadMatch[1], 10);

    if (/\b(masculino|hombre|varón)\b/i.test(text)) result.paciente.sexo = 'M';
    else if (/\b(femenino|mujer)\b/i.test(text)) result.paciente.sexo = 'F';

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // MOTIVO DE URGENCIA
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    let motivo = extractBetween(
        text,
        /\b(?:motivo\s+(?:de\s+)?(?:urgencia|consulta)|por\s+(?:presentar|tener|con)|refiere|manifiesta)\s*[:]?\s*/i,
        /\b(?:lesión|trauma|herida|signos\s*vitales|glasgow|gcs|se\s+administró|se\s+colocó|se\s+puso)/i,
        /\b(dolor|fiebre|trauma|accidente|caída|náuseas|vómito|hemorragia|disnea|dificultad\s+respiratoria)\s+[^.]+/i
    );
    if (motivo) {
        const cleanPatterns = [
            /\b(?:signos\s*vitales|frecuencia\s*card[ií]aca|fc|pulso|frecuencia\s*respiratoria|fr|presi[oó]n\s*arterial|ta|saturaci[oó]n|spo2|temperatura|temp)\b/i,
            /\b(?:glasgow|gcs|escala\s+de\s+glasgow|ocular|verbal|motor)\b/i
        ];
        for (const pattern of cleanPatterns) {
            const idx = motivo.search(pattern);
            if (idx !== -1) motivo = motivo.substring(0, idx);
        }
        result.motivo_urgencia = motivo.trim();
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // DESCRIPCIÓN DE LESIÓN
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    let lesion = extractBetween(
        text,
        /\b(?:lesión|trauma|herida|fractura|quemadura|golpe|contusión)\s+(?:de|en|por)\s*/i,
        /\b(?:signos\s*vitales|glasgow|gcs|se\s+administró|se\s+colocó|se\s+puso|y\s+se)/i,
        /\b(?:trauma|lesión|herida|fractura|contusión)\s+[^.]*/i
    );
    if (lesion) {
        const cleanPatterns = [
            /\b(?:signos\s*vitales|frecuencia\s*card[ií]aca|fc|pulso|frecuencia\s*respiratoria|fr|presi[oó]n\s*arterial|ta|saturaci[oó]n|spo2|temperatura|temp)\b/i,
            /\b(?:glasgow|gcs|escala\s+de\s+glasgow|ocular|verbal|motor)\b/i
        ];
        for (const pattern of cleanPatterns) {
            const idx = lesion.search(pattern);
            if (idx !== -1) lesion = lesion.substring(0, idx);
        }
        result.descripcion_lesion = lesion.trim();
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SIGNOS VITALES
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    const fcMatch = text.match(/\b(?:fc|frecuencia\s*card[ií]aca|pulso)\s*[:]?\s*(\d{2,3})\b/i);
    if (fcMatch) result.signos_vitales.frecuencia_cardiaca = fcMatch[1];
    const frMatch = text.match(/\b(?:fr|frecuencia\s*respiratoria|respiración)\s*[:]?\s*(\d{2,3})\b/i);
    if (frMatch) result.signos_vitales.frecuencia_respiratoria = frMatch[1];
    const taMatch = text.match(/\b(?:ta|tensi[oó]n\s*(?:arterial)?|presi[oó]n\s*(?:arterial)?|presión|tensión)\s*[:]?\s*(\d{2,3})\s*[\/\-\s]+(?:sobre\s*)?(\d{2,3})\b/i);
    if (taMatch) result.signos_vitales.tension_arterial = `${taMatch[1]}/${taMatch[2]}`;
    const spo2Match = text.match(/\b(?:spo2|saturaci[oó]n|o2\s*sat)\s*[:]?\s*(\d{2,3})\b/i);
    if (spo2Match) result.signos_vitales.saturacion_oxigeno = spo2Match[1];
    const tempMatch = text.match(/\b(?:temperatura|temp)\s*[:]?\s*(\d{2,3}\.?\d*)\b/i);
    if (tempMatch) result.signos_vitales.temperatura = tempMatch[1];

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ESCALA DE GLASGOW
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

    let gcsFound = false;
    const gcsMatch = text.match(/\b(?:glasgow|gcs|escala\s+de\s+glasgow)\s*[:]?\s*(\d{1,2})\b/i);
    if (gcsMatch) {
        const total = toNumber(gcsMatch[1]);
        if (total !== null && total >= 3 && total <= 15) {
            result.glasgow.total = total;
            gcsFound = true;
            if (result.glasgow.ocular === null) result.glasgow.ocular = 4;
            if (result.glasgow.verbal === null) result.glasgow.verbal = 5;
            if (result.glasgow.motor === null) result.glasgow.motor = 6;
        }
    }

    if (!gcsFound) {
        const ocularMatch = text.match(/\b(?:ocular|ojos|apertura\s+ocular)\s*[:]?\s*([\w]+)\b/i);
        if (ocularMatch) result.glasgow.ocular = toNumber(ocularMatch[1]);
        const verbalMatch = text.match(/\b(?:verbal|respuesta\s+verbal)\s*[:]?\s*([\w]+)\b/i);
        if (verbalMatch) result.glasgow.verbal = toNumber(verbalMatch[1]);
        const motorMatch = text.match(/\b(?:motor|respuesta\s+motora)\s*[:]?\s*([\w]+)\b/i);
        if (motorMatch) result.glasgow.motor = toNumber(motorMatch[1]);
        if (result.glasgow.ocular !== null && result.glasgow.verbal !== null && result.glasgow.motor !== null) {
            result.glasgow.total = result.glasgow.ocular + result.glasgow.verbal + result.glasgow.motor;
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // INTERVENCIONES
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    const treatmentMap = {
        'oxigenoterapia': { nombre: 'oxigenoterapia', sinonimos: ['oxigenoterapia', 'oxígeno', 'oxigeno', 'o2', 'mascarilla'] },
        'vía intravenosa': { nombre: 'vía intravenosa', sinonimos: ['vía intravenosa', 'iv', 'catéter', 'suero', 'bien travenosa', 'travenosa'] },
        'intubación': { nombre: 'intubación', sinonimos: ['intubación', 'intubar'] },
        'ventilación': { nombre: 'ventilación', sinonimos: ['ventilación', 'ventilar'] },
        'desfibrilación': { nombre: 'desfibrilación', sinonimos: ['desfibrilación', 'desfibrilar', 'choque'] },
        'masaje cardiaco': { nombre: 'masaje cardiaco', sinonimos: ['masaje cardiaco', 'rcp', 'compresiones'] },
        'vendaje': { nombre: 'vendaje', sinonimos: ['vendaje', 'vendar'] },
        'inmovilización': { nombre: 'inmovilización', sinonimos: ['inmovilización', 'inmovilizar', 'férula'] },
        'medicación': { nombre: 'medicación', sinonimos: ['medicación', 'medicar', 'analgesia', 'anestesia'] }
    };

    const found = [];
    const lowerText = text.toLowerCase();

    for (const [key, data] of Object.entries(treatmentMap)) {
        for (const synonym of data.sinonimos) {
            const idx = lowerText.indexOf(synonym);
            if (idx !== -1) {
                let descripcion = '';
                const startIdx = idx + synonym.length;
                let endIdx = text.length;
                const searchSpace = text.substring(startIdx, Math.min(startIdx + 150, text.length));
                const nextIntervention = searchSpace.search(/\b(?:oxigenoterapia|oxígeno|iv|suero|catéter|vendaje|inmovilización|medicación|rcp|intubación|ventilación|desfibrilación|masaje)\b/i);
                if (nextIntervention !== -1 && nextIntervention < 50) {
                    endIdx = startIdx + nextIntervention;
                } else {
                    const dotIdx = text.indexOf('.', startIdx);
                    const commaIdx = text.indexOf(',', startIdx);
                    if (dotIdx !== -1 && dotIdx < endIdx) endIdx = dotIdx + 1;
                    if (commaIdx !== -1 && commaIdx < endIdx) endIdx = commaIdx + 1;
                }
                descripcion = text.substring(startIdx, endIdx).trim();
                // Limpiar descripción
                const cutPatterns = ['oxigenoterapia', 'oxígeno', 'iv', 'suero', 'catéter', 'vendaje', 'inmovilización', 'medicación', 'rcp'];
                for (const cp of cutPatterns) {
                    const cpIdx = descripcion.toLowerCase().indexOf(cp);
                    if (cpIdx !== -1 && cpIdx < 20) {
                        descripcion = descripcion.substring(0, cpIdx).trim();
                    }
                }
                // Limpiar texto de otras secciones
                const badPatterns = [/\bmotivo\s+de\s+urgencia\b/i, /\blesión\b/i, /\btrauma\b/i, /\bsignos\s*vitales\b/i, /\bglasgow\b/i];
                for (const bp of badPatterns) {
                    const idx2 = descripcion.search(bp);
                    if (idx2 !== -1 && idx2 < 20) {
                        descripcion = descripcion.substring(0, idx2).trim();
                    }
                }
                if (descripcion.length > 50) {
                    const cutIdx = descripcion.search(/[,.;]|\s+y\s+/);
                    if (cutIdx !== -1 && cutIdx < 40) {
                        descripcion = descripcion.substring(0, cutIdx).trim();
                    }
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
    // HORA ACTUAL
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    const ahora = new Date();
    const horas = String(ahora.getHours()).padStart(2, '0');
    const minutos = String(ahora.getMinutes()).padStart(2, '0');
    const horaActual = `${horas}:${minutos}`;
    for (const iv of result.intervenciones) {
        iv.hora_intervencion = horaActual;
    }
    result.hora_estimada = horaActual;

    return result;
}