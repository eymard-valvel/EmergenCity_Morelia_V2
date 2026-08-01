// backend/services/localMedicalNER.js
const { pipeline } = require('@xenova/transformers');

// Variable para cachear el pipeline (solo se carga una vez)
let nerPipeline = null;

/**
 * Inicializa el pipeline de NER médico en español
 * Usa el modelo HUMADEX/spanish_medical_ner
 */
async function getNERPipeline() {
    if (!nerPipeline) {
        console.log('🔄 Cargando modelo de NER médico...');
        try {
            // Usamos el modelo de HUMADEX para español
            nerPipeline = await pipeline(
                'token-classification',
                'HUMADEX/spanish_medical_ner',
                { 
                    device: 'cpu', // Usa 'cuda' si tienes GPU
                    dtype: 'fp32'   // Precisión completa para mejor accuracy
                }
            );
            console.log('✅ Modelo de NER médico cargado correctamente');
        } catch (error) {
            console.error('❌ Error al cargar el modelo:', error);
            throw error;
        }
    }
    return nerPipeline;
}

/**
 * Extrae entidades médicas de un texto usando el modelo local
 */
async function extractMedicalEntities(text) {
    try {
        const pipe = await getNERPipeline();
        
        // Ejecutar la inferencia
        const entities = await pipe(text, {
            aggregation_strategy: 'simple', // Agrupa tokens en entidades completas
        });

        // Clasificar entidades por tipo
        const result = {
            problems: [],
            tests: [],
            treatments: [],
            others: []
        };

        entities.forEach(entity => {
            const label = entity.entity_group || entity.label;
            const word = entity.word || '';
            const score = entity.score || 0;

            // Solo considerar entidades con confianza > 0.5
            if (score < 0.5) return;

            switch(label) {
                case 'PROBLEM':
                    result.problems.push(word);
                    break;
                case 'TEST':
                    result.tests.push(word);
                    break;
                case 'TREATMENT':
                    result.treatments.push(word);
                    break;
                default:
                    result.others.push({ label, word, score });
            }
        });

        return result;
    } catch (error) {
        console.error('Error en extractMedicalEntities:', error);
        throw error;
    }
}

/**
 * Función principal que extrae y estructura los datos
 */
async function parseMedicalText(text) {
    // 1. Extraer entidades con el modelo NER
    const entities = await extractMedicalEntities(text);
    
    // 2. Extraer valores numéricos (signos vitales, edad, etc.) con regex
    const vitalSigns = extractVitalSigns(text);
    
    // 3. Extraer Glasgow
    const glasgow = extractGlasgow(text);
    
    // 4. Extraer nombre y datos demográficos
    const demographic = extractDemographic(text);

    // 5. Construir el resultado final
    return {
        paciente: {
            nombre: demographic.nombre || '',
            edad: demographic.edad || '',
            sexo: demographic.sexo || ''
        },
        signos_vitales: vitalSigns,
        glasgow: glasgow,
        motivo_urgencia: entities.problems.join(', ') || '',
        descripcion_lesion: extractLesionDescription(text),
        hallazgos_escena: text,
        intervenciones: entities.treatments.map(t => ({
            tipo_intervencion: t,
            descripcion: '',
            hora_intervencion: ''
        }))
    };
}

/**
 * Extrae signos vitales usando expresiones regulares
 */
function extractVitalSigns(text) {
    const result = {
        frecuencia_cardiaca: '',
        frecuencia_respiratoria: '',
        tension_arterial: '',
        saturacion_oxigeno: '',
        temperatura: ''
    };

    // FC: "frecuencia cardíaca 110", "FC 110"
    const fcMatch = text.match(/\b(?:fc|frecuencia\s*card[ií]aca)\s*[:]?\s*(\d{2,3})\b/i);
    if (fcMatch) result.frecuencia_cardiaca = fcMatch[1];

    // FR: "frecuencia respiratoria 28", "FR 28"
    const frMatch = text.match(/\b(?:fr|frecuencia\s*respiratoria)\s*[:]?\s*(\d{2,3})\b/i);
    if (frMatch) result.frecuencia_respiratoria = frMatch[1];

    // TA: "presión arterial 150/95", "TA 150/95", "150 sobre 95"
    const taMatch = text.match(/\b(?:ta|tensi[oó]n\s*arterial)\s*[:]?\s*(\d{2,3})\s*[\/\s]+(?:sobre\s*)?(\d{2,3})\b/i);
    if (taMatch) result.tension_arterial = `${taMatch[1]}/${taMatch[2]}`;

    // SpO2: "saturación 92%", "SpO2 92"
    const spo2Match = text.match(/\b(?:spo2|saturaci[oó]n)\s*[:]?\s*(\d{2,3})\b/i);
    if (spo2Match) result.saturacion_oxigeno = spo2Match[1];

    // Temperatura: "temperatura 38.5"
    const tempMatch = text.match(/\b(?:temperatura)\s*[:]?\s*(\d{2,3}\.?\d*)\b/i);
    if (tempMatch) result.temperatura = tempMatch[1];

    return result;
}

/**
 * Extrae la Escala de Glasgow
 */
function extractGlasgow(text) {
    const result = { ocular: null, verbal: null, motor: null, total: null };

    // Buscar Glasgow total
    const gcsMatch = text.match(/\b(?:glasgow|gcs)\s*[:]?\s*(\d{1,2})\b/i);
    if (gcsMatch) {
        result.total = parseInt(gcsMatch[1], 10);
        return result;
    }

    // Buscar componentes individuales
    const ocular = text.match(/\bocular\s*[:]?\s*(\d)\b/i);
    if (ocular) result.ocular = parseInt(ocular[1], 10);
    
    const verbal = text.match(/\bverbal\s*[:]?\s*(\d)\b/i);
    if (verbal) result.verbal = parseInt(verbal[1], 10);
    
    const motor = text.match(/\bmotor\s*[:]?\s*(\d)\b/i);
    if (motor) result.motor = parseInt(motor[1], 10);

    // Si tenemos los tres, calcular total
    if (result.ocular && result.verbal && result.motor) {
        result.total = result.ocular + result.verbal + result.motor;
    }

    return result;
}

/**
 * Extrae información demográfica (nombre, edad, sexo)
 */
function extractDemographic(text) {
    const result = { nombre: '', edad: '', sexo: '' };

    // Nombre: después de "paciente" o "nombre"
    const nombreMatch = text.match(/(?:paciente|nombre)\s+(?:de\s+)?([A-Za-záéíóúñ\s]+?)(?:\s+(?:de|con|que|y|,|\.|$))/i);
    if (nombreMatch) result.nombre = nombreMatch[1].trim();

    // Edad: número seguido de "años"
    const edadMatch = text.match(/\b(\d{1,3})\s*(años|año|edad)\b/i);
    if (edadMatch) result.edad = parseInt(edadMatch[1], 10);

    // Sexo
    if (/\b(masculino|hombre|varón|masculino)\b/i.test(text)) result.sexo = 'M';
    else if (/\b(femenino|mujer|femenino)\b/i.test(text)) result.sexo = 'F';

    return result;
}

/**
 * Extrae descripción de lesión
 */
function extractLesionDescription(text) {
    const keywords = [
        'trauma', 'herida', 'fractura', 'lesión', 'quemadura', 
        'golpe', 'contusión', 'torácico', 'craneal', 'abdominal',
        'laceración', 'desgarro', 'esguince', 'luxación'
    ];
    
    for (const kw of keywords) {
        const match = text.match(new RegExp(`[^.]*${kw}[^.]*\\.`, 'i'));
        if (match) {
            return match[0].trim();
        }
    }
    return '';
}

module.exports = { parseMedicalText };