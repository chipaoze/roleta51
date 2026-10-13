import fs from 'node:fs';

const [target] = process.argv.slice(2);
let source = fs.readFileSync(target, 'utf8');
const marker = 'throw new L(404,`Rota não encontrada.`)}async function To(';
const diagnostic = 'throw new L(404,`Rota não encontrada: `+e.method+` | `+s+` | `+String(e.url||``))}async function To(';
if (!source.includes(marker)) throw new Error('Fallback final não encontrado.');
source = source.replace(marker, diagnostic);
fs.writeFileSync(target, source);
