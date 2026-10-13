import fs from 'node:fs';

const [target] = process.argv.slice(2);
if (!target) throw new Error('Informe o backend alvo.');
let source = fs.readFileSync(target, 'utf8');

const voters = "const voters=(item.votes||[]).map((entry)=>{const person=people.get(entry.userId);return {id:entry.userId,name:person?.displayName||entry.userName||'Conta removida',avatarDataUrl:person?.avatarDataUrl||null,vote:entry.vote,createdAt:entry.createdAt};});return {id:item.id";
const votersWithComments = "const voters=(item.votes||[]).map((entry)=>{const person=people.get(entry.userId);return {id:entry.userId,name:person?.displayName||entry.userName||'Conta removida',avatarDataUrl:person?.avatarDataUrl||null,vote:entry.vote,createdAt:entry.createdAt};});const comments=(item.comments||[]).slice(-50).map((entry)=>{const person=people.get(entry.userId);return {id:entry.id,userId:entry.userId,name:person?.displayName||entry.userName||'Conta removida',avatarDataUrl:person?.avatarDataUrl||null,message:entry.message,createdAt:entry.createdAt};});return {id:item.id";
if (!source.includes(voters)) throw new Error('Mapeamento de votos não encontrado.');
source = source.replace(voters, votersWithComments);
const totals = "authorAvatarDataUrl:people.get(item.authorId)?.avatarDataUrl||null,voters,favor:voters.filter";
if (!source.includes(totals)) throw new Error('Retorno de votos não encontrado.');
source = source.replace(totals, "authorAvatarDataUrl:people.get(item.authorId)?.avatarDataUrl||null,voters,comments,favor:voters.filter");
const creation = "status:'open',votes:[]});await persist();broadcastRefresh('community-vote');json(res,201,stateFor(user));return; }";
if (!source.includes(creation)) throw new Error('Criação de pauta não encontrada.');
source = source.replace(creation, "status:'open',votes:[],comments:[]});await persist();broadcastRefresh('community-vote');json(res,201,stateFor(user));return; }");
const adminMarker = "  const communityVoteAdminMatch=route.match(/^\\/api\\/admin\\/community-votes\\/([^/]+)$/);";
const commentRoute = `  const communityVoteCommentMatch=route.match(/^\\/api\\/community-votes\\/([^/]+)\\/comments$/);
  if(req.method==='POST'&&communityVoteCommentMatch){
    const {user}=requireAuth(req); const body=await readJson(req); const item=db.communityVotes.find((entry)=>entry.id===communityVoteCommentMatch[1]);
    if(!item)throw new HttpError(404,'Votação não encontrada.');
    if(item.status!=='open')throw new HttpError(409,'Os comentários desta pauta foram encerrados.');
    if(user.mustChangePassword)throw new HttpError(403,'Troque a senha inicial antes de comentar.');
    const message=String(body.message||'').trim();
    if(!message||message.length>500)throw new HttpError(400,'Escreva um comentário entre 1 e 500 caracteres.');
    item.comments ||= [];
    if(item.comments.length>=50)throw new HttpError(409,'Esta pauta atingiu o limite de 50 comentários.');
    const lastComment=item.comments.filter((entry)=>entry.userId===user.id).at(-1);
    if(lastComment&&Date.now()-Date.parse(lastComment.createdAt)<2500)throw new HttpError(429,'Aguarde alguns segundos antes de comentar novamente.');
    item.comments.push({id:randomUUID(),userId:user.id,userName:user.displayName,message,createdAt:new Date().toISOString()});
    await persist(); broadcastRefresh('community-vote'); json(res,201,stateFor(user)); return;
  }

`;
if (!source.includes(adminMarker)) throw new Error('Ponto de inserção da rota não encontrado.');
source = source.replace(adminMarker, commentRoute + adminMarker);
fs.writeFileSync(target, source);
