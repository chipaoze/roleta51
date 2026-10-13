import { promises as fs } from 'node:fs';
import path from 'node:path';

function safeName(key) {
  const name = path.basename(String(key || ''));
  if (!name || name !== key) throw new Error('Nome de arquivo inválido.');
  return name;
}

export function createFileMediaStore(directory) {
  return {
    async put(key, value, options = {}) {
      const name = safeName(key);
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, name), Buffer.from(value));
      await fs.writeFile(path.join(directory, name + '.metadata.json'), JSON.stringify(options.metadata || {}));
    },
    async delete(key) {
      const name = safeName(key);
      await Promise.all([
        fs.rm(path.join(directory, name), { force: true }),
        fs.rm(path.join(directory, name + '.metadata.json'), { force: true }),
      ]);
    },
    async getWithMetadata(key, type) {
      const name = safeName(key);
      try {
        const [buffer, metadataText] = await Promise.all([
          fs.readFile(path.join(directory, name)),
          fs.readFile(path.join(directory, name + '.metadata.json'), 'utf8').catch(() => '{}'),
        ]);
        return {
          value: type === 'arrayBuffer'
            ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
            : buffer,
          metadata: JSON.parse(metadataText),
        };
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },
  };
}
