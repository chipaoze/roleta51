import fs from 'node:fs';

const [target] = process.argv.slice(2);
let source = fs.readFileSync(target, 'utf8');
const before = 'throw new L(404,`Rota não encontrada: `+e.method+` | `+s+` | `+String(e.url||``))}async function To(';
const after = 'if(e.method===`POST`){q(o,418,{route:s,raw:String(e.url||``)});return}throw new L(404,`Rota não encontrada.`)}async function To(';
if (!source.includes(before)) throw new Error('Fallback de diagnóstico não encontrado.');
source = source.replace(before, after);
fs.writeFileSync(target, source);
