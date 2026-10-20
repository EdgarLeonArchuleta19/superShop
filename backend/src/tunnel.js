// Conexión por internet con Cloudflare Tunnel. Dos modos:
//  - 'fixed': túnel con nombre de la cuenta de la tienda (token) y dirección fija en su
//    dominio, p. ej. https://app.supershop-mx.com. Se reconecta solo si se cae.
//  - 'quick': "Quick Tunnel" de prueba, https://<algo>.trycloudflare.com; la dirección
//    cambia cada vez que se inicia.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

// La dirección del Quick Tunnel; se excluye api.trycloudflare.com, que aparece en errores.
const QUICK_URL_RE = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/i;
// cloudflared escribe esto al quedar conectado con la red de Cloudflare (túnel fijo).
const FIXED_CONNECTED_RE = /Registered tunnel connection/i;
// Token equivocado o túnel borrado en Cloudflare: reintentar no sirve.
const FIXED_AUTH_ERROR_RE = /Failed to get tunnel|Unauthorized|invalid token|Invalid tunnel secret|tunnel not found/i;
// Revisión de red que hace cloudflared al arrancar: si pasa y aun así no conecta, el
// problema casi seguro es el token (Cloudflare no lo dice explícitamente).
const NETWORK_OK_RE = /Environment is healthy|precheck complete hard_fail=false/i;

const START_TIMEOUT_MS = 60 * 1000;
const READY_TIMEOUT_MS = 45 * 1000;
const HEALTH_INTERVAL_MS = 60 * 1000;
const MAX_RESTART_DELAY_MS = 60 * 1000;

const state = {
  mode: null, // 'fixed' | 'quick' | null
  running: false,
  url: null,
  ready: false,
  /** Túnel fijo: la dirección respondió en la última revisión. */
  reachable: null,
  reconnecting: false,
  error: null,
  startedAt: null,
};

let proc = null;
let options = null; // { port, mode, token, hostname }
let startTimer = null;
let restartTimer = null;
let healthTimer = null;
let restartDelay = 5000;

function resolveBinary() {
  const envPath = process.env.CLOUDFLARED_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;
  return 'cloudflared';
}

export function getTunnelStatus() {
  return { ...state };
}

function clearTimers() {
  clearTimeout(startTimer);
  clearTimeout(restartTimer);
  clearInterval(healthTimer);
  startTimer = restartTimer = healthTimer = null;
}

function killProc() {
  const current = proc;
  proc = null;
  if (current) {
    try {
      current.kill();
    } catch {
      /* ya terminó */
    }
  }
}

function fail(message) {
  killProc();
  clearTimers();
  Object.assign(state, { running: false, ready: false, reconnecting: false, error: message });
  if (state.mode === 'quick') state.url = null;
}

async function checkHealth(url) {
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(8000) });
    return res.ok;
  } catch {
    return false;
  }
}

// Quick Tunnel: Cloudflare avisa que la dirección puede tardar en responder.
async function waitUntilReachable(url, current) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (proc === current && state.url === url && Date.now() < deadline) {
    if (await checkHealth(url)) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (proc === current && state.url === url) state.ready = true;
}

// Túnel fijo: revisa cada minuto que la dirección pública responda de verdad (detecta
// por ejemplo que en Cloudflare la ruta no apunte a SuperShop).
function startHealthMonitor() {
  clearInterval(healthTimer);
  const check = async () => {
    if (!state.running || !state.url) return;
    state.reachable = await checkHealth(state.url);
  };
  void check();
  healthTimer = setInterval(check, HEALTH_INTERVAL_MS);
  healthTimer.unref?.();
}

function scheduleRestart() {
  clearTimeout(restartTimer);
  state.reconnecting = true;
  state.ready = false;
  restartTimer = setTimeout(() => {
    if (options?.mode === 'fixed') launch();
  }, restartDelay);
  restartTimer.unref?.();
  restartDelay = Math.min(restartDelay * 2, MAX_RESTART_DELAY_MS);
}

function launch() {
  const { port, mode, token, hostname } = options;
  const fixed = mode === 'fixed';
  const args = fixed
    ? ['tunnel', '--no-autoupdate', 'run']
    : ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`];
  // El token va por variable de entorno, no en los argumentos (no aparece en la lista de procesos).
  const env = fixed ? { ...process.env, TUNNEL_TOKEN: token } : process.env;

  let current;
  let networkOk = false;
  try {
    current = spawn(resolveBinary(), args, { windowsHide: true, env });
  } catch {
    fail('No se encontró el componente de conexión remota. Reinstala SuperShop.');
    return;
  }
  proc = current;
  Object.assign(state, {
    mode,
    running: true,
    url: fixed ? `https://${hostname}` : null,
    ready: false,
    // Al reconectar se conserva el aviso ("Reconectando…") hasta que vuelva la conexión.
    error: state.reconnecting ? state.error : null,
    startedAt: state.startedAt || new Date().toISOString(),
  });

  clearTimeout(startTimer);
  startTimer = setTimeout(() => {
    if (proc !== current || state.ready) return;
    if (fixed) {
      // Sin conexión con Cloudflare: se sigue intentando, pero se avisa.
      state.error = networkOk
        ? 'Cloudflare no aceptó la conexión del túnel. Revisa que el token sea el correcto (cópialo de nuevo desde Cloudflare).'
        : 'No se pudo conectar con Cloudflare. Revisa la conexión a internet; se sigue intentando.';
    } else if (!state.url) {
      fail('Cloudflare no respondió a tiempo. Revisa la conexión a internet e inténtalo de nuevo.');
    }
  }, START_TIMEOUT_MS);

  const onData = (chunk) => {
    if (proc !== current) return;
    const text = chunk.toString();
    if (fixed) {
      if (NETWORK_OK_RE.test(text)) networkOk = true;
      if (FIXED_AUTH_ERROR_RE.test(text)) {
        options = null;
        fail('Cloudflare no reconoce este túnel: el token es incorrecto o el túnel se borró. Cópialo de nuevo desde Cloudflare.');
        return;
      }
      if (!state.ready && FIXED_CONNECTED_RE.test(text)) {
        state.ready = true;
        state.reconnecting = false;
        state.error = null;
        restartDelay = 5000;
        clearTimeout(startTimer);
        startHealthMonitor();
      }
    } else if (!state.url) {
      const match = text.match(QUICK_URL_RE);
      if (match) {
        state.url = match[0];
        clearTimeout(startTimer);
        void waitUntilReachable(state.url, current);
      }
    }
  };
  current.stdout?.on('data', onData);
  current.stderr?.on('data', onData);

  current.on('error', (e) => {
    if (proc !== current) return;
    options = null;
    fail(
      e.code === 'ENOENT'
        ? 'No se encontró el componente de conexión remota. Reinstala SuperShop.'
        : 'No se pudo iniciar la conexión remota.'
    );
  });

  current.on('close', () => {
    if (proc !== current) return;
    proc = null;
    if (fixed && options) {
      // Túnel fijo: debe estar siempre en línea, así que se vuelve a levantar solo.
      state.error = 'Se perdió la conexión con Cloudflare. Reconectando…';
      scheduleRestart();
      return;
    }
    fail(
      state.url
        ? 'La conexión remota se cerró. Vuelve a iniciarla.'
        : 'No se pudo conectar con Cloudflare. Revisa la conexión a internet e inténtalo de nuevo.'
    );
  });
}

/**
 * Inicia el túnel. `config` = { mode: 'fixed', token, hostname } o { mode: 'quick' }.
 * Si ya hay uno corriendo con otra configuración, lo reemplaza.
 */
export function startTunnel(port = 3001, config = { mode: 'quick' }) {
  if (proc && options?.mode === config.mode && options?.token === config.token && options?.hostname === config.hostname) {
    return getTunnelStatus();
  }
  stopTunnel();
  options = { port, ...config };
  restartDelay = 5000;
  launch();
  return getTunnelStatus();
}

export function stopTunnel() {
  options = null;
  killProc();
  clearTimers();
  Object.assign(state, {
    mode: null,
    running: false,
    url: null,
    ready: false,
    reachable: null,
    reconnecting: false,
    error: null,
    startedAt: null,
  });
  return getTunnelStatus();
}
