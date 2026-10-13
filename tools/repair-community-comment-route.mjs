import fs from 'node:fs';

const [target] = process.argv.slice(2);
if (!target) throw new Error('Informe o módulo a corrigir.');
let source = fs.readFileSync(target, 'utf8');
const before = 'let Kk=s.match(/^\\/api\\/community-votes\\/([^/]+)\\/comments$/);if(e.method===`POST`&&Kk){let{user:t}=J(e),n=await Z(e),r=P.communityVotes.find(e=>e.id===Kk[1]);';
const after = 'let Kk=s.split(`/`);if(e.method===`POST`&&Kk.length===5&&Kk[1]===`api`&&Kk[2]===`community-votes`&&Kk[4]===`comments`){let{user:t}=J(e),n=await Z(e),r=P.communityVotes.find(e=>e.id===Kk[3]);';
if (!source.includes(before)) throw new Error('Trecho da rota de comentários não encontrado.');
source = source.replace(before, after);
fs.writeFileSync(target, source);
