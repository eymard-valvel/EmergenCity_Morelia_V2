// backend/services/medicalParser.js
/**
 * Parser médico optimizado con vocabulario paramédico mexicano
 * Detecta motivos, lesiones, signos vitales, Glasgow e intervenciones
 * Funciona con 512 MB de RAM - sin dependencias externas
 */

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
    // 1. DIVIDIR EN ORACIONES PARA ANÁLISIS CONTEXTUAL
    // ================================================================
    const sentences = text.match(/[^.]+[.]?/g) || [text];
    
    // ================================================================
    // 2. DICCIONARIOS DE SINÓNIMOS (VOCABULARIO PARAMÉDICO)
    // ================================================================
    const keywords = {
        motivo: [
            'motivo', 'consulta', 'urgencia', 'por', 'presenta', 'refiere',
            'manifiesta', 'comenta', 'dolor', 'fiebre', 'trauma', 'accidente',
            'caída', 'náuseas', 'vómito', 'hemorragia', 'disnea',
            'dificultad respiratoria', 'policontundido', 'politraumatizado'
        ],
        lesion: [
            'lesión', 'trauma', 'herida', 'fractura', 'quemadura', 'golpe',
            'contusión', 'torácico', 'craneal', 'abdominal', 'pélvico',
            'extremidades', 'tce', 'craneoencefálico', 'policontundido'
        ],
        signos: [
            'signos vitales', 'frecuencia cardíaca', 'fc', 'pulso', 'cardíaca',
            'frecuencia respiratoria', 'fr', 'respiración', 'respiratoria',
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
    // 3. CLASIFICAR ORACIONES POR CONTEXTO
    // ================================================================
    let motivoText = '', lesionText = '', signosText = '', glasgowText = '', intervencionesText = '';

    for (const sentence of sentences) {
        const lower = sentence.toLowerCase();
        const hasMotivo = keywords.motivo.some(kw => lower.includes(kw));
        const hasLesion = keywords.lesion.some(kw => lower.includes(kw));
        const hasSignos = keywords.signos.some(kw => lower.includes(kw));
        const hasGlasgow = keywords.glasgow.some(kw => lower.includes(kw));
        const hasIntervencion = keywords.intervenciones.some(kw => lower.includes(kw));

        if (hasGlasgow) glasgowText += sentence + ' ';
        else if (hasSignos) signosText += sentence + ' ';
        else if (hasIntervencion && !hasMotivo && !hasLesion) intervencionesText += sentence + ' ';
        else if (hasLesion) lesionText += sentence + ' ';
        else if (hasMotivo) motivoText += sentence + ' ';
    }

    // ================================================================
    // 4. EXTRAER MOTIVO DE URGENCIA
    // ================================================================
    if (motivoText) {
        result.motivo_urgencia = motivoText
            .replace(/^(motivo\s+(?:de\s+)?(?:urgencia|consulta)\s*[:]?\s*)/i, '')
            .replace(/^(por\s+(?:presentar|tener|con)\s*)/i, '')
            .trim();
    }

    // ================================================================
    // 5. EXTRAER DESCRIPCIÓN DE LESIÓN
    // ================================================================
    if (lesionText) {
        result.descripcion_lesion = lesionText
            .replace(/^(lesión|trauma|herida|fractura|quemadura|golpe|contusión)\s+(?:de|en|por)\s*/i, '')
            .trim();
    }

    // ================================================================
    // 6. EXTRAER SIGNOS VITALES (regex mejoradas)
    // ================================================================
    const fullText = text;
    
    // FC: frecuencia cardíaca, FC, pulso
    const fcMatch = fullText.match(/\b(?:fc|frecuencia\s*card[ií]aca|pulso|cardíaca)\s*[:]?\s*(\d{2,3})\b/i);
    if (fcMatch) result.signos_vitales.frecuencia_cardiaca = fcMatch[1];

    // FR: frecuencia respiratoria, FR, respiración
    const frMatch = fullText.match(/\b(?:fr|frecuencia\s*respiratoria|respiración|respiratoria)\s*[:]?\s*(\d{2,3})\b/i);
    if (frMatch) result.signos_vitales.frecuencia_respiratoria = frMatch[1];

    // TA: presión arterial, tensión arterial, TA, presión, tensión
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
    // 7. EXTRAER ESCALA DE GLASGOW (con números escritos)
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
    // 8. EXTRAER INTERVENCIONES (con descripción y normalización)
    // ================================================================
    const treatmentMap = {
        'oxigenoterapia': { nombre: 'oxigenoterapia', sinónimos: ['oxigenoterapia', 'oxígeno', 'oxigeno', 'o2', 'mascarilla', 'cánula nasal'] },
        'vía intravenosa': { nombre: 'vía intravenosa', sinónimos: ['vía intravenosa', 'iv', 'catéter', 'suero', 'periférica'] },
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
    
    for (const [key, data] of Object.entries(treatmentMap)) {
        for (const synonym of data.sinónimos) {
            if (lowerFull.includes(synonym)) {
                let descripcion = '';
                // Buscar detalles como "a 3 litros", "por minuto", "cada 8 horas"
                const descRegex = new RegExp(`${synonym}[^.]*?(\\d+\\s*(?:litros|ml|mg|horas|minutos|segundos)|(?:a|de|con|por)\\s+[^.,]+)`, 'i');
                const descMatch = fullText.match(descRegex);
                if (descMatch) {
                    descripcion = descMatch[1] || '';
                }
                found.push({
                    tipo_intervencion: data.nombre,
                    descripcion: descripcion.trim(),
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
    // 9. DATOS DEMOGRÁFICOS
    // ================================================================
    const nombreMatch = fullText.match(/paciente\s+([A-Za-záéíóúñ\s]+?)(?=\s+\d+\s*años|\s+sexo|\s+motivo|,|\.|$)/i);
    if (nombreMatch) result.paciente.nombre = nombreMatch[1].trim();

    const edadMatch = fullText.match(/\b(\d{1,3})\s*(años|año|edad)\b/i);
    if (edadMatch) result.paciente.edad = parseInt(edadMatch[1], 10);

    if (/\b(masculino|hombre|varón)\b/i.test(fullText)) result.paciente.sexo = 'M';
    else if (/\b(femenino|mujer)\b/i.test(fullText)) result.paciente.sexo = 'F';

    // ================================================================
    // 10. LIMPIAR MOTIVO Y LESIÓN (eliminar signos vitales y glasgow)
    // ================================================================
    const signosPattern = /\b(?:signos\s*vitales|frecuencia\s*card[ií]aca|fc|pulso|frecuencia\s*respiratoria|fr|presi[oó]n\s*arterial|ta|saturaci[oó]n|spo2|temperatura)\b/i;
    const glasgowPattern = /\b(?:glasgow|gcs|escala\s+de\s+glasgow|ocular|verbal|motor)\b/i;
    
    // Cortar motivo en primer signo vital o glasgow
    let motivoCut = result.motivo_urgencia.search(signosPattern);
    if (motivoCut !== -1) {
        result.motivo_urgencia = result.motivo_urgencia.substring(0, motivoCut).trim();
    }
    let motivoCutGlasgow = result.motivo_urgencia.search(glasgowPattern);
    if (motivoCutGlasgow !== -1) {
        result.motivo_urgencia = result.motivo_urgencia.substring(0, motivoCutGlasgow).trim();
    }

    // Cortar lesión en primer signo vital o glasgow
    let lesionCut = result.descripcion_lesion.search(signosPattern);
    if (lesionCut !== -1) {
        result.descripcion_lesion = result.descripcion_lesion.substring(0, lesionCut).trim();
    }
    let lesionCutGlasgow = result.descripcion_lesion.search(glasgowPattern);
    if (lesionCutGlasgow !== -1) {
        result.descripcion_lesion = result.descripcion_lesion.substring(0, lesionCutGlasgow).trim();
    }

    // ================================================================
    // 11. ASIGNAR HORA ACTUAL A INTERVENCIONES
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