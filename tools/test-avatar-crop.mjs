import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../public/avatar-crop.js', import.meta.url), 'utf8');
const bounds = vm.runInNewContext(source + '; avatarCropBounds');
for (const [w,h] of [[4000,1000],[1000,4000],[800,800],[80,60]]) {
  for (const zoom of [1,2,4]) for (const n of [-10000,0,10000]) {
    const p = bounds(w,h,zoom,n,-n);
    const left = (320-w*p.scale)/2+p.x, top = (320-h*p.scale)/2+p.y;
    assert.ok(left <= 0 && top <= 0);
    assert.ok(left+w*p.scale >= 320 && top+h*p.scale >= 320);
  }
}
assert.match(source, /canvas\.toDataURL\('image\/jpeg', 0\.88\)/);
assert.match(source, /URL\.revokeObjectURL\(url\)/);
console.log('PASS: landscape, portrait, small and square crops stay fully covered at every zoom and drag limit.');
