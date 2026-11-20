window.__ModuleLoader__.load({
    id: "dsh-skill-mcp-panel",
    factory: (require) => {
        const bundleModule = { exports: {} };
        Object.defineProperty(bundleModule.exports, Symbol.toStringTag, { value: "Module" });
        // 束契约：本文件由宿主以 /plugins/dsh-skill-mcp-panel/client.js 提供，
        // 只能 require 外壳种子词（react、jsx-runtime、primitives）。
        let react_jsx_runtime = require("react/jsx-runtime");
        let react = require("react");
        let primitives = require("@deepseek-ai/dsh-client-ui-primitives");
        // 宿主 primitives 的图标名：0.2.x 起只有描边档位命名（…OutlineRegular / …OutlineMedium
        // / 裸 …Outline），尺寸由 size prop 传。0.1.x 的像素后缀旧名（…Outline16）是历史包袱，
        // 2026-10-18 起不再回退——本插件最低支持宿主 0.2.0。
        function primitiveIcon(name) {
            return primitives[name];
        }
        // ── 弹层关闭（Issue #82）────────────────────────────────────────────
        // 用户要求「添加技能弹窗在点击外部时应该自动关闭」。做两个共用工具，四个弹层
        // （添加技能菜单、分组编辑器、批量迁移、MCP 表单/原文编辑）行为一致：
        //   1. useEscapeClose：挂载期间监听 document 的 Escape（组件只在打开时才渲染）；
        //   2. closeOnBackdrop：点在遮罩本身就是「点外部」，点在盒子里不算。
        // 没有 document 的环境（渲染回归桩只跑 effect、不提供事件循环）直接跳过，不炸。
        const canListenDocument = () => typeof document !== "undefined" && document !== null &&
            typeof document.addEventListener === "function" && typeof document.removeEventListener === "function";
        const useEscapeClose = (onClose, enabled = true) => {
            react.useEffect(() => {
                if (enabled !== true || !canListenDocument())
                    return undefined;
                const handler = (event) => {
                    if (event !== null && event !== undefined && event.key === "Escape")
                        onClose();
                };
                document.addEventListener("keydown", handler);
                return () => document.removeEventListener("keydown", handler);
            }, [enabled]);
        };
        // 与宿主 token-meter 同一口径：4 字符 / Token，千位显示 5.6k。
        const formatTokens = (value) => {
            const n = Math.round(Number(value) || 0);
            if (n < 1000)
                return String(n);
            const k = n / 1000;
            return (k < 10 ? k.toFixed(1).replace(/\.0$/, "") : String(Math.round(k))) + "k";
        };
        const closeOnBackdrop = (onClose, busy = false) => (event) => {
            if (busy === true || event === null || event === undefined)
                return;
            // 只有点在遮罩本身才关：点在对话框内部时 target 是盒子里的元素。
            if (event.target !== event.currentTarget)
                return;
            onClose();
        };
        // ── 搜索/筛选匹配（Issue #79）───────────────────────────────────────
        // 用户反馈「目前只匹配标题，不是很方便」：名字或描述命中任意一处即算匹配。
        // 技能页主搜索、分组编辑器、批量迁移对话框复用同一个判据。
        const skillMatchesQuery = (skill, query) => {
            const q = typeof query === "string" ? query.trim().toLocaleLowerCase() : "";
            if (q === "")
                return true;
            const name = skill !== null && skill !== undefined && typeof skill.name === "string" ? skill.name.toLocaleLowerCase() : "";
            const description = skill !== null && skill !== undefined && typeof skill.description === "string" ? skill.description.toLocaleLowerCase() : "";
            return name.includes(q) || description.includes(q);
        };
        // ── 技能树构建：从技能条目（含 rel）构建与文件树一致的分层结构 ──────
        // 正确性：叶子只能是扫描器验证过的技能条目（含 SKILL.md 的目录）；
        // rel 中间段是分类文件夹（永远不是技能）；rel 为空 = 根层叶子。
        // 因此"非技能的嵌套文件夹"不可能成为树节点。
        function buildSkillTree(skills) {
            const root = { path: "", name: "", skills: [], folders: new Map(), count: 0 };
            const byPath = new Map();
            byPath.set("", root);
            for (const skill of skills) {
                const rel = skill?.rel ?? "";
                if (rel === "") {
                    root.skills.push(skill);
                    continue;
                }
                const segments = rel.split("/");
                const dirSegments = segments.slice(0, -1);
                let current = "";
                let node = root;
                for (const segment of dirSegments) {
                    current = current === "" ? segment : current + "/" + segment;
                    let child = byPath.get(current);
                    if (child === undefined) {
                        child = { path: current, name: segment, skills: [], folders: new Map(), count: 0 };
                        byPath.set(current, child);
                        node.folders.set(segment, child);
                    }
                    node = child;
                }
                node.skills.push(skill);
            }
            computeCounts(root);
            return root;
        }
        function computeCounts(node) {
            let total = node.skills.length;
            for (const child of node.folders.values())
                total += computeCounts(child);
            node.count = total;
            return total;
        }
        /**
         * 图标渲染：primitiveIcon 取不到导出时返回 undefined（宿主是旧命名或没有这枚图标），
         * 这时退回内置描边图形。直接渲染 undefined 会让 React 抛
         * "Element type is invalid: … but got: undefined"，插槽渲染器会把整格 retire 掉。
         * 调用点写法：hostIcon(primitiveIcon("IconXOutlineRegular"), 14, PATHS)
         */
        function hostIcon(icon, size, paths) {
            if (icon !== undefined && icon !== null)
                return (0, react_jsx_runtime.jsx)(icon, { size: size, "aria-hidden": "true" });
            return (0, react_jsx_runtime.jsx)("svg", {
                width: size,
                height: size,
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: 1.7,
                strokeLinecap: "round",
                strokeLinejoin: "round",
                "aria-hidden": "true",
                children: paths.map((d, index) => (0, react_jsx_runtime.jsx)("path", { d: d, key: index }))
            });
        }
        // 图标回退图形：宿主 primitives 没有该导出时使用（坐标统一 24×24，
        // 取自设计稿的描边图形，视觉与宿主图标一致）。
        const ICON_PATHS = {
            skill: ["M7 3h7l4 4v14H7z", "M14 3v4h4", "M10 13h5", "M10 17h5"],
            folder: ["M3 7h6l2 2h10v10H3z"],
            group: ["M3 7h6l2 2h10v10H3z", "M12 12v5", "M9.5 14.5h5"],
            migrate: ["M4 8h14", "M14 4l4 4-4 4", "M20 16H6", "M10 12l-4 4 4 4"],
            plus: ["M12 5v14", "M5 12h14"],
            // 布局切换：三栏 / 简洁（一根竖线把方框一分为二）
            layout: ["M4 5h16v14H4z", "M13 5v14"],
            check: ["M5 12.5l4.5 4.5L19 7.5"],
            trash: ["M5 7h14", "M10 7V4h4v3", "M7 7l1 13h8l1-13"],
            gear: ["M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M12 3.5v2", "M12 18.5v2", "M20.5 12h-2", "M5.5 12h-2", "M18 6.6l-1.4 1.4", "M7.4 16 6 17.4", "M18 17.4 16.6 16", "M7.4 8 6 6.6"]
        };
        /** 文本 → base64：撤销删除时用 addSkill 把 SKILL.md 正文回填。分块避免长文件把栈打爆。 */
        function utf8ToBase64(text) {
            const bytes = new TextEncoder().encode(String(text ?? ""));
            let binary = "";
            const CHUNK = 0x8000;
            for (let index = 0; index < bytes.length; index += CHUNK) {
                binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(index, index + CHUNK)));
            }
            return btoa(binary);
        }
        /** 「打开目录」用：宿主没有「在文件管理器里打开这个目录」的 API，只能把路径交给用户。 */
        function copyTextToClipboard(text) {
            return Promise.resolve().then(() => {
                if (typeof navigator === "undefined")
                    return false;
                const clipboard = navigator.clipboard;
                if (clipboard === undefined || clipboard === null || typeof clipboard.writeText !== "function")
                    return false;
                return Promise.resolve(clipboard.writeText(text)).then(() => true, () => false);
            });
        }
        // ── 样式（按用途分组）─────────────────────────────────────────────────
        // 页面骨架：section / 状态文案 / 搜索框 / 标题行
        const cssChrome = ".SKV_section{position:relative;width:100%;max-width:760px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:14px;display:flex}.SKV_status{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px;margin:0}.SKV_failure{color:var(--dsw-alias-state-error-primary);align-items:center;gap:10px;display:flex}.SKV_failure p{margin:0}.SKV_failure button{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;background:0 0;border-radius:6px;padding:4px 10px}.SKV_catalog{flex-direction:column;gap:12px;display:flex}.SKV_catalogHeading{align-items:baseline;gap:7px;padding:0 2px;display:flex}.SKV_catalogHeading h3{font-size:13px;font-weight:600;line-height:20px;margin:0}.SKV_catalogHeading span{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;font-size:12px;line-height:18px}.SKV_searchBox{position:relative;width:100%}.SKV_searchIcon{color:var(--dsw-alias-label-tertiary);position:absolute;left:12px;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;pointer-events:none}.SKV_searchField::placeholder{color:var(--dsw-alias-label-tertiary)}.SKV_searchField:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent)}.SKV_searchField{box-sizing:border-box;width:100%;height:36px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:34px;outline:0;padding:0 12px 0 38px}.SKV_iconButton{box-sizing:border-box;width:28px;height:28px;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;padding:0;display:inline-flex;align-items:center;justify-content:center}.SKV_iconButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid)}.SKV_iconButton:disabled{cursor:default;opacity:.6}.SKV_notice{border-radius:8px;align-items:center;gap:10px;padding:8px 12px;display:flex;border:1px solid transparent}.SKV_notice[data-kind=error]{border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)}.SKV_notice[data-kind=error] .SKV_noticeText{color:var(--dsw-alias-state-error-primary)}.SKV_notice[data-kind=info]{border-color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 35%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent)}.SKV_notice[data-kind=info] .SKV_noticeText{color:var(--dsw-alias-state-business-primary)}.SKV_noticeText{font-size:12px;line-height:18px;flex:1;min-width:0}.SKV_noticeButton{font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:2px 10px;font-size:12px;line-height:18px;flex:none}.SKV_noticeButton:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}.SKV_deleteButton[data-confirm=true]{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 50%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)}";
        // 卡片列表：卡片、状态标签、内容框、开关与删除操作
        const cssCards = ".SKV_cards{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:10px;margin:0;padding:0;list-style:none;display:grid}.SKV_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;min-width:0;overflow:hidden}.SKV_card[data-open=true]{border-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-shadow-lv1)}.SKV_cardContent{width:100%;align-items:center;gap:8px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:none;padding:10px 12px;display:flex;text-align:left}.SKV_cardLeading{width:16px;height:16px;color:var(--dsw-alias-label-tertiary);flex:none;justify-content:center;align-items:center;display:inline-flex}.SKV_cardTitle{min-width:0;flex:1;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;font-size:13px;font-weight:500;line-height:20px;transition:color .2s ease}.SKV_cardTitle[data-disabled=true]{color:var(--dsw-alias-label-tertiary)}.SKV_cardTrailing{color:var(--dsw-alias-label-tertiary);flex:none;align-items:center;gap:7px;display:inline-flex}.SKV_statusDot{background:var(--dsw-alias-label-tertiary);border-radius:999px;flex:none;width:7px;height:7px;display:inline-block;transition:background-color .2s ease}.SKV_statusDot[data-enabled=true]{background:var(--dsw-alias-state-success-primary)}.SKV_configTag{background:var(--dsw-alias-bg-layer-1);min-height:20px;color:var(--dsw-alias-label-secondary);white-space:nowrap;border-radius:5px;align-items:center;padding:1px 6px;font-size:11px;line-height:16px;display:inline-flex;transition:background-color .2s ease,color .2s ease}.SKV_configTag[data-enabled=true]{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);color:var(--dsw-alias-state-success-primary)}.SKV_configTag[data-enabled=false]{color:var(--dsw-alias-label-tertiary)}.SKV_chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .15s}.SKV_card[data-open=true] .SKV_chevron{transform:rotate(180deg)}.SKV_cardDetails{border-top:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:8px;padding:10px 12px;display:flex}.SKV_meta{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;margin:0}.SKV_metaProvider{color:var(--dsw-alias-label-tertiary);margin-left:6px}.SKV_contentBox{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-markdown-code-block);border-radius:8px;max-height:213px;overflow:auto}.SKV_content{margin:0;padding:10px 12px;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Consolas,Menlo,monospace;font-size:12px;line-height:18px}.SKV_failureText{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;margin:0}.SKV_cardActions{border-top:1px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding-top:10px;display:flex}.SKV_switchRow{align-items:center;gap:8px;display:inline-flex}.SKV_switch{box-sizing:border-box;width:36px;height:20px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:999px;cursor:pointer;padding:0;position:relative;flex:none;transition:background-color .2s ease,border-color .2s ease}.SKV_switch:disabled{cursor:default;opacity:.6}.SKV_switch[data-on=true]{border-color:transparent;background:var(--dsw-alias-state-business-primary)}.SKV_switchThumb{box-sizing:border-box;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-label-secondary);position:absolute;top:2px;left:2px;transition:transform .22s cubic-bezier(.34,1.56,.64,1),background-color .18s ease,width .15s ease}.SKV_switch[data-on=true] .SKV_switchThumb{transform:translateX(18px);background:var(--dsw-alias-label-primary-foreground)}.SKV_switch:active:not(:disabled) .SKV_switchThumb{width:18px}.SKV_switch[data-on=true]:active:not(:disabled) .SKV_switchThumb{transform:translateX(14px)}.SKV_switchText{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;background:0 0;border:0;padding:0;font-family:inherit;cursor:pointer;text-align:left}.SKV_switchText:hover:not(:disabled){color:var(--dsw-alias-label-primary)}.SKV_switchText:disabled{cursor:default;opacity:.6}.SKV_rowTitle{display:flex;align-items:center;gap:8px;min-width:0}.SKV_rowName{flex:0 1 auto;min-width:0}.SKV_tokChip{font-size:11px;line-height:16px;padding:1px 6px;border-radius:5px;flex:none;white-space:nowrap;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}.SKV_opError{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}.SKV_deleteButton{box-sizing:border-box;height:28px;color:var(--dsw-alias-state-error-primary);font:inherit;cursor:pointer;background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;padding:0 12px;font-size:12px;line-height:26px;margin-left:auto}.SKV_deleteButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid)}.SKV_deleteButton:disabled{cursor:default;opacity:.6}.SKV_originSection{display:flex;flex-direction:column;gap:8px}.SKV_originHead{width:100%;align-items:center;gap:7px;font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-bottom:1px solid var(--dsw-alias-border-l2);padding:6px 2px;display:flex;text-align:left}.SKV_originHead:hover{color:var(--dsw-alias-label-primary)}.SKV_originSection[data-collapsed=true] .SKV_originHead{border-bottom-color:transparent}.SKV_originChevron{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;flex:none;width:10px}.SKV_originLabel{font-size:12px;font-weight:600;line-height:18px;flex:1;min-width:0;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.SKV_originCount{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;font-size:11px;line-height:16px;flex:none}";
        // 添加技能：按钮组与状态行
        const cssAdd = ".SKV_addActions{margin-left:auto;align-items:center;gap:6px;display:inline-flex;position:relative}.SKV_addStatus{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:0}.SKV_fileInput{display:none}.SKV_addTarget{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;white-space:nowrap;max-width:150px;overflow:hidden;text-overflow:ellipsis;flex:none}.SKV_dropHint{position:absolute;inset:0;z-index:5;pointer-events:none;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb, var(--dsw-alias-bg-layer-3) 90%, transparent);border:1px dashed var(--dsw-alias-state-business-primary);border-radius:12px;color:var(--dsw-alias-state-business-primary);font-size:13px;line-height:20px}.SKV_addMenuWrap{position:relative;display:inline-flex}.SKV_addMenu{position:absolute;right:0;top:calc(100% + 6px);z-index:30;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;box-shadow:var(--dsw-shadow-lv2);padding:10px;display:flex;flex-direction:column;gap:8px;min-width:220px}.SKV_addMenuTitle{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);margin:0}.SKV_addMenuButton{font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);cursor:pointer;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 10px;text-align:left;display:flex;align-items:center;gap:8px}.SKV_addMenuButton:hover{background:var(--dsw-alias-interactive-bg-hover)}";
        // 作用域：横栏、迁移按钮与迁移对话框样式
        const cssScope = ".SKV_scopeOverlay{position:fixed;inset:0;background:color-mix(in srgb, rgba(0,0,0,.45) 55%, transparent);align-items:center;justify-content:center;display:flex;z-index:1000}.SKV_scopeBox{background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;box-shadow:var(--dsw-shadow-lv2);width:440px;max-width:calc(100vw - 48px);max-height:80vh;flex-direction:column;padding:16px;gap:12px;display:flex}.SKV_scopeBox h4{font-size:14px;font-weight:600;line-height:20px;margin:0}.SKV_scopeOptions{flex-direction:column;gap:8px;display:flex}.SKV_scopeOption{font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 12px;font-size:13px;line-height:20px;text-align:left;display:flex;align-items:center;gap:8px}.SKV_scopeOption[data-active=true]{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 1px color-mix(in srgb, var(--dsw-alias-state-business-primary) 30%, transparent)}.SKV_scopeOption input{margin:0;accent-color:var(--dsw-alias-state-business-primary)}.SKV_wsPath{color:var(--dsw-alias-label-tertiary);min-width:0;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.SKV_scopeActions{align-items:center;justify-content:flex-end;gap:8px;display:flex}.SKV_scopeAction{font:inherit;cursor:pointer;border-radius:6px;padding:5px 14px;font-size:13px;line-height:20px}.SKV_scopeCancel{background:0 0;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}.SKV_scopeConfirm{background:var(--dsw-alias-state-business-primary);border:1px solid transparent;color:var(--dsw-alias-state-business-on-primary, #fff)}.SKV_scopeConfirm:disabled{opacity:.6;cursor:default}";
        // 侧栏面板字形：宿主不再替我们画图标，由 sidebar.panellist 行自己渲染；
        // 图形沿用蒙版 PNG（背景色取 currentColor，选中/折叠态自动跟随宿主）
        const cssTheme = "body[data-ds-dark-theme] .SKV_switchThumb{background:#fff}body[data-ds-dark-theme] .SKV_switch[data-on=true] .SKV_switchThumb{background:#fff}";
        // 主页主区面板（main 槽位）的整页外壳：宿主不给滚动容器与页边距，
        // 这一层就是面板自己的「页面」。
        const cssPage = ".SKV_page{box-sizing:border-box;height:100%;color:var(--dsw-alias-label-primary);flex-direction:column;align-items:center;gap:24px;padding:28px clamp(24px,4vw,48px) 48px;display:flex;overflow:auto}.SKV_page>*{width:100%;max-width:760px}.SKV_pageHead{flex-direction:column;gap:4px;display:flex}.SKV_pageTitle{margin:0;font-size:20px;font-weight:500;line-height:28px}.SKV_pageIntro{color:var(--dsw-alias-label-secondary);margin:0;font-size:13px;line-height:20px}.SKV_pageTop{min-height:20px;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;display:flex}.SKV_pageBack{font:inherit;font-size:12.5px;line-height:20px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;align-items:center;gap:6px;padding:0;display:inline-flex}.SKV_pageBack:hover{color:var(--dsw-alias-label-primary)}.SKV_pageBack:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.SKV_pageBack svg{flex:none}.SKV_tabs{align-items:center;gap:4px;border-bottom:1px solid var(--dsw-alias-border-l2);display:flex;flex-wrap:wrap}.SKV_tab{font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;border-bottom:2px solid transparent;margin-bottom:-1px;padding:6px 12px;display:inline-flex;align-items:center}.SKV_tab:hover{color:var(--dsw-alias-label-primary)}.SKV_tab[data-active=true]{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-state-business-primary);font-weight:500}.SKV_tab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}";
        const cssPanelIcon = ".SKV_panelIcon{flex:none;display:inline-block;background-color:currentColor}.SKV_panelIconMerged{-webkit-mask:url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48' width='96' height='96' fill='none' stroke='currentColor' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><path d='M12 5H28L38 15V41a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z'/><path d='M28 5V13a2 2 0 0 0 2 2H38'/><path d='M17 29L23 23A2.83 2.83 0 0 1 27 27L21 33A2.83 2.83 0 0 0 25 37L31 31'/></svg>\") center/contain no-repeat;mask:url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48' width='96' height='96' fill='none' stroke='currentColor' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><path d='M12 5H28L38 15V41a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z'/><path d='M28 5V13a2 2 0 0 0 2 2H38'/><path d='M17 29L23 23A2.83 2.83 0 0 1 27 27L21 33A2.83 2.83 0 0 0 25 37L31 31'/></svg>\") center/contain no-repeat}";
        const cssMigrate = ".SKV_scopeBar{gap:6px;padding:2px;max-width:100%;overflow-x:auto;scrollbar-width:thin;display:flex;align-items:center}.SKV_migrateSection{flex-direction:column;gap:6px;display:flex}.SKV_migrateLabel{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;margin:0}.SKV_migrateFromValue{color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;margin:0;word-break:break-all}.SKV_migrateList{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;max-height:220px;overflow-y:auto;margin:0;padding:4px;list-style:none;display:flex;flex-direction:column;gap:2px}.SKV_migrateItem{font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:none;border-radius:6px;padding:6px 10px;font-size:13px;line-height:20px;text-align:left;display:flex;align-items:center;gap:8px}.SKV_migrateItem:hover{background:var(--dsw-alias-interactive-bg-hover)}.SKV_migrateItem input{margin:0;accent-color:var(--dsw-alias-state-business-primary)}.SKV_migrateItemName{flex:1;min-width:0;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.SKV_migrateItemState{color:var(--dsw-alias-label-tertiary);font-size:11px;flex:none}.SKV_migrateSelectAll{font:inherit;color:var(--dsw-alias-state-business-primary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:18px}.SKV_migrateHint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:0}.SKV_migrateResult{border-radius:8px;padding:8px 12px;font-size:12px;line-height:18px;margin:0}.SKV_migrateResult[data-ok=true]{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);color:var(--dsw-alias-state-success-primary)}.SKV_migrateResult[data-ok=false]{background:color-mix(in srgb, var(--dsw-alias-state-warning-primary) 10%, transparent);color:var(--dsw-alias-state-warning-primary)}.SKV_migrateResultList{margin:4px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:2px;max-height:120px;overflow-y:auto}.SKV_wsPath{min-width:0;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;display:block}.SKV_migrateOptionLabel{min-width:0;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.SKV_scopeOptions{max-height:132px;overflow-y:auto;scrollbar-width:thin}.SKV_migrateList{max-height:148px}.SKV_scopeBox{overflow-y:auto;scrollbar-width:thin}.SKV_select{width:100%;box-sizing:border-box;height:32px;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:0 8px}.SKV_select:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent);outline:none}.SKV_groupBody{display:flex;gap:16px;min-height:0}.SKV_groupSide{width:150px;flex:none;display:flex;flex-direction:column;gap:2px;min-width:0}.SKV_groupNewBtn{display:flex;align-items:center;gap:6px;justify-content:flex-start;font:inherit;font-size:13px;color:var(--dsw-alias-state-business-primary);cursor:pointer;background:0 0;border:1px dashed var(--dsw-alias-border-l1);border-radius:8px;padding:7px 10px;margin-bottom:6px;text-align:left}.SKV_groupNewBtn:hover{background:var(--dsw-alias-interactive-bg-hover)}.SKV_groupSideLabel{font-size:12px;color:var(--dsw-alias-label-tertiary);padding:0 10px;margin-bottom:2px}.SKV_groupSideItem{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;font:inherit;font-size:13px;cursor:pointer;color:var(--dsw-alias-label-secondary);background:0 0;border:none;text-align:left;min-width:0}.SKV_groupSideItem:hover{background:var(--dsw-alias-interactive-bg-hover)}.SKV_groupSideItem[data-active=true]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent);color:var(--dsw-alias-state-business-primary);font-weight:500}.SKV_groupMain{flex:1;min-width:0;display:flex;flex-direction:column;gap:12px}.SKV_field{display:flex;flex-direction:column;gap:6px}.SKV_fieldLabel{font-size:12px;color:var(--dsw-alias-label-secondary);margin:0}.SKV_skillListBox{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:0 10px;max-height:220px;overflow-y:auto}.SKV_skillRow{display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:0.5px solid var(--dsw-alias-border-l2);font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;min-width:0}.SKV_skillRow:last-child{border-bottom:none}.SKV_skillRow:hover{background:var(--dsw-alias-interactive-bg-hover)}.SKV_skillRow input{margin:0;accent-color:var(--dsw-alias-state-business-primary);flex:none}.SKV_skillName{flex:1;min-width:0;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.SKV_skillBadge{font-size:12px;padding:2px 8px;border-radius:5px;white-space:nowrap;flex:none}.SKV_skillBadge[data-on=true]{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent);color:var(--dsw-alias-state-success-primary)}.SKV_skillBadge[data-on=false]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-tertiary)}.SKV_countRow{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}.SKV_countText{font-size:12px;color:var(--dsw-alias-label-secondary);margin:0}.SKV_dialogFooter{display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding-top:12px;border-top:0.5px solid var(--dsw-alias-border-l2)}.SKV_dangerBtn{font:inherit;font-size:13px;color:var(--dsw-alias-state-error-primary);cursor:pointer;background:0 0;border:1px solid transparent;border-radius:6px;padding:5px 10px}.SKV_dangerBtn:hover:not(:disabled){background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent)}.SKV_dangerBtn:disabled{cursor:default;opacity:.6}.SKV_textInput{width:100%;box-sizing:border-box;height:32px;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;outline:none;padding:0 10px}.SKV_textInput::placeholder{color:var(--dsw-alias-label-tertiary)}.SKV_textInput:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent)}.SKV_scopeBox{width:640px}.SKV_groupSide{width:170px}.SKV_groupSideItem{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.SKV_select{appearance:none;-webkit-appearance:none;width:100%;box-sizing:border-box;height:32px;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary);background-color:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:0 30px 0 10px;background-image:url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 16 16%27 fill=%27none%27%3E%3Cpath d=%27M4 6l4 4 4-4%27 stroke=%27%23888%27 stroke-width=%271.6%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27/%3E%3C/svg%3E');background-repeat:no-repeat;background-position:right 10px center}.SKV_select:hover{border-color:var(--dsw-alias-border-l1)}.SKV_targetBox{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:4px;max-height:152px;overflow-y:auto;scrollbar-width:thin}.SKV_targetItem{display:flex;align-items:center;gap:8px;padding:7px 6px;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:none;border-bottom:0.5px solid var(--dsw-alias-border-l2);width:100%;text-align:left;min-width:0}.SKV_targetItem:last-child{border-bottom:none}.SKV_targetItem:hover{background:var(--dsw-alias-interactive-bg-hover)}.SKV_targetItem[data-active=true]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent)}.SKV_targetItem input{margin:0;accent-color:var(--dsw-alias-state-business-primary);flex:none}.SKV_skillListBox{max-height:180px};.SKV_groupBar{gap:6px;padding:2px;display:flex;flex-wrap:wrap;align-items:center}.SKV_groupItem{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:3px 11px;font-size:12px;line-height:18px;white-space:nowrap;flex:none}.SKV_groupItem:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l1)}.SKV_groupItem[data-active=true]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent);border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary);font-weight:500}.SKV_groupSep{display:none}.SKV_scopeSelect{display:inline-flex;align-items:center;gap:12px;box-sizing:border-box;height:36px;max-width:100%;padding:0 14px;border:none;border-radius:18px;background:var(--dsw-alias-bg-module-platform);font:inherit;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary);cursor:pointer}.SKV_scopeSelect:hover{background:var(--dsw-alias-interactive-bg-hover)}.SKV_scopeSelectLabel{min-width:0;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.SKV_scopeSelectChevron{flex:none;color:var(--dsw-alias-label-tertiary)}";
        const cssCategory = ".SKV_categoryBar{display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap}.SKV_categoryLabel{font-size:12px;color:var(--dsw-alias-label-tertiary);flex:none;margin-right:2px}.SKV_categoryChip{font:inherit;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:2px 10px;white-space:nowrap;flex:none}.SKV_categoryChip:hover{background:var(--dsw-alias-interactive-bg-hover)}.SKV_categoryChip[data-active=true]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent);border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}";
        const cssTree = ".SKV_treeFolder{grid-column:1/-1;display:flex;flex-direction:column;gap:10px}.SKV_treeFolderHeader{display:flex;align-items:center;gap:6px;width:100%;font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 10px;text-align:left}.SKV_treeFolderHeader:hover{background:var(--dsw-alias-interactive-bg-hover)}.SKV_treeFolderName{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.SKV_treeFolderCount{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;font-size:12px;line-height:18px;flex:none}.SKV_treeChevron{transition:transform .15s;transform:rotate(-90deg)}.SKV_treeChevronOpen{transition:transform .15s;transform:rotate(0deg)}";
        const cssEffects = "@keyframes skvFadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}@keyframes skvFadeOnly{from{opacity:0}to{opacity:1}}@keyframes skvPopIn{from{opacity:0;transform:translateY(-4px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes skvPulse{0%,100%{opacity:.55}50%{opacity:1}}.SKV_status{animation:skvPulse 1.6s ease-in-out infinite}.SKV_card{transition:border-color .18s cubic-bezier(.22,.61,.36,1),box-shadow .18s cubic-bezier(.22,.61,.36,1)}.SKV_card:hover{border-color:var(--dsw-alias-border-l1)}.SKV_cardContent{transition:background-color .15s ease}.SKV_cardContent:hover{background:var(--dsw-alias-interactive-bg-hover)}.SKV_cardContent:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}.SKV_cardDetails{animation:skvFadeIn .18s cubic-bezier(.22,.61,.36,1)}.SKV_cards{animation:skvFadeOnly .2s ease}.SKV_addMenu{animation:skvPopIn .15s cubic-bezier(.22,.61,.36,1)}.SKV_dropHint{animation:skvFadeOnly .15s ease}.SKV_scopeOverlay{animation:skvFadeOnly .15s ease}.SKV_scopeBox{animation:skvPopIn .18s cubic-bezier(.22,.61,.36,1)}.SKV_searchField,.SKV_textInput,.SKV_select{transition:border-color .15s ease,box-shadow .15s ease}.SKV_categoryChip,.SKV_migrateItem,.SKV_targetItem,.SKV_scopeOption{transition:background-color .15s ease,border-color .15s ease,color .15s ease}.SKV_iconButton,.SKV_addMenuButton,.SKV_deleteButton,.SKV_noticeButton,.SKV_scopeAction,.SKV_dangerBtn,.SKV_groupNewBtn,.SKV_migrateSelectAll{transition:background-color .15s ease,border-color .15s ease,transform .1s ease}.SKV_iconButton:active:not(:disabled),.SKV_deleteButton:active:not(:disabled),.SKV_scopeAction:active,.SKV_addMenuButton:active,.SKV_dangerBtn:active:not(:disabled),.SKV_groupNewBtn:active{transform:scale(.96)}.SKV_iconButton:focus-visible,.SKV_deleteButton:focus-visible,.SKV_scopeAction:focus-visible,.SKV_switch:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.SKV_fieldLabel,.SKV_groupSideLabel,.SKV_migrateLabel,.SKV_categoryLabel{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary)}.SKV_scopeBox{padding:20px;gap:14px}.SKV_groupSide{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:8px;box-sizing:border-box}.SKV_groupNewBtn{align-items:center;gap:6px}.SKV_groupNewBtn svg{flex:none}.SKV_groupDelete{align-items:center;justify-content:center}.SKV_migrateResult{display:flex;align-items:center;gap:7px}.SKV_migrateResult svg{flex:none}.SKV_dialogFooter{gap:12px}@media (prefers-reduced-motion: reduce){.SKV_page *{animation-duration:.001ms!important;animation-iteration-count:1!important}.SKV_section *{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}}";
        // 末条规则把作用域下拉限制为最多 11 行可见（Menu 项 min-height 40px × 11 + 卡片 padding 8px = 448px），
        // 超出部分在宿主 Menu 自己的 .viewport 里滚动。Menu 以 portal 渲染到 document.body，
        // 拿不到它的 DOM 层级，故用 :has() 以「我们的下拉正打开」为条件精确限定，
        // 不影响宿主自己的其它菜单；:has() 不可用时该规则失效，退化为原来的整屏上限。
        const cssChipRefresh = ".SKV_scopeBar{gap:4px;padding:2px 2px 6px}.SKV_groupBar{gap:5px;padding:2px}.SKV_groupItem{background:transparent;border:1px solid transparent;border-radius:8px;padding:6px 12px;font-size:13px;line-height:18px}.SKV_groupItem:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:transparent;color:var(--dsw-alias-label-primary)}.SKV_groupItem[data-active=true]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent);border-color:transparent;font-weight:500}.SKV_categoryBar{gap:6px 8px}.SKV_categoryChip{background:transparent;border:1px solid transparent;border-radius:7px;padding:5px 12px;font-size:12px}.SKV_categoryChip:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:transparent}.SKV_categoryChip[data-active=true]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent);border-color:transparent;font-weight:500}body:has(.SKV_scopeSelect[aria-expanded=true])>div[role=menu]{max-height:min(448px,calc(100vh - 24px))}";
        // 分组：对话框侧栏、分组横栏 chip（含启用/总数）与卡片上方的整组启停胶囊按钮（补齐 2.0.2 的 cssGroupDelete）
        const cssGroups = ".SKV_groupItemWrap{position:relative;display:inline-flex;align-items:center;gap:2px}.SKV_groupSideItemWrap{position:relative;display:flex;align-items:center;min-width:0}.SKV_groupSideItemWrap .SKV_groupSideItem{flex:1;min-width:0}.SKV_groupDelete{display:none;width:16px;height:16px;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;line-height:14px;cursor:pointer;background:0 0;border:none;border-radius:999px;padding:0;margin-left:2px;flex:none}.SKV_groupSideItemWrap:hover .SKV_groupDelete{display:inline-flex}.SKV_groupDelete:hover{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent)}.SKV_groupDelete[data-confirm=true]{display:inline-flex;width:auto;height:18px;padding:0 7px;color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent)}.SKV_groupToggle{font:inherit;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap;cursor:pointer;background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:1px 7px;margin-left:2px;flex:none}.SKV_groupToggle:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.SKV_groupToggle[data-on=true]{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, transparent)}.SKV_groupToggle:disabled{opacity:.6;cursor:not-allowed}.SKV_groupItem{display:inline-flex;align-items:center}.SKV_groupItemCount{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;font-size:11px;line-height:15px;margin-left:4px}.SKV_groupItem[data-active=true] .SKV_groupItemCount{color:inherit}.SKV_groupBulkRow{display:flex;align-items:center;gap:8px;margin:0 0 8px}.SKV_pluginToggle{display:inline-flex;align-items:center;gap:6px;margin-left:auto;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap}.SKV_pluginToggle input{margin:0;accent-color:var(--dsw-alias-state-business-primary)}.SKV_pluginToggle:hover{color:var(--dsw-alias-label-primary)}.SKV_groupBulkBtn{font:inherit;font-size:12px;line-height:18px;color:var(--dsw-alias-state-business-primary);cursor:pointer;background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent);border:1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary) 35%, transparent);border-radius:999px;padding:4px 14px;white-space:nowrap;flex:none}.SKV_groupBulkBtn:hover:not(:disabled){background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 16%, transparent)}.SKV_groupBulkBtn:disabled{cursor:default;opacity:.55}";
        // 三栏外壳（v2.1.6 重构）：左轨工作区 / 中栏「分组·来源」/ 右侧主区。
        // 颜色一律走宿主 token（--dsw-alias-*）——设计稿只是深色示意，它的十六进制值
        // 一个都不抄进来，面板才能跟着宿主的深/浅主题走。
        // 主区单独一层滚动容器（.SKV_mainScroll），这样底部批量栏与顶部 Toast 能相对
        // .SKV_mainCol 绝对定位、不随列表滚走。
        const cssShell = ".SKV_page[data-tab=skills],.SKV_page[data-tab=mcp]{align-items:stretch;gap:12px;padding:18px 0 0;overflow:hidden}.SKV_page[data-tab=skills]>.SKV_pageTop,.SKV_page[data-tab=mcp]>.SKV_pageTop{padding:0 clamp(20px,3vw,40px)}.SKV_page[data-tab=skills]>.SKV_tabs,.SKV_page[data-tab=mcp]>.SKV_tabs{gap:22px;padding:0 clamp(20px,3vw,40px)}.SKV_page[data-tab=skills]>.SKV_pageTop,.SKV_page[data-tab=skills]>.SKV_tabs,.SKV_page[data-tab=mcp]>.SKV_pageTop,.SKV_page[data-tab=mcp]>.SKV_tabs{max-width:none;width:100%;box-sizing:border-box}.SKV_page[data-tab=skills]>*{max-width:none}.SKV_page[data-tab=mcp]>.MCP_section{box-sizing:border-box;width:100%;max-width:none;margin:0;padding:0;flex:1;min-height:0;overflow:hidden}@keyframes skvTabIn{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}.SKV_page[data-tab]>.SKV_section,.SKV_page[data-tab]>.MCP_section{animation:skvTabIn .2s cubic-bezier(.3,.8,.2,1)}"
            // 页签下划线：不用边框色切换（会瞬移），改成一条从中间长出来的指示条。
            + ".SKV_tab{position:relative;padding:8px 2px 10px;font-size:13.5px;border-bottom-color:transparent!important}"
            + ".SKV_tab::after{content:\"\";position:absolute;left:2px;right:2px;bottom:-1px;height:2px;border-radius:2px;background:var(--dsw-alias-state-business-primary);transform:scaleX(0);transition:transform .28s cubic-bezier(.3,.8,.2,1)}"
            + ".SKV_tab[data-active=true]::after{transform:scaleX(1)}"
            + ".SKV_section{max-width:none;flex:1;min-height:0;flex-direction:row;gap:0;overflow:hidden}"
            + ".SKV_rail{flex:none;width:188px;display:flex;flex-direction:column;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-layer-2);border-right:1px solid var(--dsw-alias-border-l2)}"
            + ".SKV_railHead{padding:18px 22px 8px;color:var(--dsw-alias-label-tertiary);font-size:12.5px;line-height:18px}"
            + ".SKV_railList{position:relative;flex:1;min-height:0;overflow-y:auto;padding:4px 12px 14px 14px;scrollbar-width:thin}"
            + ".SKV_railItem{display:flex;align-items:center;justify-content:space-between;width:100%;height:34px;margin:2px 0;padding:0 10px;border:0;border-radius:8px;background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer;transition:background-color .18s cubic-bezier(.3,.8,.2,1),color .18s cubic-bezier(.3,.8,.2,1)}"
            + ".SKV_railItem:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}"
            + ".SKV_railItem[data-active=true]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent);color:var(--dsw-alias-label-primary)}"
            + ".SKV_railItem[data-drop-hover=true]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 20%, transparent);color:var(--dsw-alias-label-primary);outline:1.5px dashed var(--dsw-alias-state-business-primary);outline-offset:-1px}"
            + ".SKV_railItemName{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
            + ".SKV_railItemCount{flex:none;margin-left:8px;font-size:11.5px;line-height:18px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary)}"
            + ".SKV_railItem[data-active=true] .SKV_railItemCount{color:inherit;opacity:.75}"
            + ".SKV_railBar{position:absolute;left:0;top:0;width:3px;height:18px;border-radius:0 3px 3px 0;background:var(--dsw-alias-state-business-primary);box-shadow:0 0 10px color-mix(in srgb, var(--dsw-alias-state-business-primary) 70%, transparent);transition:transform .3s cubic-bezier(.3,.8,.2,1);pointer-events:none}"
            + ".SKV_pane{flex:none;width:204px;display:flex;flex-direction:column;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-layer-1);border-right:1px solid var(--dsw-alias-border-l2)}"
            + ".SKV_paneHead{flex:none;display:flex;align-items:center;gap:6px;padding:18px 16px 8px;flex-wrap:wrap;row-gap:6px}"
            + ".SKV_paneTitle{min-width:0;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;font-weight:600;line-height:22px}"
            + ".SKV_paneModes{flex:none;margin-left:auto;display:inline-flex;padding:1px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-3)}"
            + ".SKV_paneMode{font:inherit;font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-tertiary);background:0 0;border:0;border-radius:999px;padding:2px 7px;cursor:pointer;transition:background-color .18s cubic-bezier(.3,.8,.2,1),color .18s cubic-bezier(.3,.8,.2,1)}"
            + ".SKV_paneMode[data-active=true]{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}"
            + ".SKV_paneMode:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}"
            + ".SKV_paneList{flex:1;min-height:0;overflow-y:auto;padding:4px 12px;display:flex;flex-direction:column;gap:2px;scrollbar-width:thin}"
            + ".SKV_paneRow{display:flex;align-items:center;gap:4px;min-width:0;border-radius:8px;transition:background-color .18s cubic-bezier(.3,.8,.2,1)}"
            + ".SKV_paneRow[data-drop-hover=true]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent);outline:1.5px dashed var(--dsw-alias-state-business-primary);outline-offset:-1px}"
            + ".SKV_paneRow>.SKV_paneItem{flex:1;min-width:0;width:auto}"
            + ".SKV_paneItem{display:flex;align-items:center;justify-content:space-between;width:100%;padding:7px 12px;border:0;border-radius:8px;background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:18px;text-align:left;cursor:pointer;transition:background-color .18s cubic-bezier(.3,.8,.2,1),color .18s cubic-bezier(.3,.8,.2,1)}"
            + ".SKV_paneItem:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}"
            + ".SKV_paneItem[data-active=true]{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary);font-weight:500}"
            + ".SKV_paneItem:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}"
            + ".SKV_paneItemName{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
            + ".SKV_paneItemCount{flex:none;margin-left:8px;font-size:11.5px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}"
            + ".SKV_paneGroupToggle{flex:none;height:22px;padding:0 6px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:0 0;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:11px;line-height:20px;font-variant-numeric:tabular-nums;cursor:pointer;transition:background-color .18s ease,color .18s ease,border-color .18s ease}"
            + ".SKV_paneGroupToggle[data-on=true]{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent)}"
            + ".SKV_paneGroupToggle:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}"
            + ".SKV_paneGroupToggle:disabled{opacity:.45;cursor:default}"
            + ".SKV_paneGroupEdit{flex:none;width:22px;height:22px;padding:0;border:0;border-radius:6px;background:0 0;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;opacity:.75;transition:background-color .18s ease,opacity .18s ease,color .18s ease}"
            + ".SKV_paneGroupEdit:hover{opacity:1;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}"
            + ".SKV_paneNew{flex:none;display:flex;align-items:center;gap:8px;margin:8px 12px 16px;padding:8px 12px;border:1px dashed var(--dsw-alias-border-l1);border-radius:8px;background:0 0;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12.5px;line-height:18px;text-align:left;cursor:pointer}"
            + ".SKV_paneNew:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}"
            + ".SKV_mainCol{position:relative;flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}"
            + ".SKV_mainScroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:22px clamp(20px,3vw,40px) 96px;display:flex;flex-direction:column;align-items:center;scrollbar-width:thin}"
            + ".SKV_mainScroll>.SKV_catalog{width:100%;max-width:780px}"
            + ".SKV_toolRow{display:flex;align-items:center;justify-content:space-between;gap:12px}"
            + ".SKV_toolRow h3{margin:0;font-size:15px;font-weight:600;line-height:22px}"
            + ".SKV_toolRow h3 span{margin-left:6px;color:var(--dsw-alias-label-tertiary);font-weight:400;font-variant-numeric:tabular-nums}"
            + ".SKV_toolButtons{flex:none;display:flex;align-items:center;gap:8px}"
            + ".SKV_toolButton{position:relative;box-sizing:border-box;width:36px;height:32px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;transition:background-color .18s cubic-bezier(.3,.8,.2,1),color .18s cubic-bezier(.3,.8,.2,1)}"
            + ".SKV_toolButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}"
            + ".SKV_toolButton[data-active=true]{color:var(--dsw-alias-state-business-primary)}"
            + ".SKV_toolButton:disabled{cursor:default;opacity:.5}"
            + ".SKV_toolButton:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}"
            + ".SKV_toolButton:hover:not(:disabled)::after{content:attr(aria-label);position:absolute;top:calc(100% + 6px);right:0;z-index:40;white-space:nowrap;background:var(--dsw-alias-tooltip-bg);color:var(--dsw-alias-toast-label);font-size:12px;line-height:18px;padding:3px 8px;border-radius:6px;box-shadow:var(--dsw-shadow-lv1);pointer-events:none}"
            // 简洁模式的工作区下拉：自带定位，不依赖宿主 Menu 的 portal/锚点测量
            + ".SKV_scopeMenuWrap{position:relative;display:inline-flex}"
            + ".SKV_scopeMenuOverlay{position:fixed;inset:0;z-index:29}"
            + ".SKV_scopeMenu{position:absolute;left:0;top:calc(100% + 6px);z-index:30;box-sizing:border-box;min-width:220px;max-width:min(360px,calc(100vw - 48px));max-height:min(448px,calc(100vh - 32px));overflow-y:auto;scrollbar-width:thin;display:flex;flex-direction:column;gap:2px;padding:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-3);box-shadow:var(--dsw-shadow-lv2)}"
            + ".SKV_scopeMenuItem{display:flex;align-items:center;gap:8px;width:100%;min-height:34px;padding:0 10px;border:0;border-radius:8px;background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer;white-space:nowrap}"
            + ".SKV_scopeMenuItem:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}"
            + ".SKV_scopeMenuItem[data-active=true]{color:var(--dsw-alias-label-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent)}"
            + ".SKV_scopeMenuItemLabel{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}"
            + ".SKV_scopeMenuItemCount{flex:none;font-size:11.5px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}"
            + ".SKV_scopeMenuItemCheck{flex:none;color:var(--dsw-alias-state-business-primary)}"
            + ".SKV_filterBar{display:flex;flex-direction:column;gap:2px;margin:2px 0 10px}"
            // 简洁模式：内容区放宽一点，卡片恢复成一行两个（旧版就是这么排的，Issue #50）
            + ".SKV_section[data-layout=compact] .SKV_mainScroll>.SKV_catalog{max-width:940px}"
            + ".SKV_section[data-layout=compact] .SKV_cards{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}"
            + "@media (max-width:900px){.SKV_section[data-layout=compact] .SKV_cards{grid-template-columns:minmax(0,1fr)}}"
            // 820px 及以下由 JS 直接把外壳换成简洁（Issue #71），正常情况下这三条收窄规则用不到；
            // 留着是 matchMedia 不可用时的兜底：那时仍是三栏，至少把左右两栏挤窄一点。主区留白两者通用。
            + "@media (max-width:820px){.SKV_rail{width:140px}.SKV_pane{width:150px}.SKV_mainScroll{padding:20px 20px 96px}}";
        // 卡片行（v2.1.6 重构）：[勾选框][图标][名称 + 描述][红绿灯 + 删除]。
        // 勾选框用原生 input（accent-color 跟随宿主主题），批量模式之外宽度收缩到 0。
        const cssRow = ".SKV_cards{grid-template-columns:minmax(0,1fr)}"
            + ".SKV_cardRow{display:flex;align-items:center;padding:10px 12px;transition:background-color .18s cubic-bezier(.3,.8,.2,1)}"
            + ".SKV_card[data-selected=true]{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent)}"
            + ".SKV_card[data-dragging=true]{opacity:.5}"
            + ".SKV_card[data-removing=true]{pointer-events:none;opacity:0;transform:translateX(14px)}"
            + ".SKV_check{display:flex;align-items:center;flex:none;width:0;margin-right:0;overflow:hidden;transition:width .22s cubic-bezier(.3,.8,.2,1),margin .22s cubic-bezier(.3,.8,.2,1)}"
            + ".SKV_section[data-batch=true] .SKV_check{width:18px;margin-right:12px}"
            + ".SKV_checkBox{box-sizing:border-box;width:18px;height:18px;flex:none;margin:0;cursor:pointer;accent-color:var(--dsw-alias-state-business-primary)}"
            + ".SKV_rowIcon{flex:none;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;margin-right:14px;border-radius:8px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);color:var(--dsw-alias-label-tertiary)}"
            + ".SKV_rowText{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;padding:2px 0;border:0;border-radius:6px;background:0 0;color:inherit;font:inherit;text-align:left;cursor:pointer}"
            + ".SKV_rowText:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}"
            + ".SKV_rowName{font-size:14px;font-weight:600;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:color .2s ease}"
            + ".SKV_rowName[data-disabled=true]{color:var(--dsw-alias-label-tertiary)}"
            + ".SKV_rowDesc{color:var(--dsw-alias-label-tertiary);font-size:12.5px;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
            + ".SKV_rowControls{flex:none;display:flex;align-items:center;gap:8px;margin-left:14px}"
            + ".SKV_traffic{display:inline-flex;align-items:center;gap:6px;padding:9px 11px;border:0;border-radius:999px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);cursor:pointer;transition:background-color .18s cubic-bezier(.3,.8,.2,1)}"
            + ".SKV_traffic:hover:not(:disabled){background:color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent)}"
            + ".SKV_traffic:disabled{cursor:default;opacity:.55}"
            + ".SKV_traffic:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}"
            + ".SKV_trafficDot{display:block;width:9px;height:9px;border-radius:50%;transition:opacity .25s cubic-bezier(.3,.8,.2,1),box-shadow .25s cubic-bezier(.3,.8,.2,1)}"
            + ".SKV_trafficRed{background:var(--dsw-alias-state-error-primary);opacity:.25}"
            + ".SKV_trafficGreen{background:var(--dsw-alias-state-success-primary);opacity:.25}"
            + ".SKV_traffic[data-on=true] .SKV_trafficGreen{opacity:1;box-shadow:0 0 9px var(--dsw-alias-state-success-primary)}"
            + ".SKV_traffic[data-on=false] .SKV_trafficRed{opacity:1;box-shadow:0 0 9px var(--dsw-alias-state-error-primary)}"
            + ".SKV_rowDelete{box-sizing:border-box;width:32px;height:27px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:999px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);color:var(--dsw-alias-label-tertiary);cursor:pointer;transition:background-color .18s cubic-bezier(.3,.8,.2,1),color .18s cubic-bezier(.3,.8,.2,1)}"
            + ".SKV_rowDelete:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}"
            + ".SKV_rowDelete:disabled{cursor:default;opacity:.5}"
            + ".SKV_rowDelete:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}"
            + ".SKV_empty{margin:0;padding:56px 0;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}"
            + ".SKV_batchBar{position:absolute;left:50%;bottom:22px;z-index:20;display:flex;align-items:center;gap:14px;padding:10px 12px 10px 18px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-3);box-shadow:var(--dsw-shadow-lv2);white-space:nowrap;opacity:0;transform:translate(-50%,24px);pointer-events:none;transition:opacity .26s cubic-bezier(.3,.8,.2,1),transform .26s cubic-bezier(.3,.8,.2,1)}"
            + ".SKV_section[data-batch=true] .SKV_batchBar{opacity:1;transform:translate(-50%,0);pointer-events:auto}"
            + ".SKV_batchCount{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}"
            + ".SKV_batchBtn{font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary);background:0 0;border:0;border-radius:9px;padding:7px 14px;cursor:pointer;transition:background-color .18s cubic-bezier(.3,.8,.2,1),color .18s cubic-bezier(.3,.8,.2,1)}"
            + ".SKV_batchBtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}"
            + ".SKV_batchGo{background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-on-primary, #fff)}"
            + ".SKV_batchGo:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover);color:var(--dsw-alias-state-business-on-primary, #fff)}"
            + ".SKV_batchGo:disabled{cursor:default;opacity:.4}"
            + ".SKV_toast{position:absolute;left:50%;top:20px;z-index:30;display:flex;align-items:center;gap:14px;max-width:min(680px,90%);padding:9px 16px;border-radius:10px;background:var(--dsw-alias-toast-bg);color:var(--dsw-alias-toast-label);box-shadow:var(--dsw-shadow-lv2);opacity:0;transform:translate(-50%,-12px);pointer-events:none;transition:opacity .24s cubic-bezier(.3,.8,.2,1),transform .24s cubic-bezier(.3,.8,.2,1)}"
            + ".SKV_toast[data-show=true]{opacity:1;transform:translate(-50%,0);pointer-events:auto}"
            + ".SKV_toastText{font-size:13px;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
            + ".SKV_toastAction{flex:none;font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-toast-label);background:color-mix(in srgb, var(--dsw-alias-toast-label) 14%, transparent);border:0;border-radius:6px;padding:3px 10px;cursor:pointer;transition:background-color .18s cubic-bezier(.3,.8,.2,1)}"
            + ".SKV_toastAction:hover{background:color-mix(in srgb, var(--dsw-alias-toast-label) 24%, transparent)}"
            + ".SKV_toastAction:focus-visible{outline:2px solid var(--dsw-alias-toast-label);outline-offset:1px}";
        ;
        const css = cssPage + cssChrome + cssCards + cssAdd + cssScope + cssMigrate + cssCategory + cssTree + cssPanelIcon + cssTheme + cssEffects + cssChipRefresh + cssGroups + cssShell + cssRow;
        const tagId = "dsh-skill-mcp-panel/SkillsSection.module.css";
        if (typeof document !== "undefined") {
            let tag = document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]");
            if (tag === null) {
                tag = document.createElement("style");
                tag.dataset.plugin = "dsh-skill-mcp-panel";
                tag.dataset.pluginCss = tagId;
                document.head.appendChild(tag);
            }
            // 始终用当前版本的样式覆盖，避免残留旧样式标签
            tag.textContent = css;
        }
        // 类名映射（CSS 是内联手写字符串，无法走 CSS Modules）
        const c = {
            tab: "SKV_tab",
            tabs: "SKV_tabs",
            pluginToggle: "SKV_pluginToggle",
            page: "SKV_page",
            pageHead: "SKV_pageHead",
            pageTitle: "SKV_pageTitle",
            pageIntro: "SKV_pageIntro",
            pageTop: "SKV_pageTop",
            pageBack: "SKV_pageBack",
            section: "SKV_section",
            status: "SKV_status",
            failure: "SKV_failure",
            catalog: "SKV_catalog",
            searchBox: "SKV_searchBox",
            searchIcon: "SKV_searchIcon",
            searchField: "SKV_searchField",
            catalogHeading: "SKV_catalogHeading",
            cards: "SKV_cards",
            originSection: "SKV_originSection",
            originHead: "SKV_originHead",
            originChevron: "SKV_originChevron",
            originLabel: "SKV_originLabel",
            originCount: "SKV_originCount",
            card: "SKV_card",
            cardContent: "SKV_cardContent",
            cardLeading: "SKV_cardLeading",
            cardTitle: "SKV_cardTitle",
            cardTrailing: "SKV_cardTrailing",
            statusDot: "SKV_statusDot",
            configTag: "SKV_configTag",
            chevron: "SKV_chevron",
            cardDetails: "SKV_cardDetails",
            meta: "SKV_meta",
            metaProvider: "SKV_metaProvider",
            contentBox: "SKV_contentBox",
            content: "SKV_content",
            failureText: "SKV_failureText",
            cardActions: "SKV_cardActions",
            rowTitle: "SKV_rowTitle",
            tokChip: "SKV_tokChip",
            switchRow: "SKV_switchRow",
            switch: "SKV_switch",
            switchThumb: "SKV_switchThumb",
            switchText: "SKV_switchText",
            opError: "SKV_opError",
            deleteButton: "SKV_deleteButton",
            addActions: "SKV_addActions",
            iconButton: "SKV_iconButton",
            addStatus: "SKV_addStatus",
            addTarget: "SKV_addTarget",
            dropHint: "SKV_dropHint",
            notice: "SKV_notice",
            noticeText: "SKV_noticeText",
            noticeButton: "SKV_noticeButton",
            fileInput: "SKV_fileInput",
            addMenuWrap: "SKV_addMenuWrap",
            addMenu: "SKV_addMenu",
            addMenuTitle: "SKV_addMenuTitle",
            addMenuButton: "SKV_addMenuButton",
            scopeOverlay: "SKV_scopeOverlay",
            scopeBox: "SKV_scopeBox",
            scopeOptions: "SKV_scopeOptions",
            scopeOption: "SKV_scopeOption",
            wsPath: "SKV_wsPath",
            scopeActions: "SKV_scopeActions",
            scopeAction: "SKV_scopeAction",
            scopeCancel: "SKV_scopeCancel",
            scopeConfirm: "SKV_scopeConfirm",
            scopeBar: "SKV_scopeBar",
            scopeSelect: "SKV_scopeSelect",
            scopeSelectLabel: "SKV_scopeSelectLabel",
            scopeSelectChevron: "SKV_scopeSelectChevron",
            scopeMenuWrap: "SKV_scopeMenuWrap",
            scopeMenuOverlay: "SKV_scopeMenuOverlay",
            scopeMenu: "SKV_scopeMenu",
            scopeMenuItem: "SKV_scopeMenuItem",
            scopeMenuItemLabel: "SKV_scopeMenuItemLabel",
            scopeMenuItemCount: "SKV_scopeMenuItemCount",
            scopeMenuItemCheck: "SKV_scopeMenuItemCheck",
            groupBar: "SKV_groupBar",
            groupItem: "SKV_groupItem",
            groupItemCount: "SKV_groupItemCount",
            groupBulkRow: "SKV_groupBulkRow",
            groupBulkBtn: "SKV_groupBulkBtn",
            groupDelete: "SKV_groupDelete",
            groupSep: "SKV_groupSep",
            treeFolder: "SKV_treeFolder",
            treeFolderHeader: "SKV_treeFolderHeader",
            treeFolderName: "SKV_treeFolderName",
            treeFolderCount: "SKV_treeFolderCount",
            treeChevron: "SKV_treeChevron",
            treeChevronOpen: "SKV_treeChevronOpen",
            categoryBar: "SKV_categoryBar",
            categoryLabel: "SKV_categoryLabel",
            categoryChip: "SKV_categoryChip",
            select: "SKV_select",
            groupBody: "SKV_groupBody",
            groupSide: "SKV_groupSide",
            groupNewBtn: "SKV_groupNewBtn",
            groupSideLabel: "SKV_groupSideLabel",
            groupSideItem: "SKV_groupSideItem",
            groupSideItemWrap: "SKV_groupSideItemWrap",
            groupMain: "SKV_groupMain",
            field: "SKV_field",
            fieldLabel: "SKV_fieldLabel",
            skillListBox: "SKV_skillListBox",
            skillRow: "SKV_skillRow",
            skillName: "SKV_skillName",
            skillBadge: "SKV_skillBadge",
            countRow: "SKV_countRow",
            countText: "SKV_countText",
            dialogFooter: "SKV_dialogFooter",
            dangerBtn: "SKV_dangerBtn",
            textInput: "SKV_textInput",
            targetBox: "SKV_targetBox",
            targetItem: "SKV_targetItem",
            migrateSection: "SKV_migrateSection",
            migrateLabel: "SKV_migrateLabel",
            migrateFromValue: "SKV_migrateFromValue",
            migrateList: "SKV_migrateList",
            migrateItem: "SKV_migrateItem",
            migrateItemName: "SKV_migrateItemName",
            migrateItemState: "SKV_migrateItemState",
            migrateSelectAll: "SKV_migrateSelectAll",
            migrateHint: "SKV_migrateHint",
            migrateResult: "SKV_migrateResult",
            migrateResultList: "SKV_migrateResultList",
            migrateOptionLabel: "SKV_migrateOptionLabel",
            // v2.1.6 三栏外壳
            rail: "SKV_rail",
            railHead: "SKV_railHead",
            railList: "SKV_railList",
            railItem: "SKV_railItem",
            railItemName: "SKV_railItemName",
            railItemCount: "SKV_railItemCount",
            railBar: "SKV_railBar",
            pane: "SKV_pane",
            paneHead: "SKV_paneHead",
            paneTitle: "SKV_paneTitle",
            paneModes: "SKV_paneModes",
            paneMode: "SKV_paneMode",
            paneList: "SKV_paneList",
            paneRow: "SKV_paneRow",
            paneItem: "SKV_paneItem",
            paneItemName: "SKV_paneItemName",
            paneItemCount: "SKV_paneItemCount",
            paneGroupToggle: "SKV_paneGroupToggle",
            paneGroupEdit: "SKV_paneGroupEdit",
            paneNew: "SKV_paneNew",
            mainCol: "SKV_mainCol",
            mainScroll: "SKV_mainScroll",
            toolRow: "SKV_toolRow",
            toolButtons: "SKV_toolButtons",
            toolButton: "SKV_toolButton",
            filterBar: "SKV_filterBar",
            // v2.1.6 卡片行
            cardRow: "SKV_cardRow",
            check: "SKV_check",
            checkBox: "SKV_checkBox",
            rowIcon: "SKV_rowIcon",
            rowText: "SKV_rowText",
            rowName: "SKV_rowName",
            rowDesc: "SKV_rowDesc",
            rowControls: "SKV_rowControls",
            traffic: "SKV_traffic",
            trafficDot: "SKV_trafficDot",
            trafficRed: "SKV_trafficRed",
            trafficGreen: "SKV_trafficGreen",
            rowDelete: "SKV_rowDelete",
            empty: "SKV_empty",
            batchBar: "SKV_batchBar",
            batchCount: "SKV_batchCount",
            batchBtn: "SKV_batchBtn",
            batchGo: "SKV_batchGo",
            toast: "SKV_toast",
            toastText: "SKV_toastText",
            toastAction: "SKV_toastAction",
        };
        // ── 文案字典 ─────────────────────────────────────────────────────────
        const NS = "settings.skills";
        const zh = {
            nav: "技能",
            navCombined: "Skill / MCP",
            panelIntro: "管理全局与工作区里的技能：搜索、展开正文、启用/停用、删除、添加、迁移与分组。",
            back: "返回会话",
            loading: "正在读取技能…",
            error: "暂时无法读取技能。",
            retry: "重试",
            search: "搜索技能",
            catalog: "技能列表",
            empty: "暂无技能。",
            emptySearch: "没有匹配的技能。",
            contentLoading: "正在加载技能内容…",
            contentError: "技能内容加载失败。",
            contentMissing: "技能内容不可用。",
            providerLabel: "来源",
            enabledTag: "已启用",
            pluginSwitchHint: "随包技能：对所有对话生效",
            tokenChipHint: "这个技能加载后的正文成本",
            tokenCatalogHint: "目录行成本",
            tokenTotalHint: "所有列出技能的正文总成本",
            disabledTag: "已停用",
            switchEnable: "启用",
            switchDisable: "停用",
            deleteLabel: "删除",
            confirmDelete: "确认删除？",
            opFailed: "操作失败",
            addButton: "添加技能",
            addTarget: "添加到：",
            addSingle: "添加单文件",
            addFolderZip: "添加文件夹/zip",
            addDragHint: "松开以添加技能（支持 .md、.zip 与技能文件夹）",
            addDismiss: "知道了",
            addBusy: "正在添加技能…",
            addTooMany: "所选内容文件数量过多。",
            addDone: "已添加 {count} 个技能。",
            addSkipped: "跳过 {count} 个：",
            addWarned: "提示 {count} 条：",
            scopeGlobal: "全局",
            emptyScope: "该工作区下暂无技能。",
            migrateButton: "批量迁移",
            migrateTitle: "批量迁移技能",
            migrateFrom: "源工作区",
            migrateTo: "目标工作区（可多选）",
            migrateMode: "方式",
            migrateModeCopy: "复制（保留原技能）",
            migrateModeMove: "移动（删除原技能）",
            migrateSelectAll: "全选",
            migrateNoSkills: "该工作区下没有可迁移的技能。",
            migratePickSource: "请选择源工作区",
            migratePickTarget: "请至少选择一个目标工作区",
            migrateSameScope: "目标工作区不能与源工作区相同",
            migrateMoveSingle: "移动模式只能选择一个目标工作区（多目标请改用复制）",
            migratePickSkills: "请至少选择一个技能",
            migrateConfirm: "开始迁移",
            migrateBusy: "正在迁移…",
            migrateCancel: "取消",
            migrateDoneOk: "迁移完成：成功 ",
            migrateDoneFail: "，失败 ",
            migrateDoneSuffix: "",
            migrateErrors: "失败明细",
            migrateSourceLabel: "源作用域",
            migrateTargetLabel: "目标作用域",
            migrateClose: "关闭",
            groupAll: "全部",
            groupButton: "分组",
            groupTitle: "分组",
            groupNew: "新建分组",
            groupName: "分组名称",
            groupNamePlaceholder: "输入分组名称（必填）",
            groupPickName: "请填写分组名称",
            groupScope: "工作区",
            groupPickScope: "请选择工作区",
            groupSkills: "技能",
            groupNoSkills: "该工作区下没有可选择的技能。",
            groupEmpty: "该分组下暂无技能。",
            groupSave: "保存分组",
            groupSaving: "正在保存…",
            groupDelete: "删除分组",
            groupBulkOn: "全部启用",
            groupBulkOff: "全部停用",
            pluginSkillsToggle: "显示插件技能",
            pluginSkillsToggleHint: "部分插件会随包自带技能（不在技能文件夹里，面板改不动）；取消勾选后只看自己管理的技能",
            pluginSkillsHidden: "插件自带的 {count} 个技能已隐藏。",
            groupBulkBlocked: "组内没有可开关的技能",
            skillFilterPlaceholder: "筛选技能",
            skillCountLabel: "已选",
            selectNone: "取消全选",
            categoryQuickAdd: "按分类快速添加",
            categoryQuickAddHint: "点击按顶层目录批量勾选/取消",
            checkUpdateAvailable: "发现新版本 v",
            checkUpdateCurrent: "（当前 v",
            checkUpdateHint: "）。可点击右上角按钮直接原地更新，或在命令行运行 dsh-panel update",
            updateCheckBtn: "检查更新",
            updateCheckingBtn: "检查中…",
            updateApplyBtn: "更新到 v",
            updateApplyingBtn: "正在更新…",
            updateRetryBtn: "重试更新 v",
            updateDoneBtn: "已更新 v",
            updateUpToDate: "已是最新 v",
            updateDoneHint: "已安装新版本，重开面板或重启应用生效",
            updateFailed: "更新失败：",
            updateCliHint: "可用 CLI：dsh-panel update",
            // ── v2.1.6 三栏外壳 / 卡片行 / 批量栏 / 偏好 ──────────────────
            railWorkspaces: "工作区",
            paneGroups: "分组",
            paneSources: "来源",
            paneUngrouped: "未分组",
            panePluginProvided: "插件自带",
            paneProviderUnknown: "未知来源",
            emptyProvider: "该来源下暂无技能。",
            originUser: "我的技能",
            originImported: "导入的技能",
            paneGlobalScope: "全局技能",
            switchWorkspaceHint: "只在这个工作区里启停 {name}（「全局」里的状态不受影响）",
            originSystem: "系统自带",
            originPlugin: "插件：{plugin}",
            // 布局开关：简洁模式 = 收起左右两栏，把工作区与分组做成列表上方的筛选条（Issue #50）
            layoutToCompact: "切换到简洁模式",
            layoutToThree: "切回三栏模式",
            emptyList: "这里还没有技能，点右上角的“添加”开始",
            toolbarOpenFolder: "打开目录",
            toolbarNewGroup: "新建分组",
            openFolderRevealed: "已在资源管理器里打开：{path}",
            openFolderCopied: "技能根路径已复制到剪贴板：{path}",
            openFolderManual: "剪贴板不可用，请手动复制技能根路径：{path}",
            openFolderUnavailable: "暂时拿不到技能根路径（该作用域还没有可读取的技能文件）。",
            batchSelect: "选择",
            batchSelected: "已选 {count} 项",
            batchMigrateTo: "迁移到…",
            batchGroupTo: "分组…",
            batchGroupNew: "＋ 新建分组（包含已选项）…",
            batchGroupAdd: "添加到「{name}」",
            batchGroupRemove: "从「{name}」移出",
            batchGroupAdded: "已将 {count} 项添加到「{name}」",
            batchGroupRemoved: "已从「{name}」移出 {count} 项",
            batchAdvanced: "更多选项（复制 / 多目标）…",
            batchMigrated: "已迁移 {count} 项到 {target}",
            dropMoved: "已将 {count} 个技能移动到 {target}",
            dropReadOnlySkipped: "已移动 {moved} 项；跳过 {skipped} 个只读技能",
            dropReadOnlyAll: "所选技能为只读（插件/内置/运行时），无法移动",
            paneEditGroup: "编辑分组",
            paneToggleGroup: "一键启停分组「{name}」",
            toastDeleted: "已删除 {name}",
            toastUndo: "撤销",
            toastUndoDone: "已还原 {name}",
            toastUndoFailed: "还原失败，请重新添加该技能。",
        };
        const en = {
            nav: "Skills",
            navCombined: "Skill / MCP",
            panelIntro: "Manage global and workspace skills: search, read content, enable or disable, delete, add, migrate, and group.",
            back: "Back to session",
            loading: "Reading skills…",
            error: "Skills are temporarily unavailable.",
            retry: "Retry",
            search: "Search skills",
            catalog: "Skills",
            empty: "No skills are available.",
            emptySearch: "No matching skills.",
            contentLoading: "Loading skill content…",
            contentError: "Skill content failed to load.",
            contentMissing: "Skill content is unavailable.",
            providerLabel: "Provider",
            enabledTag: "Enabled",
            pluginSwitchHint: "Shipped by a plugin — toggles it for every conversation",
            tokenChipHint: "Tokens this skill body weighs when loaded",
            tokenCatalogHint: "its catalog line costs",
            tokenTotalHint: "Tokens every listed skill body weighs in total",
            disabledTag: "Disabled",
            switchEnable: "Enable",
            switchDisable: "Disable",
            deleteLabel: "Delete",
            confirmDelete: "Confirm delete?",
            opFailed: "Operation failed",
            addButton: "Add skill",
            addTarget: "Add to: ",
            addSingle: "Add files",
            addFolderZip: "Add folder/ZIP",
            addDragHint: "Drop to add skills (.md, .zip or skill folders)",
            addDismiss: "Dismiss",
            addBusy: "Adding skills…",
            addTooMany: "Too many files in the selection.",
            addDone: "Added {count} skill(s).",
            addSkipped: "Skipped {count}:",
            addWarned: "{count} notice(s):",
            scopeGlobal: "Global",
            emptyScope: "No skills in this workspace yet.",
            migrateButton: "Batch migrate",
            migrateTitle: "Batch migrate skills",
            migrateFrom: "From workspace",
            migrateTo: "To workspaces (multiple allowed)",
            migrateMode: "Mode",
            migrateModeCopy: "Copy (keep the original)",
            migrateModeMove: "Move (delete the original)",
            migrateSelectAll: "Select all",
            migrateNoSkills: "No skills to migrate in this workspace.",
            migratePickSource: "Pick a source workspace",
            migratePickTarget: "Pick at least one target workspace",
            migrateSameScope: "A target workspace must differ from the source",
            migrateMoveSingle: "Move mode allows exactly one target workspace (use Copy for several)",
            migratePickSkills: "Pick at least one skill",
            migrateConfirm: "Start migration",
            migrateBusy: "Migrating…",
            migrateCancel: "Cancel",
            migrateDoneOk: "Migration finished: ",
            migrateDoneFail: " succeeded, ",
            migrateDoneSuffix: " failed",
            migrateErrors: "Failed items",
            migrateSourceLabel: "From",
            migrateTargetLabel: "To",
            migrateClose: "Close",
            groupAll: "All",
            groupButton: "Groups",
            groupTitle: "Groups",
            groupNew: "New group",
            groupName: "Group name",
            groupNamePlaceholder: "Group name (required)",
            groupPickName: "Pick a group name",
            groupScope: "Workspace",
            groupPickScope: "Pick a workspace",
            groupSkills: "Skills",
            groupNoSkills: "No skills to pick in this workspace.",
            groupEmpty: "No skills in this group.",
            groupSave: "Save group",
            groupSaving: "Saving…",
            groupDelete: "Delete group",
            groupBulkOn: "Enable all",
            groupBulkOff: "Disable all",
            pluginSkillsToggle: "Show plugin skills",
            pluginSkillsToggleHint: "Some plugins ship their own skills; uncheck to see only the ones you manage",
            pluginSkillsHidden: "{count} plugin-provided skill(s) hidden.",
            groupBulkBlocked: "No toggleable skills in this group",
            skillFilterPlaceholder: "Filter skills",
            skillCountLabel: "Selected",
            categoryQuickAdd: "Quick add by category",
            categoryQuickAddHint: "Click to select/deselect all skills in a category",
            selectNone: "Select none",
            checkUpdateAvailable: "Update available: v",
            checkUpdateCurrent: " (current v",
            checkUpdateHint: "). Click the top-right update button to upgrade in place, or run dsh-panel update",
            updateCheckBtn: "Check updates",
            updateCheckingBtn: "Checking…",
            updateApplyBtn: "Update to v",
            updateApplyingBtn: "Updating…",
            updateRetryBtn: "Retry v",
            updateDoneBtn: "Updated v",
            updateUpToDate: "Up to date v",
            updateDoneHint: "Installed; reopen panel or restart to apply",
            updateFailed: "Update failed: ",
            updateCliHint: "CLI: dsh-panel update",
            // ── v2.1.6 three-column shell / card row / batch bar / preferences ──
            railWorkspaces: "Workspaces",
            paneGroups: "Groups",
            paneSources: "Sources",
            paneUngrouped: "Ungrouped",
            panePluginProvided: "Plugin-provided",
            paneProviderUnknown: "Unknown source",
            emptyProvider: "No skills from this source yet.",
            originUser: "My skills",
            originImported: "Imported",
            paneGlobalScope: "Global skills",
            switchWorkspaceHint: "Toggle {name} in this workspace only (the Global setting is unchanged)",
            originSystem: "Built-in",
            originPlugin: "Plugin: {plugin}",
            layoutToCompact: "Switch to the compact layout",
            layoutToThree: "Switch back to the three-column layout",
            emptyList: "No skills yet — start with “Add” in the top-right corner.",
            toolbarOpenFolder: "Open folder",
            toolbarNewGroup: "New group",
            openFolderRevealed: "Opened in the file manager: {path}",
            openFolderCopied: "Skill root copied to the clipboard: {path}",
            openFolderManual: "Clipboard unavailable — copy the skill root manually: {path}",
            openFolderUnavailable: "The skill root is unavailable right now (no readable skill file in this scope).",
            batchSelect: "Select",
            batchSelected: "{count} selected",
            batchMigrateTo: "Migrate to…",
            batchGroupTo: "Group…",
            batchGroupNew: "+ New group with selection…",
            batchGroupAdd: "Add to “{name}”",
            batchGroupRemove: "Remove from “{name}”",
            batchGroupAdded: "Added {count} skill(s) to “{name}”",
            batchGroupRemoved: "Removed {count} skill(s) from “{name}”",
            batchAdvanced: "More options (copy / multiple targets)…",
            batchMigrated: "Moved {count} item(s) to {target}",
            dropMoved: "Moved {count} skill(s) to {target}",
            dropReadOnlySkipped: "Moved {moved} skill(s); skipped {skipped} read-only item(s)",
            dropReadOnlyAll: "Selected skills are read-only (plugin/bundled/runtime) and cannot be moved",
            paneEditGroup: "Edit group",
            paneToggleGroup: "Toggle all editable skills in “{name}”",
            toastDeleted: "Deleted {name}",
            toastUndo: "Undo",
            toastUndoDone: "Restored {name}",
            toastUndoFailed: "Restore failed — please add the skill again.",
        };
        // ── 远程贡献 ─────────────────────────────────────────────────────────
        // 客户端 codec：schema 用 parse 直通即可（严格校验由服务端 manifest 承担，
        // 无需引入 zod 依赖）。0.2.x 宿主只读 create().parse()；0.1.x 时代的 schema
        // 字段是历史包袱，已删。本文件是浏览器束（不能 import），故与 src/codec.ts 的
        // strictCodec 保持同形：mode + typeSymbol + create。
        const identity = (value) => value;
        const strictSchema = { parse: identity };
        const codec = (symbol) => ({ mode: "strict", typeSymbol: symbol, create: () => strictSchema });
        const CONTRIBUTION = {
            package: "dsh-skill-mcp-panel",
            descriptors: [
                {
                    id: "dsh-skill-mcp-panel#skillsViewer/list",
                    service: "skillsViewer",
                    namespace: "skillsViewer",
                    method: "list",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "sessionId", wire: "sessionId", source: "json", acceptsUndefined: true, codec: codec("dsh-skill-mcp-panel#sessionId") }
                    ],
                    result: codec("dsh-skill-mcp-panel#SkillListResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillsViewer/workspaces",
                    service: "skillsViewer",
                    namespace: "skillsViewer",
                    method: "workspaces",
                    invocation: { kind: "direct" },
                    parameters: [],
                    result: codec("dsh-skill-mcp-panel#WorkspacesResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillsViewer/openFolder",
                    service: "skillsViewer",
                    namespace: "skillsViewer",
                    method: "openFolder",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "path", wire: "path", source: "json", codec: codec("dsh-skill-mcp-panel#FilePath") }
                    ],
                    result: codec("dsh-skill-mcp-panel#OpenFolderResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillsViewer/groups",
                    service: "skillsViewer",
                    namespace: "skillsViewer",
                    method: "groups",
                    invocation: { kind: "direct" },
                    parameters: [],
                    result: codec("dsh-skill-mcp-panel#GroupsResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillsViewer/saveGroup",
                    service: "skillsViewer",
                    namespace: "skillsViewer",
                    method: "saveGroup",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "payload", wire: "payload", source: "json", codec: codec("dsh-skill-mcp-panel#SaveGroupPayload") }
                    ],
                    result: codec("dsh-skill-mcp-panel#GroupsResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillsViewer/deleteGroup",
                    service: "skillsViewer",
                    namespace: "skillsViewer",
                    method: "deleteGroup",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "payload", wire: "payload", source: "json", codec: codec("dsh-skill-mcp-panel#DeleteGroupPayload") }
                    ],
                    result: codec("dsh-skill-mcp-panel#GroupsResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillsViewer/checkUpdate",
                    service: "skillsViewer",
                    namespace: "skillsViewer",
                    method: "checkUpdate",
                    invocation: { kind: "direct" },
                    parameters: [],
                    result: codec("dsh-skill-mcp-panel#CheckUpdateResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillsViewer/applyUpdate",
                    service: "skillsViewer",
                    namespace: "skillsViewer",
                    method: "applyUpdate",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "payload", wire: "payload", source: "json", acceptsUndefined: true, codec: codec("dsh-skill-mcp-panel#ApplyUpdatePayload") }
                    ],
                    result: codec("dsh-skill-mcp-panel#ApplyUpdateResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillsViewer/migrate",
                    service: "skillsViewer",
                    namespace: "skillsViewer",
                    method: "migrate",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "name", wire: "name", source: "json", codec: codec("dsh-skill-mcp-panel#SkillName") },
                        { name: "sessionId", wire: "sessionId", source: "json", acceptsUndefined: true, codec: codec("dsh-skill-mcp-panel#sessionId") },
                        { name: "payload", wire: "payload", source: "json", codec: codec("dsh-skill-mcp-panel#MigratePayload") }
                    ],
                    result: codec("dsh-skill-mcp-panel#MigrateResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillsViewer/batchMigrate",
                    service: "skillsViewer",
                    namespace: "skillsViewer",
                    method: "batchMigrate",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "sessionId", wire: "sessionId", source: "json", acceptsUndefined: true, codec: codec("dsh-skill-mcp-panel#sessionId") },
                        { name: "payload", wire: "payload", source: "json", codec: codec("dsh-skill-mcp-panel#BatchMigratePayload") }
                    ],
                    result: codec("dsh-skill-mcp-panel#BatchMigrateResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillsViewer/content",
                    service: "skillsViewer",
                    namespace: "skillsViewer",
                    method: "content",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "name", wire: "name", source: "json", codec: codec("dsh-skill-mcp-panel#SkillName") },
                        { name: "sessionId", wire: "sessionId", source: "json", acceptsUndefined: true, codec: codec("dsh-skill-mcp-panel#sessionId") },
                        { name: "scope", wire: "scope", source: "json", acceptsUndefined: true, codec: codec("dsh-skill-mcp-panel#SkillScope") }
                    ],
                    result: codec("dsh-skill-mcp-panel#SkillContent")
                },
                {
                    id: "dsh-skill-mcp-panel#skillsViewer/setEnabled",
                    service: "skillsViewer",
                    namespace: "skillsViewer",
                    method: "setEnabled",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "name", wire: "name", source: "json", codec: codec("dsh-skill-mcp-panel#SkillName") },
                        { name: "sessionId", wire: "sessionId", source: "json", acceptsUndefined: true, codec: codec("dsh-skill-mcp-panel#sessionId") },
                        { name: "enabled", wire: "enabled", source: "json", codec: codec("dsh-skill-mcp-panel#EnabledFlag") },
                        { name: "scope", wire: "scope", source: "json", acceptsUndefined: true, codec: codec("dsh-skill-mcp-panel#SkillScope") }
                    ],
                    result: codec("dsh-skill-mcp-panel#SetEnabledResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillsViewer/deleteSkill",
                    service: "skillsViewer",
                    namespace: "skillsViewer",
                    method: "deleteSkill",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "name", wire: "name", source: "json", codec: codec("dsh-skill-mcp-panel#SkillName") },
                        { name: "sessionId", wire: "sessionId", source: "json", acceptsUndefined: true, codec: codec("dsh-skill-mcp-panel#sessionId") },
                        { name: "scope", wire: "scope", source: "json", acceptsUndefined: true, codec: codec("dsh-skill-mcp-panel#SkillScope") }
                    ],
                    result: codec("dsh-skill-mcp-panel#DeleteSkillResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillsViewer/addSkill",
                    service: "skillsViewer",
                    namespace: "skillsViewer",
                    method: "addSkill",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "sessionId", wire: "sessionId", source: "json", acceptsUndefined: true, codec: codec("dsh-skill-mcp-panel#sessionId") },
                        { name: "payload", wire: "payload", source: "json", codec: codec("dsh-skill-mcp-panel#AddPayload") }
                    ],
                    result: codec("dsh-skill-mcp-panel#AddResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillMcpPanel/list",
                    service: "skillMcpPanel",
                    namespace: "skillMcpPanel",
                    method: "list",
                    invocation: { kind: "direct" },
                    parameters: [],
                    result: codec("dsh-skill-mcp-panel#McpListResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillMcpPanel/save",
                    service: "skillMcpPanel",
                    namespace: "skillMcpPanel",
                    method: "save",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "payload", wire: "payload", source: "json", codec: codec("dsh-skill-mcp-panel#McpSavePayload") }
                    ],
                    result: codec("dsh-skill-mcp-panel#McpSaveResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillMcpPanel/removeServer",
                    service: "skillMcpPanel",
                    namespace: "skillMcpPanel",
                    method: "removeServer",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "payload", wire: "payload", source: "json", codec: codec("dsh-skill-mcp-panel#McpRemovePayload") }
                    ],
                    result: codec("dsh-skill-mcp-panel#McpRemoveResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillMcpPanel/setEnabled",
                    service: "skillMcpPanel",
                    namespace: "skillMcpPanel",
                    method: "setEnabled",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "payload", wire: "payload", source: "json", codec: codec("dsh-skill-mcp-panel#McpSetEnabledPayload") }
                    ],
                    result: codec("dsh-skill-mcp-panel#McpSaveResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillMcpPanel/readRaw",
                    service: "skillMcpPanel",
                    namespace: "skillMcpPanel",
                    method: "readRaw",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "payload", wire: "payload", source: "json", codec: codec("dsh-skill-mcp-panel#McpRawReadPayload") }
                    ],
                    result: codec("dsh-skill-mcp-panel#McpRawReadResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillMcpPanel/writeRaw",
                    service: "skillMcpPanel",
                    namespace: "skillMcpPanel",
                    method: "writeRaw",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "payload", wire: "payload", source: "json", codec: codec("dsh-skill-mcp-panel#McpRawWritePayload") }
                    ],
                    result: codec("dsh-skill-mcp-panel#McpSaveResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillMcpPanel/test",
                    service: "skillMcpPanel",
                    namespace: "skillMcpPanel",
                    method: "test",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "payload", wire: "payload", source: "json", codec: codec("dsh-skill-mcp-panel#McpTestPayload") }
                    ],
                    result: codec("dsh-skill-mcp-panel#McpTestResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillMcpPanel/reload",
                    service: "skillMcpPanel",
                    namespace: "skillMcpPanel",
                    method: "reload",
                    invocation: { kind: "direct" },
                    parameters: [],
                    result: codec("dsh-skill-mcp-panel#McpListResult")
                },
                // 下面这些必须与 src/mcp/wire.ts 的 MCP_MANIFEST 一一对应：客户端只认得
                // 自己 $mount 过的描述符，漏一条就是运行期 "remote[method] is not a function"
                // （Issue #51：单工具禁用面板与卡片上的 OAuth 按钮都因此点不动）。
                // 守卫：test-client-contribution.mjs 做全量比对。
                {
                    id: "dsh-skill-mcp-panel#skillMcpPanel/listTools",
                    service: "skillMcpPanel",
                    namespace: "skillMcpPanel",
                    method: "listTools",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "payload", wire: "payload", source: "json", codec: codec("dsh-skill-mcp-panel#McpToolsPayload") }
                    ],
                    result: codec("dsh-skill-mcp-panel#McpToolsResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillMcpPanel/getToolFilter",
                    service: "skillMcpPanel",
                    namespace: "skillMcpPanel",
                    method: "getToolFilter",
                    invocation: { kind: "direct" },
                    parameters: [],
                    result: codec("dsh-skill-mcp-panel#McpToolFilterResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillMcpPanel/setToolFilter",
                    service: "skillMcpPanel",
                    namespace: "skillMcpPanel",
                    method: "setToolFilter",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "payload", wire: "payload", source: "json", codec: codec("dsh-skill-mcp-panel#McpToolFilterPayload") }
                    ],
                    result: codec("dsh-skill-mcp-panel#McpToolFilterResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillMcpPanel/evacuateForeign",
                    service: "skillMcpPanel",
                    namespace: "skillMcpPanel",
                    method: "evacuateForeign",
                    invocation: { kind: "direct" },
                    parameters: [],
                    result: codec("dsh-skill-mcp-panel#McpEvacuateResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillMcpPanel/oauthStart",
                    service: "skillMcpPanel",
                    namespace: "skillMcpPanel",
                    method: "oauthStart",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "payload", wire: "payload", source: "json", codec: codec("dsh-skill-mcp-panel#McpOAuthStartPayload") }
                    ],
                    result: codec("dsh-skill-mcp-panel#McpOAuthStartResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillMcpPanel/oauthPoll",
                    service: "skillMcpPanel",
                    namespace: "skillMcpPanel",
                    method: "oauthPoll",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "payload", wire: "payload", source: "json", codec: codec("dsh-skill-mcp-panel#McpOAuthPollPayload") }
                    ],
                    result: codec("dsh-skill-mcp-panel#McpOAuthPollResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillMcpPanel/oauthStatus",
                    service: "skillMcpPanel",
                    namespace: "skillMcpPanel",
                    method: "oauthStatus",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "payload", wire: "payload", source: "json", codec: codec("dsh-skill-mcp-panel#McpOAuthServerPayload") }
                    ],
                    result: codec("dsh-skill-mcp-panel#McpOAuthStatusResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillMcpPanel/oauthRefresh",
                    service: "skillMcpPanel",
                    namespace: "skillMcpPanel",
                    method: "oauthRefresh",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "payload", wire: "payload", source: "json", codec: codec("dsh-skill-mcp-panel#McpOAuthServerPayload") }
                    ],
                    result: codec("dsh-skill-mcp-panel#McpOAuthRefreshResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillMcpPanel/oauthDisconnect",
                    service: "skillMcpPanel",
                    namespace: "skillMcpPanel",
                    method: "oauthDisconnect",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "payload", wire: "payload", source: "json", codec: codec("dsh-skill-mcp-panel#McpOAuthServerPayload") }
                    ],
                    result: codec("dsh-skill-mcp-panel#McpOAuthDisconnectResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillMcpPanel/listGroups",
                    service: "skillMcpPanel",
                    namespace: "skillMcpPanel",
                    method: "listGroups",
                    invocation: { kind: "direct" },
                    parameters: [],
                    result: codec("dsh-skill-mcp-panel#McpGroupsResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillMcpPanel/saveGroup",
                    service: "skillMcpPanel",
                    namespace: "skillMcpPanel",
                    method: "saveGroup",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "payload", wire: "payload", source: "json", codec: codec("dsh-skill-mcp-panel#McpGroupSavePayload") }
                    ],
                    result: codec("dsh-skill-mcp-panel#McpGroupsResult")
                },
                {
                    id: "dsh-skill-mcp-panel#skillMcpPanel/deleteGroup",
                    service: "skillMcpPanel",
                    namespace: "skillMcpPanel",
                    method: "deleteGroup",
                    invocation: { kind: "direct" },
                    parameters: [
                        { name: "payload", wire: "payload", source: "json", codec: codec("dsh-skill-mcp-panel#McpGroupDeletePayload") }
                    ],
                    result: codec("dsh-skill-mcp-panel#McpGroupsResult")
                }
            ]
        };
        // ── 分组编辑对话框（左侧分组列表，右侧名称/工作区/技能）──────────────
        function GroupDialog({ t, options, groups, groupId, setGroupId, name, setName, scope, setScope, skills, selected, toggle, selectAll, busy, error, onSave, onDelete, onCancel }) {
            // Issue #82：Esc 关弹窗（点遮罩由 closeOnBackdrop 处理）。
            useEscapeClose(onCancel);
            const known = Array.isArray(options) ? options : [];
            const rows = Array.isArray(groups) ? groups : [];
            const [query, setQuery] = react.useState("");
            // 删除分组的行内二次确认：3 秒未确认自动还原；切换分组时一并还原。
            const [confirmingDelete, setConfirmingDelete] = react.useState(false);
            const [deleteConfirmId, setDeleteConfirmId] = react.useState(null);
            react.useEffect(() => {
                setConfirmingDelete(false);
                setDeleteConfirmId(null);
            }, [groupId]);
            react.useEffect(() => {
                if (!confirmingDelete)
                    return;
                const timer = setTimeout(() => setConfirmingDelete(false), 3000);
                return () => clearTimeout(timer);
            }, [confirmingDelete]);
            const q = query.trim().toLowerCase();
            const visible = skills.filter((skill) => skillMatchesQuery(skill, q));
            const allChecked = skills.length > 0 && selected.size === skills.length;
            // 分类快速添加：从 rel 顶层段派生分类（如 lark-cli / mattpocock / opencli）。
            // 纯前端辅助——不改动手动分组机制，点击 chip 按目录批量勾选/取消。
            const categoryCount = (category) => skills.filter((skill) => (skill.rel ?? "").split("/")[0] === category).length;
            // 只显示 >= 2 个技能的分类：单技能分类直接勾选即可（chip 节省 0 次点击，无增量价值）；
            // 全扁平用户（无 >= 2 分类）整行隐藏，零影响——通用规则，不依赖具体树形。
            const categories = [...new Set(skills.map((skill) => (skill.rel ?? "").split("/")[0]).filter((category) => category !== ""))].filter((category) => categoryCount(category) >= 2);
            const categoryAllIn = (category) => {
                const inCat = skills.filter((skill) => (skill.rel ?? "").split("/")[0] === category);
                return inCat.length > 0 && inCat.every((skill) => selected.has(skill.name));
            };
            const toggleCategory = (category) => {
                const inCat = skills.filter((skill) => (skill.rel ?? "").split("/")[0] === category);
                const allIn = categoryAllIn(category);
                for (const skill of inCat) {
                    if (allIn ? selected.has(skill.name) : !selected.has(skill.name))
                        toggle(skill.name);
                }
            };
            return (0, react_jsx_runtime.jsx)("div", {
                className: c.scopeOverlay,
                role: "dialog",
                "aria-modal": "true",
                onClick: closeOnBackdrop(onCancel, busy),
                children: (0, react_jsx_runtime.jsxs)("div", {
                    className: c.scopeBox,
                    children: [(0, react_jsx_runtime.jsx)("h4", { children: t("groupTitle") }), (0, react_jsx_runtime.jsxs)("div", {
                            className: c.groupBody,
                            children: [(0, react_jsx_runtime.jsxs)("div", {
                                    className: c.groupSide,
                                    children: [(0, react_jsx_runtime.jsxs)("button", {
                                            type: "button",
                                            className: c.groupNewBtn,
                                            onClick: () => {
                                                setGroupId(null, "");
                                            },
                                            children: ["+ ", t("groupNew")]
                                        }), (0, react_jsx_runtime.jsx)("p", {
                                            className: c.groupSideLabel,
                                            children: t("groupTitle")
                                        }), ...rows.map((group) => (0, react_jsx_runtime.jsxs)("span", {
                                            className: c.groupSideItemWrap,
                                            children: [(0, react_jsx_runtime.jsx)("button", {
                                                    type: "button",
                                                    className: c.groupSideItem,
                                                    "data-active": groupId === group.id ? "true" : void 0,
                                                    onClick: () => {
                                                        setGroupId(group.id, group.name);
                                                    },
                                                    children: group.name
                                                }, group.id), (0, react_jsx_runtime.jsx)("button", {
                                                    type: "button",
                                                    className: c.groupDelete,
                                                    "data-confirm": deleteConfirmId === group.id ? "true" : void 0,
                                                    "aria-label": deleteConfirmId === group.id ? t("confirmDelete") : t("deleteLabel"),
                                                    title: deleteConfirmId === group.id ? t("confirmDelete") : t("deleteLabel"),
                                                    onClick: (event) => {
                                                        event.stopPropagation();
                                                        setGroupId(group.id, group.name);
                                                        if (deleteConfirmId === group.id)
                                                            onDelete();
                                                        else
                                                            setDeleteConfirmId(group.id);
                                                    },
                                                    children: deleteConfirmId === group.id ? t("confirmDelete") : "×"
                                                })]
                                        }, group.id))]
                                }), (0, react_jsx_runtime.jsxs)("div", {
                                    className: c.groupMain,
                                    children: [(0, react_jsx_runtime.jsxs)("div", {
                                            className: c.field,
                                            children: [(0, react_jsx_runtime.jsx)("label", {
                                                    className: c.fieldLabel,
                                                    children: t("groupName")
                                                }), (0, react_jsx_runtime.jsx)("input", {
                                                    className: c.textInput,
                                                    type: "text",
                                                    value: name,
                                                    placeholder: t("groupNamePlaceholder"),
                                                    onChange: (event) => {
                                                        setName(event.currentTarget.value);
                                                    }
                                                })]
                                        }), (0, react_jsx_runtime.jsxs)("div", {
                                            className: c.field,
                                            children: [(0, react_jsx_runtime.jsx)("label", {
                                                    className: c.fieldLabel,
                                                    children: t("groupScope")
                                                }), (0, react_jsx_runtime.jsxs)("select", {
                                                    className: c.select,
                                                    value: scope,
                                                    onChange: (event) => {
                                                        setScope(event.currentTarget.value);
                                                    },
                                                    children: [(0, react_jsx_runtime.jsx)("option", {
                                                            value: "global",
                                                            children: t("scopeGlobal")
                                                        }), ...known.map((option) => (0, react_jsx_runtime.jsx)("option", {
                                                            value: option.path,
                                                            children: option.label + " — " + option.path
                                                        }, option.path))]
                                                })]
                                        }), (0, react_jsx_runtime.jsxs)("div", {
                                            className: c.field,
                                            children: [(0, react_jsx_runtime.jsxs)("div", {
                                                    className: c.countRow,
                                                    children: [(0, react_jsx_runtime.jsx)("p", {
                                                            className: c.countText,
                                                            children: t("skillCountLabel") + " " + selected.size + "/" + skills.length
                                                        }), (0, react_jsx_runtime.jsx)("button", {
                                                            type: "button",
                                                            className: c.migrateSelectAll,
                                                            onClick: selectAll,
                                                            children: allChecked ? t("selectNone") : t("migrateSelectAll")
                                                        })]
                                                }), categories.length > 0 ? (0, react_jsx_runtime.jsxs)("div", {
                                                    className: c.categoryBar,
                                                    children: [(0, react_jsx_runtime.jsx)("span", {
                                                            className: c.categoryLabel,
                                                            children: t("categoryQuickAdd")
                                                        }), ...categories.map((category) => (0, react_jsx_runtime.jsx)("button", {
                                                            type: "button",
                                                            className: c.categoryChip,
                                                            "data-active": categoryAllIn(category) ? "true" : void 0,
                                                            title: t("categoryQuickAddHint") + "：" + category,
                                                            onClick: () => {
                                                                toggleCategory(category);
                                                            },
                                                            children: category + " (" + categoryCount(category) + ")"
                                                        }, category))]
                                                }, "cat-quick-add") : null, (0, react_jsx_runtime.jsx)("input", {
                                                    className: c.textInput,
                                                    type: "text",
                                                    value: query,
                                                    placeholder: t("skillFilterPlaceholder"),
                                                    onChange: (event) => {
                                                        setQuery(event.currentTarget.value);
                                                    }
                                                }), (0, react_jsx_runtime.jsxs)("div", {
                                                    className: c.skillListBox,
                                                    children: skills.length === 0 ? [(0, react_jsx_runtime.jsx)("p", {
                                                            className: c.migrateHint,
                                                            children: t("groupNoSkills")
                                                        }, "no-skills")] : visible.length === 0 ? [(0, react_jsx_runtime.jsx)("p", {
                                                            className: c.migrateHint,
                                                            children: t("emptySearch")
                                                        }, "no-match")] : visible.map((skill) => (0, react_jsx_runtime.jsxs)("label", {
                                                        className: c.skillRow,
                                                        children: [(0, react_jsx_runtime.jsx)("input", {
                                                                type: "checkbox",
                                                                checked: selected.has(skill.name),
                                                                onChange: () => {
                                                                    toggle(skill.name);
                                                                }
                                                            }), (0, react_jsx_runtime.jsx)("span", {
                                                                className: c.skillName,
                                                                children: skill.name
                                                            }), (0, react_jsx_runtime.jsx)("span", {
                                                                className: c.skillBadge,
                                                                "data-on": skill.enabled !== false ? "true" : "false",
                                                                children: skill.enabled !== false ? t("enabledTag") : t("disabledTag")
                                                            })]
                                                    }, skill.name))
                                                })]
                                        })]
                                })]
                        }), error !== null && error !== undefined ? (0, react_jsx_runtime.jsx)("p", {
                            className: c.migrateHint,
                            role: "alert",
                            children: error
                        }) : null, (0, react_jsx_runtime.jsxs)("div", {
                            className: c.dialogFooter,
                            children: [groupId !== null && groupId !== undefined ? (0, react_jsx_runtime.jsx)("button", {
                                    type: "button",
                                    className: c.dangerBtn,
                                    disabled: busy,
                                    onClick: () => {
                                        if (!confirmingDelete) {
                                            setConfirmingDelete(true);
                                            return;
                                        }
                                        onDelete();
                                    },
                                    children: confirmingDelete ? t("confirmDelete") : t("groupDelete")
                                }) : (0, react_jsx_runtime.jsx)("span", {}), (0, react_jsx_runtime.jsxs)("div", {
                                    className: c.scopeActions,
                                    children: [(0, react_jsx_runtime.jsx)("button", {
                                            type: "button",
                                            className: c.scopeAction + " " + c.scopeCancel,
                                            disabled: busy,
                                            onClick: onCancel,
                                            children: t("migrateCancel")
                                        }), (0, react_jsx_runtime.jsx)("button", {
                                            type: "button",
                                            className: c.scopeAction + " " + c.scopeConfirm,
                                            disabled: busy || (name ?? "").trim() === "" || selected.size === 0 || scope === "",
                                            onClick: onSave,
                                            children: busy ? t("groupSaving") : t("groupSave")
                                        })]
                                })]
                        })]
                })
            });
        }
        // ── 批量迁移对话框（源/目标均为下拉表单，目标可多选）───────────────────
        function MigrateDialog({ t, options, from, setFrom, targets, toggleTarget, mode, setMode, skills, selected, toggle, selectAll, busy, result, error, onConfirm, onCancel, onClose }) {
            // Issue #82：Esc 关弹窗（点遮罩由 closeOnBackdrop 处理）。
            useEscapeClose(onCancel);
            const known = Array.isArray(options) ? options : [];
            const [query, setQuery] = react.useState("");
            const q = query.trim().toLowerCase();
            const visible = skills.filter((skill) => skillMatchesQuery(skill, q));
            const allChecked = skills.length > 0 && selected.size === skills.length;
            const okCount = Array.isArray(result) ? result.filter((item) => item.ok === true).length : 0;
            const failCount = Array.isArray(result) ? result.length - okCount : 0;
            const targetLabelOf = (value) => {
                if (value === null || value === undefined || value === "global")
                    return t("scopeGlobal");
                const hit = known.find((option) => option.path === value);
                return hit !== undefined && typeof hit.label === "string" && hit.label !== "" ? hit.label : value;
            };
            return (0, react_jsx_runtime.jsx)("div", {
                className: c.scopeOverlay,
                role: "dialog",
                "aria-modal": "true",
                onClick: closeOnBackdrop(onCancel, busy),
                children: (0, react_jsx_runtime.jsxs)("div", {
                    className: c.scopeBox,
                    children: [(0, react_jsx_runtime.jsx)("h4", { children: t("migrateTitle") }), (0, react_jsx_runtime.jsxs)("div", {
                            className: c.field,
                            children: [(0, react_jsx_runtime.jsx)("label", {
                                    className: c.fieldLabel,
                                    children: t("migrateFrom")
                                }), (0, react_jsx_runtime.jsxs)("div", {
                                    className: c.targetBox,
                                    children: [(0, react_jsx_runtime.jsxs)("button", {
                                            type: "button",
                                            className: c.targetItem,
                                            "data-active": from === "global" ? "true" : void 0,
                                            onClick: () => { setFrom("global"); },
                                            children: [(0, react_jsx_runtime.jsx)("input", {
                                                    type: "radio",
                                                    name: "migrate-from",
                                                    checked: from === "global",
                                                    readOnly: true
                                                }), (0, react_jsx_runtime.jsx)("span", {
                                                    className: c.skillName,
                                                    children: t("scopeGlobal")
                                                })]
                                        }, "from-global"), ...known.map((option) => (0, react_jsx_runtime.jsxs)("button", {
                                            type: "button",
                                            className: c.targetItem,
                                            "data-active": from === option.path ? "true" : void 0,
                                            onClick: () => { setFrom(option.path); },
                                            children: [(0, react_jsx_runtime.jsx)("input", {
                                                    type: "radio",
                                                    name: "migrate-from",
                                                    checked: from === option.path,
                                                    readOnly: true
                                                }), (0, react_jsx_runtime.jsx)("span", {
                                                    className: c.migrateOptionLabel,
                                                    children: option.label
                                                }), (0, react_jsx_runtime.jsx)("span", {
                                                    className: c.wsPath,
                                                    title: option.path,
                                                    children: option.path
                                                })]
                                        }, option.path))]
                                }), from === "" ? (0, react_jsx_runtime.jsx)("p", {
                                    className: c.migrateHint,
                                    children: t("migratePickSource")
                                }) : null]
                        }),
                        (0, react_jsx_runtime.jsxs)("div", {
                            className: c.field,
                            children: [(0, react_jsx_runtime.jsx)("label", {
                                    className: c.fieldLabel,
                                    children: t("migrateTo")
                                }), (0, react_jsx_runtime.jsxs)("div", {
                                    className: c.targetBox,
                                    children: [(0, react_jsx_runtime.jsxs)("button", {
                                            type: "button",
                                            className: c.targetItem,
                                            "data-active": targets.has("global") ? "true" : void 0,
                                            onClick: () => {
                                                toggleTarget("global");
                                            },
                                            children: [(0, react_jsx_runtime.jsx)("input", {
                                                    type: "checkbox",
                                                    checked: targets.has("global"),
                                                    readOnly: true
                                                }), (0, react_jsx_runtime.jsx)("span", {
                                                    className: c.skillName,
                                                    children: t("scopeGlobal")
                                                })]
                                        }), ...known.map((option) => (0, react_jsx_runtime.jsxs)("button", {
                                            type: "button",
                                            className: c.targetItem,
                                            "data-active": targets.has(option.path) ? "true" : void 0,
                                            onClick: () => {
                                                toggleTarget(option.path);
                                            },
                                            children: [(0, react_jsx_runtime.jsx)("input", {
                                                    type: "checkbox",
                                                    checked: targets.has(option.path),
                                                    readOnly: true
                                                }), (0, react_jsx_runtime.jsx)("span", {
                                                    className: c.migrateOptionLabel,
                                                    children: option.label
                                                }), (0, react_jsx_runtime.jsx)("span", {
                                                    className: c.wsPath,
                                                    title: option.path,
                                                    children: option.path
                                                })]
                                        }, option.path))]
                                })]
                        }), mode === "move" && targets.size > 1 ? (0, react_jsx_runtime.jsx)("p", {
                            className: c.migrateHint,
                            children: t("migrateMoveSingle")
                        }) : null, (0, react_jsx_runtime.jsxs)("div", {
                            className: c.field,
                            children: [(0, react_jsx_runtime.jsx)("p", {
                                    className: c.fieldLabel,
                                    children: t("migrateMode")
                                }), (0, react_jsx_runtime.jsxs)("div", {
                                    className: c.scopeOptions,
                                    children: [(0, react_jsx_runtime.jsxs)("button", {
                                            type: "button",
                                            className: c.scopeOption,
                                            "data-active": mode === "move" ? "true" : void 0,
                                            onClick: () => {
                                                setMode("move");
                                            },
                                            children: [(0, react_jsx_runtime.jsx)("input", {
                                                    type: "radio",
                                                    name: "migrate-mode",
                                                    checked: mode === "move",
                                                    readOnly: true
                                                }), (0, react_jsx_runtime.jsx)("span", { children: t("migrateModeMove") })]
                                        }), (0, react_jsx_runtime.jsxs)("button", {
                                            type: "button",
                                            className: c.scopeOption,
                                            "data-active": mode === "copy" ? "true" : void 0,
                                            onClick: () => {
                                                setMode("copy");
                                            },
                                            children: [(0, react_jsx_runtime.jsx)("input", {
                                                    type: "radio",
                                                    name: "migrate-mode",
                                                    checked: mode === "copy",
                                                    readOnly: true
                                                }), (0, react_jsx_runtime.jsx)("span", { children: t("migrateModeCopy") })]
                                        })]
                                })]
                        }), from === "" ? null : result === null ? (0, react_jsx_runtime.jsxs)("div", {
                            className: c.field,
                            children: [(0, react_jsx_runtime.jsxs)("div", {
                                    className: c.countRow,
                                    children: [(0, react_jsx_runtime.jsx)("p", {
                                            className: c.countText,
                                            children: t("skillCountLabel") + " " + selected.size + "/" + skills.length
                                        }), (0, react_jsx_runtime.jsx)("button", {
                                            type: "button",
                                            className: c.migrateSelectAll,
                                            onClick: selectAll,
                                            children: allChecked ? t("selectNone") : t("migrateSelectAll")
                                        })]
                                }),
                                (0, react_jsx_runtime.jsx)("input", {
                                    className: c.textInput,
                                    type: "text",
                                    value: query,
                                    placeholder: t("skillFilterPlaceholder"),
                                    onChange: (event) => {
                                        setQuery(event.currentTarget.value);
                                    }
                                }), (0, react_jsx_runtime.jsxs)("div", {
                                    className: c.skillListBox,
                                    children: skills.length === 0 ? [(0, react_jsx_runtime.jsx)("p", {
                                            className: c.migrateHint,
                                            children: t("migrateNoSkills")
                                        }, "no-skills")] : visible.length === 0 ? [(0, react_jsx_runtime.jsx)("p", {
                                            className: c.migrateHint,
                                            children: t("emptySearch")
                                        }, "no-match")] : visible.map((skill) => (0, react_jsx_runtime.jsxs)("label", {
                                        className: c.skillRow,
                                        children: [(0, react_jsx_runtime.jsx)("input", {
                                                type: "checkbox",
                                                checked: selected.has(skill.name),
                                                onChange: () => {
                                                    toggle(skill.name);
                                                }
                                            }), (0, react_jsx_runtime.jsx)("span", {
                                                className: c.skillName,
                                                children: skill.name
                                            }), (0, react_jsx_runtime.jsx)("span", {
                                                className: c.skillBadge,
                                                "data-on": skill.enabled !== false ? "true" : "false",
                                                children: skill.enabled !== false ? t("enabledTag") : t("disabledTag")
                                            })]
                                    }, skill.name))
                                })]
                        }) : null, error !== null && error !== undefined ? (0, react_jsx_runtime.jsx)("p", {
                            className: c.migrateHint,
                            role: "alert",
                            children: error
                        }) : null, result !== null ? (0, react_jsx_runtime.jsxs)("div", {
                            className: c.migrateSection,
                            children: [(0, react_jsx_runtime.jsxs)("p", {
                                    className: c.migrateResult,
                                    "data-ok": failCount === 0 ? "true" : "false",
                                    children: [failCount === 0 ? (0, react_jsx_runtime.jsxs)("svg", {
                                            width: "13",
                                            height: "13",
                                            viewBox: "0 0 16 16",
                                            fill: "none",
                                            "aria-hidden": "true",
                                            children: [(0, react_jsx_runtime.jsx)("circle", { cx: "8", cy: "8", r: "6.5", stroke: "currentColor", strokeWidth: 1.3 }), (0, react_jsx_runtime.jsx)("path", { d: "M5.5 8.2l1.8 1.8 3.2-4", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round" })]
                                        }) : (0, react_jsx_runtime.jsxs)("svg", {
                                            width: "13",
                                            height: "13",
                                            viewBox: "0 0 16 16",
                                            fill: "none",
                                            "aria-hidden": "true",
                                            children: [(0, react_jsx_runtime.jsx)("path", { d: "M8 2.5l6.5 11.2h-13z", stroke: "currentColor", strokeWidth: 1.3, strokeLinejoin: "round" }), (0, react_jsx_runtime.jsx)("path", { d: "M8 6.5v3.2", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round" }), (0, react_jsx_runtime.jsx)("circle", { cx: "8", cy: "11.6", r: "0.6", fill: "currentColor" })]
                                        }), t("migrateDoneOk") + okCount + t("migrateDoneFail") + failCount + t("migrateDoneSuffix")]
                                }), failCount > 0 ? (0, react_jsx_runtime.jsxs)("div", {
                                    children: [(0, react_jsx_runtime.jsx)("p", { className: c.migrateLabel, children: t("migrateErrors") }), (0, react_jsx_runtime.jsxs)("ul", {
                                            className: c.migrateResultList,
                                            children: result.filter((item) => item.ok !== true).map((item) => (0, react_jsx_runtime.jsx)("li", {
                                                key: item.name + "-" + (item.target ?? ""),
                                                children: item.name + (item.target === null || item.target === undefined ? "" : " → " + targetLabelOf(item.target)) + "：" + (item.error ?? "")
                                            }, item.name + "-" + (item.target ?? "")))
                                        })]
                                }) : null]
                        }) : null, (0, react_jsx_runtime.jsxs)("div", {
                            className: c.dialogFooter,
                            children: [(0, react_jsx_runtime.jsx)("span", {}), (0, react_jsx_runtime.jsxs)("div", {
                                    className: c.scopeActions,
                                    children: result === null ? [(0, react_jsx_runtime.jsx)("button", {
                                            type: "button",
                                            className: c.scopeAction + " " + c.scopeCancel,
                                            disabled: busy,
                                            onClick: onCancel,
                                            children: t("migrateCancel")
                                        }), (0, react_jsx_runtime.jsx)("button", {
                                            type: "button",
                                            className: c.scopeAction + " " + c.scopeConfirm,
                                            disabled: busy || from === "" || targets.size === 0 || selected.size === 0 || targets.has(from) || (mode === "move" && targets.size > 1),
                                            onClick: onConfirm,
                                            children: busy ? t("migrateBusy") : t("migrateConfirm")
                                        })] : [(0, react_jsx_runtime.jsx)("button", {
                                            type: "button",
                                            className: c.scopeAction + " " + c.scopeConfirm,
                                            onClick: onClose,
                                            children: t("migrateClose")
                                        })]
                                })]
                        })]
                })
            });
        }
        function SkillsSection(props) {
            const { t, currentSessionId, subscribeSession, useSessions, listSkills, loadContent, setSkillEnabled, removeSkill, addSkill, listWorkspaces, openFolder, batchMigrateSkill, listGroups, saveGroupSkill, deleteGroupSkill } = props;
            // 当前会话 id，仅用于会话级项目作用域与「随会话刷新列表」，
            // 不再门控任何 UI：技能页在没有会话时同样正常显示（服务端回退全局注册表）。
            // 宿主客户端以「主视图引用计数」定义当前会话，判据是
            //   sessions.list 快照 byId[id].retainedBy.mainView > 0
            //（settings-general、layout、workspace 等宿主自己的代码用的都是这一条）。
            // 该快照既没有 current 也没有 sessionId 字段，早先按 currentProvideInfo →
            // selection → list.current 逐级探测的写法在本版恒为 undefined。
            //
            // 首选宿主为 root 作用域槽位注入的标准 hook prop useSessions（响应式，会话
            // 切换自动重渲染）；旧外壳若未注入，则退回自行订阅 sessions.list 快照。
            const selectMainSessionId = (state) => {
                const rows = state !== null && typeof state === "object" ? state.byId : undefined;
                if (rows === null || typeof rows !== "object")
                    return undefined;
                for (const id of Object.keys(rows)) {
                    const row = rows[id];
                    if (((row && row.retainedBy && row.retainedBy.mainView) || 0) > 0)
                        return id;
                }
                return undefined;
            };
            const useHostSessions = typeof useSessions === "function";
            const hostSessionId = useHostSessions ? useSessions(selectMainSessionId) : undefined;
            const [fallbackSessionId, setFallbackSessionId] = react.useState(() => currentSessionId());
            react.useEffect(() => {
                if (useHostSessions)
                    return undefined;
                const sync = () => setFallbackSessionId(currentSessionId());
                sync();
                return subscribeSession(sync);
            }, [useHostSessions]);
            const sessionId = useHostSessions ? hostSessionId : fallbackSessionId;
            const [query, setQuery] = react.useState("");
            const [listState, setListState] = react.useState({ status: "loading" });
            // 全局停用 + 各工作区覆盖：列表行只带「全局」状态，工作区里的真实开关
            // 由这两份数据算出来，切换工作区不必重新拉取。
            const [disabledState, setDisabledState] = react.useState({ global: [], workspaces: {} });
            const [request, setRequest] = react.useState(0);
            const [expanded, setExpanded] = react.useState(null);
            // 树形折叠状态（默认全部展开；路径为 key）。
            const [collapsed, setCollapsed] = react.useState(() => new Set());
            const toggleCollapsed = (path) => {
                setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(path))
                        next.delete(path);
                    else
                        next.add(path);
                    return next;
                });
            };
            const [bodies, setBodies] = react.useState({});
            const [ops, setOps] = react.useState({});
            const [adding, setAdding] = react.useState({ status: "idle" });
            const [dragActive, setDragActive] = react.useState(false);
            const [wsOptions, setWsOptions] = react.useState(null);
            const [scopeFilter, setScopeFilter] = react.useState("global");
            const [migrator, setMigrator] = react.useState(null);
            const [groupsList, setGroupsList] = react.useState(null);
            const [groupFilter, setGroupFilter] = react.useState("all");
            const [groupEditor, setGroupEditor] = react.useState(null);
            // Issue #82：批量迁移 / 分组编辑器这两个对话框挂在页面层，Esc 在这里兜底关掉
            // （保存中不关，避免把正在写的请求丢在半路）。
            useEscapeClose(() => setMigrator(null), migrator !== null && migrator.busy !== true);
            useEscapeClose(() => setGroupEditor(null), groupEditor !== null && groupEditor.busy !== true);
            const [bulkGroup, setBulkGroup] = react.useState(null);
            const [addMenuOpen, setAddMenuOpen] = react.useState(false);
            // Issue #82：添加技能菜单点外部 / 按 Esc 关闭。菜单是定位弹层（不是全屏遮罩），
            // 所以用 document 上的 pointerdown 判「点在哪」——落在按钮 + 菜单这个 wrap 里不算外部。
            react.useEffect(() => {
                if (!addMenuOpen || !canListenDocument())
                    return undefined;
                const onPointerDown = (event) => {
                    const target = event === null || event === undefined ? null : event.target;
                    const inside = target !== null && target !== undefined && typeof target.closest === "function" && target.closest("." + c.addMenuWrap) !== null;
                    if (!inside)
                        setAddMenuOpen(false);
                };
                const onKeyDown = (event) => {
                    if (event !== null && event !== undefined && event.key === "Escape")
                        setAddMenuOpen(false);
                };
                document.addEventListener("pointerdown", onPointerDown);
                document.addEventListener("keydown", onKeyDown);
                return () => {
                    document.removeEventListener("pointerdown", onPointerDown);
                    document.removeEventListener("keydown", onKeyDown);
                };
            }, [addMenuOpen]);
            const inflight = react.useRef(new Set());
            const singleFileInput = react.useRef(null);
            const zipFileInput = react.useRef(null);
            // 插件自带技能（随包提供、不在技能文件夹里）默认跟随列表显示，可一键隐藏。
            // 勾选状态记在 localStorage（Issue #59 附带问题：此前每次重进都回到默认勾选）。
            const SHOW_PLUGIN_SKILLS_KEY = "dsh-skill-mcp-panel:show-plugin-skills";
            const [showPluginSkills, setShowPluginSkills] = react.useState(() => {
                try {
                    return typeof localStorage === "undefined" || localStorage.getItem(SHOW_PLUGIN_SKILLS_KEY) !== "off";
                }
                catch {
                    return true;
                }
            });
            const toggleShowPluginSkills = (next) => {
                setShowPluginSkills(next);
                try {
                    if (typeof localStorage !== "undefined")
                        localStorage.setItem(SHOW_PLUGIN_SKILLS_KEY, next ? "on" : "off");
                }
                catch {
                    // 存不了就只在本次会话生效，不影响功能。
                }
            };
            // ── v2.1.6 三栏外壳相关状态 ───────────────────────────────────────
            // 中栏一列同时承载分组筛选与来源筛选，两者可叠加。
            const [originFilter, setOriginFilter] = react.useState("all");
            // 批量模式：勾选框 + 底部操作栏（迁移到… / 取消）。
            const [batchMode, setBatchMode] = react.useState(false);
            const [selected, setSelected] = react.useState(() => new Set());
            const [batchMenuOpen, setBatchMenuOpen] = react.useState(false);
            const [batchGroupOpen, setBatchGroupOpen] = react.useState(false);
            const [draggingSkills, setDraggingSkills] = react.useState(null);
            const draggingRef = react.useRef(null);
            const [dropTarget, setDropTarget] = react.useState(null);
            // 正在淡出右移、等 RPC 落地的行（key = opKeyOf）。
            const [removing, setRemoving] = react.useState(() => new Set());
            // 顶部居中 Toast：{ text, action: { label, run } | null }。
            const [toast, setToast] = react.useState(null);
            const toastTimer = react.useRef(null);
            // 通知条（打开目录的回显、迁移结果等）。
            const [shellNotice, setShellNotice] = react.useState(null);
            // #27 入口位置偏好（前端读写骨架 + 设置浮层）。
            const railListRef = react.useRef(null);
            // 左轨竖条位置：行高 34px + 上下各 2px 外边距 = 38px 节距，
            // 列表 padding-top 4px（与 cssShell 的 .SKV_railItem / .SKV_railList 对齐）。
            const RAIL_LIST_PAD_TOP = 4;
            const RAIL_ITEM_PITCH = 38;
            const [railBarY, setRailBarY] = react.useState(RAIL_LIST_PAD_TOP + 8);
            // ── 布局开关（Issue #50）：三栏 / 简洁 ────────────────────────────
            // 简洁模式 = 收起左轨（工作区）与中栏（分组），把两者做成列表上方的两条筛选条，
            // 卡片、批量、撤销、迁移、添加全部沿用同一套组件——只有外壳不同，不写第二套前端。
            // 选择记在 localStorage，键与页签同一个前缀；读不到就当三栏（默认）。
            const LAYOUT_KEY = "dsh-skill-mcp-panel:layout";
            const [layoutPreferredCompact, setLayoutPreferredCompact] = react.useState(() => {
                try {
                    return typeof localStorage !== "undefined" && localStorage.getItem(LAYOUT_KEY) === "compact";
                }
                catch {
                    return false;
                }
            });
            // ── 窄屏自动切简洁（Issue #71）────────────────────────────────────
            // 手机远控时三栏会把主区挤成一列图标、内容右侧被裁掉，连布局开关都推出屏幕外，
            // 所以可用宽度窄于阈值就直接用简洁那套外壳（结构不同，只能靠 JS 切，纯 CSS 藏不掉）。
            // 「可用宽度」= min(视口宽, 面板自己的宽)：面板挂在宿主主区里，窗口宽 ≠ 面板宽
            // （左侧会话栏要占掉一截），只按窗口判断会在 900–1100 的窗口下漏掉——那时面板
            // 只有 ~650px，三栏照样挤。两层判据都留着：视口宽供首帧直接用（手机上不闪一下三栏），
            // 面板宽由 ResizeObserver 事后校准。这里只是展示层的覆盖，不写回 localStorage。
            const NARROW_LAYOUT_QUERY = "(max-width:820px)";
            const NARROW_LAYOUT_WIDTH = 820;
            const readNarrowViewport = () => {
                try {
                    if (typeof window === "undefined" || typeof window.matchMedia !== "function")
                        return false;
                    return window.matchMedia(NARROW_LAYOUT_QUERY).matches === true;
                }
                catch {
                    return false;
                }
            };
            const [narrowViewport, setNarrowViewport] = react.useState(readNarrowViewport);
            const [narrowPanel, setNarrowPanel] = react.useState(false);
            const sectionRef = react.useRef(null);
            react.useEffect(() => {
                try {
                    if (typeof window === "undefined" || typeof window.matchMedia !== "function")
                        return undefined;
                    const media = window.matchMedia(NARROW_LAYOUT_QUERY);
                    if (media === null || typeof media !== "object")
                        return undefined;
                    const onChange = () => setNarrowViewport(media.matches === true);
                    if (typeof media.addEventListener === "function")
                        media.addEventListener("change", onChange);
                    else if (typeof media.addListener === "function")
                        media.addListener(onChange);
                    return () => {
                        if (typeof media.removeEventListener === "function")
                            media.removeEventListener("change", onChange);
                        else if (typeof media.removeListener === "function")
                            media.removeListener(onChange);
                    };
                }
                catch {
                    return undefined;
                }
            }, []);
            // 面板自身宽度：挂载后量一次，之后跟着容器变。量不到（宿主没给 DOM / 宽度 0）就当宽屏。
            react.useEffect(() => {
                try {
                    const node = sectionRef.current;
                    if (node === null || typeof node !== "object" || typeof node.getBoundingClientRect !== "function")
                        return undefined;
                    const measure = () => {
                        const width = node.getBoundingClientRect().width;
                        if (typeof width === "number" && width > 0)
                            setNarrowPanel(width < NARROW_LAYOUT_WIDTH);
                    };
                    measure();
                    if (typeof ResizeObserver !== "function")
                        return undefined;
                    const observer = new ResizeObserver(measure);
                    observer.observe(node);
                    return () => observer.disconnect();
                }
                catch {
                    return undefined;
                }
            }, []);
            const narrowLayout = narrowViewport || narrowPanel;
            const layoutCompact = layoutPreferredCompact || narrowLayout;
            // 简洁模式里工作区下拉的展开状态（宿主 Menu 以 portal 渲染）。
            const [scopeMenuOpen, setScopeMenuOpen] = react.useState(false);
            const toggleLayout = () => {
                // 窄屏下这枚开关根本不渲染；这里再兜一道，别让三栏被别处塞回来。
                if (narrowLayout)
                    return;
                const next = !layoutCompact;
                setScopeMenuOpen(false);
                setLayoutPreferredCompact(next);
                try {
                    if (typeof localStorage !== "undefined")
                        localStorage.setItem(LAYOUT_KEY, next ? "compact" : "three");
                }
                catch {
                    // 存不了就只在本次会话生效，不影响功能。
                }
            };
            // 列表拉取：首次显示加载态；此后静默刷新，保留旧列表避免闪烁。
            // 合并结果按名称排序——启停切换不会改变卡片位置。
            react.useEffect(() => {
                let current = true;
                setListState((prev) => (prev.status === "ready" ? prev : { status: "loading" }));
                Promise.resolve().then(() => listSkills()).then((snapshot) => {
                    if (!current)
                        return;
                    const skills = snapshot !== null && typeof snapshot === "object" && Array.isArray(snapshot.skills) ? [...snapshot.skills].sort((a, b) => a.name.localeCompare(b.name)) : [];
                    const disabled = snapshot !== null && typeof snapshot === "object" && snapshot.disabled !== null && typeof snapshot.disabled === "object" ? snapshot.disabled : { global: [], workspaces: {} };
                    setDisabledState({
                        global: Array.isArray(disabled.global) ? disabled.global : [],
                        workspaces: disabled.workspaces !== null && typeof disabled.workspaces === "object" ? disabled.workspaces : {}
                    });
                    setListState({ status: "ready", skills });
                }, () => {
                    if (current)
                        setListState({ status: "error" });
                });
                return () => {
                    current = false;
                };
                // 会话变化后重取：listSkills 现在会把会话 id 传给服务端，用于解析会话级项目作用域。
            }, [listSkills, request, sessionId]);
            // 工作区列表与分组列表：加载一次，供两条横栏与各对话框使用。
            react.useEffect(() => {
                let current = true;
                Promise.all([Promise.resolve().then(() => listWorkspaces()), Promise.resolve().then(() => listGroups())]).then(([wsSnapshot, groupSnapshot]) => {
                    if (!current)
                        return;
                    setWsOptions(wsSnapshot !== null && typeof wsSnapshot === "object" && Array.isArray(wsSnapshot.workspaces) ? wsSnapshot.workspaces : []);
                    setGroupsList(groupSnapshot !== null && typeof groupSnapshot === "object" && Array.isArray(groupSnapshot.groups) ? groupSnapshot.groups : []);
                }, () => {
                    if (current)
                        setWsOptions([]);
                    if (current)
                        setGroupsList([]);
                });
                return () => {
                    current = false;
                };
            }, [listWorkspaces, listGroups]);
            // 错误态“重试”与显式全量刷新。
            const refresh = () => {
                setBodies({});
                setExpanded(null);
                setRequest((value) => value + 1);
            };
            // 热操作后延迟静默刷新：等网关文件监听器（约 200ms 防抖）失效缓存。
            const reloadAfterHot = () => {
                setTimeout(() => setRequest((value) => value + 1), 450);
            };
            // 启用/停用（设定目标值）：乐观更新本地状态，随后后台对齐。
            // 整组开关复用这一条 RPC 路径，只是不在这里逐次挂热刷新。
            const runSetEnabled = (skill, target) => {
                setOps((prev) => ({ ...prev, [opKeyOf(skill)]: { status: "busy" } }));
                // 在工作区视图里关掉一个全局技能 = 给它在这个工作区里加一条覆盖，
                // 所以下发的 scope 是这个工作区，而不是 "global"（那会关掉所有人的）。
                const inWorkspace = skill.globalSkill === true && scopeFilter !== "global";
                const targetScope = inWorkspace ? scopeFilter : scopeOf(skill);
                return Promise.resolve().then(() => setSkillEnabled(skill.name, target, targetScope)).then(() => {
                    if (inWorkspace) {
                        setDisabledState((prev) => {
                            const names = new Set(Array.isArray(prev.workspaces[scopeFilter]) ? prev.workspaces[scopeFilter] : []);
                            if (target)
                                names.delete(skill.name);
                            else
                                names.add(skill.name);
                            const workspaces = { ...prev.workspaces };
                            if (names.size === 0)
                                delete workspaces[scopeFilter];
                            else
                                workspaces[scopeFilter] = [...names].sort();
                            return { ...prev, workspaces };
                        });
                    }
                    else {
                        setListState((prev) => (prev.status === "ready" ? { status: "ready", skills: prev.skills.map((s) => (s.name === skill.name && scopeOf(s) === scopeOf(skill) ? { ...s, enabled: target } : s)) } : prev));
                        setDisabledState((prev) => {
                            const names = new Set(Array.isArray(prev.global) ? prev.global : []);
                            if (target)
                                names.delete(skill.name);
                            else
                                names.add(skill.name);
                            return { ...prev, global: [...names].sort() };
                        });
                    }
                    setOps((prev) => ({ ...prev, [opKeyOf(skill)]: { status: "ok" } }));
                    return true;
                }, () => {
                    setOps((prev) => ({ ...prev, [opKeyOf(skill)]: { status: "error" } }));
                    return false;
                });
            };
            // 单卡开关：按当前状态取反。
            const applySetEnabled = (skill) => {
                runSetEnabled(skill, skill.enabled !== true).then((ok) => {
                    if (ok)
                        reloadAfterHot();
                });
            };
            // ── Toast / 通知条 ────────────────────────────────────────────────
            // 顶部居中 Toast，3.8s 自动消失；action 存在时带一个按钮（目前只用于「撤销」）。
            const dismissToast = () => {
                if (toastTimer.current !== null)
                    clearTimeout(toastTimer.current);
                toastTimer.current = null;
                setToast(null);
            };
            const showToast = (text, action = null) => {
                if (toastTimer.current !== null)
                    clearTimeout(toastTimer.current);
                setToast({ text: text, action: action });
                toastTimer.current = setTimeout(() => {
                    toastTimer.current = null;
                    setToast(null);
                }, 3800);
            };
            // ── 删除：乐观删除 + Toast「撤销」，不再二次确认（v2.1.6）─────────
            // 为什么撤销是「尽力还原」而不是「原样恢复」：
            //   宿主只给了 deleteSkill / addSkill 两条 RPC，没有「读原始技能目录里的任意
            //   文件」的能力——content 只回 SKILL.md 正文。所以撤销走 addSkill 把删除前
            //   抓到的正文按原来的 rel 路径回填：单文件技能与「只有一个 SKILL.md 的技能
            //   目录」能完整回来，带脚本/资源的技能目录只能拿回 SKILL.md。
            //   正文也抓不到（技能在删除前的 content 调用就失败）时不做假承诺，
            //   Toast 的撤销按钮会明确回报「还原失败，请重新添加」。
            const sameKeySelected = (rows, key) => rows.filter((s) => opKeyOf(s) !== key);
            const undoDelete = (snapshot) => {
                if (snapshot.content === null) {
                    showToast(t("toastUndoFailed"));
                    return;
                }
                const files = [{ path: snapshot.rel === "" ? snapshot.name + "/SKILL.md" : snapshot.rel, base64: utf8ToBase64(snapshot.content) }];
                Promise.resolve().then(() => addSkill({ kind: "auto", files: files, workspace: snapshot.scope === "global" ? null : snapshot.scope })).then((result) => {
                    const added = result !== null && typeof result === "object" && Array.isArray(result.added) ? result.added : [];
                    if (added.length === 0) {
                        showToast(t("toastUndoFailed"));
                        return;
                    }
                    showToast(t("toastUndoDone").replace("{name}", snapshot.name));
                    reloadAfterHot();
                }, () => {
                    showToast(t("toastUndoFailed"));
                });
            };
            const applyRemove = (skill) => {
                const key = opKeyOf(skill);
                // 删除前把「还原所需的一切」抓在手里：名称、作用域、rel 路径，以及正文。
                const snapshot = {
                    name: skill.name,
                    scope: scopeOf(skill),
                    rel: String(skill.rel ?? "").replaceAll("\\", "/").replace(/^\/+/, ""),
                    content: bodies[key] !== undefined && bodies[key].status === "ready" && typeof bodies[key].skill?.content === "string" ? bodies[key].skill.content : null
                };
                setOps((prev) => ({ ...prev, [key]: { status: "busy" } }));
                // 乐观：行立刻淡出右移（cssRow .SKV_card[data-removing=true]）。
                setRemoving((prev) => {
                    const next = new Set(prev);
                    next.add(key);
                    return next;
                });
                const contentReady = snapshot.content !== null
                    ? Promise.resolve(snapshot.content)
                    : Promise.resolve().then(() => loadContent(snapshot.name, snapshot.scope)).then((body) => (body !== null && typeof body === "object" && typeof body.content === "string" ? body.content : null), () => null);
                contentReady.then((content) => {
                    snapshot.content = content;
                    return Promise.resolve().then(() => removeSkill(snapshot.name, snapshot.scope)).then(() => {
                        setListState((prev) => (prev.status === "ready" ? { status: "ready", skills: sameKeySelected(prev.skills, key) } : prev));
                        setOps((prev) => ({ ...prev, [key]: { status: "ok" } }));
                        setRemoving((prev) => {
                            const next = new Set(prev);
                            next.delete(key);
                            return next;
                        });
                        setSelected((prev) => {
                            if (!prev.has(snapshot.name))
                                return prev;
                            const next = new Set(prev);
                            next.delete(snapshot.name);
                            return next;
                        });
                        setExpanded((current) => (current === key ? null : current));
                        showToast(t("toastDeleted").replace("{name}", snapshot.name), { label: t("toastUndo"), run: () => { undoDelete(snapshot); } });
                        reloadAfterHot();
                    }, () => {
                        setRemoving((prev) => {
                            const next = new Set(prev);
                            next.delete(key);
                            return next;
                        });
                        setOps((prev) => ({ ...prev, [key]: { status: "error" } }));
                    });
                });
            };
            // ── 添加技能：读取本地文件并上传（宿主负责校验与落盘）──────────────
            const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const bytes = new Uint8Array(reader.result);
                    let binary = "";
                    for (let i = 0; i < bytes.length; i++)
                        binary += String.fromCharCode(bytes[i]);
                    resolve(btoa(binary));
                };
                reader.onerror = () => reject(new Error("file read failed"));
                reader.readAsArrayBuffer(file);
            });
            // 把宿主的业务报错从 RPC 信封前缀里剥出来（提示语已经是面向用户的中文）。
            const cleanHostError = (error) => String(error?.message ?? error).replace(/^skillsViewer\.[a-zA-Z]+ failed: [a-zA-Z0-9_-]+: /, "");
            // 同名技能可能存在于多个作用域：操作状态与目标都按（名称, 作用域）区分。
            const opKeyOf = (skill) => skill.name + "\u0000" + (skill.scope !== undefined && skill.scope !== null && skill.scope.kind === "workspace" ? skill.scope.path : "global");
            // 三个入口（单文件 / 文件夹·zip / 拖放）共用同一条路径：只负责把
            // 原始选择上传，结构完全由宿主的统一分类器判定（kind 恒为 "auto"）。
            const summarizeAdd = (result) => {
                const added = result !== null && typeof result === "object" && Array.isArray(result.added) ? result.added : [];
                const skipped = result !== null && typeof result === "object" && Array.isArray(result.skipped) ? result.skipped : [];
                const warnings = result !== null && typeof result === "object" && Array.isArray(result.warnings) ? result.warnings : [];
                let message = t("addDone").replace("{count}", String(added.length));
                if (warnings.length > 0) {
                    const detail = warnings.slice(0, 3).map((item) => item.name + "（" + item.reason + "）").join("；");
                    message += t("addWarned").replace("{count}", String(warnings.length)) + detail + (warnings.length > 3 ? "；…" : "");
                }
                if (skipped.length > 0) {
                    const detail = skipped.slice(0, 3).map((item) => item.name + "（" + item.reason + "）").join("；");
                    message += t("addSkipped").replace("{count}", String(skipped.length)) + detail + (skipped.length > 3 ? "；…" : "");
                }
                return message;
            };
            const runAdd = (items) => {
                if (items.length === 0)
                    return;
                if (items.length > 200) {
                    setAdding({ status: "error", message: t("addTooMany") });
                    return;
                }
                setAdding({ status: "busy" });
                const workspace = scopeFilter === "global" ? null : scopeFilter;
                Promise.all(items.map((item) => readFileAsBase64(item.file))).then((blobs) => {
                    const payloadFiles = items.map((item, index) => ({ path: item.path.replaceAll("\\", "/"), base64: blobs[index] }));
                    return addSkill({ kind: "auto", files: payloadFiles, workspace });
                }).then((result) => {
                    setAdding({ status: "ok", message: summarizeAdd(result) });
                    setTimeout(() => setRequest((value) => value + 1), 700);
                    setTimeout(() => setAdding((prev) => (prev.status === "ok" ? { status: "idle" } : prev)), 8000);
                }, (error) => {
                    setAdding({ status: "error", message: cleanHostError(error) });
                });
            };
            // 无论来源（选择器/拖放）、无论类型（.md/.zip/文件夹），统一交给宿主。
            const ingestItems = (items) => {
                runAdd(items);
            };
            // 批量迁移：打开对话框，源/目标/技能均由用户手动选择。
            // prefill：批量栏的「更多选项…」把当前作用域与已勾选项带进对话框，
            // 想复制或多目标时不用再选一遍；工具栏直接打开时仍是一切空白。
            const openMigrator = (prefill = null) => {
                setMigrator({
                    from: prefill !== null && typeof prefill.from === "string" ? prefill.from : "",
                    targets: prefill !== null && prefill.targets instanceof Set ? prefill.targets : new Set(),
                    mode: "move",
                    selected: prefill !== null && prefill.selected instanceof Set ? prefill.selected : new Set(),
                    busy: false,
                    result: null,
                    error: null
                });
            };
            const applyBatchMigrate = () => {
                const m = migrator;
                if (m === null)
                    return;
                if (m.from === "") {
                    setMigrator({ ...m, error: t("migratePickSource") });
                    return;
                }
                if (m.targets.size === 0) {
                    setMigrator({ ...m, error: t("migratePickTarget") });
                    return;
                }
                if (m.targets.has(m.from)) {
                    setMigrator({ ...m, error: t("migrateSameScope") });
                    return;
                }
                if (m.mode === "move" && m.targets.size > 1) {
                    setMigrator({ ...m, error: t("migrateMoveSingle") });
                    return;
                }
                if (m.selected.size === 0) {
                    setMigrator({ ...m, error: t("migratePickSkills") });
                    return;
                }
                setMigrator({ ...m, busy: true, error: null });
                const payload = {
                    from: m.from === "global" ? null : m.from,
                    targets: [...m.targets].map((value) => (value === "global" ? null : value)),
                    mode: m.mode,
                    names: [...m.selected]
                };
                Promise.resolve().then(() => batchMigrateSkill(payload)).then((snapshot) => {
                    const results = snapshot !== null && typeof snapshot === "object" && Array.isArray(snapshot.results) ? snapshot.results : [];
                    setMigrator((prev) => (prev === null ? prev : { ...prev, busy: false, result: results }));
                    reloadAfterHot();
                }, (error) => {
                    setMigrator((prev) => (prev === null ? prev : { ...prev, busy: false, error: cleanHostError(error) }));
                });
            };
            // 分组：打开完整分组编辑器（#83：工具栏与中栏底部「＋ 新建分组」共用此入口；中栏行编辑也走这里）。
            const openGroupEditor = (groupId = null, presetScope = scopeFilter, presetSelected = null) => {
                const targetScope = typeof presetScope === "string" && presetScope !== "" ? presetScope : scopeFilter;
                const existing = groupId !== null && groupId !== undefined
                    ? (Array.isArray(groupsList) ? groupsList : []).find((item) => item.id === groupId)
                    : undefined;
                const initialNames = presetSelected !== null
                    ? [...presetSelected]
                    : (existing !== undefined && existing.scopes !== undefined && Array.isArray(existing.scopes[targetScope]) ? existing.scopes[targetScope] : []);
                setGroupEditor({
                    groupId: existing !== undefined ? existing.id : null,
                    name: existing !== undefined ? existing.name : "",
                    scope: targetScope,
                    selected: new Set(initialNames),
                    busy: false,
                    error: null
                });
            };
            const applyGroupSave = () => {
                const editor = groupEditor;
                if (editor === null)
                    return;
                const trimmed = String(editor.name ?? "").trim();
                if (trimmed === "") {
                    setGroupEditor({ ...editor, error: t("groupPickName") });
                    return;
                }
                if (editor.scope === "") {
                    setGroupEditor({ ...editor, error: t("groupPickScope") });
                    return;
                }
                setGroupEditor({ ...editor, busy: true, error: null });
                const payload = {
                    id: editor.groupId ?? undefined,
                    name: trimmed,
                    scope: editor.scope === "global" ? null : editor.scope,
                    names: [...editor.selected]
                };
                Promise.resolve().then(() => saveGroupSkill(payload)).then((snapshot) => {
                    const rows = snapshot !== null && typeof snapshot === "object" && Array.isArray(snapshot.groups) ? snapshot.groups : [];
                    setGroupsList(rows);
                    // 新建分组后直接选中它；来源筛选回到「全部」，免得列表被两层筛选夹空。
                    if (editor.scope === scopeFilter)
                        setGroupFilter(trimmed);
                    setOriginFilter("all");
                    setGroupEditor(null);
                    reloadAfterHot();
                }, (error) => {
                    setGroupEditor((prev) => (prev === null ? prev : { ...prev, busy: false, error: cleanHostError(error) }));
                });
            };
            const applyGroupDelete = () => {
                const editor = groupEditor;
                if (editor === null || editor.groupId === null || editor.groupId === undefined)
                    return;
                setGroupEditor({ ...editor, busy: true, error: null });
                Promise.resolve().then(() => deleteGroupSkill({ id: editor.groupId })).then((snapshot) => {
                    const rows = snapshot !== null && typeof snapshot === "object" && Array.isArray(snapshot.groups) ? snapshot.groups : [];
                    setGroupsList(rows);
                    if (groupFilter === editor.name)
                        setGroupFilter("all");
                    setGroupEditor(null);
                    reloadAfterHot();
                }, (error) => {
                    setGroupEditor((prev) => (prev === null ? prev : { ...prev, busy: false, error: cleanHostError(error) }));
                });
            };
            // 文件选择：单文件入口。
            const pickSingleFiles = (event) => {
                const input = event.currentTarget;
                const files = [...input.files];
                input.value = "";
                setAddMenuOpen(false);
                if (files.length === 0)
                    return;
                ingestItems(files.map((file) => ({ name: file.name, path: file.name, file })));
            };
            const pickZipFiles = (event) => {
                const input = event.currentTarget;
                const files = [...input.files];
                input.value = "";
                if (files.length === 0)
                    return;
                ingestItems(files.map((file) => ({ name: file.name, path: file.name, file })));
            };
            // 文件夹 / zip 入口：优先使用 File System Access API 选择文件夹；
            // 取消或不可用时回退到 .zip 文件选择，最终交给宿主自动识别结构。
            const readHandleDir = async (handle, prefix, out) => {
                for await (const [name, child] of handle.entries()) {
                    if (child.kind === "file") {
                        const file = await child.getFile();
                        out.push({ name, path: prefix === "" ? name : prefix + "/" + name, file });
                    }
                    else if (child.kind === "directory") {
                        await readHandleDir(child, prefix === "" ? name : prefix + "/" + name, out);
                    }
                }
            };
            const pickFolderOrZip = async () => {
                setAddMenuOpen(false);
                const picker = window.showDirectoryPicker;
                if (typeof picker === "function") {
                    try {
                        const dir = await picker.call(window, { mode: "read" });
                        const items = [];
                        // 相对路径必须带被选中文件夹自己的名字：这样「文件夹选择器」
                        // 与「拖放」得到的选择范围完全一致（否则技能包会被误判）。
                        await readHandleDir(dir, dir.name ?? "", items);
                        if (items.length > 0)
                            ingestItems(items);
                        return;
                    }
                    catch (error) {
                        // 用户取消：回退到 zip 文件选择。
                        zipFileInput.current?.click();
                        return;
                    }
                }
                zipFileInput.current?.click();
            };
            // 拖放：支持拖入 .md / .zip 文件与技能文件夹（自动识别结构）。
            const readDirEntries = (dirEntry) => new Promise((resolve, reject) => {
                const reader = dirEntry.createReader();
                const all = [];
                const readBatch = () => reader.readEntries((batch) => {
                    if (batch.length === 0)
                        resolve(all);
                    else {
                        all.push(...batch);
                        readBatch();
                    }
                }, reject);
                readBatch();
            });
            const collectDropItems = async (dataTransfer) => {
                const items = [];
                const walk = async (entry, prefix) => {
                    if (entry.isFile) {
                        const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
                        items.push({ name: entry.name, path: prefix + entry.name, file });
                    }
                    else if (entry.isDirectory) {
                        for (const child of await readDirEntries(entry))
                            await walk(child, prefix + entry.name + "/");
                    }
                };
                const entries = [];
                for (const item of dataTransfer.items) {
                    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
                    if (entry !== null)
                        entries.push(entry);
                }
                if (entries.length === 0) {
                    for (const file of dataTransfer.files)
                        items.push({ name: file.name, path: file.name, file });
                }
                else {
                    for (const entry of entries)
                        await walk(entry, "");
                }
                return items;
            };
            const activeDragNames = () => draggingRef.current ?? draggingSkills;
            const parseDraggedNames = (dataTransfer) => {
                const live = activeDragNames();
                if (Array.isArray(live) && live.length > 0)
                    return live;
                try {
                    const raw = dataTransfer?.getData?.("application/x-dsh-skills") || dataTransfer?.getData?.("text/plain") || "";
                    if (raw.startsWith("[")) {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed))
                            return parsed.filter((n) => typeof n === "string" && n !== "");
                    }
                    if (raw !== "")
                        return raw.split(",").map((s) => s.trim()).filter(Boolean);
                }
                catch {
                    // ignore
                }
                return [];
            };
            const onDrop = (event) => {
                event.preventDefault();
                setDragActive(false);
                setDropTarget(null);
                if (activeDragNames() !== null) {
                    draggingRef.current = null;
                    setDraggingSkills(null);
                    return;
                }
                if (adding.status === "busy" || event.dataTransfer === null)
                    return;
                collectDropItems(event.dataTransfer).then((items) => {
                    if (items.length > 0)
                        ingestItems(items);
                }, (error) => {
                    setAdding({ status: "error", message: cleanHostError(error) });
                });
            };
            const onDragOver = (event) => {
                event.preventDefault();
                if (activeDragNames() !== null) {
                    setDragActive(false);
                    return;
                }
                if (adding.status !== "busy")
                    setDragActive(true);
            };
            const onDragLeave = (event) => {
                if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))
                    return;
                setDragActive(false);
            };
            const normalizedQuery = query.trim().toLocaleLowerCase();
            const skills = listState.status === "ready" ? listState.skills : [];
            const totalTokens = skills.reduce((sum, skill) => sum + (typeof skill.tokens === "number" ? skill.tokens : 0), 0);
            const scopeOf = (skill) => (skill.scope !== undefined && skill.scope !== null && skill.scope.kind === "workspace" ? skill.scope.path : "global");
            const labelOf = (path) => {
                // 优先用 DSH 注册表的工作区名称（与文件夹名解耦），取不到回退文件夹名。
                const hit = (Array.isArray(wsOptions) ? wsOptions : []).find((workspace) => workspace.path === path);
                if (hit !== undefined && typeof hit.label === "string" && hit.label !== "")
                    return hit.label;
                const parts = String(path).replaceAll("\\", "/").split("/").filter(Boolean);
                return parts.length > 0 ? parts[parts.length - 1] : String(path);
            };
            const knownPaths = (Array.isArray(wsOptions) ? wsOptions : []).map((workspace) => workspace.path);
            const scopeKeys = ["global", ...knownPaths.filter((path) => path !== "global")];
            if (scopeFilter !== "global" && !scopeKeys.includes(scopeFilter))
                scopeKeys.push(scopeFilter);
            // 插件自带技能由宿主打标（pluginProvided）：它们在技能文件夹之外，面板也改不动，
            // 默认显示，但可以一键隐藏——只留下自己管理的文件技能。
            // 当前视图下每行的真实开关状态：工作区视图里，一个全局技能可能被这个
            // 工作区单独停用，而它在「全局」里仍然是启用的。
            const globalOff = new Set(Array.isArray(disabledState.global) ? disabledState.global : []);
            const offInScope = (name) => scopeFilter === "global" ? false : (Array.isArray(disabledState.workspaces[scopeFilter]) ? disabledState.workspaces[scopeFilter].includes(name) : false);
            const enabledHere = (skill) => {
                if (skill.enabled === false)
                    return false;
                if (scopeOf(skill) !== "global" || scopeFilter === "global")
                    return true;
                return !globalOff.has(skill.name) && !offInScope(skill.name);
            };
            const decorate = (skill) => ({ ...skill, enabled: enabledHere(skill), globalSkill: scopeOf(skill) === "global" });
            // 工作区视图里同时列出全局技能：它们本来就是这个工作区的 Agent 能看到的
            // 那一份，正好可以在这一列里单独关掉。
            const scopedAll = skills
                .filter((skill) => scopeOf(skill) === scopeFilter || (scopeFilter !== "global" && scopeOf(skill) === "global"))
                .map(decorate);
            const hiddenPluginCount = showPluginSkills ? 0 : scopedAll.reduce((sum, skill) => sum + (skill.pluginProvided === true ? 1 : 0), 0);
            const scoped = showPluginSkills ? scopedAll : scopedAll.filter((skill) => skill.pluginProvided !== true);
            // ── 左轨：工作区（全局恒显示，其余只显示计数 > 0 的）+ 发光竖条 ────
            // 计数与中栏「全部」一致：按当前作用域统计，插件技能被隐藏时同步扣掉。
            const GLOBAL_ROW_KEY = "\u0000scope-global";
            // 分组的中栏数据源：当前作用域里建过组的分组（与 2.0.2 语义一致）；
            // 另外把「一个成员都还没有的分组」也放进来——中栏底部「＋ 新建分组」建的
            // 就是这种空组，宿主侧 upsertGroup 在 names 为空时不会写 scope 键，
            // 不放行的话用户新建完就什么也看不见（计数恒为 0，点进去是空态）。
            const scopeGroupRows = (Array.isArray(groupsList) ? groupsList : []).filter((group) => group.scopes !== undefined && group.scopes !== null && (Object.prototype.hasOwnProperty.call(group.scopes, scopeFilter) || Object.keys(group.scopes).length === 0));
            // 组成员：取 scopes[当前作用域] 里的名字，且该技能确实在当前作用域中。
            const membersOfGroup = (group) => {
                const names = group !== undefined && group.scopes !== undefined && Array.isArray(group.scopes[scopeFilter]) ? group.scopes[scopeFilter] : [];
                return scoped.filter((skill) => names.includes(skill.name));
            };
            const countInScope = (scopeKey) => skills.reduce((sum, skill) => sum + (scopeOf(skill) === scopeKey && (showPluginSkills || skill.pluginProvided !== true) ? 1 : 0), 0);
            // 左轨列出**全部**工作区（全局恒在首位），计数为 0 的也列——列表放不下就滚动，
            // 不再用「计数 > 0」过滤 + 「其他工作区」菜单兜底（用户 2026-10-15 定案：
            // 元素太多、菜单不如直接滚；藏起来的工作区还会让「往新工作区加技能」没有入口）。
            const railEntries = [{ key: "global", label: t("scopeGlobal"), count: countInScope("global") }];
            for (const path of knownPaths) {
                if (path === "global")
                    continue;
                if (railEntries.some((entry) => entry.key === path))
                    continue;
                railEntries.push({ key: path, label: labelOf(path), count: countInScope(path) });
            }
            // 会话锚定的工作区可能还没进 knownPaths：补一行，别让当前作用域在界面上消失。
            if (!railEntries.some((entry) => entry.key === scopeFilter))
                railEntries.push({ key: scopeFilter, label: labelOf(scopeFilter), count: countInScope(scopeFilter) });
            const countOfScope = (scopeKey) => (scopeKey === "global" ? t("scopeGlobal") : labelOf(scopeKey));
            // ── 中栏：分组 + 来源（合并）─────────────────────────────────────
            // 分组是筛选器（可新建），来源决定右侧列表怎么分区；两者同时生效。
            const ORIGIN_USER = "\u0000user";
            const ORIGIN_IMPORTED = "\u0000imported";
            const ORIGIN_SYSTEM = "\u0000system";
            const ORIGIN_PLUGIN_PREFIX = "\u0000plugin:";
            const originKeyOf = (skill) => {
                if (skill.source === "bundled" || skill.source === "runtime")
                    return ORIGIN_SYSTEM;
                // provider=filesystem / nested 是文件技能（用户根或工作区扫描所得）；
                // 即使宿主因路径不在受管根目录里标了 pluginProvided，也算「我的技能」。
                const provider = typeof skill.provider === "string" ? skill.provider : "";
                // ~/.agents/skills（user-agents）与项目里的 .agents/skills 是第三方导入的技能
                // （pi/Codex 布局），不是用户自己写的，单独成一个「导入」分区。
                const source = typeof skill.source === "string" ? skill.source : "";
                if (source === "user-agents" || source === "project-agents")
                    return ORIGIN_IMPORTED;
                // pluginProvided 是宿主的权威判定（技能不在受管根目录下、改不动）：
                // 它优先于 provider——因为宿主会把随包技能重标成 "filesystem"。
                // 宿主会把随包技能重标成 "filesystem"，直接用它当插件名会得到一个
                // 莫名其妙的「Plugin: filesystem」标题；这种情况归入系统自带。
                if (skill.pluginProvided === true) {
                    if (provider === "" || provider === "filesystem")
                        return ORIGIN_SYSTEM;
                    return ORIGIN_PLUGIN_PREFIX + provider;
                }
                if (provider === "filesystem" || provider === "nested")
                    return ORIGIN_USER;
                return ORIGIN_USER;
            };
            const originLabelOf = (key) => key === ORIGIN_USER ? t("originUser") : key === ORIGIN_IMPORTED ? t("originImported") : key === ORIGIN_SYSTEM ? t("originSystem") : t("originPlugin").replace("{plugin}", key.slice(ORIGIN_PLUGIN_PREFIX.length));
            // 来源筛选：originFilter 存来源键。
            const originCounts = new Map();
            for (const skill of scoped) {
                const key = originKeyOf(skill);
                originCounts.set(key, (originCounts.get(key) ?? 0) + 1);
            }
            // 「未分组」：不属于当前作用域里任何一个分组的技能。
            const groupedNames = new Set();
            for (const group of scopeGroupRows) {
                const names = group.scopes !== undefined && group.scopes !== null && Array.isArray(group.scopes[scopeFilter]) ? group.scopes[scopeFilter] : [];
                for (const name of names)
                    groupedNames.add(name);
            }
            // 分组筛选（groupFilter）+ 来源筛选（originFilter）叠加。
            const groupMatched = groupFilter === "all" ? scoped : groupFilter === "" ? scoped.filter((skill) => !groupedNames.has(skill.name)) : scoped.filter((skill) => (Array.isArray(skill.groups) ? skill.groups : []).includes(groupFilter));
            const activeList = originFilter === "all"
                ? groupMatched
                : originFilter === GLOBAL_ROW_KEY
                    ? groupMatched.filter((skill) => skill.globalSkill === true)
                    : groupMatched.filter((skill) => originKeyOf(skill) === originFilter);
            const filtered = activeList.filter((skill) => skillMatchesQuery(skill, normalizedQuery));
            // 分组 + 来源共用一个中栏：上面是分组筛选，下面是来源分区。
            const ungroupedCount = scoped.reduce((sum, skill) => sum + (groupedNames.has(skill.name) ? 0 : 1), 0);
            const showUngrouped = scopeGroupRows.length > 0 && ungroupedCount > 0;
            const globalHereCount = scoped.reduce((sum, skill) => sum + (skill.globalSkill === true ? 1 : 0), 0);
            const paneRows = [
                { key: "all", label: t("groupAll"), count: scoped.length, kind: "group" },
                // 每个工作区都带一行「全局」：全局技能在这一列里出现，就是为了能
                // 只在这个工作区里把它关掉。
                ...(scopeFilter !== "global" ? [{ key: GLOBAL_ROW_KEY, label: t("paneGlobalScope"), count: globalHereCount, kind: "group" }] : []),
                ...scopeGroupRows.map((group) => ({ key: group.name, label: group.name, count: membersOfGroup(group).length, group, kind: "group" })),
                ...(showUngrouped ? [{ key: "", label: t("paneUngrouped"), count: ungroupedCount, kind: "group" }] : []),
                ...[...originCounts.entries()]
                    .sort((left, right) => right[1] - left[1] || originLabelOf(left[0]).localeCompare(originLabelOf(right[0])))
                    .map(([key, count]) => ({ key: key, label: originLabelOf(key), count: count, kind: "origin" }))
            ];
            // 选中行高亮：分组行与来源行各自记住自己的选择。
            const activePaneKey = originFilter !== "all" ? originFilter : groupFilter;
            // 「未分组」行消失时不能把列表留在那个看不见的筛选上：所有技能都进了分组、
            // 或者用户把分组删光了，都要退回「全部」。
            react.useEffect(() => {
                if (groupFilter === "" && !showUngrouped)
                    setGroupFilter("all");
            }, [groupFilter, showUngrouped]);
            // 两类行互斥：选分组就把来源清回「全部」，选来源就把分组清回「全部」，
            // 免得两层筛选叠加出一个看起来空的列表。
            const selectPaneRow = (row) => {
                if (row.kind === "origin") {
                    setOriginFilter(row.key);
                    setGroupFilter("all");
                }
                else {
                    setGroupFilter(row.key);
                    setOriginFilter("all");
                }
                setBatchMenuOpen(false);
                setBatchGroupOpen(false);
            };
            // ── 批量模式：勾选 / 迁移 / 批量分组 ────────────────────────────────
            const exitBatch = () => {
                setBatchMode(false);
                setSelected(new Set());
                setBatchMenuOpen(false);
                setBatchGroupOpen(false);
            };
            // 「迁移到…」菜单：除当前工作区外的全部工作区（全局恒在），末项回落到完整的
            // 批量迁移对话框（复制模式 / 多目标 / 失败明细）。
            // 宿主 Menu 的条目契约是 { id, label }——别把内部用的 key 直接塞进去，
            // 否则菜单能画出来但 onSelect 拿到 undefined。哨兵用 ASCII：它会作为
            // item.id 进宿主的渲染层，不要塞控制字符；工作区路径不可能是这个值。
            const BATCH_ADVANCED = "panel:advanced";
            const BATCH_GROUP_NEW = "panel:group-new";
            const targetWorkspaces = [{ id: "global", label: t("scopeGlobal") }, ...knownPaths.filter((path) => path !== "global").map((path) => ({ id: path, label: labelOf(path) }))].filter((entry) => entry.id !== scopeFilter);
            const toggleSelected = (name) => {
                setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(name))
                        next.delete(name);
                    else
                        next.add(name);
                    return next;
                });
            };
            // 共用的工作区移动（快捷迁移 & 拖拽到左轨工作区 #78 共用）。
            const moveSkillsToWorkspace = (targetKey, names, fromBatch) => {
                if (names.length === 0 || targetKey === scopeFilter)
                    return;
                const currentByName = new Map(scoped.map((skill) => [skill.name, skill]));
                const editableNames = names.filter((name) => {
                    const skill = currentByName.get(name);
                    return skill === undefined || isEditableSkill(skill);
                });
                const skippedCount = names.length - editableNames.length;
                if (editableNames.length === 0) {
                    showToast(t("dropReadOnlyAll"));
                    return;
                }
                const payload = {
                    from: scopeFilter === "global" ? null : scopeFilter,
                    targets: [targetKey === "global" ? null : targetKey],
                    mode: "move",
                    names: editableNames
                };
                Promise.resolve().then(() => batchMigrateSkill(payload)).then((snapshot) => {
                    const results = snapshot !== null && typeof snapshot === "object" && Array.isArray(snapshot.results) ? snapshot.results : [];
                    const done = results.filter((row) => row !== null && typeof row === "object" && row.ok !== false).map((row) => row.name);
                    const moved = done.length > 0 ? done : editableNames;
                    setListState((prev) => (prev.status === "ready" ? { status: "ready", skills: prev.skills.filter((skill) => !(scopeOf(skill) === scopeFilter && moved.includes(skill.name))) } : prev));
                    const targetName = countOfScope(targetKey);
                    if (skippedCount > 0) {
                        showToast(t("dropReadOnlySkipped").replace("{moved}", String(moved.length)).replace("{skipped}", String(skippedCount)));
                    }
                    else {
                        showToast(t(fromBatch ? "batchMigrated" : "dropMoved").replace("{count}", String(moved.length)).replace("{target}", targetName));
                    }
                    if (fromBatch)
                        exitBatch();
                    reloadAfterHot();
                }, (error) => {
                    setShellNotice({ kind: "error", text: cleanHostError(error) });
                });
            };
            const runQuickMigrate = (targetKey) => moveSkillsToWorkspace(targetKey, [...selected], true);
            // 共用的分组加/减成员 helper（批量栏「分组…」#76 与拖拽到分组 #78 共用）。
            const saveGroupMembership = (group, names, add, fromBatch = false) => {
                if (group === undefined || names.length === 0)
                    return;
                const existing = group.scopes !== undefined && Array.isArray(group.scopes[scopeFilter]) ? group.scopes[scopeFilter] : [];
                const nameSet = new Set(names);
                const merged = add
                    ? [...new Set([...existing, ...names])]
                    : existing.filter((name) => !nameSet.has(name));
                Promise.resolve().then(() => saveGroupSkill({
                    id: group.id,
                    name: group.name,
                    scope: scopeFilter === "global" ? null : scopeFilter,
                    names: merged
                })).then((snapshot) => {
                    const rows = snapshot !== null && typeof snapshot === "object" && Array.isArray(snapshot.groups) ? snapshot.groups : [];
                    setGroupsList(rows);
                    showToast(t(add ? "batchGroupAdded" : "batchGroupRemoved").replace("{count}", String(names.length)).replace("{name}", group.name));
                    if (fromBatch)
                        exitBatch();
                    reloadAfterHot();
                }, (error) => {
                    setShellNotice({ kind: "error", text: cleanHostError(error) });
                });
            };
            const batchGroupMenuItems = [
                { id: BATCH_GROUP_NEW, label: t("batchGroupNew") },
                ...scopeGroupRows.flatMap((group) => {
                    const members = new Set(group.scopes !== undefined && Array.isArray(group.scopes[scopeFilter]) ? group.scopes[scopeFilter] : []);
                    const selNames = [...selected];
                    const anyIn = selNames.some((name) => members.has(name));
                    const allIn = selNames.length > 0 && selNames.every((name) => members.has(name));
                    const out = [];
                    if (!allIn)
                        out.push({ id: "add:" + group.id, label: t("batchGroupAdd").replace("{name}", group.name) });
                    if (anyIn)
                        out.push({ id: "rm:" + group.id, label: t("batchGroupRemove").replace("{name}", group.name) });
                    return out;
                })
            ];
            // ── 「打开目录」（宿主没有打开文件管理器的 API）──────────────────
            // 宿主既没有「在系统文件管理器里打开路径」的 RPC，也没有回传技能根路径的接口，
            // 所以这一版把根路径复制到剪贴板、并在通知条里回显，用户自己粘贴到资源管理器。
            //
            // 关键点：`rel` 是**相对技能根的目录路径**（"cat/beta"，目录型技能包），
            // 扁平 `.md` 技能则是空串；而 `content` 回的是 SKILL.md 的绝对路径。
            // 早先只按「path 以 rel 结尾」判断，两者对不上，于是每个工作区都报
            // 「暂时拿不到技能根路径」（2026-10-19 用户复现）。
            const skillRootOf = (filePath, rel) => {
                const normalized = String(filePath ?? "").replaceAll("\\", "/");
                if (normalized === "")
                    return null;
                const lower = normalized.toLocaleLowerCase();
                const suffix = String(rel ?? "").replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "");
                const cut = (tail) => normalized.slice(0, normalized.length - tail.length - 1).replace(/\/+$/, "");
                if (suffix !== "") {
                    for (const tail of [suffix + "/SKILL.md", suffix + "/SKILL.md.disabled", suffix]) {
                        if (lower.endsWith("/" + tail.toLocaleLowerCase()))
                            return cut(tail);
                    }
                }
                // 根层的扁平技能：rel 为空，根目录就是文件所在目录。
                if (suffix === "")
                    return normalized.replace(/\/[^/]+$/, "");
                return null;
            };
            const resolveSkillRoot = () => {
                // 1) 已经展开过的技能正文里带着 SKILL.md 的绝对路径。
                for (const skill of scopedAll) {
                    const body = bodies[opKeyOf(skill)];
                    if (body === undefined || body.status !== "ready")
                        continue;
                    const root = skillRootOf(body.skill?.path, skill.rel);
                    if (root)
                        return Promise.resolve(root);
                }
                // 2) 没展开过：拿当前作用域里第一个技能调一次 content，只为读它的 path。
                //    失败不早退——继续走第 3 步的兜底，否则（只要有技能存在）兜底永远走不到。
                const probe = scopedAll.find((skill) => typeof skill.name === "string" && skill.name !== "");
                const probeRoot = probe === undefined
                    ? Promise.resolve(null)
                    : Promise.resolve().then(() => loadContent(probe.name, scopeOf(probe))).then((body) => skillRootOf(body?.path, probe.rel), () => null);
                return probeRoot.then((root) => {
                    if (root)
                        return root;
                    // 3) 兜底：工作区作用域按 src/scope.ts 的规则拼 <工作区根>/.dsh/skills；
                    //    全局作用域没有可推导的锚点，宁可直说拿不到，也不猜一个路径给用户。
                    if (scopeFilter !== "global")
                        return String(scopeFilter).replaceAll("\\", "/").replace(/\/+$/, "") + "/.dsh/skills";
                    return null;
                });
            };
            const openSkillFolder = () => {
                resolveSkillRoot().then((root) => {
                    if (root === null || root === "") {
                        setShellNotice({ kind: "error", text: t("openFolderUnavailable") });
                        return;
                    }
                    // 宿主侧真的去弹资源管理器；宿主打不开（目录还没建出来、没有 xdg-open 等）
                    // 再退回「复制路径」，不让按钮变成死路。
                    // 提示条里的路径用宿主回传的那份：宿主会把它换成本机分隔符
                    // （Windows 的 explorer.exe 不认正斜杠，见 src/reveal.ts），
                    // 这里跟着显示同一份，用户复制出来粘进资源管理器也直接可用。
                    return openFolder(root).then((result) => {
                        const opened = result !== null && typeof result === "object" && typeof result.opened === "string" && result.opened !== "" ? result.opened : root;
                        setShellNotice({ kind: "info", text: t("openFolderRevealed").replace("{path}", opened) });
                    }, () => copyTextToClipboard(root).then((ok) => {
                        setShellNotice({ kind: "info", text: (ok ? t("openFolderCopied") : t("openFolderManual")).replace("{path}", root) });
                    }));
                });
            };
            // 切换工作区：分组/来源筛选归位，批量选择作废（选择是按作用域算的）。
            react.useEffect(() => {
                setGroupFilter("all");
                setOriginFilter("all");
                setSelected(new Set());
                setBatchMode(false);
                setBatchMenuOpen(false);
                setBatchGroupOpen(false);
            }, [scopeFilter]);
            // 左轨竖条位置：优先按 DOM 实测（字体/缩放下最稳），实测不到时用节距推算。
            react.useEffect(() => {
                const host = railListRef.current;
                if (host === null || typeof host.querySelector !== "function")
                    return undefined;
                const active = host.querySelector("[data-active=true]");
                if (active === null)
                    return undefined;
                const offset = typeof active.offsetTop === "number" ? active.offsetTop : 0;
                const height = typeof active.offsetHeight === "number" && active.offsetHeight > 0 ? active.offsetHeight : 34;
                setRailBarY(offset + (height - 18) / 2);
                return undefined;
            }, [scopeFilter, railEntries.length, showPluginSkills]);
            // ── 树形渲染（嵌套技能按文件树显示；搜索时扁平化）──────────────────
            const querying = normalizedQuery.trim() !== "";
            const treeRoot = buildSkillTree(filtered);
            // ── 按来源分区（用户技能 → 各插件各一组 → 系统自带）──────────────
            // 顺序固定为 用户 → 插件（按插件名排序） → 系统，插件之间不抢位置。
            const originSections = (() => {
                const buckets = new Map();
                for (const skill of filtered) {
                    // 工作区视图里的全局技能单独成块（见下面 unshift），不混进来源分区。
                    if (scopeFilter !== "global" && skill.globalSkill === true)
                        continue;
                    const key = originKeyOf(skill);
                    if (!buckets.has(key))
                        buckets.set(key, []);
                    buckets.get(key).push(skill);
                }
                const rows = [...buckets.entries()].map(([key, list]) => ({
                    key,
                    label: originLabelOf(key),
                    skills: list,
                    order: key === ORIGIN_USER ? 0 : key === ORIGIN_IMPORTED ? 1 : key === ORIGIN_SYSTEM ? 3 : 2
                })).sort((left, right) => left.order - right.order || left.label.localeCompare(right.label));
                if (scopeFilter !== "global") {
                    const globals = filtered.filter((skill) => skill.globalSkill === true);
                    if (globals.length > 0)
                        rows.unshift({ key: GLOBAL_ROW_KEY, label: t("paneGlobalScope"), skills: globals, order: -1 });
                }
                return rows;
            })();
            const [collapsedOrigins, setCollapsedOrigins] = react.useState(() => new Set());
            const toggleOrigin = (key) => setCollapsedOrigins((prev) => {
                const next = new Set(prev);
                if (next.has(key))
                    next.delete(key);
                else
                    next.add(key);
                return next;
            });
            // 可编辑判定：bundled / runtime / 插件随包自带（pluginProvided）技能不可就地启停或删除。
            const isEditableSkill = (skill) => skill.source !== "bundled" && skill.source !== "runtime" && skill.pluginProvided !== true;
            // 开关对所有列出的技能都可用：文件技能改名停用，随包技能由宿主在注册表层面隐藏。
            const isSwitchableSkill = (skill) => skill !== null && skill !== undefined;
            // 卡片行（v2.1.6）：[勾选框][图标][名称 + 描述][红绿灯 + 删除]。
            // 展开详情的入口是中间那块文字按钮；批量模式下点它等于勾选（与设计稿一致）。
            const renderCard = (skill) => {
                const key = opKeyOf(skill);
                const open = expanded === key;
                const body = bodies[key];
                const enabled = skill.enabled !== false;
                const editable = isEditableSkill(skill);
                const op = ops[key];
                const checked = selected.has(skill.name);
                return (0, react_jsx_runtime.jsxs)("li", {
                    key: skill.name,
                    className: c.card,
                    draggable: true,
                    "data-skill-name": skill.name,
                    "data-open": open ? "true" : void 0,
                    "data-selected": batchMode && checked ? "true" : void 0,
                    "data-dragging": draggingSkills !== null && draggingSkills.includes(skill.name) ? "true" : void 0,
                    "data-removing": removing.has(key) ? "true" : void 0,
                    onDragStart: (event) => {
                        const names = batchMode && checked && selected.size > 0 ? [...selected] : [skill.name];
                        draggingRef.current = names;
                        setDraggingSkills(names);
                        setDragActive(false);
                        if (event?.dataTransfer !== null && event?.dataTransfer !== undefined) {
                            try {
                                event.dataTransfer.effectAllowed = "copyMove";
                                event.dataTransfer.setData("application/x-dsh-skills", JSON.stringify(names));
                                event.dataTransfer.setData("text/plain", names.join(","));
                            }
                            catch {
                                // ignore synthetic events
                            }
                        }
                    },
                    onDragEnd: () => {
                        draggingRef.current = null;
                        setDraggingSkills(null);
                        setDropTarget(null);
                        setDragActive(false);
                    },
                    children: [(0, react_jsx_runtime.jsxs)("div", {
                            className: c.cardRow,
                            children: [(0, react_jsx_runtime.jsx)("span", {
                                    className: c.check,
                                    children: (0, react_jsx_runtime.jsx)("input", {
                                        type: "checkbox",
                                        className: c.checkBox,
                                        checked: checked,
                                        tabIndex: batchMode ? 0 : -1,
                                        "aria-label": t("batchSelect") + " " + skill.name,
                                        onChange: () => {
                                            toggleSelected(skill.name);
                                        }
                                    })
                                }), (0, react_jsx_runtime.jsx)("span", {
                                    className: c.rowIcon,
                                    "aria-hidden": "true",
                                    children: hostIcon(primitiveIcon("IconSkillOutlineRegular"), 16, ICON_PATHS.skill)
                                }), (0, react_jsx_runtime.jsxs)("button", {
                                    type: "button",
                                    className: c.rowText,
                                    title: skill.name,
                                    "aria-expanded": batchMode ? void 0 : open,
                                    onClick: () => {
                                        if (batchMode)
                                            toggleSelected(skill.name);
                                        else
                                            toggle(skill);
                                    },
                                    children: [(0, react_jsx_runtime.jsxs)("span", {
                                            className: c.rowTitle,
                                            children: [(0, react_jsx_runtime.jsx)("span", {
                                                    className: c.rowName,
                                                    "data-disabled": enabled ? void 0 : "true",
                                                    children: skill.name
                                                }), typeof skill.tokens === "number" && skill.tokens > 0 ? (0, react_jsx_runtime.jsx)("span", {
                                                    className: c.tokChip,
                                                    title: t("tokenChipHint") + " · " + t("tokenCatalogHint") + " " + formatTokens(skill.catalog ?? 0) + " tok",
                                                    children: formatTokens(skill.tokens) + " tok"
                                                }) : null]
                                        }), typeof skill.description === "string" && skill.description !== "" ? (0, react_jsx_runtime.jsx)("span", {
                                            className: c.rowDesc,
                                            children: skill.description
                                        }) : null]
                                }), (0, react_jsx_runtime.jsxs)("span", {
                                    className: c.rowControls,
                                    // 启停开关用宿主自带的凭据组件（primitives.Switch）：和 DSH 设置页
                                    // 的开关同一份实现，不再是自绘的红绿灯。宿主没提供该组件时退回
                                    // 旧的红绿灯按钮，面板照常可用。
                                    children: [op?.status === "error" ? (0, react_jsx_runtime.jsx)("span", {
                                            className: c.opError,
                                            children: t("opFailed")
                                        }) : null, editable ? (0, react_jsx_runtime.jsx)("button", {
                                            type: "button",
                                            className: c.rowDelete,
                                            "aria-label": t("deleteLabel") + " " + skill.name,
                                            title: t("deleteLabel"),
                                            disabled: op?.status === "busy",
                                            onClick: () => {
                                                applyRemove(skill);
                                            },
                                            children: hostIcon(primitiveIcon("IconTrashOutlineRegular"), 14, ICON_PATHS.trash)
                                        }) : null, editable ? (typeof primitives.Switch === "function" ? (0, react_jsx_runtime.jsx)(primitives.Switch, {
                                            checked: enabled,
                                            onChange: (next) => {
                                                if (next !== enabled)
                                                    applySetEnabled(skill);
                                            },
                                            label: (enabled ? t("switchDisable") : t("switchEnable")) + " " + skill.name,
                                            // 工作区视图里的全局技能：这里的开关只影响这个工作区。
                                            title: skill.globalSkill === true && scopeFilter !== "global"
                                                ? t("switchWorkspaceHint").replace("{name}", skill.name)
                                                : enabled ? t("switchDisable") : t("switchEnable"),
                                            disabled: op?.status === "busy"
                                        }) : (0, react_jsx_runtime.jsxs)("button", {
                                            type: "button",
                                            role: "switch",
                                            className: c.traffic,
                                            "data-on": enabled ? "true" : "false",
                                            "aria-checked": enabled,
                                            "aria-label": (enabled ? t("switchDisable") : t("switchEnable")) + " " + skill.name,
                                            title: enabled ? t("switchDisable") : t("switchEnable"),
                                            disabled: op?.status === "busy",
                                            onClick: () => {
                                                applySetEnabled(skill);
                                            },
                                            children: [(0, react_jsx_runtime.jsx)("i", { className: c.trafficDot + " " + c.trafficRed }), (0, react_jsx_runtime.jsx)("i", { className: c.trafficDot + " " + c.trafficGreen })]
                                        })) : typeof primitives.Switch === "function" ? (0, react_jsx_runtime.jsx)(primitives.Switch, {
                                            checked: enabled,
                                            onChange: (next) => {
                                                if (next !== enabled)
                                                    applySetEnabled(skill);
                                            },
                                            label: (enabled ? t("switchDisable") : t("switchEnable")) + " " + skill.name,
                                            title: skill.globalSkill === true && scopeFilter !== "global"
                                                ? t("switchWorkspaceHint").replace("{name}", skill.name)
                                                : t("pluginSwitchHint"),
                                            disabled: op?.status === "busy"
                                        }) : (0, react_jsx_runtime.jsx)("span", {
                                            className: c.configTag,
                                            "data-enabled": enabled ? "true" : "false",
                                            children: enabled ? t("enabledTag") : t("disabledTag")
                                        })]
                                })]
                        }), open ? (0, react_jsx_runtime.jsxs)("div", {
                            className: c.cardDetails,
                            children: [(0, react_jsx_runtime.jsxs)("p", {
                                    className: c.meta,
                                    children: [skill.description, (0, react_jsx_runtime.jsx)("span", {
                                            className: c.metaProvider,
                                            children: t("providerLabel") + ": " + skill.provider
                                        })]
                                }), body === undefined || body.status === "loading" ? (0, react_jsx_runtime.jsx)("p", {
                                    className: c.status,
                                    children: t("contentLoading")
                                }) : null,
                                body !== undefined && body.status === "error" ? (0, react_jsx_runtime.jsx)("p", {
                                    className: c.failureText,
                                    children: t("contentError")
                                }) : null,
                                body !== undefined && body.status === "missing" ? (0, react_jsx_runtime.jsx)("p", {
                                    className: c.failureText,
                                    children: t("contentMissing")
                                }) : null,
                                body !== undefined && body.status === "ready" ? (0, react_jsx_runtime.jsx)("div", {
                                    className: c.contentBox,
                                    children: (0, react_jsx_runtime.jsx)("pre", {
                                        className: c.content,
                                        children: body.skill.content
                                    })
                                }) : null]
                        }) : null]
                }, skill.name);
            };
            const renderFolder = (folder) => (0, react_jsx_runtime.jsxs)("li", {
                className: c.treeFolder,
                children: [(0, react_jsx_runtime.jsx)("button", {
                        type: "button",
                        className: c.treeFolderHeader,
                        "aria-expanded": !collapsed.has(folder.path),
                        onClick: () => {
                            toggleCollapsed(folder.path);
                        },
                        children: [(0, react_jsx_runtime.jsx)(primitiveIcon("IconChevronDownOutlineRegular"), {
                                className: collapsed.has(folder.path) ? c.treeChevron : c.treeChevronOpen,
                                size: 12,
                                "aria-hidden": "true"
                            }), (0, react_jsx_runtime.jsx)("span", {
                                className: c.treeFolderName,
                                children: folder.name
                            }), (0, react_jsx_runtime.jsx)("span", {
                                className: c.treeFolderCount,
                                children: String(folder.count)
                            })]
                    }), !collapsed.has(folder.path) ? (0, react_jsx_runtime.jsx)("ul", {
                        className: c.cards,
                        children: [...folder.folders.values()].map(renderFolder).concat(folder.skills.map(renderCard))
                    }) : null]
            }, folder.path);
            // scopeGroupRows / membersOfGroup 已上移到中栏数据区（paneRows 需要它们）。
            const countOf = (rows) => ({
                total: rows.length,
                on: rows.reduce((sum, skill) => sum + (skill.enabled === true ? 1 : 0), 0),
                editable: rows.reduce((sum, skill) => sum + (isSwitchableSkill(skill) ? 1 : 0), 0),
                editableOn: rows.reduce((sum, skill) => sum + (isSwitchableSkill(skill) && skill.enabled === true ? 1 : 0), 0)
            });
            const groupCount = (group) => countOf(membersOfGroup(group));
            const allCounts = countOf(scoped);
            // 整组开关的作用对象跟随中栏当前那一样（分组 → 该组成员；来源 → 该来源的技能；
            // 未分组 → 未归入任何分组的技能）。
            const activeGroup = groupFilter !== "all" && groupFilter !== "" ? scopeGroupRows.find((group) => group.name === groupFilter) : undefined;
            const activeSkills = activeGroup !== undefined ? membersOfGroup(activeGroup) : activeList;
            const activeCounts = countOf(activeSkills);
            const bulkKey = groupFilter + "\u0000" + originFilter;
            // 整组开关：统一设成目标值（可编辑成员并非全部开启 → 全开，否则全关）。
            // 只对可编辑成员发 RPC；整批只挂一次热刷新；逐项失败记进 ops，成功的继续。
            const applyBulkToggle = (rows, key) => {
                const switchable = rows.filter(isSwitchableSkill);
                if (switchable.length === 0)
                    return;
                const target = !switchable.every((skill) => skill.enabled === true);
                const pending = switchable.filter((skill) => (skill.enabled === true) !== target);
                if (pending.length === 0)
                    return;
                setBulkGroup(key);
                Promise.all(pending.map((skill) => runSetEnabled(skill, target))).then((results) => {
                    setBulkGroup(null);
                    if (results.some((ok) => ok === true))
                        reloadAfterHot();
                });
            };
            const applyActiveToggle = () => applyBulkToggle(activeSkills, bulkKey);
            // 编辑器的组成员（按分组 id + 作用域取该作用域下的名字）。
            const membersOfGroupById = (groupId, scopeKey) => {
                if (groupId === null || groupId === undefined)
                    return [];
                const group = (Array.isArray(groupsList) ? groupsList : []).find((item) => item.id === groupId);
                return group !== undefined && Array.isArray(group.scopes[scopeKey]) ? group.scopes[scopeKey] : [];
            };
            const groupEditorSkills = groupEditor !== null ? skills.filter((skill) => scopeOf(skill) === groupEditor.scope) : [];
            const migratorSkills = migrator !== null ? skills.filter((skill) => scopeOf(skill) === migrator.from) : [];
            // 搜索过滤掉已展开项时自动收起。
            react.useEffect(() => {
                if (expanded !== null && !filtered.some((skill) => opKeyOf(skill) === expanded))
                    setExpanded(null);
            }, [expanded, filtered]);
            // 展开/收起：展开时懒加载内容并缓存。缓存键与操作键一致，按
            // （名称+作用域）区分——同名技能在不同作用域各有独立展开与正文。
            const toggle = (skill) => {
                const key = opKeyOf(skill);
                const next = expanded === key ? null : key;
                setExpanded(next);
                if (next === null || bodies[key] !== undefined || inflight.current.has(key))
                    return;
                inflight.current.add(key);
                setBodies((prev) => ({ ...prev, [key]: { status: "loading" } }));
                Promise.resolve().then(() => loadContent(skill.name, scopeOf(skill))).then((skillBody) => {
                    inflight.current.delete(key);
                    setBodies((prev) => ({ ...prev, [key]: { status: skillBody === null ? "missing" : "ready", skill: skillBody } }));
                }, () => {
                    inflight.current.delete(key);
                    setBodies((prev) => ({ ...prev, [key]: { status: "error" } }));
                });
            };
            // ── 三栏外壳：左轨（工作区）/ 中栏（分组·来源）/ 主区 ────────────────
            // 加载态与错误态只占主区：外壳不闪、切页签回来也不用重新认路。
            // 简洁模式的工作区选择器：折叠式下拉表单。
            // 自带定位（wrap 用 relative + 菜单 absolute），不依赖宿主 Menu 的 portal/锚点测量——
            // 用宿主 Menu 时菜单会跑到页面最右侧（截图复现，2026-10-19）。
            // 打开时铺一层透明遮罩接住外部点击，菜单最多 11 行、超出在自身滚动。
            const compactWorkspacePicker = (0, react_jsx_runtime.jsxs)("div", {
                className: c.scopeMenuWrap,
                children: [(0, react_jsx_runtime.jsxs)("button", {
                        type: "button",
                        className: c.scopeSelect,
                        "aria-haspopup": "menu",
                        "aria-expanded": scopeMenuOpen,
                        onClick: () => {
                            setScopeMenuOpen((value) => !value);
                        },
                        children: [(0, react_jsx_runtime.jsx)("span", {
                                className: c.scopeSelectLabel,
                                children: scopeFilter === "global" ? t("scopeGlobal") : labelOf(scopeFilter)
                            }), (0, react_jsx_runtime.jsx)(primitiveIcon("IconChevronDownOutlineRegular"), {
                                size: 14,
                                className: c.scopeSelectChevron
                            })]
                    }), scopeMenuOpen ? (0, react_jsx_runtime.jsx)("div", {
                        className: c.scopeMenuOverlay,
                        "aria-hidden": "true",
                        onClick: () => {
                            setScopeMenuOpen(false);
                        }
                    }) : null, scopeMenuOpen ? (0, react_jsx_runtime.jsx)("div", {
                        className: c.scopeMenu,
                        role: "menu",
                        "aria-label": t("railWorkspaces"),
                        children: railEntries.map((entry) => (0, react_jsx_runtime.jsxs)("button", {
                            type: "button",
                            key: entry.key,
                            role: "menuitemradio",
                            "aria-checked": scopeFilter === entry.key,
                            className: c.scopeMenuItem,
                            "data-active": scopeFilter === entry.key ? "true" : void 0,
                            title: entry.label,
                            onClick: () => {
                                setScopeFilter(entry.key);
                                setScopeMenuOpen(false);
                            },
                            children: [(0, react_jsx_runtime.jsx)("span", {
                                    className: c.scopeMenuItemLabel,
                                    children: entry.label
                                }), (0, react_jsx_runtime.jsx)("span", {
                                    className: c.scopeMenuItemCount,
                                    children: String(entry.count)
                                }), scopeFilter === entry.key ? (0, react_jsx_runtime.jsx)("span", {
                                    className: c.scopeMenuItemCheck,
                                    children: hostIcon(primitiveIcon("IconCheckOutlineRegular"), 14, ICON_PATHS.check)
                                }) : null]
                        }, entry.key))
                    }) : null]
            });
            const mainColumnBody = (0, react_jsx_runtime.jsx)("div", {
                className: c.mainScroll,
                children: listState.status === "loading" ? (0, react_jsx_runtime.jsx)("p", {
                    className: c.status,
                    children: t("loading")
                }) : listState.status === "error" ? (0, react_jsx_runtime.jsxs)("div", {
                    className: c.failure,
                    children: [(0, react_jsx_runtime.jsx)("p", {
                            role: "alert",
                            children: t("error")
                        }), (0, react_jsx_runtime.jsx)("button", {
                            type: "button",
                            onClick: refresh,
                            children: t("retry")
                        })]
                }) : (0, react_jsx_runtime.jsxs)("div", {
                    className: c.catalog,
                    children: [
                        dragActive ? (0, react_jsx_runtime.jsx)("div", {
                            className: c.dropHint,
                            children: t("addDragHint")
                        }) : null,
                        // 「打开目录」等外壳动作的回显（剪贴板写不进去时把路径摊开给用户手抄）。
                        shellNotice !== null ? (0, react_jsx_runtime.jsxs)("div", {
                            className: c.notice,
                            "data-kind": shellNotice.kind === "error" ? "error" : "info",
                            role: shellNotice.kind === "error" ? "alert" : "status",
                            children: [(0, react_jsx_runtime.jsx)("span", {
                                    className: c.noticeText,
                                    children: shellNotice.text
                                }), (0, react_jsx_runtime.jsx)("button", {
                                    type: "button",
                                    className: c.noticeButton,
                                    onClick: () => {
                                        setShellNotice(null);
                                    },
                                    children: t("addDismiss")
                                })]
                        }) : null,
                        (0, react_jsx_runtime.jsxs)("div", {
                            className: c.searchBox,
                            children: [(0, react_jsx_runtime.jsx)("span", {
                                    className: c.searchIcon,
                                    "aria-hidden": "true",
                                    children: (0, react_jsx_runtime.jsx)(primitiveIcon("IconSearchOutlineRegular"), {})
                                }), (0, react_jsx_runtime.jsx)("input", {
                                    type: "search",
                                    className: c.searchField,
                                    value: query,
                                    placeholder: t("search"),
                                    "aria-label": t("search"),
                                    onChange: (event) => {
                                        setQuery(event.currentTarget.value);
                                    }
                                })]
                        }),
                        (0, react_jsx_runtime.jsxs)("div", {
                            className: c.toolRow,
                            children: [(0, react_jsx_runtime.jsxs)("h3", {
                                    children: [t("catalog"), (0, react_jsx_runtime.jsx)("span", {
                                            "data-skill-count": filtered.length,
                                            children: filtered.length
                                        })]
                                }), (0, react_jsx_runtime.jsxs)("span", {
                                    className: c.toolButtons,
                                    children: [(0, react_jsx_runtime.jsx)("button", {
                                            type: "button",
                                            className: c.toolButton,
                                            "aria-label": t("toolbarOpenFolder"),
                                            onClick: openSkillFolder,
                                            children: hostIcon(primitiveIcon("IconFolderOpenOutlineRegular"), 15, ICON_PATHS.folder)
                                        }), (0, react_jsx_runtime.jsx)("button", {
                                            type: "button",
                                            className: c.toolButton,
                                            "data-active": batchMode ? "true" : void 0,
                                            "aria-label": t("migrateButton"),
                                            "aria-pressed": batchMode,
                                            disabled: listState.status !== "ready" || skills.length === 0,
                                            onClick: () => {
                                                if (batchMode)
                                                    exitBatch();
                                                else
                                                    setBatchMode(true);
                                            },
                                            children: hostIcon(primitiveIcon("IconCopyOutlineRegular"), 15, ICON_PATHS.migrate)
                                        }), (0, react_jsx_runtime.jsx)("button", {
                                            type: "button",
                                            className: c.toolButton,
                                            "aria-label": t("toolbarNewGroup"),
                                            disabled: listState.status !== "ready" || skills.length === 0,
                                            onClick: () => openGroupEditor(),
                                            children: hostIcon(primitiveIcon("IconProjectAddOutlineRegular"), 15, ICON_PATHS.group)
                                        }), (0, react_jsx_runtime.jsxs)("span", {
                                            className: c.addMenuWrap,
                                            children: [(0, react_jsx_runtime.jsx)("button", {
                                                    type: "button",
                                                    className: c.toolButton,
                                                    "aria-label": t("addButton"),
                                                    "aria-expanded": addMenuOpen,
                                                    disabled: adding.status === "busy",
                                                    onClick: () => { setAddMenuOpen((value) => !value); },
                                                    children: hostIcon(primitiveIcon("IconPlusOutlineRegular"), 15, ICON_PATHS.plus)
                                                }), addMenuOpen ? (0, react_jsx_runtime.jsxs)("div", {
                                                    className: c.addMenu,
                                                    children: [(0, react_jsx_runtime.jsx)("p", {
                                                            className: c.addMenuTitle,
                                                            children: t("addTarget") + (scopeFilter === "global" ? t("scopeGlobal") : labelOf(scopeFilter))
                                                        }), (0, react_jsx_runtime.jsx)("button", {
                                                            type: "button",
                                                            className: c.addMenuButton,
                                                            onClick: () => { singleFileInput.current?.click(); },
                                                            children: t("addSingle")
                                                        }), (0, react_jsx_runtime.jsx)("button", {
                                                            type: "button",
                                                            className: c.addMenuButton,
                                                            onClick: () => { pickFolderOrZip(); },
                                                            children: t("addFolderZip")
                                                        })]
                                                }) : null]
                                        }), narrowLayout ? null : (0, react_jsx_runtime.jsx)("button", {
                                            type: "button",
                                            className: c.toolButton,
                                            "data-layout-toggle": "true",
                                            "data-active": layoutCompact ? "true" : void 0,
                                            "aria-pressed": layoutCompact,
                                            "aria-label": layoutCompact ? t("layoutToThree") : t("layoutToCompact"),
                                            onClick: toggleLayout,
                                            children: hostIcon(primitiveIcon("IconSettingsOutlineRegular"), 15, ICON_PATHS.layout)
                                        })]
                                }), totalTokens > 0 ? (0, react_jsx_runtime.jsx)("span", {
                                    className: c.tokChip,
                                    title: t("tokenTotalHint"),
                                    children: formatTokens(totalTokens) + " tok"
                                }) : null]
                        }),
                        // ── 简洁模式（Issue #50）────────────────────────────────────────────
                        // 照旧版（v2.1.x）的两条横栏来：工作区是**折叠式下拉表单**（宿主 Menu，超 11 项滚动），
                        // 分组是横排 chip。两者与三栏共用同一份筛选状态，切回三栏不会丢选择。
                        layoutCompact ? (0, react_jsx_runtime.jsx)("div", {
                            className: c.filterBar,
                            children: [compactWorkspacePicker, paneRows.length > 1 ? (0, react_jsx_runtime.jsx)("div", {
                                    className: c.groupBar,
                                    role: "group",
                                    "aria-label": t("paneGroups"),
                                    children: paneRows.map((row) => (0, react_jsx_runtime.jsxs)("button", {
                                        type: "button",
                                        className: c.groupItem,
                                        "data-active": activePaneKey === row.key ? "true" : void 0,
                                        "aria-pressed": activePaneKey === row.key,
                                        title: row.label,
                                        onClick: () => {
                                            selectPaneRow(row);
                                        },
                                        children: [row.label, (0, react_jsx_runtime.jsx)("span", {
                                                className: c.groupItemCount,
                                                children: String(row.count)
                                            })]
                                    }, "grp:" + row.key))
                                }) : null]
                        }) : null,
                        adding.status === "busy" ? (0, react_jsx_runtime.jsx)("p", {
                            className: c.addStatus,
                            children: t("addBusy")
                        }) : null,
                        adding.status === "ok" ? (0, react_jsx_runtime.jsxs)("div", {
                            className: c.notice,
                            "data-kind": "info",
                            role: "status",
                            children: [(0, react_jsx_runtime.jsx)("span", {
                                    className: c.noticeText,
                                    children: adding.message
                                }), (0, react_jsx_runtime.jsx)("button", {
                                    type: "button",
                                    className: c.noticeButton,
                                    onClick: () => {
                                        setAdding({ status: "idle" });
                                    },
                                    children: t("addDismiss")
                                })]
                        }) : null,
                        adding.status === "error" ? (0, react_jsx_runtime.jsxs)("div", {
                            className: c.notice,
                            "data-kind": "error",
                            role: "alert",
                            children: [(0, react_jsx_runtime.jsx)("span", {
                                    className: c.noticeText,
                                    children: adding.message
                                }), (0, react_jsx_runtime.jsx)("button", {
                                    type: "button",
                                    className: c.noticeButton,
                                    onClick: () => {
                                        setAdding({ status: "idle" });
                                    },
                                    children: t("addDismiss")
                                })]
                        }) : null,
                        // 技能列表不再依赖「是否打开了会话」——没有会话时服务端回退全局注册表。
                        // 一个技能都没有时用居中的空态（设计稿文案）；其余空态仍逐条区分原因。
                        skills.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
                            className: c.empty,
                            children: t("emptyList")
                        }) : null,
                        skills.length > 0 && scoped.length === 0 && hiddenPluginCount > 0 ? (0, react_jsx_runtime.jsx)("p", {
                            className: c.status,
                            children: t("pluginSkillsHidden").replace("{count}", String(hiddenPluginCount))
                        }) : null,
                        skills.length > 0 && scoped.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
                            className: c.status,
                            children: t("emptyScope")
                        }) : null,
                        scoped.length > 0 && activeList.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
                            className: c.status,
                            children: t("groupEmpty")
                        }) : null,
                        activeList.length > 0 && filtered.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
                            className: c.status,
                            children: t("emptySearch")
                        }) : null,
                        scopedAll.length > 0 ? (0, react_jsx_runtime.jsxs)("div", {
                            className: c.groupBulkRow,
                            children: [activeSkills.length > 0 && filtered.length > 0 ? (0, react_jsx_runtime.jsx)("button", {
                                    type: "button",
                                    className: c.groupBulkBtn,
                                    disabled: activeCounts.editable === 0 || bulkGroup === bulkKey,
                                    title: activeCounts.editable === 0 ? t("groupBulkBlocked") : undefined,
                                    onClick: applyActiveToggle,
                                    children: (activeCounts.editable > 0 && activeCounts.editableOn === activeCounts.editable ? t("groupBulkOff") : t("groupBulkOn")) + " · " + activeCounts.on + "/" + activeCounts.total
                                }) : null, (0, react_jsx_runtime.jsxs)("label", {
                                    className: c.pluginToggle,
                                    title: t("pluginSkillsToggleHint"),
                                    children: [(0, react_jsx_runtime.jsx)("input", {
                                            type: "checkbox",
                                            checked: showPluginSkills,
                                            onChange: (event) => toggleShowPluginSkills(event.target.checked)
                                        }), (0, react_jsx_runtime.jsx)("span", { children: t("pluginSkillsToggle") })]
                                })]
                        }) : null,
                        filtered.length > 0 ? originSections.map((section) => {
                            const collapsed = collapsedOrigins.has(section.key);
                            return (0, react_jsx_runtime.jsxs)("div", {
                                className: c.originSection,
                                "data-collapsed": collapsed ? "true" : "false",
                                children: [(0, react_jsx_runtime.jsxs)("button", {
                                        type: "button",
                                        className: c.originHead,
                                        "aria-expanded": !collapsed,
                                        onClick: () => toggleOrigin(section.key),
                                        children: [(0, react_jsx_runtime.jsx)("span", { className: c.originChevron, children: collapsed ? "\u25B8" : "\u25BE" }), (0, react_jsx_runtime.jsx)("span", { className: c.originLabel, children: section.label }), (0, react_jsx_runtime.jsx)("span", { className: c.originCount, children: section.skills.length })]
                                    }), collapsed ? null : (0, react_jsx_runtime.jsx)("ul", {
                                        className: c.cards,
                                        children: section.skills.map(renderCard)
                                    })]
                            }, section.key);
                        }) : null,
                        (0, react_jsx_runtime.jsx)("input", {
                            ref: singleFileInput,
                            className: c.fileInput,
                            type: "file",
                            accept: ".md,text/markdown",
                            multiple: true,
                            onChange: pickSingleFiles
                        }), (0, react_jsx_runtime.jsx)("input", {
                            ref: zipFileInput,
                            className: c.fileInput,
                            type: "file",
                            accept: ".zip,application/zip,application/x-zip-compressed",
                            multiple: true,
                            onChange: pickZipFiles
                        }),
                        groupEditor !== null ? (0, react_jsx_runtime.jsx)(GroupDialog, {
                            t,
                            options: wsOptions,
                            groups: groupsList,
                            groupId: groupEditor.groupId,
                            setGroupId: (value, presetName) => {
                                setGroupEditor((prev) => (prev === null ? prev : { ...prev, groupId: value, name: value === null ? "" : presetName, selected: new Set(membersOfGroupById(value, prev.scope)), error: null }));
                            },
                            name: groupEditor.name,
                            setName: (value) => {
                                setGroupEditor((prev) => (prev === null ? prev : { ...prev, name: value, error: null }));
                            },
                            scope: groupEditor.scope,
                            setScope: (value) => {
                                setGroupEditor((prev) => (prev === null ? prev : { ...prev, scope: value, selected: new Set(membersOfGroupById(prev.groupId, value)), error: null }));
                            },
                            skills: groupEditorSkills,
                            selected: groupEditor.selected,
                            toggle: (skillName) => {
                                setGroupEditor((prev) => {
                                    if (prev === null)
                                        return prev;
                                    const next = new Set(prev.selected);
                                    if (next.has(skillName))
                                        next.delete(skillName);
                                    else
                                        next.add(skillName);
                                    return { ...prev, selected: next };
                                });
                            },
                            selectAll: () => {
                                setGroupEditor((prev) => {
                                    if (prev === null)
                                        return prev;
                                    const all = new Set(groupEditorSkills.map((skill) => skill.name));
                                    return { ...prev, selected: prev.selected.size === all.size ? new Set() : all };
                                });
                            },
                            busy: groupEditor.busy,
                            error: groupEditor.error,
                            onSave: applyGroupSave,
                            onDelete: applyGroupDelete,
                            onCancel: () => {
                                setGroupEditor(null);
                            }
                        }) : null,
                        migrator !== null ? (0, react_jsx_runtime.jsx)(MigrateDialog, {
                            t,
                            options: wsOptions,
                            from: migrator.from,
                            setFrom: (value) => {
                                // 换源工作区时清空已选项：选择是按（源作用域, 技能名）算的，
                                // 留着上一份名单会把不属于该作用域的名字发出去。
                                setMigrator((prev) => (prev === null ? prev : { ...prev, from: value, selected: prev.from === value ? prev.selected : new Set(), error: null }));
                            },
                            targets: migrator.targets,
                            toggleTarget: (value) => {
                                setMigrator((prev) => {
                                    if (prev === null)
                                        return prev;
                                    const next = new Set(prev.targets);
                                    if (next.has(value))
                                        next.delete(value);
                                    else
                                        next.add(value);
                                    return { ...prev, targets: next, error: null, ...(next.size > 1 && prev.mode === "move" ? { mode: "copy" } : {}) };
                                });
                            },
                            mode: migrator.mode,
                            setMode: (value) => {
                                setMigrator((prev) => (prev === null ? prev : { ...prev, mode: value }));
                            },
                            skills: migratorSkills,
                            selected: migrator.selected,
                            toggle: (skillName) => {
                                setMigrator((prev) => {
                                    if (prev === null)
                                        return prev;
                                    const next = new Set(prev.selected);
                                    if (next.has(skillName))
                                        next.delete(skillName);
                                    else
                                        next.add(skillName);
                                    return { ...prev, selected: next };
                                });
                            },
                            selectAll: () => {
                                setMigrator((prev) => {
                                    if (prev === null)
                                        return prev;
                                    const all = new Set(migratorSkills.map((skill) => skill.name));
                                    return { ...prev, selected: prev.selected.size === all.size ? new Set() : all };
                                });
                            },
                            busy: migrator.busy,
                            result: migrator.result,
                            error: migrator.error,
                            onConfirm: applyBatchMigrate,
                            onCancel: () => {
                                setMigrator(null);
                            },
                            onClose: () => {
                                setMigrator(null);
                            }
                        }) : null
                    ]
                })
            });
            // ── 左轨：工作区列表 + 跟随选中项滑动的发光竖条 ──────────────────
            // 竖条位置优先用 DOM 实测（见上面的 effect），点选时立即按被点元素校正一次，
            // 这样连续点选不会等一次渲染。
            const railNode = (0, react_jsx_runtime.jsxs)("nav", {
                className: c.rail,
                "aria-label": t("railWorkspaces"),
                children: [(0, react_jsx_runtime.jsx)("div", {
                        className: c.railHead,
                        children: t("railWorkspaces")
                    }), (0, react_jsx_runtime.jsxs)("div", {
                        className: c.railList,
                        ref: railListRef,
                        children: [(0, react_jsx_runtime.jsx)("i", {
                                className: c.railBar,
                                "aria-hidden": "true",
                                style: { transform: "translateY(" + railBarY + "px)" }
                            }), ...railEntries.map((entry) => {
                                const canDropHere = entry.key !== scopeFilter;
                                const railDropId = "rail:" + entry.key;
                                return (0, react_jsx_runtime.jsxs)("button", {
                                    type: "button",
                                    className: c.railItem,
                                    "data-active": scopeFilter === entry.key ? "true" : void 0,
                                    "data-drop-hover": canDropHere && dropTarget === railDropId ? "true" : void 0,
                                    "aria-pressed": scopeFilter === entry.key,
                                    title: entry.label,
                                    onDragOver: (event) => {
                                        if (!canDropHere || activeDragNames() === null)
                                            return;
                                        event.preventDefault();
                                        if (dropTarget !== railDropId)
                                            setDropTarget(railDropId);
                                    },
                                    onDragLeave: () => {
                                        if (dropTarget === railDropId)
                                            setDropTarget(null);
                                    },
                                    onDrop: (event) => {
                                        if (!canDropHere)
                                            return;
                                        const names = parseDraggedNames(event?.dataTransfer);
                                        draggingRef.current = null;
                                        setDraggingSkills(null);
                                        setDropTarget(null);
                                        setDragActive(false);
                                        if (names.length === 0)
                                            return;
                                        event?.preventDefault?.();
                                        event?.stopPropagation?.();
                                        moveSkillsToWorkspace(entry.key, names, false);
                                    },
                                    onClick: (event) => {
                                        const node = event.currentTarget;
                                        if (node !== null && typeof node.offsetTop === "number")
                                            setRailBarY(node.offsetTop + ((node.offsetHeight || 34) - 18) / 2);
                                        setScopeFilter(entry.key);
                                    },
                                    children: [(0, react_jsx_runtime.jsx)("span", {
                                            className: c.railItemName,
                                            children: entry.label
                                        }), (0, react_jsx_runtime.jsx)("small", {
                                            className: c.railItemCount,
                                            children: String(entry.count)
                                        })]
                                }, entry.key);
                            })]
                    })]
            });
            // ── 中栏：分组 + 来源（合并成一列）──────────────────────────────
            const paneNode = (0, react_jsx_runtime.jsxs)("aside", {
                className: c.pane,
                "aria-label": t("paneGroups"),
                children: [(0, react_jsx_runtime.jsx)("div", {
                        className: c.paneHead,
                        children: (0, react_jsx_runtime.jsx)("h3", {
                            className: c.paneTitle,
                            title: countOfScope(scopeFilter),
                            children: countOfScope(scopeFilter)
                        })
                    }), (0, react_jsx_runtime.jsx)("div", {
                        className: c.paneList,
                        children: paneRows.map((row) => {
                            const group = row.group;
                            const groupDropId = group !== undefined ? "group:" + group.id : null;
                            const gCounts = group !== undefined ? groupCount(group) : null;
                            const groupOn = gCounts !== null && gCounts.editable > 0 && gCounts.editableOn === gCounts.editable;
                            return (0, react_jsx_runtime.jsxs)("div", {
                                className: c.paneRow,
                                "data-drop-hover": groupDropId !== null && dropTarget === groupDropId ? "true" : void 0,
                                onDragOver: (event) => {
                                    if (groupDropId === null || activeDragNames() === null)
                                        return;
                                    event.preventDefault();
                                    if (dropTarget !== groupDropId)
                                        setDropTarget(groupDropId);
                                },
                                onDragLeave: () => {
                                    if (groupDropId !== null && dropTarget === groupDropId)
                                        setDropTarget(null);
                                },
                                onDrop: (event) => {
                                    if (group === undefined)
                                        return;
                                    const names = parseDraggedNames(event?.dataTransfer);
                                    draggingRef.current = null;
                                    setDraggingSkills(null);
                                    setDropTarget(null);
                                    setDragActive(false);
                                    if (names.length === 0)
                                        return;
                                    event?.preventDefault?.();
                                    event?.stopPropagation?.();
                                    saveGroupMembership(group, names, true, false);
                                },
                                children: [(0, react_jsx_runtime.jsxs)("button", {
                                        type: "button",
                                        className: c.paneItem,
                                        "data-active": activePaneKey === row.key ? "true" : void 0,
                                        "aria-pressed": activePaneKey === row.key,
                                        onClick: () => {
                                            selectPaneRow(row);
                                        },
                                        children: [(0, react_jsx_runtime.jsx)("span", {
                                                className: c.paneItemName,
                                                children: row.label
                                            }), (0, react_jsx_runtime.jsx)("span", {
                                                className: c.paneItemCount,
                                                children: String(row.count)
                                            })]
                                    }), group !== undefined && gCounts !== null ? (0, react_jsx_runtime.jsx)("button", {
                                        type: "button",
                                        className: c.paneGroupToggle,
                                        "data-on": groupOn ? "true" : void 0,
                                        title: t("paneToggleGroup").replace("{name}", group.name),
                                        "aria-label": t("paneToggleGroup").replace("{name}", group.name),
                                        disabled: gCounts.editable === 0 || bulkGroup === "pane:" + group.id,
                                        onClick: (event) => {
                                            event?.stopPropagation?.();
                                            applyBulkToggle(membersOfGroup(group), "pane:" + group.id);
                                        },
                                        children: gCounts.on + "/" + gCounts.total
                                    }) : null, group !== undefined ? (0, react_jsx_runtime.jsx)("button", {
                                        type: "button",
                                        className: c.paneGroupEdit,
                                        title: t("paneEditGroup"),
                                        "aria-label": t("paneEditGroup") + " " + group.name,
                                        onClick: (event) => {
                                            event?.stopPropagation?.();
                                            openGroupEditor(group.id, scopeFilter);
                                        },
                                        children: "✎"
                                    }) : null]
                            }, row.kind + "\u0000" + row.key);
                        })
                    }), (0, react_jsx_runtime.jsx)("button", {
                        type: "button",
                        className: c.paneNew,
                        onClick: () => {
                            openGroupEditor(null, scopeFilter);
                        },
                        children: ["＋ ", t("groupNew")]
                    })]
            });
            // ── 主区：滚动区 + 底部居中批量栏 + 顶部居中 Toast ─────────────────
            const batchBar = (0, react_jsx_runtime.jsxs)("div", {
                className: c.batchBar,
                role: "region",
                "aria-label": t("batchSelected").replace("{count}", String(selected.size)),
                children: [(0, react_jsx_runtime.jsx)("span", {
                        className: c.batchCount,
                        children: t("batchSelected").replace("{count}", String(selected.size))
                    }), (0, react_jsx_runtime.jsx)(primitives.Menu, {
                        open: batchGroupOpen,
                        onClose: () => {
                            setBatchGroupOpen(false);
                        },
                        items: batchGroupMenuItems,
                        onSelect: (key) => {
                            setBatchGroupOpen(false);
                            if (key === BATCH_GROUP_NEW) {
                                const carry = new Set(selected);
                                exitBatch();
                                openGroupEditor(null, scopeFilter, carry);
                                return;
                            }
                            if (typeof key === "string" && key.startsWith("add:")) {
                                const g = scopeGroupRows.find((item) => item.id === key.slice(4));
                                saveGroupMembership(g, [...selected], true, true);
                                return;
                            }
                            if (typeof key === "string" && key.startsWith("rm:")) {
                                const g = scopeGroupRows.find((item) => item.id === key.slice(3));
                                saveGroupMembership(g, [...selected], false, true);
                            }
                        },
                        align: "end",
                        portal: true,
                        anchor: (0, react_jsx_runtime.jsx)("button", {
                            type: "button",
                            className: c.batchBtn,
                            "aria-haspopup": "menu",
                            "aria-expanded": batchGroupOpen,
                            disabled: selected.size === 0,
                            onClick: () => {
                                setBatchGroupOpen((value) => !value);
                            },
                            children: t("batchGroupTo")
                        })
                    }), (0, react_jsx_runtime.jsx)(primitives.Menu, {
                        open: batchMenuOpen,
                        onClose: () => {
                            setBatchMenuOpen(false);
                        },
                        items: [...targetWorkspaces, { id: BATCH_ADVANCED, label: t("batchAdvanced") }],
                        onSelect: (key) => {
                            setBatchMenuOpen(false);
                            if (key === BATCH_ADVANCED) {
                                const carry = new Set(selected);
                                exitBatch();
                                openMigrator({ from: scopeFilter, selected: carry });
                                return;
                            }
                            runQuickMigrate(key);
                        },
                        align: "end",
                        portal: true,
                        anchor: (0, react_jsx_runtime.jsx)("button", {
                            type: "button",
                            className: c.batchBtn + " " + c.batchGo,
                            "aria-haspopup": "menu",
                            "aria-expanded": batchMenuOpen,
                            disabled: selected.size === 0,
                            onClick: () => {
                                setBatchMenuOpen((value) => !value);
                            },
                            children: t("batchMigrateTo")
                        })
                    }), (0, react_jsx_runtime.jsx)("button", {
                        type: "button",
                        className: c.batchBtn,
                        onClick: exitBatch,
                        children: t("migrateCancel")
                    })]
            });
            const toastNode = (0, react_jsx_runtime.jsxs)("div", {
                className: c.toast,
                "data-show": toast !== null ? "true" : "false",
                role: "status",
                "aria-live": "polite",
                children: [toast !== null ? (0, react_jsx_runtime.jsx)("span", {
                        className: c.toastText,
                        children: toast.text
                    }) : null, toast !== null && toast.action !== null && toast.action !== undefined ? (0, react_jsx_runtime.jsx)("button", {
                        type: "button",
                        className: c.toastAction,
                        onClick: () => {
                            const action = toast.action;
                            dismissToast();
                            if (action !== null && action !== undefined)
                                action.run();
                        },
                        children: toast.action.label
                    }) : null]
            });
            return (0, react_jsx_runtime.jsx)("div", {
                className: c.section,
                ref: sectionRef,
                "aria-busy": listState.status === "loading",
                "data-batch": batchMode ? "true" : void 0,
                "data-dragging": dragActive ? "true" : void 0,
                "data-layout": layoutCompact ? "compact" : "three",
                // 窄屏（Issue #71）：布局是被可用宽度强制切过去的，不是在工具栏里选的。
                "data-layout-forced": narrowLayout && !layoutPreferredCompact ? "true" : void 0,
                onDragOver: onDragOver,
                onDragLeave: onDragLeave,
                onDrop: onDrop,
                children: [layoutCompact ? null : railNode, layoutCompact ? null : paneNode, (0, react_jsx_runtime.jsxs)("div", {
                        className: c.mainCol,
                        children: [mainColumnBody, batchBar, toastNode]
                    })]
            });
        }
        // ── MCP 面板：字典 / 样式 / 表单 / 卡片 ────────────────────────────
        const MCP_NS = "settings.mcp";
        const mcpZh = {
            nav: "MCP",
            back: "返回会话",
            title: "MCP 服务器",
            subtitle: "profile 的 cordis.patch.yml 里每一条 MCP 服务器都能在这里启停、编辑和删除。常规项用表单，手写或尚未做成表单的字段用「原文」。保存后由 DSH HMR 热加载。",
            docButton: "注册机制",
            docTitle: "DSH 的 MCP 注册机制",
            docLead: "DSH 的 MCP 能力来自官方插件 @deepseek-ai/dsh-mcp-client：它读的不是单独的 MCP 配置文件，而是所在 profile 的 cordis.patch.yml 里的一条 loader entry ——",
            docWhere: "本面板接管文件里所有 @deepseek-ai/dsh-mcp-client 行，不再区分受管块内外。表单改常规配置，没做成表单的字段（例如 maxInstructionBytes）会保留；「原文」按字节改这一条的 YAML。不属于 MCP 的行仍然原样保留。保存即写文件，DSH 的 loader 监听到变化后热加载，不需要重启。",
            docTools: "注册成功后，工具在模型侧叫 mcp__<serverName>__<原工具名>；serverName 只能 1-32 位字母、数字、下划线或连字符。",
            docEnv: "环境变量：DSH 的配置层没有 ${VAR} 字符串插值，唯一的机制是 YAML 的 !!js 表达式（宿主装载时求值）。所以这里直接写 ${NAME} 就行，保存时自动格式化成 !!js 模板：",
            docEnvCode: "Authorization=Bearer ${MCP_TOKEN}\n        ↓ 保存后写入 cordis.patch.yml\nAuthorization: !!js '`Bearer ${process.env.MCP_TOKEN}`'",
            docEnvNote: "变量来自 DSH 进程自己的环境：放 ~/.dsh/.env（桌面端读这一份）或启动环境里都行，改完要重启 DSH。stdio 子进程不会继承名字带 KEY / PASSWORD / SECRET / TOKEN 的环境变量，所以要显式写进 env。",
            docSecret: "env / headers 的值只写不读：页面与 RPC 都只回传键名，编辑时对应键留空即保持原值；也可以用 !!js 前缀直接写任意 JS 表达式。",
            docCode: "- id: panel-mcp-github\n  name: '@deepseek-ai/dsh-mcp-client'\n  config:\n    serverName: github\n    transport: stdio\n    command: npx\n    args: ['-y', '@modelcontextprotocol/server-github']\n    env:\n      GITHUB_TOKEN: !!js '`${process.env.GITHUB_TOKEN}`'",
            add: "+ 添加服务器",
            searchPlaceholder: "搜索服务器名 / 地址 / 命令",
            noMatch: "没有匹配的 MCP 服务器。",
            filteredCount: "筛出 {visible}/{total}",
            refresh: "刷新",
            empty: "还没有 MCP 服务器。",
            loading: "正在读取 MCP 服务器…",
            loadError: "暂时无法读取 MCP 服务器。",
            retry: "重试",
            newTitle: "添加 MCP 服务器",
            editTitle: "编辑 MCP 服务器",
            save: "保存",
            cancel: "取消",
            close: "关闭",
            test: "测试连接",
            testing: "测试中…",
            testOk: "连接成功，发现 {count} 个工具：",
            testFailed: "连接失败：",
            // 单卡兜底（2.3.11）：一张卡片渲染出错时换成的可读错误卡。
            cardErrorBadge: "渲染失败",
            cardErrorName: "（未命名服务器）",
            cardErrorTitle: "这一项的数据异常，已跳过渲染：",
            cardErrorHint: "面板其余部分仍可用。请用「原文编辑」检查这一行的字段，或把插件重挂一次；方便的话把这个提示反馈给作者。",
            enable: "启用",
            disable: "停用",
            stateEnabled: "已启用",
            railWorkspaces: "工作区",
            mcpScopeGlobal: "全局（档案）",
            stateDisabled: "已停用",
            delete: "删除",
            confirmDelete: "确认删除？",
            rawEdit: "原文",
            rawEditTitle: "编辑原文",
            rawEditHint: "按字节编辑这一条的 YAML。适合手写内容，或面板表单还没覆盖的字段（例如 maxInstructionBytes）。",
            rawEditLoading: "正在读取原文…",
            rawEditLead: "只替换这一条，文件其余字节不动。name 必须仍是 @deepseek-ai/dsh-mcp-client，并保留 id 与 serverName。",
            disabledExprBadge: "由表达式控制",
            disabledExprHint: "这一行的 disabled 是 !!js 表达式，由宿主求值；面板不能直接开关，请用「原文」修改。",
            patchBroken: "cordis.patch.yml 不可用：",
            reconciled: "已写入，等待 HMR 生效…",
            reconcileTimeout: "配置已写入，但 HMR 确认超时，请稍后刷新。",
            fieldServerName: "名称",
            nameHint: "只能包含字母、数字、下划线或连字符，1-32 位（不支持空格、点、中文）",
            nameRequired: "请填写名称",
            fieldTransport: "调用方式",
            transportStdio: "STDIO",
            transportHttp: "HTTP",
            fieldCommand: "命令",
            fieldArgs: "参数（每行一个）",
            fieldEnv: "环境变量（每行 键=值；已配置的键留空保持不变）",
            fieldCwd: "工作目录（留空使用默认）",
            fieldUrl: "服务器地址",
            fieldHeaders: "请求头（每行 键=值；已配置的键留空保持不变）",
            phCommand: "npx",
            phArgs: "-y\n@modelcontextprotocol/server-github",
            phEnv: "GITHUB_TOKEN=${GITHUB_TOKEN}",
            phCwd: "C:/projects/my-mcp-server",
            phUrl: "https://example.com/mcp",
            phHeaders: "Authorization=Bearer ${MCP_TOKEN}",
            hintJs: "支持两种模板：${NAME} 读取环境变量（保存为 !!js）；${credential:REF} 从 DSH 凭据表读取（配合「展开凭据模板」）；!!js 前缀按原样透传",
            fieldTimeout: "单次调用超时",
            fieldFailOnStartup: "启动失败时报错",
            fieldExpandTemplates: "展开凭据模板",
            hintExpandTemplates: "开启后支持在 URL、请求头、命令、参数或环境变量中展开 ${credential:REF}，并在保存时自动补全 inject: [credentials]",
            fieldReconnect: "自动重连",
            fieldInitialDelay: "首次重连延迟",
            fieldMaxDelay: "最大重连延迟",
            fieldMaxAttempts: "最大重连次数",
            configuredKeys: "已配置的密钥：",
            deleteSecret: "删除",
            stateActive: "运行中",
            stateLoading: "加载中",
            statePending: "等待中",
            stateFailed: "启动失败",
            stateStopped: "已停用",
            stateUnknown: "未知",
            toolCount: "{count} 个工具",
            advanced: "高级设置",
            currentVersion: "dsh-skill-mcp-panel",
            checkUpdateAvailable: "发现新版本 v",
            checkUpdateCurrent: "（当前 v",
            checkUpdateHint: "）。可点击右上角按钮直接原地更新，或在命令行运行 dsh-panel update",
            // #46：受管块里的外来行可见化（面板永不改写它们，但必须让用户看见）
            foreignOthers: "受管块内还有 {count} 条不属于面板的行（{list}），面板不会改动它们。",
            foreignMine: "另有 {count} 条面板行被放在外来 insert 列表里（{list}），面板暂不管理它们。",
            foreignEvacuate: "移出受管块",
            foreignEvacuating: "正在移出…",
            foreignEvacuated: "已把 {count} 条外来行移到受管块外。",
            foreignEvacuateNone: "块内已经没有外来行了。",
            foreignEvacuateFailed: "移出失败：",
            foreignDoc: "查看机制",
            foreignDocTitle: "受管块与「外来行」",
            foreignDocWhat: "面板在 profile 的 cordis.patch.yml 里用两行注释（begin / end）圈出自己管理的一段，每次保存只重写这一段，圈外的内容一个字节都不碰。",
            foreignDocWhy: "圈里可能出现不属于面板的行：DSH 自己的配置编辑器给某个插件首次写配置时会往文件末尾追加一行，而 end 注释正好是最后一行，序列化后这行就落在圈内了（例如「权限预设」的 permission 行）。",
            foreignDocEffect: "留在块里没有任何功能影响：DSH 是整份列表读取的，行的位置不改变语义。「移出受管块」只是把那条行原样搬到 begin 之前，内容一字不改，权限预设照常生效。",
            foreignDocKeep: "这些行不是 MCP 服务器，面板不会改写它们：改写别人的行曾经把 dsh-market 的更新整体回滚（Issue #46）。每一条 @deepseek-ai/dsh-mcp-client 则可以直接在卡片上启停、编辑、删除或改原文，不论它写在受管块里还是外面。",
            oauthLogin: "OAuth 登录",
            oauthRelogin: "重新登录",
            oauthWorking: "登录中…",
            oauthDisconnect: "断开登录",
            oauthHint: "通过 OAuth 2.0 获取令牌写进这一行的 Authorization 头（在添加或点开设置「⚙」时完成授权或重连）",
            oauthDone: "登录成功，令牌已写入并热加载。",
            oauthDisconnected: "已断开：Authorization 头与本地令牌都清掉了。",
            oauthFailed: "登录失败。",
            oauthTimeout: "等待授权超时，请重新点一次登录。",
            saveAndOAuth: "保存并 OAuth 登录",
            saveOnly: "仅保存",
            oauthAuthNow: "立即登录",
            oauthReauthNow: "重新认证",
            oauthRefreshNow: "刷新令牌",
            oauthStatusReady: "已认证",
            oauthStatusExpired: "令牌已过期",
            oauthStatusNeedsReauth: "需重新认证",
            oauthStatusPending: "请在浏览器中完成授权…",
            oauthStatusExpiresAt: " · 有效期至 ",
            oauthRefreshOk: "令牌已刷新并热更新。",
            oauthRefreshFailed: "刷新失败：",
            oauthNeedUrl: "请先填写服务器 URL 再进行 OAuth 登录",
            fieldAuth: "认证",
            authNone: "无",
            authBearer: "Bearer 令牌",
            authOAuth: "OAuth 登录",
            authNoneHint: "不额外加认证头（有些内网服务器不需要）。",
            authBearerHint: "会写成 Authorization=Bearer <令牌>；支持 ${ENV} 或凭据模板 ${credential:REF}。",
            authOauthHint: "保存配置时直接拉起 OAuth 2.0 授权并写入 Authorization；之后点卡片右上角设置（⚙）即可重新认证、刷新令牌或断开。",
            phAuthToken: "eyJ… 或 ${MCP_TOKEN}",
            authBadge: "已认证",
            authBadgeHint: "这一行已经带 Authorization 头（OAuth 登录或手工填写）。",
            toolsButton: "工具",
            toolsButtonHint: "按工具名禁用（被禁的工具会从模型工具表里消失，真正省上下文）",
            toolsScopeHint: "这份禁用列表对所有会话生效；取消勾选 = 禁用该工具。",
            toolScopeLabel: "生效范围：",
            toolScopeGlobal: "全局默认",
            toolScopeWorkspace: "当前工作区",
            toolScopeSession: "当前会话",
            toolScopeSubagent: "子代理例外",
            toolScopeNoWorkspace: "暂无可选工作区路径",
            toolScopeNoSession: "未检测到活跃会话（先进入对话后可按会话临时覆盖）",
            toolScopeGlobalHint: "对本 Profile 下所有会话与代理生效；取消勾选 = 禁用该工具。",
            toolScopeWorkspaceHint: "仅当会话处于工作区 {ws} 时追加禁用未勾选的工具。",
            toolScopeSessionHint: "仅在当前会话内临时覆盖（支持临时放行全局禁用的工具），会话关闭后自动清理，不落盘。",
            toolScopeSubagentHint: "单独配置子代理/协作团队可见的工具：勾选 = 允许子代理使用（可放行全局禁用的工具），取消 = 禁止。",
            toolScopeInheritedBlocked: "（全局已禁用）",
            groupAll: "全部",
            groupUngrouped: "未分组",
            groupNew: "+ 分组",
            groupEdit: "编辑分组",
            groupEnableAll: "整组启用",
            groupDisableAll: "整组停用",
            groupName: "分组名称",
            groupNameRequired: "请填写分组名称",
            groupServers: "包含服务器",
            groupDelete: "删除分组",
            groupEmpty: "该分组下暂无 MCP 服务器。",
            groupBulkResult: "分组操作完成：已更新 {done} 台服务器",
            toolsSearchPlaceholder: "搜索工具名或描述",
            toolsSelectAll: "全选",
            toolsSelectNone: "全不选",
            toolsNoMatch: "没有匹配的工具。",
            toolsFilteredCount: "筛出 {visible}/{total}",
            toolsLoading: "正在读取工具…",
            toolsEmpty: "这台服务器还没注册任何工具（可能没连上）。",
            toolsDisconnected: "服务器未连接：先启用它，工具清单才有内容。",
            toolsOfflineList: "服务器当前未运行：这份清单来自上次已知的结果，可能已过期。",
            toolsDisabledCount: "已禁用 {count} 个",
            toolsVisibilitySummary: "对模型可见 {visible}/{total} · 已过滤 {disabled} 个",
            toolsVisibilityStopped: "服务器已停用（对模型可见 0/{total} · 预设过滤 {disabled} 个）",
            toolsCardVisible: "对模型可见 {visible}/{total}（已过滤 {filtered}）",
            toolsCardFilteredOnly: "已过滤 {filtered} 个",
            toolsSave: "保存禁用列表",
            toolsSaving: "保存中…",
            toolsSaved: "已保存：{count} 个工具被禁用，当前 {applied} 个会话已生效。",
            authStdioHint: "stdio 服务器的令牌没有单独的认证项——写在这里的环境变量里（例如 GITHUB_TOKEN=…），stdio 子进程只继承这些显式变量。",
            foreignMore: "等"
        };
        const mcpEn = {
            nav: "MCP",
            back: "Back to session",
            title: "MCP Servers",
            subtitle: "Every MCP server in the profile's cordis.patch.yml can be toggled, edited and deleted here. Use the form for ordinary fields, and Raw for hand-written text or fields the form does not model yet. Saves are hot-applied by DSH HMR.",
            docButton: "How it works",
            docTitle: "How DSH registers MCP servers",
            docLead: "DSH's MCP support comes from the official @deepseek-ai/dsh-mcp-client plugin: it reads no separate MCP config file, only a loader entry inside the profile's cordis.patch.yml —",
            docWhere: "This panel owns every @deepseek-ai/dsh-mcp-client row, inside or outside the managed block. The form edits ordinary fields and keeps unmodeled ones (such as maxInstructionBytes); Raw replaces that one entry's YAML byte for byte. Rows that are not MCP servers stay untouched. Saving writes the file and the DSH loader hot-reloads it — no restart.",
            docTools: "Once registered, the model sees tools as mcp__<serverName>__<original name>; serverName allows 1-32 letters, digits, underscore or hyphen.",
            docEnv: "Environment variables: the DSH config layer has no ${VAR} string interpolation — the only mechanism is a YAML !!js expression, evaluated by the host at load time. So just write ${NAME} here and the panel formats it for you:",
            docEnvCode: "Authorization=Bearer ${MCP_TOKEN}\n        ↓ written to cordis.patch.yml on save\nAuthorization: !!js '`Bearer ${process.env.MCP_TOKEN}`'",
            docEnvNote: "The value comes from the DSH process environment: ~/.dsh/.env (what the desktop app reads) or the launching environment; restart DSH after changing it. Stdio children never inherit names containing KEY / PASSWORD / SECRET / TOKEN, so pass those explicitly in env.",
            docSecret: "env / headers values are write-only: the UI and RPC only return key names, and leaving a configured key blank keeps its current value. A !!js prefix passes a raw JS expression.",
            docCode: "- id: panel-mcp-github\n  name: '@deepseek-ai/dsh-mcp-client'\n  config:\n    serverName: github\n    transport: stdio\n    command: npx\n    args: ['-y', '@modelcontextprotocol/server-github']\n    env:\n      GITHUB_TOKEN: !!js '`${process.env.GITHUB_TOKEN}`'",
            add: "+ Add server",
            searchPlaceholder: "Search server name, URL or command",
            noMatch: "No matching MCP servers.",
            filteredCount: "{visible}/{total} shown",
            refresh: "Refresh",
            empty: "No MCP servers yet.",
            loading: "Loading MCP servers…",
            loadError: "Unable to load MCP servers.",
            retry: "Retry",
            newTitle: "Add MCP server",
            editTitle: "Edit MCP server",
            save: "Save",
            cancel: "Cancel",
            close: "Close",
            test: "Test connection",
            testing: "Testing…",
            testOk: "Connected, {count} tools found:",
            testFailed: "Connection failed:",
            // 单卡兜底（2.3.11）：一张卡片渲染出错时换成的可读错误卡。
            cardErrorBadge: "render failed",
            cardErrorName: "(unnamed server)",
            cardErrorTitle: "This entry's data is malformed, rendering was skipped:",
            cardErrorHint: "The rest of the panel still works. Check this row's fields via Raw edit, or remount the plugin; please report this message to the author.",
            enable: "Enable",
            disable: "Disable",
            stateEnabled: "Enabled",
            railWorkspaces: "Workspaces",
            mcpScopeGlobal: "Global (profile)",
            stateDisabled: "Disabled",
            delete: "Delete",
            confirmDelete: "Confirm delete?",
            rawEdit: "Raw",
            rawEditTitle: "Edit raw YAML",
            rawEditHint: "Edit this entry's YAML byte for byte. Use it for hand-written text, or for schema fields the form does not model yet (for example maxInstructionBytes).",
            rawEditLoading: "Loading YAML…",
            rawEditLead: "Only this entry is replaced; every other byte in the file stays put. name must remain @deepseek-ai/dsh-mcp-client, and id plus serverName must stay valid.",
            disabledExprBadge: "By expression",
            disabledExprHint: "This row's disabled is a !!js expression evaluated by the host; the panel cannot toggle it. Edit it with Raw.",
            patchBroken: "cordis.patch.yml is unavailable:",
            reconciled: "Written, waiting for HMR…",
            reconcileTimeout: "Config written, but HMR confirmation timed out. Refresh later.",
            fieldServerName: "serverName",
            nameHint: "Letters, digits, underscore or hyphen only, 1-32 characters (no spaces, dots or non-ASCII)",
            nameRequired: "Name is required",
            fieldTransport: "Transport",
            transportStdio: "STDIO",
            transportHttp: "HTTP",
            fieldCommand: "command",
            fieldArgs: "args (one per line)",
            fieldEnv: "env (KEY=VALUE per line; leave configured keys blank to keep them)",
            fieldCwd: "cwd (blank for default)",
            fieldUrl: "url",
            fieldHeaders: "headers (KEY=VALUE per line; leave configured keys blank to keep them)",
            phCommand: "npx",
            phArgs: "-y\n@modelcontextprotocol/server-github",
            phEnv: "GITHUB_TOKEN=${GITHUB_TOKEN}",
            phCwd: "C:/projects/my-mcp-server",
            phUrl: "https://example.com/mcp",
            phHeaders: "Authorization=Bearer ${MCP_TOKEN}",
            hintJs: "Templates: ${NAME} reads an env var (saved as !!js); ${credential:REF} reads DSH credentials (with Expand credential templates enabled). A !!js prefix passes a raw JS expression.",
            fieldTimeout: "toolCallTimeoutMs",
            fieldFailOnStartup: "Fail on startup error",
            fieldExpandTemplates: "Expand credential templates",
            hintExpandTemplates: "Resolves ${credential:REF} in URL, headers, command, args or env, saving expandTemplates: true and inject: [credentials]",
            fieldReconnect: "Auto reconnect",
            fieldInitialDelay: "initialDelayMs",
            fieldMaxDelay: "maxDelayMs",
            fieldMaxAttempts: "maxAttempts",
            configuredKeys: "Configured secrets:",
            deleteSecret: "Delete",
            stateActive: "Running",
            stateLoading: "Loading",
            statePending: "Pending",
            stateFailed: "Startup failed",
            stateStopped: "Stopped",
            stateUnknown: "Unknown",
            toolCount: "{count} tools",
            advanced: "Advanced",
            currentVersion: "dsh-skill-mcp-panel",
            checkUpdateAvailable: "Update available: v",
            checkUpdateCurrent: " (current v",
            checkUpdateHint: "). Click the top-right update button to upgrade in place, or run dsh-panel update",
            // #46: surface foreign rows inside the managed block (never rewritten by the panel)
            foreignOthers: "{count} row(s) in the managed block do not belong to this panel ({list}); the panel leaves them untouched.",
            foreignMine: "{count} panel row(s) sit inside a foreign insert list ({list}); the panel does not manage them yet.",
            foreignEvacuate: "Move out of block",
            foreignEvacuating: "Moving…",
            foreignEvacuated: "Moved {count} foreign row(s) out of the managed block.",
            foreignEvacuateNone: "No foreign rows are left in the block.",
            foreignEvacuateFailed: "Move failed: ",
            foreignDoc: "How this works",
            foreignDocTitle: "The managed block and “foreign rows”",
            foreignDocWhat: "The panel fences off its own slice of the profile's cordis.patch.yml with two comment lines (begin / end) and only ever rewrites that slice; bytes outside the fence are never touched.",
            foreignDocWhy: "Rows that are not the panel's can end up inside the fence: when DSH's own config editor writes an entry for a plugin the first time, it appends to the YAML list, and since our end comment is the last line of the file the appended row is serialized before it (that is where the permission-presets row came from).",
            foreignDocEffect: "Leaving it inside changes nothing: DSH reads the whole list, so a row's position does not alter its meaning. “Move out of block” only copies that row verbatim to just before the begin marker — the permission presets keep working.",
            foreignDocKeep: "These rows are not MCP servers, so the panel does not rewrite them: doing that once rolled back every dsh-market update (issue #46). Every @deepseek-ai/dsh-mcp-client row can be toggled, edited, deleted or raw-edited from its card, whether it lives inside the managed block or not.",
            oauthLogin: "OAuth sign-in",
            oauthRelogin: "Sign in again",
            oauthWorking: "Signing in…",
            oauthDisconnect: "Disconnect",
            oauthHint: "Runs OAuth 2.0 and writes the token into this row's Authorization header right during setup or in settings (⚙).",
            oauthDone: "Signed in — the token is written and hot-loaded.",
            oauthDisconnected: "Disconnected: the Authorization header and the local token are gone.",
            oauthFailed: "Sign-in failed.",
            oauthTimeout: "Timed out waiting for authorization — click sign-in again.",
            saveAndOAuth: "Save & OAuth sign-in",
            saveOnly: "Save only",
            oauthAuthNow: "Sign in now",
            oauthReauthNow: "Re-authenticate",
            oauthRefreshNow: "Refresh token",
            oauthStatusReady: "Authenticated",
            oauthStatusExpired: "Token expired",
            oauthStatusNeedsReauth: "Re-auth required",
            oauthStatusPending: "Complete authorization in your browser…",
            oauthStatusExpiresAt: " · Expires ",
            oauthRefreshOk: "Token refreshed and hot-applied.",
            oauthRefreshFailed: "Refresh failed: ",
            oauthNeedUrl: "Enter the server URL before running OAuth sign-in",
            fieldAuth: "Authentication",
            authNone: "None",
            authBearer: "Bearer token",
            authOAuth: "OAuth sign-in",
            authNoneHint: "Adds no auth header (some intranet servers need none).",
            authBearerHint: "Saved as Authorization=Bearer <token>; supports ${ENV} or ${credential:REF}.",
            authOauthHint: "Completes OAuth 2.0 right when saving; open settings (⚙) anytime to re-authenticate, refresh, or disconnect.",
            phAuthToken: "eyJ… or ${MCP_TOKEN}",
            authBadge: "Authenticated",
            authBadgeHint: "This row already carries an Authorization header (OAuth or hand-written).",
            toolsButton: "Tools",
            toolsButtonHint: "Disable tools by name — a disabled tool disappears from the model's tool list and saves context",
            toolsScopeHint: "This list applies to every session; uncheck a tool to disable it.",
            toolScopeLabel: "Scope:",
            toolScopeGlobal: "Global default",
            toolScopeWorkspace: "Workspace",
            toolScopeSession: "Current session",
            toolScopeSubagent: "Subagents",
            toolScopeNoWorkspace: "No workspace path available",
            toolScopeNoSession: "No active session detected (open a chat session to set a temporary override)",
            toolScopeGlobalHint: "Applies to all sessions and agents in this profile; uncheck to disable.",
            toolScopeWorkspaceHint: "Adds extra disables only when the active workspace matches {ws}.",
            toolScopeSessionHint: "Temporary in-memory override for this session (can allow globally disabled tools); cleared when the session closes.",
            toolScopeSubagentHint: "Role override for subagents/teammates: checked = visible to subagents (can override global disables), unchecked = blocked.",
            toolScopeInheritedBlocked: "(disabled globally)",
            groupAll: "All",
            groupUngrouped: "Ungrouped",
            groupNew: "+ Group",
            groupEdit: "Edit group",
            groupEnableAll: "Enable group",
            groupDisableAll: "Disable group",
            groupName: "Group name",
            groupNameRequired: "Group name is required",
            groupServers: "Servers",
            groupDelete: "Delete group",
            groupEmpty: "No MCP servers in this group.",
            groupBulkResult: "Group update finished: {done} server(s) updated",
            toolsSearchPlaceholder: "Search tool name or description",
            toolsSelectAll: "Select all",
            toolsSelectNone: "Clear all",
            toolsNoMatch: "No matching tools.",
            toolsFilteredCount: "{visible}/{total} shown",
            toolsLoading: "Loading tools…",
            toolsEmpty: "This server has no registered tools yet (probably not connected).",
            toolsDisconnected: "Server not connected: enable it first so its tools appear.",
            toolsOfflineList: "The server is not running: this list comes from the last known result and may be stale.",
            toolsDisabledCount: "{count} disabled",
            toolsVisibilitySummary: "Visible to agents: {visible}/{total} · {disabled} filtered out",
            toolsVisibilityStopped: "Server stopped (0/{total} visible · {disabled} filtered out)",
            toolsCardVisible: "{visible}/{total} visible ({filtered} filtered out)",
            toolsCardFilteredOnly: "{filtered} filtered out",
            toolsSave: "Save disabled list",
            toolsSaving: "Saving…",
            toolsSaved: "Saved: {count} tool(s) disabled; applied to {applied} session(s).",
            authStdioHint: "stdio servers have no separate auth field — put the token in the environment above (e.g. GITHUB_TOKEN=…); the child process only inherits what you list here.",
            foreignMore: "…"
        };
        const cssMcpEffects = "@keyframes skvFadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}@keyframes skvFadeOnly{from{opacity:0}to{opacity:1}}.MCP_card{transition:border-color .18s cubic-bezier(.22,.61,.36,1),box-shadow .18s ease}.MCP_card:hover{border-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-shadow-lv1)}.MCP_dot{transition:background-color .2s ease}.MCP_input,.MCP_textarea{transition:border-color .15s ease,box-shadow .15s ease}.MCP_transportBtn{transition:background-color .15s ease,border-color .15s ease,color .15s ease}.MCP_actionBtn,.MCP_dangerBtn,.MCP_iconBtn,.MCP_add,.MCP_advancedToggle{transition:background-color .15s ease,border-color .15s ease,transform .1s ease}.MCP_actionBtn:active:not(:disabled),.MCP_dangerBtn:active:not(:disabled),.MCP_iconBtn:active,.MCP_add:active{transform:scale(.96)}.MCP_actionBtn:focus-visible,.MCP_dangerBtn:focus-visible,.MCP_iconBtn:focus-visible,.MCP_add:focus-visible,.MCP_transportBtn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.MCP_cards{animation:skvFadeOnly .2s ease}.MCP_result{animation:skvFadeIn .18s ease}@media (prefers-reduced-motion: reduce){.MCP_section *{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}}.MCP_doc{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;animation:skvFadeIn .18s ease}.MCP_doc h4{font-size:13px;font-weight:600;line-height:20px;margin:0}.MCP_doc p{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:19px}.MCP_docCode{margin:0;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 10px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-all;overflow-x:auto}";
        const cssMcp = ".MCP_section{position:relative;width:100%;color:var(--dsw-alias-label-primary)}.MCP_section>.SKV_mainScroll{align-items:stretch;gap:14px}.MCP_head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.MCP_head h3{font-size:14px;font-weight:600;line-height:20px;margin:0}.MCP_sub{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:0}.MCP_toolbar{display:flex;align-items:center;gap:8px}.MCP_groupRow{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.MCP_groupChip{font:inherit;font-size:12px;line-height:18px;padding:3px 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:background-color .18s ease,border-color .18s ease,color .18s ease}.MCP_groupChip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.MCP_groupChip[data-active=true]{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent)}.MCP_groupChipCount{font-size:11px;opacity:.75;font-variant-numeric:tabular-nums}.MCP_add{font:inherit;color:var(--dsw-alias-state-business-primary);cursor:pointer;background:0 0;border:1px dashed var(--dsw-alias-border-l1);border-radius:8px;padding:7px 16px;font-size:13px;line-height:20px;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box}.MCP_add:hover{background:var(--dsw-alias-interactive-bg-hover)}.MCP_cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.MCP_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;min-width:0}.MCP_cardTop{display:flex;align-items:center;gap:8px;min-width:0}.MCP_name{font-size:13px;font-weight:600;line-height:20px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.MCP_badges{display:inline-flex;align-items:center;gap:6px;flex:none}.MCP_badge{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);border-radius:5px;padding:1px 6px;font-size:11px;line-height:16px}.MCP_badgeBtn{font:inherit;cursor:pointer;border:1px solid color-mix(in srgb, var(--dsw-alias-state-warning-primary) 45%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-warning-primary) 12%, transparent);color:var(--dsw-alias-state-warning-primary);border-radius:5px;padding:1px 6px;font-size:11px;line-height:16px;transition:background-color .18s ease}.MCP_badgeBtn:hover{background:color-mix(in srgb, var(--dsw-alias-state-warning-primary) 22%, transparent)}.MCP_meta{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}.MCP_dot{width:7px;height:7px;border-radius:999px;background:var(--dsw-alias-label-tertiary);flex:none}.MCP_dot[data-on=true]{background:var(--dsw-alias-state-success-primary)}.MCP_dot[data-err=true]{background:var(--dsw-alias-state-error-primary)}.MCP_actions{display:flex;align-items:center;gap:8px;border-top:1px solid var(--dsw-alias-border-l2);padding-top:8px;flex-wrap:wrap}.MCP_spacer{flex:1}.MCP_form{display:grid;grid-template-columns:1fr 1fr;gap:10px}.MCP_field{display:flex;flex-direction:column;gap:5px}.MCP_field[data-wide=true]{grid-column:1 / -1}.MCP_label{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);margin:0}.MCP_input{box-sizing:border-box;width:100%;height:32px;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:0 8px}.MCP_input:focus-visible,.MCP_textarea:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent);outline:none}.MCP_textarea{box-sizing:border-box;width:100%;min-height:64px;font:inherit;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 8px;resize:vertical}.MCP_transportRow{display:flex;gap:8px}.MCP_transportBtn{font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:4px 14px}.MCP_transportBtn[data-active=true]{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent)}.MCP_secretKeys{display:flex;flex-wrap:wrap;gap:6px}.MCP_key{display:inline-flex;align-items:center;gap:6px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:2px 8px;font-size:11px;line-height:16px}.MCP_key button{font:inherit;color:var(--dsw-alias-state-error-primary);cursor:pointer;background:0 0;border:none;padding:0}.MCP_checkRow{display:flex;align-items:center;gap:8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.MCP_result{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 10px;font-size:12px;line-height:18px;max-height:160px;overflow:auto}.MCP_actionBtn{font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;padding:0 12px;font-size:12px;line-height:26px;height:28px;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;box-sizing:border-box}.MCP_actionBtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid)}.MCP_actionBtn:disabled{cursor:default;opacity:.6}.MCP_dangerBtn{font:inherit;color:var(--dsw-alias-state-error-primary);cursor:pointer;background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;padding:0 12px;font-size:12px;line-height:26px;height:28px;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;box-sizing:border-box}.MCP_dangerBtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid)}.MCP_iconBtn{width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:0;flex:none}.MCP_iconBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.MCP_advancedToggle{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:1px dashed var(--dsw-alias-border-l1);border-radius:8px;padding:6px 12px;font-size:13px;line-height:20px}.MCP_advancedToggle:hover{background:var(--dsw-alias-interactive-bg-hover)}.MCP_result[data-ok=true]{border-color:color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 8%, transparent)}.MCP_result[data-ok=false]{border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)}.MCP_hint{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);margin:0}.MCP_hint[data-error=true]{color:var(--dsw-alias-state-error-primary)}.MCP_authBox{display:flex;flex-direction:column;gap:6px}.MCP_oauthInline{display:flex;flex-direction:column;gap:8px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}.MCP_oauthActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.MCP_toolsPanel{display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--dsw-alias-border-l2);padding-top:8px}.MCP_scopeTabs{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.MCP_scopeTab{font:inherit;font-size:11.5px;line-height:16px;padding:3px 9px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background-color .18s ease,border-color .18s ease,color .18s ease}.MCP_scopeTab[data-active=true]{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent)}.MCP_toolsList{display:flex;flex-direction:column;gap:2px;max-height:260px;overflow-y:auto;scrollbar-width:thin;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:4px 8px}.MCP_toolRow{display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:18px;padding:5px 0;cursor:pointer;min-width:0;border-bottom:1px solid color-mix(in srgb, var(--dsw-alias-border-l2) 45%, transparent)}.MCP_toolRow:last-child{border-bottom:none}.MCP_toolRow input{margin:2px 0 0;accent-color:var(--dsw-alias-state-business-primary);flex:none}.MCP_toolInfo{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}.MCP_toolName{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Consolas,Menlo,monospace;font-size:11.5px}.MCP_toolDesc{font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}.MCP_toolsActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.MCP_rawText{box-sizing:border-box;width:100%;min-height:240px;font-family:ui-monospace,SFMono-Regular,Consolas,Menlo,monospace;font-size:12px;line-height:18px;white-space:pre;tab-size:2}"
            // 窄屏（Issue #71）：手机上 MCP 页的「一行两张卡片」和「两列表单」都只剩 ~200px，
            // 改单列；工具栏允许换行，别把「＋ 添加」挤到屏幕外。
            + "@media (max-width:640px){.MCP_cards{grid-template-columns:minmax(0,1fr)}.MCP_form{grid-template-columns:minmax(0,1fr)}.MCP_toolbar{flex-wrap:wrap}}"
            + cssMcpEffects;
        const mcpTagId = "dsh-skill-mcp-panel/McpSection.module.css";
        if (typeof document !== "undefined") {
            let mcpTag = document.querySelector("style[data-plugin-css=" + JSON.stringify(mcpTagId) + "]");
            if (mcpTag === null) {
                mcpTag = document.createElement("style");
                mcpTag.dataset.plugin = "dsh-skill-mcp-panel";
                mcpTag.dataset.pluginCss = mcpTagId;
                document.head.appendChild(mcpTag);
            }
            mcpTag.textContent = cssMcp;
        }
        const m = {
            section: "MCP_section",
            head: "MCP_head",
            sub: "MCP_sub",
            toolbar: "MCP_toolbar",
            groupRow: "MCP_groupRow",
            groupChip: "MCP_groupChip",
            groupChipCount: "MCP_groupChipCount",
            add: "MCP_add",
            cards: "MCP_cards",
            card: "MCP_card",
            cardTop: "MCP_cardTop",
            name: "MCP_name",
            badges: "MCP_badges",
            badge: "MCP_badge",
            badgeBtn: "MCP_badgeBtn",
            meta: "MCP_meta",
            dot: "MCP_dot",
            actions: "MCP_actions",
            spacer: "MCP_spacer",
            form: "MCP_form",
            field: "MCP_field",
            label: "MCP_label",
            input: "MCP_input",
            textarea: "MCP_textarea",
            rawText: "MCP_textarea MCP_rawText",
            transportRow: "MCP_transportRow",
            transportBtn: "MCP_transportBtn",
            secretKeys: "MCP_secretKeys",
            key: "MCP_key",
            checkRow: "MCP_checkRow",
            result: "MCP_result",
            actionBtn: "MCP_actionBtn",
            dangerBtn: "MCP_dangerBtn",
            iconBtn: "MCP_iconBtn",
            advancedToggle: "MCP_advancedToggle",
            hint: "MCP_hint",
            authBox: "MCP_authBox",
            oauthInline: "MCP_oauthInline",
            oauthActions: "MCP_oauthActions",
            toolsPanel: "MCP_toolsPanel",
            scopeTabs: "MCP_scopeTabs",
            scopeTab: "MCP_scopeTab",
            toolsList: "MCP_toolsList",
            toolRow: "MCP_toolRow",
            toolInfo: "MCP_toolInfo",
            toolName: "MCP_toolName",
            toolDesc: "MCP_toolDesc",
            toolsActions: "MCP_toolsActions",
            doc: "MCP_doc",
            docCode: "MCP_docCode"
        };
        /**
         * 服务名校验规则，必须与 src/mcp/model.ts 的 SERVER_NAME_RE 完全一致：
         * 客户端 bundle 只能 require 外壳种子词，无法 import 宿主侧模块，
         * 所以两边各写一份字面量，由 test-mcp-naming.mjs 交叉校验。
         */
        const MCP_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;
        /** 剥掉宿主 RPC 信封前缀，只留我们自己抛的中文错误。 */
        const cleanMcpError = (error) => String(error?.message ?? error)
            .replace(/^[A-Za-z]+Manager\.[A-Za-z]+ failed: /, "")
            .replace(/^[a-z]+\/[a-z-]+: typert gateway: [^:]+: /, "");
        function mcpParseLines(text) {
            return String(text ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        }
        /**
         * 面板里的写法：值里写 ${NAME} 就是「读环境变量 NAME」。
         *
         * DSH 的 cordis 配置层没有 ${VAR} 字符串插值，唯一的机制是 YAML 的 !!js 表达式，
         * 所以这里把直觉写法格式化成 `!!js` + 反引号模板再落盘；以 "!!js " 开头的值按
         * 进阶写法原样透传。规则必须与 src/mcp/model.ts 的 parseWireScalar 一致：浏览器束
         * 只能 require 外壳种子词，无法 import 宿主模块，所以两边各写一份字面量（测试交叉校验）。
         */
        const MCP_JS_EXPR_PREFIX = "!!js";
        const MCP_ENV_REF_RE = /\$\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}/g;
        function mcpEnvRefs(value) {
            return value.replace(MCP_ENV_REF_RE, (match, name) => "${process.env." + name + "}");
        }
        const MCP_CRED_REF_TEST_RE = /\$\{credential:[A-Za-z_][A-Za-z0-9_]*\}/;
        function mcpWireScalar(text) {
            const raw = String(text ?? "");
            const trimmed = raw.trim();
            if (trimmed === MCP_JS_EXPR_PREFIX || trimmed.startsWith(MCP_JS_EXPR_PREFIX + " ")) {
                const expression = trimmed.slice(MCP_JS_EXPR_PREFIX.length).trim();
                return expression === "" ? raw : { __jsExpr: expression };
            }
            const isBacktickTemplate = trimmed.length > 1 && trimmed.startsWith("`") && trimmed.endsWith("`") && trimmed.includes("${");
            const hasEnvRef = new RegExp(MCP_ENV_REF_RE.source).test(raw) || raw.includes("${process.env.");
            if (!isBacktickTemplate && !hasEnvRef)
                return raw;
            if (trimmed.length > 1 && trimmed.startsWith("`") && trimmed.endsWith("`"))
                return { __jsExpr: mcpEnvRefs(trimmed) };
            return { __jsExpr: "`" + mcpEnvRefs(raw) + "`" };
        }
        function mcpParsePairs(text) {
            const out = {};
            for (const line of mcpParseLines(text)) {
                const index = line.indexOf("=");
                if (index <= 0)
                    continue;
                const key = line.slice(0, index).trim();
                if (key !== "")
                    out[key] = mcpWireScalar(line.slice(index + 1).trim());
            }
            return out;
        }
        /** 参数：每行一个，逐个走 !!js 规则。 */
        function mcpParseScalarLines(text) {
            return mcpParseLines(text).map((line) => mcpWireScalar(line));
        }
        function mcpNumber(value, fallback) {
            const n = parseInt(String(value ?? ""), 10);
            return Number.isFinite(n) && n > 0 ? n : fallback;
        }
        function defaultMcpForm() {
            return {
                serverName: "",
                transport: "stdio",
                command: "",
                argsText: "",
                envText: "",
                cwd: "",
                url: "",
                headersText: "",
                // 认证方式（只有 streamable-http 用）：none / bearer / oauth
                authMode: "none",
                authToken: "",
                timeout: "60000",
                failOnStartup: false,
                expandTemplates: false,
                reconnectEnabled: true,
                initialDelay: "500",
                maxDelay: "30000",
                maxAttempts: "10"
            };
        }
        function formFromServer(server) {
            const form = defaultMcpForm();
            form.serverName = server.serverName ?? "";
            form.transport = server.transport === "streamable-http" ? "streamable-http" : "stdio";
            form.command = server.command ?? "";
            form.argsText = Array.isArray(server.args) ? server.args.join("\n") : "";
            form.cwd = server.cwd ?? "";
            form.url = server.url ?? "";
            form.timeout = String(server.toolCallTimeoutMs ?? 60000);
            form.failOnStartup = !!server.failOnStartupError;
            form.expandTemplates = server.expandTemplates === true;
            form.reconnectEnabled = server.reconnect?.enabled !== false;
            form.initialDelay = String(server.reconnect?.initialDelayMs ?? 500);
            form.maxDelay = String(server.reconnect?.maxDelayMs ?? 30000);
            form.maxAttempts = String(server.reconnect?.maxAttempts ?? 10);
            // 已有 OAuth 记录则默认选 OAuth；否则有 Authorization 头选「Bearer 令牌」（令牌本身不回显）。
            if (form.transport === "streamable-http") {
                if (server.oauth !== undefined)
                    form.authMode = "oauth";
                else if (Array.isArray(server.headerKeys) && server.headerKeys.includes("Authorization"))
                    form.authMode = "bearer";
            }
            return form;
        }
        function buildMcpInput(form, deletedEnv, deletedHeaders) {
            const reconnect = {
                enabled: !!form.reconnectEnabled,
                initialDelayMs: mcpNumber(form.initialDelay, 500),
                maxDelayMs: mcpNumber(form.maxDelay, 30000),
                maxAttempts: mcpNumber(form.maxAttempts, 10)
            };
            const common = {
                serverName: String(form.serverName ?? "").trim(),
                toolCallTimeoutMs: mcpNumber(form.timeout, 60000),
                failOnStartupError: !!form.failOnStartup,
                ...(form.expandTemplates ? { expandTemplates: true } : {}),
                reconnect
            };
            if (form.transport === "streamable-http") {
                const headers = mcpParsePairs(form.headersText);
                for (const key of deletedHeaders)
                    headers[key] = null;
                return { ...common, transport: "streamable-http", url: mcpWireScalar(String(form.url ?? "").trim()), headers };
            }
            const env = mcpParsePairs(form.envText);
            for (const key of deletedEnv)
                env[key] = null;
            return { ...common, transport: "stdio", command: mcpWireScalar(String(form.command ?? "").trim()), args: mcpParseScalarLines(form.argsText), env, cwd: mcpWireScalar(String(form.cwd ?? "").trim()) };
        }
        function formatExpiryShort(expiresAt) {
            if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt))
                return "";
            try {
                return new Date(expiresAt).toLocaleString();
            }
            catch {
                return "";
            }
        }
        function McpFormDialog({ t, initial, onSave, onOAuthFlow, onOAuthRefresh, onOAuthDisconnect, onCancel, busy, error }) {
            const initialIdentity = (initial?.entryId ?? "") + "\u0000" + (initial?.serverName ?? "");
            const initOAuthState = (src) => ({
                busy: false,
                authed: src !== null && src !== undefined && (src.oauth?.connected === true || (src.headerKeys ?? []).includes("Authorization")),
                needsReauth: src?.oauth?.needsReauth === true,
                expired: src?.oauth?.expired === true,
                expiresAt: typeof src?.oauth?.expiresAt === "number" ? src.oauth.expiresAt : null,
                canRefresh: src?.oauth?.canRefresh === true,
                refreshError: typeof src?.oauth?.refreshError === "string" ? src.oauth.refreshError : "",
                notice: null
            });
            // 追踪落盘后的服务器标识：新建并当场点 OAuth 登录/重试时不会误当成新建重复名。
            const [savedTarget, setSavedTarget] = react.useState(() => (initial !== null && initial !== undefined ? { serverName: initial.serverName, entryId: initial.entryId } : null));
            const [oauthState, setOauthState] = react.useState(() => initOAuthState(initial));
            useEscapeClose(onCancel, !busy && !oauthState.busy);
            const editing = savedTarget !== null;
            const [form, setForm] = react.useState(() => initial !== null && initial !== undefined ? formFromServer(initial) : defaultMcpForm());
            const [deletedEnv, setDeletedEnv] = react.useState(() => new Set());
            const [deletedHeaders, setDeletedHeaders] = react.useState(() => new Set());
            const [advancedOpen, setAdvancedOpen] = react.useState(false);
            const [expandTouched, setExpandTouched] = react.useState(false);
            react.useEffect(() => {
                setSavedTarget(initial !== null && initial !== undefined ? { serverName: initial.serverName, entryId: initial.entryId } : null);
                setOauthState(initOAuthState(initial));
                setForm(initial !== null && initial !== undefined ? formFromServer(initial) : defaultMcpForm());
                setDeletedEnv(new Set());
                setDeletedHeaders(new Set());
                setAdvancedOpen(false);
                setExpandTouched(false);
            }, [initialIdentity]);
            const set = (patch) => {
                setForm((prev) => {
                    const next = { ...prev, ...patch };
                    if (!expandTouched && !("expandTemplates" in patch)) {
                        const hasCred = [patch.url, patch.headersText, patch.authToken, patch.command, patch.argsText, patch.envText, patch.cwd]
                            .some((v) => typeof v === "string" && MCP_CRED_REF_TEST_RE.test(v));
                        if (hasCred)
                            next.expandTemplates = true;
                    }
                    return next;
                });
            };
            // 名称规则最终由宿主边界校验，撞上只会得到一句泛化错误；
            // 这里提前拦截并把规则写在字段下面，别让用户对着天书猜。
            const trimmedName = String(form.serverName ?? "").trim();
            const nameIssue = trimmedName === "" ? t("nameRequired") : MCP_NAME_RE.test(trimmedName) ? null : t("nameHint");
            const envKeys = editing && Array.isArray(initial?.envKeys) ? initial.envKeys.filter((key) => !deletedEnv.has(key)) : [];
            const headerKeys = editing && Array.isArray(initial?.headerKeys) ? initial.headerKeys.filter((key) => !deletedHeaders.has(key)) : [];
            const buildFormInput = () => {
                let toSave = form;
                const token = String(form.authToken ?? "").trim();
                if (form.transport === "streamable-http" && form.authMode === "bearer" && token !== "") {
                    const kept = String(form.headersText ?? "")
                        .split("\n")
                        .filter((line) => line.trim() !== "" && !/^\s*Authorization\s*[=:]/i.test(line));
                    toSave = { ...form, headersText: [...kept, "Authorization=Bearer " + token].join("\n") };
                }
                return buildMcpInput(toSave, deletedEnv, deletedHeaders);
            };
            const submit = () => {
                if (nameIssue !== null)
                    return;
                onSave(buildFormInput(), savedTarget?.serverName, savedTarget?.entryId);
            };
            const startDialogOAuth = async (closeOnDone) => {
                if (nameIssue !== null || oauthState.busy || busy)
                    return;
                if (String(form.url ?? "").trim() === "") {
                    setOauthState((prev) => ({ ...prev, notice: { ok: false, text: t("oauthNeedUrl") } }));
                    return;
                }
                setOauthState((prev) => ({ ...prev, busy: true, notice: { ok: true, text: t("oauthStatusPending") } }));
                try {
                    const res = await onOAuthFlow(buildFormInput(), savedTarget?.serverName, savedTarget?.entryId, closeOnDone, (savedInfo) => {
                        if (savedInfo !== undefined && savedInfo !== null)
                            setSavedTarget(savedInfo);
                    });
                    if (res?.saved !== undefined)
                        setSavedTarget(res.saved);
                    if (!closeOnDone) {
                        setOauthState((prev) => ({
                            ...prev,
                            busy: false,
                            authed: true,
                            needsReauth: false,
                            expired: false,
                            expiresAt: typeof res?.expiresAt === "number" ? res.expiresAt : prev.expiresAt,
                            refreshError: "",
                            notice: { ok: true, text: t("oauthDone") }
                        }));
                    }
                }
                catch (err) {
                    setOauthState((prev) => ({ ...prev, busy: false, notice: { ok: false, text: String(err?.message ?? err) } }));
                }
            };
            const refreshDialogOAuth = async () => {
                if (savedTarget === null || oauthState.busy || busy)
                    return;
                setOauthState((prev) => ({ ...prev, busy: true, notice: null }));
                try {
                    const res = await onOAuthRefresh(savedTarget.serverName);
                    if (res?.ok) {
                        setOauthState((prev) => ({
                            ...prev,
                            busy: false,
                            authed: true,
                            needsReauth: false,
                            expired: false,
                            expiresAt: typeof res.expiresAt === "number" ? res.expiresAt : prev.expiresAt,
                            refreshError: "",
                            notice: { ok: true, text: t("oauthRefreshOk") }
                        }));
                    }
                    else {
                        setOauthState((prev) => ({
                            ...prev,
                            busy: false,
                            needsReauth: res?.needsReauth === true ? true : prev.needsReauth,
                            notice: { ok: false, text: t("oauthRefreshFailed") + String(res?.error ?? "") }
                        }));
                    }
                }
                catch (err) {
                    setOauthState((prev) => ({ ...prev, busy: false, notice: { ok: false, text: t("oauthRefreshFailed") + String(err?.message ?? err) } }));
                }
            };
            const disconnectDialogOAuth = async () => {
                if (savedTarget === null || oauthState.busy || busy)
                    return;
                setOauthState((prev) => ({ ...prev, busy: true, notice: null }));
                try {
                    await onOAuthDisconnect(savedTarget.serverName);
                    setOauthState((prev) => ({
                        ...prev,
                        busy: false,
                        authed: false,
                        needsReauth: false,
                        expired: false,
                        expiresAt: null,
                        canRefresh: false,
                        refreshError: "",
                        notice: { ok: true, text: t("oauthDisconnected") }
                    }));
                }
                catch (err) {
                    setOauthState((prev) => ({ ...prev, busy: false, notice: { ok: false, text: String(err?.message ?? err) } }));
                }
            };
            const label = (text) => (0, react_jsx_runtime.jsx)("span", { className: m.label, children: text });
            const field = (text, node, wide, hint = null) => (0, react_jsx_runtime.jsxs)("label", {
                className: m.field,
                "data-wide": wide ? "true" : void 0,
                children: [label(text), node, hint !== undefined && hint !== null ? (0, react_jsx_runtime.jsx)("span", {
                        className: m.hint,
                        "data-error": hint.error ? "true" : void 0,
                        role: hint.error ? "alert" : void 0,
                        children: hint.text
                    }) : null]
            });
            const textInput = (value, onChange, placeholder = "") => (0, react_jsx_runtime.jsx)("input", {
                className: m.input,
                value,
                placeholder,
                onChange: (event) => onChange(event.target.value)
            });
            const textArea = (value, onChange, placeholder = "") => (0, react_jsx_runtime.jsx)("textarea", {
                className: m.textarea,
                value,
                placeholder,
                onChange: (event) => onChange(event.target.value)
            });
            const secretEditor = (keys, deleted, setDeleted, text, setText, placeholder) => (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, {
                children: [
                    keys.length > 0 ? (0, react_jsx_runtime.jsx)("div", {
                        className: m.secretKeys,
                        children: keys.map((key) => (0, react_jsx_runtime.jsxs)("span", {
                            className: m.key,
                            children: [
                                key,
                                (0, react_jsx_runtime.jsx)("button", {
                                    type: "button",
                                    onClick: () => {
                                        const next = new Set(deleted);
                                        next.add(key);
                                        setDeleted(next);
                                    },
                                    children: t("deleteSecret")
                                })
                            ]
                        }, key))
                    }) : null,
                    textArea(text, setText, placeholder)
                ]
            });
            const fields = [
                field(t("fieldServerName"), textInput(form.serverName, (value) => set({ serverName: value }), "MCP Server"), false, nameIssue === null ? { text: t("nameHint"), error: false } : { text: nameIssue, error: true }),
                field(t("fieldTransport"), (0, react_jsx_runtime.jsxs)("div", {
                    className: m.transportRow,
                    children: [
                        (0, react_jsx_runtime.jsx)("button", {
                            type: "button",
                            className: m.transportBtn,
                            "data-active": form.transport === "stdio" ? "true" : "false",
                            onClick: () => set({ transport: "stdio" }),
                            children: t("transportStdio")
                        }),
                        (0, react_jsx_runtime.jsx)("button", {
                            type: "button",
                            className: m.transportBtn,
                            "data-active": form.transport === "streamable-http" ? "true" : "false",
                            onClick: () => set({ transport: "streamable-http" }),
                            children: t("transportHttp")
                        })
                    ]
                }), false)
            ];
            if (form.transport === "stdio") {
                fields.push(field(t("fieldCommand"), textInput(form.command, (value) => set({ command: value }), t("phCommand")), true));
                fields.push(field(t("fieldArgs"), textArea(form.argsText, (value) => set({ argsText: value }), t("phArgs")), true));
                fields.push(field(t("fieldEnv"), secretEditor(envKeys, deletedEnv, setDeletedEnv, form.envText, (value) => set({ envText: value }), t("phEnv")), true, { text: t("hintJs") + " " + t("authStdioHint") }));
                fields.push(field(t("fieldCwd"), textInput(form.cwd, (value) => set({ cwd: value }), t("phCwd")), false));
            }
            else {
                fields.push(field(t("fieldUrl"), textInput(form.url, (value) => set({ url: value }), t("phUrl")), true));
                // 认证：只有 streamable-http 有意义。三种方式——无 / Bearer 令牌 / OAuth 登录。
                // Bearer 只是「往请求头里写一行 Authorization」的快捷方式；OAuth 要保存后
                // 在卡片上点「OAuth 登录」（授权流程需要已落盘的那一行配置）。
                fields.push(field(t("fieldAuth"), (0, react_jsx_runtime.jsxs)("div", {
                    className: m.authBox,
                    children: [
                        (0, react_jsx_runtime.jsxs)("div", {
                            className: m.transportRow,
                            children: [
                                (0, react_jsx_runtime.jsx)("button", { type: "button", className: m.transportBtn, "data-active": form.authMode === "none" ? "true" : "false", onClick: () => set({ authMode: "none" }), children: t("authNone") }),
                                (0, react_jsx_runtime.jsx)("button", { type: "button", className: m.transportBtn, "data-active": form.authMode === "bearer" ? "true" : "false", onClick: () => set({ authMode: "bearer" }), children: t("authBearer") }),
                                (0, react_jsx_runtime.jsx)("button", { type: "button", className: m.transportBtn, "data-active": form.authMode === "oauth" ? "true" : "false", onClick: () => set({ authMode: "oauth" }), children: t("authOAuth") })
                            ]
                        }),
                        form.authMode === "bearer" ? textInput(form.authToken, (value) => set({ authToken: value }), t("phAuthToken")) : null,
                        form.authMode === "oauth" ? (0, react_jsx_runtime.jsxs)("div", {
                            className: m.oauthInline,
                            children: [
                                oauthState.authed || oauthState.needsReauth || oauthState.expired ? (0, react_jsx_runtime.jsx)("span", {
                                    className: m.hint,
                                    "data-error": oauthState.needsReauth || oauthState.expired ? "true" : void 0,
                                    children: (oauthState.needsReauth ? t("oauthStatusNeedsReauth") : oauthState.expired ? t("oauthStatusExpired") : t("oauthStatusReady"))
                                        + (oauthState.expiresAt !== null ? t("oauthStatusExpiresAt") + formatExpiryShort(oauthState.expiresAt) : "")
                                        + (oauthState.refreshError !== "" ? " — " + oauthState.refreshError : "")
                                }) : null,
                                editing ? (0, react_jsx_runtime.jsxs)("div", {
                                    className: m.oauthActions,
                                    children: [
                                        (0, react_jsx_runtime.jsx)("button", {
                                            type: "button",
                                            className: m.actionBtn,
                                            disabled: oauthState.busy || busy || nameIssue !== null,
                                            onClick: () => startDialogOAuth(false),
                                            children: oauthState.busy ? t("oauthWorking") : (oauthState.authed || oauthState.needsReauth || oauthState.expired ? t("oauthReauthNow") : t("oauthAuthNow"))
                                        }),
                                        oauthState.canRefresh ? (0, react_jsx_runtime.jsx)("button", {
                                            type: "button",
                                            className: m.actionBtn,
                                            disabled: oauthState.busy || busy,
                                            onClick: refreshDialogOAuth,
                                            children: t("oauthRefreshNow")
                                        }) : null,
                                        oauthState.authed || oauthState.needsReauth ? (0, react_jsx_runtime.jsx)("button", {
                                            type: "button",
                                            className: m.dangerBtn,
                                            disabled: oauthState.busy || busy,
                                            onClick: disconnectDialogOAuth,
                                            children: t("oauthDisconnect")
                                        }) : null
                                    ]
                                }) : null,
                                oauthState.notice !== null ? (0, react_jsx_runtime.jsx)("div", {
                                    className: m.result,
                                    "data-ok": oauthState.notice.ok ? "true" : "false",
                                    children: oauthState.notice.text
                                }) : null
                            ]
                        }) : null,
                        (0, react_jsx_runtime.jsx)("span", {
                            className: m.hint,
                            children: form.authMode === "bearer" ? t("authBearerHint") : form.authMode === "oauth" ? t("authOauthHint") : t("authNoneHint")
                        })
                    ]
                }), true));
                fields.push(field(t("fieldHeaders"), secretEditor(headerKeys, deletedHeaders, setDeletedHeaders, form.headersText, (value) => set({ headersText: value }), t("phHeaders")), true, { text: t("hintJs") }));
            }
            fields.push((0, react_jsx_runtime.jsx)("div", {
                className: m.field,
                "data-wide": "true",
                children: (0, react_jsx_runtime.jsx)("button", {
                    type: "button",
                    className: m.advancedToggle,
                    onClick: () => setAdvancedOpen((value) => !value),
                    children: (advancedOpen ? "▾ " : "▸ ") + t("advanced")
                })
            }));
            if (advancedOpen) {
                fields.push(field(t("fieldFailOnStartup"), (0, react_jsx_runtime.jsxs)("label", {
                    className: m.checkRow,
                    children: [
                        (0, react_jsx_runtime.jsx)("input", {
                            type: "checkbox",
                            checked: !!form.failOnStartup,
                            onChange: (event) => set({ failOnStartup: event.target.checked })
                        }),
                        t("fieldFailOnStartup")
                    ]
                }), false));
                fields.push(field(t("fieldExpandTemplates"), (0, react_jsx_runtime.jsxs)("label", {
                    className: m.checkRow,
                    children: [
                        (0, react_jsx_runtime.jsx)("input", {
                            type: "checkbox",
                            checked: !!form.expandTemplates,
                            onChange: (event) => {
                                setExpandTouched(true);
                                set({ expandTemplates: event.target.checked });
                            }
                        }),
                        t("fieldExpandTemplates")
                    ]
                }), true, { text: t("hintExpandTemplates") }));
                fields.push(field(t("fieldReconnect"), (0, react_jsx_runtime.jsxs)("label", {
                    className: m.checkRow,
                    children: [
                        (0, react_jsx_runtime.jsx)("input", {
                            type: "checkbox",
                            checked: !!form.reconnectEnabled,
                            onChange: (event) => set({ reconnectEnabled: event.target.checked })
                        }),
                        t("fieldReconnect")
                    ]
                }), false));
                fields.push(field(t("fieldTimeout"), textInput(form.timeout, (value) => set({ timeout: value }), "60000"), false));
                fields.push(field(t("fieldInitialDelay"), textInput(form.initialDelay, (value) => set({ initialDelay: value }), "500"), false));
                fields.push(field(t("fieldMaxDelay"), textInput(form.maxDelay, (value) => set({ maxDelay: value }), "30000"), false));
                fields.push(field(t("fieldMaxAttempts"), textInput(form.maxAttempts, (value) => set({ maxAttempts: value }), "10"), false));
            }
            const shouldSaveAndOAuth = form.transport === "streamable-http" && form.authMode === "oauth" && (!oauthState.authed || oauthState.needsReauth || oauthState.expired);
            return (0, react_jsx_runtime.jsx)("div", {
                className: c.scopeOverlay,
                role: "dialog",
                "aria-modal": "true",
                onClick: closeOnBackdrop(onCancel, busy || oauthState.busy),
                children: (0, react_jsx_runtime.jsxs)("div", {
                    className: c.scopeBox,
                    children: [
                        (0, react_jsx_runtime.jsx)("h4", { children: editing ? t("editTitle") : t("newTitle") }),
                        (0, react_jsx_runtime.jsx)("div", {
                            className: m.form,
                            children: fields
                        }),
                        error !== undefined && error !== null ? (0, react_jsx_runtime.jsx)("div", {
                            className: c.notice,
                            "data-kind": "error",
                            children: (0, react_jsx_runtime.jsx)("span", { className: c.noticeText, children: String(error) })
                        }) : null,
                        (0, react_jsx_runtime.jsxs)("div", {
                            className: c.scopeActions,
                            children: [
                                (0, react_jsx_runtime.jsx)("button", {
                                    type: "button",
                                    className: c.scopeAction + " " + c.scopeCancel,
                                    disabled: busy || oauthState.busy,
                                    onClick: onCancel,
                                    children: t("cancel")
                                }),
                                shouldSaveAndOAuth ? (0, react_jsx_runtime.jsx)("button", {
                                    type: "button",
                                    className: c.scopeAction + " " + c.scopeCancel,
                                    disabled: busy || oauthState.busy || nameIssue !== null,
                                    onClick: submit,
                                    children: t("saveOnly")
                                }) : null,
                                (0, react_jsx_runtime.jsx)("button", {
                                    type: "button",
                                    className: c.scopeAction + " " + c.scopeConfirm,
                                    disabled: busy || oauthState.busy || nameIssue !== null,
                                    onClick: shouldSaveAndOAuth ? () => startDialogOAuth(true) : submit,
                                    children: oauthState.busy ? t("oauthWorking") : (shouldSaveAndOAuth ? t("saveAndOAuth") : t("save"))
                                })
                            ]
                        })
                    ]
                })
            });
        }
        function McpSection({ t, listMcp, saveMcp, removeMcp, setEnabledMcp, testMcp, reloadMcp, oauthStart, oauthPoll, oauthRefresh, oauthDisconnect, listMcpTools, getToolFilter, setToolFilter, listMcpGroups, saveMcpGroup, deleteMcpGroup, listWorkspaces, currentSessionId, subscribeSession, useSessions, evacuateForeign, readRawMcp, writeRawMcp }) {
            const selectMainSession = (state) => {
                const rows = state !== null && typeof state === "object" ? state.byId : undefined;
                if (rows === null || typeof rows !== "object")
                    return undefined;
                for (const id of Object.keys(rows)) {
                    const row = rows[id];
                    if (((row && row.retainedBy && row.retainedBy.mainView) || 0) > 0) {
                        const cwd = row?.header?.cwd ?? row?.cwd ?? row?.workspace;
                        return { id, cwd: typeof cwd === "string" && cwd !== "" ? cwd : undefined };
                    }
                }
                return undefined;
            };
            const useHostSessions = typeof useSessions === "function";
            const hostSession = useHostSessions ? useSessions(selectMainSession) : undefined;
            const [fallbackSessionId, setFallbackSessionId] = react.useState(() => (typeof currentSessionId === "function" ? currentSessionId() : undefined));
            react.useEffect(() => {
                if (useHostSessions || typeof subscribeSession !== "function" || typeof currentSessionId !== "function")
                    return undefined;
                const sync = () => setFallbackSessionId(currentSessionId());
                sync();
                return subscribeSession(sync);
            }, [useHostSessions]);
            const activeSessionId = useHostSessions ? hostSession?.id : fallbackSessionId;
            const activeSessionCwd = useHostSessions ? hostSession?.cwd : undefined;
            const [loadState, setLoadState] = react.useState({ kind: "loading" });
            const [data, setData] = react.useState(null);
            const [request, setRequest] = react.useState(0);
            const [editing, setEditing] = react.useState(null);
            const [dialogBusy, setDialogBusy] = react.useState(false);
            // Issue #82：MCP 表单弹窗按 Esc 关闭（保存中不关）。
            useEscapeClose(() => setEditing(null), editing !== null && dialogBusy !== true);
            const [dialogError, setDialogError] = react.useState(null);
            const [confirming, setConfirming] = react.useState(null);
            const [testing, setTesting] = react.useState(null);
            const [testResult, setTestResult] = react.useState(null);
            const [docOpen, setDocOpen] = react.useState(false);
            const [oauthNotice, setOauthNotice] = react.useState(null);
            // MCP 服务器分组（#55：存在 mcp-groups.json，不动 cordis.patch.yml）
            const [mcpGroups, setMcpGroups] = react.useState([]);
            const [mcpGroupFilter, setMcpGroupFilter] = react.useState("all");
            // 左轨作用域：global = 档案级；工作区路径 = 只在这个工作区里生效。
            const [mcpScope, setMcpScope] = react.useState("global");
            const [mcpGroupDialog, setMcpGroupDialog] = react.useState(null);
            useEscapeClose(() => setMcpGroupDialog(null), mcpGroupDialog !== null && mcpGroupDialog.busy !== true);
            const [groupToggleBusy, setGroupToggleBusy] = react.useState(false);
            const [mcpWorkspaces, setMcpWorkspaces] = react.useState([]);
            // 单工具禁用与分层作用域（Issue #44 / #55 / #92）
            const [toolsOpen, setToolsOpen] = react.useState(null);
            const [toolsPanel, setToolsPanel] = react.useState(null);
            const [toolDenyList, setToolDenyList] = react.useState([]);
            const [toolPolicy, setToolPolicy] = react.useState({ deny: [], workspaces: {}, roles: { subagentAllow: [], subagentDeny: [] }, sessionOverrides: {} });
            // MCP 服务器搜索：按名字 / 地址 / 命令与参数 / 传输方式 / 头名 / 环境变量名过滤卡片。
            const [mcpFilter, setMcpFilter] = react.useState("");
            const [toolsBusy, setToolsBusy] = react.useState(false);
            // 工具清单筛选（Issue #77）：一台服务器几十上百个工具时按名字/描述过滤。
            const [toolsFilter, setToolsFilter] = react.useState("");
            // 受管块里的外来行（#46 后续）：展开「查看机制」说明、移出结果与忙碌态。
            const [foreignDocOpen, setForeignDocOpen] = react.useState(false);
            const [evacNotice, setEvacNotice] = react.useState(null);
            const [evacBusy, setEvacBusy] = react.useState(false);
            // 原文编辑：表单没覆盖的字段（maxInstructionBytes 等）和手写 YAML 走这里。
            const [rawEdit, setRawEdit] = react.useState(null);
            // Issue #82：原文编辑弹层按 Esc 关闭（点遮罩在下面直接处理）。
            useEscapeClose(() => setRawEdit(null), rawEdit !== null);
            react.useEffect(() => {
                let cancelled = false;
                listMcp().then((value) => {
                    if (cancelled)
                        return;
                    setData(value);
                    setLoadState({ kind: "ready" });
                }).catch((error) => {
                    if (cancelled)
                        return;
                    setLoadState({ kind: "error", message: String(error?.message ?? error) });
                });
                if (typeof getToolFilter === "function") {
                    Promise.resolve().then(() => getToolFilter()).then((filter) => {
                        if (cancelled)
                            return;
                        setToolDenyList(Array.isArray(filter?.deny) ? filter.deny : []);
                        setToolPolicy({
                            deny: Array.isArray(filter?.deny) ? filter.deny : [],
                            workspaces: filter?.workspaces && typeof filter.workspaces === "object" ? filter.workspaces : {},
                            roles: {
                                subagentAllow: Array.isArray(filter?.roles?.subagentAllow) ? filter.roles.subagentAllow : [],
                                subagentDeny: Array.isArray(filter?.roles?.subagentDeny) ? filter.roles.subagentDeny : []
                            },
                            sessionOverrides: filter?.sessionOverrides && typeof filter.sessionOverrides === "object" ? filter.sessionOverrides : {}
                        });
                    }).catch(() => { });
                }
                if (typeof listMcpGroups === "function") {
                    Promise.resolve().then(() => listMcpGroups()).then((res) => {
                        if (cancelled)
                            return;
                        setMcpGroups(Array.isArray(res?.groups) ? res.groups : []);
                    }).catch(() => { });
                }
                if (typeof listWorkspaces === "function") {
                    Promise.resolve().then(() => listWorkspaces()).then((wsRes) => {
                        if (cancelled)
                            return;
                        setMcpWorkspaces(Array.isArray(wsRes?.workspaces) ? wsRes.workspaces : []);
                    }).catch(() => { });
                }
                return () => { cancelled = true; };
            }, [listMcp, getToolFilter, listMcpGroups, listWorkspaces, request]);
            react.useEffect(() => {
                if (confirming === null)
                    return;
                const timer = setTimeout(() => setConfirming(null), 3000);
                return () => clearTimeout(timer);
            }, [confirming]);
            const servers = data?.servers ?? [];
            const patch = data?.patch ?? {};
            // 分组筛选（#55）：先按选中分组过滤，再叠加关键词搜索。
            const groupedMcpNames = new Set();
            for (const grp of mcpGroups) {
                for (const sName of Array.isArray(grp.servers) ? grp.servers : [])
                    groupedMcpNames.add(sName);
            }
            const activeMcpGroup = mcpGroupFilter !== "all" && mcpGroupFilter !== ""
                ? mcpGroups.find((grp) => grp.id === mcpGroupFilter)
                : undefined;
            react.useEffect(() => {
                if (mcpGroupFilter !== "all" && mcpGroupFilter !== "" && activeMcpGroup === undefined) {
                    setMcpGroupFilter("all");
                }
            }, [mcpGroupFilter, activeMcpGroup]);
            const groupScopedServers = activeMcpGroup !== undefined
                ? servers.filter((server) => Array.isArray(activeMcpGroup.servers) && activeMcpGroup.servers.includes(server.serverName))
                : mcpGroupFilter === ""
                    ? servers.filter((server) => !groupedMcpNames.has(server.serverName))
                    : servers;
            const ungroupedMcpCount = servers.reduce((sum, server) => sum + (groupedMcpNames.has(server.serverName) ? 0 : 1), 0);
            // 服务器搜索：任意一个可见字段命中即保留。
            const mcpQuery = mcpFilter.trim().toLocaleLowerCase();
            const filteredServers = mcpQuery === "" ? groupScopedServers : groupScopedServers.filter((server) => {
                const fields = [server.serverName, server.transport, server.url, server.command, server.cwd]
                    .concat(Array.isArray(server.args) ? server.args : [])
                    .concat(Array.isArray(server.headerKeys) ? server.headerKeys : [])
                    .concat(Array.isArray(server.envKeys) ? server.envKeys : []);
                return fields.some((field) => typeof field === "string" && field.toLocaleLowerCase().includes(mcpQuery));
            });
            /**
             * #46 受管块里的外来行可见化。
             * patch.foreign 的元素是 { id?, name?, managed }：
             *   managed === false → 块内一条不属于面板的行（面板永不改写，但要让人看见）；
             *   managed === true  → 面板自己的某一行被挪进了外来 insert 列表，面板暂不管理它。
             * 两类各出一句，最多各列 3 个标识，避免把通知条撑爆。
             */
            const describeForeignRow = (entry) => String(entry?.id ?? entry?.name ?? "?");
            const foreignListText = (rows) => rows.slice(0, 3).map(describeForeignRow).join("、") + (rows.length > 3 ? " " + (t !== null ? t("foreignMore") : "…") : "");
            const foreignOthers = (Array.isArray(patch.foreign) ? patch.foreign : []).filter((entry) => entry !== null && typeof entry === "object" && entry.managed !== true);
            const foreignMine = (Array.isArray(patch.foreign) ? patch.foreign : []).filter((entry) => entry !== null && typeof entry === "object" && entry.managed === true);
            const foreignNotice = [
                foreignOthers.length > 0 && t !== null ? t("foreignOthers").replace("{count}", String(foreignOthers.length)).replace("{list}", foreignListText(foreignOthers)) : null,
                foreignMine.length > 0 && t !== null ? t("foreignMine").replace("{count}", String(foreignMine.length)).replace("{list}", foreignListText(foreignMine)) : null
            ].filter((line) => line !== null);
            const refresh = (quiet) => setRequest((value) => value + 1);
            // 把受管块里的外来行原样搬到块外（语义不变），然后刷新列表让提醒消失。
            const applyEvacuate = () => {
                if (evacBusy)
                    return;
                setEvacBusy(true);
                setEvacNotice(null);
                Promise.resolve().then(() => evacuateForeign()).then((result) => {
                    setEvacBusy(false);
                    const moved = Number(result?.moved ?? 0);
                    setEvacNotice(t !== null ? t(moved > 0 ? "foreignEvacuated" : "foreignEvacuateNone").replace("{count}", String(moved)) : "");
                    refresh(true);
                }, (error) => {
                    setEvacBusy(false);
                    setEvacNotice(t !== null ? t("foreignEvacuateFailed") + String(error?.message ?? error) : String(error?.message ?? error));
                });
            };
            const stateLabel = (server) => {
                const phase = server.fiberPhase;
                const key = !server.enabled
                    ? "stateStopped"
                    : phase === "active"
                        ? "stateActive"
                        : phase === "loading" || phase === "unloading"
                            ? "stateLoading"
                            : phase === "failed"
                                ? "stateFailed"
                                : phase === "pending"
                                    ? "statePending"
                                    : "stateUnknown";
                return t !== null ? t(key) : "";
            };
            const applySave = async (input, previousServerName, previousEntryId) => {
                setDialogBusy(true);
                setDialogError(null);
                try {
                    const result = await saveMcp(input, previousServerName, previousEntryId);
                    setEditing(null);
                    setTimeout(() => refresh(true), 500);
                }
                catch (error) {
                    setDialogError(cleanMcpError(error));
                }
                finally {
                    setDialogBusy(false);
                }
            };
            // 卡片身份：有 entryId 用 entryId（serverName 可能重复），没有就用名字。
            const cardKey = (server) => (server.entryId !== undefined && server.entryId !== null && server.entryId !== "" ? String(server.entryId) : String(server.serverName));
            /**
             * 卡片是否还带着可用的身份（serverName）。
             *
             * 2.3.11 及更早：启停之后卡片槽位被网关信封 `{ server, reconciled }` 整个替换，
             * 卡片随即没有 serverName —— 名字/命令/地址全空，再点开关时 payload.serverName
             * 是 undefined，宿主报「启用参数无效」（用户反馈的严重回归）。
             * 信封的问题已在 applyToggle 里修掉；这里再加一道闸：任何动作发现卡片身份
             * 已经坏了，就刷新列表自愈，绝不把 undefined 发给宿主。
             */
            const usableCard = (server) => server !== null && server !== undefined && typeof server === "object" && typeof server.serverName === "string" && server.serverName !== "";
            const guardCard = (server) => {
                if (usableCard(server))
                    return true;
                refresh(true);
                return false;
            };
            const openRaw = (server) => {
                if (!guardCard(server))
                    return;
                const key = cardKey(server);
                setRawEdit({ key, serverName: server.serverName, entryId: server.entryId, text: "", error: null, busy: false, loading: true });
                Promise.resolve().then(() => readRawMcp({ serverName: server.serverName, entryId: server.entryId })).then((result) => {
                    setRawEdit((prev) => prev !== null && prev.key === key ? { ...prev, text: String(result?.text ?? ""), loading: false } : prev);
                }, (error) => {
                    setRawEdit((prev) => prev !== null && prev.key === key ? { ...prev, loading: false, error: cleanMcpError(error) } : prev);
                });
            };
            const applyRaw = async () => {
                const current = rawEdit;
                if (current === null || current.loading || current.busy)
                    return;
                setRawEdit({ ...current, busy: true, error: null });
                try {
                    await writeRawMcp({ serverName: current.serverName, entryId: current.entryId, text: current.text });
                    setRawEdit(null);
                    setTimeout(() => refresh(true), 500);
                }
                catch (error) {
                    setRawEdit((prev) => prev === null ? prev : { ...prev, busy: false, error: cleanMcpError(error) });
                }
            };
            // ── 工作区作用域：服务器只在一个工作区里被关掉 ──────────────
            // 工作区覆盖存在工具过滤器里（按工具名），所以「关掉一台服务器」
            // 等于把它当前发布的每个工具名都记进那个工作区的禁用集。
            const scopeDeny = (scopeKey) => (scopeKey === "global"
                ? (Array.isArray(toolPolicy.deny) ? toolPolicy.deny : [])
                : (Array.isArray(toolPolicy.workspaces?.[scopeKey]) ? toolPolicy.workspaces[scopeKey] : []));
            const prefixOf = (server) => "mcp__" + server.serverName + "__";
            /**
             * 这台服务器在给定作用域里的开关：只有 on / off。
             *
             * 「部分工具被关掉」也算 off——用户在这里看到的是一个开关，
             * 不是一份清单；只要有工具在这个工作区里被禁用，这台服务器就
             * 不是完整可用的。
             */
            const serverStateIn = (server, scopeKey) => {
                if (scopeKey === "global")
                    return server.enabled === true ? "on" : "off";
                const prefix = prefixOf(server);
                const denied = scopeDeny(scopeKey).some((name) => name.startsWith(prefix));
                return denied ? "off" : "on";
            };
            const inWorkspaceScope = mcpScope !== "global";
            const applyToggleWorkspaceScope = async (server, wanted) => {
                const scopeKey = mcpScope;
                const prefix = prefixOf(server);
                const current = scopeDeny(scopeKey);
                let names = [];
                try {
                    const listed = await listMcpTools({ serverName: server.serverName });
                    names = (Array.isArray(listed?.tools) ? listed.tools : [])
                        .map((tool) => tool?.name)
                        .filter((name) => typeof name === "string" && name !== "");
                }
                catch (error) {
                    setLoadState({ kind: "error", message: String(error?.message ?? error) });
                    return;
                }
                // 服务器还没连接时拿不到清单：退回「按前缀清掉已有的」。
                const others = current.filter((name) => !name.startsWith(prefix));
                const next = wanted ? others : [...others, ...names];
                setToolPolicy((prev) => {
                    const workspaces = { ...(prev.workspaces ?? {}) };
                    if (next.length === 0)
                        delete workspaces[scopeKey];
                    else
                        workspaces[scopeKey] = [...new Set(next)].sort();
                    return { ...prev, workspaces };
                });
                try {
                    const result = await setToolFilter({
                        scopeKind: "workspace",
                        scopeKey,
                        deny: [...new Set(next)].sort()
                    });
                    if (result !== null && result !== undefined && typeof result === "object" && result.workspaces !== undefined) {
                        setToolPolicy((prev) => ({ ...prev, workspaces: result.workspaces }));
                    }
                }
                catch (error) {
                    setLoadState({ kind: "error", message: String(error?.message ?? error) });
                }
            };
            const applyToggle = async (server) => {
                if (!guardCard(server))
                    return;
                // 工作区视图里的开关只改这个工作区的覆盖，不碰档案级条目。
                if (inWorkspaceScope) {
                    await applyToggleWorkspaceScope(server, serverStateIn(server, mcpScope) !== "on");
                    return;
                }
                const previous = server.enabled;
                const wanted = !previous;
                const key = cardKey(server);
                const mapSaving = (prev, next) => prev === null ? prev : { ...prev, servers: prev.servers.map((item) => cardKey(item) === key ? { ...item, enabled: next } : item) };
                // 网关 setEnabled 返回的是信封 `{ server, reconciled }`，只把里面的 view 换进卡片。
                // view 不可用时退回「原卡片 + 开关状态」，绝不拿信封顶替卡片（否则信息全丢）。
                const mapReplace = (prev, view) => prev === null ? prev : {
                    ...prev,
                    servers: prev.servers.map((item) => cardKey(item) === key ? (usableCard(view) ? view : { ...item, enabled: wanted }) : item)
                };
                setData((prev) => mapSaving(prev, wanted));
                try {
                    const result = await setEnabledMcp(server.serverName, wanted, server.entryId);
                    const view = result !== null && result !== undefined && typeof result === "object" && result.server !== null && result.server !== undefined ? result.server : null;
                    setData((prev) => mapReplace(prev, view));
                }
                catch (error) {
                    setData((prev) => mapSaving(prev, previous));
                    setLoadState({ kind: "error", message: String(error?.message ?? error) });
                }
            };
            const applyRemove = async (server) => {
                if (!guardCard(server))
                    return;
                const key = cardKey(server);
                if (confirming !== key) {
                    setConfirming(key);
                    return;
                }
                setConfirming(null);
                try {
                    await removeMcp(server.serverName, server.entryId);
                    setData((prev) => prev === null ? prev : { ...prev, servers: prev.servers.filter((item) => cardKey(item) !== key) });
                }
                catch (error) {
                    setLoadState({ kind: "error", message: String(error?.message ?? error) });
                }
            };
            const applyTest = async (server) => {
                if (!guardCard(server))
                    return;
                setTesting(server.serverName);
                setTestResult(null);
                try {
                    const result = await testMcp({ serverName: server.serverName, entryId: server.entryId });
                    // 远程信封可能是 null（宿主侧重载后远端未就绪）；不归一化的话，渲染时
                    // 读 testResult.result.ok 会把整个面板带崩。
                    setTestResult({ serverName: server.serverName, result: result ?? { ok: false, error: "empty result", tools: [] } });
                }
                catch (error) {
                    setTestResult({ serverName: server.serverName, result: { ok: false, error: String(error?.message ?? error), tools: [] } });
                }
                finally {
                    setTesting(null);
                }
            };
            // 在 Add/Edit 弹窗内部直接完成保存 + OAuth 授权流程（#80 & 用户反馈：不在首页堆积登录按钮）。
            const runOAuthFlowInDialog = async (input, previousServerName, previousEntryId, closeOnDone, onSaved) => {
                const savedRes = await saveMcp(input, previousServerName, previousEntryId);
                const savedName = savedRes?.server?.serverName ?? input.serverName;
                const savedEntryId = savedRes?.server?.entryId ?? previousEntryId;
                const savedInfo = { serverName: savedName, entryId: savedEntryId };
                if (typeof onSaved === "function")
                    onSaved(savedInfo);
                const start = await oauthStart({ serverName: savedName });
                try {
                    window.open(start.authUrl, "_blank", "noopener,noreferrer");
                }
                catch {
                    // 弹窗拦截时不阻断，仍等待本地 loopback 回调
                }
                for (let attempt = 0; attempt < 240; attempt += 1) {
                    await new Promise((resolve) => setTimeout(resolve, 1500));
                    const poll = await oauthPoll({ flowId: start.flowId });
                    if (poll.status === "pending")
                        continue;
                    if (poll.status === "failed")
                        throw new Error(String(poll.error ?? t("oauthFailed")));
                    setOauthNotice({ serverName: savedName, ok: true, text: t("oauthDone") });
                    setData(await reloadMcp());
                    if (closeOnDone)
                        setEditing(null);
                    return { saved: savedInfo, expiresAt: poll.expiresAt ?? null };
                }
                throw new Error(t("oauthTimeout"));
            };
            const applyOAuthRefreshInDialog = async (serverName) => {
                const res = typeof oauthRefresh === "function" ? await oauthRefresh({ serverName }) : { ok: false, error: "unsupported" };
                if (res?.ok)
                    setData(await reloadMcp());
                return res;
            };
            const applyOAuthDisconnectInDialog = async (serverName) => {
                await oauthDisconnect({ serverName });
                setData(await reloadMcp());
            };
            const applyMcpGroupBulkToggle = async (group) => {
                if (group === undefined || groupToggleBusy)
                    return;
                const members = servers.filter((srv) => Array.isArray(group.servers) && group.servers.includes(srv.serverName) && srv.disabledExpr !== true);
                if (members.length === 0)
                    return;
                const targetEnabled = !members.every((srv) => srv.enabled === true);
                const pending = members.filter((srv) => srv.enabled !== targetEnabled);
                if (pending.length === 0)
                    return;
                setGroupToggleBusy(true);
                let done = 0;
                try {
                    await Promise.all(pending.map(async (srv) => {
                        await setEnabledMcp(srv.serverName, targetEnabled, srv.entryId);
                        done += 1;
                    }));
                    setData(await reloadMcp());
                    setOauthNotice({ serverName: members[0].serverName, ok: true, text: t("groupBulkResult").replace("{done}", String(done)) });
                }
                finally {
                    setGroupToggleBusy(false);
                }
            };
            const applyMcpGroupSave = async () => {
                const dlg = mcpGroupDialog;
                if (dlg === null || dlg.busy || typeof saveMcpGroup !== "function")
                    return;
                const trimmed = String(dlg.name ?? "").trim();
                if (trimmed === "") {
                    setMcpGroupDialog({ ...dlg, error: t("groupNameRequired") });
                    return;
                }
                setMcpGroupDialog({ ...dlg, busy: true, error: null });
                try {
                    const res = await saveMcpGroup({ id: dlg.id ?? undefined, name: trimmed, servers: [...dlg.servers] });
                    const groups = Array.isArray(res?.groups) ? res.groups : [];
                    setMcpGroups(groups);
                    const created = groups.find((g) => g.id === dlg.id) ?? groups.find((g) => g.name === trimmed);
                    if (created !== undefined)
                        setMcpGroupFilter(created.id);
                    setMcpGroupDialog(null);
                }
                catch (err) {
                    setMcpGroupDialog({ ...dlg, busy: false, error: cleanMcpError(err) });
                }
            };
            const applyMcpGroupDelete = async () => {
                const dlg = mcpGroupDialog;
                if (dlg === null || dlg.busy || dlg.id === null || typeof deleteMcpGroup !== "function")
                    return;
                setMcpGroupDialog({ ...dlg, busy: true, error: null });
                try {
                    const res = await deleteMcpGroup({ id: dlg.id });
                    setMcpGroups(Array.isArray(res?.groups) ? res.groups : []);
                    if (mcpGroupFilter === dlg.id)
                        setMcpGroupFilter("all");
                    setMcpGroupDialog(null);
                }
                catch (err) {
                    setMcpGroupDialog({ ...dlg, busy: false, error: cleanMcpError(err) });
                }
            };
            // 单工具禁用 + 分层作用域覆盖（#44 / #55）：global / workspace / session / subagent。
            const workspaceChoices = (() => {
                const seen = new Set();
                const out = [];
                if (typeof activeSessionCwd === "string" && activeSessionCwd !== "") {
                    seen.add(activeSessionCwd);
                    out.push({ path: activeSessionCwd, label: activeSessionCwd });
                }
                for (const ws of mcpWorkspaces) {
                    if (ws && typeof ws.path === "string" && ws.path !== "" && !seen.has(ws.path)) {
                        seen.add(ws.path);
                        out.push({ path: ws.path, label: ws.label || ws.path });
                    }
                }
                for (const wsKey of Object.keys(toolPolicy?.workspaces ?? {})) {
                    if (wsKey !== "" && !seen.has(wsKey)) {
                        seen.add(wsKey);
                        out.push({ path: wsKey, label: wsKey });
                    }
                }
                return out;
            })();
            const computeToolDisabledSet = (panel, scopeKind, scopeWs) => {
                const rows = panel?.tools ?? [];
                const globalDeny = panel.globalDeny ?? new Set();
                if (scopeKind === "global") {
                    return new Set(rows.filter((tool) => globalDeny.has(tool.name) || (Array.isArray(panel.rawDisabled) && panel.rawDisabled.includes(tool.name))).map((tool) => tool.name));
                }
                if (scopeKind === "workspace") {
                    const wsDeny = new Set(panel.policy?.workspaces?.[scopeWs] ?? []);
                    return new Set(rows.filter((tool) => wsDeny.has(tool.name)).map((tool) => tool.name));
                }
                if (scopeKind === "session") {
                    const ov = activeSessionId !== undefined ? panel.policy?.sessionOverrides?.[activeSessionId] : undefined;
                    const ovDeny = new Set(ov?.deny ?? []);
                    const ovAllow = new Set(ov?.allow ?? []);
                    const wsDeny = new Set(activeSessionCwd !== undefined ? (panel.policy?.workspaces?.[activeSessionCwd] ?? []) : []);
                    return new Set(rows.filter((tool) => (globalDeny.has(tool.name) || wsDeny.has(tool.name) || ovDeny.has(tool.name)) && !ovAllow.has(tool.name)).map((tool) => tool.name));
                }
                const subAllow = new Set(panel.policy?.roles?.subagentAllow ?? []);
                const subDeny = new Set(panel.policy?.roles?.subagentDeny ?? []);
                return new Set(rows.filter((tool) => (globalDeny.has(tool.name) && !subAllow.has(tool.name)) || subDeny.has(tool.name)).map((tool) => tool.name));
            };
            const openTools = async (server) => {
                if (!guardCard(server))
                    return;
                if (toolsOpen === server.serverName) {
                    setToolsOpen(null);
                    return;
                }
                setToolsOpen(server.serverName);
                setToolsFilter("");
                setToolsPanel({ serverName: server.serverName, loading: true });
                try {
                    const [tools, filter] = await Promise.all([listMcpTools({ serverName: server.serverName }), getToolFilter()]);
                    const deny = new Set(Array.isArray(filter?.deny) ? filter.deny : []);
                    const policyObj = {
                        deny: [...deny],
                        workspaces: filter?.workspaces && typeof filter.workspaces === "object" ? filter.workspaces : {},
                        roles: {
                            subagentAllow: Array.isArray(filter?.roles?.subagentAllow) ? filter.roles.subagentAllow : [],
                            subagentDeny: Array.isArray(filter?.roles?.subagentDeny) ? filter.roles.subagentDeny : []
                        },
                        sessionOverrides: filter?.sessionOverrides && typeof filter.sessionOverrides === "object" ? filter.sessionOverrides : {}
                    };
                    const rows = Array.isArray(tools?.tools) ? tools.tools : [];
                    const rawDisabled = Array.isArray(tools?.disabled) ? tools.disabled : [];
                    const defaultWs = workspaceChoices[0]?.path ?? "";
                    const initialPanel = {
                        serverName: server.serverName,
                        loading: false,
                        connected: tools?.connected !== false,
                        tools: rows,
                        rawDisabled,
                        globalDeny: deny,
                        policy: policyObj,
                        // 作用域不再由面板里的标签切换：左轨选中的工作区就是编辑对象，
                        // 「Global (profile)」则是档案级默认。
                        // 清单来源：live（服务器在跑）／cache（上次存下的）／probe（现场连了一次）。
                        source: typeof tools?.source === "string" ? tools.source : "live",
                        scopeKind: mcpScope === "global" ? "global" : "workspace",
                        scopeWs: mcpScope === "global" ? (defaultWs ?? "") : mcpScope
                    };
                    setToolsPanel({
                        ...initialPanel,
                        disabled: new Set(rows.filter((tool) => rawDisabled.includes(tool.name)).map((tool) => tool.name))
                    });
                }
                catch (error) {
                    setToolsPanel({ serverName: server.serverName, loading: false, error: String(error?.message ?? error) });
                }
            };
            const switchToolScope = (nextScope) => {
                setToolsPanel((prev) => {
                    if (prev === null || prev.loading || prev.error !== undefined)
                        return prev;
                    return {
                        ...prev,
                        scopeKind: nextScope,
                        disabled: computeToolDisabledSet(prev, nextScope, prev.scopeWs)
                    };
                });
            };
            const switchToolWorkspace = (nextWs) => {
                setToolsPanel((prev) => {
                    if (prev === null || prev.loading || prev.error !== undefined)
                        return prev;
                    return {
                        ...prev,
                        scopeWs: nextWs,
                        disabled: computeToolDisabledSet(prev, "workspace", nextWs)
                    };
                });
            };
            const toggleTool = (name) => {
                setToolsPanel((prev) => {
                    if (prev === null)
                        return prev;
                    const next = new Set(prev.disabled);
                    if (next.has(name))
                        next.delete(name);
                    else
                        next.add(name);
                    return { ...prev, disabled: next };
                });
            };
            const saveTools = async () => {
                const panel = toolsPanel;
                if (panel === null || panel.globalDeny === undefined)
                    return;
                const scope = panel.scopeKind ?? "global";
                if (scope === "workspace" && !panel.scopeWs)
                    return;
                if (scope === "session" && !activeSessionId)
                    return;
                setToolsBusy(true);
                try {
                    const mine = new Set((panel.tools ?? []).map((tool) => tool.name));
                    let result;
                    if (scope === "global") {
                        const deny = [...panel.globalDeny].filter((name) => !mine.has(name)).concat([...panel.disabled]).sort();
                        result = await setToolFilter({ deny });
                        setToolDenyList(deny);
                        setOauthNotice({ serverName: panel.serverName, ok: true, text: t("toolsSaved").replace("{count}", String(deny.length)).replace("{applied}", String(result?.applied ?? 0)) });
                    }
                    else if (scope === "workspace") {
                        const existingWs = panel.policy?.workspaces?.[panel.scopeWs] ?? [];
                        const deny = existingWs.filter((name) => !mine.has(name)).concat([...panel.disabled]).sort();
                        result = await setToolFilter({ scopeKind: "workspace", scopeKey: panel.scopeWs, deny });
                        setOauthNotice({ serverName: panel.serverName, ok: true, text: t("toolsSaved").replace("{count}", String(deny.length)).replace("{applied}", String(result?.applied ?? 0)) });
                    }
                    else if (scope === "session") {
                        const prevOv = panel.policy?.sessionOverrides?.[activeSessionId] ?? { deny: [], allow: [] };
                        const otherDeny = (prevOv.deny ?? []).filter((name) => !mine.has(name));
                        const otherAllow = (prevOv.allow ?? []).filter((name) => !mine.has(name));
                        const wsDeny = new Set(activeSessionCwd !== undefined ? (panel.policy?.workspaces?.[activeSessionCwd] ?? []) : []);
                        const mineDeny = [];
                        const mineAllow = [];
                        for (const tool of panel.tools ?? []) {
                            const checked = !panel.disabled.has(tool.name);
                            const baseBlocked = panel.globalDeny.has(tool.name) || wsDeny.has(tool.name);
                            if (!checked && !baseBlocked)
                                mineDeny.push(tool.name);
                            else if (checked && baseBlocked)
                                mineAllow.push(tool.name);
                        }
                        const deny = [...otherDeny, ...mineDeny].sort();
                        const allow = [...otherAllow, ...mineAllow].sort();
                        result = await setToolFilter({ scopeKind: "session", scopeKey: activeSessionId, deny, allow });
                        setOauthNotice({ serverName: panel.serverName, ok: true, text: t("toolsSaved").replace("{count}", String(panel.disabled.size)).replace("{applied}", String(result?.applied ?? 0)) });
                    }
                    else {
                        const prevRoles = panel.policy?.roles ?? { subagentAllow: [], subagentDeny: [] };
                        const otherAllow = (prevRoles.subagentAllow ?? []).filter((name) => !mine.has(name));
                        const otherDeny = (prevRoles.subagentDeny ?? []).filter((name) => !mine.has(name));
                        const mineAllow = [];
                        const mineDeny = [];
                        for (const tool of panel.tools ?? []) {
                            const checked = !panel.disabled.has(tool.name);
                            const baseBlocked = panel.globalDeny.has(tool.name);
                            if (checked && baseBlocked)
                                mineAllow.push(tool.name);
                            else if (!checked && !baseBlocked)
                                mineDeny.push(tool.name);
                        }
                        const allow = [...otherAllow, ...mineAllow].sort();
                        const deny = [...otherDeny, ...mineDeny].sort();
                        result = await setToolFilter({ scopeKind: "subagent", roles: { subagentAllow: allow, subagentDeny: deny } });
                        setOauthNotice({ serverName: panel.serverName, ok: true, text: t("toolsSaved").replace("{count}", String(panel.disabled.size)).replace("{applied}", String(result?.applied ?? 0)) });
                    }
                    if (result !== null && typeof result === "object") {
                        setToolPolicy({
                            deny: Array.isArray(result.deny) ? result.deny : toolDenyList,
                            workspaces: result.workspaces && typeof result.workspaces === "object" ? result.workspaces : toolPolicy.workspaces,
                            roles: result.roles && typeof result.roles === "object" ? result.roles : toolPolicy.roles,
                            sessionOverrides: result.sessionOverrides && typeof result.sessionOverrides === "object" ? result.sessionOverrides : toolPolicy.sessionOverrides
                        });
                    }
                    setToolsOpen(null);
                }
                catch (error) {
                    setOauthNotice({ serverName: panel.serverName, ok: false, text: String(error?.message ?? error) });
                }
                finally {
                    setToolsBusy(false);
                }
            };
            const toolPanel = (server) => {
                const panel = toolsPanel;
                if (panel === null || panel.serverName !== server.serverName)
                    return null;
                if (panel.loading) {
                    return (0, react_jsx_runtime.jsx)("div", { className: m.toolsPanel, children: (0, react_jsx_runtime.jsx)("p", { className: m.hint, children: t("toolsLoading") }) });
                }
                if (panel.error !== undefined) {
                    return (0, react_jsx_runtime.jsx)("div", { className: m.toolsPanel, children: (0, react_jsx_runtime.jsx)("p", { className: m.hint, "data-error": "true", children: panel.error }) });
                }
                const rows = panel.tools ?? [];
                // 工具筛选（Issue #77）：名字或描述命中即显示；全选/全不选只作用于当前筛出的部分。
                const toolQuery = toolsFilter.trim().toLocaleLowerCase();
                const visibleTools = toolQuery === ""
                    ? rows
                    : rows.filter((tool) => String(tool.name).toLocaleLowerCase().includes(toolQuery) || String(tool.description ?? "").toLocaleLowerCase().includes(toolQuery));
                const setVisibleTools = (enabled) => {
                    setToolsPanel((prev) => {
                        if (prev === null)
                            return prev;
                        const next = new Set(prev.disabled);
                        for (const tool of visibleTools) {
                            if (enabled)
                                next.delete(tool.name);
                            else
                                next.add(tool.name);
                        }
                        return { ...prev, disabled: next };
                    });
                };
                const scope = panel.scopeKind ?? "global";
                const scopeHintText = scope === "workspace"
                    ? (panel.scopeWs ? t("toolScopeWorkspaceHint").replace("{ws}", panel.scopeWs) : t("toolScopeNoWorkspace"))
                    : scope === "session"
                        ? (activeSessionId ? t("toolScopeSessionHint") : t("toolScopeNoSession"))
                        : scope === "subagent"
                            ? t("toolScopeSubagentHint")
                            : t("toolScopeGlobalHint");
                const scopeSaveDisabled = toolsBusy || (scope === "workspace" && !panel.scopeWs) || (scope === "session" && !activeSessionId);
                if (rows.length === 0) {
                    return (0, react_jsx_runtime.jsxs)("div", {
                        className: m.toolsPanel,
                        children: [(0, react_jsx_runtime.jsx)("p", { className: m.hint, children: panel.connected === false ? t("toolsDisconnected") : t("toolsEmpty") }), (0, react_jsx_runtime.jsx)("p", { className: m.hint, children: scopeHintText })]
                    });
                }
                return (0, react_jsx_runtime.jsxs)("div", {
                    className: m.toolsPanel,
                    children: [
                        (0, react_jsx_runtime.jsx)("p", { className: m.hint, children: scopeHintText }),
                        panel.source === "cache" || panel.source === "probe" ? (0, react_jsx_runtime.jsx)("p", { className: m.hint, children: t("toolsOfflineList") }) : null,
                        (0, react_jsx_runtime.jsxs)("div", {
                            className: m.toolbar,
                            children: [(0, react_jsx_runtime.jsx)("input", {
                                    className: m.input, type: "search", "data-role": "tool-search", placeholder: t("toolsSearchPlaceholder"), value: toolsFilter,
                                    style: { flex: "1", minWidth: "0" },
                                    onChange: (event) => setToolsFilter(event.currentTarget.value)
                                }), (0, react_jsx_runtime.jsx)("button", { type: "button", className: m.actionBtn, disabled: toolsBusy || visibleTools.length === 0, onClick: () => setVisibleTools(true), children: t("toolsSelectAll") }), (0, react_jsx_runtime.jsx)("button", { type: "button", className: m.actionBtn, disabled: toolsBusy || visibleTools.length === 0, onClick: () => setVisibleTools(false), children: t("toolsSelectNone") })]
                        }),
                        (0, react_jsx_runtime.jsx)("div", {
                            className: m.toolsList,
                            children: visibleTools.length === 0 ? (0, react_jsx_runtime.jsx)("p", { className: m.hint, children: t("toolsNoMatch") }) : visibleTools.map((tool) => {
                                const desc = typeof tool.description === "string" ? tool.description.trim() : "";
                                const inheritedGlobal = scope !== "global" && panel.globalDeny?.has?.(tool.name);
                                return (0, react_jsx_runtime.jsxs)("label", {
                                    className: m.toolRow,
                                    title: desc !== "" ? tool.name + " — " + desc : tool.name,
                                    children: [
                                        (0, react_jsx_runtime.jsx)("input", { type: "checkbox", checked: !panel.disabled.has(tool.name), onChange: () => toggleTool(tool.name) }),
                                        (0, react_jsx_runtime.jsxs)("div", {
                                            className: m.toolInfo,
                                            children: [
                                                (0, react_jsx_runtime.jsx)("span", { className: m.toolName, children: tool.name + (inheritedGlobal ? " " + t("toolScopeInheritedBlocked") : "") }),
                                                desc !== "" ? (0, react_jsx_runtime.jsx)("span", { className: m.toolDesc, children: desc }) : null
                                            ]
                                        })
                                    ]
                                }, tool.name);
                            })
                        }),
                        (0, react_jsx_runtime.jsxs)("div", {
                            className: m.toolsActions,
                            children: [
                                (0, react_jsx_runtime.jsx)("button", { type: "button", className: m.actionBtn, disabled: scopeSaveDisabled, onClick: saveTools, children: toolsBusy ? t("toolsSaving") : t("toolsSave") }),
                                (0, react_jsx_runtime.jsx)("button", { type: "button", className: m.actionBtn, disabled: toolsBusy, onClick: () => setToolsOpen(null), children: t("cancel") }),
                                (0, react_jsx_runtime.jsx)("span", {
                                    className: m.hint,
                                    children: (toolQuery === "" ? "" : t("toolsFilteredCount").replace("{visible}", String(visibleTools.length)).replace("{total}", String(rows.length)) + " · ")
                                        + (server.enabled
                                            ? t("toolsVisibilitySummary")
                                                .replace("{visible}", String(Math.max(0, rows.length - panel.disabled.size)))
                                                .replace("{total}", String(rows.length))
                                                .replace("{disabled}", String(panel.disabled.size))
                                            : t("toolsVisibilityStopped")
                                                .replace("{total}", String(rows.length))
                                                .replace("{disabled}", String(panel.disabled.size)))
                                })
                            ]
                        })
                    ]
                });
            };
            const gearIcon = (0, react_jsx_runtime.jsxs)("svg", {
                width: 14,
                height: 14,
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: 1.8,
                strokeLinecap: "round",
                strokeLinejoin: "round",
                children: [
                    (0, react_jsx_runtime.jsx)("circle", { cx: 12, cy: 12, r: 3 }),
                    (0, react_jsx_runtime.jsx)("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" })
                ]
            });
            const cardMetaSummary = (server) => {
                const state = stateLabel(server);
                const prefix = typeof server.serverName === "string" && server.serverName !== "" ? "mcp__" + server.serverName + "__" : "";
                const filteredCount = prefix === "" ? 0 : toolDenyList.reduce((sum, name) => sum + (typeof name === "string" && name.startsWith(prefix) ? 1 : 0), 0);
                if (server.enabled !== true) {
                    return filteredCount > 0 ? state + " · " + t("toolsCardFilteredOnly").replace("{filtered}", String(filteredCount)) : state;
                }
                const total = server.toolCount ?? 0;
                if (server.fiberPhase !== "active" && total === 0)
                    return state;
                if (filteredCount > 0) {
                    const visible = Math.max(0, total - filteredCount);
                    return state + " · " + t("toolsCardVisible").replace("{visible}", String(visible)).replace("{total}", String(total)).replace("{filtered}", String(filteredCount));
                }
                return state + " · " + t("toolCount").replace("{count}", String(total));
            };
            const serverCard = (server) => {
                // 工作区视图里，卡片上的开关表示「在这个工作区里是否可用」。
                const stateHere = inWorkspaceScope ? serverStateIn(server, mcpScope) : (server.enabled === true ? "on" : "off");
                const enabledHere = stateHere !== "off";
                const dotOn = server.enabled && server.fiberPhase === "active";
                const dotErr = server.fiberPhase === "failed";
                const oauthWarn = server.oauth?.needsReauth === true || (server.oauth?.expired === true && server.oauth?.canRefresh !== true);
                return (0, react_jsx_runtime.jsxs)("div", {
                    className: m.card,
                    children: [(0, react_jsx_runtime.jsxs)("div", {
                            className: m.cardTop,
                            children: [(0, react_jsx_runtime.jsx)("span", { className: m.name, children: server.serverName }), (0, react_jsx_runtime.jsxs)("span", {
                                    className: m.badges,
                                    children: [
                                        (0, react_jsx_runtime.jsx)("span", { className: m.badge, children: server.transport === "streamable-http" ? "HTTP" : "STDIO" }),
                                        server.disabledExpr === true ? (0, react_jsx_runtime.jsx)("span", { className: m.badge, title: t("disabledExprHint"), children: t("disabledExprBadge") }) : null,
                                        server.transport === "streamable-http" && oauthWarn ? (0, react_jsx_runtime.jsx)("button", {
                                            type: "button",
                                            className: m.badgeBtn,
                                            title: server.oauth?.refreshError || t("oauthStatusNeedsReauth"),
                                            onClick: () => { if (!guardCard(server))
                                                return; setDialogError(null); setEditing({ server }); },
                                            children: server.oauth?.needsReauth ? t("oauthStatusNeedsReauth") : t("oauthStatusExpired")
                                        }) : (server.transport === "streamable-http" && (server.headerKeys ?? []).includes("Authorization") ? (0, react_jsx_runtime.jsx)("span", {
                                            className: m.badge,
                                            title: server.oauth?.expiresAt ? t("authBadgeHint") + t("oauthStatusExpiresAt") + formatExpiryShort(server.oauth.expiresAt) : t("authBadgeHint"),
                                            children: t("authBadge")
                                        }) : null)
                                    ]
                                }), (0, react_jsx_runtime.jsx)("span", { className: m.spacer }), (0, react_jsx_runtime.jsx)("button", {
                                    type: "button",
                                    className: m.iconBtn,
                                    "aria-label": t("editTitle"),
                                    onClick: () => { if (!guardCard(server))
                                        return; setDialogError(null); setEditing({ server }); },
                                    children: gearIcon
                                })]
                        }), (0, react_jsx_runtime.jsxs)("div", {
                            className: m.meta,
                            children: [(0, react_jsx_runtime.jsx)("span", {
                                    className: m.dot,
                                    "data-on": server.enabled ? "true" : "false",
                                    "data-err": dotErr ? "true" : "false"
                                }), (0, react_jsx_runtime.jsx)("span", { children: t !== null ? cardMetaSummary(server) : "" })]
                        }), (0, react_jsx_runtime.jsxs)("div", {
                            className: m.actions,
                            children: [(0, react_jsx_runtime.jsxs)("span", {
                                    className: c.switchRow,
                                    children: [(0, react_jsx_runtime.jsx)("button", {
                                            type: "button",
                                            role: "switch",
                                            className: c.switch,
                                            "data-on": enabledHere ? "true" : void 0,
                                            "aria-checked": enabledHere,
                                            "aria-label": enabledHere ? t("disable") : t("enable"),
                                            disabled: server.disabledExpr === true,
                                            title: server.disabledExpr === true ? t("disabledExprHint") : void 0,
                                            onClick: () => applyToggle(server),
                                            children: (0, react_jsx_runtime.jsx)("span", { className: c.switchThumb })
                                        }), (0, react_jsx_runtime.jsx)("button", {
                                            type: "button",
                                            // 标签本身也要能点：否则「Disabled」看起来像控件的一部分，
                                            // 点上去却什么都不发生。
                                            className: c.switchText,
                                            disabled: server.disabledExpr === true,
                                            title: server.disabledExpr === true ? t("disabledExprHint") : (enabledHere ? t("disable") : t("enable")),
                                            onClick: () => applyToggle(server),
                                            children: t !== null ? (enabledHere ? t("stateEnabled") : t("stateDisabled")) : ""
                                        })]
                                }), (0, react_jsx_runtime.jsx)("span", { className: m.spacer }), (0, react_jsx_runtime.jsx)("button", {
                                    type: "button",
                                    className: m.actionBtn,
                                    title: t !== null ? t("rawEditHint") : "",
                                    onClick: () => openRaw(server),
                                    children: t !== null ? t("rawEdit") : ""
                                }), (0, react_jsx_runtime.jsx)("button", {
                                    type: "button",
                                    className: m.actionBtn,
                                    disabled: testing === server.serverName,
                                    onClick: () => applyTest(server),
                                    children: testing === server.serverName ? t !== null ? t("testing") : "" : t !== null ? t("test") : ""
                                }), (0, react_jsx_runtime.jsx)("button", {
                                    type: "button",
                                    className: m.actionBtn,
                                    "data-active": toolsOpen === server.serverName ? "true" : void 0,
                                    title: t("toolsButtonHint"),
                                    onClick: () => { openTools(server); },
                                    children: t("toolsButton")
                                }), confirming === cardKey(server) ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, {
                                    children: [
                                        (0, react_jsx_runtime.jsx)("button", {
                                            type: "button",
                                            className: m.actionBtn,
                                            onClick: () => setConfirming(null),
                                            children: t !== null ? t("cancel") : ""
                                        }),
                                        (0, react_jsx_runtime.jsx)("button", {
                                            type: "button",
                                            className: m.dangerBtn,
                                            "data-confirm": "true",
                                            onClick: () => applyRemove(server),
                                            children: t !== null ? t("confirmDelete") : ""
                                        })
                                    ]
                                }) : (0, react_jsx_runtime.jsx)("button", {
                                    type: "button",
                                    className: m.dangerBtn,
                                    onClick: () => applyRemove(server),
                                    children: t !== null ? t("delete") : ""
                                })]
                        }), oauthNotice !== null && oauthNotice !== undefined && oauthNotice.serverName === server.serverName ? (0, react_jsx_runtime.jsx)("div", {
                            className: m.result,
                            "data-ok": oauthNotice.ok ? "true" : "false",
                            children: oauthNotice.text
                        }) : null, toolsOpen === server.serverName ? toolPanel(server) : null, testResult !== null && testResult !== undefined && testResult.serverName === server.serverName ? (0, react_jsx_runtime.jsxs)("div", {
                            className: m.result,
                            "data-ok": testResult.result.ok ? "true" : "false",
                            children: [testResult.result.ok ? t !== null ? t("testOk").replace("{count}", String(testResult.result.tools?.length ?? 0)) : "" : t !== null ? t("testFailed") + " " + (testResult.result.error ?? "") : "", testResult.result.ok && Array.isArray(testResult.result.tools) ? (0, react_jsx_runtime.jsx)("div", { children: testResult.result.tools.map((tool) => tool.name).join(", ") }) : null]
                        }) : null]
                }, server.serverName);
            };
            /**
             * 单卡兜底（2.3.11）：一张卡片的数据形状不对时，只坏它自己。
             *
             * 宿主把整个 main 槽位当一棵树渲染，卡片又是在父组件 body 里 eager 调用的，
             * 所以卡片里抛一次 TypeError 就足够让整片主区变黑、连「返回会话」都点不到
             * （PR #87 现场：oauthNotice 与 server.serverName 同时是 undefined，
             * 可选链相等成立后读 null.ok）。判空挡住了那一处，这里兜住所有同类：
             * 出错只换成一张可读的错误卡，别的卡片和页面外壳照旧。
             */
            // ── 左轨：工作区（直接复用技能页的 rail 类，观感天然一致）──────
            const mcpRailRows = [
                { key: "global", label: t("mcpScopeGlobal"), count: servers.length },
                ...(Array.isArray(mcpWorkspaces) ? mcpWorkspaces : []).map((ws) => ({
                    key: ws.path,
                    label: typeof ws.label === "string" && ws.label !== "" ? ws.label : String(ws.path),
                    count: servers.reduce((sum, srv) => sum + (serverStateIn(srv, ws.path) !== "off" ? 1 : 0), 0)
                }))
            ];
            const mcpRailNode = (0, react_jsx_runtime.jsxs)("nav", {
                className: c.rail,
                "aria-label": t("railWorkspaces"),
                children: [(0, react_jsx_runtime.jsx)("div", { className: c.railHead, children: t("railWorkspaces") }), (0, react_jsx_runtime.jsx)("div", {
                        className: c.railList,
                        children: mcpRailRows.map((row) => (0, react_jsx_runtime.jsxs)("button", {
                            type: "button",
                            className: c.railItem,
                            "data-active": mcpScope === row.key ? "true" : void 0,
                            "aria-pressed": mcpScope === row.key,
                            title: row.label,
                            onClick: () => setMcpScope(row.key),
                            children: [(0, react_jsx_runtime.jsx)("span", { className: c.railItemName, children: row.label }), (0, react_jsx_runtime.jsx)("small", { className: c.railItemCount, children: String(row.count) })]
                        }, row.key))
                    })]
            });
            const safeServerCard = (server) => {
                try {
                    return serverCard(server);
                }
                catch (error) {
                    const label = typeof server?.serverName === "string" && server.serverName !== "" ? server.serverName : (t !== null ? t("cardErrorName") : "");
                    return (0, react_jsx_runtime.jsxs)("div", {
                        className: m.card,
                        "data-card-error": "true",
                        children: [(0, react_jsx_runtime.jsxs)("div", {
                                className: m.cardTop,
                                children: [(0, react_jsx_runtime.jsx)("span", { className: m.name, children: label }), (0, react_jsx_runtime.jsx)("span", { className: m.badge, children: t !== null ? t("cardErrorBadge") : "" })]
                            }), (0, react_jsx_runtime.jsx)("p", { className: m.sub, children: (t !== null ? t("cardErrorTitle") : "") + " " + String(error?.message ?? error) }), (0, react_jsx_runtime.jsx)("p", { className: m.hint, children: t !== null ? t("cardErrorHint") : "" })]
                    }, "card-error:" + label);
                }
            };
            return (0, react_jsx_runtime.jsxs)("div", {
                className: c.section + " " + m.section,
                "data-mcp-scope": mcpScope === "global" ? "global" : "workspace",
                children: [mcpRailNode, (0, react_jsx_runtime.jsxs)("div", {
                        className: c.mainScroll,
                        children: [(0, react_jsx_runtime.jsxs)("div", {
                                className: m.head,
                                children: [(0, react_jsx_runtime.jsx)("h3", { children: t !== null ? t("title") : "" }), (0, react_jsx_runtime.jsx)("button", {
                                        type: "button",
                                        className: m.actionBtn,
                                        "aria-expanded": docOpen,
                                        onClick: () => { setDocOpen((value) => !value); },
                                        children: t !== null ? t("docButton") : ""
                                    }), (0, react_jsx_runtime.jsx)("button", {
                                        type: "button",
                                        className: m.actionBtn,
                                        onClick: () => { reloadMcp().then((value) => { setData(value); }).catch(() => refresh(true)); },
                                        children: t !== null ? t("refresh") : ""
                                    })]
                            }), (0, react_jsx_runtime.jsx)("p", { className: m.sub, children: t !== null ? t("subtitle") : "" }),
                            docOpen ? (0, react_jsx_runtime.jsxs)("div", {
                                className: m.doc,
                                children: [(0, react_jsx_runtime.jsx)("h4", { children: t !== null ? t("docTitle") : "" }), (0, react_jsx_runtime.jsx)("p", { children: t !== null ? t("docLead") : "" }), (0, react_jsx_runtime.jsx)("pre", { className: m.docCode, children: t !== null ? t("docCode") : "" }), (0, react_jsx_runtime.jsx)("p", { children: t !== null ? t("docWhere") : "" }), (0, react_jsx_runtime.jsx)("p", { children: t !== null ? t("docTools") : "" }), (0, react_jsx_runtime.jsx)("p", { children: t !== null ? t("docEnv") : "" }), (0, react_jsx_runtime.jsx)("pre", { className: m.docCode, children: t !== null ? t("docEnvCode") : "" }), (0, react_jsx_runtime.jsx)("p", { children: t !== null ? t("docEnvNote") : "" }), (0, react_jsx_runtime.jsx)("p", { children: t !== null ? t("docSecret") : "" })]
                            }) : null, patch?.ok === false ? (0, react_jsx_runtime.jsxs)("div", {
                                className: c.notice,
                                "data-kind": "error",
                                children: [(0, react_jsx_runtime.jsx)("span", { className: c.noticeText, children: t !== null ? t("patchBroken") + " " + (patch.error ?? "") : "" }), (0, react_jsx_runtime.jsx)("button", {
                                        type: "button",
                                        className: c.noticeButton,
                                        onClick: () => refresh(true),
                                        children: t !== null ? t("retry") : ""
                                    })]
                            }) : null, foreignNotice.length > 0 ? (0, react_jsx_runtime.jsxs)("div", {
                                className: c.notice,
                                "data-kind": "info",
                                role: "status",
                                children: [(0, react_jsx_runtime.jsx)("span", {
                                        className: c.noticeText,
                                        children: foreignNotice.map((line, index) => (0, react_jsx_runtime.jsx)("span", {
                                            style: { display: "block" },
                                            children: line
                                        }, index))
                                    }), foreignOthers.length > 0 ? (0, react_jsx_runtime.jsx)("button", {
                                        type: "button",
                                        className: c.noticeButton,
                                        "data-action": "evacuate",
                                        disabled: evacBusy,
                                        onClick: applyEvacuate,
                                        children: t !== null ? t(evacBusy ? "foreignEvacuating" : "foreignEvacuate") : ""
                                    }) : null, (0, react_jsx_runtime.jsx)("button", {
                                        type: "button",
                                        className: c.noticeButton,
                                        "data-action": "foreign-doc",
                                        "aria-expanded": foreignDocOpen,
                                        onClick: () => { setForeignDocOpen((value) => !value); },
                                        children: t !== null ? t("foreignDoc") : ""
                                    }), (0, react_jsx_runtime.jsx)("button", {
                                        type: "button",
                                        className: c.noticeButton,
                                        onClick: () => { setRequest((value) => value + 1); },
                                        children: t !== null ? t("refresh") : ""
                                    })]
                            }) : null, foreignNotice.length > 0 && foreignDocOpen ? (0, react_jsx_runtime.jsxs)("div", {
                                className: m.doc,
                                children: [(0, react_jsx_runtime.jsx)("h4", { children: t !== null ? t("foreignDocTitle") : "" }), (0, react_jsx_runtime.jsx)("p", { children: t !== null ? t("foreignDocWhat") : "" }), (0, react_jsx_runtime.jsx)("p", { children: t !== null ? t("foreignDocWhy") : "" }), (0, react_jsx_runtime.jsx)("p", { children: t !== null ? t("foreignDocEffect") : "" }), (0, react_jsx_runtime.jsx)("p", { children: t !== null ? t("foreignDocKeep") : "" })]
                            }) : null, evacNotice !== null ? (0, react_jsx_runtime.jsxs)("div", {
                                className: c.notice,
                                "data-kind": "info",
                                role: "status",
                                children: [(0, react_jsx_runtime.jsx)("span", { className: c.noticeText, children: evacNotice }), (0, react_jsx_runtime.jsx)("button", {
                                        type: "button",
                                        className: c.noticeButton,
                                        onClick: () => { setEvacNotice(null); },
                                        children: t !== null ? t("close") : ""
                                    })]
                            }) : null, loadState.kind === "error" ? (0, react_jsx_runtime.jsxs)("div", {
                                className: c.notice,
                                "data-kind": "error",
                                children: [(0, react_jsx_runtime.jsx)("span", { className: c.noticeText, children: loadState.message }), (0, react_jsx_runtime.jsx)("button", {
                                        type: "button",
                                        className: c.noticeButton,
                                        onClick: () => refresh(true),
                                        children: t !== null ? t("retry") : ""
                                    })]
                            }) : null, (0, react_jsx_runtime.jsxs)("div", {
                                className: m.toolbar,
                                children: [(0, react_jsx_runtime.jsx)("input", {
                                        className: m.input,
                                        type: "search",
                                        "data-role": "server-search",
                                        value: mcpFilter,
                                        placeholder: t !== null ? t("searchPlaceholder") : "",
                                        "aria-label": t !== null ? t("searchPlaceholder") : "",
                                        style: { flex: "1", minWidth: "0" },
                                        onChange: (event) => setMcpFilter(event.currentTarget.value)
                                    }), (0, react_jsx_runtime.jsx)("button", {
                                        type: "button",
                                        className: m.add,
                                        onClick: () => { setDialogError(null); setEditing({ server: null }); },
                                        children: t !== null ? t("add") : ""
                                    }), mcpQuery === "" ? null : (0, react_jsx_runtime.jsx)("span", {
                                        className: m.hint,
                                        children: t !== null ? t("filteredCount").replace("{visible}", String(filteredServers.length)).replace("{total}", String(servers.length)) : ""
                                    })]
                            }), typeof listMcpGroups === "function" ? (0, react_jsx_runtime.jsxs)("div", {
                                className: m.groupRow,
                                children: [
                                    (0, react_jsx_runtime.jsxs)("button", {
                                        type: "button",
                                        className: m.groupChip,
                                        "data-active": mcpGroupFilter === "all" ? "true" : void 0,
                                        onClick: () => setMcpGroupFilter("all"),
                                        children: [t("groupAll"), (0, react_jsx_runtime.jsx)("span", { className: m.groupChipCount, children: String(servers.length) })]
                                    }),
                                    mcpGroups.map((grp) => {
                                        const count = servers.reduce((sum, srv) => sum + (Array.isArray(grp.servers) && grp.servers.includes(srv.serverName) ? 1 : 0), 0);
                                        return (0, react_jsx_runtime.jsxs)("button", {
                                            type: "button",
                                            className: m.groupChip,
                                            "data-active": mcpGroupFilter === grp.id ? "true" : void 0,
                                            onClick: () => setMcpGroupFilter(grp.id),
                                            children: [grp.name, (0, react_jsx_runtime.jsx)("span", { className: m.groupChipCount, children: String(count) })]
                                        }, grp.id);
                                    }),
                                    mcpGroups.length > 0 && ungroupedMcpCount > 0 ? (0, react_jsx_runtime.jsxs)("button", {
                                        type: "button",
                                        className: m.groupChip,
                                        "data-active": mcpGroupFilter === "" ? "true" : void 0,
                                        onClick: () => setMcpGroupFilter(""),
                                        children: [t("groupUngrouped"), (0, react_jsx_runtime.jsx)("span", { className: m.groupChipCount, children: String(ungroupedMcpCount) })]
                                    }) : null,
                                    (0, react_jsx_runtime.jsx)("button", {
                                        type: "button",
                                        className: m.groupChip,
                                        onClick: () => setMcpGroupDialog({ id: null, name: "", servers: new Set(), busy: false, error: null }),
                                        children: t("groupNew")
                                    }),
                                    activeMcpGroup !== undefined ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, {
                                        children: [
                                            (0, react_jsx_runtime.jsx)("button", {
                                                type: "button",
                                                className: m.actionBtn,
                                                disabled: groupToggleBusy,
                                                onClick: () => applyMcpGroupBulkToggle(activeMcpGroup),
                                                children: servers.filter((srv) => Array.isArray(activeMcpGroup.servers) && activeMcpGroup.servers.includes(srv.serverName) && srv.disabledExpr !== true).every((srv) => srv.enabled === true) ? t("groupDisableAll") : t("groupEnableAll")
                                            }),
                                            (0, react_jsx_runtime.jsx)("button", {
                                                type: "button",
                                                className: m.actionBtn,
                                                onClick: () => setMcpGroupDialog({ id: activeMcpGroup.id, name: activeMcpGroup.name, servers: new Set(activeMcpGroup.servers ?? []), busy: false, error: null }),
                                                children: t("groupEdit")
                                            })
                                        ]
                                    }) : null
                                ]
                            }) : null, loadState.kind === "loading" && servers.length === 0 ? (0, react_jsx_runtime.jsx)("p", { className: m.sub, children: t !== null ? t("loading") : "" }) : null, servers.length === 0 && loadState.kind === "ready" ? (0, react_jsx_runtime.jsx)("p", { className: m.sub, children: t !== null ? t("empty") : "" }) : null, servers.length > 0 && filteredServers.length === 0 ? (0, react_jsx_runtime.jsx)("p", { className: m.sub, children: mcpQuery === "" && activeMcpGroup !== undefined ? t("groupEmpty") : t("noMatch") }) : null, (0, react_jsx_runtime.jsx)("div", {
                                className: m.cards,
                                children: filteredServers.map((server) => safeServerCard(server))
                            }), editing !== null ? (0, react_jsx_runtime.jsx)(McpFormDialog, {
                                key: editing.server?.entryId ?? editing.server?.serverName ?? "__new__",
                                t: t !== null ? t : (key) => key,
                                initial: editing.server,
                                onSave: applySave,
                                onOAuthFlow: runOAuthFlowInDialog,
                                onOAuthRefresh: applyOAuthRefreshInDialog,
                                onOAuthDisconnect: applyOAuthDisconnectInDialog,
                                onCancel: () => setEditing(null),
                                busy: dialogBusy,
                                error: dialogError
                            }) : null, mcpGroupDialog !== null ? (0, react_jsx_runtime.jsx)("div", {
                                className: c.scopeOverlay,
                                role: "dialog",
                                "aria-modal": "true",
                                onClick: closeOnBackdrop(() => setMcpGroupDialog(null), mcpGroupDialog.busy),
                                children: (0, react_jsx_runtime.jsxs)("div", {
                                    className: c.scopeBox,
                                    children: [
                                        (0, react_jsx_runtime.jsx)("h4", { children: mcpGroupDialog.id === null ? t("groupNew") : t("groupEdit") }),
                                        (0, react_jsx_runtime.jsxs)("label", {
                                            className: m.field,
                                            children: [
                                                (0, react_jsx_runtime.jsx)("span", { className: m.label, children: t("groupName") }),
                                                (0, react_jsx_runtime.jsx)("input", {
                                                    className: m.input,
                                                    value: mcpGroupDialog.name,
                                                    placeholder: t("groupName"),
                                                    onChange: (event) => {
                                                        const val = event.currentTarget.value;
                                                        setMcpGroupDialog((prev) => prev === null ? null : { ...prev, name: val, error: null });
                                                    }
                                                })
                                            ]
                                        }),
                                        (0, react_jsx_runtime.jsxs)("div", {
                                            className: m.field,
                                            children: [
                                                (0, react_jsx_runtime.jsx)("span", { className: m.label, children: t("groupServers") }),
                                                (0, react_jsx_runtime.jsx)("div", {
                                                    className: m.toolsList,
                                                    children: servers.map((srv) => (0, react_jsx_runtime.jsxs)("label", {
                                                        className: m.toolRow,
                                                        children: [
                                                            (0, react_jsx_runtime.jsx)("input", {
                                                                type: "checkbox",
                                                                checked: mcpGroupDialog.servers.has(srv.serverName),
                                                                onChange: () => setMcpGroupDialog((prev) => {
                                                                    if (prev === null)
                                                                        return null;
                                                                    const next = new Set(prev.servers);
                                                                    if (next.has(srv.serverName))
                                                                        next.delete(srv.serverName);
                                                                    else
                                                                        next.add(srv.serverName);
                                                                    return { ...prev, servers: next };
                                                                })
                                                            }),
                                                            (0, react_jsx_runtime.jsx)("span", { className: m.toolName, children: srv.serverName })
                                                        ]
                                                    }, srv.entryId ?? srv.serverName))
                                                })
                                            ]
                                        }),
                                        mcpGroupDialog.error !== null ? (0, react_jsx_runtime.jsx)("div", {
                                            className: c.notice,
                                            "data-kind": "error",
                                            children: (0, react_jsx_runtime.jsx)("span", { className: c.noticeText, children: mcpGroupDialog.error })
                                        }) : null,
                                        (0, react_jsx_runtime.jsxs)("div", {
                                            className: c.scopeActions,
                                            children: [
                                                mcpGroupDialog.id !== null ? (0, react_jsx_runtime.jsx)("button", {
                                                    type: "button",
                                                    className: c.dangerBtn,
                                                    disabled: mcpGroupDialog.busy,
                                                    onClick: applyMcpGroupDelete,
                                                    children: t("groupDelete")
                                                }) : null,
                                                (0, react_jsx_runtime.jsx)("button", {
                                                    type: "button",
                                                    className: c.scopeAction + " " + c.scopeCancel,
                                                    disabled: mcpGroupDialog.busy,
                                                    onClick: () => setMcpGroupDialog(null),
                                                    children: t("cancel")
                                                }),
                                                (0, react_jsx_runtime.jsx)("button", {
                                                    type: "button",
                                                    className: c.scopeAction + " " + c.scopeConfirm,
                                                    disabled: mcpGroupDialog.busy,
                                                    onClick: applyMcpGroupSave,
                                                    children: t("save")
                                                })
                                            ]
                                        })
                                    ]
                                })
                            }) : null, rawEdit !== null ? (0, react_jsx_runtime.jsx)("div", {
                                className: c.scopeOverlay,
                                role: "dialog",
                                "aria-modal": "true",
                                onClick: closeOnBackdrop(() => setRawEdit(null), false),
                                children: (0, react_jsx_runtime.jsxs)("div", {
                                    className: c.scopeBox,
                                    children: [
                                        (0, react_jsx_runtime.jsx)("h4", { children: t !== null ? t("rawEditTitle") + " · " + rawEdit.serverName : rawEdit.serverName }),
                                        (0, react_jsx_runtime.jsx)("p", { className: m.hint, children: t !== null ? t("rawEditLead") : "" }),
                                        rawEdit.loading ? (0, react_jsx_runtime.jsx)("p", { className: m.sub, children: t !== null ? t("rawEditLoading") : "" }) : (0, react_jsx_runtime.jsx)("textarea", {
                                            className: m.rawText,
                                            value: rawEdit.text,
                                            spellCheck: false,
                                            onChange: (event) => {
                                                const value = event.target.value;
                                                setRawEdit((prev) => prev === null ? prev : { ...prev, text: value });
                                            }
                                        }),
                                        rawEdit.error !== undefined && rawEdit.error !== null ? (0, react_jsx_runtime.jsx)("div", {
                                            className: c.notice,
                                            "data-kind": "error",
                                            children: (0, react_jsx_runtime.jsx)("span", { className: c.noticeText, children: String(rawEdit.error) })
                                        }) : null,
                                        (0, react_jsx_runtime.jsxs)("div", {
                                            className: c.scopeActions,
                                            children: [
                                                (0, react_jsx_runtime.jsx)("button", {
                                                    type: "button",
                                                    className: c.scopeAction + " " + c.scopeCancel,
                                                    disabled: rawEdit.busy,
                                                    onClick: () => setRawEdit(null),
                                                    children: t !== null ? t("cancel") : ""
                                                }),
                                                (0, react_jsx_runtime.jsx)("button", {
                                                    type: "button",
                                                    className: c.scopeAction + " " + c.scopeConfirm,
                                                    disabled: rawEdit.busy || rawEdit.loading,
                                                    onClick: () => { applyRaw(); },
                                                    children: t !== null ? t("save") : ""
                                                })
                                            ]
                                        })
                                    ]
                                })
                            }) : null]
                    })]
            });
        }
        // ── 主页全局面板（sidebar.panellist + main）───────────────────────────
        // 宿主侧栏的「插件」那一行就是这两个槽位的产物：一个 list 槽位放图标/标题，
        // 一个 keyed 槽位放中央主区的整页内容。这里以同款方式把「技能」「MCP」挂进
        // 侧栏，点击即把中央主区切到对应页面（不是设置页那种模态框）。
        // 侧栏只占一行：技能与 MCP 合成一个入口（Skill/MCP），页签在面板内部切换。
        const PANEL_ID = "skill-mcp";
        /** 上次停留的页签；localStorage 不可用时静默退化为「技能」。 */
        const PANEL_TAB_KEY = "dsh-skill-mcp-panel:last-tab";
        function readLastTab() {
            try {
                return typeof localStorage !== "undefined" && localStorage.getItem(PANEL_TAB_KEY) === "mcp" ? "mcp" : "skills";
            }
            catch {
                return "skills";
            }
        }
        function writeLastTab(tab) {
            try {
                if (typeof localStorage !== "undefined")
                    localStorage.setItem(PANEL_TAB_KEY, tab);
            }
            catch {
                // 隐私模式等场景：记不住就算了，不影响面板本身。
            }
        }
        /**
         * 侧栏面板字形：技能 / MCP 合并成一个入口后共用同一枚图标。
         * 图形是内联 SVG 蒙版（见 cssPanelIcon），背景取 currentColor，
         * 尺寸与颜色都跟随宿主侧栏行（选中 / 折叠态自动变换）。
         */
        function PanelGlyph({ size }) {
            const edge = typeof size === "number" && size > 0 ? size : 16;
            return (0, react_jsx_runtime.jsx)("span", {
                className: "SKV_panelIcon SKV_panelIconMerged",
                "aria-hidden": "true",
                style: { width: edge, height: edge }
            });
        }
        function PanelIcon(props) {
            return (0, react_jsx_runtime.jsx)(PanelGlyph, { size: props.size });
        }
        /**
         * 页面左上角的返回箭头：回到会话视图。宿主 layout 服务的 `selectPanel(null)` 就是
         * 「把主区还给 Conversation」，而且它不改当前选中会话——面板本来也没换过会话，
         * 所以返回的就是进来之前那个会话。沿用宿主「面包屑」的外观（14px 左向折角 + 文案）。
         */
        function PageBack({ label, onBack }) {
            const chevron = primitiveIcon("IconChevronLeftOutlineRegular");
            const glyph = chevron !== void 0
                ? (0, react_jsx_runtime.jsx)(chevron, { size: 14 })
                : (0, react_jsx_runtime.jsx)("svg", {
                    width: 14,
                    height: 14,
                    viewBox: "0 0 16 16",
                    fill: "none",
                    "aria-hidden": "true",
                    children: (0, react_jsx_runtime.jsx)("path", { d: "M10 3.5 5.5 8l4.5 4.5", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" })
                });
            return (0, react_jsx_runtime.jsxs)("button", {
                type: "button",
                className: c.pageBack,
                title: label,
                onClick: onBack,
                children: [glyph, (0, react_jsx_runtime.jsx)("span", { children: label })]
            });
        }
        /** 技能页：返回箭头 + 页头 + 既有的技能面板。 */
        /**
         * 合并面板：返回箭头 + 「技能 / MCP」页签 + 当前页签的正文。
         *
         * 侧栏空间宝贵，两个面板本来就常一起用，所以只占一行；页签选择记在 localStorage，
         * 下次点开侧栏这一行时停在上次离开的那一页。
         */
        function CombinedPanelPage(props) {
            const t = props.t;
            const mt = props.mt;
            const tr = (key) => (t !== null && t !== undefined ? t(key) : "");
            const [tab, setTab] = react.useState(readLastTab);
            const select = (next) => {
                setTab(next);
                writeLastTab(next);
            };
            const tabButton = (id, label) => (0, react_jsx_runtime.jsx)("button", {
                type: "button",
                className: c.tab,
                "data-active": tab === id ? "true" : "false",
                "aria-pressed": tab === id,
                onClick: () => select(id),
                children: label
            }, id);
            // data-tab 只是给外壳样式用（cssShell）：
            //   技能页签 → 去掉页面内边距、整页交给三栏自己排版；
            //   MCP 页签 → 单列、内容放宽到 ~1040px（左轨与中栏随技能页签一起卸载）。
            // 页头与页签保持为页面的第 1、2 个孩子（槽位契约：test-panel-slots.mjs）。
            return (0, react_jsx_runtime.jsxs)("div", {
                className: c.page,
                "data-tab": tab,
                children: [(0, react_jsx_runtime.jsxs)("div", {
                        className: c.pageTop,
                        children: [(0, react_jsx_runtime.jsx)(PageBack, { label: tr("back"), onBack: props.backToConversation })]
                    }), (0, react_jsx_runtime.jsxs)("div", {
                        className: c.tabs,
                        role: "tablist",
                        children: [tabButton("skills", tr("nav")), tabButton("mcp", mt("nav"))]
                    }), tab === "mcp" ? (0, react_jsx_runtime.jsx)(McpSection, { ...props, t: mt }) : (0, react_jsx_runtime.jsx)(SkillsSection, { ...props })]
            });
        }
        // ── cordis 插件体 ─────────────────────────────────────────────────────
        const inject = ["slots", "locale", "remote", "sessions", "layout"];
        function apply(ctx) {
            // 字典注册（生命周期随插件 fiber）
            ctx.effect(() => ctx.locale.register(NS, { zh, en }), "ui-skill-mcp-panel: skill dictionaries");
            ctx.effect(() => ctx.locale.register(MCP_NS, { zh: mcpZh, en: mcpEn }), "ui-skill-mcp-panel: mcp dictionaries");
            const t = ctx.locale.bind(NS);
            const mt = ctx.locale.bind(MCP_NS);
            // 挂载远程贡献；所有远程调用都等待挂载完成后再取命名空间服务。
            const mount = ctx.remote.$mount(CONTRIBUTION);
            // 当前会话 id，仅用于把会话级项目作用域传给服务端；技能页不再以「是否
            // 打开会话」门控 UI。宿主客户端以「主视图引用计数」定义当前会话：
            //   sessions.list 快照的 byId[id].retainedBy.mainView > 0
            // （dsh-client-ui-session 的 isMain、settings-general 等用的都是这条判据）。
            // 该快照既没有 current 也没有 sessionId 字段，早先按
            // currentProvideInfo → selection → list.current 逐级探测的写法在本版恒为
            // undefined。这里按 mainView 引用判定，并保留历史探测作为其它外壳的兜底。
            // 都取不到时返回 undefined：服务端把 sessionId 视为可选，会回退全局注册表并
            // 自行枚举工作区，仅丢失会话级项目作用域，功能仍可用。
            const currentSessionId = () => {
                const sessions = ctx.get("sessions");
                const snapshotOf = (store) => store !== null && typeof store === "object" && typeof store.getSnapshot === "function" ? store.getSnapshot() : undefined;
                try {
                    const rows = snapshotOf(sessions?.list)?.byId;
                    if (rows) {
                        for (const id of Object.keys(rows)) {
                            const row = rows[id];
                            if (((row && row.retainedBy && row.retainedBy.mainView) || 0) > 0)
                                return id;
                        }
                    }
                }
                catch {
                    // 快照不可用：继续走下面的历史探测
                }
                for (const store of [sessions?.currentProvideInfo, sessions?.selection, sessions?.list]) {
                    const snapshot = snapshotOf(store);
                    const direct = snapshot?.sessionId;
                    if (typeof direct === "string" && direct !== "")
                        return direct;
                    const current = snapshot?.current;
                    if (typeof current === "string" && current !== "")
                        return current;
                }
                return undefined;
            };
            // 订阅「当前会话」变化：宿主 list 快照没有 current 字段，只能订阅它自行推导。
            const subscribeSession = (listener) => {
                const store = ctx.get("sessions")?.list;
                if (store === null || typeof store !== "object" || typeof store.subscribe !== "function")
                    return () => { };
                const dispose = store.subscribe(listener);
                return typeof dispose === "function" ? dispose : () => { };
            };
            const callRemote = async (method, ...args) => {
                await mount;
                const remote = ctx.get("remote.skillsViewer");
                const result = await remote[method](...args);
                if (!result.ok)
                    throw new Error("skillsViewer." + method + " failed: " + result.error.code + ": " + result.error.message);
                return result.value;
            };
            const callMcp = async (method, ...args) => {
                await mount;
                const remote = ctx.get("remote.skillMcpPanel");
                const result = await remote[method](...args);
                if (!result.ok)
                    throw new Error("skillMcpPanel." + method + " failed: " + result.error.code + ": " + result.error.message);
                return result.value;
            };
            // 返回会话：layout 服务由宿主 shell 提供（已声明进 inject）；取不到时箭头是空操作，
            // 不影响其它功能。
            const backToConversation = () => {
                const layout = ctx.get("layout");
                if (layout === null || typeof layout !== "object")
                    return;
                if (typeof layout.selectPanel === "function")
                    layout.selectPanel(null);
            };
            const sectionFace = () => ({
                backToConversation,
                currentSessionId,
                subscribeSession,
                listSkills: () => callRemote("list", currentSessionId()),
                listWorkspaces: () => callRemote("workspaces"),
                openFolder: (path) => callRemote("openFolder", path),
                loadContent: (name, scope) => callRemote("content", name, currentSessionId(), scope),
                setSkillEnabled: (name, enabled, scope) => callRemote("setEnabled", name, currentSessionId(), enabled, scope),
                batchMigrateSkill: (payload) => callRemote("batchMigrate", currentSessionId(), payload),
                listGroups: () => callRemote("groups"),
                saveGroupSkill: (payload) => callRemote("saveGroup", payload),
                deleteGroupSkill: (payload) => callRemote("deleteGroup", payload),
                checkUpdateRemote: () => callRemote("checkUpdate"),
                applyUpdateRemote: (payload) => callRemote("applyUpdate", payload),
                removeSkill: (name, scope) => callRemote("deleteSkill", name, currentSessionId(), scope),
                addSkill: (payload) => callRemote("addSkill", currentSessionId(), payload)
            });
            const mcpSectionFace = () => ({
                backToConversation,
                listMcp: () => callMcp("list"),
                saveMcp: (input, previousServerName, previousEntryId) => callMcp("save", { input, previousServerName, previousEntryId }),
                removeMcp: (serverName, entryId) => callMcp("removeServer", { serverName, entryId }),
                setEnabledMcp: (serverName, enabled, entryId) => callMcp("setEnabled", { serverName, enabled, entryId }),
                readRawMcp: (payload) => callMcp("readRaw", payload),
                writeRawMcp: (payload) => callMcp("writeRaw", payload),
                testMcp: (payload) => callMcp("test", payload),
                reloadMcp: () => callMcp("reload"),
                oauthStart: (payload) => callMcp("oauthStart", payload),
                oauthPoll: (payload) => callMcp("oauthPoll", payload),
                oauthRefresh: (payload) => callMcp("oauthRefresh", payload),
                oauthDisconnect: (payload) => callMcp("oauthDisconnect", payload),
                listMcpTools: (payload) => callMcp("listTools", payload),
                getToolFilter: () => callMcp("getToolFilter"),
                setToolFilter: (payload) => callMcp("setToolFilter", payload),
                listMcpGroups: () => callMcp("listGroups"),
                saveMcpGroup: (payload) => callMcp("saveGroup", payload),
                deleteMcpGroup: (payload) => callMcp("deleteGroup", payload),
                evacuateForeign: () => callMcp("evacuateForeign"),
            });
            // 技能与 MCP 合成一个侧栏入口：注入面同时带两边的动作与字典绑定，
            // 页面内部的页签决定渲染哪一个 section。
            const combinedFace = () => ({
                ...sectionFace(),
                ...mcpSectionFace(),
                t,
                mt
            });
            // 侧栏面板行：order 1 紧跟在宿主「插件」行（order 0）下方；
            // 行标题由侧栏从 label 投影，locale 变化时会重新投影。
            // 2026-10-15 定案：**只做侧栏一个入口**。曾经试过「入口位置开关 + 设置页页签」，
            // 但面板元素太多、设置页塞不下，两处渲染等于要维护两套前端，直接不要了。
            ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
                name: "sidebar.panellist",
                id: PANEL_ID,
                order: 1,
                label: () => t("navCombined"),
                locale: NS
            }, PanelIcon));
            // 中央主区页面：key 必须与上面的行 id 一致，选中缺失 key 宿主会直接抛错。
            ctx.slots.inject("main", () => ctx.slots.register({
                name: "main",
                key: PANEL_ID,
                locale: NS,
                inject: combinedFace
            }, CombinedPanelPage));
        }
        bundleModule.exports.NS = NS;
        bundleModule.exports.apply = apply;
        bundleModule.exports.inject = inject;
        const __panelPlugin = bundleModule.exports;
        const __vendorPlugins = [
            function (require) { // dsh-mcp-companion

    // The browser module table owns the React runtime; a build without it must
    // still keep the panel decoration working.
    let React
    try { React = require('react') } catch { React = undefined }

    const ENDPOINT = '/local-dsh-customizer/mcp-servers'
    const CLIENT_VERSION = '1.5.1'
    /** The Host's MCP resource bridge: never a user-chosen server. */
    const RESOURCE_BRIDGE_NAME = 'mcp-resource-servers'
    const CHIP_SLOT = 'conversation.hero.options'
    const CHIP_ID = 'mcp-companion.conversation'

    /** Methods the panel uses to change a row: refused for foreign servers. */
    const GUARDED = new Set(['save', 'removeServer', 'writeRaw'])
    /** Methods that answer with the panel's full list result. */
    const LIST_METHODS = new Set(['list', 'reload'])

    /** Objects already wrapped by this page's module instance. */
    const PATCHED_TARGETS = new WeakSet()
    /** Marks the wrapper function itself, so a reloaded bundle does not stack. */
    const PATCH_MARK = Symbol.for('dsh-customizer.patched-invoke')

    const inventory = { value: null, at: 0, pending: null }
    const foreign = new Map()
    const bridges = new Set()

    /** Fire-and-forget status report, visible in the route diagnostics. */
    function report(kind, text) {
      try {
        const url = ENDPOINT + '?diag=' + encodeURIComponent(String(kind))
          + '&text=' + encodeURIComponent(String(text ?? '').slice(0, 280))
          + '&client=' + CLIENT_VERSION
        fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' } }).catch(() => {})
      } catch {
        // Reporting must never break the UI.
      }
    }

    function fetchJson(url) {
      return fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' } })
        .then((response) => response.json())
    }

    /* ------------------------------------------------------------------ */
    /* 1. Skill/MCP panel decoration                                       */
    /* ------------------------------------------------------------------ */

    function refresh(force) {
      const now = Date.now()
      if (!force && inventory.value !== null && now - inventory.at < 5000) {
        return Promise.resolve(inventory.value)
      }
      if (inventory.pending !== null) return inventory.pending
      inventory.pending = fetch(ENDPOINT + '?client=' + CLIENT_VERSION, {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      })
        .then((response) => response.json())
        .then((payload) => remember(payload))
        .catch(() => inventory.value)
        .finally(() => { inventory.pending = null })
      return inventory.pending
    }

    /** Cache one inventory payload and rebuild the plugin-owned lookups. */
    function remember(payload) {
      if (payload === null || typeof payload !== 'object' || payload.ok !== true) return inventory.value
      inventory.value = payload
      inventory.at = Date.now()
      foreign.clear()
      bridges.clear()
      for (const server of Array.isArray(payload.servers) ? payload.servers : []) {
        if (server === null || typeof server !== 'object') continue
        if (server.source !== 'plugin' && server.source !== 'bridge') continue
        foreign.set(String(server.name), server)
        if (server.source === 'bridge') bridges.add(String(server.name))
      }
      return inventory.value
    }

    const ownerOf = (name) => {
      const server = foreign.get(name)
      return server !== undefined && typeof server.provider === 'string' ? server.provider : 'another plugin'
    }

    const messageOf = (name) =>
      name + ' is provided by ' + ownerOf(name)
      + ': it has no @deepseek-ai/dsh-mcp-client row in cordis.patch.yml. '
      + 'The panel shows it read-only; configure it in the settings of that plugin.'

    const rawTextOf = (name) =>
      '# ' + name + ' \u2014 server provided by ' + ownerOf(name) + '\n'
      + '#\n'
      + '# That server is mounted by the plugin itself (ctx.plugin(@deepseek-ai/dsh-mcp-client)),\n'
      + '# so on purpose there is no @deepseek-ai/dsh-mcp-client row here.\n'
      + '# Adding one would start a second server. Use the settings of that plugin.\n'

    /** `serverName` from the args of a namespace method, whichever shape it uses. */
    function serverNameOf(args) {
      const first = Array.isArray(args) ? args[0] : undefined
      if (typeof first === 'string') return first
      if (first !== null && typeof first === 'object') {
        if (typeof first.serverName === 'string') return first.serverName
        if (typeof first.previousServerName === 'string') return first.previousServerName
        if (first.input !== null && typeof first.input === 'object' && typeof first.input.serverName === 'string') {
          return first.input.serverName
        }
      }
      return undefined
    }

    /** The view one live foreign server contributes to the panel list. */
    function viewOf(server) {
      return {
        serverName: String(server.name),
        transport: server.transport === 'http' ? 'streamable-http' : server.transport === 'stdio' ? 'stdio' : 'unknown',
        enabled: server.enabled !== false,
        // The switch is ours: it denies the server's tools while off.
        disabledExpr: false,
        envKeys: [],
        headerKeys: [],
        managed: true,
        orphan: true,
        toolCallTimeoutMs: 90000,
        failOnStartupError: false,
        reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30000, maxAttempts: 10 },
        fiberPhase: server.active === true ? 'active' : 'pending',
        toolCount: typeof server.toolCount === 'number' ? server.toolCount : 0,
      }
    }

    /** Only a result with both a servers array and a patch block is the panel's list. */
    function isMcpList(envelope) {
      if (envelope === null || typeof envelope !== 'object' || envelope.ok !== true) return false
      const data = envelope.value
      return data !== null && typeof data === 'object'
        && Array.isArray(data.servers)
        && data.patch !== null && typeof data.patch === 'object'
    }

    function augmentList(envelope) {
      const data = envelope.value
      const servers = Array.isArray(data.servers) ? data.servers : []
      return refresh(false).then((payload) => {
        if (payload === null) return envelope
        const rows = Array.isArray(payload.servers) ? payload.servers : []
        const fresh = new Map()
        for (const server of rows) {
          if (server === null || typeof server !== 'object') continue
          if (server.source !== 'plugin' && server.source !== 'bridge') continue
          fresh.set(String(server.name), viewOf(server))
        }
        if (fresh.size === 0) return envelope
        // Replace our own stale entries (a previous bundle may have written
        // them), then append servers the list does not know yet.
        const merged = servers.map((server) => {
          const name = String(server?.serverName ?? '')
          const replacement = fresh.get(name)
          return replacement !== undefined && server?.orphan === true ? replacement : server
        })
        const present = new Set(merged.map((server) => String(server?.serverName ?? '')))
        const additions = [...fresh.values()].filter((view) => !present.has(view.serverName))
        if (additions.length === 0 && merged.every((server, index) => server === servers[index])) return envelope
        return { ...envelope, value: { ...data, servers: [...merged, ...additions] } }
      })
    }

    /** Tool list of the MCP resource bridge: its tools carry no mcp__ prefix. */
    function bridgeToolsOf(name) {
      return refresh(false).then((payload) => {
        const server = payload !== null && Array.isArray(payload.servers)
          ? payload.servers.find((row) => row !== null && row.name === name)
          : undefined
        const tools = (Array.isArray(server?.tools) ? server.tools : []).map((tool) => ({
          name: String(tool?.name ?? ''),
          description: typeof tool?.description === 'string' ? tool.description : '',
        }))
        return {
          ok: true,
          value: { serverName: name, tools, disabled: [], connected: tools.length > 0 },
        }
      })
    }

    function testOf(name) {
      return refresh(false).then((payload) => {
        const server = payload !== null && Array.isArray(payload.servers)
          ? payload.servers.find((row) => row !== null && row.name === name)
          : undefined
        const prefix = 'mcp__' + name + '__'
        const tools = (Array.isArray(server?.tools) ? server.tools : []).map((tool) => ({
          name: typeof tool?.name === 'string' && tool.name.startsWith(prefix) ? tool.name.slice(prefix.length) : String(tool?.name ?? ''),
          description: typeof tool?.description === 'string' ? tool.description : '',
        }))
        return tools.length === 0
          ? { ok: false, error: { code: 'plugin-managed', message: messageOf(name) } }
          : { ok: true, value: { ok: true, tools } }
      })
    }

    /** Requested state from either call shape: `(name, enabled)` or `({ serverName, enabled })`. */
    function enabledOf(args) {
      const first = Array.isArray(args) ? args[0] : undefined
      if (first !== null && typeof first === 'object' && typeof first.enabled === 'boolean') return first.enabled
      return args[1] === true
    }

    /** Flip one plugin-owned server; the Host persists it and denies its tools. */
    function toggleOf(name, wanted) {
      const url = ENDPOINT + '?toggle=' + encodeURIComponent(name) + '&enabled=' + (wanted ? 'true' : 'false')
      return fetchJson(url)
        .then((payload) => {
          const fresh = remember(payload)
          const server = fresh !== null && Array.isArray(fresh.servers)
            ? fresh.servers.find((row) => row !== null && row.name === name)
            : undefined
          if (server === undefined) {
            return { ok: false, error: { code: 'toggle-failed', message: 'server not found after the switch: ' + name } }
          }
          return { ok: true, value: viewOf(server) }
        })
        .catch((error) => ({
          ok: false,
          error: { code: 'toggle-failed', message: String(error?.message ?? error) },
        }))
    }

    /** Rewrite the answer of one call; everything else passes through. */
    function decorate(method, args, pending) {
      const name = serverNameOf(args)
      if (typeof method !== 'string' || name === undefined || !foreign.has(name)) return pending
      if (method === 'setEnabled') return toggleOf(name, enabledOf(args))
      if (GUARDED.has(method)) {
        return Promise.resolve({ ok: false, error: { code: 'plugin-managed', message: messageOf(name) } })
      }
      if (method === 'readRaw') {
        return Promise.resolve({ ok: true, value: { text: rawTextOf(name) } })
      }
      if (method === 'test') return testOf(name)
      return pending
    }

    /** The patched `invoke` body: rewrite list/reload results and guards only. */
    function afterInvoke(descriptor, values, pending) {
      let method
      try { method = descriptor?.method } catch { return pending }
      if (typeof method !== 'string') return pending
      if (LIST_METHODS.has(method)) {
        return pending.then((envelope) => isMcpList(envelope) ? augmentList(envelope) : envelope)
      }
      if (method === 'listTools') {
        const name = values?.[0]?.serverName
        if (typeof name === 'string' && bridges.has(name)) return bridgeToolsOf(name)
      }
      return decorate(method, values, pending)
    }

    /** `invoke(descriptor, projection, token, callerCtx, values, boundIdentity)` */
    function invokeHook(args, pending) {
      return afterInvoke(args[0], args[4], pending)
    }

    /** `invokeRemote(direct, scoped, callerCtx, values)` */
    function namespaceHook(args, pending) {
      const descriptor = (args[0] ?? args[1])?.descriptor
      return afterInvoke(descriptor, args[3], pending)
    }

    /** Replace `target[key]` with a wrapper that post-processes the returned promise. */
    function tryPatch(target, key, hook) {
      if (PATCHED_TARGETS.has(target)) return true
      let current
      try { current = target[key] } catch { return false }
      if (typeof current === 'function' && current[PATCH_MARK] === true) {
        PATCHED_TARGETS.add(target)
        return true
      }
      let descriptor
      try { descriptor = Object.getOwnPropertyDescriptor(target, key) } catch { return false }
      if (descriptor === undefined || typeof descriptor.value !== 'function' || descriptor.writable !== true) return false
      const original = descriptor.value
      let wrapper
      try {
        wrapper = function patched() {
          return hook(arguments, original.apply(this, arguments))
        }
        wrapper[PATCH_MARK] = true
        target[key] = wrapper
      } catch {
        return false
      }
      let ok = false
      try { ok = target[key] === wrapper } catch { ok = false }
      if (!ok) return false
      PATCHED_TARGETS.add(target)
      return true
    }

    /**
     * Patch the Remote service once. The class method `invoke` is the funnel of
     * every generated namespace method, so a namespace rename, a panel update
     * or a re-mount does not drop the decoration.
     */
    function install(ctx) {
      let remote
      try {
        remote = typeof ctx.get === 'function' ? ctx.get('remote') : undefined
      } catch {
        return false
      }
      if (remote === undefined || remote === null) return false
      if (PATCHED_TARGETS.has(remote)) return true

      let done = false
      // The service instance, when its own `invoke` is writable.
      done = tryPatch(remote, 'invoke', invokeHook) || done

      // Every prototype in the chain that owns `invoke` (the class method).
      let proto = remote
      for (let depth = 0; depth < 6 && proto !== null && proto !== undefined; depth += 1) {
        try { proto = Object.getPrototypeOf(proto) } catch { break }
        if (proto === null || proto === undefined) break
        let own
        try { own = Object.getOwnPropertyDescriptor(proto, 'invoke') } catch { own = undefined }
        if (own !== undefined && typeof own.value === 'function') {
          done = tryPatch(proto, 'invoke', invokeHook) || done
        }
      }

      // Each mounted MCP namespace's own `invokeRemote` hook, as a fallback.
      try {
        const map = remote.namespaces
        if (map !== undefined && map !== null && typeof map.forEach === 'function') {
          map.forEach((handle) => {
            const service = handle?.service
            if (service === undefined || service === null || PATCHED_TARGETS.has(service)) return
            if (typeof service.invokeRemote !== 'function') return
            const methods = service.methods
            if (methods === undefined || typeof methods.has !== 'function') return
            if (!methods.has('list') && !methods.has('reload')) return
            if (!methods.has('test') || !methods.has('setEnabled')) return
            try {
              const original = service.invokeRemote.bind(service)
              service.invokeRemote = function patchedInvokeRemote(direct, scoped, callerCtx, args) {
                return namespaceHook(arguments, original(direct, scoped, callerCtx, args))
              }
              PATCHED_TARGETS.add(service)
              done = true
            } catch {
              // Not writable in this build; the prototype patch already covers it.
            }
          })
        }
      } catch {
        // Namespace map is private in this build.
      }

      return done
    }

    /* ------------------------------------------------------------------ */
    /* 2. Conversation MCP chip                                            */
    /* ------------------------------------------------------------------ */

    const CHIP_CSS = [
      '.dsh-mcp-chip-host{display:inline-flex;align-items:center;min-width:0}',
      '.dsh-mcp-chip{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;',
      'border-radius:9px;border:1px solid transparent;background:transparent;',
      'color:var(--dsw-alias-label-primary);',
      'font:inherit;font-size:13px;font-weight:600;line-height:1;cursor:pointer;white-space:nowrap;',
      'transition:background .12s ease,border-color .12s ease}',
      '.dsh-mcp-chip:hover,.dsh-mcp-chip[aria-expanded="true"]{background:var(--dsw-alias-bg-layer-2, #2c2c2e)}',
      '.dsh-mcp-chip .dsh-mcp-chev{transition:transform .15s ease}',
      '.dsh-mcp-chip[aria-expanded="true"] .dsh-mcp-chev{transform:rotate(180deg)}',
      '.dsh-mcp-menu{position:fixed;z-index:2147483000;box-sizing:border-box;width:320px;max-height:60vh;',
      'display:flex;flex-direction:column;padding:6px;border-radius:12px;',
      'border:1px solid var(--dsw-alias-border-l2, #3a3a3e);background:var(--dsw-alias-bg-layer-2, #2c2c2e);',
      'box-shadow:0 16px 40px rgba(0,0,0,.45);color:var(--dsw-alias-label-primary);font-size:13px}',
      '.dsh-mcp-head{display:flex;align-items:center;justify-content:space-between;gap:8px;',
      'padding:6px 8px 8px;font-size:11px;font-weight:600;letter-spacing:.04em;',
      'text-transform:uppercase;color:var(--dsw-alias-label-secondary)}',
      '.dsh-mcp-head-total{font-weight:600;letter-spacing:0;text-transform:none;',
      'font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}',
      '.dsh-mcp-head-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-mcp-tokens{font-size:11px;color:var(--dsw-alias-label-secondary);',
      'font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}',
      '.dsh-mcp-list{overflow:auto;min-height:0;display:flex;flex-direction:column;gap:2px}',
      '.dsh-mcp-row{display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;',
      'cursor:pointer;user-select:none;outline:none}',
      '.dsh-mcp-row:hover,.dsh-mcp-row:focus-visible{background:rgba(255,255,255,.06)}',
      '.dsh-mcp-row[data-locked="true"]{cursor:default;opacity:.55}',
      '.dsh-mcp-row[data-locked="true"]:hover{background:transparent}',
      '.dsh-mcp-text{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}',
      '.dsh-mcp-name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-mcp-sub{font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;',
      'text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-mcp-switch{position:relative;width:30px;height:17px;border-radius:99px;flex:none;box-sizing:border-box;',
      'background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.10);',
      'transition:background .15s ease,border-color .15s ease}',
      '.dsh-mcp-switch::after{content:"";position:absolute;top:2px;left:2px;width:11px;height:11px;',
      'border-radius:50%;background:var(--dsw-alias-label-secondary, #9aa0a6);',
      'transition:transform .15s ease,background .15s ease}',
      '.dsh-mcp-switch[data-on="true"]{background:var(--dsw-alias-label-primary, #f2f2f2);border-color:transparent}',
      '.dsh-mcp-switch[data-on="true"]::after{transform:translateX(13px);',
      'background:var(--dsw-alias-bg-base, #151517)}',
      '.dsh-mcp-switch[data-busy="true"]{opacity:.55}',
      '.dsh-mcp-busy{animation:dsh-mcp-pulse 1s ease-in-out infinite}',
      '@keyframes dsh-mcp-pulse{0%,100%{opacity:.45}50%{opacity:1}}',
      '.dsh-mcp-note{padding:10px 8px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.45}',
      '.dsh-mcp-foot{padding:8px 8px 2px;font-size:11px;line-height:1.45;color:var(--dsw-alias-label-secondary);',
      'border-top:1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.08));margin-top:4px}',
    ].join('')

    const PLUG_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
      + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0V8zM12 18v4"/></svg>'
    const CHEVRON = '<svg class="dsh-mcp-chev" width="12" height="12" viewBox="0 0 24 24" fill="none"'
      + ' stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"'
      + ' aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>'

    function ensureStyles() {
      try {
        const existing = document.getElementById('dsh-mcp-companion-styles')
        if (existing !== null) {
          // A reloaded bundle keeps the previous sheet in the head; refresh its
          // content so new rules apply without a page reload.
          if (existing.textContent !== CHIP_CSS) existing.textContent = CHIP_CSS
          return
        }
        const style = document.createElement('style')
        style.id = 'dsh-mcp-companion-styles'
        style.textContent = CHIP_CSS
        document.head.appendChild(style)
      } catch {
        // A page without a head still gets the chip, just unstyled.
      }
    }

    const labelOf = (server) => String(server?.name ?? '')

    /** Compact token count: 812, 3.4k, 12k. */
    function formatTokens(value) {
      const number = typeof value === 'number' && Number.isFinite(value) ? value : 0
      if (number <= 0) return ''
      if (number >= 10000) return Math.round(number / 1000) + 'k tok'
      if (number >= 1000) {
        const short = (Math.round(number / 100) / 10).toFixed(1)
        return (short.endsWith('.0') ? short.slice(0, -2) : short) + 'k tok'
      }
      return String(number) + ' tok'
    }

    /**
     * The weight to print for one server.
     *
     * A server whose tools are mostly switched off costs a fraction of its full
     * schema weight, so the active figure wins whenever the two differ, and the
     * untouched total moves to the tooltip.
     */
    function weightOf(server) {
      const total = typeof server?.tokens === 'number' ? server.tokens : 0
      const active = typeof server?.activeTokens === 'number' ? server.activeTokens : null
      if (active === null || active === total) {
        return { value: total, title: 'Weight of the schemas of this server in the context' }
      }
      return {
        value: active,
        title: 'Weight of the schemas this server actually sends now: ' + formatTokens(active)
          + ' of ' + formatTokens(total) + ' when every tool is on',
      }
    }

    function subtitleOf(server) {
      const parts = []
      const count = typeof server?.toolCount === 'number' ? server.toolCount : 0
      // The live count sits right beside the total, because a card reading
      // "69 tools" while 68 are switched off misleads about what the model
      // actually receives.
      const active = typeof server?.activeToolCount === 'number' ? server.activeToolCount : null
      const live = active !== null && active !== count ? ' (' + String(active) + ' active)' : ''
      parts.push(count + (count === 1 ? ' tool' : ' tools') + live)
      if (server?.source === 'bridge') parts.push('MCP resources')
      else if (typeof server?.provider === 'string' && server.provider.length > 0) parts.push(server.provider)
      // The disabled wording is added by the caller, once, with the reason.
      if (server?.disabled === true) { /* handled by the caller */ }
      else if (server?.override === 'on') parts.push('enabled here')
      else if (server?.override === 'off') parts.push('disabled here')
      else if (server?.globalEnabled === false) parts.push('disabled everywhere')
      return parts.join(' \u00b7 ')
    }

    /**
     * Build the chip button inside `node` and return its disposer. The button
     * lives in the slot's flow; the menu is appended to <body> so no ancestor
     * can clip it, and is positioned from the button's rect.
     */
    function mountChip(node, sessionId) {
      if (node === null || node === undefined || typeof node.appendChild !== 'function') return undefined
      ensureStyles()
      // Read by the preset-menu badge below: it needs the Session whose cost
      // the token estimator already prices.
      try {
        if (typeof sessionId === 'string' && sessionId.length > 0) node.setAttribute('data-mcpc-session', sessionId)
        else node.removeAttribute('data-mcpc-session')
      } catch { /* a node that refuses attributes must not block the chip */ }

      // Which servers have a write in flight. Kept outside the DOM because the
      // list is rebuilt on every poll: a row-local flag vanished on the next
      // render, which is why the indicator never showed up.
      const busyServers = new Set()
      /** When each key started writing, so the indicator can hold a minimum. */
      const busySince = new Map()
      const MIN_BUSY_MS = 600

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'dsh-mcp-chip'
      button.title = 'MCP for this conversation'
      button.setAttribute('aria-haspopup', 'dialog')
      button.setAttribute('aria-expanded', 'false')
      button.innerHTML = PLUG_ICON + '<span>MCP</span>' + CHEVRON
      node.appendChild(button)

      // The row's option group is right-aligned, so a chip registered there
      // lands at the far right. `position: relative` plus a negative `left`
      // moves only the painted box: no layout change, so no feedback loop and
      // nothing else in the row moves. The anchor is the element that precedes
      // this chip's group (the workspace and preset controls), found by walking
      // up until a preceding sibling exists - never by matching its text, so a
      // locale or label change cannot break it.
      let shift = 0

      /**
       * The control the chip should follow: the last compact element before
       * this chip's group in the row. Wide layout spacers are skipped, so a
       * `justify-content: space-between` row and a row of plain siblings both
       * resolve to the workspace/preset cluster.
       */
      /**
       * The first painted box at or inside `el`. Slot renderers may wrap an
       * occupant in a `display: contents` element, whose own rect is empty:
       * looking only at the wrapper's rect makes the real control invisible to
       * the anchor search.
       */
      function boxOf(el, depth) {
        let rect
        try { rect = el.getBoundingClientRect() } catch { return null }
        if (rect !== null && rect !== undefined && (rect.width > 0 || rect.height > 0)) return rect
        if (depth <= 0) return null
        let children
        try { children = el.children } catch { return null }
        if (children === null || children === undefined || typeof children.length !== 'number') return null
        for (const child of children) {
          const inner = boxOf(child, depth - 1)
          if (inner !== null) return inner
        }
        return null
      }

      function anchorOf() {
        const own = button.getBoundingClientRect()
        // Use the flow position, not the painted one: the applied offset must
        // never make the real anchor look too far away, or the search falls
        // back to an earlier control and the two steal the chip from each other.
        const flowLeft = own.left - shift
        const centre = (own.top + own.bottom) / 2
        let cursor = node
        for (let depth = 0; depth < 4 && cursor !== null && cursor !== undefined; depth += 1) {
          const parent = cursor.parentElement
          if (parent === null) break
          let sibling = cursor.previousElementSibling
          while (sibling !== null) {
            const rect = boxOf(sibling, 3)
            if (rect !== null) {
              const sameLine = Math.abs(((rect.top + rect.bottom) / 2) - centre) <= 40
              const controlLike = rect.width > 12 && rect.width < 760 && rect.height >= 18 && rect.height <= 72
              // A real gap means this is the row's free space, not a tight
              // neighbour: only such a control is worth following.
              if (sameLine && controlLike && (flowLeft - rect.right) >= 60) return rect
            }
            sibling = sibling.previousElementSibling
          }
          cursor = parent
        }
        return null
      }

      function align() {
        try {
          const anchor = anchorOf()
          const own = button.getBoundingClientRect()
          if (own.width === 0) return
          if (anchor === null) {
            if (shift !== 0) {
              shift = 0
              node.style.left = ''
            }
            return
          }
          const a = anchor
          if (a.width < 12) return
          // The flow position is the measured left minus whatever offset this
          // function already applied, so repeated calls converge on the same
          // target instead of accumulating.
          const base = own.left - shift
          const target = a.right + 2
          let next = target - base
          if (Math.abs(next) < 2) next = 0
          // Never push the chip rightwards over a neighbour, never off the row.
          if (next > 6 || base + next < 4) return
          if (Math.abs(next - shift) < 0.5) return
          shift = next
          node.style.position = 'relative'
          node.style.zIndex = '2'
          node.style.left = shift + 'px'
          // Diagnostics only: proves which control the chip was seated after.
          report('align', Math.round(shift) + '|' + Math.round(a.width) + '|' + Math.round(a.right))
        } catch {
          // Layout unavailable: leave the chip where the slot put it.
        }
      }

      align()
      // The mode preset mounts its own control asynchronously, so the row is
      // still incomplete on the first frame. A throttled animation loop keeps
      // re-measuring while the hero is on screen: it snaps into place as soon
      // as the preset exists, with no timers to tune and no observers on
      // another plugin's subtree.
      let frame = 0
      let ticks = 0
      let stopped = false
      const step = () => {
        if (stopped) return
        frame = requestAnimationFrame(step)
        ticks += 1
        if (ticks % 5 !== 0) return
        try { align() } catch { /* align already guards itself */ }
      }
      if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(step)
      window.addEventListener('resize', align)

      let menu = null
      let timer = null
      let payload = null

      const hasSession = typeof sessionId === 'string' && sessionId.length > 0

      function urlFor(extra) {
        const params = []
        if (hasSession) params.push('session=' + encodeURIComponent(sessionId))
        params.push('client=' + CLIENT_VERSION)
        if (typeof extra === 'string' && extra.length > 0) params.push(extra)
        return ENDPOINT + '?' + params.join('&')
      }

      function place() {
        if (menu === null) return
        const rect = button.getBoundingClientRect()
        const width = 320
        const height = menu.offsetHeight || 260
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
        let top = rect.bottom + 8
        if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 8)
        menu.style.left = left + 'px'
        menu.style.top = top + 'px'
      }

      function note(text) {
        const element = document.createElement('div')
        element.className = 'dsh-mcp-note'
        element.textContent = text
        return element
      }

      /**
       * Collapse servers whose names differ only in case or punctuation.
       *
       * Two rows for one server is what a panel-added declaration beside a
       * pre-existing one looks like: `Gitlab` and `gitlab`. They are the same
       * server to the reader, so they get one row and one switch.
       */
      function groupServers(list) {
        const byKey = new Map()
        for (const server of list) {
          const name = labelOf(server)
          const key = String(name).toLowerCase().replace(/[^a-z0-9]/g, '')
          const group = byKey.get(key)
          if (group === undefined) byKey.set(key, { key, members: [server] })
          else group.members.push(server)
        }
        const groups = []
        for (const group of byKey.values()) {
          // The healthiest declaration names the row: a disabled duplicate must
          // not hide a working one.
          const score = (server) => (server?.disabled === true ? 0 : 4)
            + (server?.active === true ? 2 : 0)
            + (server?.enabled === false ? 0 : 1)
          const primary = group.members.slice().sort((a, b) => score(b) - score(a))[0]
          groups.push({
            key: group.key,
            primary,
            members: group.members,
            names: group.members.map((server) => labelOf(server)),
          })
        }
        groups.sort((a, b) => String(labelOf(a.primary)).localeCompare(String(labelOf(b.primary))))
        return groups
      }

      /**
       * Confine freshly loaded servers to this conversation.
       *
       * A server that has just been loaded needs a moment before its tools
       * exist; the attempt is retried a few times rather than declaring a
       * failure that is only a slow start.
       */
      function confineToSession(names, attempt) {
        if (!hasSession) { flipAll(names, true); return }
        const scopeOne = (index) => {
          if (index >= names.length) {
            render()
            return
          }
          fetchJson(urlFor('scopeServer=' + encodeURIComponent(names[index])))
            .then((result) => {
              if (result?.ok === true) { scopeOne(index + 1); return }
              if (result?.retry === true && attempt < 8) {
                window.setTimeout(() => { confineToSession(names, attempt + 1) }, 500)
                return
              }
              render()
            })
            .catch(() => { render() })
        }
        scopeOne(0)
      }

      /**
       * Deny a freshly loaded server everywhere, then allow it here.
       *
       * The tools only exist once the plugin is loaded, so the confinement is
       * what turns a profile-wide load into a conversation-scoped activation.
       * Retried while the server finishes registering its tools.
       */
      function confineToSession(names, attempt) {
        if (!hasSession) { render(); return }
        const tries = typeof attempt === 'number' ? attempt : 0
        const scopeOne = (index) => {
          if (index >= names.length) { render(); void load(); return }
          fetchJson(urlFor('scopeServer=' + encodeURIComponent(names[index])))
            .then((result) => {
              if (result?.ok === true) { scopeOne(index + 1); return }
              if (result?.retry === true && tries < 10) {
                window.setTimeout(() => { confineToSession(names, tries + 1) }, 600)
                return
              }
              report('chip-scope', String(result?.error ?? 'failed'))
              render()
              void load()
            })
            .catch((error) => { report('chip-scope', String(error?.message ?? error)); render() })
        }
        scopeOne(0)
      }

      /**
       * Turn every declaration of one server on or off for this conversation.
       *
       * Written per tool name: that is the unit the deny list and
       * `tools.restrict` work with, so a server name would change nothing.
       */
      function flipAll(names, wanted, attempt, onDone) {
        if (!hasSession) {
          report('chip-toggle', 'no session: nothing to override')
          return
        }
        const tries = typeof attempt === 'number' ? attempt : 0
        const steps = names.map((name) => fetchJson(urlFor(
          'toggleServer=' + encodeURIComponent(name) + '&enabled=' + (wanted ? 'true' : 'false'),
        )))
        Promise.all(steps)
          .then((results) => {
            const failed = results.find((next) => next !== null && typeof next === 'object' && next.ok !== true)
            if (failed !== undefined) {
              // A server that has not registered its tools yet cannot be
              // switched: the write is retried while it starts up, instead of
              // failing where the reader cannot see it.
              if (failed.retry === true && tries < 8) {
                window.setTimeout(() => { flipAll(names, wanted, tries + 1, onDone) }, 700)
                return
              }
              report('chip-toggle', String(failed.error ?? 'failed'))
              if (typeof onDone === 'function') onDone(false)
              void load()
              return
            }
            if (typeof onDone === 'function') onDone(true)
            render()
            void load()
          })
          .catch((error) => {
            report('chip-toggle', String(error?.message ?? error))
            if (typeof onDone === 'function') onDone(false)
            render()
          })
      }

      function rowElement(group) {
        const server = group.primary
        const row = document.createElement('div')
        row.className = 'dsh-mcp-row'
        row.setAttribute('role', 'menuitemcheckbox')
        // The switch reports what this conversation can actually use, not
        // whether the plugin is loaded: a server loaded once and confined to
        // another conversation has zero live tools here, and must read as off.
        // A server that reports no tool at all has simply not connected yet, so
        // its profile state speaks; only a loaded server with everything denied
        // here counts as off.
        const liveTools = (member) => {
          const active = member?.activeToolCount
          const total = member?.toolCount
          if (typeof active === 'number' && typeof total === 'number' && total > 0) return active
          return member?.enabled === false ? 0 : 1
        }
        const on = group.members.some((member) => liveTools(member) > 0)
        // Declared before its first use: reading it earlier in this function
        // threw a temporal-dead-zone error and emptied the whole list.
        const profileOff = group.members.some((member) => member?.disabled === true)
        row.setAttribute('aria-checked', String(on))

        const text = document.createElement('div')
        text.className = 'dsh-mcp-text'
        const name = document.createElement('div')
        name.className = 'dsh-mcp-name'
        name.textContent = labelOf(server)
        const sub = document.createElement('div')
        sub.className = 'dsh-mcp-sub'
        sub.textContent = subtitleOf(server)
        if (profileOff) {
          // Switching it on loads the plugin in the profile first: without that
          // there is no schema for the conversation to enable.
          row.title = 'Switching this on loads the MCP server in the profile once, '
            + 'then keeps it on for this conversation. It was never loaded, so it '
            + 'had no tools to switch.'
        }
        text.appendChild(name)
        text.appendChild(sub)

        const weight = weightOf(server)
        const tokens = formatTokens(weight.value)
        const badge = document.createElement('div')
        badge.className = 'dsh-mcp-tokens'
        badge.textContent = tokens
        badge.title = weight.title

        // One switch everywhere: a server DSH has not loaded simply cannot be
        // reached by a conversation override, so switching it on first loads it
        // in the profile. Same gesture, honest outcome.
        const toggle = document.createElement('div')
        toggle.className = 'dsh-mcp-switch'
        toggle.dataset.on = String(on && profileOff !== true)

        row.appendChild(text)
        if (tokens !== '') row.appendChild(badge)

        // Sits immediately left of the switch, so a slow toggle explains
        // itself instead of looking dead.
        const status = document.createElement('span')
        status.className = 'dsh-mcp-busy'
        Object.assign(status.style, {
          fontSize: '11px',
          color: '#9a9aa2',
          marginRight: '8px',
          whiteSpace: 'nowrap',
          display: 'none',
        })
        status.textContent = 'Loading\u2026'
        row.appendChild(status)
        row.appendChild(toggle)

        const busyKey = group.names.slice().sort().join('|')
        const paintBusy = (wanted) => {
          status.style.display = wanted ? 'inline' : 'none'
          if (wanted) toggle.dataset.busy = 'true'
          else delete toggle.dataset.busy
        }
        // A write that settles in 30 ms flashed the indicator for one frame, so
        // it read as "nothing happens". Keep it up for a beat.
        const setBusy = (state) => {
          if (state === true) {
            busyServers.add(busyKey)
            busySince.set(busyKey, Date.now())
            paintBusy(true)
            return
          }
          const started = busySince.get(busyKey) ?? 0
          const left = Math.max(0, MIN_BUSY_MS - (Date.now() - started))
          const finish = () => {
            busyServers.delete(busyKey)
            busySince.delete(busyKey)
            paintBusy(false)
          }
          if (left === 0) finish()
          else window.setTimeout(finish, left)
        }
        // A row rebuilt while its write is still running must come back busy.
        if (busyServers.has(busyKey)) setBusy(true)

        // The switch only ever writes this conversation's override. It never
        // loads, enables or edits the profile: a server DSH has not loaded has
        // nothing to offer here, and pretending otherwise changed global state.
        const apply = () => {
          if (profileOff && !on) {
            setBusy(true)
            // DSH never loaded this server, so it has no tools to switch. It is
            // loaded once and immediately confined to this conversation, which
            // is the only reachable meaning of "on here only".
            toggle.dataset.busy = 'true'
            Promise.all(group.members
              .filter((member) => member?.disabled === true)
              .map((member) => fetchJson(urlFor('enableServer=' + encodeURIComponent(labelOf(member))))))
              .then(() => { setBusy(false); render() })
              .catch(() => { setBusy(false); render() })
            return
          }
          setBusy(true)
          // The indicator stays until the write settles; a retry keeps it up.
          flipAll(group.names, !on, 0, (ok) => { if (ok !== undefined) setBusy(false) })
        }
        row.tabIndex = 0
        row.addEventListener('click', apply)
        row.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            apply()
          }
        })
        return row
      }

      function render() {
        if (menu === null) return
        const servers = Array.isArray(payload?.servers) ? payload.servers : []
        const rows = servers.filter((server) => server !== null && typeof server === 'object'
          && (server.toggleable === true || server.active === true)
          // `mcp-resource-servers` is the Host's resource bridge, not a server the
          // user picked: it is always on, has nothing to toggle, and only adds a
          // line nobody acts on.
          && server.name !== RESOURCE_BRIDGE_NAME)

        const head = document.createElement('div')
        head.className = 'dsh-mcp-head'
        const headLabel = document.createElement('span')
        headLabel.className = 'dsh-mcp-head-label'
        headLabel.textContent = 'MCP for this conversation'
        head.appendChild(headLabel)
        const activeTokens = rows.reduce((total, server) => total
          + (server?.enabled === false ? 0 : weightOf(server).value), 0)
        if (activeTokens > 0) {
          const headTotal = document.createElement('span')
          headTotal.className = 'dsh-mcp-head-total'
          headTotal.textContent = formatTokens(activeTokens)
          headTotal.title = 'Total weight of the MCP tools active in this conversation'
          head.appendChild(headTotal)
        }

        const list = document.createElement('div')
        list.className = 'dsh-mcp-list'
        if (payload === null) list.appendChild(note('Loading\u2026'))
        else if (rows.length === 0) list.appendChild(note('No active MCP server.'))
        else {
          // One malformed row must never blank the whole picker: the failure of
          // a single entry is contained and named instead.
          for (const group of groupServers(rows)) {
            try {
              list.appendChild(rowElement(group))
            } catch (error) {
              const broken = document.createElement('div')
              broken.className = 'dsh-mcp-note'
              broken.textContent = String(labelOf(group?.primary)) + ': ' + String(error?.message ?? error)
              list.appendChild(broken)
            }
          }
        }

        const foot = document.createElement('div')
        foot.className = 'dsh-mcp-foot'
        foot.textContent = hasSession
          ? 'This setting only applies to this conversation.'
          : 'Open a conversation to set its MCP servers.'

        while (menu.firstChild !== null) menu.removeChild(menu.firstChild)
        menu.appendChild(head)
        menu.appendChild(list)
        menu.appendChild(foot)
        place()
      }

      function load() {
        return fetchJson(urlFor())
          .then((next) => {
            if (next !== null && typeof next === 'object' && next.ok === true) payload = next
            render()
          })
          .catch((error) => {
            payload = { ok: false, servers: [] }
            render()
            report('chip-load-error', String(error?.message ?? error))
          })
      }

      function flip(name, wanted) {
        if (!hasSession) return
        const extra = 'toggle=' + encodeURIComponent(name) + '&enabled=' + (wanted ? 'true' : 'false')
        fetchJson(urlFor(extra))
          .then((next) => {
            if (next !== null && typeof next === 'object' && next.ok === true) {
              payload = next
              render()
              report('chip-toggle', name + '=' + String(wanted))
            } else {
              report('chip-toggle-error', String(next?.error ?? 'inconnu'))
            }
          })
          .catch((error) => { report('chip-toggle-error', String(error?.message ?? error)) })
      }

      function onOutside(event) {
        if (menu === null) return
        if (menu.contains(event.target) || button.contains(event.target)) return
        close()
      }

      function onKey(event) {
        if (event.key === 'Escape') close()
      }

      function close() {
        if (timer !== null) {
          clearInterval(timer)
          timer = null
        }
        document.removeEventListener('mousedown', onOutside, true)
        document.removeEventListener('keydown', onKey, true)
        window.removeEventListener('resize', place)
        if (menu !== null) {
          menu.remove()
          menu = null
        }
        button.setAttribute('aria-expanded', 'false')
      }

      function open() {
        if (menu !== null) return
        align()
        menu = document.createElement('div')
        menu.className = 'dsh-mcp-menu'
        menu.setAttribute('role', 'dialog')
        menu.setAttribute('aria-label', 'MCP for this conversation')
        document.body.appendChild(menu)
        button.setAttribute('aria-expanded', 'true')
        render()
        load()
        timer = setInterval(load, 4000)
        document.addEventListener('mousedown', onOutside, true)
        document.addEventListener('keydown', onKey, true)
        window.addEventListener('resize', place)
      }

      button.addEventListener('click', () => { if (menu === null) open(); else close() })

      return function disposeChip() {
        close()
        stopped = true
        try { if (frame !== 0) cancelAnimationFrame(frame) } catch { /* already gone */ }
        window.removeEventListener('resize', align)
        try { button.remove() } catch { if (button.parentNode !== null) button.parentNode.removeChild(button) }
      }
    }

    /** The slot component: a React shell whose children are the plain-DOM chip. */
    function ConversationMcpChip(props) {
      const sessionId = props !== null && typeof props === 'object' && typeof props.sessionId === 'string'
        ? props.sessionId
        : undefined
      const holder = React.useRef(null)
      React.useEffect(() => {
        const node = holder.current
        if (node === null || node === undefined) return undefined
        const dispose = mountChip(node, sessionId)
        report('chip-mount', sessionId ?? 'no-session')
        return () => { if (typeof dispose === 'function') dispose() }
      }, [sessionId])
      return React.createElement('span', { className: 'dsh-mcp-chip-host', ref: holder })
    }

    /* ------------------------------------------------------------------ */
    /* 2a. Draft images survive leaving and returning to a Session           */
    /* ------------------------------------------------------------------ */
    /*
     * The composer persists its text draft per Session, but not its images.
     * Restoring the `DraftAttachmentId` cannot work: leaving a Session disposes
     * its input shell, and `hub.ts` then calls `releaseDraftAttachment(id)`,
     * which deletes the browser object and revokes its preview URL. The id
     * survives; the picture does not.
     *
     * So the bytes are mirrored instead. `ConversationController.createDrafts`
     * is the one intake that mints attachments, so wrapping it captures every
     * image exactly once, and the same call rebuilds them on return.
     */

    /** IndexedDB database holding the mirrored image bytes. */
    const DRAFT_STORE_DB = 'dsh-mcp-companion'
    const DRAFT_STORE_TABLE = 'draft-images'
    /**
     * Sessions whose draft was sent or emptied on purpose.
     *
     * IndexedDB is asynchronous, so a remount right after a send can read the
     * mirror before its deletion lands and put the picture back into a draft
     * that was just emptied. This tombstone is synchronous with the decision.
     */
    const DRAFT_CONSUMED = new Set()
    /** Images beyond this are not mirrored; a draft that large is unusual. */
    const DRAFT_KEEP_LIMIT = 8
    /** Refuse to mirror a single image above this many bytes. */
    const DRAFT_KEEP_MAX_BYTES = 24 * 1024 * 1024

    function draftStoreOpen() {
      if (typeof indexedDB === 'undefined') return Promise.resolve(undefined)
      return new Promise((resolve) => {
        let request
        try {
          request = indexedDB.open(DRAFT_STORE_DB, 1)
        } catch {
          resolve(undefined)
          return
        }
        request.onupgradeneeded = () => {
          try {
            if (!request.result.objectStoreNames.contains(DRAFT_STORE_TABLE)) {
              request.result.createObjectStore(DRAFT_STORE_TABLE)
            }
          } catch { /* an existing schema wins */ }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => resolve(undefined)
      })
    }

    function draftStoreRun(mode, work) {
      return draftStoreOpen().then((db) => {
        if (db === undefined) return undefined
        return new Promise((resolve) => {
          let tx
          try {
            tx = db.transaction(DRAFT_STORE_TABLE, mode)
          } catch {
            resolve(undefined)
            return
          }
          let result
          try {
            result = work(tx.objectStore(DRAFT_STORE_TABLE))
          } catch {
            resolve(undefined)
            return
          }
          tx.oncomplete = () => resolve(result)
          tx.onerror = () => resolve(undefined)
          tx.onabort = () => resolve(undefined)
        })
      })
    }

    /** Content identity of one mirrored image: same picture, same key. */
    function contentKeyOf(name, type, bytes) {
      const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(0)
      let hash = 2166136261
      const step = Math.max(1, Math.floor(view.length / 2048))
      for (let index = 0; index < view.length; index += step) {
        hash ^= view[index]
        hash = Math.imul(hash, 16777619)
      }
      return String(name) + '|' + String(type) + '|' + String(view.length) + '|' + (hash >>> 0).toString(36)
    }

    /**
     * Mirrored images of one Session.
     *
     * Rows are keyed by content, never by attachment id: leaving and returning
     * mints a fresh id for the same picture, and keying by id made every round
     * trip add another copy.
     * @param sessionId - owning Session.
     * @returns one entry per distinct picture, oldest first.
     */
    function draftStoreRead(sessionId) {
      return draftStoreRun('readonly', (store) => {
        const request = store.get(String(sessionId))
        const box = { value: undefined }
        request.onsuccess = () => { box.value = request.result }
        return box
      }).then((box) => {
        const value = box !== null && typeof box === 'object' ? box.value : undefined
        if (value === null || value === undefined) return []
        // The first release stored a bare array; read it so a pending mirror
        // from that version is not lost.
        const rows = []
        if (Array.isArray(value)) {
          for (const row of value) {
            if (row === null || typeof row !== 'object' || row.bytes === undefined) continue
            rows.push({
              key: contentKeyOf(row.name, row.type, row.bytes),
              name: String(row.name ?? 'image'),
              type: String(row.type ?? 'image/png'),
              bytes: row.bytes,
              id: typeof row.id === 'string' ? row.id : undefined,
              at: typeof row.at === 'number' ? row.at : 0,
            })
          }
        } else if (typeof value === 'object') {
          for (const key of Object.keys(value)) {
            const row = value[key]
            if (row === null || typeof row !== 'object' || row.bytes === undefined) continue
            rows.push({
              key,
              name: String(row.name ?? 'image'),
              type: String(row.type ?? 'image/png'),
              bytes: row.bytes,
              id: typeof row.id === 'string' ? row.id : undefined,
              at: typeof row.at === 'number' ? row.at : 0,
            })
          }
        }
        // Two legacy rows for one picture collapse here.
        const unique = new Map()
        for (const row of rows) unique.set(row.key, row)
        return [...unique.values()].sort((a, b) => a.at - b.at)
      })
    }

    /** Replace one Session's mirror with the given content-keyed rows. */
    function draftStoreWrite(sessionId, rows) {
      return draftStoreRun('readwrite', (store) => {
        if (rows.length === 0) {
          store.delete(String(sessionId))
          return []
        }
        const value = {}
        for (const row of rows.slice(-DRAFT_KEEP_LIMIT)) value[row.key] = row
        store.put(value, String(sessionId))
        return rows
      })
    }

    /** Bytes of one image attachment, or undefined when it cannot be mirrored. */
    function readAttachmentBytes(attachment) {
      const file = attachment?.file
      if (file === undefined || file === null) return Promise.resolve(undefined)
      if (typeof file.size === 'number' && file.size > DRAFT_KEEP_MAX_BYTES) return Promise.resolve(undefined)
      return file.arrayBuffer()
        .then((buffer) => ({ name: String(file.name ?? 'image'), type: String(file.type ?? 'image/png'), bytes: buffer }))
        .catch(() => undefined)
    }

    /**
     * Wrap the one intake that mints draft attachments so every image is
     * mirrored as bytes, keyed by the Session that owns it.
     * @param service - the conversation service, when reachable.
     */
    function installDraftCapture(service) {
      if (service === undefined || service === null || typeof service.createDrafts !== 'function') return false
      const MARK = Symbol.for('dsh-customizer.draft-capture')
      if (service[MARK] === true) return true
      const original = service.createDrafts.bind(service)
      service.createDrafts = (sessionId, files, uploadImages) => {
        const attachments = original(sessionId, files, uploadImages)
        try {
          let images = 0
          for (const attachment of attachments) {
            if (attachment?.kind !== 'image') continue
            images += 1
            const id = String(attachment.id)
            void readAttachmentBytes(attachment).then((bytes) => {
              if (bytes === undefined) return undefined
              const key = contentKeyOf(bytes.name, bytes.type, bytes.bytes)
              return draftStoreRead(sessionId).then((existing) => {
                // Same picture, same key: the older row is replaced, so repeated
                // round trips can never accumulate copies.
                const rows = existing.filter((row) => row.key !== key)
                rows.push({ key, name: bytes.name, type: bytes.type, bytes: bytes.bytes, id, at: Date.now() })
                return draftStoreWrite(sessionId, rows)
              })
            }).catch(() => {})
          }
          if (images > 0) {
            DRAFT_CONSUMED.delete(String(sessionId))
            report('draft-keep-capture', String(sessionId) + ':' + String(images))
            reportDraftState({ captures: (draftStatus.captures ?? 0) + images, last: 'capture ' + String(images) })
          }
        } catch { /* mirroring must never break the intake */ }
        return attachments
      }
      try { service[MARK] = true } catch { /* frozen service: wrap anyway */ }
      return true
    }

    /**
     * Invisible composer occupant that restores mirrored images on return.
     * @param props - standard composer slot props.
     * @returns nothing; it exists only for its effects.
     */
    function DraftAttachmentKeeper(props) {
      const { sessionId, useInput, inputActions } = props
      const ids = useInput ? useInput((state) => state.attachmentIds) : undefined
      const phase = useInput ? useInput((state) => state.phase) : undefined
      const key = sessionId === undefined ? '' : String(sessionId)
      const settled = React.useRef(false)
      const previous = React.useRef([])
      // Deferred "draft emptied" decision, cancelled when this instance goes
      // away: leaving a Session also empties the draft it owned.
      const pendingConsume = React.useRef(null)
      // Current ids at the moment an async step runs, not the ones this render
      // saw: another path can restore the draft while the mirror read is open.
      const latestIds = React.useRef([])
      latestIds.current = Array.isArray(ids) ? ids : []

      // Restore mirrored images once per mount, when the draft is still empty.
      React.useEffect(() => {
        settled.current = false
        previous.current = []
        if (key === '' || inputActions === undefined || typeof inputActions.addAttachments !== 'function') return undefined
        const timer = window.setTimeout(() => {
          if (latestIds.current.length > 0) {
            settled.current = true
            previous.current = latestIds.current
            return
          }
          // Sent or emptied already: bringing the picture back would undo it.
          if (DRAFT_CONSUMED.has(key)) {
            void draftStoreWrite(sessionId, [])
            settled.current = true
            previous.current = []
            return
          }
          draftStoreRead(sessionId).then((rows) => {
            if (rows.length === 0) { settled.current = true; previous.current = []; return }
            const service = draftServiceOf()
            if (service === undefined || typeof service.createDrafts !== 'function') {
              settled.current = true
              report('draft-keep-noservice', 'conversation service unavailable')
              reportDraftState({ service: false, last: 'restore-no-service' })
              return
            }
            ensureDraftCapture()
            const files = []
            for (const row of rows.slice(-DRAFT_KEEP_LIMIT)) {
              try {
                const parts = [new Uint8Array(row.bytes)]
                files.push(new File(parts, String(row.name ?? 'image'), { type: String(row.type ?? 'image/png') }))
              } catch { /* one unreadable row must not stop the rest */ }
            }
            if (files.length === 0) { settled.current = true; return }
            let made = []
            try {
              made = service.createDrafts(sessionId, files, true)
            } catch {
              made = []
            }
            if (made.length === 0) { settled.current = true; return }
            // The draft filled up while the mirror was being read: undo what we
            // just minted instead of adding a second copy.
            if (latestIds.current.length > 0) {
              for (const attachment of made) {
                try { service.releaseDraftAttachment?.(attachment.id) } catch { /* nothing to undo */ }
              }
              settled.current = true
              previous.current = latestIds.current
              return
            }
            const fresh = made.map((attachment) => attachment.id)
            try { inputActions.addAttachments(fresh) } catch { /* busy: try next mount */ }
            report('draft-keep-restored', key + ':' + String(made.length))
            reportDraftState({ restores: (draftStatus.restores ?? 0) + 1, last: 'restored ' + String(made.length) })
            settled.current = true
            previous.current = fresh
          }).catch(() => { settled.current = true })
        }, 0)
        return () => window.clearTimeout(timer)
      }, [key])

      React.useEffect(() => () => {
        if (pendingConsume.current !== null) {
          window.clearTimeout(pendingConsume.current)
          pendingConsume.current = null
        }
      }, [])

      // A manual removal or a send consumes the mirror for those ids only.
      const signature = Array.isArray(ids) ? ids.join('\u0000') : ''
      React.useEffect(() => {
        if (!settled.current) return
        const current = Array.isArray(ids) ? ids : []
        const before = previous.current
        previous.current = current
        // A send empties the draft: mark it at once so the remount that follows
        // cannot re-add what was just delivered. `phase` is authoritative here.
        if (phase === 'sending') {
          DRAFT_CONSUMED.add(key)
          void draftStoreWrite(sessionId, [])
          return
        }
        if (current.length === 0 && before.length > 0) {
          // Same outcome, but this also fires while a Session is being left,
          // where the picture must survive. Decide one tick later, and let the
          // unmount cleanup cancel it.
          if (pendingConsume.current !== null) window.clearTimeout(pendingConsume.current)
          pendingConsume.current = window.setTimeout(() => {
            pendingConsume.current = null
            DRAFT_CONSUMED.add(key)
            void draftStoreWrite(sessionId, [])
          }, 400)
          return
        }
        const removed = before.filter((id) => !current.includes(id))
        if (removed.length === 0) return
        draftStoreRead(sessionId).then((rows) => {
          const kept = rows.filter((row) => !removed.includes(row.id))
          return kept.length === rows.length ? undefined : draftStoreWrite(sessionId, kept)
        }).catch(() => {})
      }, [key, signature, phase])

      return null
    }

    /** Context captured at install, for the service lookup above. */
    let draftCtx
    /** Whether `createDrafts` has been wrapped, so retries stay idempotent. */
    let draftCaptureReady = false
    /** Self-reported state, returned even when the diagnostic ring moved on. */
    let draftStatus = { v: CLIENT_VERSION, slot: false, service: false, capture: false, captures: 0, restores: 0, last: 'init' }

    /** Publish the keeper's state for the Host's diagnostics. */
    function reportDraftState(patch) {
      draftStatus = { ...draftStatus, ...patch }
      try {
        fetch(ENDPOINT + '?draftState=' + encodeURIComponent(JSON.stringify(draftStatus)), { credentials: 'same-origin' }).catch(() => {})
      } catch { /* reporting must never break the composer */ }
    }

    /** The conversation service, when the registry exposes it. */
    function draftServiceOf() {
      try {
        if (draftCtx === undefined) return undefined
        const service = typeof draftCtx.get === 'function' ? draftCtx.get('conversation') : undefined
        if (service !== undefined && service !== null) return service
        return draftCtx.conversation
      } catch {
        return undefined
      }
    }

    /**
     * Wrap the intake as soon as the conversation service exists.
     *
     * Activation order is not guaranteed: this Client half may load before the
     * conversation plugin publishes the service, and reading it eagerly at
     * install then found nothing and silently disabled the whole feature. Every
     * caller retries, so a late-registered service is picked up.
     * @returns whether the capture wrapper is in place.
     */
    function ensureDraftCapture() {
      if (draftCaptureReady) return true
      const service = draftServiceOf()
      if (service === undefined || service === null) {
        reportDraftState({ service: false, last: 'no-service' })
        return false
      }
      const ok = installDraftCapture(service)
      draftCaptureReady = ok
      reportDraftState({ service: true, capture: ok, last: ok ? 'capture-ready' : 'capture-failed' })
      return ok
    }

    /** Register the silent image keeper in the composer tool row. */
    function installDraftAttachmentKeeper(ctx) {
      if (React === undefined || React === null || typeof React.createElement !== 'function') return false
      draftCtx = ctx
      // Ordering is not guaranteed, so try now and again when the service
      // announces itself; a failure here is not final.
      ensureDraftCapture()
      try {
        if (typeof ctx.inject === 'function') {
          ctx.inject(['conversation'], () => {
            draftCtx = ctx
            ensureDraftCapture()
            return () => { /* the service unloading leaves the wrapper inert */ }
          })
        }
      } catch { /* a host without ctx.inject still retries from the keeper */ }
      let slots
      try {
        slots = typeof ctx.get === 'function' ? ctx.get('slots') : undefined
        if (slots === undefined || slots === null) slots = ctx.slots
      } catch {
        slots = undefined
      }
      if (slots === undefined || slots === null || typeof slots.register !== 'function' || typeof slots.inject !== 'function') return false
      const SLOT = 'conversation.input.left'
      try {
        const register = () => slots.register({
          name: SLOT,
          id: 'mcp-companion.draft-keeper',
          order: 900,
          label: 'Draft images',
        }, DraftAttachmentKeeper)
        slots.inject(SLOT, register)
        report('draft-keep-slot', SLOT)
        reportDraftState({ slot: true, last: 'slot-registered' })
        return true
      } catch (error) {
        report('draft-keep-error', String(error?.message ?? error))
        return false
      }
    }

    /* ------------------------------------------------------------------ */
    /* 2c. Total tool weight on every MCP server card                       */
    /* ------------------------------------------------------------------ */
    /*
     * The panel prints "N tools" from the tools a server currently registers,
     * so a switched-off server reads "0 tools" and its cost becomes invisible.
     * The Host remembers each server's last weight (they register no schema
     * while off), and this appends that total to the card's meta line.
     */

    let MCP_TOKEN_QUEUED = false

    /** Server name -> weight, from the last inventory read. */
    function mcpTokenWeights() {
      const payload = inventory.value
      const rows = Array.isArray(payload?.servers) ? payload.servers : []
      const weights = new Map()
      for (const server of rows) {
        if (server === null || typeof server !== 'object' || typeof server.name !== 'string') continue
        const live = typeof server.tokens === 'number' && server.tokens > 0 ? server.tokens : 0
        const cached = typeof server.cachedTokens === 'number' ? server.cachedTokens : 0
        // Kept even at zero: an empty badge is indistinguishable from a
        // decoration that never ran, and "0 tools" already says why.
        weights.set(server.name, live > 0 ? live : cached)
      }
      return weights
    }

    /** Last scan outcome, reported once per distinct state. */
    let MCP_TOKEN_LAST = ''

    /**
     * Append the weight to every MCP card that has one.
     *
     * Class names come from a CSS-module build, so every lookup also accepts a
     * hashed suffix: a renamed `.MCP_card` must not silently disable this.
     */
    function decorateMcpCards() {
      MCP_TOKEN_QUEUED = false
      const container = document.querySelector('.MCP_cards, [class*="MCP_cards"]')
      if (container === null) return
      const weights = mcpTokenWeights()
      const cards = document.querySelectorAll('.MCP_card, [class*="MCP_card"]:not([class*="MCP_cards"])')
      const meta = cards.length > 0
        ? (cards[0].querySelector('.MCP_meta, [class*="MCP_meta"]') !== null ? 'meta' : 'no-meta')
        : 'no-cards'
      const shapes = cards.length + '/' + meta + '/' + weights.size
      if (shapes !== MCP_TOKEN_LAST) {
        MCP_TOKEN_LAST = shapes
        // One line that says whether the DOM matched and whether any weight is
        // known at all: without a connected server there is nothing to print.
        report('mcp-token-scan', shapes)
      }
      if (weights.size === 0) return
      for (const card of cards) {
        const nameElement = card.querySelector('.MCP_name, [class*="MCP_name"]')
        const meta = card.querySelector('.MCP_meta, [class*="MCP_meta"]')
        if (nameElement === null || meta === null) continue
        const name = String(nameElement.textContent ?? '').trim()
        let total = weights.get(name)
        if (total === undefined) {
          // The panel may suffix the name with a transport badge; accept the
          // single known server name the card actually contains.
          const haystack = String(card.textContent ?? '')
          const hits = [...weights.entries()].filter(([key]) => key.length >= 3 && haystack.includes(key))
          if (hits.length === 1) total = hits[0][1]
        }
        if (total === undefined) continue
        let badge = meta.querySelector('[data-mcpc-mcp-tok]')
        if (badge === null) {
          badge = document.createElement('span')
          badge.setAttribute('data-mcpc-mcp-tok', 'true')
          badge.className = 'dsh-mcpc-mcptok'
          meta.appendChild(badge)
        }
        const text = '(' + (total > 0 ? formatTokens(total) : '0 tok') + ')'
        if (badge.textContent !== text) badge.textContent = text
        badge.title = total > 0
          ? 'Total weight of this server\'s tool schemas: about ' + String(total) + ' tokens'
          : 'This server registers no tool schema right now; the weight appears once it connects'
      }
    }

    /** Ask for one decoration pass on the next frame. */
    function scheduleMcpCards() {
      if (MCP_TOKEN_QUEUED) return
      MCP_TOKEN_QUEUED = true
      window.requestAnimationFrame(decorateMcpCards)
    }

    /** Keep the weights on the cards as the page re-renders. */
    function installMcpTokenBadges() {
      if (typeof MutationObserver !== 'function') return false
      const observer = new MutationObserver(() => {
        if (document.querySelector('.MCP_cards, [class*="MCP_cards"]') !== null) scheduleMcpCards()
      })
      observer.observe(document.body, { childList: true, subtree: true })
      scheduleMcpCards()
      report('mcp-token-badges', 'observing')
      return true
    }

    /* ------------------------------------------------------------------ */
    /* 2b. Token weights inside the New Session agent-preset menu           */
    /* ------------------------------------------------------------------ */
    /*
     * The preset chip and its menu belong to the shipped agent-preset plugin
     * and live in a `single` slot whose occupant also owns the staged
     * selection, the application to a blank Session and the refusal toast.
     * Shadowing it would mean re-implementing all of that, so this decorates
     * the rendered menu instead: the choice still reaches the Host exactly as
     * before, and each card gains the two weights the user asked for.
     */

    /** Last per-preset weights read from the Host, keyed by preset id. */
    let PRESET_STATS = null
    let PRESET_STATS_PENDING = null
    /** Menu elements already inspected, so a re-render is the only repair. */
    const SEAT_MENUS = new WeakSet()

    /** Compact token text: `30.4k` above a thousand, plain below. */
    function compactTokens(value) {
      const number = typeof value === 'number' && Number.isFinite(value) ? value : 0
      if (number <= 0) return '0'
      if (number >= 1000) {
        const short = (Math.round(number / 100) / 10).toFixed(1)
        return (short.endsWith('.0') ? short.slice(0, -2) : short) + 'k'
      }
      return String(number)
    }

    /**
     * Match one menu card to its preset.
     *
     * The old test required the card text to START with an alias, which fails
     * three ways the shipped menu actually renders it: a leading icon or a
     * description changes the first characters, the French locale prints names
     * the English alias table does not carry, and several built-ins arrive with
     * no `name` at all. A card is therefore resolved by its first line against
     * a normalised label set — accents and case folded, so "Mode PTC" also
     * matches a card reading "mode ptc".
     *
     * Returns the preset entry, or undefined when the card is not a preset.
     */
    function foldLabel(value) {
      return String(value ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim()
    }

    /** Every label this card must answer to, including the bare id. */
    function presetLabels(entry) {
      const out = new Set()
      if (typeof entry.id === 'string') out.add(foldLabel(entry.id))
      if (typeof entry.name === 'string' && entry.name.length > 0) out.add(foldLabel(entry.name))
      const builtin = BUILTIN_PRESET_NAMES[entry.id]
      if (builtin !== undefined) for (const label of builtin) out.add(foldLabel(label))
      return out
    }

    /** The visible title of one card: its first non-empty line, trimmed. */
    function cardLabel(item) {
      const text = String(item.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (text.length === 0) return ''
      // Cards append a description and the token badge; only the leading title
      // identifies the preset, so take everything before the first long gap of
      // what looks like a second sentence or a trailing number.
      const head = text.slice(0, 80)
      const parts = head.split(/(?=\s\d|,|\.|\u00b7|-)/)
      return (parts[0] ?? head).trim()
    }

    function presetForCard(item, stats) {
      const label = foldLabel(cardLabel(item))
      if (label.length === 0) return undefined
      for (const entry of stats.values()) {
        for (const alias of presetLabels(entry)) {
          if (alias.length === 0) continue
          if (label === alias || label.startsWith(alias) || label.includes(alias)) return entry
        }
      }
      return undefined
    }

    /** Every name the shipped menu may print for one preset. */
    function presetAliases(entry) {
      const out = new Set()
      if (typeof entry.id === 'string') out.add(entry.id)
      if (typeof entry.name === 'string' && entry.name.length > 0) out.add(entry.name)
      const builtin = BUILTIN_PRESET_NAMES[entry.id]
      if (builtin !== undefined) {
        out.add(builtin[0])
        out.add(builtin[1])
      }
      return [...out]
    }

    /** Read the weights once; the Host assembles every preset, so never twice. */
    function loadPresetStats() {
      if (PRESET_STATS !== null) return Promise.resolve(PRESET_STATS)
      if (PRESET_STATS_PENDING !== null) return PRESET_STATS_PENDING
      PRESET_STATS_PENDING = fetchJson(ENDPOINT + '?view=presets&client=' + CLIENT_VERSION)
        .then((payload) => {
          const map = new Map()
          for (const entry of Array.isArray(payload?.presets) ? payload.presets : []) {
            if (entry === null || typeof entry !== 'object' || typeof entry.id !== 'string') continue
            map.set(entry.id, entry)
          }
          PRESET_STATS = map
          PRESET_STATS_PENDING = null
          return map
        })
        .catch(() => {
          PRESET_STATS_PENDING = null
          return new Map()
        })
      return PRESET_STATS_PENDING
    }

    /**
     * The single weight chip appended to one menu card.
     *
     * One number only: prompt and tools were two chips and read as two separate
     * budgets. The split stays in the tooltip for whoever needs it.
     */
    /**
     * Exact cost of the open conversation, from the token estimator.
     *
     * The badges below are preset ceilings: they add the assembled prompt and
     * the declarations, which for PTC counts the catalogue twice (it is sent
     * as prompt text). The estimator prices the request that will actually be
     * sent, so for the mode in use its figure is the honest one. Anything that
     * goes wrong leaves the ceiling in place.
     */
    let CONVERSATION_COST = null
    let CONVERSATION_COST_AT = 0
    let CONVERSATION_COST_PENDING = null

    function composerDraftText() {
      try {
        const root = document.querySelector('[data-lexical-editor="true"]')
          || document.querySelector('[contenteditable="true"]')
        if (root === null) return ''
        const text = typeof root.innerText === 'string' ? root.innerText : (root.textContent || '')
        return text.replace(/\u200b/g, '').trim()
      } catch {
        return ''
      }
    }

    function loadConversationCost() {
      if (CONVERSATION_COST_PENDING !== null) return CONVERSATION_COST_PENDING
      if (CONVERSATION_COST !== null && Date.now() - CONVERSATION_COST_AT < 4000) {
        return Promise.resolve(CONVERSATION_COST)
      }
      let sessionId = null
      try {
        const holder = document.querySelector('[data-mcpc-session]')
        sessionId = holder === null ? null : holder.getAttribute('data-mcpc-session')
      } catch {
        sessionId = null
      }
      if (typeof sessionId !== 'string' || sessionId.length === 0) return Promise.resolve(CONVERSATION_COST)
      CONVERSATION_COST_PENDING = fetchJson(
        '/local-token-estimator/estimate?text=' + encodeURIComponent(composerDraftText())
          + '&session=' + encodeURIComponent(sessionId),
      )
        .then((payload) => {
          CONVERSATION_COST_PENDING = null
          CONVERSATION_COST_AT = Date.now()
          if (payload === null || typeof payload !== 'object') return CONVERSATION_COST
          if (typeof payload.total !== 'number' || typeof payload.preset !== 'string') return CONVERSATION_COST
          const before = CONVERSATION_COST
          CONVERSATION_COST = { preset: payload.preset, total: payload.total }
          const changed = before === null
            || before.total !== CONVERSATION_COST.total
            || before.preset !== CONVERSATION_COST.preset
          // Dropping the painted badges makes the menu observer repaint them
          // with the figure that just arrived.
          if (changed) {
            for (const old of document.querySelectorAll('[data-mcpc-preset-badge="true"]')) {
              try { old.remove() } catch { /* already detached */ }
            }
          }
          return CONVERSATION_COST
        })
        .catch(() => {
          CONVERSATION_COST_PENDING = null
          return CONVERSATION_COST
        })
      return CONVERSATION_COST_PENDING
    }

    function seatStatsBadge(entry) {
      if (CONVERSATION_COST === null) {
        try { void loadConversationCost() } catch { /* keep the ceiling */ }
      }
      if (CONVERSATION_COST !== null && CONVERSATION_COST.preset === entry?.id) {
        const exact = document.createElement('span')
        exact.className = 'dsh-mcpc-seatstats'
        exact.setAttribute('data-mcpc-preset-badge', 'true')
        const chipExact = document.createElement('span')
        chipExact.className = 'dsh-mcpc-seatstat'
        chipExact.title = 'Requête de cette conversation : ' + formatTokens(CONVERSATION_COST.total)
          + ' tok \u00b7 chiffre du token estimator, mesuré sur ce mode et cette conversation'
        const strongExact = document.createElement('b')
        strongExact.textContent = compactTokens(CONVERSATION_COST.total) + ' tok'
        chipExact.appendChild(strongExact)
        exact.appendChild(chipExact)
        return exact
      }
      const promptTokens = typeof entry.promptTokens === 'number' ? entry.promptTokens : 0
      const toolTokens = typeof entry.toolTokens === 'number' ? entry.toolTokens : 0
      const badge = document.createElement('span')
      badge.className = 'dsh-mcpc-seatstats'
      badge.setAttribute('data-mcpc-preset-badge', 'true')
      const chip = document.createElement('span')
      chip.className = 'dsh-mcpc-seatstat'
      // The two families this menu totals: the assembled prompt (catalogue
      // included for PTC) and the tool declarations of the mode.
      chip.title = 'System prompt ' + formatTokens(promptTokens)
        + ' \u00b7 tools ' + formatTokens(toolTokens)
      const strong = document.createElement('b')
      strong.textContent = compactTokens(promptTokens + toolTokens) + ' tok'
      chip.appendChild(strong)
      badge.appendChild(chip)
      return badge
    }

    /** Decorate one open preset menu, if this menu is that menu. */
    function decorateSeatMenu(menu, stats) {
      if (menu === null || menu === undefined) return
      const items = menu.querySelectorAll('[role="menuitem"]')
      if (items.length < 2) return
      // Only a menu whose cards are preset names qualifies: another menu is
      // left untouched even when one label happens to collide.
      const matches = []
      for (const item of items) {
        if (item.querySelector('[data-mcpc-preset-badge="true"]') !== null) continue
        const text = String(item.textContent ?? '').trim()
        if (text.length === 0) continue
        let found
        for (const entry of stats.values()) {
          for (const alias of presetAliases(entry)) {
            if (alias.length > 0 && text.startsWith(alias)) {
              found = entry
              break
            }
          }
          if (found !== undefined) break
        }
        // A hidden sub-agent row gets no badge: the row is collapsed anyway,
        // and skipping it avoids the badge flashing before the row goes.
        if (found !== undefined && !HIDDEN_PRESETS.has(found.id)) matches.push({ item, entry: found })
      }
      if (matches.length === 0) return
      const visible = [...items].filter((item) => item.style.display !== 'none').length
      if (matches.length * 2 < visible) return
      for (const { item, entry } of matches) item.appendChild(seatStatsBadge(entry))
      SEAT_MENUS.add(menu)
    }

    /* ------------------------------------------------------------------ */
    /* 2c. Per-Agent colour: a dot before the name, chosen from a palette  */
    /* ------------------------------------------------------------------ */
    /*
     * The New Session preset menu is portaled and re-rendered by React, so the
     * dot is injected into the rendered card — the same decorate-not-shadow
     * approach the token badge above uses. The choice itself travels to the
     * Host, which stores it in the plugin state file: two views of the same
     * Agent (the chip, the tab rows) then agree, and the choice survives a
     * reload.
     *
     * The dot is inserted as the FIRST child of the card's label so it really
     * is to the left of the name, which is what the mock-ups show.
     */


    /** Every document-like root: iframes and shadow roots included. */
    function deepRoots() {
      const roots = [document]
      const walk = (root, depth) => {
        if (depth > 4) return
        try {
          for (const node of root.querySelectorAll('*')) {
            if (typeof node.shadowRoot === 'object' && node.shadowRoot !== null) {
              roots.push(node.shadowRoot)
              walk(node.shadowRoot, depth + 1)
            }
            if (node.tagName === 'IFRAME') {
              try {
                const inner = node.contentDocument
                if (inner !== null && inner !== undefined) {
                  roots.push(inner)
                  walk(inner, depth + 1)
                }
              } catch { /* cross-origin iframe */ }
            }
          }
        } catch { /* unreadable tree */ }
      }
      walk(document, 0)
      return roots
    }

    /** Search every root, not just the top document. */
    function deepQuery(selector) {
      for (const root of deepRoots()) {
        try {
          const hit = root.querySelector(selector)
          if (hit !== null) return hit
        } catch { /* next root */ }
      }
      return null
    }

    /** Every match across every root. */
    function deepQueryAll(selector) {
      const out = []
      for (const root of deepRoots()) {
        try {
          for (const node of root.querySelectorAll(selector)) out.push(node)
        } catch { /* next root */ }
      }
      return out
    }

    /** Fallback palette, used until the Host sends its own. */
    const AGENT_PALETTE_FALLBACK = [
      '#5b8def', '#2ea8e5', '#22a7a0', '#2fb26a',
      '#8cc63f', '#e2b33c', '#ef8b3c', '#e4613c',
      '#d94f6a', '#c45bc0', '#9b6bd6', '#7a8899',
    ]
    /** Colours read from the Host, keyed by preset id; null until loaded. */
    let AGENT_COLORS = null
    /** Presets kept out of the agent menu (sub-agent personas). */
    let HIDDEN_PRESETS = new Set()
    let AGENT_PALETTE = AGENT_PALETTE_FALLBACK
    /** Menus whose cards already carry a dot or an explicit "no dot". */
    const COLORED_MENUS = new WeakSet()
    /** Open colour popover, so only one exists at a time. */
    let COLOR_POPOVER = null

    const AGENT_COLOR_RE = /^#[0-9a-fA-F]{6}$/

    /** True for the values the Host accepts, so nothing else reaches the CSS. */
    function safeColor(value) {
      return AGENT_COLOR_RE.test(value ?? '') ? value : null
    }

    function readAgentColors() {
      return fetchJson(ENDPOINT + '?view=colorState&client=' + CLIENT_VERSION)
        .then((payload) => {
          const map = new Map()
          const raw = payload?.colors
          if (raw !== null && typeof raw === 'object') {
            for (const id of Object.keys(raw)) {
              const color = safeColor(raw[id])
              if (color !== null) map.set(id, color)
            }
          }
          if (Array.isArray(payload?.palette) && payload.palette.length > 0) {
            const palette = payload.palette.filter((item) => AGENT_COLOR_RE.test(item ?? ''))
            if (palette.length > 0) AGENT_PALETTE = palette
          }
          if (Array.isArray(payload?.hiddenPresets)) {
            HIDDEN_PRESETS = new Set(payload.hiddenPresets.filter((id) => typeof id === 'string'))
          }
          AGENT_COLORS = map
          return map
        })
        .catch(() => {
          AGENT_COLORS = new Map()
          return AGENT_COLORS
        })
    }

    function writeAgentColor(agent, color) {
      const query = ENDPOINT + '?setAgentColor=1&client=' + CLIENT_VERSION
        + '&agent=' + encodeURIComponent(agent)
        + '&color=' + encodeURIComponent(color ?? '')
      return fetchJson(query).then((payload) => {
        const map = AGENT_COLORS ?? new Map()
        if (color === null || color === '') map.delete(agent)
        else map.set(agent, color)
        AGENT_COLORS = map
        return payload
      })
    }

    function closeColorPopover() {
      if (COLOR_POPOVER === null) return
      try { COLOR_POPOVER.remove() } catch { /* already detached */ }
      COLOR_POPOVER = null
    }

    /**
     * The swatch grid used to pick a colour.
     *
     * Clicking a swatch writes through to the Host and repaints every existing
     * dot, so the menu and the chip never disagree. "Aucune" clears the choice
     * and removes the dot.
     */
    /* -- Colour maths for the custom picker ---------------------------- */

    /** `#rrggbb` to 0-255 channels; null when the text is not a colour. */
    function hexToRgb(hex) {
      const match = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim())
      if (match === null) return null
      const value = parseInt(match[1], 16)
      return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
    }

    function rgbToHex(r, g, b) {
      const part = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
      return '#' + part(r) + part(g) + part(b)
    }

    /** RGB to HSV with hue in degrees and saturation/value in 0-1. */
    function rgbToHsv(r, g, b) {
      const rn = r / 255
      const gn = g / 255
      const bn = b / 255
      const max = Math.max(rn, gn, bn)
      const min = Math.min(rn, gn, bn)
      const delta = max - min
      let hue = 0
      if (delta > 0) {
        if (max === rn) hue = ((gn - bn) / delta) % 6
        else if (max === gn) hue = (bn - rn) / delta + 2
        else hue = (rn - gn) / delta + 4
        hue *= 60
        if (hue < 0) hue += 360
      }
      return { h: hue, s: max === 0 ? 0 : delta / max, v: max }
    }

    function hsvToHex(h, s, v) {
      const c = v * s
      const hp = ((h % 360) + 360) % 360 / 60
      const x = c * (1 - Math.abs((hp % 2) - 1))
      let rgb
      if (hp < 1) rgb = [c, x, 0]
      else if (hp < 2) rgb = [x, c, 0]
      else if (hp < 3) rgb = [0, c, x]
      else if (hp < 4) rgb = [0, x, c]
      else if (hp < 5) rgb = [x, 0, c]
      else rgb = [c, 0, x]
      const m = v - c
      return rgbToHex((rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255)
    }

    /**
     * The full picker: a saturation/value square over a hue strip.
     *
     * Everything is inline-styled for the same reason the dot is — the plugin
     * stylesheet never reaches this page. Dragging previews on the live dot and
     * only writes to the Host on release, so one gesture is one request.
     */
    function customColorPanel(startHex, handlers) {
      const start = hexToRgb(startHex) ?? { r: 91, g: 141, b: 239 }
      let hsv = rgbToHsv(start.r, start.g, start.b)

      const panel = document.createElement('div')
      Object.assign(panel.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      })

      // --- saturation / value square -----------------------------------
      const square = document.createElement('div')
      Object.assign(square.style, {
        position: 'relative',
        width: '200px',
        height: '130px',
        borderRadius: '8px',
        cursor: 'crosshair',
        touchAction: 'none',
        background: '',
      })
      const knob = document.createElement('div')
      Object.assign(knob.style, {
        position: 'absolute',
        width: '12px',
        height: '12px',
        borderRadius: '50%',
        border: '2px solid #fff',
        boxShadow: '0 0 0 1px rgba(0,0,0,.45)',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      })
      square.appendChild(knob)

      // --- hue strip ----------------------------------------------------
      const hue = document.createElement('div')
      Object.assign(hue.style, {
        position: 'relative',
        width: '200px',
        height: '12px',
        borderRadius: '6px',
        cursor: 'pointer',
        touchAction: 'none',
        background: 'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)',
      })
      const hueKnob = document.createElement('div')
      Object.assign(hueKnob.style, {
        position: 'absolute',
        top: '50%',
        width: '14px',
        height: '14px',
        borderRadius: '50%',
        border: '2px solid #fff',
        boxShadow: '0 0 0 1px rgba(0,0,0,.45)',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      })
      hue.appendChild(hueKnob)

      // --- hex field ----------------------------------------------------
      const field = document.createElement('input')
      field.type = 'text'
      field.spellcheck = false
      Object.assign(field.style, {
        width: '100%',
        boxSizing: 'border-box',
        font: 'inherit',
        fontSize: '11.5px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        color: '#e5e5ea',
        background: 'rgba(255,255,255,.07)',
        border: '1px solid rgba(255,255,255,.14)',
        borderRadius: '6px',
        padding: '4px 7px',
        outline: 'none',
      })

      const current = () => hsvToHex(hsv.h, hsv.s, hsv.v)

      /** Repaint the panels and tell the caller the colour changed. */
      const paint = (notify) => {
        const hex = current()
        square.style.background =
          'linear-gradient(to top,#000,rgba(0,0,0,0)),'
          + 'linear-gradient(to right,#fff,hsl(' + hsv.h.toFixed(1) + ' 100% 50%))'
        knob.style.left = (hsv.s * 100) + '%'
        knob.style.top = ((1 - hsv.v) * 100) + '%'
        hueKnob.style.left = (hsv.h / 360 * 100) + '%'
        if (document.activeElement !== field) field.value = hex
        if (notify === true) handlers.preview(hex)
      }

      /** Map a pointer position inside `element` to 0-1 coordinates. */
      const ratio = (element, event) => {
        const rect = element.getBoundingClientRect()
        return {
          x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
          y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
        }
      }

      const bind = (element, onMove) => {
        element.addEventListener('pointerdown', (event) => {
          event.preventDefault()
          event.stopPropagation()
          try { element.setPointerCapture(event.pointerId) } catch { /* not capturable */ }
          onMove(event)
        })
        element.addEventListener('pointermove', (event) => {
          if (event.buttons !== 1 && event.pointerType === 'mouse') return
          if (element.hasPointerCapture?.(event.pointerId) !== true) return
          event.preventDefault()
          onMove(event)
        })
        element.addEventListener('pointerup', (event) => {
          event.preventDefault()
          event.stopPropagation()
          handlers.commit(current())
        })
      }

      bind(square, (event) => {
        const { x, y } = ratio(square, event)
        hsv = { h: hsv.h, s: x, v: 1 - y }
        paint(true)
      })
      bind(hue, (event) => {
        const { x } = ratio(hue, event)
        hsv = { h: x * 360, s: hsv.s, v: hsv.v }
        paint(true)
      })

      field.addEventListener('input', () => {
        const rgb = hexToRgb(field.value)
        if (rgb === null) return
        hsv = rgbToHsv(rgb.r, rgb.g, rgb.b)
        square.style.background =
          'linear-gradient(to top,#000,rgba(0,0,0,0)),'
          + 'linear-gradient(to right,#fff,hsl(' + hsv.h.toFixed(1) + ' 100% 50%))'
        knob.style.left = (hsv.s * 100) + '%'
        knob.style.top = ((1 - hsv.v) * 100) + '%'
        hueKnob.style.left = (hsv.h / 360 * 100) + '%'
        handlers.preview(current())
      })
      field.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        event.stopPropagation()
        handlers.commit(current())
      })
      field.addEventListener('blur', () => {
        field.value = current()
        handlers.commit(current())
      })

      panel.append(square, hue, field)
      paint(false)
      return panel
    }

    function colorPopover(agent, anchor, onPick, explicitHex, customApply) {
      closeColorPopover()
      const pop = document.createElement('div')
      pop.className = 'dsh-mcpc-colorpop'
      pop.setAttribute('data-mcpc-colorpop', 'true')
      pop.setAttribute('role', 'dialog')
      // Inline, because the plugin stylesheet is not loaded on this page.
      Object.assign(pop.style, {
        position: 'absolute',
        zIndex: '2147483000',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '10px',
        borderRadius: '10px',
        background: '#1c1c1e',
        border: '1px solid rgba(255,255,255,.14)',
        boxShadow: '0 10px 30px rgba(0,0,0,.45)',
      })
      // An Agent that does not exist yet has no stored colour: the caller
      // passes the value it is about to write so the swatch stays highlighted.
      const current = explicitHex !== undefined ? explicitHex : (AGENT_COLORS?.get(agent) ?? null)

      const grid = document.createElement('div')
      grid.className = 'dsh-mcpc-colorswatches'
      Object.assign(grid.style, {
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 20px)',
        gap: '6px',
      })
      for (const hex of AGENT_PALETTE) {
        const swatch = document.createElement('button')
        swatch.type = 'button'
        swatch.className = 'dsh-mcpc-colorswatch'
        Object.assign(swatch.style, {
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          border: '1px solid rgba(0,0,0,.35)',
          cursor: 'pointer',
          padding: '0',
          background: hex,
        })
        swatch.title = hex
        swatch.setAttribute('data-color', hex)
        if (hex === current) swatch.setAttribute('aria-pressed', 'true')
        swatch.textContent = ''
        swatch.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          onPick(hex)
          closeColorPopover()
        })
        grid.appendChild(swatch)
      }
      pop.appendChild(grid)

      const none = document.createElement('button')
      none.type = 'button'
      none.className = 'dsh-mcpc-colornone'
      Object.assign(none.style, {
        font: 'inherit',
        fontSize: '11.5px',
        color: '#e5e5ea',
        background: 'rgba(255,255,255,.08)',
        border: '1px solid rgba(255,255,255,.14)',
        borderRadius: '6px',
        padding: '4px 8px',
        cursor: 'pointer',
      })
      none.textContent = 'Aucune'
      none.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        onPick(null)
        closeColorPopover()
      })
      pop.appendChild(none)

      // A "Personnalisée" button swaps the swatch grid for the full picker.
      // The panel previews on the live dot and only persists on release.
      const custom = document.createElement('button')
      custom.type = 'button'
      custom.className = 'dsh-mcpc-colorcustom'
      Object.assign(custom.style, {
        font: 'inherit',
        fontSize: '11.5px',
        color: '#e5e5ea',
        background: 'rgba(255,255,255,.08)',
        border: '1px solid rgba(255,255,255,.14)',
        borderRadius: '6px',
        padding: '4px 8px',
        cursor: 'pointer',
      })
      custom.textContent = 'Personnalisée\u2026'
      custom.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        grid.style.display = 'none'
        custom.style.display = 'none'
        // An Agent that does not exist yet must not write a colour under a
        // provisional id, so the caller can take both callbacks over.
        const panel = customColorPanel(current ?? '#5b8def', customApply === undefined
          ? {
            preview: (hex) => {
              AGENT_COLORS.set(agent, hex)
              repaintAgentDots()
            },
            commit: (hex) => {
              void writeAgentColor(agent, hex).then(() => repaintAgentDots())
            },
          }
          : {
            preview: (hex) => { customApply(hex, false) },
            commit: (hex) => { customApply(hex, true) },
          })
        pop.insertBefore(panel, none)
        place()
      })
      pop.appendChild(custom)

      document.body.appendChild(pop)
      const box = anchor.getBoundingClientRect()
      /** Place the popover under the anchor, above it when there is no room. */
      const place = () => {
        const width = pop.offsetWidth || 150
        const height = pop.offsetHeight || 120
        const viewWidth = document.documentElement.clientWidth
        const viewHeight = window.innerHeight
        const left = Math.min(
          Math.max(8, box.left + window.scrollX),
          window.scrollX + viewWidth - width - 8,
        )
        let top = box.bottom + window.scrollY + 6
        if (box.bottom + 6 + height > viewHeight) {
          top = Math.max(window.scrollY + 8, box.top + window.scrollY - height - 6)
        }
        pop.style.top = top + 'px'
        pop.style.left = left + 'px'
      }
      place()
      COLOR_POPOVER = pop

      // Dismiss on the next outside click or on Escape, without letting the
      // menu's own handlers close it first.
      const dismiss = (event) => {
        if (event.type === 'keydown' && event.key !== 'Escape') return
        if (event.type !== 'keydown' && pop.contains(event.target)) return
        closeColorPopover()
        window.removeEventListener('mousedown', dismiss, true)
        window.removeEventListener('keydown', dismiss, true)
      }
      window.addEventListener('mousedown', dismiss, true)
      window.addEventListener('keydown', dismiss, true)
      return pop
    }

    /**
     * The colour row: a dot, the value, and the same popover everywhere.
     *
     * Used by the Agent list (the dot is the control), by the creation form
     * (where the id does not exist yet and the choice is written once the
     * declaration is created) and by the editor (where it is written at once).
     * A read-only view shows the colour without offering to change it.
     */
    function colorControl(id, options) {
      const settings = options ?? {}
      const readOnly = settings.readOnly === true
      const currentOf = typeof settings.current === 'function'
        ? settings.current
        : () => (settings.current ?? null)
      const wrap = document.createElement('div')
      wrap.style.cssText = 'display:flex;align-items:center;gap:8px'
      const dot = document.createElement('button')
      dot.type = 'button'
      dot.style.cssText = 'width:16px;height:16px;min-width:16px;border-radius:50%;padding:0;box-sizing:border-box;flex:none;'
        + (readOnly ? 'cursor:default;' : 'cursor:pointer;')
      const value = document.createElement('span')
      value.style.cssText = 'font-size:11.5px;color:#9a9aa2'
      const paint = (hex) => {
        const chosen = typeof hex === 'string' && hex.length > 0 ? hex : null
        if (chosen === null) {
          dot.style.background = 'transparent'
          dot.style.border = '1.5px dashed rgba(255,255,255,.35)'
        } else {
          dot.style.background = chosen
          dot.style.border = '1px solid rgba(0,0,0,.35)'
        }
        dot.title = chosen === null ? 'Aucune couleur' : 'Couleur ' + chosen
        value.textContent = chosen ?? 'Aucune'
      }
      paint(currentOf())
      wrap.append(dot, value)
      if (readOnly !== true) {
        const hint = document.createElement('span')
        hint.style.cssText = 'font-size:10.5px;color:#6f6f78'
        hint.textContent = 'cliquez sur la pastille'
        wrap.appendChild(hint)
        dot.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          colorPopover(id, dot, (picked) => {
            const chosen = picked ?? null
            paint(chosen)
            settings.onPick?.(chosen)
          }, currentOf(), typeof settings.customApply === 'function' ? settings.customApply : undefined)
        })
      }
      return {
        element: wrap,
        set(hex) { paint(hex) },
      }
    }

    /**
     * The dot itself.
     *
     * Every visual property is inline on purpose: the plugin stylesheet is only
     * injected for the Skill/MCP page and the subagent card, so a class-based
     * dot on the preset list would be an empty span of zero size — invisible.
     * Inline styles make the dot work wherever it is inserted.
     */
    function agentDot(agent) {
      const dot = document.createElement('span')
      dot.className = 'dsh-mcpc-agentdot'
      dot.setAttribute('data-mcpc-dot', agent)
      dot.setAttribute('aria-hidden', 'true')
      const base = {
        display: 'inline-block',
        width: '9px',
        height: '9px',
        minWidth: '9px',
        borderRadius: '50%',
        marginRight: '6px',
        verticalAlign: 'middle',
        flex: '0 0 auto',
        boxSizing: 'border-box',
        cursor: 'pointer',
      }
      const color = AGENT_COLORS?.get(agent) ?? null
      for (const [key, value] of Object.entries(base)) dot.style[key] = value
      if (color === null) {
        dot.style.border = '1.5px dashed currentColor'
        dot.style.opacity = '0.55'
        dot.title = 'Couleur de l\u2019Agent : aucune \u00b7 cliquez pour choisir'
      } else {
        dot.style.background = color
        dot.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,.25)'
        dot.title = 'Couleur de l\u2019Agent : ' + color + ' \u00b7 cliquez pour changer'
      }
      dot.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        const id = agent
        colorPopover(id, dot, (picked) => {
          void writeAgentColor(id, picked).then(() => {
            repaintAgentDots()
          })
        })
      })
      return dot
    }

    /** Recolour every dot already painted, after a choice changed. */
    function repaintAgentDots() {
      for (const dot of document.querySelectorAll('[data-mcpc-dot]')) {
        const agent = dot.getAttribute('data-mcpc-dot')
        const color = AGENT_COLORS?.get(agent) ?? null
        if (color === null) {
          dot.classList.add('dsh-mcpc-agentdot-none')
          dot.style.removeProperty('background')
          dot.style.removeProperty('box-shadow')
          dot.style.border = '1.5px dashed currentColor'
          dot.style.opacity = '0.55'
          dot.title = 'Couleur de l\u2019Agent : aucune \u00b7 cliquez pour choisir'
        } else {
          dot.classList.remove('dsh-mcpc-agentdot-none')
          dot.style.removeProperty('border')
          dot.style.opacity = '1'
          dot.style.background = color
          dot.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,.25)'
          dot.title = 'Couleur de l\u2019Agent : ' + color + ' \u00b7 cliquez pour changer'
        }
      }
    }

    /**
     * Every preset row rendered on the page.
     *
     * The shipped Agent-preset view is NOT an ARIA menu: it is a list of
     * `<li data-agent-preset-id="…">` cards, and the whole bundle contains no
     * `role="menu"` at all. Earlier code looked for `[role="menu"]` and so could
     * never match a single row however the labels were fixed. The identifier is
     * this data attribute, which is exact and needs no name matching.
     */
    function presetRows() {
      return deepQueryAll('[data-agent-preset-id]')
    }

    /** The name node inside one row, into which the dot is inserted. */
    function rowNameNode(row) {
      // The card prints the name in its own span; falling back to the row keeps
      // the dot visible even if that inner span goes away.
      const named = row.querySelector('[class*="cardName"]')
      if (named !== null) return named
      return row.querySelector('[class*="cardIdentity"]') ?? row
    }

    /**
     * Every container that may hold the preset list, including the portal.
     *
     * The settings view is a list of `<li data-agent-preset-id>`, but the
     * New-Session menu is portaled, mounted only while open, and carries NO
     * such attribute — the whole bundle has no `role="menu"` either. So every
     * plausible container is scanned, and inside it any node that looks like a
     * preset entry, by attribute first and by its printed name as a fallback.
     */
    function presetContainers() {
      const found = []
      const push = (list) => {
        for (const node of list) if (!found.includes(node)) found.push(node)
      }
      push(document.querySelectorAll('[role="menu"]'))
      push(document.querySelectorAll('[role="listbox"]'))
      // The portal root: React appends it outside the app tree.
      if (document.body !== null) for (const child of document.body.children) push([child])
      return found
    }

    /**
     * Put one dot before the name of every preset row that lacks one.
     *
     * No structural hook survives: the settings cards carry
     * `data-agent-preset-id` but the portaled list carries no role, no class
     * alias and no id attribute, and its text is the only stable signal. Rows
     * are therefore found from the printed names: the deepest element whose own
     * text is exactly one known label. "Deepest" matters, otherwise the whole
     * card is matched and the dot lands once per card at the wrong place.
     */
    function decoratePresetRows() {
      if (AGENT_COLORS === null) return 0
      let painted = 0

      // Labels resolved from the Host roster plus the built-in table, so a
      // custom Agent is matched by the name it actually prints.
      const wanted = new Map()
      const addEntry = (entry) => {
        if (entry === undefined || entry === null) return
        const id = typeof entry.id === 'string' ? entry.id : null
        if (id === null) return
        for (const label of presetLabels(entry)) {
          if (label.length > 0 && !wanted.has(label)) wanted.set(label, id)
        }
      }
      for (const entry of (PRESET_STATS ?? new Map()).values()) addEntry(entry)
      for (const id of Object.keys(BUILTIN_PRESET_NAMES)) {
        for (const label of BUILTIN_PRESET_NAMES[id]) addEntry({ id, name: label })
      }
      if (wanted.size === 0) return 0

      /** Resolve the Agent id printed by one name node. */
      const idOfText = (text) => {
        const own = foldLabel(String(text ?? '').replace(/\s+/g, ' ').trim())
        if (own.length === 0 || own.length > 48) return null
        const direct = wanted.get(own)
        if (direct !== undefined) return direct
        for (const [label, candidate] of wanted) {
          if (own.length > label.length && own.length - label.length <= 6 && own.startsWith(label)) return candidate
        }
        return null
      }

      /** Paint one name node, once. */
      const paint = (node, id) => {
        if (node === null || node === undefined) return
        if (node.querySelector('[data-mcpc-dot]') !== null) return
        node.insertBefore(agentDot(id), node.firstChild)
        painted += 1
      }

      // 1. The settings cards: an exact attribute carries the id.
      for (const row of deepQueryAll('[data-agent-preset-id]')) {
        const id = row.getAttribute('data-agent-preset-id')
        if (typeof id !== 'string' || id.length === 0) continue
        // cardIdentity is the flex row that already holds the name and its
        // badges, so the dot is laid out beside them. cardName alone is
        // `overflow:hidden` + ellipsis and would clip it.
        const named = row.querySelector('[class*="cardIdentity"]')
          ?? row.querySelector('[class*="cardName"]')
          ?? row
        paint(named, id)
      }

      // 2. The New-Session menu: the shipped Menu primitive prints each entry
      // as a *itemName span beside its *itemDesc. That class suffix is the only
      // stable hook, so nothing else is considered.
      for (const node of deepQueryAll('[class*="itemName"]')) {
        const id = idOfText(node.textContent)
        if (id === null) continue
        // A sub-agent persona stays in the roster but is not offered as the
        // agent for a new conversation, so its row is collapsed. The row is the
        // nearest ancestor whose class is exactly `*_item`.
        if (HIDDEN_PRESETS.has(id)) {
          const row = menuRowOf(node)
          if (row !== null) {
            row.style.setProperty('display', 'none', 'important')
            HIDDEN_ROWS.add(row)
          }
          continue
        }
        // A row hidden by an earlier pass must come back when it is unhidden.
        const row = menuRowOf(node)
        if (row !== null && HIDDEN_ROWS.has(row)) {
          row.style.removeProperty('display')
          HIDDEN_ROWS.delete(row)
        }
        paint(node, id)
      }

      return painted
    }

    /** Rows collapsed because their preset is a sub-agent persona. */
    const HIDDEN_ROWS = new Set()

    /** The menu row that owns one name node: the ancestor classed `*_item`. */
    function menuRowOf(node) {
      // The menu row is the `menuitem`: it owns both the name/description block
      // AND the token badge this plugin appends, so hiding the inner `_item`
      // block alone left an empty row with a floating badge. Collapsing the
      // menuitem removes the whole entry.
      const item = typeof node.closest === 'function' ? node.closest('[role="menuitem"]') : null
      if (item !== null && item !== undefined) return item
      let current = node
      for (let depth = 0; depth < 6 && current !== null && current !== undefined; depth += 1) {
        const className = typeof current.className === 'string' ? current.className : ''
        if (/(^|\s)[A-Za-z0-9_-]+_item(\s|$)/.test(className)) return current
        current = current.parentElement
      }
      return null
    }

    /** Depth in the tree, used to prefer the innermost name node. */
    function depthOf(node) {
      let depth = 0
      let current = node
      while (current !== null && current !== undefined && depth < 40) {
        current = current.parentElement ?? current.parentNode
        depth += 1
      }
      return depth
    }

    /** Watch the page for preset rows and give each one its dot. */
    function installAgentColors() {
      if (typeof MutationObserver !== 'function') return false
      let queued = false
      let lastReport = ''
      const scan = () => {
        queued = false
        if (AGENT_COLORS === null) return
        const painted = decoratePresetRows()
        // One line per distinct outcome: enough to diagnose a regression,
        // quiet enough to leave the rest of the log readable.
        const text = painted + ' dot(s)'
        if (text !== lastReport) {
          lastReport = text
          report('agent-colors', text + ', ' + HIDDEN_PRESETS.size + ' hidden')
        }
      }
      const schedule = () => {
        if (queued) return
        queued = true
        window.requestAnimationFrame(scan)
      }
      // The settings cards only need the colours. The portaled menu resolves
      // its rows by printed name, so it also needs the id list, but that fetch
      // must not gate the cards — it is started alongside, never awaited.
      void readAgentColors().then(schedule)
      void loadPresetStats().then(schedule)
      const observer = new MutationObserver(schedule)
      // The menu is portaled and lives only while it is open, so added nodes
      // are not enough: React also flips attributes and moves the container.
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      })
      // A mutation-based watch alone missed the settings view more than once:
      // the rows can arrive in one commit that the observer coalesces, or the
      // whole subtree can be swapped. A slow sweep guarantees the dots appear
      // without depending on catching that single event.
      // Stale dots left by an earlier build sit on nodes whose text merely
      // contained a name; they are removed once so the strict targeting below
      // starts from a clean tree.
      try {
        for (const stale of document.querySelectorAll('[data-mcpc-dot]')) {
          if (!stale.closest('[class*="itemName"],[data-agent-preset-id]')) stale.remove()
        }
      } catch { /* ignore */ }
      const sweep = setInterval(schedule, 250)
      if (typeof sweep?.unref === 'function') sweep.unref()
      report('agent-colors', 'observing')
      return true
    }

    /** Watch the document for the preset menu opening, then decorate it once. */
    function installPresetSeatStats() {
      if (typeof MutationObserver !== 'function') return false
      let queued = false
      const scan = () => {
        queued = false
        if (PRESET_STATS === null) return
        for (const menu of document.querySelectorAll('[role="menu"]')) {
          decorateSeatMenu(menu, PRESET_STATS)
        }
      }
      const schedule = () => {
        if (queued) return
        queued = true
        // Menus are portaled and re-rendered by React: scan on the next frame
        // so a fresh card list is complete when it is read.
        window.requestAnimationFrame(scan)
      }
      const observer = new MutationObserver(schedule)
      observer.observe(document.body, { childList: true, subtree: true })
      // Fetch lazily, on the first menu that looks like the preset menu.
      const warm = new MutationObserver(() => {
        if (PRESET_STATS !== null || PRESET_STATS_PENDING !== null) return
        const menus = document.querySelectorAll('[role="menu"]')
        if (menus.length === 0) return
        void loadPresetStats().then(schedule)
      })
      warm.observe(document.body, { childList: true, subtree: true })
      report('preset-stats', 'observing')
      return true
    }

    /* ------------------------------------------------------------------ */
    /* 2d. Agent manager: one modal listing every Agent and its cost        */
    /* ------------------------------------------------------------------ */
    /*
     * Opened from a "Manage agents" button pinned under the Agent list. The
     * panel is plain DOM with inline styles, for the same reason the dot is:
     * the plugin stylesheet is not loaded on these pages.
     */

    let AGENT_MANAGER = null
    let AGENTS_CACHE = null

    /** Colours and sizing shared by every control in the manager. */
    const UI = {
      panel: {
        position: 'fixed',
        inset: '0',
        zIndex: '2147483000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,.55)',
        padding: '24px',
      },
      card: {
        display: 'flex',
        flexDirection: 'column',
        width: 'min(760px, 100%)',
        maxHeight: 'min(84vh, 900px)',
        borderRadius: '14px',
        background: '#1b1b1f',
        border: '1px solid rgba(255,255,255,.12)',
        boxShadow: '0 24px 70px rgba(0,0,0,.55)',
        overflow: 'hidden',
        fontFamily: 'inherit',
      },
      head: {
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '16px 18px 12px',
        borderBottom: '1px solid rgba(255,255,255,.08)',
      },
      body: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '12px 18px 18px',
        overflowY: 'auto',
      },
      scopeHead: {
        fontSize: '12px',
        letterSpacing: '.10em',
        textTransform: 'uppercase',
        fontWeight: '700',
        color: '#d0d0d8',
        margin: '18px 0 6px',
        paddingBottom: '6px',
        borderBottom: '1px solid rgba(255,255,255,.10)',
      },
      groupHead: {
        fontSize: '11px',
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        fontWeight: '600',
        color: '#8a8a92',
        margin: '10px 0 2px',
      },
      row: {
        display: 'flex',
        gap: '10px',
        alignItems: 'flex-start',
        padding: '10px 12px',
        borderRadius: '10px',
        background: 'rgba(255,255,255,.04)',
        border: '1px solid rgba(255,255,255,.08)',
      },
      name: { fontSize: '13px', fontWeight: '600', color: '#f2f2f7' },
      desc: { fontSize: '12px', lineHeight: '1.45', color: '#b0b0b8' },
      chip: {
        fontSize: '10.5px',
        lineHeight: '16px',
        padding: '1px 7px',
        borderRadius: '5px',
        background: 'rgba(255,255,255,.07)',
        border: '1px solid rgba(255,255,255,.10)',
        color: '#b0b0b8',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        whiteSpace: 'nowrap',
      },
      btn: {
        font: 'inherit',
        fontSize: '11.5px',
        color: '#e5e5ea',
        background: 'rgba(255,255,255,.08)',
        border: '1px solid rgba(255,255,255,.14)',
        borderRadius: '7px',
        padding: '5px 10px',
        cursor: 'pointer',
      },
      iconBtn: {
        font: 'inherit',
        fontSize: '13px',
        lineHeight: '1',
        color: '#b0b0b8',
        background: 'transparent',
        border: '0',
        borderRadius: '6px',
        padding: '4px 6px',
        cursor: 'pointer',
      },
    }

    /** Stroke icons, drawn so they inherit the button's colour. */
    const EYE_PATH = 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'
    const PENCIL_PATH = 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z'
    const COPY_PATH = 'M9 9h10v10H9Z M5 15V5h10'

    function iconButton(path, title, onClick) {
      const button = document.createElement('button')
      button.type = 'button'
      button.title = title
      button.setAttribute('aria-label', title)
      Object.assign(button.style, UI.iconBtn, { padding: '5px', display: 'inline-flex' })
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('viewBox', '0 0 24 24')
      svg.setAttribute('width', '15')
      svg.setAttribute('height', '15')
      svg.setAttribute('fill', 'none')
      svg.setAttribute('stroke', 'currentColor')
      svg.setAttribute('stroke-width', '1.7')
      svg.setAttribute('stroke-linecap', 'round')
      svg.setAttribute('stroke-linejoin', 'round')
      for (const d of path.split(' M')) {
        const node = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        node.setAttribute('d', d.startsWith('M') ? d : 'M' + d)
        svg.appendChild(node)
      }
      button.appendChild(svg)
      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick(event)
      })
      return button
    }

    function uiButton(label, style, onClick) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = label
      Object.assign(button.style, style ?? UI.btn)
      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick(event)
      })
      return button
    }

    /** The colour dot reused from the preset list, without the click handler. */
    function managerDot(id) {
      // The same dot as everywhere else, so clicking it opens the palette: the
      // list is where an Agent's colour is most often set.
      const dot = agentDot(id)
      dot.style.marginRight = '0'
      dot.style.marginTop = '4px'
      return dot
    }

    /** Read the roster once per opening. */
    function loadAgents() {
      if (AGENTS_CACHE !== null) return Promise.resolve(AGENTS_CACHE)
      return fetchJson(ENDPOINT + '?view=agents&client=' + CLIENT_VERSION)
        .then((payload) => {
          AGENTS_CACHE = payload
          return payload
        })
        .catch(() => null)
    }

    /** Classification line shown instead of the choosers in consult mode. */
    function renderReadOnlySummary(body, entry) {
      const line = document.createElement('div')
      Object.assign(line.style, { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' })
      const chip = (text) => {
        const span = document.createElement('span')
        Object.assign(span.style, UI.chip)
        span.textContent = text
        return span
      }
      line.appendChild(chip(entry.scope === 'project' ? 'Projet' : 'Global'))
      line.appendChild(chip(entry.kind === 'subagent' ? 'Sous-agent' : 'Agent'))
      line.appendChild(chip(entry.builtIn ? 'déclaré par DSH' : 'déclaré par un bundle'))
      body.appendChild(line)
    }

    /**
     * The composition editor, shared by creation and consultation.
     *
     * A preset is a plugin list: its "tools" are the tool modules it mounts and
     * its MCP servers are modules too. The same component therefore edits and
     * displays both, and the consultation view is the read-only form of it —
     * every module is listed, checked when the Agent mounts it.
     *
     * MCP servers are offered whole or tool by tool: checking a server reveals
     * the tools it publishes, and the pin stores exactly the ones kept.
     */
    function renderCompose(body, options) {
      const settings = options ?? {}
      const readOnly = settings.readOnly === true
      const id = typeof settings.id === 'string' && settings.id.length > 0 ? settings.id : null
      const kindOf = typeof settings.kindOf === 'function'
        ? settings.kindOf
        : () => (settings.kind === 'subagent' ? 'subagent' : 'agent')
      const tools = new Map()
      const servers = new Map()
      const cache = new Map()
      let loaded = false
      let warn = () => {}

      const field = (label) => {
        const wrap = document.createElement('div')
        Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' })
        const caption = document.createElement('div')
        caption.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:11px;color:#8a8a92;font-weight:500'
        const text = document.createElement('span')
        text.textContent = label
        const count = document.createElement('span')
        count.style.cssText = 'font-size:10.5px;color:#6f6f78;font-weight:400'
        caption.append(text, count)
        wrap.appendChild(caption)
        wrap.count = count
        return wrap
      }

      const rowFor = (label, meta, checked, onChange, extra) => {
        const options = extra ?? {}
        const row = document.createElement('label')
        Object.assign(row.style, {
          display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '4px 7px',
          borderRadius: '6px', cursor: readOnly ? 'default' : 'pointer',
          background: 'rgba(255,255,255,.025)',
        })
        const box = document.createElement('input')
        box.type = 'checkbox'
        box.checked = checked === true
        box.disabled = readOnly
        box.style.cssText = 'margin:2px 0 0 0;width:13px;height:13px;accent-color:#0a84ff;flex:none;'
          + (readOnly ? 'cursor:default;opacity:.9' : 'cursor:pointer')
        const text = document.createElement('div')
        text.style.cssText = 'display:flex;flex-direction:column;min-width:0;gap:1px;flex:1 1 auto'
        const name = document.createElement('span')
        name.style.cssText = 'font-size:12px;color:#f2f2f7;line-height:1.3'
        name.textContent = label
        text.appendChild(name)
        // The description is what tells one module or one MCP tool from another:
        // two lines at most, so a list of thirty stays readable.
        if (typeof options.desc === 'string' && options.desc.length > 0) {
          const about = document.createElement('span')
          about.style.cssText = 'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;'
            + 'font-size:10.5px;color:#9a9aa2;line-height:1.35'
          about.textContent = options.desc
          about.title = options.desc
          text.appendChild(about)
        }
        if (typeof meta === 'string' && meta.length > 0) {
          const note = document.createElement('span')
          note.style.cssText = 'font-size:10px;color:#6f6f78;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
          note.textContent = meta
          text.appendChild(note)
        }
        row.append(box, text)
        // A weight on the right edge: the number a reader compares down a
        // column, kept off the text so no description is pushed away.
        if (typeof options.right === 'string' && options.right.length > 0) {
          const weight = document.createElement('span')
          weight.style.cssText = 'margin-left:auto;flex:none;font-size:10px;color:#7e7e87;white-space:nowrap;padding-top:1px'
          weight.textContent = options.right
          row.appendChild(weight)
        }
        if (typeof options.title === 'string' && options.title.length > 0) row.title = options.title
        if (readOnly !== true) box.addEventListener('change', () => { onChange?.(box.checked) })
        return row
      }

      const tok = (value) => (typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value.toLocaleString('fr-FR') + ' tok'
        : '')

      const note = (text) => {
        const line = document.createElement('div')
        line.style.cssText = 'font-size:10.5px;color:#7e7e87;line-height:1.45;padding:0 2px'
        line.textContent = text
        return line
      }

      // ---- Tools -------------------------------------------------------
      const toolsField = field('Tools')
      const toolsList = document.createElement('div')
      toolsList.style.cssText = 'display:flex;flex-direction:column;gap:2px'
      toolsField.appendChild(toolsList)
      body.appendChild(toolsField)

      const paintTools = () => {
        toolsList.textContent = ''
        let on = 0
        for (const [pack, row] of tools.entries()) {
          if (row.checked) on += 1
          const note = row.off === 'off'
            ? 'désactivé dans la déclaration'
            : (row.off === 'conditional' ? 'activé selon la plateforme' : null)
          const line = rowFor(row.label, note, row.checked, (checked) => {
            row.checked = checked
            paintTools()
          }, { desc: row.desc, title: pack })
          if (!row.checked) line.style.opacity = readOnly ? '.55' : '.72'
          toolsList.appendChild(line)
        }
        toolsField.count.textContent = loaded ? on + ' / ' + tools.size : 'lecture…'
      }

      // ---- MCP ---------------------------------------------------------
      const mcpField = field('MCP')
      const mcpList = document.createElement('div')
      mcpList.style.cssText = 'display:flex;flex-direction:column;gap:2px'
      mcpField.appendChild(mcpList)
      mcpField.appendChild(note(readOnly
        ? 'Serveurs forcés dans cet agent : ils restent actifs même si le profil les coupe.'
        : 'L’agent garde ces serveurs même si le profil les coupe. Un serveur désactivé est démarré et réservé à cet agent.'))
      body.appendChild(mcpField)

      const toolsOfServer = (server, options) => new Promise((resolve) => {
        const discover = options !== undefined && options.discover === true
        if (!discover && cache.has(server)) { resolve(cache.get(server)); return }
        const suffix = discover ? '&discover=1' : ''
        fetchJson(ENDPOINT + '?view=serverTools&server=' + encodeURIComponent(server) + '&client=' + CLIENT_VERSION + suffix)
          .then((payload) => {
            const rows = Array.isArray(payload?.tools) ? payload.tools : []
            if (rows.length > 0) cache.set(server, rows)
            resolve(rows)
          })
          .catch(() => resolve([]))
      })

      // Explicit probe: keeps the reason so the form can say why it failed.
      const discoverServerTools = (server) => fetchJson(
        ENDPOINT + '?view=serverTools&server=' + encodeURIComponent(server) + '&client=' + CLIENT_VERSION + '&discover=1'
      ).then((payload) => {
        const rows = Array.isArray(payload?.tools) ? payload.tools : []
        if (rows.length > 0) cache.set(server, rows)
        return { rows, error: typeof payload?.error === 'string' ? payload.error : null }
      }).catch((error) => ({ rows: [], error: String(error?.message ?? error) }))

      const paintServerTools = async (state) => {
        const before = state.holder
        if (before === null || before === undefined) return
        before.textContent = ''
        if (state.on !== true) { before.style.display = 'none'; return }
        before.style.display = 'flex'
        const rows = await toolsOfServer(state.name)
        if (state.on !== true) return
        // A repaint may have replaced the holder while the tools were loading.
        const holder = state.holder ?? before
        holder.style.display = 'flex'
        holder.textContent = ''
        // `*` means the whole server: every tool it publishes is kept.
        if (state.tools.has('*') && rows.length > 0) {
          state.tools = new Set(rows.map((row) => row.name))
        }
        if (rows.length === 0) {
          // The server is off in the profile (or has not answered yet), so the
          // registry knows none of its tools. Offer an explicit probe instead of
          // a dead end: it opens one short-lived connection and caches the list.
          const off = state.enabled !== true
          const failed = typeof state.probeError === 'string' && state.probeError.length > 0
          holder.appendChild(note(failed
            ? 'Impossible de lister les outils : ' + state.probeError
            : off
              ? 'Serveur désactivé dans le profil : ses outils ne sont pas encore connus.'
              : 'Aucun outil publié pour l’instant : le serveur n’a pas encore répondu.'))
          if (readOnly !== true) {
            const probeButton = document.createElement('button')
            probeButton.type = 'button'
            probeButton.textContent = 'Découvrir les outils'
            probeButton.style.cssText = 'font:inherit;font-size:10.5px;padding:2px 9px;border-radius:5px;align-self:flex-start;'
              + 'border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#c9c9d1;cursor:pointer'
            probeButton.addEventListener('click', (event) => {
              event.preventDefault()
              event.stopPropagation()
              probeButton.disabled = true
              probeButton.textContent = 'connexion…'
              state.probeError = null
              void discoverServerTools(state.name).then((result) => {
                if (result.rows.length === 0) state.probeError = result.error ?? 'aucun outil renvoyé'
                void paintServerTools(state)
              })
            })
            holder.appendChild(probeButton)
          }
          return
        }
        const head = document.createElement('div')
        head.style.cssText = 'display:flex;align-items:center;gap:8px;padding:0 2px 2px'
        const count = document.createElement('span')
        count.style.cssText = 'font-size:10.5px;color:#7e7e87'
        const tally = () => {
          const on = rows.filter((row) => state.tools.has(row.name)).length
          count.textContent = on + ' / ' + rows.length + (rows.length === 1 ? ' outil actif' : ' outils actifs')
        }
        head.appendChild(count)
        if (readOnly !== true) {
          for (const preset of [{ label: 'Tous', all: true }, { label: 'Aucun', all: false }]) {
            const button = document.createElement('button')
            button.type = 'button'
            button.textContent = preset.label
            button.style.cssText = 'font:inherit;font-size:10.5px;padding:1px 7px;border-radius:5px;border:1px solid rgba(255,255,255,.14);'
              + 'background:rgba(255,255,255,.05);color:#c9c9d1;cursor:pointer'
            button.addEventListener('click', (event) => {
              event.preventDefault()
              event.stopPropagation()
              state.tools.clear()
              if (preset.all) for (const row of rows) state.tools.add(row.name)
              void paintServerTools(state)
            })
            head.appendChild(button)
          }
        }
        holder.appendChild(head)
        tally()
        for (const row of rows) {
          const line = rowFor(row.label ?? row.name, null, state.tools.has(row.name), (checked) => {
            if (checked) state.tools.add(row.name)
            else state.tools.delete(row.name)
            tally()
          }, {
            desc: row.description,
            title: row.name,
            right: tok(row.tokens),
          })
          line.style.background = 'transparent'
          line.style.paddingLeft = '4px'
          holder.appendChild(line)
        }
      }

      const paintServers = () => {
        mcpList.textContent = ''
        let on = 0
        for (const state of servers.values()) {
          if (state.on) on += 1
          const count = state.toolCount > 0 ? state.toolCount : (state.cachedToolCount ?? 0)
          const weight = state.tokens > 0 ? state.tokens : (state.cachedTokens ?? 0)
          // The row states what the server costs: how many tools it brings and
          // what they weigh in the prompt. Everything else is in the tooltip.
          const meta = []
          if (count > 0) meta.push(count + (count === 1 ? ' outil' : ' outils'))
          if (weight > 0) meta.push(tok(weight))
          const parts = []
          if (typeof state.transport === 'string' && state.transport.length > 0) parts.push(state.transport)
          if (typeof state.desc === 'string' && state.desc.length > 0) parts.push(state.desc)
          parts.push(state.enabled === true && state.active === true ? 'actif dans le profil'
            : state.enabled === true ? 'démarré, sans outil' : 'désactivé dans le profil')
          const block = document.createElement('div')
          block.style.cssText = 'display:flex;flex-direction:column;gap:2px'
          // Name and description only: the transport, the tool count and the
          // profile state stay in the tooltip, where they are one hover away
          // without crowding a list the reader scans for names.
          // The count and the weight sit on the name line, right-aligned: one
          // line per server, and the numbers still line up in a column.
          const line = rowFor(state.name, null, state.on, (checked) => {
            state.on = checked
            if (checked && state.tools.size === 0) state.tools.add('*')
            void paintServerTools(state)
            paintServers()
          }, { right: meta.join(' · '), title: parts.join(' · ') })
          block.appendChild(line)
          const holder = document.createElement('div')
          holder.style.cssText = 'display:none;flex-direction:column;gap:1px;margin:0 0 4px 24px'
          state.holder = holder
          block.appendChild(holder)
          mcpList.appendChild(block)
          if (state.on) void paintServerTools(state)
        }
        mcpField.count.textContent = loaded ? on + ' / ' + servers.size : 'lecture…'
      }

      const paint = (data) => {
        loaded = true
        tools.clear()
        for (const row of Array.isArray(data?.tools) ? data.tools : []) {
          tools.set(row.name, {
            label: row.label,
            desc: typeof row.desc === 'string' ? row.desc : '',
            off: row.off ?? null,
            checked: row.checked === true,
          })
        }
        servers.clear()
        for (const row of Array.isArray(data?.mcp) ? data.mcp : []) {
          const pinned = Array.isArray(row.pinned) ? row.pinned : null
          const state = {
            name: row.name,
            transport: row.transport,
            enabled: row.enabled === true,
            active: row.active === true,
            toolCount: row.toolCount ?? 0,
            tokens: row.tokens ?? 0,
            cachedToolCount: row.cachedToolCount ?? null,
            cachedTokens: row.cachedTokens ?? null,
            desc: typeof row.desc === 'string' ? row.desc : '',
            on: pinned !== null,
            tools: new Set(pinned ?? []),
            holder: null,
          }
          servers.set(row.name, state)
        }
        paintTools()
        paintServers()
      }

      const reload = () => {
        loaded = false
        toolsField.count.textContent = 'lecture…'
        mcpField.count.textContent = 'lecture…'
        const query = id === null
          ? ENDPOINT + '?view=composeOptions&kind=' + kindOf() + '&client=' + CLIENT_VERSION
          : ENDPOINT + '?view=composeOptions&id=' + encodeURIComponent(id) + '&client=' + CLIENT_VERSION
        fetchJson(query)
          .then((data) => {
            if (data?.ok !== true) {
              toolsField.count.textContent = ''
              mcpField.count.textContent = ''
              toolsList.appendChild(note('Composition illisible : ' + String(data?.error ?? 'inconnue')))
              return
            }
            paint(data)
          })
          .catch(() => {
            loaded = false
            toolsField.count.textContent = ''
            mcpField.count.textContent = ''
            toolsList.appendChild(note('Composition indisponible.'))
          })
      }
      reload()

      return {
        reload,
        onWarning(handler) { warn = typeof handler === 'function' ? handler : () => {} },
        /** The tool packages this Agent should mount. */
        collectTools() {
          return [...tools.entries()].filter(([, row]) => row.checked).map(([name]) => name)
        },
        /** `server:spec;…` where spec is `*` or the kept tool names. */
        collectMcp() {
          const out = []
          for (const state of servers.values()) {
            if (state.on !== true) continue
            if (state.tools.has('*')) { out.push(state.name + ':*'); continue }
            const names = [...state.tools]
            if (names.length === 0) {
              warn(state.name + ' : aucun outil sélectionné, le serveur ne sera pas forcé')
              continue
            }
            out.push(state.name + ':' + names.join('|'))
          }
          return out.join(';')
        },
      }
    }

    /** The "new Agent" form. */
    function openAgentCreator() {
      closeAgentManager()
      const overlay = document.createElement('div')
      Object.assign(overlay.style, UI.panel)
      overlay.addEventListener('click', (event) => { if (event.target === overlay) closeAgentManager() })
      const card = document.createElement('div')
      Object.assign(card.style, UI.card)
      overlay.appendChild(card)

      const head = document.createElement('div')
      Object.assign(head.style, UI.head)
      const headText = document.createElement('div')
      const title = document.createElement('div')
      title.style.cssText = 'font-size:15px;font-weight:600;color:#f2f2f7'
      title.textContent = 'Nouvel agent'
      const sub = document.createElement('div')
      sub.style.cssText = 'font-size:12px;color:#8a8a92;margin-top:3px'
      sub.textContent = 'Un nom, un prompt, puis les outils et les MCP que cet agent monte.'
      headText.append(title, sub)
      head.appendChild(headText)
      head.appendChild(uiButton('\u2715', UI.iconBtn, closeAgentManager))
      card.appendChild(head)

      const body = document.createElement('div')
      Object.assign(body.style, UI.body)
      card.appendChild(body)

      const field = (label) => {
        const wrap = document.createElement('div')
        Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' })
        const caption = document.createElement('div')
        caption.style.cssText = 'font-size:11px;color:#8a8a92;font-weight:500'
        caption.textContent = label
        wrap.appendChild(caption)
        return wrap
      }
      const inputStyle = {
        font: 'inherit', fontSize: '12.5px', color: '#f2f2f7',
        background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)',
        borderRadius: '7px', padding: '7px 9px', outline: 'none', width: '100%', boxSizing: 'border-box',
      }

      const nameInput = document.createElement('input')
      Object.assign(nameInput.style, inputStyle)
      nameInput.placeholder = 'Mon agent'
      const nameField = field('Nom')
      nameField.appendChild(nameInput)
      body.appendChild(nameField)

      const descInput = document.createElement('textarea')
      Object.assign(descInput.style, { ...inputStyle, minHeight: '52px', resize: 'vertical' })
      descInput.placeholder = 'Ce que fait cet agent'
      const descField = field('Description')
      descField.appendChild(descInput)
      body.appendChild(descField)

      // Colour: chosen now, written on the declaration once it exists.
      const pendingColor = { hex: null }
      const colorRow = colorControl('@nouveau', {
        current: () => pendingColor.hex,
        onPick: (hex) => { pendingColor.hex = hex },
        // The full picker previews and commits on the pending value only: there
        // is no id to store anything against yet.
        customApply: (hex) => {
          pendingColor.hex = hex
          colorRow.set(hex)
        },
      })
      const colorField = field('Couleur')
      colorField.appendChild(colorRow.element)
      body.appendChild(colorField)

      // Type: the template the plugin list is taken from.
      let compose = null
      const typeField = field('Type')
      const types = document.createElement('div')
      Object.assign(types.style, { display: 'inline-flex', gap: '2px', padding: '2px', borderRadius: '7px', background: 'rgba(255,255,255,.05)' })
      let kind = 'agent'
      const typeButtons = []
      for (const option of [{ key: 'agent', label: 'Agent' }, { key: 'subagent', label: 'Sous-agent' }]) {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = option.label
        Object.assign(button.style, {
          font: 'inherit', fontSize: '11.5px', padding: '3px 9px', borderRadius: '5px', border: '0', cursor: 'pointer',
          background: option.key === kind ? 'rgba(255,255,255,.16)' : 'transparent',
          color: option.key === kind ? '#f2f2f7' : '#9a9aa2',
        })
        button.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          kind = option.key
          for (const entry of typeButtons) {
            const active = entry.key === option.key
            entry.button.style.background = active ? 'rgba(255,255,255,.16)' : 'transparent'
            entry.button.style.color = active ? '#f2f2f7' : '#9a9aa2'
          }
          // The two types are modelled on different shipped presets, so the
          // tool modules have to be read again.
          compose?.reload()
        })
        typeButtons.push({ key: option.key, button })
        types.appendChild(button)
      }
      typeField.appendChild(types)
      body.appendChild(typeField)

      // Tools and MCP: the composition this Agent gets. The same component is
      // rendered by the consultation view, so what is edited here is exactly
      // what is displayed there.
      compose = renderCompose(body, { kindOf: () => kind })
      compose.onWarning((text) => showToast(text))

      const promptInput = document.createElement('textarea')
      Object.assign(promptInput.style, { ...inputStyle, minHeight: '120px', resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px' })
      promptInput.placeholder = 'Tu es un agent qui…'
      const promptField = field('Prompt')
      promptField.appendChild(promptInput)
      body.appendChild(promptField)

      const actions = document.createElement('div')
      Object.assign(actions.style, { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' })
      actions.appendChild(uiButton('Annuler', UI.btn, () => openAgentManager()))
      const save = uiButton('Créer', UI.btn, () => {
        const name = nameInput.value.trim()
        if (name.length === 0) {
          showToast('Le nom est obligatoire')
          nameInput.focus()
          return
        }
        save.disabled = true
        save.textContent = 'Création\u2026'
        const wantedTools = compose === null ? [] : compose.collectTools()
        const wantedMcp = compose === null ? '' : compose.collectMcp()
        const query = ENDPOINT + '?createAgent=1&client=' + CLIENT_VERSION
          + '&name=' + encodeURIComponent(name)
          + '&kind=' + kind
          + '&description=' + encodeURIComponent(descInput.value.trim())
          + '&prompt=' + encodeURIComponent(promptInput.value)
          + '&tools=' + encodeURIComponent(wantedTools.join(','))
          + '&mcp=' + encodeURIComponent(wantedMcp)
        fetchJson(query)
          .then((result) => {
            if (result?.ok === true) {
              AGENTS_CACHE = null
              // The dot chosen before the Agent existed is applied to the id the
              // Host just declared.
              if (pendingColor.hex !== null && typeof result.id === 'string') {
                void writeAgentColor(result.id, pendingColor.hex).then(() => repaintAgentDots())
              }
              const pinned = Array.isArray(result.pinned) ? result.pinned : []
              const warnings = Array.isArray(result.warnings) ? result.warnings : []
              const tail = warnings.length > 0
                ? ' · ' + warnings[0]
                : (pinned.length > 0 ? ' · MCP : ' + pinned.map((row) => row.server).join(', ') : '')
              showToast('« ' + (result.name ?? result.id) + ' » créé' + tail)
              window.setTimeout(() => { openAgentManager() }, 700)
              return
            }
            save.disabled = false
            save.textContent = 'Créer'
            showToast('Échec : ' + String(result?.error ?? 'inconnu'))
          })
          .catch((error) => {
            save.disabled = false
            save.textContent = 'Créer'
            showToast('Échec : ' + String(error?.message ?? error))
          })
      })
      actions.appendChild(save)
      body.appendChild(actions)

      document.body.appendChild(overlay)
      AGENT_MANAGER = overlay
      nameInput.focus()
      return overlay
    }

    /** Read-only view of one Agent: the eye button. */
    function openAgentConsult(entry) {
      openAgentManager(entry.id, true)
    }

    /** Persist the scope or the type of one Agent. */
    function savePresetMeta(id, patch) {
      const query = ENDPOINT + '?setPresetMeta=1&id=' + encodeURIComponent(id) + '&client=' + CLIENT_VERSION
        + (patch.scope === undefined ? '' : '&scope=' + encodeURIComponent(patch.scope))
        + (patch.kind === undefined ? '' : '&kind=' + encodeURIComponent(patch.kind))
      return fetchJson(query)
        .then((payload) => {
          AGENTS_CACHE = null
          report('agent-meta', id + ' ' + JSON.stringify(patch) + ' ok=' + (payload?.ok === true))
          return payload
        })
        .catch(() => null)
    }

    function closeAgentManager() {
      if (AGENT_MANAGER === null) return
      try { AGENT_MANAGER.remove() } catch { /* detached */ }
      AGENT_MANAGER = null
    }

    /** One Agent row: dot, name, description, cost, tools, actions. */
    function agentRow(entry, onEdit, onConsult) {
      const row = document.createElement('div')
      Object.assign(row.style, UI.row)

      const dot = managerDot(entry.id)
      row.appendChild(dot)

      const text = document.createElement('div')
      Object.assign(text.style, { display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 auto', minWidth: '0' })

      const title = document.createElement('div')
      Object.assign(title.style, { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' })
      const name = document.createElement('span')
      name.style.cssText = 'font-size:13px;font-weight:600;color:#f2f2f7'
      name.textContent = entry.name ?? presetLabel(entry.id, {})
      title.appendChild(name)

      // The cost sits on the name line, right of the name: it is the number the
      // reader compares first, so it belongs beside the label.
      const cost = document.createElement('span')
      Object.assign(cost.style, UI.chip, { color: '#e5e5ea' })
      cost.textContent = compactTokens(entry.totalTokens) + ' tok'
      cost.title = 'System prompt ' + formatTokens(entry.promptTokens) + ' · tools ' + formatTokens(entry.toolTokens)
      title.appendChild(cost)

      // One count on the same line, not a wall of chips underneath: the full
      // list stays in the tooltip and the row keeps a single text line.
      if (entry.tools.length > 0) {
        const toolChip = document.createElement('span')
        Object.assign(toolChip.style, UI.chip, { color: '#8a8a92' })
        toolChip.textContent = entry.tools.length + (entry.tools.length === 1 ? ' outil' : ' outils')
        toolChip.title = entry.tools.join('\n')
        title.appendChild(toolChip)
      }

      // Servers this Agent keeps whatever the profile does.
      if (Array.isArray(entry.pinnedMcp) && entry.pinnedMcp.length > 0) {
        const pinChip = document.createElement('span')
        Object.assign(pinChip.style, UI.chip, { background: 'rgba(52,211,153,.16)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,.32)' })
        pinChip.textContent = 'MCP ' + entry.pinnedMcp.join(', ')
        pinChip.title = 'Serveurs MCP forcés dans cet agent'
        title.appendChild(pinChip)
      }

      if (entry.isDefault) {
        const badge = document.createElement('span')
        Object.assign(badge.style, UI.chip, { background: 'rgba(96,165,250,.18)', color: '#93c5fd', border: '1px solid rgba(96,165,250,.35)' })
        badge.textContent = 'par défaut'
        title.appendChild(badge)
      }
      text.appendChild(title)

      if (typeof entry.description === 'string' && entry.description.length > 0) {
        const desc = document.createElement('div')
        Object.assign(desc.style, UI.desc)
        desc.textContent = entry.description
        text.appendChild(desc)
      }

      row.appendChild(text)

      const actions = document.createElement('div')
      Object.assign(actions.style, { display: 'flex', gap: '2px', flex: '0 0 auto', alignItems: 'center' })
      // Consultation is always available: it only reads a declaration.
      const eye = iconButton(EYE_PATH, 'Consulter la définition de cet agent', () => onConsult(entry))
      actions.appendChild(eye)
      // Editing stays limited to Agents this panel owns; duplicating any Agent
      // is a new declaration, which never rewrites the original.
      if (entry.editable === true) {
        actions.appendChild(iconButton(PENCIL_PATH, 'Modifier cet agent', () => onEdit(entry)))
      }
      actions.appendChild(iconButton(COPY_PATH, 'Dupliquer cet agent', () => { void duplicateAgent(entry.id) }))
      row.appendChild(actions)
      return row
    }

    /**
     * Duplicate one Agent.
     *
     * A preset is a declaration, not a record: it cannot be copied by the Host
     * on its own, so this reports the exact step instead of pretending.
     */
    /** Duplicate one Agent into a new declaration, then reopen the list. */
    function duplicateAgent(id) {
      report('agent-duplicate', id)
      showToast('Duplication de « ' + id + ' »\u2026')
      fetchJson(ENDPOINT + '?duplicateAgent=' + encodeURIComponent(id) + '&client=' + CLIENT_VERSION)
        .then((result) => {
          if (result?.ok === true) {
            AGENTS_CACHE = null
            showToast('« ' + (result.name ?? result.id) + ' » créé (' + result.id + ')')
            window.setTimeout(() => { openAgentManager() }, 600)
            return
          }
          showToast('Échec : ' + String(result?.error ?? 'inconnu'))
        })
        .catch((error) => { showToast('Échec : ' + String(error?.message ?? error)) })
    }

    /** Short-lived message at the bottom of the window. */
    function showToast(text) {
      const notice = document.createElement('div')
      notice.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483001;'
        + 'background:#2c2c31;color:#f2f2f7;border:1px solid rgba(255,255,255,.16);border-radius:10px;'
        + 'padding:9px 14px;font-size:12px;box-shadow:0 10px 30px rgba(0,0,0,.5)'
      notice.textContent = text
      document.body.appendChild(notice)
      window.setTimeout(() => { try { notice.remove() } catch { /* detached */ } }, 3600)
    }

    /** Build the manager panel, or the editor for one Agent. */
    function openAgentManager(editId, readOnly) {
      closeAgentManager()
      const overlay = document.createElement('div')
      Object.assign(overlay.style, UI.panel)
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeAgentManager()
      })
      const card = document.createElement('div')
      Object.assign(card.style, UI.card)
      overlay.appendChild(card)

      const head = document.createElement('div')
      Object.assign(head.style, UI.head)
      const headText = document.createElement('div')
      const title = document.createElement('div')
      title.style.cssText = 'font-size:15px;font-weight:600;color:#f2f2f7'
      title.textContent = editId === undefined
        ? 'Agents'
        : (readOnly === true ? 'Consulter l\u2019agent' : 'Modifier l\u2019agent')
      const sub = document.createElement('div')
      sub.style.cssText = 'font-size:12px;color:#8a8a92;margin-top:3px'
      sub.textContent = editId === undefined
        ? 'Les agents définissent le comportement, les outils et les prompts.'
        : (readOnly === true
          ? 'Définition déclarée par DSH ou par un bundle installé : lecture seule.'
          : 'Nom, description, outils et prompt de l\u2019agent.')
      headText.append(title, sub)
      head.appendChild(headText)
      // One right-hand group: the header already spreads its two children, so a
      // button appended on its own landed in the middle of the bar.
      const headRight = document.createElement('div')
      headRight.style.cssText = 'display:flex;align-items:center;gap:6px;flex:none'
      if (editId === undefined) {
        headRight.appendChild(uiButton('+ Nouveau', UI.btn, () => openAgentCreator()))
      }
      headRight.appendChild(uiButton('\u2715', UI.iconBtn, closeAgentManager))
      head.appendChild(headRight)
      card.appendChild(head)

      const body = document.createElement('div')
      Object.assign(body.style, UI.body)
      card.appendChild(body)

      if (editId !== undefined) {
        void loadAgents().then((payload) => {
          const entry = (payload?.agents ?? []).find((row) => row.id === editId)
          if (entry === undefined) {
            body.textContent = 'Agent introuvable.'
            return
          }
          renderAgentEditor(body, entry, readOnly === true)
        })
      } else {
        body.textContent = 'Chargement\u2026'
        void loadAgents().then((payload) => {
          body.textContent = ''
          if (payload === null || payload.ok !== true) {
            const failed = document.createElement('div')
            failed.style.cssText = 'font-size:12px;color:#f87171'
            failed.textContent = 'Impossible de lire les agents du profil.'
            body.appendChild(failed)
            return
          }
          // Two axes, two levels of heading: the scope is the outer group, the
          // type the inner one, so an Agent is always read "where" then "what".
          const all = payload.agents
          const pick = (scope, kind) => all.filter((row) => row.scope === scope && row.kind === kind)
          const scopeHead = (label, count) => {
            const head = document.createElement('div')
            Object.assign(head.style, UI.scopeHead)
            head.textContent = label + ' (' + count + ')'
            return head
          }
          const kindHead = (label, count) => {
            const head = document.createElement('div')
            Object.assign(head.style, UI.groupHead)
            head.textContent = label + ' (' + count + ')'
            return head
          }
          const renderGroup = (scope, scopeLabel, emptyText) => {
            const agents = pick(scope, 'agent')
            const subs = pick(scope, 'subagent')
            if (agents.length + subs.length === 0 && emptyText === null) return
            body.appendChild(scopeHead(scopeLabel, agents.length + subs.length))
            if (agents.length + subs.length === 0) {
              const empty = document.createElement('div')
              empty.style.cssText = 'font-size:11.5px;color:#6e6e76;padding:4px 2px 2px'
              empty.textContent = emptyText
              body.appendChild(empty)
              return
            }
            if (agents.length > 0) {
              body.appendChild(kindHead('Agents', agents.length))
              for (const entry of agents) body.appendChild(agentRow(entry, (row) => openAgentManager(row.id), openAgentConsult))
            }
            if (subs.length > 0) {
              body.appendChild(kindHead('Sous-agents', subs.length))
              for (const entry of subs) body.appendChild(agentRow(entry, (row) => openAgentManager(row.id), openAgentConsult))
            }
          }

          renderGroup('global', 'Global', 'Aucun agent global.')
          renderGroup('project', 'Projet', 'Aucun agent propre à ce projet.')

          const note = document.createElement('div')
          note.style.cssText = 'font-size:11px;color:#6e6e76;margin-top:10px;line-height:1.5'
          note.textContent = 'La portée (global / projet) et le type (agent / sous-agent) sont gérés par ce panneau : '
            + 'une déclaration DSH ne porte ni l\u2019un ni l\u2019autre. Modifiez-les depuis le crayon.'
          body.appendChild(note)
        })
      }

      document.body.appendChild(overlay)
      AGENT_MANAGER = overlay
      return overlay
    }

    /** The editor form for one Agent. */
    function renderAgentEditor(body, entry, readOnly) {
      body.textContent = ''
      const field = (label) => {
        const wrap = document.createElement('div')
        Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' })
        const caption = document.createElement('div')
        caption.style.cssText = 'font-size:11px;color:#8a8a92;font-weight:500'
        caption.textContent = label
        wrap.appendChild(caption)
        return wrap
      }
      const input = document.createElement('input')
      const readOnlyLook = readOnly === true
        ? { background: 'transparent', borderColor: 'rgba(255,255,255,.08)', color: '#d8d8e0' }
        : {}
      Object.assign(input.style, {
        font: 'inherit', fontSize: '12.5px', color: '#f2f2f7',
        background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)',
        borderRadius: '7px', padding: '7px 9px', outline: 'none', width: '100%', boxSizing: 'border-box',
      })
      input.value = entry.name ?? ''
      input.placeholder = presetLabel(entry.id, {})
      if (readOnly === true) { input.readOnly = true; Object.assign(input.style, readOnlyLook) }

      const nameField = field('Nom')
      nameField.appendChild(input)
      body.appendChild(nameField)

      const descField = field('Description')
      const textarea = document.createElement('textarea')
      Object.assign(textarea.style, {
        font: 'inherit', fontSize: '12.5px', color: '#f2f2f7', minHeight: '56px', resize: 'vertical',
        background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)',
        borderRadius: '7px', padding: '7px 9px', outline: 'none', width: '100%', boxSizing: 'border-box',
      })
      textarea.value = entry.description ?? ''
      if (readOnly === true) { textarea.readOnly = true; Object.assign(textarea.style, readOnlyLook) }
      descField.appendChild(textarea)
      body.appendChild(descField)

      const colorField = field('Couleur')
      colorField.appendChild(colorControl(entry.id, {
        readOnly: readOnly === true,
        current: () => AGENT_COLORS?.get(entry.id) ?? null,
        onPick: (hex) => { void writeAgentColor(entry.id, hex).then(() => repaintAgentDots()) },
      }).element)
      body.appendChild(colorField)

      // Scope and type: stored choices, saved immediately so the list regroups
      // without a second visit to the form. A consulted declaration is shown
      // as it is, so its classification is left out entirely.
      if (readOnly === true) {
        renderReadOnlySummary(body, entry)
      } else {
      const classify = document.createElement('div')
      Object.assign(classify.style, { display: 'flex', gap: '18px', flexWrap: 'wrap', marginBottom: '12px' })
      const chooser = (label, options, value, onPick) => {
        const wrap = document.createElement('div')
        Object.assign(wrap.style, { display: 'flex', alignItems: 'center', gap: '8px' })
        const caption = document.createElement('span')
        caption.style.cssText = 'font-size:11px;color:#8a8a92;font-weight:500'
        caption.textContent = label
        wrap.appendChild(caption)
        const group = document.createElement('div')
        Object.assign(group.style, { display: 'inline-flex', gap: '2px', padding: '2px', borderRadius: '7px', background: 'rgba(255,255,255,.05)' })
        for (const option of options) {
          const active = option.value === value
          const button = document.createElement('button')
          button.type = 'button'
          button.textContent = option.label
          Object.assign(button.style, {
            font: 'inherit',
            fontSize: '11.5px',
            padding: '3px 9px',
            borderRadius: '5px',
            border: '0',
            cursor: 'pointer',
            background: active ? 'rgba(255,255,255,.16)' : 'transparent',
            color: active ? '#f2f2f7' : '#9a9aa2',
          })
          button.addEventListener('click', (event) => {
            event.preventDefault()
            event.stopPropagation()
            if (active) return
            void savePresetMeta(entry.id, option.patch).then(() => openAgentManager(entry.id))
          })
          group.appendChild(button)
        }
        wrap.appendChild(group)
        return wrap
      }
      classify.appendChild(chooser('Portée', [
        { label: 'Global', value: 'global', patch: { scope: 'global' } },
        { label: 'Projet', value: 'project', patch: { scope: 'project' } },
      ], entry.scope ?? 'global', () => {}))
      classify.appendChild(chooser('Type', [
        { label: 'Agent', value: 'agent', patch: { kind: 'agent' } },
        { label: 'Sous-agent', value: 'subagent', patch: { kind: 'subagent' } },
      ], entry.kind ?? 'agent', () => {}))
      body.appendChild(classify)
      }

      // The very component the creation form uses, read-only: every tool module
      // of the catalogue with the ones this Agent mounts checked, and the MCP
      // servers it forces with the tools it keeps. A chip wall was hiding the
      // difference between "declared" and "actually mounted".
      renderCompose(body, { id: entry.id, readOnly: true })

      const promptField = field('Prompt')
      const prompt = document.createElement('textarea')
      Object.assign(prompt.style, {
        font: 'inherit', fontSize: '12px', color: '#f2f2f7', minHeight: '120px', resize: 'vertical',
        background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)',
        borderRadius: '7px', padding: '7px 9px', outline: 'none', width: '100%', boxSizing: 'border-box',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      })
      prompt.placeholder = 'Chargement du prompt\u2026'
      if (readOnly === true) { prompt.readOnly = true; Object.assign(prompt.style, readOnlyLook) }
      promptField.appendChild(prompt)
      body.appendChild(promptField)

      // The declaration is read from the Host so the prompt shown is the one
      // the Agent actually receives, not a placeholder.
      void fetchJson(ENDPOINT + '?view=agentDoc&id=' + encodeURIComponent(entry.id) + '&client=' + CLIENT_VERSION)
        .then((payload) => {
          if (payload?.ok !== true) { prompt.placeholder = 'Prompt indisponible.'; return }
          prompt.value = typeof payload.prompt === 'string' ? payload.prompt : ''
          prompt.placeholder = payload.prompt === null ? 'Aucun prompt déclaré.' : ''
        })
        .catch(() => { prompt.placeholder = 'Prompt indisponible.' })

      const actions = document.createElement('div')
      Object.assign(actions.style, { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' })
      actions.appendChild(uiButton('Retour', UI.btn, () => openAgentManager()))
      body.appendChild(actions)
    }

    /**
     * True only for the Agent-preset menu.
     *
     * Every dropdown in the app is a `[role="menu"]`, so a footer added blindly
     * also landed in the permission picker. The preset menu is the one whose
     * entries are named after presets, so that is the test.
     */
    function isPresetMenu(menu) {
      const items = menu.querySelectorAll('[class*="itemName"]')
      if (items.length < 2) return false
      let hits = 0
      for (const node of items) {
        const own = foldLabel(node.textContent)
        if (own.length === 0) continue
        for (const id of Object.keys(BUILTIN_PRESET_NAMES)) {
          if (BUILTIN_PRESET_NAMES[id].some((label) => foldLabel(label) === own)) {
            hits += 1
            break
          }
        }
      }
      return hits >= 2
    }

    /** The "Manage agents" button pinned under the Agent list. */
    function installAgentManagerButton() {
      if (typeof MutationObserver !== 'function') return false
      let queued = false
      const paint = () => {
        queued = false
        // The New-Session menu: a footer after the preset entries. It is added
        // only to a menu that actually lists presets — every other menu (the
        // permission picker, the model picker) is left untouched.
        for (const menu of deepQueryAll('[role="menu"]')) {
          if (menu.querySelector('[data-mcpc-manage]') !== null) continue
          if (!isPresetMenu(menu)) continue
          const footer = document.createElement('div')
          footer.setAttribute('data-mcpc-manage', 'true')
          Object.assign(footer.style, {
            padding: '6px 8px 2px',
            marginTop: '4px',
            borderTop: '1px solid rgba(255,255,255,.10)',
          })
          const button = uiButton('Gérer les agents', UI.btn, () => openAgentManager())
          button.style.width = '100%'
          footer.appendChild(button)
          menu.appendChild(footer)
        }

        // Settings section: under the last card group.
        const cards = deepQueryAll('[data-agent-preset-id]')
        if (cards.length > 0) {
          const list = cards[0].parentElement?.parentElement ?? null
          if (list !== null && list.querySelector('[data-mcpc-manage]') === null) {
            const footer = document.createElement('div')
            footer.setAttribute('data-mcpc-manage', 'true')
            Object.assign(footer.style, { display: 'flex', justifyContent: 'center', padding: '10px 0 2px' })
            footer.appendChild(uiButton('Gérer les agents', UI.btn, () => openAgentManager()))
            list.appendChild(footer)
          }
        }
      }
      const schedule = () => {
        if (queued) return
        queued = true
        window.requestAnimationFrame(paint)
      }
      const observer = new MutationObserver(schedule)
      observer.observe(document.body, { childList: true, subtree: true })
      const sweep = setInterval(schedule, 400)
      if (typeof sweep?.unref === 'function') sweep.unref()
      report('agent-manager', 'observing')
      return true
    }

    /** Register the chip in the New Session row, right of the mode preset. */
    function installChip(ctx) {
      if (React === undefined || React === null || typeof React.createElement !== 'function') {
        report('chip-slot-error', 'react runtime unavailable')
        return false
      }
      let slots
      try {
        slots = typeof ctx.get === 'function' ? ctx.get('slots') : undefined
        if (slots === undefined || slots === null) slots = ctx.slots
      } catch {
        slots = undefined
      }
      if (slots === undefined || slots === null || typeof slots.register !== 'function' || typeof slots.inject !== 'function') {
        report('chip-slot-error', 'slots service unavailable')
        return false
      }
      try {
        // A negative order keeps the chip first in the row's option group, so
        // it sits as close as possible to the workspace and preset controls.
        const register = () => slots.register({
          name: CHIP_SLOT,
          id: CHIP_ID,
          order: -10,
          label: 'MCP for this conversation',
        }, ConversationMcpChip)
        slots.inject(CHIP_SLOT, register)
        report('chip-slot', CHIP_SLOT)
        return true
      } catch (error) {
        report('chip-slot-error', String(error?.message ?? error))
        return false
      }
    }

    /* ------------------------------------------------------------------ */
    /* 3. Skill/MCP page tabs: tool definitions and prompt sections        */
    /* ------------------------------------------------------------------ */
    /*
     * dsh-skill-mcp-panel renders ONE page in the `main` slot with its own
     * "Skills | MCP" tab strip. It exposes no slot inside that page, so the
     * only additive way to add a tab is to decorate its rendered DOM:
     *
     *   - two buttons cloned from its own tab button (same classes, same look)
     *     are appended to its `[role="tablist"]`, so the strip is untouched;
     *   - one body element is appended to the page root and shown only while
     *     one of our tabs is selected;
     *   - its own content stays mounted and is hidden inline, and its own tab
     *     highlight is only de-emphasized by a stylesheet rule keyed on
     *     `data-mcpc-active`, so React state is never fought over;
     *   - a MutationObserver repairs the few things React can undo (a swapped
     *     content node reappearing, the page being re-rendered).
     *
     * Every entry point is guarded: a panel that changes shape must leave the
     * page usable, with our tabs simply absent.
     */

    const PAGE_STYLE_ID = 'dsh-mcp-companion-page-styles'
    const PAGE_TABS = [
      { id: 'tools', label: 'Tools', heading: 'Tool definitions' },
      { id: 'prompts', label: 'System prompt', heading: 'System prompt sections' },
    ]

    const PAGE_CSS = [
      // The panel's own tab stays React-active while ours is selected; only its
      // highlight is muted (the underline is drawn by the plugin's ::after).
      '[data-mcpc-active="1"]>[role="tablist"]>button:not([data-mcpc-tab]){color:var(--dsw-alias-label-secondary);',
      'font-weight:400}',
      '[data-mcpc-active="1"]>[role="tablist"]>button:not([data-mcpc-tab])::after{transform:scaleX(0)!important}',
      '.dsh-mcpc-body{display:none;flex-direction:column;gap:12px;width:100%;box-sizing:border-box;',
      'flex:1;min-height:0;overflow-y:auto;padding:0 clamp(20px,3vw,40px) 40px;max-width:1040px;margin:0 auto}',
      // The body is a flex column: without this its children shrink to the
      // capped height and the rows get clipped instead of scrolling.
      '.dsh-mcpc-body>*{flex:0 0 auto}',
      '.dsh-mcpc-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap}',
      '.dsh-mcpc-title{font-size:15px;font-weight:600;line-height:22px;color:var(--dsw-alias-label-primary)}',
      '.dsh-mcpc-caption{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);margin:2px 0 0}',
      '.dsh-mcpc-total{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);',
      'font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}',
      '.dsh-mcpc-group{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;',
      'background:var(--dsw-alias-bg-layer-3);overflow:hidden}',
      '.dsh-mcpc-tokchip{font-size:10.5px;line-height:15px;padding:1px 6px;border-radius:5px;flex:none;white-space:nowrap;',
      '  background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2)}',
      '.MCP_toolRow .dsh-mcpc-tokchip{margin-left:auto}',
      '.SKV_catalogHeading .dsh-mcpc-tokchip{margin-left:8px}',
      '.SKV_toolButtons .dsh-mcpc-tokchip{margin-left:8px;align-self:center}',
      '.SKV_rowControls .dsh-mcpc-tokchip{margin-left:2px}',
      '.dsh-mcpc-groupright{display:inline-flex;align-items:center;gap:8px;flex:none}',
      '.dsh-mcpc-grouphead{display:flex;align-items:center;justify-content:space-between;gap:8px;',
      'padding:8px 12px;background:var(--dsw-alias-bg-layer-1);border-bottom:1px solid var(--dsw-alias-border-l2)}',
      '.dsh-mcpc-groupname{font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary);',
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-mcpc-groupmeta{font-size:11.5px;color:var(--dsw-alias-label-tertiary);',
      'font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}',
      '.dsh-mcpc-row{display:flex;align-items:center;gap:10px;padding:8px 12px;',
      'border-bottom:1px solid var(--dsw-alias-border-l2);flex-wrap:wrap}',
      '.dsh-mcpc-row:last-child{border-bottom:none}',
      '.dsh-mcpc-row[data-off="true"] .dsh-mcpc-rowname{color:var(--dsw-alias-label-tertiary)}',
      '.dsh-mcpc-rowtext{flex:1 1 0%;min-width:0;display:flex;flex-direction:column;gap:1px;cursor:pointer;',
      'background:0 0;border:0;padding:0;text-align:left;font:inherit;color:inherit}',
      '.dsh-mcpc-rowtext[data-static="true"]{cursor:default}',
      '.dsh-mcpc-rowname{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);',
      'white-space:normal;overflow-wrap:anywhere}',
      '.dsh-mcpc-rowsub{font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-tertiary);',
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-mcpc-tok{font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-tertiary);',
      'font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}',
      '.dsh-mcpc-switch{width:36px;height:20px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);',
      'background:var(--dsw-alias-bg-layer-1);position:relative;cursor:pointer;flex:none;padding:0;',
      'transition:background-color .18s ease,border-color .18s ease}',
      '.dsh-mcpc-switch[data-on="true"]{background:var(--dsw-alias-label-primary);border-color:transparent}',
      '.dsh-mcpc-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;',
      'background:var(--dsw-alias-label-secondary);transition:transform .18s ease,background-color .18s ease;display:block}',
      '.dsh-mcpc-switch[data-on="true"]>.dsh-mcpc-knob{transform:translateX(16px);background:var(--dsw-alias-bg-base,#000)}',
      '.dsh-mcpc-switch:disabled{opacity:.4;cursor:default}',
      '.dsh-mcpc-pre{margin:0;padding:10px 12px;border-top:1px solid var(--dsw-alias-border-l2);',
      'background:var(--dsw-alias-markdown-code-block,var(--dsw-alias-bg-layer-1));',
      'color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Consolas,Menlo,monospace;',
      'font-size:11.5px;line-height:17px;white-space:pre-wrap;word-break:break-word;max-height:420px;overflow:auto}',
      '.dsh-mcpc-note{font-size:12.5px;line-height:20px;color:var(--dsw-alias-label-tertiary);padding:6px 2px}',
      '.dsh-mcpc-note[data-error="true"]{color:var(--dsw-alias-state-error-primary)}',
      '.dsh-mcpc-tag{font-size:10.5px;line-height:15px;padding:1px 6px;border-radius:5px;',
      'background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-tertiary);flex:none;white-space:nowrap}',
      // Agent-preset tags: the same shape as the order tag, outlined so a row
      // that only some presets provide is readable at a glance.
      '.dsh-mcpc-presets{display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;',
      'flex:none;min-width:0;max-width:100%}',
      // A long preset list moves to its own line instead of squeezing the name
      // out of the row, which is what made the name unreadable.
      '.dsh-mcpc-presets-block{display:flex;flex:1 0 100%;justify-content:flex-start;margin-top:2px}',
      // No max-width and no ellipsis: a preset name is short and cutting it made
      // the tag unreadable, which defeated its purpose.
      '.dsh-mcpc-presetchip{font-size:10.5px;line-height:15px;padding:1px 7px;border-radius:999px;flex:none;',
      'white-space:nowrap;',
      'background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);',
      'border:1px solid var(--dsw-alias-border-l2)}',
      '.dsh-mcpc-presetchip[data-in-all="true"]{border-style:dashed;color:var(--dsw-alias-label-tertiary)}',
      '.dsh-mcpc-presetchip[data-clickable="true"],.dsh-mcpc-presettotal[data-clickable="true"]{font:inherit;cursor:pointer}',
      '.dsh-mcpc-presetchip[data-clickable="true"]:hover,.dsh-mcpc-presettotal[data-clickable="true"]:hover{',
      'background:var(--dsw-alias-bg-layer-3);border-color:var(--dsw-alias-label-secondary)}',
      '.dsh-mcpc-presetchip[data-active="true"],.dsh-mcpc-presettotal[data-active="true"]{',
      'border-color:var(--dsw-alias-label-primary);color:var(--dsw-alias-label-primary)}',
      '.dsh-mcpc-filterbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:6px 10px;border-radius:8px;',
      'background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);font-size:12px}',
      '.dsh-mcpc-filtertext{color:var(--dsw-alias-label-primary);font-weight:600}',
      '.dsh-mcpc-filterclear{font:inherit;font-size:11.5px;color:var(--dsw-alias-label-secondary);background:0 0;',
      'border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:1px 10px;cursor:pointer}',
      '.dsh-mcpc-filterclear:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-secondary)}',
      '.dsh-mcpc-seatstats{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px}',
      '.dsh-mcpc-seatstat{font-size:10.5px;line-height:15px;padding:0 7px;border-radius:999px;white-space:nowrap;',
      'font-variant-numeric:tabular-nums;background:rgba(255,255,255,.06);',
      'color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2)}',
      '.dsh-mcpc-seatstat b{font-weight:600;color:var(--dsw-alias-label-primary)}',
      // Per-Agent colour dot, injected as the first child of the preset card
      // so it sits before the name. `inline-block` keeps it on the text line.
      '.dsh-mcpc-agentdot{display:inline-block;width:8px;height:8px;border-radius:50%;flex:none;',
      'margin-right:6px;vertical-align:middle;cursor:pointer;box-shadow:0 0 0 1px rgba(0,0,0,.25) inset}',
      '.dsh-mcpc-agentdot:hover{transform:scale(1.25)}',
      // No colour chosen yet: a hollow ring instead of an invisible dot, so
      // the control is discoverable rather than missing.
      '.dsh-mcpc-agentdot-none{background:transparent!important;',
      'border:1.5px dashed var(--dsw-alias-label-tertiary);width:7px;height:7px}',
      '.dsh-mcpc-colorpop{position:absolute;z-index:10000;display:flex;flex-direction:column;gap:8px;',
      'padding:10px;border-radius:10px;background:var(--dsw-alias-bg-layer-3,#1c1c1e);',
      'border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12));',
      'box-shadow:0 8px 24px rgba(0,0,0,.35)}',
      '.dsh-mcpc-colorswatches{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}',
      '.dsh-mcpc-colorswatch{width:18px;height:18px;border-radius:50%;border:1px solid rgba(0,0,0,.3);',
      'cursor:pointer;padding:0}',
      '.dsh-mcpc-colorswatch:hover{outline:2px solid var(--dsw-alias-label-primary);outline-offset:1px}',
      '.dsh-mcpc-colorswatch[aria-pressed="true"]{outline:2px solid var(--dsw-alias-label-primary);outline-offset:1px}',
      '.dsh-mcpc-colornone{font:inherit;font-size:11.5px;color:var(--dsw-alias-label-secondary);',
      'background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:3px 8px;cursor:pointer}',
      '.dsh-mcpc-colornone:hover{color:var(--dsw-alias-label-primary)}',
      '.dsh-mcpc-mcptok{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);',
      'font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.dsh-mcpc-row[data-off="true"] .dsh-mcpc-presetchip{opacity:.55}',
      '.dsh-mcpc-presettotals{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '.dsh-mcpc-presettotalslabel{font-size:11.5px;color:var(--dsw-alias-label-tertiary);flex:none}',
      '.dsh-mcpc-presettotal{display:inline-flex;align-items:center;gap:6px;font-size:11px;line-height:16px;',
      'padding:1px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);',
      'border:1px solid var(--dsw-alias-border-l2);white-space:nowrap}',
      '.dsh-mcpc-presettotalname{color:var(--dsw-alias-label-secondary);max-width:160px;overflow:hidden;',
      'text-overflow:ellipsis}',
      '.dsh-mcpc-presettotalvalue{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}',
      '.dsh-mcpc-subagent-box{display:flex;flex-direction:column;gap:12px;padding:14px 16px;margin:12px 0;',
      'border-radius:10px;border:1px solid var(--dsw-alias-border-l4,rgba(255,255,255,.12));',
      'background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.03));box-sizing:border-box}',
      '.dsh-mcpc-subagent-header{display:flex;align-items:center;justify-content:space-between;gap:10px;',
      'padding-bottom:8px;border-bottom:1px solid var(--dsw-alias-border-l3,rgba(255,255,255,.08))}',
      '.dsh-mcpc-subagent-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#fff);',
      'display:flex;align-items:center;gap:6px}',
      '.dsh-mcpc-subagent-badge{font-size:10.5px;line-height:1;padding:3px 7px;border-radius:999px;',
      'background:var(--dsw-alias-brand-secondary,rgba(0,150,255,.15));color:var(--dsw-alias-brand-primary,#4ea1ff);font-weight:500}',
      '.dsh-mcpc-subagent-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}',
      '.dsh-mcpc-subagent-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}',
      '.dsh-mcpc-subagent-name{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary,#f2f2f2);line-height:1.4}',
      '.dsh-mcpc-subagent-desc{font-size:12px;color:var(--dsw-alias-label-tertiary,#8a8a8e);line-height:1.4}',
      '.dsh-mcpc-subagent-select-wrap{display:flex;align-items:center;gap:10px;padding:8px 10px;',
      'border-radius:6px;background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.25));',
      'border:1px solid var(--dsw-alias-border-l3,rgba(255,255,255,.08));margin-top:4px}',
      '.dsh-mcpc-subagent-select-label{font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary,#b0b0b5);white-space:nowrap}',
      '.dsh-mcpc-subagent-select{flex:1;min-width:0;background:var(--dsw-alias-bg-layer-2,#2c2c2e);',
      'color:var(--dsw-alias-label-primary,#fff);border:1px solid var(--dsw-alias-border-l2,#3a3a3e);',
      'border-radius:6px;padding:5px 8px;font-size:12px;font-family:inherit;outline:none;cursor:pointer}',
      '.dsh-mcpc-subagent-saved{font-size:11px;color:#34c759;font-weight:500;opacity:0;transition:opacity .2s ease}',
      '.dsh-mcpc-subagent-saved[data-visible="true"]{opacity:1}',
    ].join('')

    /** The decorated page, or null while the panel is closed. */
    let PAGE = null

    function ensurePageStyles() {
      try {
        const existing = document.getElementById(PAGE_STYLE_ID)
        if (existing !== null) {
          if (existing.textContent !== PAGE_CSS) existing.textContent = PAGE_CSS
          return
        }
        const style = document.createElement('style')
        style.id = PAGE_STYLE_ID
        style.textContent = PAGE_CSS
        document.head.appendChild(style)
      } catch {
        // Unstyled tabs are still usable.
      }
    }

    function childBy(element, match) {
      if (element === null || element === undefined) return null
      const kids = element.children
      if (kids === null || kids === undefined) return null
      for (let index = 0; index < kids.length; index += 1) {
        const kid = kids[index]
        try {
          if (match(kid) === true) return kid
        } catch {
          // A single odd node must not stop the search.
        }
      }
      return null
    }

    function tagIs(element, name) {
      return String(element?.tagName ?? '').toUpperCase() === name
    }

    /** The panel page: a `[data-tab]` root whose second child is a tab strip. */
    function findPageRoot() {
      try {
        if (typeof document.querySelectorAll !== 'function') return null
        const nodes = document.querySelectorAll('[data-tab]')
        for (let index = 0; index < nodes.length; index += 1) {
          const node = nodes[index]
          const strip = childBy(node, (kid) => kid?.getAttribute?.('role') === 'tablist')
          if (strip === null) continue
          const tab = String(node.getAttribute?.('data-tab') ?? '')
          if (tab !== 'skills' && tab !== 'mcp') continue
          let buttons = 0
          for (let next = 0; next < strip.children.length; next += 1) {
            if (tagIs(strip.children[next], 'BUTTON')) buttons += 1
          }
          if (buttons >= 2) return node
        }
      } catch {
        // A page without the panel simply has no root.
      }
      return null
    }

    function noteElement(text, isError) {
      const element = document.createElement('div')
      element.className = 'dsh-mcpc-note'
      if (isError === true) element.setAttribute('data-error', 'true')
      element.textContent = text
      return element
    }

    function switchElement(on, title, onFlip) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'dsh-mcpc-switch'
      button.setAttribute('role', 'switch')
      button.setAttribute('aria-checked', on ? 'true' : 'false')
      button.setAttribute('data-on', on ? 'true' : 'false')
      button.setAttribute('title', title)
      const knob = document.createElement('span')
      knob.className = 'dsh-mcpc-knob'
      button.appendChild(knob)
      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        onFlip(on !== true)
      })
      return button
    }

    /**
     * Per-preset weight chips: the payload's total is the union of every preset,
     * so this names what one conversation of each preset really sends.
     */
    function presetTotalsElement(summary, state) {
      const totals = Array.isArray(summary?.presetTotals) ? summary.presetTotals : []
      if (totals.length < 2) return undefined
      const line = document.createElement('div')
      line.className = 'dsh-mcpc-presettotals'
      const lede = document.createElement('span')
      lede.className = 'dsh-mcpc-presettotalslabel'
      lede.textContent = 'Per preset'
      line.appendChild(lede)
      const sorted = totals.slice().sort((a, b) => (b.tokens || 0) - (a.tokens || 0))
      for (const entry of sorted) {
        const chip = document.createElement('button')
        chip.type = 'button'
        chip.className = 'dsh-mcpc-presettotal'
        chip.setAttribute('data-clickable', 'true')
        if (state?.presetFilter === entry?.id) chip.setAttribute('data-active', 'true')
        const name = document.createElement('span')
        name.className = 'dsh-mcpc-presettotalname'
        name.textContent = presetLabel(entry?.id, state?.presetNames)
        const value = document.createElement('span')
        value.className = 'dsh-mcpc-presettotalvalue'
        value.textContent = formatTokens(entry?.tokens)
        chip.appendChild(name)
        chip.appendChild(value)
        // The live-agent count stays in the tooltip only: a bare "x4" beside a
        // token figure read as a multiplier rather than an agent count.
        const agents = typeof entry?.agents === 'number' ? entry.agents : 0
        chip.title = presetLabel(entry?.id, state?.presetNames) + ' assembles ' + formatTokens(entry?.tokens)
          + ' across ' + String(entry?.rows ?? 0) + ' rows, '
          + (agents === 0 ? 'and no live agent runs it' : (agents === 1 ? 'with 1 live agent' : 'with ' + String(agents) + ' live agents'))
        const totalId = entry?.id
        chip.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          setPresetFilter(state, state.tab, totalId)
        })
        line.appendChild(chip)
      }
      return line
    }

    /**
     * Built-in preset ids and the name each one is shown under.
     *
     * A shipped preset publishes no `name`, and the host has no locale; the
     * client does, so the label belongs here. Without this the tag showed the
     * raw id — "cordis" is the same preset the UI calls Creator mode.
     */
    const BUILTIN_PRESET_NAMES = {
      // Both locales are listed, because the shipped menu prints whichever the
      // profile uses. Several forms exist for one preset: the harness has
      // shipped both "Mode Créateur" and the feminised "Mode Creatrice", and a
      // table missing one of them silently leaves that card without a dot.
      standard: ['Standard mode', 'Mode Standard', 'Mode standard'],
      ptc: ['PTC mode', 'Mode PTC', 'Mode ptc'],
      minimal: ['Minimal mode', 'Mode Minimal', 'Mode minimal'],
      cordis: ['Creator mode', 'Mode Créateur', 'Mode Creatrice', 'Mode Createur', 'Mode créateur', 'Mode creatrice'],
    }

    /** 0 for English, 1 for French; the plugin ships both locales. */
    function presetLanguage() {
      try {
        const raw = String(navigator?.language ?? document?.documentElement?.lang ?? 'en').toLowerCase()
        return raw.startsWith('fr') ? 1 : 0
      } catch {
        return 0
      }
    }

    /** Display name for one preset id: published name, built-in text, then id. */
    function presetLabel(id, names) {
      const key = String(id ?? '')
      const published = names !== null && names !== undefined ? names[key] : undefined
      if (typeof published === 'string' && published.length > 0) return published
      const builtin = BUILTIN_PRESET_NAMES[key]
      if (builtin !== undefined) return builtin[presetLanguage()]
      return key
    }

    /**
     * Tag the Agent presets a row comes from.
     *
     * Only a row the presets disagree on needs the tag: a section, context or
     * tool that every preset assembles is simply part of the prompt, and a
     * global registration belongs to none of them. The host decides that and
     * sends `conditional`, so this stays a rendering decision.
     */
    function presetChipsElement(row, state) {
      // One tag instead of a wall of preset names when the row is everywhere.
      if (row?.inAll === true) {
        const all = document.createElement('span')
        all.className = 'dsh-mcpc-presets'
        const chip = document.createElement('span')
        chip.className = 'dsh-mcpc-presetchip'
        chip.setAttribute('data-in-all', 'true')
        chip.textContent = 'In All Agent'
        chip.title = 'Every Agent preset assembles this row'
        all.appendChild(chip)
        return { node: all, block: true }
      }
      if (row?.conditional !== true) return
      const presets = Array.isArray(row?.presets) ? row.presets : []
      if (presets.length === 0) return
      const names = state?.presetNames
      const labels = presets.map((preset) => presetLabel(preset, names))
      // Tags always own the line below the row, so the name, the weight and the
      // switch keep a stable place whatever the preset list looks like.
      const block = true
      const held = document.createElement('span')
      held.className = block ? 'dsh-mcpc-presets dsh-mcpc-presets-block' : 'dsh-mcpc-presets'
      held.title = (labels.length === 1 ? 'Only this Agent preset provides it: ' : 'Provided by these Agent presets: ')
        + labels.join(', ')
      for (let index = 0; index < labels.length; index += 1) {
        const chip = document.createElement('button')
        chip.type = 'button'
        chip.className = 'dsh-mcpc-presetchip'
        chip.textContent = labels[index]
        chip.title = 'Show only what ' + labels[index] + ' assembles, and switch it off for that preset only'
        chip.setAttribute('data-clickable', 'true')
        const id = presets[index]
        if (state?.presetFilter === id) chip.setAttribute('data-active', 'true')
        chip.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          setPresetFilter(state, state.tab, id)
        })
        held.appendChild(chip)
      }
      return { node: held, block }
    }

    /** One tool row: name, description, weight, switch. */
    /** One tool row: name, description, weight, switch, expandable definition. */
    function toolRow(row, state) {
      const wrap = document.createElement('div')
      const element = document.createElement('div')
      element.className = 'dsh-mcpc-row'
      element.setAttribute('data-off', row.enabled === true ? 'false' : 'true')

      const text = document.createElement('button')
      text.type = 'button'
      text.className = 'dsh-mcpc-rowtext'
      const name = document.createElement('div')
      name.className = 'dsh-mcpc-rowname'
      name.textContent = row.name
      const sub = document.createElement('div')
      sub.className = 'dsh-mcpc-rowsub'
      const bits = []
      if (typeof row.description === 'string' && row.description.length > 0) bits.push(row.description)
      if (row.locked === true) bits.push('cannot be restricted')
      if (row.serverDisabled === true) bits.push('server off')
      sub.textContent = bits.join(' \u00b7 ')
      text.appendChild(name)
      if (sub.textContent !== '') text.appendChild(sub)

      const definition = typeof row.definition === 'string' ? row.definition : ''
      const pre = document.createElement('pre')
      pre.className = 'dsh-mcpc-pre'
      pre.textContent = definition
      pre.style.display = 'none'
      const canExpand = definition.length > 0
      if (canExpand) {
        text.title = 'Open the full definition sent to the model'
        text.setAttribute('aria-expanded', 'false')
        text.addEventListener('click', () => {
          const open = pre.style.display !== 'none'
          pre.style.display = open ? 'none' : 'block'
          text.setAttribute('aria-expanded', open ? 'false' : 'true')
        })
      } else {
        text.setAttribute('data-static', 'true')
      }

      const tokens = formatTokens(row.tokens)
      const tok = document.createElement('span')
      tok.className = 'dsh-mcpc-tok'
      tok.textContent = tokens
      tok.title = 'Weight of this schema in the context'

      const chips = presetChipsElement(row, state)
      element.appendChild(text)
      if (chips !== undefined && chips.block !== true) element.appendChild(chips.node)
      if (tokens !== '') element.appendChild(tok)
      const locked = row.locked === true || row.serverDisabled === true
      element.appendChild(switchElement(
        row.enabled === true,
        locked ? 'Locked' : 'Turn this tool on or off',
        (wanted) => { if (locked) return; state.flip('tools', 'toggleTool', row.name, wanted) },
      ))
      if (locked) element.lastChild.disabled = true
      if (chips !== undefined && chips.block === true) element.appendChild(chips.node)
      wrap.appendChild(element)
      if (canExpand) wrap.appendChild(pre)
      return wrap
    }

    /** One prompt-section row: name, weight, preset tags, switch, expandable text. */
    function promptRow(row, state) {
      const wrap = document.createElement('div')
      const element = document.createElement('div')
      element.className = 'dsh-mcpc-row'
      element.setAttribute('data-off', row.enabled === true ? 'false' : 'true')

      const text = document.createElement('button')
      text.type = 'button'
      text.className = 'dsh-mcpc-rowtext'
      const name = document.createElement('div')
      name.className = 'dsh-mcpc-rowname'
      name.textContent = row.name
      const sub = document.createElement('div')
      sub.className = 'dsh-mcpc-rowsub'
      const description = typeof row.description === 'string' ? row.description.trim() : ''
      if (description !== '') sub.textContent = description
      text.appendChild(name)
      if (description !== '') text.appendChild(sub)

      const details = []
      details.push(row.empty === true ? 'empty' : String(row.chars) + ' chars')
      if (row.dynamic === true) details.push('dynamic')
      const isContext = row.kind === 'context'
      if (isContext) details.push('runtime context')
      element.title = row.name + ' \u00b7 ' + details.join(' \u00b7 ')

      const pre = document.createElement('pre')
      pre.className = 'dsh-mcpc-pre'
      const body = typeof row.text === 'string' ? row.text : ''
      pre.textContent = body
      pre.style.display = 'none'
      const canExpand = body.length > 0
      if (!canExpand) text.setAttribute('data-static', 'true')
      text.addEventListener('click', () => {
        if (!canExpand) return
        const open = pre.style.display !== 'none'
        pre.style.display = open ? 'none' : 'block'
        text.setAttribute('aria-expanded', open ? 'false' : 'true')
      })

      const tokens = formatTokens(row.tokens)
      const tok = document.createElement('span')
      tok.className = 'dsh-mcpc-tok'
      tok.textContent = tokens
      tok.title = isContext
        ? 'Weight of this runtime context in each request'
        : 'Weight of this section in the system prompt'

      // A runtime context has no registered placement, and the switch cannot
      // shadow it, so the row still says what it is. Sections carry no order
      // tag: the list itself is in assembly order.
      element.appendChild(text)
      if (isContext) {
        const kindTag = document.createElement('span')
        kindTag.className = 'dsh-mcpc-tag'
        kindTag.textContent = 'runtime context'
        kindTag.title = 'Dynamic context attached to each request, not part of the prompt text'
        element.appendChild(kindTag)
      }
      const chips = presetChipsElement(row, state)
      if (chips !== undefined && chips.block !== true) element.appendChild(chips.node)
      if (tokens !== '') element.appendChild(tok)
      const locked = row.locked === true
      const control = switchElement(
        row.enabled === true,
        locked ? 'Runtime context follows the request; no profile switch' : 'Turn this section on or off',
        (wanted) => { if (!locked) state.flip('prompts', 'togglePrompt', row.name, wanted) },
      )
      if (locked) control.disabled = true
      element.appendChild(control)
      if (chips !== undefined && chips.block === true) element.appendChild(chips.node)
      wrap.appendChild(element)
      if (canExpand) wrap.appendChild(pre)
      return wrap
    }

    /**
     * Rows the active preset filter keeps, carrying that preset's own switch
     * state. Without a filter every row keeps the profile-wide state the host
     * already resolved.
     */
    function visibleRows(rows, state) {
      const filter = state?.presetFilter ?? null
      if (filter === null) return rows
      const kept = []
      for (const row of rows) {
        const belongs = row?.inAll === true
          || (Array.isArray(row?.presets) && row.presets.includes(filter))
        if (!belongs) continue
        const off = Array.isArray(row?.presetsOff) && row.presetsOff.includes(filter)
        kept.push({ ...row, enabled: !off })
      }
      return kept
    }

    /** Group already-sorted rows sequentially, for a filtered view. */
    function groupsFromRows(rows) {
      const groups = []
      for (const row of rows) {
        const last = groups[groups.length - 1]
        if (last === undefined || last.name !== row.group) {
          groups.push({ name: row.group, rows: [], tokens: 0 })
        }
        const target = groups[groups.length - 1]
        target.rows.push(row)
        if (row.enabled !== false) target.tokens += row.tokens
      }
      return groups
    }

    /** Turn the preset filter on or off and repaint the page in place. */
    function setPresetFilter(state, kind, presetId) {
      if (state === null) return
      state.presetFilter = state.presetFilter === presetId ? null : presetId
      if (state.tab === kind) paintPage(state, kind)
    }

    /** Bar naming the active filter, with the way back to every preset. */
    function filterBar(state, kind) {
      const filter = state?.presetFilter ?? null
      if (filter === null) return undefined
      const bar = document.createElement('div')
      bar.className = 'dsh-mcpc-filterbar'
      const text = document.createElement('span')
      text.className = 'dsh-mcpc-filtertext'
      text.textContent = 'Only ' + presetLabel(filter, state.presetNames)
      bar.appendChild(text)
      const clear = document.createElement('button')
      clear.type = 'button'
      clear.className = 'dsh-mcpc-filterclear'
      clear.textContent = 'Show every preset'
      clear.title = 'Clear the preset filter'
      clear.addEventListener('click', (event) => {
        event.preventDefault()
        setPresetFilter(state, kind, filter)
      })
      bar.appendChild(clear)
      return bar
    }

    function headElement(heading, caption, total) {
      const head = document.createElement('div')
      head.className = 'dsh-mcpc-head'
      const left = document.createElement('div')
      const title = document.createElement('div')
      title.className = 'dsh-mcpc-title'
      title.textContent = heading
      const note = document.createElement('p')
      note.className = 'dsh-mcpc-caption'
      note.textContent = caption
      left.appendChild(title)
      left.appendChild(note)
      head.appendChild(left)
      if (typeof total === 'string' && total.length > 0) {
        const right = document.createElement('div')
        right.className = 'dsh-mcpc-total'
        right.textContent = total
        head.appendChild(right)
      }
      return head
    }

    /**
     * One bordered group: a headline with its counters (and, for a group of
     * more than one row, a switch for the whole group), then its rows.
     */
    function groupElement(name, bits, nodes, toggle) {
      const section = document.createElement('div')
      section.className = 'dsh-mcpc-group'
      const head = document.createElement('div')
      head.className = 'dsh-mcpc-grouphead'
      const label = document.createElement('span')
      label.className = 'dsh-mcpc-groupname'
      label.textContent = String(name ?? '')
      const right = document.createElement('span')
      right.className = 'dsh-mcpc-groupright'
      const meta = document.createElement('span')
      meta.className = 'dsh-mcpc-groupmeta'
      meta.textContent = bits.filter((bit) => typeof bit === 'string' && bit.length > 0).join(' \u00b7 ')
      right.appendChild(meta)
      if (toggle !== undefined && toggle !== null) {
        right.appendChild(switchElement(toggle.on, toggle.title, toggle.flip))
      }
      head.appendChild(label)
      head.appendChild(right)
      section.appendChild(head)
      for (const node of nodes) section.appendChild(node)
      return section
    }

    /** Switch for a whole group: on only when every row of the group is on. */
    function groupToggle(rows, title, flip) {
      if (rows.length < 2) return undefined
      const allOn = rows.every((row) => row.enabled !== false)
      return { on: allOn, title, flip }
    }

    /** Group counters as shown in a group headline. */
    function groupBits(group) {
      const count = typeof group.count === 'number' ? group.count : 0
      const on = typeof group.on === 'number' ? group.on : count
      return [String(on) + '/' + String(count), formatTokens(group.tokens)]
    }

    function paintTools(state, payload) {
      const body = state.body
      while (body.firstChild !== null) body.removeChild(body.firstChild)
      if (payload === null || payload === undefined) {
        body.appendChild(headElement(
          PAGE_TABS[0].heading,
          'Each switch removes the tool from the model in every conversation.',
          '',
        ))
        body.appendChild(noteElement('Loading\u2026', false))
        return
      }
      const summary = payload?.summary ?? {}
      const parts = []
      if (typeof summary.on === 'number') parts.push(summary.on + ' active')
      if (typeof summary.off === 'number' && summary.off > 0) parts.push(summary.off + ' off')
      const total = formatTokens(summary.tokens)
      if (total !== '') parts.push(total)
      const presetCount = typeof summary.presets === 'number' ? summary.presets : 0
      body.appendChild(headElement(
        PAGE_TABS[0].heading,
        'Every tool the model can receive, gathered from all '
          + (presetCount > 1 ? String(presetCount) + ' Agent presets' : 'Agent presets')
          + '. Each switch removes the tool from the model in every conversation; '
          + 'a row tagged with a preset name exists only there. Groups are the plugins that register them.',
        parts.join(' \u00b7 '),
      ))
      state.presetNames = payload?.presetNames ?? {}
      const toolPresetLine = presetTotalsElement(summary, state)
      if (toolPresetLine !== undefined) body.appendChild(toolPresetLine)

      const allRows = Array.isArray(payload?.tools) ? payload.tools : []
      const rows = visibleRows(allRows, state)
      const bar = filterBar(state, 'tools')
      if (bar !== undefined) body.appendChild(bar)
      if (rows.length === 0) {
        body.appendChild(noteElement(payload?.error !== undefined
          ? 'Erreur : ' + String(payload.error)
          : (state.presetFilter === null
            ? 'No harness tool is registered.'
            : 'This Agent preset assembles no harness tool.'), payload?.ok === false))
        return
      }
      // A filtered view regroups what survived; the unfiltered one uses the
      // host's counters so the group weights stay authoritative.
      const groups = state.presetFilter === null
        ? (Array.isArray(payload?.groups) ? payload.groups : [])
        : groupsFromRows(rows).map((group) => ({ name: group.name, count: group.rows.length, on: group.rows.filter((row) => row.enabled !== false).length, tokens: group.tokens }))
      if (groups.length === 0) {
        for (const row of rows) body.appendChild(toolRow(row, state))
        return
      }
      for (const group of groups) {
        const members = rows.filter((row) => row?.group === group.name)
        if (members.length === 0) continue
        const names = members.map((row) => row.name)
        const groupFilter = state.presetFilter
        const toggle = groupToggle(members, 'Turn every tool in this group on or off', (wanted) => {
          flipMany(state, 'tools', 'toggleTools', names, wanted, groupFilter)
        })
        body.appendChild(groupElement(group.name, groupBits(group), members.map((row) => toolRow(row, state)), toggle))
      }
    }

    function paintPrompts(state, payload) {
      const body = state.body
      while (body.firstChild !== null) body.removeChild(body.firstChild)
      if (payload === null || payload === undefined) {
        body.appendChild(headElement(
          PAGE_TABS[1].heading,
          'Each switch removes the section from the system prompt in every conversation.',
          '',
        ))
        body.appendChild(noteElement('Loading\u2026', false))
        return
      }
      const summary = payload?.summary ?? {}
      const parts = []
      if (typeof summary.sections === 'number') {
        parts.push(summary.sections + (summary.sections === 1 ? ' section' : ' sections'))
      }
      if (typeof summary.contexts === 'number' && summary.contexts > 0) {
        parts.push(summary.contexts + ' runtime context' + (summary.contexts === 1 ? '' : 's'))
      }
      if (typeof summary.off === 'number' && summary.off > 0) parts.push(summary.off + ' off')
      const total = formatTokens(summary.tokens)
      if (total !== '') parts.push(total)
      const presetCount = typeof summary.presets === 'number' ? summary.presets : 0
      body.appendChild(headElement(
        PAGE_TABS[1].heading,
        presetCount > 1
          ? 'Every section and runtime context the model receives, assembled for all '
            + String(presetCount) + ' Agent presets. A row tagged with a preset name exists only there.'
          : 'Every section and runtime context the model receives. Groups are the plugins that register them.',
        parts.join(' \u00b7 '),
      ))
      state.presetNames = payload?.presetNames ?? {}
      const promptPresetLine = presetTotalsElement(summary, state)
      if (promptPresetLine !== undefined) body.appendChild(promptPresetLine)

      const allRows = Array.isArray(payload?.prompts) ? payload.prompts : []
      const rows = visibleRows(allRows, state)
      const bar = filterBar(state, 'prompts')
      if (bar !== undefined) body.appendChild(bar)
      if (rows.length === 0) {
        const message = payload?.ok === false
          ? 'Erreur : ' + String(payload.error ?? 'registre indisponible')
          : (state.presetFilter === null
            ? 'The system prompt registry is not available.'
            : 'This Agent preset assembles nothing from the registry.')
        body.appendChild(noteElement(message, payload?.ok === false))
        return
      }
      const groups = state.presetFilter === null
        ? (Array.isArray(payload?.groups) ? payload.groups : [])
        : groupsFromRows(rows).map((group) => ({ name: group.name, count: group.rows.length, on: group.rows.filter((row) => row.enabled !== false).length, tokens: group.tokens }))
      if (groups.length === 0) {
        const nodes = []
        for (const row of rows) nodes.push(promptRow(row, state))
        body.appendChild(groupElement('Assembly order', [String(rows.length) + ' sections'], nodes))
        return
      }
      for (const group of groups) {
        const members = rows.filter((row) => row?.group === group.name)
        if (members.length === 0) continue
        const names = members.map((row) => row.name)
        const groupFilter = state.presetFilter
        const toggle = groupToggle(members, 'Turn every section in this group on or off', (wanted) => {
          flipMany(state, 'prompts', 'togglePrompts', names, wanted, groupFilter)
        })
        body.appendChild(groupElement(group.name, groupBits(group), members.map((row) => promptRow(row, state)), toggle))
      }
    }

    function paintPage(state, kind) {
      try {
        const payload = state.payload[kind]
        if (kind === 'tools') paintTools(state, payload)
        else paintPrompts(state, payload)
        state.body.setAttribute('data-mcpc-ready', 'true')
      } catch (error) {
        report('page-paint-error', String(error?.message ?? error))
      }
    }

    function loadPage(state, kind, force) {
      if (state.loading[kind] === true) return
      if (force !== true && state.payload[kind] !== null) return
      state.loading[kind] = true
      const url = ENDPOINT + '?view=' + kind + '&client=' + CLIENT_VERSION
      fetchJson(url)
        .then((payload) => {
          state.loading[kind] = false
          if (payload !== null && typeof payload === 'object') state.payload[kind] = payload
          else state.payload[kind] = { ok: false, error: 'unreadable response' }
          if (state.tab === kind) paintPage(state, kind)
        })
        .catch((error) => {
          state.loading[kind] = false
          state.payload[kind] = { ok: false, error: String(error?.message ?? error) }
          if (state.tab === kind) paintPage(state, kind)
          report('page-load-error', kind + ': ' + String(error?.message ?? error))
        })
    }

    /** Show or hide the panel's own content while one of our tabs is active. */
    function maskOwnContent(state, mask) {
      const kids = state.root.children
      for (let index = 2; index < kids.length; index += 1) {
        const kid = kids[index]
        if (kid === null || kid === undefined) continue
        if (typeof kid.hasAttribute === 'function' && kid.hasAttribute('data-mcpc-body')) continue
        try {
          if (mask === true) {
            if (kid.style.display !== 'none') {
              kid.setAttribute('data-mcpc-masked', 'true')
              kid.style.display = 'none'
            }
          } else if (kid.hasAttribute('data-mcpc-masked') === true) {
            kid.removeAttribute('data-mcpc-masked')
            kid.style.removeProperty('display')
          }
        } catch {
          // One stubborn node must not leave the page blank.
        }
      }
    }

    /**
     * Keep the tab body inside the viewport so its own list can scroll.
     *
     * The panel page may be as tall as its content and clipped by its own
     * `overflow:hidden`: a long list would then be cut with no scrollbar. Sizing
     * the body to the space left under the tab strip gives it a definite height,
     * which is what turns `overflow-y:auto` into a real scroll.
     */
    function fitBody(state) {
      if (state === null || state === undefined || state.tab === null) return
      try {
        const viewport = typeof window !== 'undefined' && Number.isFinite(window.innerHeight) ? window.innerHeight : 0
        if (viewport <= 0) return
        const rect = state.body.getBoundingClientRect()
        const available = Math.max(180, Math.floor(viewport - rect.top - 16))
        const current = Number.parseInt(state.body.style.maxHeight, 10)
        if (Number.isFinite(current) && Math.abs(current - available) < 3) return
        state.body.style.maxHeight = available + 'px'
        if (state.reported !== true) {
          state.reported = true
          const rootRect = state.root.getBoundingClientRect()
          report('page-metrics', 'vh=' + viewport + ' top=' + Math.round(rect.top)
            + ' avail=' + available + ' scroll=' + state.body.scrollHeight
            + ' client=' + state.body.clientHeight + ' rootH=' + Math.round(rootRect.height)
            + ' overflow=' + String(state.body.style.overflowY))
        }
      } catch {
        // A page without layout still renders, just without the cap.
      }
    }

    function selectTab(state, id) {
      if (state === null) return
      state.tab = id
      for (const [key, button] of state.buttons) {
        button.setAttribute('data-active', key === id ? 'true' : 'false')
        button.setAttribute('aria-pressed', key === id ? 'true' : 'false')
      }
      state.root.setAttribute('data-mcpc-active', '1')
      state.body.style.display = 'flex'
      state.body.setAttribute('data-mcpc-view', id)
      maskOwnContent(state, true)
      fitBody(state)
      // The body is a single subtree shared by both views: switching tabs must
      // repaint it even when that view was already loaded.
      paintPage(state, id)
      loadPage(state, id, false)
    }

    function clearTab(state) {
      if (state === null) return
      state.tab = null
      for (const [, button] of state.buttons) {
        button.setAttribute('data-active', 'false')
        button.setAttribute('aria-pressed', 'false')
      }
      state.root.removeAttribute('data-mcpc-active')
      state.body.style.display = 'none'
      maskOwnContent(state, false)
    }

    /** Switch a whole group at once: one request, one persist, one reapply. */
    function flipMany(state, kind, param, names, wanted, preset) {
      if (state === null || names.length === 0) return
      if (state.busy[kind] === true) return
      state.busy[kind] = true
      const url = ENDPOINT + '?view=' + kind + '&' + param + '=' + encodeURIComponent(names.join(','))
        + '&enabled=' + (wanted === true ? 'true' : 'false')
        + (typeof preset === 'string' && preset.length > 0 ? '&preset=' + encodeURIComponent(preset) : '')
        + '&client=' + CLIENT_VERSION
      fetchJson(url)
        .then((payload) => {
          state.busy[kind] = false
          if (payload === null || typeof payload !== 'object') return
          state.payload[kind] = payload
          if (state.tab === kind) paintPage(state, kind)
          if (payload.ok !== true) report('page-toggle-error', String(payload.error ?? 'inconnu'))
          else report('page-toggle-group', kind + ' x' + names.length + '=' + String(wanted === true))
        })
        .catch((error) => {
          state.busy[kind] = false
          report('page-toggle-error', String(error?.message ?? error))
        })
    }

    function flipPage(state, kind, param, name, wanted, preset) {
      const url = ENDPOINT + '?view=' + kind + '&' + param + '=' + encodeURIComponent(name)
        + '&enabled=' + (wanted === true ? 'true' : 'false')
        + (typeof preset === 'string' && preset.length > 0 ? '&preset=' + encodeURIComponent(preset) : '')
        + '&client=' + CLIENT_VERSION
      fetchJson(url)
        .then((payload) => {
          if (payload === null || typeof payload !== 'object') return
          state.payload[kind] = payload
          if (state.tab === kind) paintPage(state, kind)
          if (payload.ok !== true) report('page-toggle-error', String(payload.error ?? 'inconnu'))
          else report('page-toggle', kind + ' ' + name + '=' + String(wanted === true))
        })
        .catch((error) => { report('page-toggle-error', String(error?.message ?? error)) })
    }

    /**
     * Drop the tabs and body a previous module instance left in the page.
     *
     * A client bundle reload replaces the module but not the DOM it built, so
     * decoration must be idempotent across instances instead of stacking.
     */
    function cleanPrevious(root) {
      try {
        const strip = childBy(root, (kid) => kid?.getAttribute?.('role') === 'tablist')
        if (strip !== null) {
          for (const kid of Array.from(strip.children)) {
            if (typeof kid.hasAttribute === 'function' && kid.hasAttribute('data-mcpc-tab')) strip.removeChild(kid)
          }
        }
        for (const kid of Array.from(root.children)) {
          if (typeof kid.hasAttribute === 'function' && kid.hasAttribute('data-mcpc-body')) root.removeChild(kid)
        }
        root.removeAttribute('data-mcpc-active')
        for (const kid of Array.from(root.children)) {
          if (kid.hasAttribute?.('data-mcpc-masked') === true) {
            kid.removeAttribute('data-mcpc-masked')
            kid.style.removeProperty('display')
          }
        }
      } catch {
        // A half-cleaned page is still better than a duplicated one.
      }
    }

    /** Build our tabs and body inside the panel page; returns the state. */
    function decoratePage(root) {
      const strip = childBy(root, (kid) => kid?.getAttribute?.('role') === 'tablist')
      if (strip === null) return null
      cleanPrevious(root)
      const own = []
      for (let index = 0; index < strip.children.length; index += 1) {
        if (tagIs(strip.children[index], 'BUTTON')) own.push(strip.children[index])
      }
      if (own.length === 0) return null

      const buttons = new Map()
      const prototype = own[own.length - 1]
      for (const tab of PAGE_TABS) {
        let button
        try {
          button = prototype.cloneNode(true)
        } catch {
          button = null
        }
        if (button === null) {
          button = document.createElement('button')
          button.className = prototype.getAttribute('className') ?? prototype.className ?? ''
          button.type = 'button'
        }
        button.textContent = tab.label
        button.setAttribute('data-mcpc-tab', tab.id)
        button.setAttribute('data-active', 'false')
        button.setAttribute('aria-pressed', 'false')
        button.setAttribute('title', tab.heading)
        strip.appendChild(button)
        buttons.set(tab.id, button)
      }

      const body = document.createElement('div')
      body.className = 'dsh-mcpc-body'
      body.setAttribute('data-mcpc-body', '1')
      body.style.display = 'none'
      root.appendChild(body)

      const state = {
        root,
        strip,
        body,
        buttons,
        tab: null,
        payload: { tools: null, prompts: null },
        loading: { tools: false, prompts: false },
        busy: { tools: false, prompts: false },
        // The Agent preset a tag was clicked for; null shows every preset.
        presetFilter: null,
        presetNames: {},
        // A visible filter scopes every switch to that preset, so the same
        // control means "for every agent" or "for this preset only".
        flip: (kind, param, name, wanted) => flipPage(state, kind, param, name, wanted, state.presetFilter),
        observer: null,
        timer: null,
        dispose: null,
      }

      for (const tab of PAGE_TABS) {
        buttons.get(tab.id).addEventListener('click', (event) => {
          event.preventDefault()
          selectTab(state, tab.id)
        })
      }
      // The user going back to one of the panel's own tabs must reveal its
      // content again; the listener runs in the capture phase so it wins
      // against React's own click handling.
      const onStripClick = (event) => {
        let node = event.target
        while (node !== null && node !== undefined && node !== strip) {
          if (typeof node.hasAttribute === 'function' && node.hasAttribute('data-mcpc-tab')) return
          node = node.parentNode
        }
        if (state.tab !== null) clearTab(state)
      }
      strip.addEventListener('click', onStripClick, true)

      const repair = () => {
        if (state.tab === null) return
        if (state.body.style.display !== 'flex') state.body.style.display = 'flex'
        fitBody(state)
        maskOwnContent(state, true)
        if (state.body.childNodes.length === 0 && state.payload[state.tab] === null) paintPage(state, state.tab)
      }
      const onResize = () => { try { fitBody(state) } catch { /* layout not ready */ } }
      try { window.addEventListener('resize', onResize) } catch { /* no window */ }
      try {
        if (typeof MutationObserver === 'function') {
          state.observer = new MutationObserver(() => {
            try { repair() } catch { /* a repair pass must never throw into React */ }
          })
          state.observer.observe(root, { childList: true, subtree: false })
        }
      } catch {
        state.observer = null
      }
      // Belt and braces: content swapped by React is hidden again within a
      // quarter second even if the observer missed the mutation.
      state.timer = setInterval(() => {
        try {
          if (document.contains?.(root) === false) { disposePage(state); return }
          // A reloaded bundle replaces the module but keeps the page: the old
          // body is detached by the new instance, so this one stands down.
          if (state.body.isConnected === false) { disposePage(state); return }
          repair()
          tickMcp(state)
        } catch { /* ignore */ }
      }, 250)

      state.dispose = () => {
        state.tab = null
        try { strip.removeEventListener('click', onStripClick, true) } catch { /* already gone */ }
        try { window.removeEventListener('resize', onResize) } catch { /* no window */ }
        try { state.observer?.disconnect?.() } catch { /* already gone */ }
        if (state.timer !== null) clearInterval(state.timer)
        state.timer = null
        try { body.remove() } catch { if (body.parentNode !== null) body.parentNode.removeChild(body) }
        for (const [, button] of buttons) {
          try { button.remove() } catch { /* already gone */ }
        }
        try { root.removeAttribute('data-mcpc-active') } catch { /* ignore */ }
        maskOwnContent(state, false)
      }
      return state
    }

    /**
     * Token chips on the panel's own MCP cards.
     *
     * The page belongs to `dsh-skill-mcp-panel` and is not modified: we only
     * append one chip to each server headline and one to each tool row, priced
     * from the same inventory the menu uses. Running it on every pass is safe -
     * a chip whose text is already right is left alone, so a repaint by the
     * panel is repaired on the next tick without churn.
     */
    function tickMcp(state) {
      if (state === null) return
      try {
        const root = state.root
        if (String(root?.getAttribute?.('data-tab') ?? '') !== 'mcp') return
        const cards = Array.from(root.querySelectorAll?.('.MCP_card') ?? [])
        if (cards.length === 0) return
        const payload = inventory.value
        const servers = Array.isArray(payload?.servers) ? payload.servers : null
        if (servers === null) {
          refresh(false)
          return
        }
        for (const card of cards) {
          const label = String(card.querySelector?.('.MCP_name')?.textContent ?? '').trim()
          if (label === '') continue
          const server = servers.find((row) => row?.name === label)
          if (server === undefined) continue
          const badges = card.querySelector?.('.MCP_badges') ?? card.querySelector?.('.MCP_cardTop')
          if (badges !== null && badges !== undefined) {
            const weight = weightOf(server)
            chipInto(badges, weight.value, weight.title, 'server')
          }
          // The card prints the tool count it read when the list was built, so
          // a server that only connected afterwards still reads "0 tools" while
          // the inventory knows better. Only a positive, known count overwrites
          // it: this must never replace a real number with a stale zero.
          // The card's switch belongs to the panel: it mirrors the profile (or the
          // workspace override) and a click writes exactly that. Forcing it off
          // here desynchronised it from React, so the next click sent the
          // opposite of what the reader asked for.
          // A result box from "Test connection" stays until dismissed: one
          // click on the card closes it, and it stays closed even when the
          // panel re-renders it.
          if (card.querySelector?.('.MCP_result') !== null) {
            if (card.getAttribute('data-mcpc-dismissed') === '1') {
              for (const box of Array.from(card.querySelectorAll?.('.MCP_result') ?? [])) {
                box.style.setProperty('display', 'none', 'important')
              }
            } else if (card.getAttribute('data-mcpc-dismiss') !== '1') {
              card.setAttribute('data-mcpc-dismiss', '1')
              card.addEventListener('click', (event) => {
                const target = event.target
                // A click that starts the test, or lands inside the box, is not
                // a dismissal.
                if (target?.closest?.('.MCP_actions, .MCP_form, .MCP_result') !== null) return
                card.setAttribute('data-mcpc-dismissed', '1')
                for (const box of Array.from(card.querySelectorAll?.('.MCP_result') ?? [])) {
                  box.style.setProperty('display', 'none', 'important')
                }
              })
            }
          }

          const meta = card.querySelector?.('.MCP_meta')
          if (meta !== null && meta !== undefined && typeof server.toolCount === 'number' && server.toolCount > 0) {
            for (const span of Array.from(meta.querySelectorAll?.('span') ?? [])) {
              if (span.classList?.contains?.('MCP_dot') === true) continue
              const text = String(span.textContent ?? '')
              const leading = /^\s*(\d+)/.exec(text)
              if (leading === null) continue
              if (leading[1] === String(server.toolCount)) continue
              span.textContent = text.replace(/^\s*\d+/, String(server.toolCount))
              span.title = 'Compte lu dans l\'inventaire du Host : ' + String(server.toolCount) + ' outils'
            }
            // The total hides how many are actually live: say so, but only when
            // the two really differ.
            const active = typeof server.activeToolCount === 'number' ? server.activeToolCount : null
            let extra = meta.querySelector?.('[data-mcpc-active-count]') ?? null
            const wanted = active !== null && active !== server.toolCount
              ? '(' + String(active) + ' active' + ')'
              : ''
            if (wanted === '') {
              if (extra !== null) extra.remove()
            } else {
              if (extra === null) {
                extra = document.createElement('span')
                extra.setAttribute('data-mcpc-active-count', 'true')
                meta.appendChild(extra)
              }
              if (extra.textContent !== wanted) extra.textContent = wanted
              extra.title = String(active) + ' of ' + String(server.toolCount)
                + ' tools are on; the rest are switched off'
            }
          }
          for (const row of Array.from(card.querySelectorAll?.('.MCP_toolRow') ?? [])) {
            const toolLabel = String(row.querySelector?.('.MCP_toolName')?.textContent ?? '').trim()
            if (toolLabel === '') continue
            const tools = Array.isArray(server.tools) ? server.tools : []
            const tool = tools.find((entry) => entry?.name === toolLabel
              || String(entry?.name ?? '').endsWith('__' + toolLabel))
            if (tool === undefined) continue
            chipInto(row, tool.tokens, 'Tokens this tool schema costs', 'tool')
          }
        }
      } catch {
        // A price chip must never break the panel.
      }
    }

    /** Keep exactly one price chip of that kind in `container`. */
    function chipInto(container, tokens, title, kind) {
      let chip = null
      for (const kid of Array.from(container.children ?? [])) {
        if (kid?.classList?.contains?.('dsh-mcpc-tokchip') === true
          && kid.getAttribute?.('data-kind') === kind) { chip = kid; break }
      }
      const text = formatTokens(tokens)
      if (text === '') {
        if (chip !== null) chip.remove()
        return
      }
      if (chip === null) {
        chip = document.createElement('span')
        chip.className = 'dsh-mcpc-tokchip'
        chip.setAttribute('data-kind', kind)
        container.appendChild(chip)
      }
      if (chip.textContent !== text) chip.textContent = text
      if (chip.title !== title) chip.title = title
    }

    function disposePage(state) {
      if (state === null) return
      try { state.dispose?.() } catch { /* already disposed */ }
      if (PAGE === state) PAGE = null
    }

    /**
     * Keep the page decorated while the panel is open. A new page element
     * (panel reopened, route changed) replaces the previous decoration.
     */
    function installPageTabs() {
      let root = null
      try { root = findPageRoot() } catch { root = null }
      if (PAGE !== null && (root === null || root !== PAGE.root || pageAlive(PAGE) === false)) {
        disposePage(PAGE)
      }
      if (root !== null && PAGE !== null) { tickMcp(PAGE); return }
      if (root === null || PAGE !== null) return
      ensurePageStyles()
      const state = decoratePage(root)
      if (state !== null) {
        PAGE = state
        report('page-tabs', 'tabs installed')
      }
    }

    function pageAlive(state) {
      try {
        if (state?.root?.isConnected === true) return true
        if (typeof document.contains === 'function') return document.contains(state.root) === true
      } catch {
        // Unknown: assume alive and let the next pass decide.
        return true
      }
      return true
    }

    /* ------------------------------------------------------------------ */
    /* 4. Subagent Settings Page Decoration                               */
    /* ------------------------------------------------------------------ */

    const subagentState = {
      forceModel: false,
      blockMainModel: false,
      forcedModel: null,
      loaded: false,
      loading: false,
    }

    function fetchSubagentSettings() {
      if (subagentState.loading) return Promise.resolve(subagentState)
      subagentState.loading = true
      return fetchJson(ENDPOINT + '?view=subagentSettings')
        .then((res) => {
          if (res !== null && typeof res === 'object' && res.ok === true) {
            subagentState.forceModel = res.subagentForceModel === true
            subagentState.blockMainModel = res.subagentBlockMainModel === true
            subagentState.forcedModel = res.forcedSubagentModel ?? null
            subagentState.loaded = true
          }
          return subagentState
        })
        .catch(() => subagentState)
        .finally(() => { subagentState.loading = false })
    }

    function saveSubagentSettings(force, block, forced, savedNoticeEl) {
      subagentState.forceModel = force === true
      subagentState.blockMainModel = block === true
      subagentState.forcedModel = typeof forced === 'string' && forced.length > 0 && forced !== 'auto' ? forced : null
      const url = ENDPOINT + '?setSubagentSettings=1'
        + '&force=' + (subagentState.forceModel ? 'true' : 'false')
        + '&block=' + (subagentState.blockMainModel ? 'true' : 'false')
        + '&forced=' + encodeURIComponent(subagentState.forcedModel ?? 'auto')
      return fetchJson(url)
        .then((res) => {
          if (res !== null && typeof res === 'object' && res.ok === true) {
            if (savedNoticeEl !== null && savedNoticeEl !== undefined) {
              savedNoticeEl.setAttribute('data-visible', 'true')
              setTimeout(() => {
                try { savedNoticeEl.removeAttribute('data-visible') } catch { /* ignore */ }
              }, 1800)
            }
          }
        })
        .catch(() => {})
    }

    function collectPageModels(container) {
      const list = []
      const seen = new Set()
      const labels = container.querySelectorAll('label')
      for (let i = 0; i < labels.length; i += 1) {
        const label = labels[i]
        const nameNode = label.querySelector('[class*="modelName"]')
        const routeNode = label.querySelector('[class*="route"]')
        const input = label.querySelector('input[type="checkbox"]')
        if (nameNode !== null || routeNode !== null) {
          const name = nameNode?.textContent?.trim() || ''
          const rawRoute = routeNode?.textContent?.trim() || ''
          let providerModel = ''
          if (rawRoute.indexOf('\u00b7') !== -1) {
            providerModel = rawRoute.split('\u00b7')[1]?.trim() || ''
          } else {
            providerModel = rawRoute
          }
          if (providerModel.length === 0) providerModel = name
          if (providerModel.length > 0 && !seen.has(providerModel)) {
            seen.add(providerModel)
            list.push({
              name: name,
              route: providerModel,
              fullLabel: name.length > 0 && name !== providerModel ? (name + ' (' + providerModel + ')') : providerModel,
              checked: input?.checked === true,
            })
          }
        }
      }
      return list
    }

    function findSubagentSection() {
      try {
        const byAttr = document.querySelector('section[aria-labelledby*="-models"]')
        if (byAttr !== null) return byAttr
        const sections = document.querySelectorAll('section')
        for (let i = 0; i < sections.length; i += 1) {
          const s = sections[i]
          const h3 = s.querySelector('h3')
          const text = (h3?.textContent ?? '').toLowerCase()
          if (text.indexOf('model') !== -1 || text.indexOf('mod\u00e8le') !== -1) {
            return s
          }
        }
        const fieldsets = document.querySelectorAll('fieldset')
        for (let j = 0; j < fieldsets.length; j += 1) {
          const f = fieldsets[j]
          const leg = (f.querySelector('legend')?.textContent ?? '').toLowerCase()
          if (leg.indexOf('model') !== -1 || leg.indexOf('mod\u00e8le') !== -1) {
            return f.closest('section') || f.parentElement
          }
        }
      } catch {
        return null
      }
      return null
    }

    function decorateSubagentSection(section) {
      if (section === null || section === undefined) return
      if (section.querySelector('#dsh-mcpc-subagent-card') !== null) return

      ensurePageStyles()
      const permission = section.querySelector('[class*="permission"]')
      const anchor = permission || section.querySelector('h3')
      if (anchor === null) return

      const card = document.createElement('div')
      card.id = 'dsh-mcpc-subagent-card'
      card.className = 'dsh-mcpc-subagent-box'

      // Header
      const head = document.createElement('div')
      head.className = 'dsh-mcpc-subagent-header'

      const title = document.createElement('div')
      title.className = 'dsh-mcpc-subagent-title'
      title.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> <span>Contr\u00f4le du mod\u00e8le des sous-agents (MCP Companion)</span>'

      const badgeWrap = document.createElement('div')
      badgeWrap.style.display = 'flex'
      badgeWrap.style.alignItems = 'center'
      badgeWrap.style.gap = '8px'

      const savedNotice = document.createElement('span')
      savedNotice.className = 'dsh-mcpc-subagent-saved'
      savedNotice.textContent = 'Enregistr\u00e9'

      const badge = document.createElement('span')
      badge.className = 'dsh-mcpc-subagent-badge'
      badge.textContent = 'Actif'

      badgeWrap.appendChild(savedNotice)
      badgeWrap.appendChild(badge)
      head.appendChild(title)
      head.appendChild(badgeWrap)
      card.appendChild(head)

      // Row 1: Force subagents to use selected model
      const rowForce = document.createElement('div')
      rowForce.className = 'dsh-mcpc-subagent-row'

      const textForce = document.createElement('div')
      textForce.className = 'dsh-mcpc-subagent-text'
      const nameForce = document.createElement('div')
      nameForce.className = 'dsh-mcpc-subagent-name'
      nameForce.textContent = 'Forcer les sous-agents \u00e0 utiliser un mod\u00e8le s\u00e9lectionn\u00e9'
      const descForce = document.createElement('div')
      descForce.className = 'dsh-mcpc-subagent-desc'
      descForce.textContent = 'Emp\u00eache les sous-agents de choisir librement ou d\'h\u00e9riter par d\u00e9faut : ils utiliseront obligatoirement le mod\u00e8le choisi ci-dessous.'
      textForce.appendChild(nameForce)
      textForce.appendChild(descForce)

      const selectWrap = document.createElement('div')
      selectWrap.className = 'dsh-mcpc-subagent-select-wrap'
      selectWrap.style.display = subagentState.forceModel ? 'flex' : 'none'

      const selectLabel = document.createElement('span')
      selectLabel.className = 'dsh-mcpc-subagent-select-label'
      selectLabel.textContent = 'Mod\u00e8le impos\u00e9 :'

      const select = document.createElement('select')
      select.className = 'dsh-mcpc-subagent-select'

      function updateSelectOptions() {
        const currentVal = select.value || subagentState.forcedModel || 'auto'
        while (select.firstChild !== null) select.removeChild(select.firstChild)

        const optAuto = document.createElement('option')
        optAuto.value = 'auto'
        optAuto.textContent = 'Premier mod\u00e8le coch\u00e9 ci-dessous (Automatique)'
        select.appendChild(optAuto)

        const models = collectPageModels(section)
        for (const m of models) {
          const opt = document.createElement('option')
          opt.value = m.route
          opt.textContent = (m.checked ? '\u2713 ' : '') + m.fullLabel
          select.appendChild(opt)
        }
        select.value = currentVal
      }

      select.addEventListener('change', () => {
        saveSubagentSettings(subagentState.forceModel, subagentState.blockMainModel, select.value, savedNotice)
      })

      selectWrap.appendChild(selectLabel)
      selectWrap.appendChild(select)

      const switchForce = switchElement(subagentState.forceModel, 'Forcer un mod\u00e8le', (nextVal) => {
        subagentState.forceModel = nextVal
        switchForce.setAttribute('data-on', String(nextVal))
        switchForce.setAttribute('aria-checked', String(nextVal))
        selectWrap.style.display = nextVal ? 'flex' : 'none'
        saveSubagentSettings(nextVal, subagentState.blockMainModel, select.value, savedNotice)
      })

      rowForce.appendChild(textForce)
      rowForce.appendChild(switchForce)
      card.appendChild(rowForce)
      card.appendChild(selectWrap)

      // Row 2: Block main agent model
      const rowBlock = document.createElement('div')
      rowBlock.className = 'dsh-mcpc-subagent-row'

      const textBlock = document.createElement('div')
      textBlock.className = 'dsh-mcpc-subagent-text'
      const nameBlock = document.createElement('div')
      nameBlock.className = 'dsh-mcpc-subagent-name'
      nameBlock.textContent = 'Bloquer l\'utilisation du m\u00eame mod\u00e8le que l\'agent principal'
      const descBlock = document.createElement('div')
      descBlock.className = 'dsh-mcpc-subagent-desc'
      descBlock.textContent = 'Interdit strictement aux sous-agents d\'utiliser le m\u00eame mod\u00e8le que l\'agent principal (Lead). Si demand\u00e9, un mod\u00e8le alternatif autoris\u00e9 sera utilis\u00e9.'
      textBlock.appendChild(nameBlock)
      textBlock.appendChild(descBlock)

      const switchBlock = switchElement(subagentState.blockMainModel, 'Bloquer le mod\u00e8le principal', (nextVal) => {
        subagentState.blockMainModel = nextVal
        switchBlock.setAttribute('data-on', String(nextVal))
        switchBlock.setAttribute('aria-checked', String(nextVal))
        saveSubagentSettings(subagentState.forceModel, nextVal, select.value, savedNotice)
      })

      rowBlock.appendChild(textBlock)
      rowBlock.appendChild(switchBlock)
      card.appendChild(rowBlock)

      // Insert into DOM after anchor
      if (anchor.nextSibling !== null) {
        anchor.parentNode.insertBefore(card, anchor.nextSibling)
      } else {
        anchor.parentNode.appendChild(card)
      }

      // Initial load of backend state and populate select
      fetchSubagentSettings().then(() => {
        switchForce.setAttribute('data-on', String(subagentState.forceModel))
        switchForce.setAttribute('aria-checked', String(subagentState.forceModel))
        selectWrap.style.display = subagentState.forceModel ? 'flex' : 'none'
        switchBlock.setAttribute('data-on', String(subagentState.blockMainModel))
        switchBlock.setAttribute('aria-checked', String(subagentState.blockMainModel))
        updateSelectOptions()
        if (subagentState.forcedModel !== null && subagentState.forcedModel.length > 0) {
          select.value = subagentState.forcedModel
        }
      })

      // When checkboxes change in the models fieldset, update select options
      section.addEventListener('change', (e) => {
        if (e.target !== null && e.target.type === 'checkbox') {
          setTimeout(updateSelectOptions, 60)
        }
      })
    }

    function installSubagentPageDecorator() {
      try {
        const section = findSubagentSection()
        if (section !== null) decorateSubagentSection(section)
      } catch {
        // Must never break the UI
      }
    }

    return {
      inject: ['remote'],
      apply(ctx) {
        // Nothing here may take the page down: every step is guarded, and a
        // failure simply leaves the chip or the panel decoration absent.
        report('apply', 'v=' + CLIENT_VERSION)
        try {
          refresh(true)
        } catch {
          // The route is unavailable; the chip will report it when opened.
        }
        try {
          installChip(ctx)
        } catch (error) {
          report('chip-slot-error', String(error?.message ?? error))
        }
        try {
          installPresetSeatStats()
        } catch (error) {
          report('preset-stats-error', String(error?.message ?? error))
        }
        try {
          installAgentColors()
        } catch (error) {
          report('agent-colors-error', String(error?.message ?? error))
        }
        try {
          installAgentManagerButton()
        } catch (error) {
          report('agent-manager-error', String(error?.message ?? error))
        }
        try {
          installDraftAttachmentKeeper(ctx)
        } catch (error) {
          report('draft-keep-error', String(error?.message ?? error))
        }
        try {
          installMcpTokenBadges()
        } catch (error) {
          report('mcp-token-error', String(error?.message ?? error))
        }
        try {
          installPageTabs()
          installSubagentPageDecorator()
        } catch (error) {
          report('page-tabs-error', String(error?.message ?? error))
        }
        // The panel page exists only while its sidebar row is open, so the
        // decoration is re-checked often: the pass is one query when the page
        // is closed and idle work when it is open.
        const pageTimer = setInterval(() => {
          try {
            installPageTabs()
            installSubagentPageDecorator()
          } catch { /* one failed pass must not stop the decorator */ }
        }, 300)
        if (typeof pageTimer?.unref === 'function') pageTimer.unref()
        try {
          ctx.effect(() => () => clearInterval(pageTimer), 'dsh-mcp-companion: page tabs')
        } catch {
          // No effect scope: the interval stays for the life of the page.
        }
        // The namespace appears when the owning panel mounts it; a light poll
        // picks it up without depending on plugin activation order.
        const timer = setInterval(() => {
          try {
            install(ctx)
            refresh(false)
          } catch {
            // A single failed pass must not stop the decorator.
          }
        }, 1000)
        if (typeof timer?.unref === 'function') timer.unref()
        try {
          ctx.effect(() => () => clearInterval(timer), 'dsh-mcp-companion: panel decorator')
        } catch {
          // No effect scope: the interval stays for the life of the page.
        }
      },
    }
},
            function (require) { // dsh-token-estimator

    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React

    const ENDPOINT = '/local-token-estimator/estimate'

    const T = {
      text: 'var(--dsw-alias-label-primary)',
      muted: 'var(--dsw-alias-label-secondary)',
      faint: 'var(--dsw-alias-label-tertiary)',
      border: 'var(--dsw-alias-border-l1)',
      layer2: 'var(--dsw-alias-bg-layer-2)',
      accent: 'var(--dsw-alias-brand-primary)',
      danger: 'var(--dsw-alias-state-error-primary)',
      success: 'var(--dsw-alias-state-success-primary)',
    }

    /** 950 -> "950", 1735 -> "1.7K", 23827 -> "23.9K", 1048576 -> "1M". */
    function compact(value) {
      const n = Math.round(Number(value) || 0)
      if (n < 1000) return String(n)
      if (n < 1000000) {
        const k = n / 1000
        const text = k < 100 ? k.toFixed(1) : String(Math.round(k))
        return text.replace(/\.0$/, '') + 'K'
      }
      const m = n / 1000000
      return m.toFixed(m < 10 ? 2 : 1).replace(/\.?0+$/, '') + 'M'
    }

    /** The composer's Lexical root, or any contenteditable fallback. */
    function readDraft() {
      try {
        const root = document.querySelector('[data-lexical-editor="true"]')
          || document.querySelector('[contenteditable="true"]')
        if (root === null) return ''
        const text = typeof root.innerText === 'string' ? root.innerText : (root.textContent || '')
        return text.replace(/\u200b/g, '').trim()
      } catch {
        return ''
      }
    }

    /**
     * One colour per bucket, readable on both the dark and light menu surface.
     * These are categorical data colours, not theme chrome, so they stay literal:
     * the theme tokens only offer a single accent plus state colours.
     */
    const SERIES = {
      system: '#a78bfa',
      skills: '#fbbf24',
      tools: '#60a5fa',
      mcp: '#f87171',
      messages: '#34d399',
    }

    function rowColor(id) {
      return SERIES[id] || T.accent
    }

    function Bar(props) {
      const ratio = props.total > 0 ? Math.min(1, props.tokens / props.total) : 0
      return h('div', {
        style: { height: 6, borderRadius: 999, width: '100%', backgroundColor: T.layer2, overflow: 'hidden' },
      }, h('div', {
        style: {
          height: '100%', width: (ratio * 100).toFixed(2) + '%',
          backgroundColor: props.color, borderRadius: 999, transition: 'width 160ms ease',
        },
      }))
    }

    function Row(props) {
      return h('div', {
        style: { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12, color: T.text },
      },
      props.tag !== undefined
        ? h('span', {
            style: {
              flex: '0 0 auto', fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
              padding: '1px 5px', borderRadius: 4, color: T.faint, border: '1px solid ' + T.border,
            },
          }, props.tag)
        : null,
      h('span', {
        style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
        title: props.name,
      }, props.name),
      h('span', {
        style: { flex: '0 0 auto', color: T.muted, fontVariantNumeric: 'tabular-nums' },
      }, compact(props.tokens)))
    }

    /** Skills and MCP have their own rows now, so no item needs a tag. */
    function itemsFor(group) {
      const items = Array.isArray(group.items) ? group.items : []
      return items
    }

    function GroupBlock(props) {
      const { group, data, total, expanded, onToggle } = props
      const items = itemsFor(group, data)
      const share = total > 0 ? (group.tokens / total) * 100 : 0
      return h('div', { style: { padding: '8px 0', borderTop: '1px solid ' + T.border } },
        h('div', {
          onClick: items.length > 0 ? onToggle : undefined,
          style: {
            display: 'flex', alignItems: 'baseline', gap: 8,
            cursor: items.length > 0 ? 'pointer' : 'default',
            fontSize: 13, color: T.text, fontWeight: 500,
          },
        },
        h('span', { style: { flex: 1 } }, group.label),
        h('span', { style: { color: T.muted, fontSize: 11, fontVariantNumeric: 'tabular-nums' } },
          share.toFixed(1) + '%'),
        h('span', { style: { fontVariantNumeric: 'tabular-nums', minWidth: 52, textAlign: 'right' } },
          '~' + compact(group.tokens)),
        h('span', { style: { color: T.muted, fontSize: 10, width: 10, textAlign: 'center' } },
          items.length > 0 ? (expanded ? '▾' : '▸') : ''),
        ),
        h('div', { style: { marginTop: 6 } }, h(Bar, { tokens: group.tokens, total, color: rowColor(group.id) })),
        expanded && items.length > 0
          ? h('div', { style: { marginTop: 6, maxHeight: 230, overflowY: 'auto' } },
              items.map((item, index) => h(Row, {
                key: item.name + ':' + index,
                name: item.name,
                tokens: item.tokens,
                tag: item.tag,
              })))
          : null)
    }

    function Panel(props) {
      const data = props.data
      const [expanded, setExpanded] = useState({})
      const all = data !== null && Array.isArray(data.groups) ? data.groups : []
      // Skills and MCP keep their own rows, but only while they carry something.
      const groups = all.filter((group) => (
        group.id !== 'mcp' && group.id !== 'skills'
      ) || group.tokens > 0 || (group.items || []).length > 0)
      const total = data !== null && typeof data.total === 'number' ? data.total : 0
      const capacity = data !== null && typeof data.capacity === 'number' ? data.capacity : undefined
      const native = data !== null && data.source === 'native'
      const failed = data !== null && data.ok === false

      return h('div', {
        role: 'dialog',
        'aria-label': 'Token breakdown',
        style: {
          position: 'absolute', right: 0, top: 'calc(100% + 8px)',
          width: 340, maxHeight: '64vh', overflowY: 'auto',
          backgroundColor: 'var(--dsw-specific-menu)',
          backdropFilter: 'var(--dsw-menu-backdrop-filter)',
          WebkitBackdropFilter: 'var(--dsw-menu-backdrop-filter)',
          color: T.text,
          border: '0.5px solid ' + T.border, borderRadius: 'var(--dsw-radius-lg, 12px)',
          boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
          padding: '12px 14px', zIndex: 60, textAlign: 'left',
        },
      },
      h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, paddingBottom: 4 } },
        h('div', { style: { fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.faint, flex: 1 } },
          'First request'),
        data === null
          ? h('span', { style: { fontSize: 12, color: T.muted } }, 'measuring…')
          : h('span', { style: { fontSize: 20, fontWeight: 600, fontVariantNumeric: 'tabular-nums' } },
              [
                '~' + compact(total),
                capacity !== undefined
                  ? h('span', { key: 'cap', style: { fontSize: 13, fontWeight: 400, color: T.muted } },
                      ' / ' + compact(capacity))
                  : null,
              ])),
      data !== null && !failed
        ? h('div', { style: { fontSize: 11, color: T.faint, paddingBottom: 2 } },
            [
              data.model ? data.model : null,
              native ? 'mesuré' : 'assemblé',
            ].filter(Boolean).join(' · '))
        : null,
      failed
        ? h('div', { style: { fontSize: 11, color: T.danger, paddingBottom: 4 } },
            'Host: ' + String(data.error || 'unknown'))
        : null,
      h('div', {
        style: {
          display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden',
          marginTop: 4, backgroundColor: T.layer2,
        },
      }, groups.filter((group) => group.tokens > 0).map((group) =>
        h('div', {
          key: group.id,
          title: group.label + ': ' + String(group.tokens) + ' tokens',
          style: {
            width: (total > 0 ? (group.tokens / total) * 100 : 0).toFixed(2) + '%',
            backgroundColor: rowColor(group.id),
            height: '100%',
          },
        }))),
      groups.map((group) => h(GroupBlock, {
        key: group.id,
        group,
        data,
        total,
        expanded: expanded[group.id] === true,
        onToggle: () => setExpanded((current) => ({ ...current, [group.id]: current[group.id] !== true })),
      })),
      h('div', {
        style: {
          display: 'flex', alignItems: 'baseline', gap: 8,
          borderTop: '1px solid ' + T.border, marginTop: 4, paddingTop: 8,
          fontSize: 13, fontWeight: 600,
        },
      },
      h('span', { style: { flex: 1 } }, 'Total'),
      h('span', { style: { fontVariantNumeric: 'tabular-nums' } }, '~' + compact(total))),
      h('div', { style: { fontSize: 10, color: T.faint, paddingTop: 6, lineHeight: 1.45 } },
        native
          ? 'Totaux issus des projections contextPressure / contextBreakdown — identiques au compteur de contexte natif. Skills et MCP sont répartis dans les totaux « system » et « tools » du harness selon le poids réel de leurs entrées.'
          : 'Estimation à 4 caractères par token : aucun appel modèle n’a encore été mesuré pour cette conversation.'),
      // PTC mode only: the catalogue is prompt text, not a tool row.
      data !== null && data.details?.toolSections?.active === true
        ? h('div', { style: { fontSize: 10, color: T.faint, paddingTop: 4, lineHeight: 1.45 } },
            'Mode PTC : le catalogue d’outils part dans le message système (section tools:sdk), compté dans System prompt ; le canal tools ne porte que run_code. Ces lignes suivent le compteur de contexte natif.')
        : null)
    }

    /** Nothing this plugin renders may take the surrounding conversation down. */
    class Boundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false }
      }

      static getDerivedStateFromError() {
        return { failed: true }
      }

      componentDidCatch() {
        /* stay silent: the composer must keep working */
      }

      render() {
        if (this.state.failed) return null
        return this.props.children
      }
    }

    function TokenEstimator(props) {
      const [open, setOpen] = useState(false)
      const [data, setData] = useState(null)
      const wrapRef = useRef(null)
      const draftRef = useRef('')
      const requestRef = useRef(0)
      const timerRef = useRef(0)
      const digestRef = useRef('')

      const session = typeof props?.sessionId === 'string' ? props.sessionId : undefined

      const fetchEstimate = useCallback((text) => {
        const id = ++requestRef.current
        // No Session id on this seat means a brand-new conversation: ask for the
        // assembled estimate rather than another conversation's measurements.
        const scope = session === undefined ? '&fresh=1' : '&session=' + encodeURIComponent(session)
        fetch(ENDPOINT + '?text=' + encodeURIComponent(text) + scope, { credentials: 'same-origin' })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error('HTTP ' + response.status))))
          .then((payload) => {
            if (id !== requestRef.current) return
            // Identical payload -> no state write -> no re-render. The MCP chip
            // that shares this slot re-aligns itself on DOM mutations, so churn
            // here is what pushed it over the mode selector.
            const digest = JSON.stringify(payload)
            if (digest === digestRef.current) return
            digestRef.current = digest
            setData(payload)
          })
          .catch((error) => {
            if (id !== requestRef.current) return
            const digest = 'error:' + String(error?.message ?? error)
            if (digest === digestRef.current) return
            digestRef.current = digest
            setData({ ok: false, error: String(error?.message ?? error), groups: [], total: 0 })
          })
      }, [session])

      useEffect(() => {
        const tick = () => {
          if (typeof document !== 'undefined' && document.hidden === true) return
          const text = readDraft()
          if (text === draftRef.current) return
          draftRef.current = text
          if (timerRef.current !== 0) clearTimeout(timerRef.current)
          timerRef.current = setTimeout(() => fetchEstimate(text), 900)
        }
        tick()
        timerRef.current = setTimeout(() => fetchEstimate(''), 80)
        const interval = setInterval(tick, 800)
        // Heartbeat: an MCP switch or a new measurement must reach the label
        // without a page reload. The digest guard means an unchanged payload
        // causes no re-render at all.
        const heartbeat = setInterval(() => {
          if (typeof document !== 'undefined' && document.hidden === true) return
          fetchEstimate(draftRef.current)
        }, 2000)
        // A toggle is a click on the MCP chip/menu of dsh-mcp-companion: refetch
        // right after it, twice, to cover the state write and its HMR apply.
        const onDocumentDown = (event) => {
          const target = event?.target
          const inside = target !== null && target !== undefined && typeof target.closest === 'function'
            ? target.closest('.dsh-mcp-chip, .dsh-mcp-menu')
            : null
          if (inside === null) return
          setTimeout(() => fetchEstimate(draftRef.current), 400)
          setTimeout(() => fetchEstimate(draftRef.current), 1400)
        }
        const onFocus = () => fetchEstimate(draftRef.current)
        document.addEventListener('mousedown', onDocumentDown, true)
        window.addEventListener('focus', onFocus)
        return () => {
          clearInterval(interval)
          clearInterval(heartbeat)
          document.removeEventListener('mousedown', onDocumentDown, true)
          window.removeEventListener('focus', onFocus)
          if (timerRef.current !== 0) clearTimeout(timerRef.current)
        }
      }, [fetchEstimate])

      useEffect(() => {
        if (!open) return undefined
        fetchEstimate(draftRef.current)
        // Keep the panel current while it is open: a Host restart or a new
        // measurement must not leave stale numbers on screen.
        const refresh = setInterval(() => fetchEstimate(draftRef.current), 5000)
        const onDown = (event) => {
          if (wrapRef.current !== null && !wrapRef.current.contains(event.target)) setOpen(false)
        }
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
          clearInterval(refresh)
          document.removeEventListener('mousedown', onDown)
          document.removeEventListener('keydown', onKey)
        }
      }, [open, fetchEstimate])

      const total = data !== null && typeof data.total === 'number' ? data.total : 0
      const failed = data !== null && data.ok === false
      const label = data === null ? '…' : failed ? 'n/a' : compact(total)

      return h('div', { ref: wrapRef, style: { position: 'relative', display: 'inline-flex' } },
        h('button', {
          type: 'button',
          onClick: () => setOpen((value) => !value),
          'aria-expanded': open,
          'aria-label': 'Token estimate for the first message',
          title: 'Estimated tokens the next request will send',
          style: {
            display: 'inline-flex', alignItems: 'center', gap: 6,
            height: 24, padding: '0 8px', borderRadius: 999,
            border: '1px solid ' + T.border,
            backgroundColor: open ? T.layer2 : 'transparent',
            color: failed ? T.danger : T.muted,
            fontSize: 11, fontWeight: 500, cursor: 'pointer',
            fontVariantNumeric: 'tabular-nums', lineHeight: 1,
          },
        },
        h('svg', {
          viewBox: '0 0 16 16', width: 12, height: 12, 'aria-hidden': true,
          style: { display: 'block', flex: '0 0 auto' },
        },
        h('circle', { cx: 8, cy: 8, r: 6, fill: 'none', stroke: T.accent, strokeWidth: 1.6 }),
        h('path', { d: 'M8 4.6v6.8', stroke: T.accent, strokeWidth: 1.6, strokeLinecap: 'round' }),
        h('path', { d: 'M4.6 8h6.8', stroke: T.accent, strokeWidth: 1.6, strokeLinecap: 'round' })),
        h('span', { style: { minWidth: 46, textAlign: 'right', display: 'inline-block' } }, label + ' tok')),
        open ? h(Panel, { data }) : null)
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({
          name: 'conversation.hero.options',
          id: 'token-estimator',
          // Registered after the MCP chip (order 100): the chip paints itself
          // leftwards by its own width, so it must keep the leading position in
          // this group or it lands on top of the mode selector.
          order: 100,
          label: 'Token estimate',
        }, function TokenEstimatorEntry(props) {
          return h(Boundary, null, h(TokenEstimator, props))
        }))
      },
    }
}
        ].map((factory) => factory(require));
        // One plugin object for the whole page: the panel's own apply runs
        // first (it owns the sidebar row and the main page), then each
        // vendored client half decorates the page and registers its slot.
        return {
            NS: __panelPlugin.NS,
            inject: Array.from(new Set([
                ...(Array.isArray(__panelPlugin.inject) ? __panelPlugin.inject : []),
                ...__vendorPlugins.flatMap((plugin) => (plugin && Array.isArray(plugin.inject) ? plugin.inject : []))
            ])),
            apply(ctx) {
                __panelPlugin.apply(ctx);
                for (const plugin of __vendorPlugins) {
                    if (plugin === null || plugin === undefined || typeof plugin.apply !== "function") continue;
                    try {
                        plugin.apply(ctx);
                    } catch (error) {
                        try { console.error("[dsh-skill-mcp-panel] vendored client plugin failed", error); } catch { /* no console */ }
                    }
                }
            }
        };
    }
});
