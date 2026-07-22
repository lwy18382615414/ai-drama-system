# @ai-drama/web

「小说 → 短剧」制作工作台前端。Vue 3 + Vite + Naive UI + TanStack Query（`@tanstack/vue-query`）+ Pinia。

自包含 package（独立 `package.json` / `node_modules` / `tsconfig`），与后端 `tsx` 工具链隔离。

> 当前为**骨架**：目录结构、路由接线、布局外壳、主题接入已就绪；页面内容与 composables/components 为待实现的 stub。

## 开发

```bash
pnpm install
pnpm dev        # http://localhost:5173，代理 /api 与 /static → localhost:3000
pnpm build      # vue-tsc 类型检查 + vite 打包
pnpm typecheck
```

后端地址可用 `VITE_BACKEND_ORIGIN` 覆盖（见 `.env.example`）。

## 结构

```
src/
  api/          REST 客户端 + query key 工厂（对应 frontend-design.md §3.1）
  components/   PipelineBoard / TaskDrawer / ReplanWizard / StaleBanner 等（§9，stub）
  composables/  useProjectTaskStream / usePipelineStatus / useJob / useBatchConfirm（stub）
  layouts/      WorkbenchLayout（项目外壳）、EpisodeWorkspaceLayout（集工作区外壳）
  plugins/      vue-query（QueryClient）
  router/       路由树（§4：项目 → 工作台子路由 → 集工作区 tab 子路由）
  stores/       Pinia，仅 UI 状态
  theme/        Design tokens + Naive UI themeOverrides
  views/        页面（骨架占位）
```

设计规格权威来源见 `design_handoff_novel_workbench/`（`frontend-design.md` + `.dc.html` 原型，仅供参考，不参与构建）。
