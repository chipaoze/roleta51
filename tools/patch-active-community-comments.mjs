import fs from 'node:fs';

const [target] = process.argv.slice(2);
if (!target) throw new Error('Informe o servidor ativo a corrigir.');

let source = fs.readFileSync(target, 'utf8');

const votersBlock = `    const voters = (item.votes || []).map((entry) => {
      const person = people.get(entry.userId);
      return { id: entry.userId, name: person?.displayName || entry.userName || 'Conta removida', avatarDataUrl: person?.avatarDataUrl || null, vote: entry.vote, createdAt: entry.createdAt };
    });`;
const votersWithComments = `${votersBlock}
    const comments = (item.comments || []).slice(-50).map((entry) => {
      const person = people.get(entry.userId);
      return { id: entry.id, userId: entry.userId, name: person?.displayName || entry.userName || 'Conta removida', avatarDataUrl: person?.avatarDataUrl || null, message: entry.message, createdAt: entry.createdAt };
    });`;

const responseNeedle = `      voters, favor: voters.filter((entry) => entry.vote === 'favor').length, against: voters.filter((entry) => entry.vote === 'against').length,`;
const responseReplacement = `      voters, comments, favor: voters.filter((entry) => entry.vote === 'favor').length, against: voters.filter((entry) => entry.vote === 'against').length,`;

const proposalNeedle = `    db.communityVotes.push({ id: randomUUID(), subject, authorId: user.id, authorName: user.displayName, createdAt: now, status: 'open', votes: [] });`;
const proposalReplacement = `    db.communityVotes.push({ id: randomUUID(), subject, authorId: user.id, authorName: user.displayName, createdAt: now, status: 'open', votes: [], comments: [] });`;

const adminNeedle = `  const communityVoteAdminMatch = route.match(/^\\/api\\/admin\\/community-votes\\/([^/]+)$/);`;
const commentsRoute = `  const communityVoteCommentMatch = route.match(/^\\/api\\/community-votes\\/([^/]+)\\/comments$/);
  if (req.method === 'POST' && communityVoteCommentMatch) {
    const { user } = requireAuth(req); const body = await readJson(req); const item = db.communityVotes.find((entry) => entry.id === communityVoteCommentMatch[1]);
    if (!item) throw new HttpError(404, 'Votação não encontrada.');
    if (item.status !== 'open') throw new HttpError(409, 'Os comentários desta pauta foram encerrados.');
    if (user.mustChangePassword) throw new HttpError(403, 'Troque a senha inicial antes de comentar.');
    const message = String(body.message || '').trim();
    if (!message || message.length > 500) throw new HttpError(400, 'Escreva um comentário entre 1 e 500 caracteres.');
    item.comments ||= [];
    if (item.comments.length >= 50) throw new HttpError(409, 'Esta pauta atingiu o limite de 50 comentários.');
    const lastComment = item.comments.filter((entry) => entry.userId === user.id).at(-1);
    if (lastComment && Date.now() - Date.parse(lastComment.createdAt) < 2500) throw new HttpError(429, 'Aguarde alguns segundos antes de comentar novamente.');
    item.comments.push({ id: randomUUID(), userId: user.id, userName: user.displayName, message, createdAt: new Date().toISOString() });
    await persist(); broadcastRefresh('community-vote'); json(res, 201, stateFor(user)); return;
  }
  ${adminNeedle}`;

const changes = [
  [votersBlock, votersWithComments, 'serialização dos comentários'],
  [responseNeedle, responseReplacement, 'retorno dos comentários'],
  [proposalNeedle, proposalReplacement, 'inicialização dos comentários'],
  [adminNeedle, commentsRoute, 'rota de comentários'],
];

for (const [before, after, label] of changes) {
  if (source.includes(after)) continue;
  if (!source.includes(before)) throw new Error(`Trecho não encontrado: ${label}`);
  source = source.replace(before, after);
}

fs.writeFileSync(target, source);
