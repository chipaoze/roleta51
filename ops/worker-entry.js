import siteWorker from './index.js';

const upstreamRoutes = ['/api/', '/uploads/', '/memes/', '/feedback-images/'];
const retryable = new Set([502, 503, 504]);

function isUpstreamRoute(pathname) {
  return upstreamRoutes.some((prefix) => pathname.startsWith(prefix));
}

async function forward(request, env) {
  if (env.AREA51_MAINTENANCE_MODE === 'true') {
    return Response.json({ error: 'O portal está em manutenção rápida. Aguarde alguns minutos.' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '120' } });
  }
  const originText = String(env.AREA51_BACKEND_URL || '');
  const secret = String(env.AREA51_GATEWAY_SECRET || '');
  let origin;
  try { origin = new URL(originText); } catch { /* fail closed below */ }
  if (env.AREA51_BACKEND_PROXY_ENABLED !== 'true' || origin?.protocol !== 'https:' || !secret) {
    return Response.json({ error: 'Gateway da API indisponível.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  const target = new URL(request.url);
  target.protocol = origin.protocol;
  target.host = origin.host;
  target.username = '';
  target.password = '';
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('x-area51-gateway-secret');
  headers.set('x-area51-gateway-secret', secret);
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) headers.set('x-forwarded-for', ip);
  headers.set('x-forwarded-proto', 'https');
  const safeRead = ['GET', 'HEAD'].includes(request.method) && target.pathname !== '/api/sync';
  const attempts = safeRead ? 5 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const init = { method: request.method, headers, signal: controller.signal, redirect: 'manual' };
      if (!['GET', 'HEAD'].includes(request.method)) {
        init.body = request.body;
        init.duplex = 'half';
      }
      const response = await fetch(target, init);
      if (retryable.has(response.status)) {
        await response.body?.cancel();
        if (safeRead && attempt + 1 < attempts) {
          await new Promise((resolve) => setTimeout(resolve, [250, 750, 2_000, 3_000][attempt]));
          continue;
        }
        return Response.json({ error: 'A API está temporariamente indisponível. Tente novamente.', retryable: true }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '2' } });
      }
      const responseHeaders = new Headers(response.headers);
      for (const name of ['connection', 'keep-alive', 'transfer-encoding']) responseHeaders.delete(name);
      return new Response(response.body, { status: response.status, headers: responseHeaders });
    } catch (error) {
      if (!safeRead || attempt + 1 === attempts) {
        console.error('[backend-proxy]', { route: target.pathname, message: error instanceof Error ? error.message : 'upstream unavailable' });
        return Response.json({ error: 'A API está temporariamente indisponível. Tente novamente.', retryable: true }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '2' } });
      }
      await new Promise((resolve) => setTimeout(resolve, [250, 750, 2_000, 3_000][attempt]));
    } finally { clearTimeout(timeout); }
  }
}

export default {
  fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname;
    if (isUpstreamRoute(pathname)) return forward(request, env);
    return siteWorker.fetch(request, env, ctx);
  },
};
