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
 * 重启生效，对所有 Agent 一致。过滤器只在插件生命周期内有效。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "./fs-utils.js";

const RELATIVE = join("dsh-skill-mcp-panel", "disabled-skills.json");
const MARK = Symbol.for("dsh-skill-mcp-panel.skill-disable");

export interface SkillDisableController {
  /** 该名字是否被停用。 */
  isDisabled(name: string): boolean;
  /** 已停用的名字（排序）。 */
  names(): string[];
  /** 设置一个名字的启停并落盘。 */
  set(name: string, disabled: boolean): Promise<void>;
  /** 卸下过滤器（幂等）。 */
  dispose(): void;
}

/**
 * 读取状态并给宿主 `skills` 服务挂上过滤器。
 *
 * @param ctx - 宿主插件上下文（`skills` 已在 `inject` 里）。
 * @param dshHome - `$DSH_HOME`，状态文件所在根。
 */
export function attachSkillDisable(ctx: any, dshHome: string): SkillDisableController {
  const file = join(dshHome, RELATIVE);
  const state: { skills: string[] } = { skills: [] };
  try {
    const parsed: any = JSON.parse(readFileSync(file, "utf8"));
    if (Array.isArray(parsed?.skills)) {
      state.skills = parsed.skills.filter((name: any) => typeof name === "string" && name !== "");
    }
  } catch {
    // 首次运行或文件损坏：从空列表开始，不阻塞插件加载。
  }
  const hidden = () => new Set(state.skills);

  const skills: any = typeof ctx?.get === "function" ? ctx.get("skills") : ctx?.skills;
  let restore: (() => void) | undefined;
  if (
    skills !== undefined && skills !== null &&
    typeof skills.list === "function" && typeof skills.get === "function" &&
    skills[MARK] === undefined
  ) {
    const originalList = skills.list.bind(skills);
    const originalSnapshot = typeof skills.snapshot === "function" ? skills.snapshot.bind(skills) : undefined;
    const originalGet = skills.get.bind(skills);

    const patchedList = async (options: any = {}) => {
      const rows = await originalList(options);
      if (options?.includeDisabled === true) return rows;
      const off = hidden();
      return off.size === 0 || !Array.isArray(rows) ? rows : rows.filter((row: any) => !off.has(row?.name));
    };
    const patchedSnapshot = async (options: any = {}) => {
      const snapshot = await originalSnapshot?.(options);
      if (snapshot === undefined || snapshot === null || options?.includeDisabled === true) return snapshot;
      const off = hidden();
      if (off.size === 0) return snapshot;
      return { ...snapshot, skills: (Array.isArray(snapshot.skills) ? snapshot.skills : []).filter((row: any) => !off.has(row?.name)) };
    };
    const patchedGet = async (name: string, options: any = {}) => {
      if (options?.includeDisabled !== true && hidden().has(name)) return undefined;
      return originalGet(name, options);
    };

    skills.list = patchedList;
    if (originalSnapshot !== undefined) skills.snapshot = patchedSnapshot;
    skills.get = patchedGet;
    skills[MARK] = true;
    restore = () => {
      try {
        if (skills.list === patchedList) skills.list = originalList;
        if (originalSnapshot !== undefined && skills.snapshot === patchedSnapshot) skills.snapshot = originalSnapshot;
        if (skills.get === patchedGet) skills.get = originalGet;
        delete skills[MARK];
      } catch {
        // 服务已被替换：没有可恢复的东西。
      }
    };
  }

  return {
    isDisabled: (name) => hidden().has(name),
    names: () => [...state.skills],
    async set(name, disabled) {
      const next = new Set(state.skills);
      if (disabled) next.add(name);
      else next.delete(name);
      state.skills = [...next].sort();
      await writeFileAtomic(file, JSON.stringify({ version: 1, skills: state.skills }, null, 2) + "\n");
    },
    dispose() {
      restore?.();
      restore = undefined;
    },
  };
}
