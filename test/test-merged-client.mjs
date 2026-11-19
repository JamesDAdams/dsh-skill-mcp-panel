// The fork ships three client halves in one browser module: the panel itself,
// the vendored MCP companion and the vendored token estimator. DSH mounts one
// plugin per package, so `lib/client.merged.js` must return a single plugin
// whose `apply` starts all three without throwing.
//
// This test loads the generated bundle in a stubbed browser, materializes its
// factory, and checks the observable contract:
//   - one module registered, under the package name;
//   - the merged plugin injects the union of the three halves;
//   - the panel's own slots, the conversation MCP chip and the token estimate
//     chip are all registered by one `apply` call.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const bundlePath = fileURLToPath(new URL("../lib/client.merged.js", import.meta.url));
const source = readFileSync(bundlePath, "utf8");

let passed = 0;
function pass(message) {
  passed += 1;
  console.log("PASS  " + message);
}

let captured = null;
const consoleErrors = [];
const styleNode = () => ({ dataset: {}, style: {}, setAttribute() {}, appendChild() {}, remove() {}, textContent: "" });
const documentStub = {
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => styleNode(),
  createTextNode: () => styleNode(),
  head: { appendChild() {} },
  body: { appendChild() {}, addEventListener() {}, removeEventListener() {} },
  documentElement: { appendChild() {}, setAttribute() {} },
  addEventListener() {},
  removeEventListener() {},
  visibilityState: "visible"
};
const windowStub = {
  __ModuleLoader__: {
    load(definition) {
      captured = definition;
    }
  },
  document: documentStub,
  requestAnimationFrame: () => 0,
  cancelAnimationFrame() {},
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  location: { href: "http://localhost/" },
  getComputedStyle: () => ({ getPropertyValue: () => "" })
};

const React = {
  createElement: () => null,
  Fragment: "fragment",
  useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useRef: () => ({ current: null }),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  memo: (component) => component,
  Component: class Component {
    constructor(props) {
      this.props = props;
    }
    setState() {}
    render() {
      return null;
    }
  },
  PureComponent: class PureComponent {},
  createRef: () => ({ current: null }),
  forwardRef: (component) => component,
  createContext: () => ({ Provider: "provider", Consumer: "consumer" })
};
const jsxRuntime = { jsx: () => null, jsxs: () => null, Fragment: "fragment" };
const primitives = new Proxy({}, { get: () => () => null });

const sandbox = {
  window: windowStub,
  document: documentStub,
  console: { ...console, error: (...args) => consoleErrors.push(args.map(String).join(" ")) },
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  queueMicrotask,
  requestAnimationFrame: () => 0,
  cancelAnimationFrame() {},
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  fetch: async () => ({
    ok: true,
    status: 200,
    async json() {
      return { ok: true, servers: [], groups: [] };
    },
    async text() {
      return "{}";
    },
    body: { cancel: async () => {} }
  }),
  React,
  Symbol,
  Date,
  Math,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Error,
  TypeError,
  Promise,
  Map,
  Set,
  WeakMap,
  WeakSet,
  URL,
  URLSearchParams,
  encodeURIComponent,
  decodeURIComponent,
  parseInt,
  parseFloat,
  isNaN,
  structuredClone: (value) => value
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "client.merged.js" });

assert.notEqual(captured, null, "the bundle must register one client module");
assert.equal(captured.id, "dsh-skill-mcp-panel", "the client module id must equal the package name");
pass("bundle registers the package's client module");

const requireStub = (name) => {
  if (name === "react") return React;
  if (name === "react/jsx-runtime") return jsxRuntime;
  if (name === "@deepseek-ai/dsh-client-ui-primitives") return primitives;
  throw new Error("unexpected require: " + name);
};
const plugin = captured.factory(requireStub);
assert.equal(typeof plugin.apply, "function");
assert.ok(Array.isArray(plugin.inject));
for (const service of ["slots", "locale", "remote", "sessions", "layout"]) {
  assert.ok(plugin.inject.includes(service), "merged plugin must inject " + service);
}
pass("merged plugin injects the union of the three client halves");

const registered = [];
const slots = {
  inject(_name, register) {
    register();
  },
  register(meta) {
    registered.push(meta);
    return () => {};
  },
  listSubTree: () => []
};
const ctx = {
  effect: (fn) => {
    const dispose = fn();
    return typeof dispose === "function" ? dispose : () => {};
  },
  on: () => () => {},
  get: (name) => {
    if (name === "slots") return slots;
    if (name === "sessions") return { list: { getSnapshot: () => ({ byId: {} }) } };
    if (name === "layout") return {};
    return undefined;
  },
  slots,
  locale: {
    register: () => () => {},
    bind: () => (key) => key
  },
  remote: {
    $mount: () => () => {},
    invoke: async () => ({ ok: true })
  },
  logger: { debug() {}, info() {}, warn() {}, error() {} }
};

plugin.apply(ctx);

const ids = registered.map((meta) => meta.id).filter(Boolean);
assert.ok(ids.includes("skill-mcp"), "the panel's sidebar row must be registered, got: " + ids.join(", "));
assert.ok(ids.includes("mcp-companion.conversation"), "the MCP chip must be registered, got: " + ids.join(", "));
assert.ok(ids.includes("token-estimator"), "the token estimate chip must be registered, got: " + ids.join(", "));
pass("one apply call registers the panel, the MCP chip and the token estimate chip");

assert.deepEqual(consoleErrors, [], "no client half may fail during apply");
pass("no client half failed during apply");

console.log("\n" + passed + " passed, 0 failed");
console.log("ALL MERGED CLIENT TESTS PASSED");
