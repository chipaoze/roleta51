import fs from 'node:fs';

const [target] = process.argv.slice(2);
if (!target) throw new Error('Informe o módulo a corrigir.');
let source = fs.readFileSync(target, 'utf8');
const marker = 'throw new L(404,`Rota não encontrada.`)}async function To(';
const fallback = `if(e.method===\`POST\`){let Kz=String(e.url||s||\`\`).split(\`?\`)[0].split(\`/\`),Jz=Kz.indexOf(\`community-votes\`);if(Jz>=0&&Kz[Jz+2]===\`comments\`){let{user:t}=J(e),n=await Z(e),r=P.communityVotes.find(e=>e.id===Kz[Jz+1]);if(!r)throw new L(404,\`Votação não encontrada.\`);if(r.status!==\`open\`)throw new L(409,\`Os comentários desta pauta foram encerrados.\`);if(t.mustChangePassword)throw new L(403,\`Troque a senha inicial antes de comentar.\`);let i=String(n.message||\`\`).trim();if(!i||i.length>500)throw new L(400,\`Escreva um comentário entre 1 e 500 caracteres.\`);r.comments||=[];if(r.comments.length>=50)throw new L(409,\`Esta pauta atingiu o limite de 50 comentários.\`);let s=r.comments.filter(e=>e.userId===t.id).at(-1);if(s&&Date.now()-Date.parse(s.createdAt)<2500)throw new L(429,\`Aguarde alguns segundos antes de comentar novamente.\`);r.comments.push({id:a(),userId:t.id,userName:t.displayName,message:i,createdAt:new Date().toISOString()}),await R(),X(\`community-vote\`),q(o,201,$(t));return}}throw new L(404,\`Rota não encontrada.\`)}async function To(`;
if (!source.includes(marker)) throw new Error('Fallback final do roteador não encontrado.');
source = source.replace(marker, fallback);
fs.writeFileSync(target, source);
