// src/pln/nlpService.js
// Orquesta el parser local con el backend opcional.
// El parser local siempre se ejecuta porque es rápido y confiable.
// El backend (si existe) se usa para enriquecer el resultado.

import { parseTextLocal } from './localParser';
import { enriquecer } from './bertNlp';

export { getEstadoBert, setBertOpcion } from './bertNlp';

const API_URL = import.meta.env.VITE_API || 'http://localhost:3000/api';

export async function parseText(text) {
  if (!text || !text.trim()) {
    return {
      secciones: {},
      acciones: [],
      seccionesCompletas: [],
      textoNormalizado: '',
      textoOriginal: '',
      nlpFuentes: []
    };
  }

  // Parser local primero: siempre disponible, sin latencia de red
  const local = parseTextLocal(text);

  // Si el backend está disponible, intentar enriquecer con NER/ML
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const response = await fetch(`${API_URL}/nlp/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: local.textoNormalizado || text }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (response.ok) {
      const backend = await response.json();
      // Fusionar: el resultado local gana en campos que ya extrajo,
      // el backend rellena los vacíos.
      try {
        return fusionarResultados(local, backend);
      } catch (e) {
        // Si la fusión falla, preferir el mejor resultado disponible
        return local;
      }
    }
  } catch (_) {
    // Silencioso: el parser local ya cubre el caso
  }

  return local;
}

export async function parseTextConBert(text, opciones) {
  const base = await parseText(text);
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
      if (src[k] !== undefined && src[k] !== '') {
        sv[k] = src[k];
      }
    }
    if (Object.keys(sv).length > 0) secciones.signos = sv;
  }

  if (!secciones.glasgow && backend.glasgow) {
    const g = {};
    for (const k of ['ocular', 'verbal', 'motor', 'total']) {
      if (backend.glasgow[k] !== undefined && backend.glasgow[k] !== null) {
        g[k] = backend.glasgow[k];
      }
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
    secciones.intervenciones = backend.intervenciones.filter(iv => iv && iv.tipo_intervencion);
  }

  const acciones = [...new Set([...(backend.acciones || []), ...(localBase?.acciones || [])])];
  const seccionesCompletas = [...new Set([...(backend.seccionesCompletas || []), ...(localBase?.seccionesCompletas || [])])];

  return {
    secciones,
    acciones,
    seccionesCompletas,
    textoNormalizado: backend.textoNormalizado || localBase?.textoNormalizado || '',
    textoOriginal: backend.textoOriginal || localBase?.textoOriginal || '',
    nlpFuentes: Array.from(new Set([...(backend.nlpFuentes || []), 'local']))
  };
}

function fusionarResultados(local, backend) {
  const backendEsMedico = !!(backend && (backend.paciente || backend.signos_vitales || backend.motivo_urgencia || backend.descripcion_lesion || backend.intervenciones));
  const backendNormalizado = backendEsMedico ? mapearFormatoMedico(backend, local) : {
    secciones: backend.secciones || {},
    acciones: backend.acciones || [],
    seccionesCompletas: backend.seccionesCompletas || [],
    textoNormalizado: backend.textoNormalizado || local.textoNormalizado,
    textoOriginal: backend.textoOriginal || local.textoOriginal,
    nlpFuentes: Array.from(new Set([...(backend.nlpFuentes || []), 'local']))
  };

  const fusionado = {
    secciones: { ...local.secciones },
    acciones: [...new Set([...(local.acciones || []), ...(backendNormalizado.acciones || [])])],
    seccionesCompletas: [...new Set([...(local.seccionesCompletas || []), ...(backendNormalizado.seccionesCompletas || [])])],
    textoNormalizado: local.textoNormalizado || backendNormalizado.textoNormalizado,
    textoOriginal: local.textoOriginal || backendNormalizado.textoOriginal,
    nlpFuentes: Array.from(new Set([...(local.nlpFuentes || []), ...(backendNormalizado.nlpFuentes || ['backend'])]))
  };

  // Fusionar secciones específicas si el backend trajo datos que el local no
  const seccionesBackend = backendNormalizado.secciones || {};
  for (const [id, datos] of Object.entries(seccionesBackend)) {
    if (!datos) continue;
    if (!fusionado.secciones[id]) {
      fusionado.secciones[id] = Array.isArray(datos) ? datos : { ...datos };
      continue;
    }
    if (Array.isArray(fusionado.secciones[id]) && Array.isArray(datos)) {
      fusionado.secciones[id] = [...new Set([...fusionado.secciones[id], ...datos])];
      continue;
    }
    if (typeof fusionado.secciones[id] === 'object' && typeof datos === 'object' && !Array.isArray(datos)) {
      for (const [campo, valor] of Object.entries(datos)) {
        if (valor === undefined || valor === null) continue;
        const actual = fusionado.secciones[id][campo];
        const vacio = actual === '' || actual === null || actual === undefined ||
          (Array.isArray(actual) && actual.length === 0);
        if (vacio || (actual !== valor && vacio)) {
          fusionado.secciones[id][campo] = valor;
        }
      }
    }
  }

  return fusionado;
}