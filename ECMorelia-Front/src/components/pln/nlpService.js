import { parseTextLocal } from './localParser';
import { enriquecer } from './bertNlp';

export { getEstadoBert, setBertOpcion } from './bertNlp';

const API_URL = import.meta.env.VITE_API || 'http://localhost:3000/api';
const TIMEOUT_MS = 2500;
const PAUSA_FALLO_MS = 60000;

let backendPausadoHasta = 0;

const vacio = () => ({
  secciones: {},
  acciones: [],
  seccionesCompletas: [],
  textoNormalizado: '',
  textoOriginal: '',
  nlpFuentes: []
});

async function consultarBackend(local, text) {
  if (Date.now() < backendPausadoHasta) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}/nlp/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: local.textoNormalizado || text, textoOriginal: text }),
      signal: controller.signal
    });
    if (!response.ok) {
      backendPausadoHasta = Date.now() + PAUSA_FALLO_MS;
      return null;
    }
    return await response.json();
  } catch (_) {
    backendPausadoHasta = Date.now() + PAUSA_FALLO_MS;
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function parseText(text, opciones = {}) {
  if (!text || !text.trim()) return vacio();

  const local = parseTextLocal(text);
  if (opciones.backend === false) return local;

  const backend = await consultarBackend(local, text);
  if (!backend) return local;

  try {
    return fusionarResultados(local, backend);
  } catch (_) {
    return local;
  }
}

export async function parseTextConBert(text, opciones) {
  const base = await parseText(text, opciones);
  return enriquecer(base.textoNormalizado || text, base, opciones);
}

function mapearFormatoMedico(backend, localBase) {
  const secciones = { ...(backend.secciones || {}) };

  if (!secciones.demografia && backend.paciente) {
    const p = backend.paciente;
    if (p.nombre || p.edad !== undefined || p.sexo) {
      secciones.demografia = {
        nombre: p.nombre || '',
        edad: p.edad === '' ? null : p.edad,
        sexo: p.sexo || ''
      };
    }
  }

  if (!secciones.signos && backend.signos_vitales) {
    const sv = {};
    const src = backend.signos_vitales;
    for (const k of ['frecuencia_cardiaca', 'frecuencia_respiratoria', 'tension_arterial', 'saturacion_oxigeno', 'temperatura']) {
      if (src[k] !== undefined && src[k] !== '') sv[k] = src[k];
    }
    if (Object.keys(sv).length > 0) secciones.signos = sv;
  }

  if (!secciones.glasgow && backend.glasgow) {
    const g = {};
    for (const k of ['ocular', 'verbal', 'motor', 'total']) {
      if (backend.glasgow[k] !== undefined && backend.glasgow[k] !== null) g[k] = backend.glasgow[k];
    }
    if (Object.keys(g).length > 0) secciones.glasgow = g;
  }

  if (!secciones.motivo && backend.motivo_urgencia && backend.motivo_urgencia.trim()) {
    secciones.motivo = { motivo_urgencia: backend.motivo_urgencia.trim() };
  }

  if (!secciones.lesiones && backend.descripcion_lesion && backend.descripcion_lesion.trim()) {
    secciones.lesiones = { descripcion_lesion: backend.descripcion_lesion.trim() };
  }

  if (!secciones.intervenciones && Array.isArray(backend.intervenciones) && backend.intervenciones.length > 0) {
    secciones.intervenciones = backend.intervenciones.filter((iv) => iv && iv.tipo_intervencion);
  }

  return {
    secciones,
    acciones: [...new Set([...(backend.acciones || []), ...(localBase?.acciones || [])])],
    seccionesCompletas: [...new Set([...(backend.seccionesCompletas || []), ...(localBase?.seccionesCompletas || [])])],
    textoNormalizado: backend.textoNormalizado || localBase?.textoNormalizado || '',
    textoOriginal: backend.textoOriginal || localBase?.textoOriginal || '',
    nlpFuentes: Array.from(new Set([...(backend.nlpFuentes || []), 'local']))
  };
}

const esVacio = (v) => v === '' || v === null || v === undefined || (Array.isArray(v) && v.length === 0);

function fusionarResultados(local, backend) {
  const backendEsMedico = !!(
    backend &&
    (backend.paciente || backend.signos_vitales || backend.motivo_urgencia || backend.descripcion_lesion || backend.intervenciones)
  );
  const normalizado = backendEsMedico
    ? mapearFormatoMedico(backend, local)
    : {
        secciones: backend.secciones || {},
        acciones: backend.acciones || [],
        seccionesCompletas: backend.seccionesCompletas || [],
        textoNormalizado: backend.textoNormalizado || local.textoNormalizado,
        textoOriginal: backend.textoOriginal || local.textoOriginal,
        nlpFuentes: Array.from(new Set([...(backend.nlpFuentes || []), 'local']))
      };

  const fusionado = {
    secciones: { ...local.secciones },
    acciones: [...new Set([...(local.acciones || []), ...(normalizado.acciones || [])])],
    seccionesCompletas: [...new Set([...(local.seccionesCompletas || []), ...(normalizado.seccionesCompletas || [])])],
    textoNormalizado: local.textoNormalizado || normalizado.textoNormalizado,
    textoOriginal: local.textoOriginal || normalizado.textoOriginal,
    nlpFuentes: Array.from(new Set([...(local.nlpFuentes || []), ...(normalizado.nlpFuentes || ['backend'])]))
  };

  for (const [id, datos] of Object.entries(normalizado.secciones || {})) {
    if (!datos) continue;
    const actual = fusionado.secciones[id];
    if (!actual) {
      fusionado.secciones[id] = Array.isArray(datos) ? datos : { ...datos };
      continue;
    }
    if (Array.isArray(actual) && Array.isArray(datos)) {
      const claves = new Set(actual.map((i) => `${i.clave || i.tipo_intervencion}|${i.descripcion || ''}`));
      const nuevos = datos.filter((i) => !claves.has(`${i.clave || i.tipo_intervencion}|${i.descripcion || ''}`));
      fusionado.secciones[id] = [...actual, ...nuevos];
      continue;
    }
    if (typeof actual === 'object' && typeof datos === 'object' && !Array.isArray(datos)) {
      for (const [campo, valor] of Object.entries(datos)) {
        if (valor === undefined || valor === null) continue;
        if (esVacio(actual[campo])) actual[campo] = valor;
      }
    }
  }

  return fusionado;
}