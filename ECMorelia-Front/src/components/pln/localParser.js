/**
 * localParser.js - Extracción de datos médicos con expresiones regulares optimizadas
 * Vocabulario ampliado para cubrir terminología médica común en emergencias
 */
export function parseTextLocal(text) {
  const lowerText = text.toLowerCase();
  const result = {
    paciente: { nombre: '', edad: '', sexo: '' },
    signos_vitales: {
      frecuencia_cardiaca: '',
      frecuencia_respiratoria: '',
      tension_arterial: '',
      saturacion_oxigeno: '',
      temperatura: '',
    },
    glasgow: { ocular: null, verbal: null, motor: null, total: null },
    motivo_urgencia: '',
    descripcion_lesion: '',
    hallazgos_escena: text,
    intervenciones: [],
  };

  // --- 1. EDAD ---
  const edadMatch = text.match(/\b(\d{1,3})\s*(años|año|edad)\b/i);
  if (edadMatch) result.paciente.edad = parseInt(edadMatch[1], 10);

  // --- 2. SEXO ---
  if (/\b(masculino|hombre|varón)\b/i.test(text)) result.paciente.sexo = 'M';
  else if (/\b(femenino|mujer)\b/i.test(text)) result.paciente.sexo = 'F';

  // --- 3. NOMBRE (mejorado) ---
  // Busca "paciente [Nombre]" o "nombre [Nombre]" y captura hasta la coma o punto
  const nombreMatch = text.match(/(?:paciente|nombre)\s+(?:de\s+)?([A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)(?:\s*(?:,|\.|;|$))/i);
  if (nombreMatch) {
    result.paciente.nombre = nombreMatch[1].trim();
  } else {
    // Intenta capturar nombre si aparece al inicio del texto (ej. "Carlos Alberto 62 años...")
    const inicioMatch = text.match(/^([A-Za-záéíóúñÁÉÍÓÚÑ\s]{2,})\s+\d{1,3}\s*años/i);
    if (inicioMatch) result.paciente.nombre = inicioMatch[1].trim();
  }

  // --- 4. MOTIVO DE URGENCIA (mejorado) ---
  const motivoPatterns = [
    /(?:motivo\s+(?:de\s+)?(?:urgencia|consulta|ingreso)\s*(?:por\s*)?)([A-Za-záéíóúñÁÉÍÓÚÑ\s,;]+?)(?:\.|,|$)/i,
    /(?:por\s+(?:presentar|tener|con)\s+)([A-Za-záéíóúñÁÉÍÓÚÑ\s,;]+?)(?:\.|,|$)/i,
    /(?:dolor|fiebre|trauma|accidente|caída|quemadura|intoxicación)\s+([A-Za-záéíóúñÁÉÍÓÚÑ\s,;]+?)(?:\.|,|$)/i,
    /(?:dificultad\s+respiratoria|dificultad\s+para\s+respirar)/i, // si no hay más contexto
  ];
  for (const pattern of motivoPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.motivo_urgencia = match[1] ? match[1].trim() : match[0].trim();
      break;
    }
  }
  // Si no se encontró, intentar capturar desde "por" o "con"
  if (!result.motivo_urgencia) {
    const fallback = text.match(/(?:por|con)\s+([A-Za-záéíóúñÁÉÍÓÚÑ\s,;]{5,}?)(?:\.|,|$)/i);
    if (fallback) result.motivo_urgencia = fallback[1].trim();
  }

  // --- 5. DESCRIPCIÓN DE LESIÓN (mejorado) ---
  const lesionPatterns = [
    /(?:lesión|trauma|herida|fractura|quemadura|contusión|hematoma)\s+(?:de|en|por)\s+([A-Za-záéíóúñÁÉÍÓÚÑ\s,;]+?)(?:\.|,|$)/i,
    /(?:trauma\s+(?:torácico|abdominal|craneal|encefálico|cerrado|abierto))/i,
    /(?:herida\s+(?:por\s+)?(?:arma\s+blanca|punzante|cortante|bala))/i,
  ];
  for (const pattern of lesionPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.descripcion_lesion = match[1] ? match[1].trim() : match[0].trim();
      break;
    }
  }

  // --- 6. SIGNOS VITALES ---
  // FC
  const fcMatch = text.match(/\b(?:fc|frecuencia\s*card[ií]aca)\s*[:]?\s*(\d{2,3})\b/i);
  if (fcMatch) result.signos_vitales.frecuencia_cardiaca = fcMatch[1];
  // FR
  const frMatch = text.match(/\b(?:fr|frecuencia\s*respiratoria)\s*[:]?\s*(\d{2,3})\b/i);
  if (frMatch) result.signos_vitales.frecuencia_respiratoria = frMatch[1];
  // TA (presión arterial) - soporta "150/95" o "150 sobre 95"
  const taMatch = text.match(/\b(?:ta|tensi[oó]n\s*arterial)\s*[:]?\s*(\d{2,3})\s*[/\s]+(\d{2,3})\b/i);
  if (taMatch) result.signos_vitales.tension_arterial = `${taMatch[1]}/${taMatch[2]}`;
  // SpO2 - soporta "92%" o "92 por ciento"
  const spo2Match = text.match(/\b(?:spo2|saturaci[oó]n\s*(?:de\s*)?ox[ií]geno)\s*[:]?\s*(\d{2,3})\s*%/i);
  if (!spo2Match) {
    // fallback: buscar número seguido de "por ciento" o "%"
    const spo2Fallback = text.match(/\b(\d{2,3})\s*(?:%|por\s*ciento)\b/i);
    if (spo2Fallback) result.signos_vitales.saturacion_oxigeno = spo2Fallback[1];
  } else {
    result.signos_vitales.saturacion_oxigeno = spo2Match[1];
  }
  // Temperatura
  const tempMatch = text.match(/\b(?:temperatura)\s*[:]?\s*(\d{2,3}\.?\d*)\b/i);
  if (tempMatch) result.signos_vitales.temperatura = tempMatch[1];

  // --- 7. GLASGOW ---
  const gcsVariants = [
    /\bglasgow\s*[:]?\s*(\d{1,2})\b/i,
    /\bgcs\s*[:]?\s*(\d{1,2})\b/i,
  ];
  let gcsTotal = null;
  for (const regex of gcsVariants) {
    const match = text.match(regex);
    if (match) {
      gcsTotal = parseInt(match[1], 10);
      break;
    }
  }
  if (gcsTotal) {
    result.glasgow.total = gcsTotal;
  } else {
    // Buscar ocular, verbal, motor (pueden aparecer como "ocular 3", "verbal 4", "motor 5")
    const ocular = text.match(/\b(?:ocular)\s*[:]?\s*(\d)\b/i);
    if (ocular) result.glasgow.ocular = parseInt(ocular[1], 10);
    const verbal = text.match(/\b(?:verbal|verdual)\s*[:]?\s*(\d)\b/i);
    if (verbal) result.glasgow.verbal = parseInt(verbal[1], 10);
    const motor = text.match(/\b(?:motor)\s*[:]?\s*(\d)\b/i);
    if (motor) result.glasgow.motor = parseInt(motor[1], 10);
    if (result.glasgow.ocular && result.glasgow.verbal && result.glasgow.motor) {
      result.glasgow.total = result.glasgow.ocular + result.glasgow.verbal + result.glasgow.motor;
    }
  }

  // --- 8. INTERVENCIONES (solo palabras clave, no texto completo) ---
  const keywords = [
    'oxigenoterapia', 'oxígeno', 'oxigeno', 'intubación', 'ventilación', 'desfibrilación',
    'rccp', 'masaje cardiaco', 'masaje cardíaco', 'vendaje', 'inmovilización', 'férula',
    'catéter', 'sonda', 'drenaje', 'aspiración', 'medicación', 'vía intravenosa',
    'suero', 'suero fisiológico', 'glucosa', 'adrenalina', 'atropina', 'naloxona',
    'amiodarona', 'lidocaína', 'fentanilo', 'morfina', 'ketamina', 'midazolam',
    'lorazepam', 'diazepam', 'bicarbonato', 'calcio', 'potasio', 'magnesio',
    'colocación de vía', 'canalización', 'acceso venoso', 'venopunción'
  ];
  const found = [];
  for (const kw of keywords) {
    // Usamos una expresión regular para asegurar que la palabra esté completa y no dentro de otra
    const regex = new RegExp('\\b' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (regex.test(text)) {
      // Si ya está agregada, no duplicar
      if (!found.includes(kw)) found.push(kw);
    }
  }
  // Si se menciona "oxigenoterapia" pero no "oxígeno", igual se agrega como "Oxigenoterapia"
  // Pero también podemos agregar "oxígeno" si aparece la palabra
  // Para simplificar, solo agregamos las que se encontraron exactamente
  result.intervenciones = found;

  // Si no se encontraron intervenciones pero se menciona "se administró", podríamos buscar frases
  if (found.length === 0) {
    // Intentar extraer frases como "se administró oxigenoterapia"
    const adminMatch = text.match(/se\s+administr(?:ó|o)\s+([A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)(?:\.|,|$)/i);
    if (adminMatch) {
      const phrase = adminMatch[1].trim();
      // Dividir por comas o "y" para obtener posibles intervenciones
      const parts = phrase.split(/\s*y\s*|\s*,\s*/);
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.length > 0 && !found.includes(trimmed)) {
          found.push(trimmed);
        }
      }
    }
  }

  return result;
}