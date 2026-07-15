// src/pln/localParser.js
// Versión sincronizada con el backend - última versión

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
    const dictionaries = {
        motivoStart: [
            'motivo', 'motivo de urgencia', 'motivo de consulta', 'motivo de ingreso',
            'por', 'presenta', 'refiere', 'manifiesta', 'comenta',
            'dolor', 'fiebre', 'trauma', 'accidente', 'caída',
            'náuseas', 'vómito', 'hemorragia', 'disnea', 'dificultad respiratoria'
        ],
        lesionStart: [
            'lesión', 'trauma', 'herida', 'fractura', 'quemadura', 'golpe',
            'contusión', 'torácico', 'craneal', 'abdominal', 'pélvico',
            'tce', 'craneoencefálico'
        ],
        sectionEnd: [
            'signos vitales', 'frecuencia cardíaca', 'fc', 'frecuencia respiratoria',
            'fr', 'presión arterial', 'tensión arterial', 'ta',
            'saturación', 'spo2', 'temperatura',
            'glasgow', 'gcs', 'escala de glasgow',
            'ocular', 'verbal', 'motor'
        ]
    };

    const lowerText = text.toLowerCase();
    let currentPos = 0;
    let motivoEnd = -1;
    let lesionEnd = -1;

    // Motivo de urgencia
    let motivoPos = -1;
    let motivoWord = '';
    for (const word of dictionaries.motivoStart) {
        const pos = lowerText.indexOf(word);
        if (pos !== -1 && (motivoPos === -1 || pos < motivoPos)) {
            motivoPos = pos;
            motivoWord = word;
        }
    }

    if (motivoPos !== -1) {
        let nextSection = lowerText.length;
        for (const endWord of dictionaries.sectionEnd) {
            const pos = lowerText.indexOf(endWord, motivoPos + motivoWord.length);
            if (pos !== -1 && pos < nextSection) {
                nextSection = pos;
            }
        }
        for (const word of dictionaries.lesionStart) {
            const pos = lowerText.indexOf(word, motivoPos + motivoWord.length);
            if (pos !== -1 && pos < nextSection) {
                nextSection = pos;
            }
        }
        motivoEnd = nextSection;
        let motivoText = text.substring(motivoPos + motivoWord.length, nextSection).trim();
        motivoText = motivoText.replace(/^[:,\s]+/, '');
        result.motivo_urgencia = motivoText;
    }

    // Descripción de lesión
    let lesionPos = -1;
    let lesionWord = '';
    const searchStart = motivoEnd !== -1 ? motivoEnd : 0;
    for (const word of dictionaries.lesionStart) {
        const pos = lowerText.indexOf(word, searchStart);
        if (pos !== -1 && (lesionPos === -1 || pos < lesionPos)) {
            if (motivoPos === -1 || pos > motivoPos) {
                lesionPos = pos;
                lesionWord = word;
            }
        }
    }

    if (lesionPos !== -1) {
        let nextSection = lowerText.length;
        for (const endWord of dictionaries.sectionEnd) {
            const pos = lowerText.indexOf(endWord, lesionPos + lesionWord.length);
            if (pos !== -1 && pos < nextSection) {
                nextSection = pos;
            }
        }
        lesionEnd = nextSection;
        let lesionText = text.substring(lesionPos + lesionWord.length, nextSection).trim();
        lesionText = lesionText.replace(/^[:,\s]+/, '');
        result.descripcion_lesion = lesionText;
    }

    // Signos vitales
    const fullText = text;
    
    const fcMatch = fullText.match(/\b(?:fc|frecuencia\s*card[ií]aca|pulso|cardíaca)\s*[:]?\s*(\d{2,3})\b/i);
    if (fcMatch) result.signos_vitales.frecuencia_cardiaca = fcMatch[1];
    
    const frMatch = fullText.match(/\b(?:fr|frecuencia\s*respiratoria|respiración|respiratoria)\s*[:]?\s*(\d{2,3})\b/i);
    if (frMatch) result.signos_vitales.frecuencia_respiratoria = frMatch[1];
    
    const taMatch = fullText.match(/\b(?:ta|tensi[oó]n\s*(?:arterial)?|presi[oó]n\s*(?:arterial)?)\s*[:]?\s*(\d{2,3})\s*[\/\-\s]+(?:sobre\s*)?(\d{2,3})\b/i);
    if (taMatch) {
        result.signos_vitales.tension_arterial = `${taMatch[1]}/${taMatch[2]}`;
    }
    
    const spo2Match = fullText.match(/\b(?:spo2|saturaci[oó]n|o2\s*sat)\s*[:]?\s*(\d{2,3})\b/i);
    if (spo2Match) result.signos_vitales.saturacion_oxigeno = spo2Match[1];
    
    const tempMatch = fullText.match(/\b(?:temperatura|temp)\s*[:]?\s*(\d{2,3}\.?\d*)\b/i);
    if (tempMatch) result.signos_vitales.temperatura = tempMatch[1];

    // Glasgow
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

    // Intervenciones
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
    const lowerFull = fullText.toLowerCase();
    
    for (const [key, data] of Object.entries(treatmentMap)) {
        for (const synonym of data.sinónimos) {
            if (lowerFull.includes(synonym)) {
                let descripcion = '';
                const synonymIndex = lowerFull.indexOf(synonym);
                if (synonymIndex !== -1) {
                    const afterText = fullText.substring(synonymIndex + synonym.length);
                    const detailMatch = afterText.match(/^[^.,]*?(?:[.,]|$)/);
                    if (detailMatch) {
                        let detail = detailMatch[0].trim();
                        const otherTreatments = Object.values(treatmentMap).flatMap(t => t.sinónimos);
                        for (const other of otherTreatments) {
                            if (detail.toLowerCase().includes(other) && detail.toLowerCase().indexOf(other) < 30) {
                                detail = detail.substring(0, detail.toLowerCase().indexOf(other)).trim();
                                break;
                            }
                        }
                        if (detail && detail.length > 2 && !detail.match(/^\d+$/)) {
                            descripcion = detail;
                        }
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

    // Datos demográficos
    const nombreMatch = fullText.match(/paciente\s+([A-Za-záéíóúñ\s]+?)(?=\s+\d+\s*años|\s+sexo|\s+motivo|\s+por|,|\.|$)/i);
    if (nombreMatch) result.paciente.nombre = nombreMatch[1].trim();
    
    const edadMatch = fullText.match(/\b(\d{1,3})\s*(años|año|edad)\b/i);
    if (edadMatch) result.paciente.edad = parseInt(edadMatch[1], 10);
    
    if (/\b(masculino|hombre|varón)\b/i.test(fullText)) result.paciente.sexo = 'M';
    else if (/\b(femenino|mujer)\b/i.test(fullText)) result.paciente.sexo = 'F';

    // Asignar hora actual a intervenciones
    const ahora = new Date();
    const horas = String(ahora.getHours()).padStart(2, '0');
    const minutos = String(ahora.getMinutes()).padStart(2, '0');
    const horaActual = `${horas}:${minutos}`;
    for (const iv of result.intervenciones) {
        iv.hora_intervencion = horaActual;
    }

    // Limpieza final
    const signosPattern = /\b(?:signos\s*vitales|frecuencia\s*card[ií]aca|fc|pulso|frecuencia\s*respiratoria|fr|respiración|presi[oó]n\s*arterial|tensi[oó]n\s*arterial|ta|saturaci[oó]n|spo2|o2\s*sat|temperatura|temp)\b/i;
    const glasgowPattern = /\b(?:glasgow|gcs|escala\s+de\s+glasgow|ocular|verbal|motor|apertura\s+ocular|respuesta\s+verbal|respuesta\s+motora)\b/i;
    
    let motivoClean = result.motivo_urgencia.replace(signosPattern, '').replace(glasgowPattern, '');
    motivoClean = motivoClean.replace(/\s+/g, ' ').trim();
    motivoClean = motivoClean.replace(/^(de|en|por|con|a)\s+/i, '');
    result.motivo_urgencia = motivoClean;

    let lesionClean = result.descripcion_lesion.replace(signosPattern, '').replace(glasgowPattern, '');
    lesionClean = lesionClean.replace(/\s+/g, ' ').trim();
    lesionClean = lesionClean.replace(/^(de|en|por|con|a)\s+/i, '');
    result.descripcion_lesion = lesionClean;

    return result;
}