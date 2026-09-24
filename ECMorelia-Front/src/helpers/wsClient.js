
export function createWsClient(url, options = {}) {
  const {
    onOpen,
    onMessage,
    onClose,
    onStatusChange,
    label = 'WS',
    registerPayload = null,
    maxBackoff = 30000
  } = options;

  let ws = null;
  let heartbeatTimer = null;
  let reconnectTimer = null;
  let backoff = 1000;
  let closedByUser = false;
  const pendingQueue = [];

  const setStatus = (s) => {
    if (typeof onStatusChange === 'function') onStatusChange(s);
  };

  const startHeartbeat = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'heartbeat' })); } catch (_) {}
      }
    }, 20000);
  };

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const flushQueue = () => {
    while (pendingQueue.length > 0 && ws?.readyState === WebSocket.OPEN) {
      const payload = pendingQueue.shift();
      try { ws.send(JSON.stringify(payload)); } catch (_) {}
    }
  };

  const connect = () => {
    if (closedByUser) return;
    setStatus('connecting');
    try {
      ws = new WebSocket(url);
    } catch (err) {
      console.warn(`[${label}] Error creando socket:`, err.message);
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      backoff = 1000;
      setStatus('connected');

      // Re-registrar la sesión tras cada reconexión
      if (registerPayload) {
        try { ws.send(JSON.stringify(registerPayload)); } catch (_) {}
      }

      flushQueue();
      startHeartbeat();
      if (typeof onOpen === 'function') onOpen(ws);
    };

    ws.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); }
      catch { return; }

      if (data.type === 'heartbeat_ack') return;

      if (typeof onMessage === 'function') onMessage(data, ws);
    };

    ws.onclose = (event) => {
      stopHeartbeat();
      setStatus('disconnected');
      if (typeof onClose === 'function') onClose(event);
      if (!closedByUser) scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose se dispara después, no hace falta hacer nada aquí
    };
  };

  const scheduleReconnect = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      backoff = Math.min(backoff * 1.5, maxBackoff);
      connect();
    }, backoff);
  };

  const send = (payload) => {
    if (ws?.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(payload)); return true; } catch (_) { return false; }
    }
    // Guardar para enviar al reconectar (máximo 20 mensajes)
    if (pendingQueue.length < 20) pendingQueue.push(payload);
    return false;
  };

  const close = () => {
    closedByUser = true;
    stopHeartbeat();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws) try { ws.close(1000, 'Cliente cerrado'); } catch (_) {}
  };

  const getSocket = () => ws;
  const isConnected = () => ws?.readyState === WebSocket.OPEN;

  connect();

  return { send, close, getSocket, isConnected };
}