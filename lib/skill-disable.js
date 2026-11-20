/**
 * dsh-skill-mcp-panel —— 插件/内置技能的启停（Issue: 无法停用随包技能）。
 *
 * 文件技能由面板改名（`SKILL.md` → `SKILL.md.disabled`）即可停用；随包技能
 * （宿主 preset 里的 `dsh-doc`、`@deepseek-ai/dsh-skill-office` 的 `office*`）
 * 没有可改名的文件，只能从注册表层面隐藏。
 *
 * 做法是在宿主 `skills` 服务上挂一层过滤器：
 *   - `list` / `snapshot` 过滤掉被停用的名字（模型技能目录与 `/` 菜单都读它）；
 *   - `get` 对被停用的名字返回 undefined（模型无法加载正文）；
 *   - 面板自己的读取带上 `includeDisabled: true`，仍然看得到这些行并显示开关。
 *
 * 状态保存在 `<dshHome>/dsh-skill-mcp-panel/disabled-skills.json`，跨会话、跨
 * 重启生效。`skills` 是全局停用（对所有会话一致）；`workspaces` 是「只在这个
 * 工作区停用」的覆盖表，键是项目根目录——同一个全局技能可以在 A 工作区照常
 * 使用、在 B 工作区被关掉。过滤器只在插件生命周期内有效。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "./fs-utils.js";
import { findProjectRoot } from "./skill-files.js";
const RELATIVE = join("dsh-skill-mcp-panel", "disabled-skills.json");
const MARK = Symbol.for("dsh-skill-mcp-panel.skill-disable");
/** 状态文件里的工作区覆盖表：只保留非空、去重、排序过的名字列表。 */
function readWorkspaces(raw) {
    const out = {};
    if (raw === null || typeof raw !== "object" || Array.isArray(raw))
        return out;
    for (const root of Object.keys(raw)) {
        if (typeof root !== "string" || root === "")
            continue;
        const list = raw[root];
        if (!Array.isArray(list))
            continue;
        const names = [...new Set(list.filter((name) => typeof name === "string" && name !== ""))].sort();
        if (names.length > 0)
            out[root] = names;
    }
    return out;
}
/**
 * 读取状态并给宿主 `skills` 服务挂上过滤器。
 *
 * @param ctx - 宿主插件上下文（`skills` 已在 `inject` 里）。
 * @param dshHome - `$DSH_HOME`，状态文件所在根。
 */
export function attachSkillDisable(ctx, dshHome) {
    const file = join(dshHome, RELATIVE);
    const state = { skills: [], workspaces: {} };
    try {
        const parsed = JSON.parse(readFileSync(file, "utf8"));
        if (Array.isArray(parsed?.skills)) {
            state.skills = parsed.skills.filter((name) => typeof name === "string" && name !== "");
        }
        state.workspaces = readWorkspaces(parsed?.workspaces);
    }
    catch {
        // 首次运行或文件损坏：从空列表开始，不阻塞插件加载。
    }
    const hidden = () => new Set(state.skills);
    /** 某个 cwd 所在工作区的项目根；解析不出来就当作「没有工作区」。 */
    const rootOf = async (cwd) => {
        if (typeof cwd !== "string" || cwd === "")
            return undefined;
        try {
            return await findProjectRoot(cwd);
        }
        catch {
            return undefined;
        }
    };
    /** 某个 cwd 在模型侧应当隐藏的名字集合（全局 + 该工作区覆盖）。 */
    const hiddenFor = async (cwd) => {
        const set = hidden();
        const root = await rootOf(cwd);
        const extra = root === undefined ? undefined : state.workspaces[root];
        if (Array.isArray(extra))
            for (const name of extra)
                set.add(name);
        return set;
    };
    const persist = async () => {
        await writeFileAtomic(file, JSON.stringify({ version: 2, skills: state.skills, workspaces: state.workspaces }, null, 2) + "\n");
    };
    const skills = typeof ctx?.get === "function" ? ctx.get("skills") : ctx?.skills;
    let restore;
    if (skills !== undefined && skills !== null &&
        typeof skills.list === "function" && typeof skills.get === "function" &&
        skills[MARK] === undefined) {
        const originalList = skills.list.bind(skills);
        const originalSnapshot = typeof skills.snapshot === "function" ? skills.snapshot.bind(skills) : undefined;
        const originalGet = skills.get.bind(skills);
        const patchedList = async (options = {}) => {
            const rows = await originalList(options);
            if (options?.includeDisabled === true)
                return rows;
            const off = await hiddenFor(options?.cwd);
            return off.size === 0 || !Array.isArray(rows) ? rows : rows.filter((row) => !off.has(row?.name));
        };
        const patchedSnapshot = async (options = {}) => {
            const snapshot = await originalSnapshot?.(options);
            if (snapshot === undefined || snapshot === null || options?.includeDisabled === true)
                return snapshot;
            const off = await hiddenFor(options?.cwd);
            if (off.size === 0)
                return snapshot;
            return { ...snapshot, skills: (Array.isArray(snapshot.skills) ? snapshot.skills : []).filter((row) => !off.has(row?.name)) };
        };
        const patchedGet = async (name, options = {}) => {
            if (options?.includeDisabled !== true && (await hiddenFor(options?.cwd)).has(name))
                return undefined;
            return originalGet(name, options);
        };
        skills.list = patchedList;
        if (originalSnapshot !== undefined)
            skills.snapshot = patchedSnapshot;
        skills.get = patchedGet;
        skills[MARK] = true;
        restore = () => {
            try {
                if (skills.list === patchedList)
                    skills.list = originalList;
                if (originalSnapshot !== undefined && skills.snapshot === patchedSnapshot)
                    skills.snapshot = originalSnapshot;
                if (skills.get === patchedGet)
                    skills.get = originalGet;
                delete skills[MARK];
            }
            catch {
                // 服务已被替换：没有可恢复的东西。
            }
        };
    }
    return {
        isDisabled: (name) => hidden().has(name),
        isDisabledIn(name, projectRoot) {
            if (hidden().has(name))
                return true;
            if (typeof projectRoot !== "string" || projectRoot === "")
                return false;
            return (state.workspaces[projectRoot] ?? []).includes(name);
        },
        names: () => [...state.skills],
        overrides: () => {
            const out = {};
            for (const root of Object.keys(state.workspaces))
                out[root] = [...state.workspaces[root]];
            return out;
        },
        async set(name, disabled) {
            const next = new Set(state.skills);
            if (disabled)
                next.add(name);
            else
                next.delete(name);
            state.skills = [...next].sort();
            await persist();
        },
        async setIn(projectRoot, name, disabled) {
            if (typeof projectRoot !== "string" || projectRoot === "")
                throw new Error("工作区路径无效");
            const next = new Set(state.workspaces[projectRoot] ?? []);
            if (disabled)
                next.add(name);
            else
                next.delete(name);
            const names = [...next].sort();
            if (names.length === 0)
                delete state.workspaces[projectRoot];
            else
                state.workspaces[projectRoot] = names;
            await persist();
        },
        dispose() {
            restore?.();
            restore = undefined;
        },
    };
}
