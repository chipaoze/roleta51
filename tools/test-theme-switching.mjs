import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
const themes = [...server.matchAll(/type: 'siteTheme', value: '([^']+)'/g)].map(m=>m[1]);
const classes = new Set();
const classList = { add: v=>classes.add(v), toggle: (v,on)=>on?classes.add(v):classes.delete(v) };
const button = { setAttribute(){} };
let dark = false;
const apply = vm.runInNewContext(app.slice(app.indexOf('function applyPersonalTheme('),app.indexOf('function applyShopPreviewVisual('))+';applyPersonalTheme', {
  document:{body:{classList}},appState:{},$:()=>button,
  applyVisualTheme(){ classList.toggle('theme-dark',dark); button.disabled=false; },
});
for (const preference of [false,true]) {
  dark = preference;
  for (const from of themes) for (const to of themes) {
    apply(from); apply(to);
    assert.deepEqual([...classes].filter(c=>c.startsWith('profile-theme-')),['profile-theme-'+to]);
    assert.ok(classes.has('theme-dark'));
    apply(null);
    assert.equal(classes.has('theme-dark'),preference);
    assert.equal(button.disabled,false);
  }
}
const css = await readFile(new URL('../public/styles.css',import.meta.url),'utf8');
assert.ok(!css.includes('body.profile-theme-galaxy .app>*'));
console.log(`PASS: all ${themes.length} shop themes switch cleanly, including Nebula, and restore both base preferences.`);
