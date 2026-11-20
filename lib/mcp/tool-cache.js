/**
 * dsh-skill-mcp-panel —— MCP 工具清单缓存。
 *
 * 服务器停用时宿主不注册任何工具 schema，`tools.view()` 自然空着，工具面板
 * 只能显示「未连接」。但用户想看的往往是「这台服务器会带来哪些工具」——与它
 * 当前是否在跑无关。
 *
 * 所以每次在**已连接**状态下读到清单就顺手存一份；等服务器停下来时（或下次
 * 打开面板）先用这份缓存，再去探测。缓存按 Pro file 隔离，与 tool-filter.json
 * 同目录，只存名字、描述与估重，不存任何凭据。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "../fs-utils.js";
const CACHE_FILE = "mcp-tools.json";
const MAX_TOOLS_PER_SERVER = 200;
const MAX_SERVERS = 64;
/** 与 tool-filter.json 同一个目录：<profile>/.dsh-skill-mcp-panel/。 */
function cacheFile(dshHome, profileDir) {
    const base = typeof profileDir === "string" && profileDir !== ""
        ? join(profileDir, ".dsh-skill-mcp-panel")
        : join(dshHome, "dsh-skill-mcp-panel");
    return join(base, CACHE_FILE);
}
function normalizeRows(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const item of raw) {
        if (item === null || typeof item !== "object")
            continue;
        const name = item.name;
        if (typeof name !== "string" || name === "")
            continue;
        const description = typeof item.description === "string" ? item.description : undefined;
        const tokens = typeof item.tokens === "number" && Number.isFinite(item.tokens) ? item.tokens : undefined;
        out.push({ name, ...(description === undefined ? {} : { description }), ...(tokens === undefined ? {} : { tokens }) });
        if (out.length >= MAX_TOOLS_PER_SERVER)
            break;
    }
    return out;
}
async function readCacheMap(dshHome, profileDir) {
    try {
        const parsed = JSON.parse(await readFile(cacheFile(dshHome, profileDir), "utf8"));
        const servers = parsed?.servers;
        if (servers === null || typeof servers !== "object" || Array.isArray(servers))
            return {};
        const out = {};
        for (const [name, rows] of Object.entries(servers)) {
            if (typeof name !== "string" || name === "")
                continue;
            const normalized = normalizeRows(rows);
            if (normalized.length > 0)
                out[name] = normalized;
            if (Object.keys(out).length >= MAX_SERVERS)
                break;
        }
        return out;
    }
    catch {
        return {};
    }
}
export async function readCachedTools(dshHome, profileDir, server) {
    const map = await readCacheMap(dshHome, profileDir);
    return map[server] ?? [];
}
export async function writeCachedTools(dshHome, profileDir, server, rows) {
    const normalized = normalizeRows(rows);
    if (normalized.length === 0)
        return;
    const map = await readCacheMap(dshHome, profileDir);
    map[server] = normalized;
    const servers = {};
    for (const name of Object.keys(map).slice(0, MAX_SERVERS))
        servers[name] = map[name];
    try {
        await writeFileAtomic(cacheFile(dshHome, profileDir), JSON.stringify({ version: 1, servers }, null, 2) + "\n");
    }
    catch {
        // 缓存写不进去不影响功能：下次仍可现场探测。
    }
}
