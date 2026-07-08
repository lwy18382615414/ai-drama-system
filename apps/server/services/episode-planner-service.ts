import { asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod/v4";
import type {
  DatabaseClient,
  NovelChapter,
} from "../../../packages/database/index.js";
import {
  batches,
  episodeEventLinks,
  episodes,
  generationTasks,
  novelChapters,
  novelEvents,
  projects,
} from "../../../packages/database/index.js";
import {
  EpisodePlannerOptionsSchema,
  type EpisodePlannerInput,
} from "../../../packages/agents/episode-planner-agent/index.js";
import type { StructuredTextProvider } from "../../../packages/providers/index.js";
import type { TaskScheduler } from "../../../packages/tasks/index.js";

export const CreateBatchRequestSchema = z
  .object({
    chapterEndNo: z.number().int().positive().optional(),
    chapter_end_no: z.number().int().positive().optional(),
    options: EpisodePlannerOptionsSchema.optional(),
  })
  .transform((request) => ({
    chapterEndNo: request.chapterEndNo ?? request.chapter_end_no,
    options: request.options,
  }));

export type CreateBatchRequest = z.infer<typeof CreateBatchRequestSchema>;

export class EpisodePlannerServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly data: unknown = null,
  ) {
    super(message);
  }
}

export interface EpisodePlannerServiceDeps {
  db: DatabaseClient;
  provider: StructuredTextProvider;
  scheduler: TaskScheduler;
}

/**
 * Plan the next batch: a contiguous chapter range starting right after the last
 * batch's last chapter, planned into episodes appended after the last batch's episodes.
 */
export async function startBatchPlanning(
  deps: EpisodePlannerServiceDeps,
  projectId: string,
  request: CreateBatchRequest,
) {
  const [project] = await deps.db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    throw new EpisodePlannerServiceError(
      `Project not found: ${projectId}`,
      404,
    );
  }

  const chapters = await listChaptersOrdered(deps.db, projectId);

  if (chapters.length === 0) {
    throw new EpisodePlannerServiceError(
      `Project has no novel chapters: ${projectId}`,
      400,
    );
  }

  const projectBatches = await listBatches(deps.db, projectId);
  const lastBatch = projectBatches.at(-1);

  const chapterStartNo = (lastBatch?.chapterEndNo ?? 0) + 1;
  const maxChapterNo = chapters.at(-1)!.chapterNo;

  if (chapterStartNo > maxChapterNo) {
    throw new EpisodePlannerServiceError(
      "All chapters are already planned into batches",
      422,
    );
  }

  const chapterEndNo = request.chapterEndNo ?? maxChapterNo;

  if (chapterEndNo < chapterStartNo || chapterEndNo > maxChapterNo) {
    throw new EpisodePlannerServiceError(
      `chapterEndNo must be within [${chapterStartNo}, ${maxChapterNo}]`,
      422,
    );
  }

  const selectedChapters = chapters.filter(
    (chapter) =>
      chapter.chapterNo >= chapterStartNo && chapter.chapterNo <= chapterEndNo,
  );

  assertChapterRangeContiguous(selectedChapters, chapterStartNo, chapterEndNo);
  assertChaptersExtracted(selectedChapters);

  const episodeStartNo = (lastBatch?.episodeEndNo ?? 0) + 1;
  const batchNo = (lastBatch?.batchNo ?? 0) + 1;
  const batchId = nanoid();
  const now = new Date().toISOString();

  await deps.db.insert(batches).values({
    id: batchId,
    projectId,
    batchNo,
    chapterStartNo,
    chapterEndNo,
    // episode range is provisional until the planner produces episodes; end = start - 1
    // signals "no episodes yet" and is corrected in the agent success tx.
    episodeStartNo,
    episodeEndNo: episodeStartNo - 1,
    status: "planned",
    createdAt: now,
    updatedAt: now,
  });

  const input = await buildEpisodePlannerInput(
    deps.db,
    project,
    selectedChapters,
    {
      batchId,
      mode: "create",
      episodeStartNo,
      options: request.options,
    },
  );

  return enqueuePlanningTask(deps, projectId, batchId, input);
}

/**
 * Re-plan an existing batch (scoped destructive): the batch's episode orchestration is
 * deleted and rebuilt from its chapter events inside the agent success tx, so a provider
 * failure leaves the old episodes intact.
 */
export async function startBatchReplan(
  deps: EpisodePlannerServiceDeps,
  projectId: string,
  batchId: string,
) {
  const [project] = await deps.db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    throw new EpisodePlannerServiceError(
      `Project not found: ${projectId}`,
      404,
    );
  }

  const [batch] = await deps.db
    .select()
    .from(batches)
    .where(eq(batches.id, batchId))
    .limit(1);

  if (!batch || batch.projectId !== projectId) {
    throw new EpisodePlannerServiceError(`Batch not found: ${batchId}`, 404);
  }

  const chapters = await listChaptersOrdered(deps.db, projectId);
  const selectedChapters = chapters.filter(
    (chapter) =>
      chapter.chapterNo >= batch.chapterStartNo &&
      chapter.chapterNo <= batch.chapterEndNo,
  );

  assertChapterRangeContiguous(
    selectedChapters,
    batch.chapterStartNo,
    batch.chapterEndNo,
  );
  assertChaptersExtracted(selectedChapters);

  const now = new Date().toISOString();
  await deps.db
    .update(batches)
    .set({ status: "replanning", updatedAt: now })
    .where(eq(batches.id, batchId));

  const input = await buildEpisodePlannerInput(
    deps.db,
    project,
    selectedChapters,
    {
      batchId,
      mode: "replan",
      episodeStartNo: batch.episodeStartNo,
      options: undefined,
    },
  );

  return enqueuePlanningTask(deps, projectId, batchId, input);
}

export async function listBatches(db: DatabaseClient, projectId: string) {
  return db
    .select()
    .from(batches)
    .where(eq(batches.projectId, projectId))
    .orderBy(asc(batches.batchNo));
}

export async function getProjectBatches(db: DatabaseClient, projectId: string) {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    return null;
  }

  return listBatches(db, projectId);
}

export async function getProjectEpisodes(
  db: DatabaseClient,
  projectId: string,
) {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    return null;
  }

  return db
    .select()
    .from(episodes)
    .where(eq(episodes.projectId, projectId))
    .orderBy(episodes.episodeNo);
}

export async function getEpisodeEvents(db: DatabaseClient, episodeId: string) {
  const [episode] = await db
    .select()
    .from(episodes)
    .where(eq(episodes.id, episodeId))
    .limit(1);

  if (!episode) {
    return null;
  }

  const events = await db
    .select({
      linkId: episodeEventLinks.id,
      projectId: episodeEventLinks.projectId,
      episodeId: episodeEventLinks.episodeId,
      novelEventId: episodeEventLinks.novelEventId,
      orderInEpisode: episodeEventLinks.orderInEpisode,
      usageType: episodeEventLinks.usageType,
      event: novelEvents,
    })
    .from(episodeEventLinks)
    .innerJoin(novelEvents, eq(episodeEventLinks.novelEventId, novelEvents.id))
    .where(eq(episodeEventLinks.episodeId, episodeId))
    .orderBy(episodeEventLinks.orderInEpisode);

  return { episode, events };
}

async function enqueuePlanningTask(
  deps: EpisodePlannerServiceDeps,
  projectId: string,
  batchId: string,
  input: EpisodePlannerInput,
) {
  const taskId = nanoid();
  const now = new Date().toISOString();

  await deps.db.insert(generationTasks).values({
    id: taskId,
    projectId,
    episodeId: null,
    storyboardId: null,
    taskType: "episode_planning",
    provider: deps.provider.name,
    model: input.options?.model ?? deps.provider.model,
    inputJson: JSON.stringify({ ...input, taskId }),
    outputJson: null,
    status: "pending",
    retryCount: 0,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  void deps.scheduler.announce(taskId);
  deps.scheduler.notify();

  return { taskId, batchId, status: "pending" as const };
}

interface BuildInputOptions {
  batchId: string;
  mode: "create" | "replan";
  episodeStartNo: number;
  options: CreateBatchRequest["options"];
}

async function buildEpisodePlannerInput(
  db: DatabaseClient,
  project: typeof projects.$inferSelect,
  selectedChapters: NovelChapter[],
  buildOptions: BuildInputOptions,
): Promise<EpisodePlannerInput> {
  const chapterById = new Map(
    selectedChapters.map((chapter) => [chapter.id, chapter]),
  );
  const chapterIds = selectedChapters.map((chapter) => chapter.id);
  const selectedChapterIds = new Set(chapterIds);

  const projectEvents = await db
    .select()
    .from(novelEvents)
    .where(eq(novelEvents.projectId, project.id))
    .orderBy(novelEvents.eventNo);

  const sourceEvents = projectEvents
    .filter((event) => selectedChapterIds.has(event.chapterId))
    .map((event) => {
      const chapter = chapterById.get(event.chapterId);

      if (!chapter) {
        throw new EpisodePlannerServiceError(
          `Novel event references an unknown chapter: ${event.id}`,
          400,
        );
      }

      return {
        id: event.id,
        projectId: event.projectId,
        chapterId: event.chapterId,
        chapterNo: chapter.chapterNo,
        eventNo: event.eventNo,
        eventType: event.eventType,
        summary: event.summary,
        detail: event.detail,
        characters: parseCharacters(event.charactersJson),
        location: event.location,
        timeHint: event.timeHint,
        emotionTone: event.emotionTone,
        conflictLevel: event.conflictLevel,
        importance: event.importance,
      };
    })
    .sort((a, b) => a.chapterNo - b.chapterNo || a.eventNo - b.eventNo);

  if (sourceEvents.length === 0) {
    throw new EpisodePlannerServiceError(
      "Episode planning requires at least one novel event",
      422,
    );
  }

  return {
    projectId: project.id,
    batchId: buildOptions.batchId,
    mode: buildOptions.mode,
    episodeStartNo: buildOptions.episodeStartNo,
    chapterIds,
    novelEvents: sourceEvents,
    styleConfig: {
      title: project.title,
      genre: project.genre,
      targetPlatform: project.targetPlatform,
      visualStyle: project.visualStyle,
      episodeDuration: project.episodeDuration,
    },
    options: buildOptions.options,
  };
}

async function listChaptersOrdered(db: DatabaseClient, projectId: string) {
  return db
    .select()
    .from(novelChapters)
    .where(eq(novelChapters.projectId, projectId))
    .orderBy(asc(novelChapters.chapterNo));
}

/** The selected chapters must exactly cover [startNo, endNo] with no gaps. */
function assertChapterRangeContiguous(
  chapters: NovelChapter[],
  startNo: number,
  endNo: number,
) {
  const expectedCount = endNo - startNo + 1;
  const chapterNos = new Set(chapters.map((chapter) => chapter.chapterNo));

  for (let no = startNo; no <= endNo; no += 1) {
    if (!chapterNos.has(no)) {
      throw new EpisodePlannerServiceError(
        `Chapter range is not contiguous: missing chapter ${no}`,
        422,
      );
    }
  }

  if (chapters.length !== expectedCount) {
    throw new EpisodePlannerServiceError(
      `Chapter range is not contiguous: expected ${expectedCount} chapters`,
      422,
    );
  }
}

/**
 * Guard the true silent-data-loss bug: only chapters IN this batch must be extracted.
 * Un-extracted chapters elsewhere in the project are fine — they belong to future batches.
 */
function assertChaptersExtracted(chapters: NovelChapter[]) {
  const pending = chapters.filter(
    (chapter) => chapter.status !== "event_extracted",
  );

  if (pending.length > 0) {
    const chapterNos = pending.map((chapter) => chapter.chapterNo);
    throw new EpisodePlannerServiceError(
      `以下章节尚未提取事件，无法规划：第 ${chapterNos.join("、")} 章`,
      422,
      { chapterNos },
    );
  }
}

function parseCharacters(charactersJson: string) {
  try {
    const parsed = JSON.parse(charactersJson);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
