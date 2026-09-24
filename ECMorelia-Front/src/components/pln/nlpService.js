// src/pln/nlpService.js
// Orquesta el parser local con el backend opcional.
// El parser local siempre se ejecuta porque es rápido y confiable.
// El backend (si existe) se usa para enriquecer el resultado.

import { parseTextLocal } from './localParser';

const API_URL = import.meta.env.VITE_API || 'http://localhost:3000/api';

export async function parseText(text) {
  if (!text || !text.trim()) {
    return {
      secciones: {},
      acciones: [],
      seccionesCompletas: [],
      textoNormalizado: '',
      textoOriginal: ''
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
      body: JSON.stringify({ text: local.textoNormalizado }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (response.ok) {
      const backend = await response.json();
      // Fusionar: el resultado local gana en campos que ya extrajo,
      // el backend rellena los vacíos.
      return fusionarResultados(local, backend);
    }
  } catch (_) {
    // Silencioso: el parser local ya cubre el caso
  }

  return local;
}

function fusionarResultados(local, backend) {
  const fusionado = {
    secciones: { ...local.secciones },
    acciones: [...new Set([...local.acciones, ...(backend.acciones || [])])],
    seccionesCompletas: [...new Set([...local.seccionesCompletas, ...(backend.seccionesCompletas || [])])],
    textoNormalizado: local.textoNormalizado,
    textoOriginal: local.textoOriginal
  };

  // Fusionar secciones específicas si el backend trajo datos que el local no
  const seccionesBackend = backend.secciones || {};
  for (const [id, datos] of Object.entries(seccionesBackend)) {
    if (!fusionado.secciones[id]) {
      fusionado.secciones[id] = datos;
      continue;
    }
    // Solo rellenar campos vacíos
    for (const [campo, valor] of Object.entries(datos)) {
      const actual = fusionado.secciones[id][campo];
      const vacio = actual === '' || actual === null || actual === undefined ||
        (Array.isArray(actual) && actual.length === 0);
      if (vacio && valor !== '' && valor !== null && valor !== undefined) {
        fusionado.secciones[id][campo] = valor;
      }
    }
  }

  return fusionado;
}