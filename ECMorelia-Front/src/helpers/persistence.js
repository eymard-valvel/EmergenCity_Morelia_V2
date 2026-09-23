// src/helpers/persistence.js
// Utilidades de persistencia local. Versionadas para poder migrar
// estructuras en el futuro sin perder datos.

const PREFIX = 'emergencity';

function makeKey(namespace, key) {
  return `${PREFIX}:${namespace}:${key}`;
}

export function saveLocal(namespace, key, value) {
  try {
    const payload = { v: 1, data: value, ts: Date.now() };
    localStorage.setItem(makeKey(namespace, key), JSON.stringify(payload));
  } catch (err) {
    console.warn('[persistence] No se pudo guardar', namespace, key, err.message);
  }
}

export function readLocal(namespace, key, fallback = null) {
  try {
    const raw = localStorage.getItem(makeKey(namespace, key));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'data' in parsed) return parsed.data;
    return parsed;
  } catch {
    return fallback;
  }
}

export function clearLocal(namespace, key) {
  try {
    if (key) localStorage.removeItem(makeKey(namespace, key));
    else {
      const prefix = makeKey(namespace, '');
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith(prefix)) localStorage.removeItem(k);
      });
    }
  } catch {}
}

// Hook ligero: mantiene un estado sincronizado con localStorage
export function usePersistentState(React, namespace, key, initial) {
  const { useState, useEffect, useRef } = React;
  const stored = useRef(readLocal(namespace, key, initial));
  const [state, setState] = useState(stored.current);

  useEffect(() => {
    saveLocal(namespace, key, state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return [state, setState];
}

export function readSession(namespace, key, fallback = null) {
  try {
    const raw = sessionStorage.getItem(makeKey(namespace, key));
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}

export function saveSession(namespace, key, value) {
  try {
    sessionStorage.setItem(makeKey(namespace, key), JSON.stringify(value));
  } catch {}
}