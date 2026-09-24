import { VOCABULARIO, COMANDOS } from './glosario';

export const CLAVE_OPCION = 'emergencity_bert';

const MODELOS = {
  sentimiento: 'Xenova/distilbert-base-multilingual-cased-sentiments-student',
  similaridad: 'Xenova/multilingual-e5-small',
  ner: 'Xenova/bert-base-multilingual-cased-ner-hrl'
};

const TAREAS = {
  sentimiento: 'text-classification',
  similaridad: 'feature-extraction',
  ner: 'token-classification'
};

const PLANTILLAS_SECCION = {
  motivo: 'El motivo de urgencia o motivo de consulta es un dolor que presenta el paciente al acudir',
  signos: 'Los signos vitales del paciente son frecuencia cardiaca, frecuencia respiratoria, tension arterial, saturacion y temperatura',
  glasgow: 'La escala de coma de Glasgow mide apertura ocular, respuesta verbal y respuesta motora con un total de puntos',
  lesiones: 'El paciente presenta una lesion descrita como herida, fractura, trauma o quemadura',
  intervenciones: 'Se le administro oxigeno, se coloco via intravenosa, se realizaron maniobras rcp e inmovilizacion',
  demografia: 'Los datos del paciente son nombre, edad en anos y sexo masculino o femenino',
  destino: 'El paciente se traslada a un hospital destino de la ciudad para su atencion'
};

let modulo = null;
let cargaEnCurso = null;
const pipelines = {};
const fallos = {};

function enNavegador() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function esClienteLigero() {
  if (typeof navigator === 'undefined') return false;
  const conexion = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conexion && conexion.saveData) return true;
  if (conexion && conexion.effectiveType && /^(slow-2g|2g)$/.test(conexion.effectiveType)) return true;
  if (navigator.deviceMemory && navigator.deviceMemory < 4) return true;
  return false;
}

export function bertHabilitado() {
  if (!enNavegador()) return false;
  const guardado = localStorage.getItem(CLAVE_OPCION);
  if (guardado === '0') return false;
  if (guardado === '1') return true;
  return !esClienteLigero();
}

export function setBertOpcion(activo) {
  if (!enNavegador()) return;
  localStorage.setItem(CLAVE_OPCION, activo ? '1' : '0');
}

export function getEstadoBert() {
  const habilitado = bertHabilitado();
  return {
    habilitado,
    ligero: esClienteLigero(),
    cargando: !!(cargaEnCurso || Object.keys(pipelines).length === 0) && habilitado,
    listo: Object.keys(pipelines).length > 0,
    modelos: {
      sentimiento: !!pipelines.sentimiento,
      similaridad: !!pipelines.similaridad,
      ner: !!pipelines.ner
    },
    fallos: { ...fallos }
  };
}

async function cargarModulo() {
  if (modulo) return modulo;
  if (!cargaEnCurso) {
    cargaEnCurso = import('@huggingface/transformers')
      .then((m) => {
        modulo = m;
        return m;
      })
      .finally(() => {
        cargaEnCurso = null;
      });
  }
  return cargaEnCurso;
}

async function obtenerPipeline(tarea) {
  if (pipelines[tarea]) return pipelines[tarea];
  if (fallos[tarea]) return null;
  try {
    const { pipeline } = await cargarModulo();
    pipelines[tarea] = await pipeline(TAREAS[tarea], MODELOS[tarea], {});
    return pipelines[tarea];
  } catch (_) {
    fallos[tarea] = true;
    return null;
  }
}

function productoPunto(a, b) {
  let suma = 0;
  for (let i = 0; i < a.length; i++) suma += a[i] * b[i];
  return suma;
}

function norma(v) {
  return Math.sqrt(productoPunto(v, v));
}

export function coseno(a, b) {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  const na = norma(a);
  const nb = norma(b);
  if (na === 0 || nb === 0) return 0;
  return productoPunto(a, b) / (na * nb);
}

async function obtenerEmbedding(texto, prefijo) {
  const pipe = await obtenerPipeline('similaridad');
  if (!pipe) return null;
  const salida = await pipe((prefijo || '') + texto, {
    pooling: 'mean',
    normalize: true
  });
  return Array.from(salida.data);
}

async function analizarSentimiento(texto) {
  const pipe = await obtenerPipeline('sentimiento');
  if (!pipe) return null;
  const [resultado] = await pipe(texto.substring(0, 400));
  const etiqueta = (resultado.label || '').toLowerCase();
  const traduccion = {
    positive: 'positivo',
    neutral: 'neutro',
    negative: 'negativo'
  };
  return {
    valor: traduccion[etiqueta] || etiqueta || 'neutro',
    label: etiqueta,
    confianza: Math.round((resultado.score || 0) * 1000) / 1000
  };
}

async function confianzaPorSeccion(texto) {
  const pipe = await obtenerPipeline('similaridad');
  if (!pipe) return null;
  const vectorTexto = await obtenerEmbedding(texto, 'query: ');
  if (!vectorTexto) return null;

  const resultado = {};
  let principal = null;
  let max = -1;

  for (const [seccion, plantilla] of Object.entries(PLANTILLAS_SECCION)) {
    const vectorPlantilla = await obtenerEmbedding(plantilla, 'passage: ');
    const similitud = coseno(vectorTexto, vectorPlantilla);
    resultado[seccion] = Math.round(similitud * 1000) / 1000;
    if (similitud > max) {
      max = similitud;
      principal = seccion;
    }
  }

  return { confianza: resultado, principal };
}

async function extraerEntidadesNER(texto) {
  const pipe = await obtenerPipeline('ner');
  if (!pipe) return null;
  const resultado = await pipe(texto.substring(0, 500), { aggregation_strategy: 'simple' });
  const personas = [];
  const ubicaciones = [];
  const organizaciones = [];
  const fechas = [];

  for (const entidad of resultado || []) {
    if (!entidad.entity_group || (entidad.score || 0) < 0.6) continue;
    const palabra = (entidad.word || '').replace(/^##/, '');
    const etiqueta = entidad.entity_group;
    if (etiqueta === 'PER') personas.push(palabra);
    else if (etiqueta === 'LOC') ubicaciones.push(palabra);
    else if (etiqueta === 'ORG') organizaciones.push(palabra);
    else if (etiqueta === 'DATE') fechas.push(palabra);
  }

  return {
    nombres: [...new Set(personas)],
    ubicaciones: [...new Set(ubicaciones)],
    organizaciones: [...new Set(organizaciones)],
    fechas: [...new Set(fechas)]
  };
}

function entidadesMedicas(texto) {
  const encontradas = [];
  for (const [clave, sinonimos] of Object.entries(VOCABULARIO)) {
    for (const sinonimo of sinonimos) {
      const regex = new RegExp(`\\b${sinonimo}\\b`, 'i');
      if (regex.test(texto)) {
        encontradas.push(clave);
        break;
      }
    }
  }
  return [...new Set(encontradas)];
}

export async function encontrarSimilares(frase, candidatas, tope) {
  const pipe = await obtenerPipeline('similaridad');
  if (!pipe) return [];
  const vectorFrase = await obtenerEmbedding(frase, 'query: ');
  if (!vectorFrase) return [];

  const conSimilitud = [];
  for (const candidata of candidatas) {
    const vectorCandidata = await obtenerEmbedding(candidata, 'passage: ');
    conSimilitud.push({
      texto: candidata,
      similitud: Math.round(coseno(vectorFrase, vectorCandidata) * 1000) / 1000
    });
  }

  conSimilitud.sort((a, b) => b.similitud - a.similitud);
  if (tope && tope > 0) return conSimilitud.slice(0, tope);
  return conSimilitud;
}

export async function detectarComandoSemantico(texto) {
  const frasesTotal = [];
  for (const sinonimos of Object.values(COMANDOS)) {
    frasesTotal.push(...sinonimos);
  }
  const similares = await encontrarSimilares(texto, frasesTotal, 1);
  if (similares.length > 0 && similares[0].similitud > 0.55) {
    const encontrada = similares[0].texto;
    for (const [accion, frases] of Object.entries(COMANDOS)) {
      if (frases.includes(encontrada)) return accion;
    }
  }
  return null;
}

export async function enriquecer(texto, resultadoBase, opciones) {
  if (!bertHabilitado() || !texto || !texto.trim()) {
    return { ...resultadoBase, bert: { habilitado: false, fuentes: ['regex'] } };
  }

  const usaLigero = esClienteLigero();
  const usarNer = opciones?.ner !== false && !usaLigero;
  const textoRecortado = texto.trim();

  const tareas = [
    analizarSentimiento(textoRecortado),
    confianzaPorSeccion(textoRecortado)
  ];
  if (usarNer) tareas.push(extraerEntidadesNER(textoRecortado));

  const [sentimiento, secciones, entidadesNER] = await Promise.all(tareas);

  const entidades = {
    ...(entidadesNER || { nombres: [], ubicaciones: [], organizaciones: [], fechas: [] }),
    medicas: entidadesMedicas(textoRecortado)
  };

  const comando = await detectarComandoSemantico(textoRecortado);

  const fuentes = [...new Set([...(resultadoBase?.nlpFuentes || []), 'bert'])];
  if (fallos.similaridad) fuentes.push('sin_similaridad');
  if (fallos.sentimiento) fuentes.push('sin_sentimiento');
  if (fallos.ner) fuentes.push('sin_ner');

  return {
    ...resultadoBase,
    acciones: comando && !(resultadoBase?.acciones || []).includes(comando)
      ? [...(resultadoBase?.acciones || []), comando]
      : (resultadoBase?.acciones || []),
    nlpFuentes: fuentes,
    bert: {
      habilitado: true,
      ligero: usaLigero,
      sentimiento,
      seccionPrincipal: secciones?.principal || null,
      confianzaSecciones: secciones?.confianza || {},
      entidades,
      comandoSemantico: comando
    }
  };
}