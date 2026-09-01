import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/client/', import.meta.url));
const base = 'https://roleta51.roleta-area51.workers.dev/';

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }));
  return nested.flat();
}

const digest = (value) => createHash('sha256').update(value).digest('hex');
const mismatches = [];

for (const file of await files(root)) {
  const path = relative(root, file).split(sep).join('/');
  const local = await readFile(file);
  const response = await fetch(new URL(path, base));
  const remote = Buffer.from(await response.arrayBuffer());
  if (!response.ok || digest(local) !== digest(remote)) {
    mismatches.push({ path, status: response.status, local: local.length, remote: remote.length });
  }
}

console.log(JSON.stringify({ files: (await files(root)).length, mismatches }, null, 2));
