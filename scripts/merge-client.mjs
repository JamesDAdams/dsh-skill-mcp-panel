// Post-build step: fold the vendored client halves into the panel's client
// bundle.
//
// A DSH package exposes exactly one browser module (`exports["./client"]`), and
// the page mounts that module's plugin once. The panel fork therefore ships the
// MCP companion and the token estimator *inside* its own bundle instead of as
// separate packages: their factories are lifted out of their
// `window.__ModuleLoader__.load({ id, factory })` wrapper and mounted from the
// panel plugin's own `apply`.
//
// The generated file is committed (like `lib/client.js`) so the package stays
// installable straight from a clone; running the build regenerates it from the
// freshly compiled `lib/client.js` plus the `vendor/` sources.
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
const panelPath = fileURLToPath(new URL("lib/client.js", root));
const outPath = fileURLToPath(new URL("lib/client.merged.js", root));

/** Vendored client bundles, in mount order. */
const VENDORS = [
  { id: "dsh-mcp-companion", file: "vendor/dsh-mcp-companion/client.js" },
  { id: "dsh-token-estimator", file: "vendor/dsh-token-estimator/client.js" }
];

/** Factory-body markers: `factory(require) {` … `  },\n})\n` at the end. */
const FACTORY_OPEN = /factory\s*\(\s*require\s*\)\s*\{/;
const FACTORY_CLOSE = "\n  },\n})\n";

/**
 * Lift the factory body out of a `window.__ModuleLoader__.load(...)` wrapper.
 * @param {string} source - the vendored client bundle.
 * @param {string} label - diagnostic name.
 * @returns {string} the factory body, without its wrapper.
 */
function factoryBodyOf(source, label) {
  const open = FACTORY_OPEN.exec(source);
  if (open === null) throw new Error(`merge-client: ${label} has no factory(require) wrapper`);
  const start = open.index + open[0].length;
  const end = source.lastIndexOf(FACTORY_CLOSE);
  if (end < start) throw new Error(`merge-client: ${label} factory wrapper is not closed as expected`);
  const body = source.slice(start, end);
  if (!body.includes("apply")) throw new Error(`merge-client: ${label} factory body has no apply`);
  return body;
}

/** Build one `function (require) { … }` initializer. */
function factorySource(body, label) {
  return `function (require) { // ${label}\n${body}\n}`;
}

const panel = readFileSync(panelPath, "utf8");
const returnMarker = "        return bundleModule.exports;";
if (!panel.includes(returnMarker)) {
  throw new Error("merge-client: lib/client.js no longer returns bundleModule.exports where expected");
}
if (panel.split(returnMarker).length !== 2) {
  throw new Error("merge-client: lib/client.js has several bundleModule.exports returns");
}

const factories = VENDORS.map((vendor) => {
  const body = factoryBodyOf(readFileSync(fileURLToPath(new URL(vendor.file, root)), "utf8"), vendor.id);
  return factorySource(body, vendor.id);
});

const mount = [
  "        const __panelPlugin = bundleModule.exports;",
  "        const __vendorPlugins = [",
  factories.map((source) => `            ${source}`).join(",\n"),
  "        ].map((factory) => factory(require));",
  "        // One plugin object for the whole page: the panel's own apply runs",
  "        // first (it owns the sidebar row and the main page), then each",
  "        // vendored client half decorates the page and registers its slot.",
  "        return {",
  "            NS: __panelPlugin.NS,",
  "            inject: Array.from(new Set([",
  "                ...(Array.isArray(__panelPlugin.inject) ? __panelPlugin.inject : []),",
  "                ...__vendorPlugins.flatMap((plugin) => (plugin && Array.isArray(plugin.inject) ? plugin.inject : []))",
  "            ])),",
  "            apply(ctx) {",
  "                __panelPlugin.apply(ctx);",
  "                for (const plugin of __vendorPlugins) {",
  "                    if (plugin === null || plugin === undefined || typeof plugin.apply !== \"function\") continue;",
  "                    try {",
  "                        plugin.apply(ctx);",
  "                    } catch (error) {",
  "                        try { console.error(\"[dsh-skill-mcp-panel] vendored client plugin failed\", error); } catch { /* no console */ }",
  "                    }",
  "                }",
  "            }",
  "        };"
].join("\n");

const merged = panel.replace(returnMarker, mount);
writeFileSync(outPath, merged);
console.log(`merge-client: wrote ${outPath.slice(root.pathname.length)} (${statSync(outPath).size} bytes)`);
