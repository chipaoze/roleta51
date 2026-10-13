import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeOnline, refreshOnlineState, requestHandler } from '../legacy-server.mjs';
import seedDatabase from '../seed-database.json' with { type: 'json' };
import { createFileMediaStore } from './media-store.mjs';
import { createSqliteD1 } from './sqlite-d1.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8787);
const dataFile = process.env.AREA51_DATA_FILE || path.join(directory, '.local', 'area51.sqlite');
const mediaDirectory = process.env.AREA51_MEDIA_DIR || path.join(directory, '.local', 'media');
const sharedSecret = process.env.AREA51_GATEWAY_SECRET || '';

const environment = {
  DB: createSqliteD1(dataFile),
  MEDIA: createFileMediaStore(mediaDirectory),
};

await initializeOnline(environment, seedDatabase);

let mutationQueue = Promise.resolve();
let queuedMutations = 0;
let activeReads = 0;
let peakQueuedMutations = 0;
let peakActiveReads = 0;
let apiRequestsSinceStart = 0;
let apiFailuresSinceStart = 0;
let apiRoutesSinceStart = new Map();
const protectedMutations = new Set();

// A instância Always Free tem pouca memória.  Uma rajada de abas reconectando
// não pode criar trabalho ilimitado no mesmo processo que mantém as sessões.
// Os limites ficam acima do uso normal da tripulação, mas devolvem um erro
// transitório em vez de deixar a VM inteira indisponível.
const MAX_QUEUED_MUTATIONS = 24;
const MAX_ACTIVE_READS = 12;

function apiRouteKey(pathname) {
  return String(pathname || '/')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
    .replace(/\/uploads\/[^/]+/g, '/uploads/:file')
    .replace(/\/(?:memes|feedback-images)\/[^/]+/g, '/media/:file');
}

function recordApiRequest(pathname, status) {
  apiRequestsSinceStart += 1;
  if (Number(status) >= 400) apiFailuresSinceStart += 1;
  const key = apiRouteKey(pathname);
  apiRoutesSinceStart.set(key, (apiRoutesSinceStart.get(key) || 0) + 1);
}

function memInfo() {
  const values = Object.fromEntries(String(fs.readFileSync('/proc/meminfo', 'utf8')).trim().split('\n').map((line) => {
    const [key, raw] = line.split(':'); return [key, Number.parseInt(raw, 10) * 1024];
  }));
  return { total: values.MemTotal || os.totalmem(), available: values.MemAvailable || os.freemem(), swapTotal: values.SwapTotal || 0, swapFree: values.SwapFree || 0 };
}

// Só é entregue pela rota administrativa autenticada. Não vaza métricas da VM
// para o restante da tripulação e não executa comandos do sistema.
function runtimeHealth() {
  const memory = memInfo(); const load = os.loadavg()[0] || 0; const cpus = Math.max(1, os.cpus().length);
  return {
    ok: true, memoryUsedPercent: ((memory.total - memory.available) / memory.total) * 100,
    swapUsedPercent: memory.swapTotal ? ((memory.swapTotal - memory.swapFree) / memory.swapTotal) * 100 : 0,
    loadPerCpu: load / cpus, healthcheckActive: true, processUptimeSeconds: Math.round(process.uptime()),
    activeReads, queuedMutations, peakActiveReads, peakQueuedMutations,
    apiRequestsSinceStart, apiFailuresSinceStart, apiRequestLimit: 100000,
    topApiRoutes: [...apiRoutesSinceStart.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5).map(([route, count]) => ({ route, count })),
    checkedAt: new Date().toISOString(),
  };
}
environment.RUNTIME_HEALTH = runtimeHealth;

function isReadOnly(request) {
  const pathname = new URL(request.url, 'http://' + (request.headers.host || 'localhost')).pathname;
  return (request.method === 'GET' || request.method === 'HEAD') && pathname !== '/api/sync';
}

function protectedMutationKey(request, pathname) {
  if (!(/^\/api\/mystery-(?:boxes|rewards)\/(?:open|sell|keep)$/.test(pathname) || pathname === '/api/cobblemon/reward/decision' || pathname === '/api/market/auto-sell' || pathname === '/api/market/auto-sell/cancel')) return null;
  const caller = String(request.headers.cookie || request.headers.authorization || request.socket.remoteAddress || 'unknown');
  return request.method + ':' + pathname + ':' + caller;
}

async function execute(request, response) {
  const startedAt = performance.now();
  const pathname = new URL(request.url, 'http://' + (request.headers.host || 'localhost')).pathname;
  try {
    if (sharedSecret && request.headers['x-area51-gateway-secret'] !== sharedSecret) {
      response.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: 'Origem não autorizada.' }));
      return;
    }
    await refreshOnlineState();
    await requestHandler(request, response);
  } catch (error) {
    const status = error?.retryableConcurrency ? 409 : 500;
    if (!response.headersSent) {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: status === 409 ? 'Atualização simultânea; tente novamente.' : 'O servidor encontrou um problema.' }));
    } else if (!response.writableEnded) {
      response.end();
    }
    console.error('[api-error]', { route: pathname, status, message: error?.message || 'unknown' });
  } finally {
    recordApiRequest(pathname, response.statusCode);
    console.info('[api]', { route: pathname, method: request.method, status: response.statusCode, durationMs: Math.round(performance.now() - startedAt) });
  }
}

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://' + (request.headers.host || 'localhost')).pathname;
  // This endpoint intentionally does not load or mutate game state. The proxy
  // and the service manager can tell a healthy process from a slow game action.
  if (pathname === '/healthz') {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  if (isReadOnly(request)) {
    if (activeReads >= MAX_ACTIVE_READS) {
      response.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Retry-After': '2' });
      response.end(JSON.stringify({ error: 'Servidor ocupado; tente novamente em instantes.' }));
      return;
    }
    activeReads += 1;
    peakActiveReads = Math.max(peakActiveReads, activeReads);
    void execute(request, response).then(
      () => { activeReads -= 1; },
      () => { activeReads -= 1; },
    );
    return;
  }
  if (queuedMutations >= MAX_QUEUED_MUTATIONS) {
    response.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Retry-After': '3' });
    response.end(JSON.stringify({ error: 'Há muitas atualizações em andamento; tente novamente em instantes.' }));
    return;
  }
  const protectedKey = protectedMutationKey(request, pathname);
  if (protectedKey && protectedMutations.has(protectedKey)) {
    response.writeHead(409, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Retry-After': '1' });
    response.end(JSON.stringify({ error: 'Esta operação já está sendo processada.' }));
    return;
  }
  if (protectedKey) protectedMutations.add(protectedKey);
  queuedMutations += 1;
  peakQueuedMutations = Math.max(peakQueuedMutations, queuedMutations);
  const next = mutationQueue.then(() => execute(request, response));
  mutationQueue = next.catch(() => undefined);
  void next.then(
    () => { queuedMutations -= 1; if (protectedKey) protectedMutations.delete(protectedKey); },
    () => { queuedMutations -= 1; if (protectedKey) protectedMutations.delete(protectedKey); },
  );
});

// Evita sockets lentos acumulados após uma queda de rede. Rotas normais da
// aplicação já têm timeout no cliente; estes limites protegem a origem.
server.headersTimeout = 15_000;
server.requestTimeout = 45_000;
server.keepAliveTimeout = 5_000;
server.maxRequestsPerSocket = 100;

server.listen(port, '127.0.0.1', () => {
  console.info('[area51-backend] listening', { port, dataFile, mediaDirectory });
});

function shutdown(signal) {
  console.info('[area51-backend] shutting down', { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
