/**
 * Package entry of the `dsh-skill-mcp-panel` fork.
 *
 * The fork ships three halves in one bundle instead of three installable
 * packages:
 *
 *   1. the panel itself (`lib/index.js`): the Skill / MCP page, its Typert
 *      gateway, the `dsh-panel` CLI backend and the per-tool filter;
 *   2. `vendor/dsh-mcp-companion`: the extra MCP servers the panel cannot see,
 *      their persistent switches, the per-conversation MCP chip in the New
 *      Session row, and the Tools / System prompt tabs of the panel page;
 *   3. `vendor/dsh-token-estimator`: the composer token estimate.
 *
 * A DSH package mounts one Host plugin per Loader row, so the three Host halves
 * are started from this single entry. Each half keeps its own routes, its own
 * state file and its own cleanup: this module only composes them.
 */
import * as panel from "./index.js";
import * as companion from "../vendor/dsh-mcp-companion/index.js";
import * as estimator from "../vendor/dsh-token-estimator/index.js";

/** Host halves, mounted in this order. */
const HALVES = [
  { id: "dsh-skill-mcp-panel", plugin: panel },
  { id: "dsh-mcp-companion", plugin: companion },
  { id: "dsh-token-estimator", plugin: estimator }
];

export const name = panel.name;

/**
 * Union of every half's `inject`: Cordis waits for all of them before the
 * first `apply`, which keeps a half from starting with a missing service.
 */
export const inject = Array.from(
  new Set(HALVES.flatMap(({ plugin }) => (Array.isArray(plugin.inject) ? plugin.inject : [])))
);

export function apply(ctx) {
  for (const { id, plugin } of HALVES) {
    if (typeof plugin.apply !== "function") continue;
    try {
      plugin.apply(ctx);
    } catch (error) {
      // One broken half must not take the panel down with it.
      try {
        ctx.logger?.warn?.("dsh-skill-mcp-panel: %s half failed to start: %s", id, String(error?.message ?? error));
      } catch {
        /* no logger */
      }
    }
  }
}
