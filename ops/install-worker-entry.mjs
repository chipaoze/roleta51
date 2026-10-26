import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'ops/worker-entry.js');
const target = resolve(root, 'dist/server/worker-entry.js');
const built = resolve(root, 'dist/server/index.js');
if (!existsSync(built)) throw new Error('Build do Worker ausente; rode npm run build antes do deploy.');
if (!readFileSync(source, 'utf8').includes("import siteWorker from './index.js'")) throw new Error('Entrada leve inválida.');
copyFileSync(source, target);
console.log('Entrada leve da API instalada no bundle do Worker.');
