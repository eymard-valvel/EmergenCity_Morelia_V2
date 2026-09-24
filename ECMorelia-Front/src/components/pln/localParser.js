// src/pln/localParser.js
// Parser local de dictado médico. Divide el texto por secciones,
// extrae valores y detecta comandos de acción.

import {
  NUMEROS_HABLADOS,
  ANCLAS_SECCION,
  VOCABULARIO,
  COMANDOS,
  ABREVIACIONES,
  CORRECCIONES_FONETICAS,
  SECCIONES_URGENTES
} from './glosario';

// ==================== NORMALIZACIÓN ====================

function reemplazarTodas(text, buscar, reemplazo) {
  return text.split(buscar).join(reemplazo);
}

// Convierte números hablados a dígitos. Maneja casos como
// "ciento veinte" -> "120", "treinta y cinco" -> "35".
function numerosADigitos(text) {
  let result = text.toLowerCase();

  // Correcciones fonéticas primero (frases completas)
  for (const [origen, destino] of Object.entries(CORRECCIONES_FONETICAS)) {
    result = reemplazarTodas(result, origen, destino);
  }

  // Decenas + unidades: "treinta y cinco" -> 35
  result = result.replace(
    /\b(veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)\s+y\s+(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/gi,
    (m, decena, unidad) => {
      const d = NUMEROS_HABLADOS[decena.toLowerCase()] || 0;
      const u = NUMEROS_HABLADOS[unidad.toLowerCase()] || 0;
      return String(d + u);
    }
  );

  // Centenas + decenas/unidades: "ciento veinte" -> 120, "doscientos cinco" -> 205
  result = result.replace(
    /\b(cien|ciento|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos)\s+(veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciséis|dieciseis|diecisiete|dieciocho|diecinueve)\b/gi,
    (m, centena, resto) => {
      const c = NUMEROS_HABLADOS[centena.toLowerCase()] || 0;
      const r = NUMEROS_HABLADOS[resto.toLowerCase()] || 0;
      return String(c + r);
    }
  );

  // Números solos
  const palabras = Object.keys(NUMEROS_HABLADOS).sort((a, b) => b.length - a.length);
  const regexPalabras = new RegExp(`\\b(${palabras.join('|')})\\b`, 'gi');
  result = result.replace(regexPalabras, (match) => {
    const num = NUMEROS_HABLADOS[match.toLowerCase()];
    return num !== undefined ? String(num) : match;
  });

  return result;
}

// Expande abreviaciones habladas a su forma completa para que el parser
// las reconozca.
function expandirAbreviaciones(text) {
  let result = text;
  for (const [abrev, completo] of Object.entries(ABREVIACIONES)) {
    const regex = new RegExp(`\\b${abrev}\\b`, 'gi');
    result = result.replace(regex, completo);
  }
  return result;
}

export function normalizarTexto(textoOriginal) {
  let t = textoOriginal
    .replace(/\s+/g, ' ')
    .replace(/[.,;](?=\s|$)/g, ',')
    .trim()
    .toLowerCase();

  t = numerosADigitos(t);
  t = expandirAbreviaciones(t);

  return t;
}

// ==================== DIVISIÓN POR SECCIONES ====================

function encontrarAnclas(texto) {
  const encontradas = [];

  for (const ancla of ANCLAS_SECCION) {
    for (const patron of ancla.patrones) {
      const regex = new RegExp(`\\b${patron}\\b`, 'gi');
      let match;
      while ((match = regex.exec(texto)) !== null) {
        encontradas.push({
          id: ancla.id,
          inicio: match.index,
          fin: match.index + match[0].length
        });
      }
    }
  }

  // Ordenar por posición y eliminar anclas solapadas (conservar la primera)
  encontradas.sort((a, b) => a.inicio - b.inicio);

  const sinSolape = [];
  let ultimoFin = -1;
  for (const a of encontradas) {
    if (a.inicio >= ultimoFin) {
      sinSolape.push(a);
      ultimoFin = a.fin;
    }
  }

  return sinSolape;
}

function dividirPorSecciones(texto) {
  const anclas = encontrarAnclas(texto);
  const secciones = {};

  if (anclas.length === 0) {
    // Sin anclas, todo va a "general"
    secciones.general = [texto];
    return secciones;
  }

  // Texto antes de la primera ancla
  if (anclas[0].inicio > 0) {
    const preambulo = texto.substring(0, anclas[0].inicio).trim();
    if (preambulo) secciones.general = [preambulo];
  }

  for (let i = 0; i < anclas.length; i++) {
    const inicio = anclas[i].fin;
    const fin = i + 1 < anclas.length ? anclas[i + 1].inicio : texto.length;
    const contenido = texto.substring(inicio, fin).trim();
    if (!contenido) continue;

    const id = anclas[i].id;
    if (!secciones[id]) secciones[id] = [];
    secciones[id].push(contenido);
  }

  return secciones;
}

// ==================== EXTRACTORES POR SECCIÓN ====================

function extraerSignosVitales(texto) {
  const result = {};

  // Frecuencia cardíaca
  const fcRegex = /(?:frecuencia cardiaca|pulso|latidos por minuto)\s*(?:de|en|es|:)?\s*(\d{2,3})/i;
  const fcMatch = texto.match(fcRegex);
  if (fcMatch) result.frecuencia_cardiaca = parseInt(fcMatch[1], 10);

  // Frecuencia respiratoria
  const frRegex = /(?:frecuencia respiratoria|respiraciones por minuto|respira)\s*(?:de|en|es|:)?\s*(\d{2,3})/i;
  const frMatch = texto.match(frRegex);
  if (frMatch) result.frecuencia_respiratoria = parseInt(frMatch[1], 10);

  // Tensión arterial (varios formatos)
  const taRegexes = [
    /(?:tension arterial|presion arterial)\s*(?:de|en|es|:)?\s*(\d{2,3})\s*(?:\/|sobre|por)\s*(\d{2,3})/i,
    /(?:tension|presion)\s*(?:de|en|es|:)?\s*(\d{2,3})\s*(?:\/|sobre|por)\s*(\d{2,3})/i,
    /\b(\d{2,3})\s*(?:\/|sobre|por)\s*(\d{2,3})\b/
  ];
  for (const rx of taRegexes) {
    const m = texto.match(rx);
    if (m) {
      result.tension_arterial = `${m[1]}/${m[2]}`;
      break;
    }
  }

  // Saturación
  const spo2Regex = /(?:saturacion de oxigeno|saturacion|spo2|oximetria)\s*(?:de|en|es|:)?\s*(\d{2,3})\s*(?:por ciento|%)?/i;
  const spo2Match = texto.match(spo2Regex);
  if (spo2Match) result.saturacion_oxigeno = parseInt(spo2Match[1], 10);

  // Temperatura
  const tempRegex = /(?:temperatura|temp)\s*(?:de|en|es|:)?\s*(\d{2}(?:\.\d+)?)/i;
  const tempMatch = texto.match(tempRegex);
  if (tempMatch) result.temperatura = parseFloat(tempMatch[1]);

  // Glucemia
  const gluRegex = /(?:glucemia|glucosa|dextro)\s*(?:de|en|es|:)?\s*(\d{2,3})/i;
  const gluMatch = texto.match(gluRegex);
  if (gluMatch) result.glucemia = parseInt(gluMatch[1], 10);

  return result;
}

function extraerGlasgow(texto) {
  const result = {};

  // Total
  const totalRegex = /(?:glasgow|escala de glasgow|gcs)\s*(?:de|en|es|:)?\s*(\d{1,2})/i;
  const totalMatch = texto.match(totalRegex);
  if (totalMatch) {
    const t = parseInt(totalMatch[1], 10);
    if (t >= 3 && t <= 15) result.total = t;
  }

  // Componentes
  const ocularRegex = /ocular\s*(?:de|en|es|:)?\s*(\d)/i;
  const ocularMatch = texto.match(ocularRegex);
  if (ocularMatch) result.ocular = parseInt(ocularMatch[1], 10);

  const verbalRegex = /verbal\s*(?:de|en|es|:)?\s*(\d)/i;
  const verbalMatch = texto.match(verbalRegex);
  if (verbalMatch) result.verbal = parseInt(verbalMatch[1], 10);

  const motorRegex = /motor\s*(?:de|en|es|:)?\s*(\d)/i;
  const motorMatch = texto.match(motorRegex);
  if (motorMatch) result.motor = parseInt(motorMatch[1], 10);

  return result;
}

function extraerDemografia(texto) {
  const result = {};

  // Edad
  const edadRegex = /(?:de\s+)?(\d{1,3})\s*(?:años|año)/i;
  const edadMatch = texto.match(edadRegex);
  if (edadMatch) result.edad = parseInt(edadMatch[1], 10);

  // Sexo
  if (/\b(masculino|hombre|varon|varón|niño|señor)\b/i.test(texto)) result.sexo = 'M';
  else if (/\b(femenino|mujer|niña|señora)\b/i.test(texto)) result.sexo = 'F';

  // Nombre (heurística simple: "paciente" seguido de nombre propio)
  const nombreRegex = /paciente\s+([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+){0,2})/i;
  const nombreMatch = texto.match(nombreRegex);
  if (nombreMatch) result.nombre = nombreMatch[1].trim();

  return result;
}

function extraerIntervenciones(texto) {
  const encontradas = [];

  for (const [clave, sinonimos] of Object.entries(VOCABULARIO)) {
    for (const sinonimo of sinonimos) {
      const regex = new RegExp(`\\b${sinonimo}\\b`, 'i');
      if (regex.test(texto)) {
        encontradas.push({
          tipo_intervencion: clave,
          descripcion: '',
          hora_intervencion: ''
        });
        break;
      }
    }
  }

  return encontradas;
}

function extraerMotivo(texto) {
  const limpio = texto
    .replace(/^(?:de urgencia|de consulta|principal)\s*/i, '')
    .trim();
  return { motivo_urgencia: limpio || '' };
}

function extraerLesiones(texto) {
  const limpio = texto.trim();
  return { descripcion_lesion: limpio || '' };
}

// ==================== DETECCIÓN DE COMANDOS ====================

function detectarComandos(textoNormalizado) {
  const acciones = [];

  for (const [accion, frases] of Object.entries(COMANDOS)) {
    for (const frase of frases) {
      const regex = new RegExp(`\\b${frase}\\b`, 'i');
      if (regex.test(textoNormalizado)) {
        acciones.push(accion);
        break;
      }
    }
  }

  return [...new Set(acciones)];
}

// ==================== API PÚBLICA ====================

/**
 * Analiza un fragmento de texto dictado y devuelve las secciones detectadas,
 * las acciones solicitadas y qué secciones urgentes están completas.
 */
export function parseTextLocal(rawText) {
  if (!rawText || !rawText.trim()) {
    return {
      secciones: {},
      acciones: [],
      seccionesCompletas: [],
      textoNormalizado: '',
      textoOriginal: ''
    };
  }

  const textoNormalizado = normalizarTexto(rawText);
  const acciones = detectarComandos(textoNormalizado);
  const seccionesCrudas = dividirPorSecciones(textoNormalizado);

  // Procesar cada sección con su extractor correspondiente
  const secciones = {};

  if (seccionesCrudas.signos) {
    const acumulado = seccionesCrudas.signos.join(' ');
    secciones.signos = extraerSignosVitales(acumulado);
  }

  if (seccionesCrudas.glasgow) {
    const acumulado = seccionesCrudas.glasgow.join(' ');
    secciones.glasgow = extraerGlasgow(acumulado);
  }

  if (seccionesCrudas.demografia || seccionesCrudas.general) {
    const acumulado = [
      ...(seccionesCrudas.demografia || []),
      ...(seccionesCrudas.general || [])
    ].join(' ');
    secciones.demografia = extraerDemografia(acumulado);
  }

  if (seccionesCrudas.intervenciones) {
    const acumulado = seccionesCrudas.intervenciones.join(' ');
    secciones.intervenciones = extraerIntervenciones(acumulado);
  }

  if (seccionesCrudas.motivo) {
    const acumulado = seccionesCrudas.motivo.join(' ');
    secciones.motivo = extraerMotivo(acumulado);
  }

  if (seccionesCrudas.lesiones) {
    const acumulado = seccionesCrudas.lesiones.join(' ');
    secciones.lesiones = extraerLesiones(acumulado);
  }

  if (seccionesCrudas.destino) {
    secciones.destino = { texto: seccionesCrudas.destino.join(' ') };
  }

  // Detectar qué secciones urgentes tienen datos
  const seccionesCompletas = [];
  for (const id of SECCIONES_URGENTES) {
    const sec = secciones[id];
    if (!sec) continue;
    const tieneDatos = Object.values(sec).some(v =>
      v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)
    );
    if (tieneDatos) seccionesCompletas.push(id);
  }

  return {
    secciones,
    acciones,
    seccionesCompletas,
    textoNormalizado,
    textoOriginal: rawText
  };
}