// src/helpers/wsUrl.js
// Resuelve la URL del WebSocket según el entorno.
//
// Prioridad:
//   1. VITE_WS_URL  →  variable de entorno (recomendado en Vercel)
//   2. localhost    →  dev con dev-all.js (WS dedicado en :3002)
//   3. Fallback     →  producción en Render (WS integrado en main.js, :443)

const PROD_WS_URL = 'wss://emergencity-morelia-v2.onrender.com/ws';
const DEV_WS_URL  = 'ws://localhost:3002/ws';

export function resolveWsUrl() {
  // 1. Env var explícita
  const explicit = import.meta.env.VITE_WS_URL;
  if (explicit) return explicit;

  // 2. Detección local
  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0') {
      return DEV_WS_URL;
    }
  }

  // 3. Fallback producción
  return PROD_WS_URL;
}

export default resolveWsUrl;