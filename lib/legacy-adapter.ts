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
  const result = requestQueue.then(() => execute(request));
  requestQueue = result.catch(() => undefined);
  return result;
}
