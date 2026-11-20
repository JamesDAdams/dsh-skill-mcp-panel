/**
 * 工作区级停用：全局技能可以在「一个」工作区里被关掉，别的工作区不受影响。
 *
 * 这里直接驱动 skill-disable 的控制器与它挂在宿主 skills 服务上的过滤器：
 * 状态文件 v2 的 workspaces 覆盖表按项目根存放，过滤器按 list/get 的 cwd
 * 解析项目根后决定要不要隐藏。
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { attachSkillDisable } from "../lib/skill-disable.js";

let failures = 0;
const check = async (label, fn) => {
  try {
    await fn();
    console.log("PASS  " + label);
  } catch (error) {
    failures++;
    console.log("FAIL  " + label + "\n      " + (error && error.message ? error.message : error));
  }
};

const root = await mkdtemp(join(tmpdir(), "dsh-disable-ws-"));
const home = join(root, "home");
const projectA = join(root, "proj-a");
const projectB = join(root, "proj-b");
await mkdir(home, { recursive: true });
// findProjectRoot 向上找 .git：两个工作区各自锚定。
await mkdir(join(projectA, ".git"), { recursive: true });
await mkdir(join(projectB, ".git"), { recursive: true });
await mkdir(join(projectA, "sub"), { recursive: true });

const makeService = () => {
  const skills = [{ name: "browser" }, { name: "office" }];
  const service = {
    list: async () => skills.map((skill) => ({ ...skill })),
    get: async (name) => skills.find((skill) => skill.name === name),
    snapshot: async () => ({ skills: skills.map((skill) => ({ ...skill })) })
  };
  return service;
};

const service = makeService();
const ctx = { get: (name) => (name === "skills" ? service : undefined) };
const controller = attachSkillDisable(ctx, home);

const namesWith = async (cwd) => (await service.list({ cwd })).map((row) => row.name);

await check("默认状态：两个工作区都能看到全局技能", async () => {
  assert.deepEqual(await namesWith(projectA), ["browser", "office"]);
  assert.deepEqual(await namesWith(projectB), ["browser", "office"]);
});

await controller.setIn(projectA, "office", true);

await check("在项目 A 里停用 office：A 看不到，B 仍然看得到", async () => {
  assert.deepEqual(await namesWith(projectA), ["browser"]);
  assert.deepEqual(await namesWith(projectB), ["browser", "office"]);
});

await check("项目里的子目录同样生效（按项目根解析）", async () => {
  assert.deepEqual(await namesWith(join(projectA, "sub")), ["browser"]);
});

await check("includeDisabled 仍然返回全部（面板要显示开关）", async () => {
  const rows = await service.list({ cwd: projectA, includeDisabled: true });
  assert.deepEqual(rows.map((row) => row.name), ["browser", "office"]);
});

await check("get 在 A 里对被停用的技能返回 undefined，在 B 里正常", async () => {
  assert.equal(await service.get("office", { cwd: projectA }), undefined);
  assert.notEqual(await service.get("office", { cwd: projectB }), undefined);
});

await check("控制器口径：isDisabledIn 区分全局与工作区", () => {
  assert.equal(controller.isDisabled("office"), false, "office must stay enabled globally");
  assert.equal(controller.isDisabledIn("office", projectA), true);
  assert.equal(controller.isDisabledIn("office", projectB), false);
});

await check("覆盖表落盘且被持久化", async () => {
  const raw = JSON.parse(await readFile(join(home, "dsh-skill-mcp-panel", "disabled-skills.json"), "utf8"));
  assert.equal(raw.version, 2, "state must be written as version 2");
  assert.deepEqual(raw.skills, [], "no global disable expected");
  assert.deepEqual(raw.workspaces[projectA], ["office"]);
  assert.deepEqual(controller.overrides(), { [projectA]: ["office"] });
});

await controller.setIn(projectA, "office", false);

await check("恢复后项目 A 重新看到 office，覆盖表清空该工作区", async () => {
  assert.deepEqual(await namesWith(projectA), ["browser", "office"]);
  const raw = JSON.parse(await readFile(join(home, "dsh-skill-mcp-panel", "disabled-skills.json"), "utf8"));
  assert.equal(raw.workspaces[projectA], undefined, "an empty override must not linger on disk");
});

await controller.set("office", true);

await check("全局停用对所有工作区生效（覆盖表之外仍有一条全局规则）", async () => {
  assert.deepEqual(await namesWith(projectA), ["browser"]);
  assert.deepEqual(await namesWith(projectB), ["browser"]);
  assert.equal(controller.isDisabledIn("office", projectB), true);
});

controller.dispose();
await rm(root, { recursive: true, force: true });

console.log("\n" + (failures === 0 ? "ALL SKILL-DISABLE WORKSPACE TESTS PASSED" : failures + " test(s) FAILED"));
process.exit(failures === 0 ? 0 : 1);
