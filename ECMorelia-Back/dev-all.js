// dev-all.js — Lanzador local para desarrollo
// Arranca en paralelo:
//   - main.js              → API REST (Express) en el puerto 3000
//   - websocket-server.js  → Servidor WebSocket mejorado en el puerto 3002
//
// Uso: npm run dev:all

const { spawn } = require('child_process');

const children = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  children.forEach((child) => {
    if (child.exitCode === null && !child.killed) {
      try { child.kill(); } catch (e) { /* ignorar */ }
    }
  });
  process.exit(code);
}

function run(name, args) {
  const child = spawn('npm', args, { stdio: 'inherit', shell: true });
  child.on('exit', (code) => {
    console.log(`\n[${name}] proceso finalizado (código ${code})`);
    shutdown(code ?? 0);
  });
  child.on('error', (err) => {
    console.error(`[${name}] error al iniciar:`, err.message);
  });
  children.push(child);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('🚑 Iniciando backend REST (main.js, :3000) y WebSocket (websocket-server.js, :3002)...\n');
run('main.js', ['run', 'dev']);
run('websocket-server.js', ['run', 'ws']);
