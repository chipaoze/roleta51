import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const [, , manifestFile, destination] = process.argv;
if (!manifestFile || !destination) {
  console.error('Uso: node tools/export-kv-media.mjs <manifest.json> <diretorio-destino>');
  process.exit(2);
}
if (existsSync(destination)) {
  console.error(`Destino já existe e foi preservado: ${destination}`);
  process.exit(2);
}

const entries = JSON.parse(await readFile(manifestFile, 'utf8'));
if (!Array.isArray(entries) || !entries.every((entry) => typeof entry?.name === 'string' && path.basename(entry.name) === entry.name)) {
  console.error('Manifesto de mídia inválido.');
  process.exit(2);
}

await mkdir(destination, { recursive: false });
const concurrency = 4;
let cursor = 0;
const checksums = [];

function getMedia(entry) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve('node_modules/wrangler/bin/wrangler.js'), 'kv', 'key', 'get', entry.name, '--binding', 'MEDIA', '--remote', '--config', 'wrangler.cloudflare.jsonc'], {
      cwd: path.resolve('.'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`${entry.name}: ${Buffer.concat(stderr).toString('utf8').trim() || `exit ${code}`}`));
      else resolve(Buffer.concat(stdout));
    });
  });
}

async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= entries.length) return;
    const entry = entries[index];
    const content = await getMedia(entry);
    await writeFile(path.join(destination, entry.name), content);
    await writeFile(path.join(destination, `${entry.name}.metadata.json`), JSON.stringify(entry.metadata || {}));
    checksums.push({ name: entry.name, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') });
    console.info(`[media-backup] ${index + 1}/${entries.length} ${entry.name}`);
  }
}

try {
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, worker));
  checksums.sort((left, right) => left.name.localeCompare(right.name));
  await writeFile(path.join(destination, 'manifest.sha256.json'), JSON.stringify(checksums, null, 2));
  console.info(JSON.stringify({ ok: true, files: checksums.length }));
} catch (error) {
  console.error(`Backup de mídia interrompido; os arquivos já baixados foram preservados: ${error.message}`);
  process.exitCode = 1;
}
