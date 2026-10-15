import assert from 'node:assert/strict';
import { Script } from 'node:vm';

const base = process.env.NEXO_VERIFY_URL || 'http://localhost:3000';
const root = await fetch(base + '/?vista=assistant', {redirect:'manual'});
assert.equal(root.status,302);
assert.equal(root.headers.get('location'),'/nexo-prototipo.html?vista=assistant');
const page = await fetch(base + root.headers.get('location'));
assert.equal(page.status,200); assert.match(page.headers.get('cache-control'),/no-store/);
const html = await page.text();
assert.match(html,/Estado desconocido/); assert.match(html,/screen-workspaces/);
assert.doesNotMatch(html,/data-demo=|Torre Norte|Informe de Seguridad Abril.pdf/);
assert.doesNotMatch(html,/http-equiv=["']refresh|Hoy 08:45 AM/);
for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Script(match[1]);
for (const file of ['nexo-ragflow.js','workspace.js','nexo-live.js']) {
  const response = await fetch(base + '/' + file); assert.equal(response.status,200);
  assert.match(response.headers.get('cache-control'),/no-store/);
  const source = await response.text(); new Script(source.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,''));
  if (file === 'nexo-ragflow.js') assert.match(source,/Por incorporar/);
  else if (file === 'workspace.js') assert.match(source,/Volver a NEXO/);
}
for (const path of ['/api/datasets','/api/mcp/tools','/api/activity','/api/reports','/api/workspaces','/api/datasets/example/graph']) {
  const response = await fetch(base + path); assert.equal(response.status,401,path);
}
console.log('HTTP verification passed: canonical route, served assets, script syntax, cache policy, and unauthenticated API boundaries. Browser interactions and layout are not covered.');
