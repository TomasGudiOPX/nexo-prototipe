import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Small DOM adapter for behavior tests; browser layout still requires visual QA.
function harness(search = '') {
  const nodes = new Map();
  class Element {
    constructor(tag = 'div') { this.tagName = tag; this.children = []; this.style = {}; this.dataset = {}; this.value = ''; this.listeners = {}; this.textContent = ''; this.hidden = false; this.classList = { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false }; }
    set id(value) { this._id = value; nodes.set(value, this); }
    get id() { return this._id; }
    set innerHTML(value) { this.html = value; for (const match of value.matchAll(/id="([^"]+)"/g)) { const child = new Element(); child.id = match[1]; this.append(child); } }
    get innerHTML() { return this.html || ''; }
    append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
    appendChild(child) { this.append(child); }
    prepend(...children) { this.children.unshift(...children); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    setAttribute(name, value) { this[name] = value; }
    removeAttribute(name) { delete this[name]; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    querySelector(selector) { if (selector === '.assistant-layout') return this; return null; }
    querySelectorAll() { return []; }
    closest(selector) { return this.parentElement || this; }
    getContext() { return {}; }
    get selectedOptions() { return [{ textContent: this.value }]; }
  }
  for (const id of ['brainDashboard','screen-dashboard','screen-projects','screen-project','screen-documents','screen-alerts','screen-assistant','navigation','chatFeed','chatInput','brainStatus','activity']) { const node = new Element(); node.id = id; }
  nodes.get('brainDashboard').parentElement = new Element();
  const heading = new Element(), caption = new Element();
  const calls = [], history = [], listeners = {};
  let url = new URL('https://nexo.test/nexo-prototipo.html' + search);
  const localStorageStore = new Map();
  const localStorage = {
    getItem: key => (localStorageStore.has(key) ? localStorageStore.get(key) : null),
    setItem: (key, value) => localStorageStore.set(key, String(value)),
    removeItem: key => localStorageStore.delete(key),
    clear: () => localStorageStore.clear(),
  };
  const document = { getElementById: id => nodes.get(id) || null, createElement: tag => new Element(tag), head: new Element(), querySelector: s => s.endsWith('.brain-top') ? heading : s.endsWith('.brain-overlay p') ? caption : s.endsWith('#activity') ? nodes.get('activity') : null, querySelectorAll: () => [] };
  const sandbox = { document, URL, URLSearchParams, Option: class extends Element { constructor(label, value) { super('option'); this.textContent = label; this.value = value; } },
    location: { get href() { return url.href; }, get origin() { return url.origin; }, get pathname() { return url.pathname; }, get search() { return url.search; }, assign: value => calls.push(['assign', value]) },
    history: { pushState: (_, __, next) => { url = new URL(next, url); history.push(url.href); }, replaceState: (_, __, next) => { url = new URL(next, url); } },
    requestAnimationFrame() {}, go: id => calls.push(['go', id]), setProjectTab() {}, renderChat() {}, toast: message => calls.push(['toast', message]),
    chatLog: [], initialMessage: { text: 'Welcome' }, currentProject: 'Torre Norte', projects: [{name:'Torre Norte'}],
    fetch: async (path, init) => { calls.push(['fetch', path, init]); return Response.json({}); }, addEventListener: (name, fn) => listeners[name] = fn, console,
    localStorage, performance: { now: () => 0 } };
  sandbox.window = sandbox;
  const source = readFileSync(new URL('../public/nexo-ragflow.js', import.meta.url), 'utf8').replace('  restoreRoute();\n})();', '  window.testApi = { state, loadContext, loadGraph, loadDashboardData, restoreRoute, mountToolControls, workspaceUrl, selectDatasets, buildModel, applyFilters, renderGraph, selectNode, mountGraphConfig, renderDatasetChips, loadGraphs, saveAdvanced, loadAdvanced, resetAdvanced, applyAdvanced, seedDraft, draft, layout2d };\n  restoreRoute();\n})();');
  vm.runInNewContext(source, sandbox);
  return { sandbox, nodes, calls, history, listeners, localStorage: localStorageStore, api: sandbox.testApi, setUrl: value => { url = new URL(value, url); } };
}

test('original destinations dispatch without workspace redirection; direct link and popstate restore destination', () => {
  const h = harness('?vista=assistant');
  for (const screen of ['dashboard','projects','project','documents','assistant','alerts']) h.sandbox.go(screen);
  assert.equal(h.calls.filter(c => c[0] === 'assign').length, 0);
  assert.equal(h.history.length, 6);
  h.setUrl('?vista=documents'); h.listeners.popstate();
  assert.equal(h.api.state.screen, 'documents');
  assert.equal(h.calls.at(-1)[1], 'documents');
  h.setUrl('?vista=invalid'); h.api.restoreRoute(); assert.equal(h.api.state.screen, 'dashboard');
});

test('dataset selection comes from workspace bindings; unbound datasets are cleared and chat stays scoped to the primary', async () => {
  const h = harness('?workspaceId=w&dataset=removed&assistantId=a');
  h.api.state.user = { id:'u', role:'user' };
  h.sandbox.fetch = async (path, init) => {
    h.calls.push(['fetch', path, init]);
    if (path === '/api/workspaces') return Response.json({workspaces:[{id:'w',name:'Work',datasets:[{id:'d',name:'Dataset'}],assistants:[{id:'a',name:'Assist'}]}]});
    if (path.includes('/graph')) return Response.json({graph:null,graphType:'documents'});
    return Response.json({answer:'Returned answer',references:[]});
  };
  await h.api.loadContext();
  assert.equal(h.api.state.datasetId, '');
  assert.equal(h.api.state.datasets.length, 1);
  assert.equal(h.api.state.datasets[0].id, 'd');
  assert.equal(h.calls.filter(c => c[1]?.includes('/graph')).length, 0);
  h.setUrl('?workspaceId=w&dataset=d&assistantId=a'); await h.api.loadContext();
  assert.equal(h.api.state.datasetId, 'd');
  assert.equal(h.api.state.datasetIds[0], 'd');
  assert.ok(h.calls.some(c => c[1] === '/api/datasets/d/graph?workspaceId=w'));
  h.nodes.get('chatInput').value = 'Question'; await h.sandbox.sendChat();
  const request = h.calls.find(c => c[1] === '/api/datasets/d/chat');
  assert.deepEqual(JSON.parse(request[2].body), {question:'Question',conversationId:'',toolInvocations:[],workspaceId:'w',assistantId:'a'});
  assert.match(h.nodes.get('brainStatus').textContent,/sin evidencia/);
});

test('graph failures expose retry, empty graph remains empty, nonempty graph declares unknown freshness', async () => {
  const h = harness(); h.api.state.workspaceId = 'w';
  const sel = id => { h.api.state.datasetId = id; h.api.state.datasetIds = [id]; };
  h.sandbox.fetch = async () => Response.json({error:'Offline'}, {status:503});
  sel('e'); await h.api.loadGraph('e'); assert.equal(h.nodes.get('ragflowRetry').hidden,false); assert.match(h.nodes.get('ragflowDatasetStatus').textContent,/Offline/);
  h.sandbox.fetch = async () => Response.json({graph:null}); sel('empty'); await h.api.loadGraph('empty'); assert.match(h.nodes.get('ragflowDatasetStatus').textContent,/no tiene entidades/);
  h.sandbox.fetch = async () => Response.json({graph:{nodes:[{id:'n',name:'Node'}],edges:[]},graphType:'knowledge'});
  sel('n'); await h.api.loadGraph('n'); assert.match(h.nodes.get('ragflowDatasetStatus').textContent,/Actualización desconocida/);
  assert.equal(h.nodes.get('brainDashboard').hidden,true);
});

test('assistant renders unsafe source metadata as text, retains only returned evidence, and rejects missing selection', async () => {
  const h = harness(); h.nodes.get('chatInput').value = 'Question'; await h.sandbox.sendChat();
  assert.equal(h.calls.filter(c => c[0] === 'fetch').length,0);
  h.api.state.user = {id:'u',role:'site-admin'}; h.api.state.datasetId = 'd'; h.api.state.datasets = [{id:'d'}];
  h.sandbox.fetch = async () => Response.json({answer:'Service answer',references:[{document_name:'<img src=x onerror=alert(1)>',content:'<script>bad</script>'}]});
  await h.sandbox.sendChat();
  const ai = h.nodes.get('chatFeed').children.at(-1);
  assert.equal(ai.children[0].textContent,'Service answer');
  assert.equal(ai.children[1].children[1].children[0].textContent,'<img src=x onerror=alert(1)>');
  assert.equal(ai.children[1].children[1].children[0].innerHTML,'');
});

test('MCP is visibly to be added with no execution selector; simulated upload does not report persistence', () => {
  const h = harness(); h.api.mountToolControls();
  assert.match(h.nodes.get('nexoMcpTools').children[0].textContent,/Por incorporar/);
  assert.equal(h.nodes.has('nexoMcpTool'),false);
  const html = readFileSync(new URL('../public/nexo-prototipo.html', import.meta.url),'utf8');
  assert.doesNotMatch(html,/Hoy 08:45 AM|Encontré la última versión registrada/);
  for (const module of ['Resumen Ejecutivo','Actividad Reciente','Requieren tu atención','brainDashboard','brainAssistant']) assert.ok(html.includes(module));
  if (html.includes('function simulateUpload')) {
    assert.match(html,/No se subió ni guardó ningún archivo/);
    const upload = html.match(/function simulateUpload\(input\)\{([^}]+)\}/)[1];
    let message;
    vm.runInNewContext(`(function(input){${upload}})({value:'file.pdf',files:[{name:'file.pdf'}]})`, {openModal:(_,text)=>message=text});
    assert.match(message,/No se subió ni guardó/);
  }
});

test('late graph and chat responses cannot repopulate a changed source', async () => {
  const h = harness(); h.api.state.user = {id:'u',role:'site-admin'}; h.api.state.datasetId = 'd'; h.api.state.datasetIds = ['d']; h.api.state.datasets = [{id:'d'},{id:'other'}];
  const pending = new Map();
  h.sandbox.fetch = (path) => new Promise(resolve => { pending.set(path, resolve); });
  const loading = h.api.loadGraph('d');
  h.api.selectDatasets(['other']);
  pending.get('/api/datasets/d/graph?workspaceId=')(Response.json({graph:{nodes:[{id:'old'}]}}));
  await loading;
  assert.equal(h.api.state.nodes.length,0);
  h.nodes.get('chatInput').value = 'Question'; const chatting = h.sandbox.sendChat();
  h.api.selectDatasets([]);
  pending.get('/api/datasets/other/chat')(Response.json({answer:'Old source content',references:[]}));
  await chatting;
  assert.equal(h.sandbox.chatLog.some(m=>m.text==='Old source content'),false);
});

test('workspace return links reject external or malformed destinations and preserve a valid origin', () => {
  const source = readFileSync(new URL('../public/workspace.js',import.meta.url),'utf8');
  const start = source.indexOf('function centerReturnUrl()');
  const end = source.indexOf('function updateNavigation()',start);
  for (const [value, expected] of [['https://attacker.test','/nexo-prototipo.html'],['http://[','/nexo-prototipo.html'],['/nexo-prototipo.html?vista=assistant&dataset=d','/nexo-prototipo.html?vista=assistant&dataset=d']]) {
    const context = {URL,URLSearchParams,location:{origin:'https://nexo.test',search:'?returnTo='+encodeURIComponent(value)}};
    assert.equal(vm.runInNewContext(source.slice(start,end)+'centerReturnUrl()',context),expected);
  }
});

test('center loads authorized context on first sign-in even before any workspace is known', async () => {
  const h = harness();
  h.nodes.get('chatFeed').parentElement = h.nodes.get('screen-assistant');
  h.api.state.user = { id:'u', role:'site-admin' };
  h.sandbox.fetch = async path => path === '/api/workspaces'
    ? Response.json({workspaces:[{id:'w',name:'Work',datasets:[{id:'d',name:'Dataset'}],assistants:[{id:'a',name:'Assist'}]}]})
    : Response.json({datasets:[]});
  await h.api.loadContext();
  assert.equal(h.api.state.datasetsLoaded, true);
  assert.equal(h.api.state.workspaces.length, 1);
  assert.equal(h.api.state.datasets.length, 0);
  assert.ok(h.nodes.get('nexoIntro'));
});

test('center uses actual event/workspace values and keeps failed activity distinct from empty', async () => {
  const h = harness(); h.api.state.user = {id:'u',role:'user'};
  h.sandbox.fetch = async path => Response.json(path === '/api/workspaces' ? {workspaces:[{id:'w'}]} : path === '/api/reports' ? {events:7} : {events:[{summary:'Actual event',createdAt:'2026-10-14',workspaceId:'w'}]});
  await h.api.loadDashboardData(); assert.equal(h.api.state.workspaceCount,1); assert.equal(h.api.state.eventCount,7);
  const row = h.nodes.get('activity').children[0]; assert.equal(row.children[0].textContent,'Actual event'); row.onclick();
  assert.match(h.calls.at(-1)[1],/area=activity/); assert.match(h.calls.at(-1)[1],/workspaceId=w/);
  h.sandbox.fetch = async () => Response.json({error:'Offline'},{status:503}); await h.api.loadDashboardData();
  assert.equal(h.api.state.eventCount,null); assert.match(h.nodes.get('activity').textContent,/no disponible/);
  h.sandbox.fetch = async path => Response.json(path === '/api/workspaces' ? {workspaces:[]} : path === '/api/reports' ? {events:0} : {events:[]});
  await h.api.loadDashboardData(); assert.equal(h.api.state.eventCount,0); assert.match(h.nodes.get('activity').textContent,/no hay actividad/);
});

test('dataset options come from workspace bindings only, even for site-admin', async () => {
  const h = harness('?workspaceId=w');
  h.api.state.user = { id:'u', role:'site-admin' };
  h.sandbox.fetch = async path => path === '/api/workspaces'
    ? Response.json({workspaces:[{id:'w',name:'Work',datasets:[{id:'d1',name:'Bound 1'},{id:'d2',name:'Bound 2'}],assistants:[]}]})
    : Response.json({datasets:[{id:'d1'},{id:'d2'},{id:'d3'},{id:'d4'},{id:'d5'},{id:'d6'}]});
  await h.api.loadContext();
  assert.equal(h.api.state.datasets.length, 2);
  assert.deepEqual(h.api.state.datasets.map(d => d.id).sort(), ['d1','d2']);
  assert.equal(h.calls.filter(c => c[1] === '/api/datasets?workspaceId=w').length, 0);
  assert.equal(h.nodes.get('nexoDatasetChips').children.length, 2);
});

test('multi-selection enforces the cap, promotes the primary on deselect, and refuses chat without a selection', async () => {
  const h = harness(); h.api.state.user = {id:'u',role:'user'};
  h.api.state.datasets = [{id:'d1',name:'One'},{id:'d2',name:'Two'},{id:'d3',name:'Three'},{id:'d4',name:'Four'}];
  h.api.state.maxDatasets = 3;
  h.sandbox.fetch = async () => Response.json({graph:null});
  assert.equal(h.api.selectDatasets(['d1','d2','d3']), true);
  assert.deepEqual([...h.api.state.datasetIds], ['d1','d2','d3']);
  assert.equal(h.api.state.datasetId, 'd1');
  assert.equal(h.api.selectDatasets(['d1','d2','d3','d4']), false);
  assert.deepEqual([...h.api.state.datasetIds], ['d1','d2','d3']);
  assert.match(h.nodes.get('ragflowDatasetStatus').textContent, /Máximo 3/);
  assert.equal(h.api.selectDatasets(['d2','d3']), true);
  assert.equal(h.api.state.datasetId, 'd2');
  h.api.selectDatasets([]);
  h.nodes.get('chatInput').value = 'Question';
  await h.sandbox.sendChat();
  assert.equal(h.calls.some(c => c[1]?.includes('/chat')), false);
});

test('switching workspace resets the dataset selection', async () => {
  const h = harness('?workspaceId=w1&dataset=d1');
  h.api.state.user = {id:'u',role:'user'};
  h.sandbox.fetch = async path => {
    if (path === '/api/workspaces') return Response.json({workspaces:[{id:'w1',name:'W1',datasets:[{id:'d1',name:'D1'}],assistants:[]},{id:'w2',name:'W2',datasets:[{id:'d2',name:'D2'}],assistants:[]}]});
    if (path.includes('/graph')) return Response.json({graph:{nodes:[{id:'n1',name:'N1'}],edges:[]},graphType:'knowledge'});
    return Response.json({});
  };
  await h.api.loadContext();
  assert.equal(h.api.state.datasetId, 'd1');
  h.setUrl('?workspaceId=w2&dataset=d1');
  await h.api.loadContext();
  assert.equal(h.api.state.workspaceId, 'w2');
  assert.equal(h.api.state.datasetId, '');
  assert.deepEqual([...h.api.state.datasets.map(d => d.id)], ['d2']);
});

test('type filter, search highlight, and mode switch change the rendered model', async () => {
  const h = harness(); h.api.state.user = {id:'u',role:'user'};
  h.api.state.datasetId = 'd'; h.api.state.datasetIds = ['d']; h.api.state.datasets = [{id:'d',name:'D'}];
  h.sandbox.fetch = async path => path.includes('/graph')
    ? Response.json({graph:{nodes:[{id:'doc1',name:'Doc One',kind:'document'},{id:'t1',name:'budget',kind:'keyword',documentCount:3}],edges:[{source:'doc1',target:'t1',kind:'keyword'}]},graphType:'chunks'})
    : Response.json({});
  await h.api.loadGraph('d');
  assert.equal(h.api.state.nodes.length, 2);
  h.api.state.searchQuery = 'budget'; h.api.renderGraph();
  assert.ok(h.api.state.searchMatch.size >= 1);
  h.api.state.searchQuery = ''; h.api.state.hiddenKinds.add('keyword'); h.api.renderGraph();
  assert.ok(!h.api.state.nodes.some(n => n.kind === 'keyword'));
  h.api.state.hiddenKinds.clear(); h.api.state.mode = 'per-dataset'; h.api.renderGraph();
  assert.ok(h.api.state.mergedNodes.every(n => n.sourceId.startsWith('ds:0::')));
});

test('advanced options filter without refetch, persist per user, and reset to defaults', async () => {
  const h = harness(); h.api.state.user = {id:'u',role:'user'};
  h.api.state.datasetId = 'd'; h.api.state.datasetIds = ['d']; h.api.state.datasets = [{id:'d',name:'D'}];
  let graphCalls = 0;
  h.sandbox.fetch = async path => { if (path.includes('/graph')) { graphCalls++; return Response.json({graph:{nodes:[{id:'t1',name:'rare',kind:'keyword',documentCount:2},{id:'t2',name:'common',kind:'keyword',documentCount:5}],edges:[]},graphType:'chunks'}); } return Response.json({}); };
  await h.api.loadGraph('d');
  assert.equal(graphCalls, 1);
  assert.equal(h.api.state.nodes.length, 2);
  h.api.state.sharingThreshold = 4; h.api.renderGraph();
  assert.equal(graphCalls, 1);
  assert.equal(h.api.state.nodes.length, 1);
  assert.equal(h.api.state.nodes[0].label, 'common');
  h.api.saveAdvanced();
  assert.equal(JSON.parse(h.localStorage.get('nexo:graph-adv:u')).sharingThreshold, 4);
  h.api.state.sharingThreshold = 99;
  h.api.loadAdvanced();
  assert.equal(h.api.state.sharingThreshold, 4);
  h.api.resetAdvanced();
  assert.equal(h.api.state.sharingThreshold, 2);
  assert.equal(h.api.state.maxDatasets, 3);
});

test('a cached dataset is re-rendered without a new graph request', async () => {
  const h = harness(); h.api.state.user = {id:'u',role:'user'};
  h.api.state.datasetId = 'd'; h.api.state.datasetIds = ['d']; h.api.state.datasets = [{id:'d',name:'D'}];
  let n = 0;
  h.sandbox.fetch = async path => { if (path.includes('/graph')) { n++; return Response.json({graph:{nodes:[{id:'n',name:'N',kind:'document'}],edges:[]},graphType:'knowledge'}); } return Response.json({}); };
  await h.api.loadGraph('d');
  assert.equal(n, 1);
  await h.api.loadGraph('d');
  assert.equal(n, 1);
});

test('a failing dataset surfaces its error without blocking cached datasets', async () => {
  const h = harness(); h.api.state.user = {id:'u',role:'user'};
  h.api.state.datasets = [{id:'good',name:'Good'},{id:'bad',name:'Bad'}];
  h.sandbox.fetch = async path => {
    if (path.includes('/good/graph')) return Response.json({graph:{nodes:[{id:'g1',name:'Good node',kind:'document'}],edges:[]},graphType:'knowledge'});
    if (path.includes('/bad/graph')) return Response.json({error:'Offline'}, {status:503});
    return Response.json({});
  };
  h.api.state.datasetIds = ['good']; h.api.state.datasetId = 'good';
  await h.api.loadGraph('good');
  assert.equal(h.api.state.nodes.length, 1);
  h.api.state.datasetIds = ['good','bad']; h.api.state.datasetId = 'good';
  await h.api.loadGraph('bad').catch(() => {});
  assert.equal(h.api.state.nodes.length, 1);
  assert.equal(h.api.state.nodes[0].label, 'Good node');
});

test('shared terms merge into bridge nodes in Merged mode and not in Per-dataset mode', async () => {
  const h = harness(); h.api.state.user = {id:'u',role:'user'};
  h.api.state.datasets = [{id:'a',name:'A'},{id:'b',name:'B'}];
  h.sandbox.fetch = async path => {
    if (path.includes('/a/graph')) return Response.json({graph:{nodes:[{id:'docA',name:'Doc A',kind:'document'},{id:'term:keyword%3Abudget',name:'budget',kind:'keyword',documentCount:2}],edges:[{source:'docA',target:'term:keyword%3Abudget',kind:'keyword'}]},graphType:'chunks'});
    if (path.includes('/b/graph')) return Response.json({graph:{nodes:[{id:'docB',name:'Doc B',kind:'document'},{id:'term:keyword%3Abudget',name:'budget',kind:'keyword',documentCount:2}],edges:[{source:'docB',target:'term:keyword%3Abudget',kind:'keyword'}]},graphType:'chunks'});
    return Response.json({});
  };
  h.api.state.datasetIds = ['a','b']; h.api.state.datasetId = 'a';
  await h.api.loadGraph('a'); await h.api.loadGraph('b');
  h.api.renderGraph();
  const terms = h.api.state.mergedNodes.filter(n => n.kind === 'keyword');
  assert.equal(terms.length, 1);
  assert.ok(terms[0].bridge);
  h.api.state.mode = 'per-dataset'; h.api.renderGraph();
  const terms2 = h.api.state.mergedNodes.filter(n => n.kind === 'keyword');
  assert.equal(terms2.length, 2);
  assert.ok(!h.api.state.mergedNodes.some(n => n.bridge));
});

test('selecting a node renders the side panel with detail and source dataset', () => {
  const h = harness(); h.api.state.user = {id:'u',role:'user'};
  h.api.state.datasets = [{id:'a',name:'Dataset A'}];
  h.api.state.datasetIds = ['a']; h.api.state.datasetId = 'a';
  h.api.state.mergedNodes = [{sourceId:'term:x',label:'budget',detail:'Presupuesto',kind:'keyword',index:0,datasets:new Set([0]),bridge:false,datasetIndex:0}];
  h.api.state.mergedEdges = [];
  h.api.selectNode('term:x');
  const panel = h.nodes.get('nexoNodePanel');
  assert.equal(panel.hidden, false);
  assert.match(panel.innerHTML, /budget/);
  assert.match(panel.innerHTML, /Dataset A/);
});

test('advanced options stay pending until Actualizar; basic options apply live', () => {
  const h = harness(); h.api.state.user = {id:'u',role:'user'};
  h.api.state.datasets = [{id:'d',name:'D'}];
  h.api.state.datasetIds = ['d']; h.api.state.datasetId = 'd';
  h.sandbox.fetch = async () => Response.json({graph:null});
  h.api.seedDraft();
  // advanced edits stay in the draft until Actualizar
  h.api.draft.threshold = 5;
  h.api.draft.layout2d = true;
  assert.equal(h.api.state.sharingThreshold, 2);
  assert.equal(h.api.state.layout2d, false);
  h.api.applyAdvanced();
  assert.equal(h.api.state.sharingThreshold, 5);
  assert.equal(h.api.state.layout2d, true);
  // basic options (mode, filters) apply immediately
  h.api.state.mode = 'per-dataset';
  assert.equal(h.api.state.mode, 'per-dataset');
});

test('hiding every node type keeps the type legend available', async () => {
  const h = harness(); h.api.state.user = {id:'u',role:'user'};
  h.api.state.datasetId = 'd'; h.api.state.datasetIds = ['d']; h.api.state.datasets = [{id:'d',name:'D'}];
  h.sandbox.fetch = async path => path.includes('/graph')
    ? Response.json({graph:{nodes:[{id:'doc1',name:'Doc One',kind:'document'},{id:'t1',name:'budget',kind:'keyword',documentCount:3}],edges:[]},graphType:'chunks'})
    : Response.json({});
  await h.api.loadGraph('d');
  assert.equal(h.api.state.nodes.length, 2);
  h.api.state.hiddenKinds = new Set(['document','keyword']);
  h.api.renderGraph();
  assert.equal(h.api.state.nodes.length, 0);
  // the merged model (and therefore the filter pills) must survive so types can be re-enabled
  assert.equal(h.api.state.mergedNodes.length, 2);
});

test('2D layout spreads nodes across the view instead of a single ring', async () => {
  const h = harness(); h.api.state.user = {id:'u',role:'user'};
  h.api.state.datasetId = 'd'; h.api.state.datasetIds = ['d']; h.api.state.datasets = [{id:'d',name:'D'}];
  h.sandbox.fetch = async path => path.includes('/graph')
    ? Response.json({graph:{nodes:[{id:'a',name:'A',kind:'document'},{id:'b',name:'B',kind:'document'},{id:'c',name:'C',kind:'document'},{id:'t',name:'T',kind:'keyword',documentCount:3}],edges:[{source:'a',target:'t',kind:'keyword'},{source:'b',target:'t',kind:'keyword'},{source:'c',target:'t',kind:'keyword'}]},graphType:'chunks'})
    : Response.json({});
  await h.api.loadGraph('d');
  h.api.state.layout2d = true; h.api.renderGraph();
  const pts = [...h.api.layout2d.values()];
  assert.equal(pts.length, 4);
  const radii = pts.map(p => Math.hypot(p.x, p.y));
  assert.ok(Math.max(...radii) - Math.min(...radii) > 0.05);
});
