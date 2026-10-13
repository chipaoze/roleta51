import { env } from 'cloudflare:workers';
import seedDatabase from '@/seed-database.json';
import {
  initializeOnline,
  refreshOnlineState,
  requestHandler,
} from '@/legacy-server.mjs';

let requestQueue: Promise<unknown> = Promise.resolve();

class LegacyRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  socket: { remoteAddress: string };
  private request: Request;

  constructor(request: Request) {
    this.request = request;
    this.method = request.method;
    this.url = request.url;
    this.headers = Object.fromEntries(request.headers.entries());
    this.socket = {
      remoteAddress:
        request.headers.get('cf-connecting-ip') ||
        request.headers.get('x-forwarded-for') ||
        '',
    };
  }

  on() {
    return this;
  }

  async *[Symbol.asyncIterator]() {
    if (this.method === 'GET' || this.method === 'HEAD') return;
    const body = await this.request.arrayBuffer();
    if (body.byteLength) yield Buffer.from(body);
  }
}

class LegacyResponse {
  private headers = new Headers();
  private status = 200;
  private chunks: Uint8Array[] = [];
  private ended = false;

  setHeader(name: string, value: string | number) {
    this.headers.set(name, String(value));
  }

  writeHead(status: number, headers: Record<string, string | number> = {}) {
    this.status = status;
    for (const [name, value] of Object.entries(headers)) {
      this.headers.set(name, String(value));
    }
    return this;
  }

  write(chunk: string | Uint8Array) {
    this.chunks.push(
      typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk,
    );
    return true;
  }

  end(chunk?: string | Uint8Array) {
    if (chunk !== undefined) this.write(chunk);
    this.ended = true;
  }

  toResponse(method: string) {
    if (!this.ended) this.end();
    const length = this.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of this.chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const empty = method === 'HEAD' || this.status === 204 || this.status === 304;
    return new Response(empty ? null : body, {
      status: this.status,
      headers: this.headers,
    });
  }
}

async function executeOnce(request: Request) {
  await initializeOnline(env, seedDatabase);
  await refreshOnlineState();
  const legacyRequest = new LegacyRequest(request);
  const legacyResponse = new LegacyResponse();
  await requestHandler(legacyRequest, legacyResponse);
  return legacyResponse.toResponse(request.method);
}

function backendOrigin() {
  // Deploying the proxy code and directing real traffic are separate steps.
  // This makes it safe to install the migration ahead of the final data copy.
  if (String((env as Record<string, unknown>).AREA51_BACKEND_PROXY_ENABLED || '') !== 'true') return null;
  const origin = String((env as Record<string, unknown>).AREA51_BACKEND_URL || '').trim();
  if (!origin) return null;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'https:') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function proxyToBackend(request: Request, origin: URL) {
  const target = new URL(request.url);
  target.protocol = origin.protocol;
  target.host = origin.host;
  target.username = '';
  target.password = '';

  // Preserve the browser contract (notably session cookies and SSE) while
  // preventing a caller from forging the backend-only credential.
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('x-area51-gateway-secret');
  const secret = String((env as Record<string, unknown>).AREA51_GATEWAY_SECRET || '');
  if (!secret) return Response.json({ error: 'Gateway da API indisponível.' }, { status: 503 });
  headers.set('x-area51-gateway-secret', secret);
  const clientIp = request.headers.get('cf-connecting-ip');
  if (clientIp) headers.set('x-forwarded-for', clientIp);
  headers.set('x-forwarded-proto', 'https');

  // Only operations that are known to be read-only may be replayed. /api/sync
  // uses GET for historical reasons, but persists settlements and must never be
  // executed twice. Mutations get one attempt so a lost response cannot double
  // a purchase, bet or balance change.
  const mayRetry = (request.method === 'GET' || request.method === 'HEAD')
    && target.pathname !== '/api/sync';
  const attempts = mayRetry ? 5 : 1;
  const retryableStatuses = new Set([502, 503, 504]);
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const init: RequestInit & { duplex?: 'half' } = {
        method: request.method,
        headers,
        signal: controller.signal,
        redirect: 'manual',
      };
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        init.body = request.body;
        init.duplex = 'half';
      }
      const response = await fetch(target.toString(), init);
      if (mayRetry && retryableStatuses.has(response.status) && attempt + 1 < attempts) {
        await response.body?.cancel();
        const delay = [250, 750, 2_000, 3_000][attempt] || 3_000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      if (!mayRetry && retryableStatuses.has(response.status)) {
        await response.body?.cancel();
        return Response.json(
          { error: 'Servidor atualizando. A operação não foi repetida para proteger seu saldo. Tente novamente em alguns segundos.', retryable: true },
          { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '2' } },
        );
      }
      const responseHeaders = new Headers(response.headers);
      responseHeaders.delete('connection');
      responseHeaders.delete('keep-alive');
      responseHeaders.delete('transfer-encoding');
      return new Response(response.body, { status: response.status, headers: responseHeaders });
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) {
        const delay = [250, 750, 2_000, 3_000][attempt] || 3_000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  console.error('[backend-proxy]', {
    route: target.pathname,
    attempts,
    message: lastError instanceof Error ? lastError.message : 'upstream unavailable',
  });
  const error = mayRetry
    ? 'A API está temporariamente indisponível. Tente novamente.'
    : 'Servidor atualizando. A operação não foi repetida para proteger seu saldo. Tente novamente em alguns segundos.';
  return Response.json({ error, retryable: true }, {
    status: 503,
    headers: { 'Cache-Control': 'no-store', 'Retry-After': '2' },
  });
}

function maintenanceResponse(request: Request) {
  if (String((env as Record<string, unknown>).AREA51_MAINTENANCE_MODE || '') !== 'true') return null;
  const pathname = new URL(request.url).pathname;
  const isPage = (request.method === 'GET' || request.method === 'HEAD')
    && !pathname.startsWith('/api/')
    && !pathname.startsWith('/uploads/')
    && !pathname.startsWith('/memes/')
    && !pathname.startsWith('/feedback-images/');
  if (!isPage) {
    return Response.json({ error: 'O portal está em manutenção rápida. Aguarde alguns minutos.' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '120' },
    });
  }
  const body = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Área 51 em manutenção</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d1a2c;color:#eef4ff;font-family:Arial,sans-serif}.box{max-width:520px;padding:36px;text-align:center}.alien{font-size:48px}h1{margin:16px 0 10px;font-size:28px}p{margin:0;color:#b9c8dc;line-height:1.6}</style><main class="box"><div class="alien">👽</div><h1>A Área 51 está passando por uma atualização rápida</h1><p>Seu acesso, histórico e créditos estão preservados. Volte em alguns minutos.</p></main></html>`;
  return new Response(request.method === 'HEAD' ? null : body, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '120' },
  });
}

async function execute(request: Request) {
  const method = request.method;
  const headers = new Headers(request.headers);
  const body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const replay = new Request(request.url, {
      method,
      headers,
      body: body ? body.slice(0) : undefined,
    });
    try {
      return await executeOnce(replay);
    } catch (error) {
      const conflict = Boolean(
        error && typeof error === 'object' && 'retryableConcurrency' in error && error.retryableConcurrency,
      );
      if (!conflict || attempt === 2) {
        if (conflict) {
          return Response.json(
            { error: 'O site recebeu várias alterações simultâneas. Tente novamente em um instante.' },
            { status: 409 },
          );
        }
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }

  return Response.json({ error: 'Não foi possível concluir a operação.' }, { status: 500 });
}

export function handleLegacyRequest(request: Request) {
  const maintenance = maintenanceResponse(request);
  if (maintenance) return maintenance;
  const origin = backendOrigin();
  if (origin) return proxyToBackend(request, origin);
  // Leituras não podem ficar atrás de uma gravação longa (por exemplo, uma
  // sincronização de mercado ou upload). Colocar todo GET na mesma fila fazia
  // a abertura do portal esperar e disparar o falso estado “verificando
  // sessão”. Só mutações — e /api/sync, que consolida o estado — precisam da
  // ordem global para proteger a gravação CAS no D1.
  const pathname = new URL(request.url).pathname;
  const isReadOnly = (request.method === 'GET' || request.method === 'HEAD') && pathname !== '/api/sync';
  if (isReadOnly) return execute(request);
  const result = requestQueue.then(() => execute(request));
  requestQueue = result.catch(() => undefined);
  return result;
}
