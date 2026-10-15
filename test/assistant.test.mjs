import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Minimal DOM adapter: enough shape for assistant.js (classes, ids, descendant
// selectors, events). Visual layout still needs browser QA.
class El {
  constructor(tag = "div") {
    this.tagName = tag; this.children = []; this.className = ""; this._id = "";
    this.style = {}; this.listeners = {}; this.attributes = {}; this.textContent = "";
    this.disabled = false; this.value = ""; this.title = ""; this.scrollTop = 0; this.parentElement = null; this.dataset = {};
  }
  set id(value) { this._id = value; if (El.registry) El.registry.set(value, this); }
  get id() { return this._id; }
  get classList() {
    const self = this;
    const list = () => self.className.split(" ").filter(Boolean);
    return {
      add: (...names) => { self.className = [...new Set([...list(), ...names])].join(" "); },
      remove: (...names) => { self.className = list().filter(name => !names.includes(name)).join(" "); },
      contains: name => list().includes(name),
      toggle: () => {},
    };
  }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  appendChild(node) { this.append(node); return node; }
  prepend(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.unshift(node); } }
  after(node) { const parent = this.parentElement; if (!parent) return; node.parentElement = parent; parent.children.splice(parent.children.indexOf(this) + 1, 0, node); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() { const parent = this.parentElement; if (parent) { parent.children = parent.children.filter(child => child !== this); this.parentElement = null; } }
  setAttribute(name, value) { this.attributes[name] = value; this[name] = value; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  removeEventListener() {}
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) { return descendants(this).filter(node => matches(node, selector)); }
}

function descendants(node) {
  return node.children.flatMap(child => [child, ...descendants(child)]);
}
function matchesSimple(node, part) {
  const name = part.replace(/^[.#]/, "");
  if (part.startsWith(".")) return node.className.split(" ").includes(name);
  if (part.startsWith("#")) return node.id === name;
  return node.tagName === part;
}
// Supports descendant selectors ("ancestor target") by climbing from the node.
function matches(node, selector) {
  const parts = selector.trim().split(/\s+/);
  let current = node;
  for (let index = parts.length - 1; index >= 0; index--) {
    if (!matchesSimple(current, parts[index])) return false;
    if (index === 0) break;
    let ancestor = current.parentElement;
    while (ancestor && !matchesSimple(ancestor, parts[index - 1])) ancestor = ancestor.parentElement;
    if (!ancestor) return false;
    current = ancestor;
  }
  return true;
}

function harness({ search = "", session = { user: null }, workspaces = { workspaces: [] } } = {}) {
  const nodes = new Map();
  El.registry = nodes;
  const register = element => { if (element.id) nodes.set(element.id, element); return element; };

  const screen = register(Object.assign(new El("section"), { id: "screen-assistant" }));
  const layout = new El("div"); layout.className = "assistant-layout";
  const chatbox = new El("div"); chatbox.className = "panel chatbox";
  const feed = register(Object.assign(new El("div"), { id: "chatFeed" }));
  const suggestions = new El("div"); suggestions.className = "chat-suggestions";
  suggestions.append(new El("button"), new El("button"));
  const inputRow = new El("div"); inputRow.className = "chat-input";
  const input = register(Object.assign(new El("input"), { id: "chatInput" }));
  const round = new El("button"); round.className = "round";
  inputRow.append(input, round);
  chatbox.append(feed, suggestions, inputRow);
  const side = new El("div"); side.className = "panel panel-pad assistant-side";
  const title = new El("div"); title.className = "panel-title"; title.append(new El("h2"));
  const stale = new El("div"); stale.className = "recent-query";
  side.append(title, stale);
  layout.append(chatbox, side);
  const head = new El("div"); head.className = "screen-head";
  screen.append(head, layout);
  const brainStatus = register(Object.assign(new El("div"), { id: "brainStatus" }));

  const calls = [];
  let url = new URL("https://nexo.test/nexo-prototipo.html" + search);
  const document = {
    getElementById: id => nodes.get(id) || null,
    createElement: tag => new El(tag),
    createTextNode: text => Object.assign(new El("#text"), { textContent: text }),
    head: new El(),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const sandbox = {
    document, URL, URLSearchParams, Option: class extends El { constructor(label, value) { super("option"); this.textContent = label; this.value = value; } },
    location: { get href() { return url.href; }, get search() { return url.search; }, get origin() { return url.origin; } },
    history: {
      replaceState: (_, __, next) => { url = new URL(next, url); },
      pushState: (_, __, next) => { url = new URL(next, url); },
    },
    fetch: async (path, init) => {
      calls.push([path, init]);
      if (path === "/api/auth/session") return Response.json(session);
      if (path === "/api/workspaces") return Response.json(workspaces);
      return Response.json({});
    },
    addEventListener: (name, fn) => { sandbox.listeners[name] = fn; },
    dispatchEvent: () => {},
    listeners: {},
    console,
  };
  sandbox.window = sandbox;
  sandbox.Event = class { constructor(type) { this.type = type; } };
  sandbox.MutationObserver = class { constructor(fn) { this.fn = fn; } observe() {} disconnect() {} };
  const source = readFileSync(new URL("../public/assistant.js", import.meta.url), "utf8");
  vm.runInNewContext(source, sandbox);
  return { sandbox, nodes, calls, screen, feed, input, round, suggestions, side, stale, get url() { return url.href; } };
}

const bound = {
  workspaces: [{ id: "w", name: "Obra Norte", datasets: [{ id: "d1", name: "Procesos" }], assistants: [{ id: "a1", name: "Asistente Procesos" }] }],
};

test("assistant blocks the query until a dataset is selected and explains why", async () => {
  const h = harness();
  await h.sandbox.NexoAssistant.refresh();
  assert.equal(h.input.disabled, true);
  assert.equal(h.round.disabled, true);
  h.input.value = "¿Qué dice el documento?";
  await h.sandbox.NexoAssistant.send();
  assert.equal(h.calls.filter(([path]) => path.includes("/chat")).length, 0);
  assert.match(h.screen.querySelector("#assistantReady").children[0].textContent, /Iniciá sesión/);
});

test("assistant queries the bound workspace assistant and renders the evidence", async () => {
  const h = harness({ search: "?vista=assistant&workspaceId=w&dataset=d1&assistantId=a1", session: { user: { id: "u", role: "user" } }, ...bound });
  h.sandbox.fetch = async (path, init) => {
    h.calls.push([path, init]);
    if (path === "/api/auth/session") return Response.json({ user: { id: "u", role: "user" } });
    if (path === "/api/workspaces") return Response.json(bound);
    return Response.json({
      answer: "El documento describe siete macroprocesos.",
      references: [{ document_name: "03_mapa_macroprocesos.md", content: "siete macroprocesos secuenciales", similarity: 0.81, dataset_id: "d1" }],
    });
  };
  await h.sandbox.NexoAssistant.refresh();
  assert.equal(h.input.disabled, false);
  h.input.value = "¿Cuántos macroprocesos hay?";
  await h.sandbox.NexoAssistant.send();

  const chatCall = h.calls.find(([path]) => path.includes("/chat"));
  assert.equal(chatCall[0], "/api/datasets/d1/chat");
  assert.deepEqual(JSON.parse(chatCall[1].body), { question: "¿Cuántos macroprocesos hay?", conversationId: "", workspaceId: "w", assistantId: "a1" });

  const last = h.feed.children.at(-1);
  assert.equal(last.children[0].textContent, "El documento describe siete macroprocesos.");
  const evidence = last.children[1];
  assert.equal(evidence.children[0].textContent, "Evidencia de RAGFlow");
  assert.equal(evidence.children[1].children[0].children[0].textContent, "03_mapa_macroprocesos.md");
  assert.match(evidence.children[1].children[0].children[1].textContent, /similitud 81%/);
  assert.equal(h.sandbox.NexoAssistant.state.messages.length, 2);
  assert.match(h.nodes.get("brainStatus").textContent, /evidencia/);
});

test("assistant reports a missing assistant instead of sending an unbound query", async () => {
  const h = harness({
    search: "?vista=assistant&workspaceId=w&dataset=d1",
    session: { user: { id: "u", role: "user" } },
    workspaces: { workspaces: [{ id: "w", name: "Obra Norte", datasets: [{ id: "d1", name: "Procesos" }], assistants: [] }] },
  });
  await h.sandbox.NexoAssistant.refresh();
  assert.equal(h.input.disabled, true);
  assert.match(h.screen.querySelector("#assistantReady").children[0].textContent, /asistentes vinculados/);
  await h.sandbox.NexoAssistant.send("hola");
  assert.equal(h.calls.filter(([path]) => path.includes("/chat")).length, 0);
});

test("assistant replaces the placeholder suggestions and drops the duplicated list", async () => {
  const h = harness();
  await h.sandbox.NexoAssistant.refresh();
  assert.equal(h.suggestions.children.length, 4);
  assert.match(h.suggestions.children[0].title, /Resumí los puntos principales/);
  for (const button of h.suggestions.children) assert.doesNotMatch(button.title, /de el dataset seleccionado/);
  assert.equal(h.stale.parentElement, null);
  assert.equal(h.side.querySelector(".eyebrow"), null);
  assert.equal(h.side.querySelector(".panel-title"), null);
});

test("assistant keeps context controls inside the query composer and omits the MCP placeholder", async () => {
  const h = harness();
  await h.sandbox.NexoAssistant.refresh();

  const bar = h.nodes.get("assistantSourceBar");
  assert.ok(bar, "source bar exists");
  const composer = h.screen.querySelector(".chat-input");
  assert.equal(bar.parentElement, composer);
  assert.equal(composer.children[0], bar, "context controls lead the query composer");
  assert.equal(bar.children[0].children[0].textContent, "Dataset");
  assert.equal(bar.children[1].children[0].textContent, "Asistente");
  assert.equal(bar.children[2].children[0].textContent, "Sesión");
  assert.equal(bar.children[3].id, "assistantSourceStatus");
  assert.equal(composer.querySelector(".voice-control")?.disabled, true, "voice input is visibly unavailable until implemented");
  assert.equal(h.nodes.has("assistantContext"), false, "no duplicated space selector");

  // The shell may inject the MCP placeholder again; the module removes it.
  const layout = h.screen.querySelector(".assistant-layout");
  const placeholder = new (Object.getPrototypeOf(h.screen).constructor)("section");
  placeholder.id = "nexoMcpTools";
  layout.prepend(placeholder);
  h.nodes.set("nexoMcpTools", placeholder);
  h.sandbox.NexoAssistant.refresh();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(h.nodes.get("nexoMcpTools").parentElement, null);
});
