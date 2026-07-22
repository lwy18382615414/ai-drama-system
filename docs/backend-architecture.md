# 后端架构梳理(小说 → 短剧)

> 本文是当前代码库后端的**整体现状综述**,聚焦"后端由哪些层组成、如何协作、数据如何流动"。
> 阶段范围与路线图见 `docs/phase-roadmap.md`;数据表字段级细节见 `docs/database-design.md`;
> API 契约见 `docs/api-design.md`;Agent 规范见 `docs/agent-workflow.md`;
> Provider 适配见 `docs/provider-adapter.md`;实时推送见 `docs/task-stream.md`;
> 形象一致性/形象版本见 `docs/image-consistency.md`。

## 1. 系统定位

把小说/大纲转换为可编辑的短剧生产资产,链路为:

```
小说章节 → 章节事件 → 分批规划(集) → 改编剧本 → 角色/场景/道具 → 分镜
        → 角色/场景参考图 + 分镜首帧图 → (视频/TTS/字幕/合成:设计冻结,暂停)
```

当前已落地范围:**Phase 1(叙事管线)+ Phase 2A–2C(图像生成)**。视频及之后的媒体合成为暂停区,
仅有设计文档(`docs/video-generation-design.md`),后端无可运行链路。

## 2. 技术栈

| 关注点 | 选型 |
|--------|------|
| 运行时/语言 | Node.js + TypeScript(ESM) |
| Web 框架 | Hono |
| 数据库 | SQLite(MVP),预留 PostgreSQL |
| ORM | Drizzle(`packages/database/schema.ts`,迁移在 `migrations/`) |
| 校验 | Zod(每个 Agent 输入/输出都有 schema) |
| 异步任务 | 数据库表驱动的进程内 `TaskWorker`,预留 BullMQ |
| 实时推送 | SSE(每项目一条流),回退为轮询 |
| 存储 | 本地 `data/static`,经 `/static` 静态服务;预留 S3/R2/COS |
| AI 集成 | Provider Adapter 模式(文本 / 图像),运行时真实且必需,配置缺失即启动失败 |

## 3. 代码结构(monorepo)

```
apps/
  server/                     # Hono API 服务(组合根 + 路由 + 服务层)
    app.ts                    # createApp():装配 DB、Provider、TaskWorker、路由、静态服务
    tasks.ts                  # createTaskWorker():按 taskType 注册处理器
    routes/                   # HTTP 路由(薄控制器,不直接调 AI)
    services/                 # 业务服务层(事务、编排、入队)
  web/                        # Vue 3 / Vite / Naive UI 工作台(前端,不在本文重点)
packages/
  agents/                     # 各 Agent:schema + prompt + context + service(runner)
    event / episode-planner / script / extract / storyboard / project-profile
  providers/                  # Provider Adapter:text-provider / image-provider + OpenAI 兼容实现
  tasks/                      # TaskWorker(调度/重试/恢复)+ TaskEventBus(SSE 事件)
  database/                   # Drizzle schema、client、迁移、appearance-resolver(形象解析)
docs/                         # 设计与契约文档
```

## 4. 分层架构

请求自上而下穿过 5 层,**严格禁止路由直接调用 AI Provider**(见 `CLAUDE.md` 开发规则):

```
HTTP 路由 (apps/server/routes)         薄控制器:解析/校验入参、调用服务、格式化响应
        │
业务服务层 (apps/server/services)      事务写库、编排、创建 generation_tasks 并 announce/notify
        │
任务系统 (packages/tasks)              TaskWorker 认领任务 → 按 taskType 分派到 Agent runner
        │
Agent / Provider (packages/agents,    runner 组织 prompt/context,调用 Provider,校验产出,
                  packages/providers)  写回业务表 + agent_runs 日志,自负 task 终态
        │
数据库 (packages/database)             Drizzle over SQLite,统一 schema 与迁移
```

关键约束(源自 `CLAUDE.md`):Agent 产出必须是结构化 JSON 且有 Zod schema;每次长耗时生成必须建 task 记录;
Agent run 必须落 `agent_runs` 日志;不得硬编码 API Key。

## 5. 组合根与启动流程(`apps/server/app.ts`)

`createApp()` 是唯一装配点:

1. `createDatabase()` + `initializeDatabase()` 打开 SQLite 并跑迁移。
2. `createTextProvider()` / `createImageProvider()` 从环境变量构造 Provider,**缺配即抛错**(fail-fast)。
   - 图像 Provider 会按模型名自动选择传输方式与尺寸模式:
     - Gemini 系图像模型(nano-banana / `*flash-image*`)走 chat/completions(`OpenAICompatibleChatImageProvider`);其余走 images 端点。
     - Seedream/Seededit 用分辨率档位(`2K`)而非像素;其余用像素。
     - 均可用 `IMAGE_PROVIDER_TRANSPORT` / `IMAGE_PROVIDER_SIZE_MODE` / `IMAGE_PROVIDER_SIZE_TIER` 覆盖。
3. `createTaskWorker({db, provider, imageProvider})` 构建 worker 并 `worker.start()`(启动即恢复未完成任务)。
4. 装配中间件与路由:`/api/*` CORS、`/static/*` 静态服务、`/health`,以及各路由模块。
   worker 同时作为 `scheduler`(入队通知)和 `bus`(SSE 事件源)注入到路由。

必需环境变量:`TEXT_PROVIDER_API_KEY/BASE_URL`(+可选 `_MODEL`)、`IMAGE_PROVIDER_API_KEY/BASE_URL`(+可选 `_MODEL` 等);
可选 `DATABASE_URL`、`STATIC_DIR`、`WEB_ORIGIN`、`TASK_WORKER_CONCURRENCY`。

## 6. 数据模型

Drizzle schema 集中在 `packages/database/schema.ts`,分为四组:

**叙事主链**
- `projects` → `novel_chapters` → `novel_events`
- `batches`(一段连续章节 → 一段连续集号)→ `episodes` ←→ `episode_event_links`(集与源事件的有序连接)
- `scripts`(每集一份,`episode_id` 唯一)
- `storyboards`(镜头级,`(episode_id, shot_no)` 唯一;含 `image_prompt`/`video_prompt` 规划字段)

**生产资产(项目级复用 + 按集连接)**
- `characters` / `scenes` / `props`(项目内按 name 唯一)
- `episode_character_links` / `episode_scene_links` / `episode_prop_links`
- `character_appearance_versions`:角色**形象版本**(见 §9),自动版本挂 `source_episode_id`、手动版本用 `effective_from_episode_no`,二者 XOR

**通用基础设施**
- `agent_runs`:每次 Agent 调用的输入/输出/状态/错误日志(合规必填)
- `generation_tasks`:异步任务表(`task_type`、`status`、`retry_count`、多态 `target_type/target_id`、`input_json/output_json`)
- `assets`:生成产物溯源(`asset_type`、`target_type/target_id`、`url`、`provider/model/prompt`),与 task 关联

命名/编号不变量由唯一索引保证(如 `batches (project, batch_no)`、`episodes (project, episode_no)`、
`storyboards (episode, shot_no)`),使分批重规划的全局重编号安全。

## 7. 任务系统(`packages/tasks/task-worker.ts`)

进程内、数据库驱动的 worker,设计为将来可平替 BullMQ(保持 `TaskScheduler` 接口不变)。

- **入队即持久化**:服务层只写一行 `generation_tasks`(pending)并 `announce()`(推给 SSE)+ `notify()`(催 worker)。执行所需的一切都在 `input_json` 里,内存中不留状态。
- **认领**:`claimNext()` 用条件 `UPDATE ... WHERE status='pending'` 原子地 pending→running,竞态失败自动取下一条。
- **并发**:默认 `concurrency=2`(`TASK_WORKER_CONCURRENCY` 可调)——图像批量吞吐的主要旋钮,因为每帧 Seedream 需数十秒。
- **分派**:按 `task_type` 调对应处理器(`apps/server/tasks.ts` 注册),处理器把 `input_json` 反序列化后交给 Agent runner / 图像执行器。
- **重试**:runner 自负终态;若留在 `failed` 且 `retry_count < maxRetries(默认2)`,`maybeRetry()` 重新置回 pending。
- **崩溃恢复**:`start()` 时 `recover()` 把上次进程遗留的 `running` 全部重置回 `pending` 重新分派。
- **安全轮询**:30s 定时 `drain()` 兜底漏掉的 `notify()` 与掉队任务;`unref()` 避免拖住进程退出。

已注册的 `task_type`:`event_extraction`、`episode_planning`、`script_generation`、`asset_extraction`、
`storyboard_generation`、`project_profile`、`image_generation`。

## 8. Agent 编排(`packages/agents`)

每个 Agent 是一个自包含模块,统一结构:`schema.ts`(Zod I/O)+ `prompt.ts`(system/user 提示词)+
`context.ts`(从库里组装上下文)+ `service.ts`(`run*Agent()` runner)。

runner 的统一职责:建/更新 `agent_runs` 日志 → 组装 context 与 prompt → 调 `StructuredTextProvider` →
用 Zod 校验产出 → 事务写回业务表 → 置该 `generation_tasks` 终态。**runner 从不抛到 worker**(自己吞并标 failed)。

| Agent | 变换 | 说明 |
|-------|------|------|
| ProjectProfileAgent | 小说元信息 → 项目画像 | 从小说创建项目时推断题材/风格等 |
| EventAgent | `novel_chapters` → `novel_events` | 抽取结构化源事件 |
| EpisodePlannerAgent | `novel_events` → `batches`+`episodes`+`links` | **分批、可重跑**:规划下一批 / 重规划某批(作用域内销毁重建 + 全局集号重编号);章节未抽取事件则 422 拒绝 |
| ScriptAgent | 集 + 连接的事件 → `scripts` | 改编为短剧剧本,存结构化 JSON |
| ExtractAgent | `scripts` → `characters/scenes/props` | 抽取并复用项目级资产、回连到集;可产出角色形象版本 |
| StoryboardAgent | 剧本 + 资产 → `storyboards` | 生成镜头级分镜,含 `image_prompt`/`video_prompt` 规划字段(不触发媒体生成) |

## 9. 图像生成与形象一致性(Phase 2A–2C)

图像走与叙事 Agent 相同的 task/asset 生命周期,但处理器是 `executeImageGeneration`(`image-generation-service.ts`)而非文本 Agent。

统一流程:
```
目标(角色/场景/分镜镜头) → 生成请求(单目标 或 整集批量)
  → generation_tasks(image_generation) → ImageProvider → 下载写入 STATIC_DIR
  → assets 溯源记录 → 回写目标 URL 字段
```

激活的目标与 URL 字段:
- `character_reference_image` → `characters.reference_image_url`
- `scene_reference_image` → `scenes.reference_image_url`
- `storyboard_first_frame` → `storyboards.first_frame_image_url`

**整集批量**路由遍历该集连接的目标,已有图的跳过(除非 `force=true`),返回逐目标汇总。

**角色形象版本(image-consistency)**:角色形象会随剧情变化,`character_appearance_versions` + `appearance-resolver.ts` 解决"某集该用哪版形象":
- 自动版本挂在抽取它的 `source_episode_id`,其**生效集号在查询时 join `episodes` 动态求得**——这样分批重规划的重编号被自动跟随。
- 手动版本用显式 `effective_from_episode_no`(与 `source_episode_id` 为 XOR,服务层强制)。
- `resolveCharacterAppearances()`:给定集号,取"生效集号 ≤ 该集"的最新版本,回退到角色基础行;批量两查、无 N+1。
- ExtractAgent 产出新形象版本后,worker 在 `asset_extraction` 处理器里**尽力预生成**该版本参考图(`ensureCharacterAppearanceVersionImages`),失败不阻断;懒路径(`ensureShotReferenceImages`)会在生成镜头首帧前补齐缺失。

## 10. 实时任务流(SSE)

`TaskWorker` 同时实现 `TaskEventBus`,在任务被认领(running)、结算(completed/failed/requeued)、
以及入队 announce 时向该项目的订阅者广播 `TaskEvent`。

- 主通道:`GET /api/projects/:projectId/tasks/stream`(SSE)。
- **重连恢复**:连接即先发 `snapshot`(所有活动任务 + 最近 5 分钟已结算任务,来自 `listRecoverableTasks`),客户端据此与库对齐,无需持久化 `taskId`。
- 回退:逐任务轮询 `GET /api/generation-tasks/:taskId` 及各 Agent 状态路由。
- 事件总线是进程内的(单进程 MVP);多进程部署时替换为 Redis Pub/Sub 或 Postgres `LISTEN/NOTIFY`——与 `TaskScheduler → BullMQ` 同一演进线。

## 11. Provider Adapter(`packages/providers`)

两类适配器,上层只传"意图",适配器负责翻译到具体模型 API:
- `StructuredTextProvider` → `OpenAICompatibleTextProvider`(任意 OpenAI 兼容 chat completion 端点)。
- `ImageProvider` → `OpenAICompatibleImageProvider`(images 端点)/ `OpenAICompatibleChatImageProvider`(chat 端点,供 Gemini 系图像模型)。生成图写入 `STATIC_DIR`,记录 `assets` 溯源,**绝不存 Provider 的临时 URL**。
- `MockStructuredTextProvider` / `MockImageProvider` 仅作测试替身,经 DI 注入,不接入 `createApp()`。

## 12. API 面(现状)

以下为已实现路由(方法 + 路径),按域归类:

**项目 / 小说导入**
- `GET/POST /api/projects`、`GET/PATCH/DELETE /api/projects/:projectId`
- `POST /api/projects/from-novel`、`POST /api/projects/:projectId/generate-image`
- `POST /api/novel/preview`、`/api/novel/preview-file`
- `GET /api/projects/:projectId/chapters`、`POST .../chapters/import`、`POST .../chapters/delete`

**事件 / 分批规划 / 剧本**
- `POST /extract`、`/extract-batch`、`GET /status/:taskId`、`GET /result/:chapterId`(事件抽取)
- `GET /api/projects/:projectId/batches`、`POST .../batches`、`POST .../batches/:batchId/replan`
- `GET /api/projects/:projectId/episodes`、`GET /api/episodes/:episodeId/events`
- `POST /api/episodes/:episodeId/generate-script`、`GET /api/episodes/:episodeId/script`、`PATCH /api/scripts/:scriptId`

**资产 / 分镜**
- `POST /api/episodes/:episodeId/extract-assets`、`GET /api/episodes/:episodeId/assets`
- `GET /api/projects/:projectId/{characters,scenes,props,assets}`、`GET /api/{characters,scenes,storyboards}/:id`
- `POST /api/episodes/:episodeId/generate-storyboards`、`GET /api/episodes/:episodeId/storyboards`、`PATCH /api/storyboards/:storyboardId`

**图像生成**
- 单目标:`POST /api/{characters/:characterId,scenes/:sceneId}/generate-image`、`POST /api/storyboards/:storyboardId/generate-first-frame`
- 整集批量:`POST /api/episodes/:episodeId/generate-{character-images,scene-images,storyboard-first-frames,all-images}`
- 进度:`GET /api/episodes/:episodeId/image-generation-status`

**形象版本**
- `GET /api/characters/:characterId/appearance-versions`、`POST /api/characters/:characterId/appearance-versions`
- `PATCH/DELETE /api/appearance-versions/:versionId`、`POST /api/appearance-versions/:versionId/generate-image`

**基础设施**
- `GET /health`、`GET /api/projects/:projectId/tasks/stream`(SSE)、`GET /api/generation-tasks/:taskId`

## 13. 边界与暂停区

以下**未实现,不得在未获明确指示时动工**(见 `CLAUDE.md`、`phase-roadmap.md`):
视频生成、TTS、字幕、FFmpeg 合成、成片导出、图像/视频提示词精修 Agent、对象存储集成。

数据库中 `storyboards.video_prompt`(NOT NULL 规划字段)、`storyboards.video_url` /
`composed_video_url` / `tts_audio_url` / `subtitle_url`、`episodes.video_url` 等仅为占位,恒为 null,
**不代表**上述链路已激活。视频阶段的完整设计见 `docs/video-generation-design.md`(design only / paused)。
