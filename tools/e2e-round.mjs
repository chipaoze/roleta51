import { readFile } from 'node:fs/promises';

const baseUrl = process.env.AREA51_E2E_URL || 'http://localhost:3000';
const password = process.env.AREA51_E2E_PASSWORD;
if (!password) throw new Error('Defina AREA51_E2E_PASSWORD.');

const database = JSON.parse(await readFile(new URL('../seed-database.json', import.meta.url), 'utf8'));
const people = database.users.filter((user) => user.active && user.approved !== false && user.eligible);
if (people.length !== 10) throw new Error(`O ensaio exige 10 participantes; encontrados: ${people.length}.`);

class Session {
  cookies = new Map();

  cookieHeader() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  async request(path, options = {}) {
    const response = await fetch(baseUrl + path, {
      ...options,
      headers: {
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(this.cookies.size ? { cookie: this.cookieHeader() } : {}),
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      redirect: 'manual',
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const [pair] = setCookie.split(';');
      const separator = pair.indexOf('=');
      this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.arrayBuffer();
    if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: ${response.status} ${payload?.error || ''}`);
    return { response, payload };
  }
}

const sessions = await Promise.all(people.map(async (person) => {
  const session = new Session();
  await session.request('/api/gate', { method: 'POST', body: { code: '51' } });
  const { payload } = await session.request('/api/login', {
    method: 'POST',
    body: { username: person.username, password, rememberMe: true },
  });
  return { person, session, state: payload };
}));

const admin = sessions.find((entry) => entry.person.role === 'admin');
if (!admin) throw new Error('Administrador não encontrado no ensaio.');
const pause = (milliseconds = 6600) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const draw = async (type) => {
  const { payload } = await admin.session.request('/api/draw', { method: 'POST', body: { type } });
  await pause();
  return payload;
};

const themeDraw = await draw('theme');
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
await Promise.all(sessions.map(({ session }) => session.request('/api/uploads', { method: 'POST', body: { dataUrl: png } })));

let adminState = (await admin.session.request('/api/state')).payload;
if (adminState.submissions.length !== 10) throw new Error(`Uploads incompletos: ${adminState.submissions.length}/10.`);
const firstImageUrl = adminState.submissions[0].imageUrl;

const recipients = [];
for (let index = 0; index < 10; index += 1) {
  const result = await draw('wallpaper');
  recipients.push(result.result.winnerId);
}
if (new Set(recipients).size !== 10) throw new Error('A distribuição não contemplou os 10 participantes uma única vez.');

await Promise.all(sessions.map(({ session }) => session.request('/api/my-round/seen', { method: 'POST', body: {} })));
const gayDraw = await draw('gay');

await Promise.all(sessions.map(async ({ session }, index) => {
  const state = (await session.request('/api/state')).payload;
  const entries = state.voting?.entries || [];
  if (entries.length !== 10) throw new Error(`Votação incompleta para o usuário ${index + 1}.`);
  const bestId = entries[index % entries.length].id;
  const worstId = entries[(index + 1) % entries.length].id;
  await session.request('/api/vote', { method: 'POST', body: { bestId, worstId } });
}));

adminState = (await admin.session.request('/api/state')).payload;
if (adminState.voting?.status !== 'closed' || adminState.voting.receivedVotes !== 10) {
  throw new Error(`Votação não encerrou corretamente: ${adminState.voting?.receivedVotes || 0}/10.`);
}
if (!adminState.voting.result?.bestWinnerId || !adminState.voting.result?.worstWinnerId) {
  throw new Error('Melhor e pior wallpaper não foram definidos.');
}

const cleanup = (await admin.session.request('/api/round/clear', { method: 'POST', body: {} })).payload;
if (cleanup.storageCleanup?.deletedWallpapers !== 10) throw new Error('A limpeza não confirmou a remoção dos 10 wallpapers.');
const cleared = (await admin.session.request('/api/state')).payload;
if (cleared.workflow.active || cleared.submissions.length) throw new Error('A rodada não foi encerrada por completo.');
const removedImage = await fetch(baseUrl + firstImageUrl, { headers: { cookie: admin.session.cookieHeader() } });
if (![403, 404].includes(removedImage.status)) throw new Error(`O wallpaper ainda está acessível; resposta: ${removedImage.status}.`);

console.log(JSON.stringify({
  ok: true,
  participants: sessions.length,
  theme: themeDraw.result.winner,
  uploads: 10,
  deliveries: recipients.length,
  uniqueRecipients: new Set(recipients).size,
  gayWinnerDefined: Boolean(gayDraw.result.winnerId),
  votes: adminState.voting.receivedVotes,
  votingClosed: adminState.voting.status === 'closed',
  bestAndWorstDefined: true,
  roundCleared: !cleared.workflow.active,
  deletedWallpapers: cleanup.storageCleanup.deletedWallpapers,
  wallpaperUnavailable: [403, 404].includes(removedImage.status),
}, null, 2));
