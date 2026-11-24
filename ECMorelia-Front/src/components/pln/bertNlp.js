import { COMANDOS } from './glosario';

export const CLAVE_OPCION = 'emergencity_bert';

const MODELO = 'Xenova/multilingual-e5-small';
const UMBRAL_COMANDO = 0.88;
const MARGEN_COMANDO = 0.03;
const MAX_PALABRAS_COMANDO = 7;

let modulo = null;
let cargaModulo = null;
let pipelineSimilaridad = null;
let cargaPipeline = null;
let fallo = false;
const cacheEmbeddings = new Map();

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
  return localStorage.getItem(CLAVE_OPCION) === '1';
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
    cargando: habilitado && !!cargaPipeline,
    listo: !!pipelineSimilaridad,
    modelos: { sentimiento: false, similaridad: !!pipelineSimilaridad, ner: false },
    fallos: fallo ? { similaridad: true } : {}
  };
}

async function obtenerPipeline() {
  if (pipelineSimilaridad) return pipelineSimilaridad;
  if (fallo) return null;
  if (!cargaPipeline) {
    cargaPipeline = (async () => {
      try {
        if (!modulo) {
          cargaModulo = cargaModulo || import('@huggingface/transformers');
          modulo = await cargaModulo;
        }
        pipelineSimilaridad = await modulo.pipeline('feature-extraction', MODELO, {});
        return pipelineSimilaridad;
      } catch (_) {
        fallo = true;
        return null;
      } finally {
        cargaPipeline = null;
      }
    })();
  }
  return cargaPipeline;
}

const productoPunto = (a, b) => {
  let suma = 0;
  for (let i = 0; i < a.length; i++) suma += a[i] * b[i];
  return suma;
};

export function coseno(a, b) {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  const na = Math.sqrt(productoPunto(a, a));
  const nb = Math.sqrt(productoPunto(b, b));
  if (na === 0 || nb === 0) return 0;
  return productoPunto(a, b) / (na * nb);
}

async function obtenerEmbedding(texto, prefijo) {
  const llave = `${prefijo}${texto}`;
  if (cacheEmbeddings.has(llave)) return cacheEmbeddings.get(llave);
  const pipe = await obtenerPipeline();
  if (!pipe) return null;
  const salida = await pipe(llave, { pooling: 'mean', normalize: true });
  const vector = Array.from(salida.data);
  cacheEmbeddings.set(llave, vector);
  return vector;
}

export async function encontrarSimilares(frase, candidatas, tope) {
  const vectorFrase = await obtenerEmbedding(frase, 'query: ');
  if (!vectorFrase) return [];
  const resultado = [];
  for (const candidata of candidatas) {
    const vector = await obtenerEmbedding(candidata, 'passage: ');
    if (!vector) continue;
    resultado.push({ texto: candidata, similitud: Math.round(coseno(vectorFrase, vector) * 1000) / 1000 });
  }
  resultado.sort((a, b) => b.similitud - a.similitud);
  return tope && tope > 0 ? resultado.slice(0, tope) : resultado;
}

export async function detectarComandoSemantico(texto) {
  if (!bertHabilitado() || !texto) return null;
  if (texto.trim().split(/\s+/).length > MAX_PALABRAS_COMANDO) return null;
  const frases = Object.values(COMANDOS).flat();
  const similares = await encontrarSimilares(texto, frases, 2);
  if (!similares.length || similares[0].similitud < UMBRAL_COMANDO) return null;
  if (similares[1] && similares[0].similitud - similares[1].similitud < MARGEN_COMANDO) {
    const accionA = accionDe(similares[0].texto);
    const accionB = accionDe(similares[1].texto);
    if (accionA !== accionB) return null;
  }
  return accionDe(similares[0].texto);
}

function accionDe(frase) {
  for (const [accion, frases] of Object.entries(COMANDOS)) if (frases.includes(frase)) return accion;
  return null;
}

export async function enriquecer(texto, resultadoBase) {
  if (!bertHabilitado() || !texto || !texto.trim()) {
    return { ...resultadoBase, bert: { habilitado: false, fuentes: ['regex'] } };
  }
  const comando = await detectarComandoSemantico(texto);
  const fuentes = [...new Set([...(resultadoBase?.nlpFuentes || []), 'bert'])];
  if (fallo) fuentes.push('sin_similaridad');
  return {
    ...resultadoBase,
    acciones: comando && !(resultadoBase?.acciones || []).includes(comando) ? [...(resultadoBase?.acciones || []), comando] : resultadoBase?.acciones || [],
    nlpFuentes: fuentes,
    bert: { habilitado: true, ligero: esClienteLigero(), comandoSemantico: comando }
  };
}