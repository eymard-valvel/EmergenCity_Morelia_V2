const compromise = require('compromise');

function parse(text) {
  const doc = compromise(text);
  const result = {
    paciente: { nombre: '', edad: '', sexo: '' },
    signos_vitales: { frecuencia_cardiaca: '', frecuencia_respiratoria: '', tension_arterial: '', saturacion_oxigeno: '', temperatura: '' },
    glasgow: { ocular: null, verbal: null, motor: null, total: null },
    motivo_urgencia: '',
    descripcion_lesion: '',
    hallazgos_escena: '',
    // ... otros campos que se puedan extraer
  };

  // --- 1. Extraer edad ---
  const edadMatch = text.match(/\b(\d{1,3})\s*(años|año|edad)\b/i);
  if (edadMatch) {
    result.paciente.edad = parseInt(edadMatch[1], 10);
  }

  // --- 2. Extraer sexo ---
  if (/\b(masculino|hombre|varón)\b/i.test(text)) {
    result.paciente.sexo = 'M';
  } else if (/\b(femenino|mujer)\b/i.test(text)) {
    result.paciente.sexo = 'F';
  }

  // --- 3. Extraer nombre (palabras después de "paciente" o "nombre") ---
  const nombreMatch = text.match(/(?:paciente|nombre)\s+(?:de\s+)?([A-Za-záéíóúñ\s]+?)(?:\s+(?:de|con|que|y|,)|$)/i);
  if (nombreMatch) {
    result.paciente.nombre = nombreMatch[1].trim();
  }

  // --- 4. Extraer signos vitales (valores numéricos) ---
  // Frecuencia cardíaca: "FC 80" o "frecuencia cardíaca 80"
  const fcMatch = text.match(/(?:fc|frecuencia\s*card[ií]aca)\s*[:]?\s*(\d{2,3})/i);
  if (fcMatch) result.signos_vitales.frecuencia_cardiaca = fcMatch[1];

  const frMatch = text.match(/(?:fr|frecuencia\s*respiratoria)\s*[:]?\s*(\d{2,3})/i);
  if (frMatch) result.signos_vitales.frecuencia_respiratoria = frMatch[1];

  const taMatch = text.match(/(?:ta|tensi[oó]n\s*arterial)\s*[:]?\s*(\d{2,3})\s*\/\s*(\d{2,3})/i);
  if (taMatch) {
    result.signos_vitales.tension_arterial = `${taMatch[1]}/${taMatch[2]}`;
  }

  const spo2Match = text.match(/(?:spo2|saturaci[oó]n)\s*[:]?\s*(\d{2,3})/i);
  if (spo2Match) result.signos_vitales.saturacion_oxigeno = spo2Match[1];

  const tempMatch = text.match(/(?:temperatura)\s*[:]?\s*(\d{2,3}\.?\d*)/i);
  if (tempMatch) result.signos_vitales.temperatura = tempMatch[1];

  // --- 5. Extraer Glasgow ---
  // Buscar "Glasgow 14" o "ocular 4 verbal 5 motor 6"
  const gcsTotal = text.match(/\bglasgow\s*[:]?\s*(\d{1,2})\b/i);
  if (gcsTotal) {
    const total = parseInt(gcsTotal[1], 10);
    result.glasgow.total = total;
    // Asignar valores típicos (no exactos) si solo se da el total
    // Podríamos deducir aproximaciones, pero mejor dejar en null
  } else {
    // Buscar puntuaciones individuales
    const ocular = text.match(/\bocular\s*[:]?\s*(\d)\b/i);
    if (ocular) result.glasgow.ocular = parseInt(ocular[1], 10);
    const verbal = text.match(/\bverbal\s*[:]?\s*(\d)\b/i);
    if (verbal) result.glasgow.verbal = parseInt(verbal[1], 10);
    const motor = text.match(/\bmotor\s*[:]?\s*(\d)\b/i);
    if (motor) result.glasgow.motor = parseInt(motor[1], 10);
    // Si tenemos los tres, calcular total
    if (result.glasgow.ocular && result.glasgow.verbal && result.glasgow.motor) {
      result.glasgow.total = result.glasgow.ocular + result.glasgow.verbal + result.glasgow.motor;
    }
  }

  // --- 6. Motivo de urgencia (frase después de "motivo" o "por") ---
  const motivoMatch = text.match(/(?:motivo|por)\s+(?:de\s+)?([A-Za-záéíóúñ\s]+?)(?:\.|,|$)/i);
  if (motivoMatch) {
    result.motivo_urgencia = motivoMatch[1].trim();
  }

  // --- 7. Descripción de lesión (si menciona "lesión" o "trauma") ---
  const lesionMatch = text.match(/(?:lesión|trauma|herida)\s+([A-Za-záéíóúñ\s]+?)(?:\.|,|$)/i);
  if (lesionMatch) {
    result.descripcion_lesion = lesionMatch[1].trim();
  }

  // --- 8. Hallazgos de escena (todo lo que sobre) ---
  // Guardamos el texto completo como hallazgos, o podemos extraer frases relevantes
  result.hallazgos_escena = text;

  return result;
}

module.exports = { parse };