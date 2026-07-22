# Task Stream (SSE) — 实时进度推送与刷新重连恢复

异步生成任务(事件抽取 / 分集 / 剧本 / 资产 / 分镜 / 图像)的状态变化通过
**Server-Sent Events (SSE)** 实时推送给前端,替代原先的定时轮询。前端每次(重)连都会先
收到一份数据库快照,因此**页面刷新、切页、断网重连都能自动恢复到当前真实状态**。

原有轮询端点(`GET /api/generation-tasks/:taskId`、`GET /api/agents/event/status/:taskId`、
`GET /api/episodes/:episodeId/image-generation-status` 等)仍保留,作为 SSE 不可用(如被企业
代理禁用)时的降级兜底。

## 端点

```
GET /api/projects/:projectId/tasks/stream
Accept: text/event-stream
```

- 未知 `projectId` 返回 `404`(标准 `{ code, message, data }` 错误体)。
- 连接建立后长期保持,服务器持续推送该 project 下的任务事件。
- 事件按 project 维度隔离,一个 project 的连接只会收到自己的任务事件。

## 事件类型

推送三种 SSE 事件(`event:` 字段区分):

### `snapshot` —— 每次(重)连建立时最先推送一次

```
event: snapshot
data: {"tasks":[ TaskEvent, ... ]}
```

`tasks` 包含该 project 下**所有活跃任务(pending / running)** 以及**最近 5 分钟内**完成或失败
的任务(`completed` / `failed`)。前端收到后应**用它整体重建/对齐**该 project 的任务状态,由此
补齐断连窗口内错过的所有变化。窗口大小见
`apps/server/services/task-stream-service.ts` 的 `RECOVERABLE_TERMINAL_WINDOW_MS`。

### `task` —— 任务状态发生变化时增量推送

```
event: task
id: <TaskEvent.updatedAt>
data: TaskEvent
```

一个任务的生命周期通常是 `running` → `completed`(或 `failed`)；可重试失败先进入
`retry_wait`，到达持久化退避时间后再次出现 `pending` → `running`；取消的任务进入 `cancelled`。

### `ping` —— 空闲保活(约每 15 秒)

```
event: ping
data:
```

前端可忽略,仅用于防止中间代理关闭空闲连接。

## TaskEvent 结构

`snapshot.tasks[]` 与 `task` 事件的 `data` 共用同一结构(定义见
`packages/tasks/task-event.ts`):

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `taskId` | string | 任务 ID(`generation_tasks.id`) |
| `projectId` | string | 所属项目 |
| `taskType` | string | `event_extraction` / `episode_planning` / `script_generation` / `asset_extraction` / `storyboard_generation` / `project_profile` / `image_generation` |
| `status` | string | `pending` / `running` / `retry_wait` / `completed` / `failed` / `cancelled` |
| `targetType` | string \| null | 生成目标类型(如图像任务的 character / scene / storyboard) |
| `targetId` | string \| null | 目标资源 ID |
| `episodeId` | string \| null | 关联分集(若有) |
| `storyboardId` | string \| null | 关联分镜(若有) |
| `retryCount` | number | 已重试次数 |
| `errorMessage` | string \| null | 失败原因(`status === 'failed'` 时) |
| `updatedAt` | string | ISO 时间戳,同时用作 `task` 事件的 SSE `id` |

## 前端对接:snapshot-on-connect 恢复模式

浏览器 `EventSource` 断线后会自动重连;服务器在**每次连接**开始都先推 `snapshot`。因此前端无需在
本地持久化 `taskId`——每次(重)连都从数据库真相重建状态即可:

```ts
function subscribeProjectTasks(projectId: string, onChange: (tasks: TaskEvent[]) => void) {
  const tasks = new Map<string, TaskEvent>()
  const es = new EventSource(`/api/projects/${projectId}/tasks/stream`)

  // 每次(重)连:用快照整体重置本地状态,补齐断连期间错过的变化
  es.addEventListener('snapshot', (e) => {
    tasks.clear()
    for (const t of JSON.parse(e.data).tasks as TaskEvent[]) tasks.set(t.taskId, t)
    onChange([...tasks.values()])
  })

  // 增量:单个任务状态变化
  es.addEventListener('task', (e) => {
    const t = JSON.parse(e.data) as TaskEvent
    tasks.set(t.taskId, t)
    onChange([...tasks.values()])
  })

  // ping 忽略;EventSource 断线自动重连,重连后会再次收到 snapshot
  return () => es.close()
}
```

页面刷新/切页时,组件重新挂载 → 新建 `EventSource` → 立即收到 `snapshot` → UI 恢复到「当前有哪些
任务在跑、跑到哪、哪个失败了」。刷新窗口内刚好完成/失败的任务,也会因落在「最近 5 分钟终态」里而
出现在快照中。

## 架构说明

- 事件由进程内的 `TaskWorker`(实现 `TaskEventBus`)发出:认领任务 `pending→running` 时,以及一次
  运行结算后(completed / failed / 重试转回 pending)。runner 不参与推送,保持「worker 管生命周期、
  runner 管终态写入」的边界。见 `packages/tasks/task-worker.ts`、`apps/server/routes/task-stream.ts`。
- 事件总线是**进程内**的,适用于当前单进程 MVP。多实例部署时需替换为 Redis Pub/Sub(或 libSQL →
  Postgres 后用 `LISTEN/NOTIFY`),与 `TaskScheduler` 预留 BullMQ 是同一条演进线。

## 重构演进边界

当前事件字段和状态以已实现代码为准。`docs/backend-refactor-plan.md` 规划的 `retry_wait`、`cancelled`、租约/心跳、Job 进度与跨进程事件尚未进入当前 SSE 契约；实施时需要同时更新 `TaskEvent`、snapshot 查询、本文和前端消费逻辑。

未来客户端以数据库派生状态为最终真相：重连仍先获取 snapshot，Job 进度由已持久化的子任务聚合而来，不依赖仅存在于内存的计数。多实例化后才将进程内总线替换为跨进程通道。
