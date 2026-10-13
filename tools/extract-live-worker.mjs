import fs from 'node:fs';
import path from 'node:path';

const source = path.join(process.env.TEMP, 'worker-content-275720564.bin');
const destination = '.live-worker-current-1204';
if (fs.existsSync(destination)) throw new Error('Destination already exists.');
const raw = fs.readFileSync(source, 'utf8');
const boundary = raw.slice(0, raw.indexOf('\n')).trim().replace(/^--/, '');
fs.mkdirSync(destination);
for (const part of raw.split(`--${boundary}`)) {
  const match = part.match(/Content-Disposition: form-data; name="([^"]+)"/);
  if (!match) continue;
  let splitAt = part.indexOf('\r\n\r\n');
  let separatorLength = 4;
  if (splitAt < 0) { splitAt = part.indexOf('\n\n'); separatorLength = 2; }
  if (splitAt < 0) continue;
  const body = part.slice(splitAt + separatorLength).replace(/[\r\n]+$/, '');
  const target = path.join(destination, match[1]);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
}
