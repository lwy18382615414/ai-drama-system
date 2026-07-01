/**
 * Static mock fixtures for the Phase 1 skeleton. No backend calls anywhere —
 * these arrays stand in for the API responses the workbench will eventually use.
 */
import type {
  Chapter,
  Character,
  Episode,
  GenerationTask,
  NovelEvent,
  Project,
  Prop,
  Scene,
  Script,
  Storyboard,
} from '@/types'

export const projects: Project[] = [
  {
    id: 'p_moonlit',
    title: '月照长安',
    description: '一部改编自网络小说的古装权谋短剧，聚焦宫廷斗争与家国情仇。',
    genre: '古装权谋',
    targetPlatform: '竖屏短视频',
    visualStyle: '写实电影感',
    episodeDuration: 90,
    status: 'generating',
    createdAt: '2026-05-12T09:00:00.000Z',
    updatedAt: '2026-06-28T14:22:00.000Z',
    episodeCount: 12,
    storyboardCount: 148,
    characterCount: 9,
    sceneCount: 14,
    imageCompletion: 62,
  },
  {
    id: 'p_neon',
    title: '霓虹追凶',
    description: '赛博朋克都市悬疑，一名侦探在数据洪流中追查连环失踪案。',
    genre: '悬疑科幻',
    targetPlatform: '竖屏短视频',
    visualStyle: '赛博霓虹',
    episodeDuration: 75,
    status: 'draft',
    createdAt: '2026-06-01T10:30:00.000Z',
    updatedAt: '2026-06-20T08:10:00.000Z',
    episodeCount: 6,
    storyboardCount: 0,
    characterCount: 5,
    sceneCount: 7,
    imageCompletion: 0,
  },
  {
    id: 'p_campus',
    title: '夏日回声',
    description: '青春校园治愈系，一段关于错过与重逢的温柔故事。',
    genre: '青春校园',
    targetPlatform: '竖屏短视频',
    visualStyle: '清新日系',
    episodeDuration: 60,
    status: 'done',
    createdAt: '2026-03-18T12:00:00.000Z',
    updatedAt: '2026-05-30T16:45:00.000Z',
    episodeCount: 20,
    storyboardCount: 260,
    characterCount: 11,
    sceneCount: 18,
    imageCompletion: 100,
  },
]

export const chapters: Chapter[] = [
  { id: 'c1', projectId: 'p_moonlit', chapterNo: 1, title: '入宫', wordCount: 4200, eventCount: 6, status: 'done' },
  { id: 'c2', projectId: 'p_moonlit', chapterNo: 2, title: '初见', wordCount: 3850, eventCount: 5, status: 'done' },
  { id: 'c3', projectId: 'p_moonlit', chapterNo: 3, title: '暗流', wordCount: 5100, eventCount: 7, status: 'generating' },
  { id: 'c4', projectId: 'p_moonlit', chapterNo: 4, title: '夜宴', wordCount: 4600, eventCount: 0, status: 'draft' },
]

export const events: NovelEvent[] = [
  { id: 'e1', chapterId: 'c1', order: 1, summary: '苏晚被选入宫，踏入朱红宫门。', characters: ['苏晚'], location: '宫门' },
  { id: 'e2', chapterId: 'c1', order: 2, summary: '掌事嬷嬷训诫新人，立下宫规。', characters: ['苏晚', '刘嬷嬷'], location: '掖庭' },
  { id: 'e3', chapterId: 'c1', order: 3, summary: '苏晚夜里偷听到两名宫女密谈。', characters: ['苏晚'], location: '回廊' },
  { id: 'e4', chapterId: 'c2', order: 1, summary: '御花园偶遇，苏晚与三皇子初次照面。', characters: ['苏晚', '萧景琰'], location: '御花园' },
  { id: 'e5', chapterId: 'c2', order: 2, summary: '三皇子暗中记下苏晚的名字。', characters: ['萧景琰'], location: '御花园' },
]

export const episodes: Episode[] = [
  { id: 'ep1', projectId: 'p_moonlit', episodeNo: 1, title: '朱门深似海', synopsis: '苏晚初入深宫，见识宫廷规矩与暗涌人心。', status: 'done', linkedEventCount: 6, hasScript: true, storyboardCount: 14 },
  { id: 'ep2', projectId: 'p_moonlit', episodeNo: 2, title: '御花园惊鸿', synopsis: '一场偶遇，命运的齿轮悄然转动。', status: 'done', linkedEventCount: 5, hasScript: true, storyboardCount: 12 },
  { id: 'ep3', projectId: 'p_moonlit', episodeNo: 3, title: '暗夜低语', synopsis: '密谈被听见，一张无形的网正在收拢。', status: 'generating', linkedEventCount: 7, hasScript: true, storyboardCount: 0 },
  { id: 'ep4', projectId: 'p_moonlit', episodeNo: 4, title: '夜宴风波', synopsis: '宫宴之上，杯盏交错间杀机四伏。', status: 'draft', linkedEventCount: 0, hasScript: false, storyboardCount: 0 },
]

export const script: Script = {
  id: 's_ep1',
  episodeId: 'ep1',
  version: 3,
  status: 'done',
  content: `【第一集 · 朱门深似海】

场景 1 — 日 · 外 · 宫门
（朱红宫门缓缓开启，晨光洒落。苏晚提着包袱，抬头望着高耸的宫墙。）

苏晚（画外音）：这一步踏进去，便再没有回头路了。

刘嬷嬷：（严厉）新来的都记好了，在这宫里，多看少说，方能长久。

场景 2 — 日 · 内 · 掖庭
（一排新入宫的女子低头肃立，刘嬷嬷来回踱步。）

刘嬷嬷：规矩，是这宫里唯一的活路。

（苏晚微微抬眼，眸光沉静。）
`,
}

export const characters: Character[] = [
  { id: 'ch1', projectId: 'p_moonlit', name: '苏晚', role: '女主', appearance: '清秀端庄，一袭素色宫装，眉眼间藏着坚韧。', personality: '外柔内刚，聪慧隐忍。', referenceImageUrl: 'done' },
  { id: 'ch2', projectId: 'p_moonlit', name: '萧景琰', role: '男主', appearance: '身姿挺拔，玄色蟒袍，剑眉星目。', personality: '沉稳深谋，外冷内热。', referenceImageUrl: 'done' },
  { id: 'ch3', projectId: 'p_moonlit', name: '刘嬷嬷', role: '配角', appearance: '年过五旬，衣着规整，神情严肃。', personality: '刻板守旧，恪守宫规。', referenceImageUrl: null },
  { id: 'ch4', projectId: 'p_moonlit', name: '皇后', role: '反派', appearance: '雍容华贵，凤冠霞帔，笑里藏刀。', personality: '心机深沉，权欲极重。', referenceImageUrl: null },
]

export const scenes: Scene[] = [
  { id: 'sc1', projectId: 'p_moonlit', name: '朱红宫门', description: '巍峨的宫门，晨光下的琉璃瓦。', mood: '肃穆' },
  { id: 'sc2', projectId: 'p_moonlit', name: '御花园', description: '繁花似锦的皇家园林，曲径通幽。', mood: '静谧' },
  { id: 'sc3', projectId: 'p_moonlit', name: '掖庭', description: '狭长的宫女居所，昏暗压抑。', mood: '压抑' },
]

export const props: Prop[] = [
  { id: 'pr1', projectId: 'p_moonlit', name: '素色包袱', description: '苏晚入宫时携带的行囊。' },
  { id: 'pr2', projectId: 'p_moonlit', name: '玉簪', description: '母亲留下的信物，苏晚贴身珍藏。' },
  { id: 'pr3', projectId: 'p_moonlit', name: '宫灯', description: '夜间照明的红纱宫灯。' },
]

export const storyboards: Storyboard[] = [
  {
    id: 'sb1', episodeId: 'ep1', shotNo: 1,
    description: '宫门缓缓开启，苏晚仰望宫墙的中景。', camera: '中景 · 缓慢推镜',
    characters: ['苏晚'], scene: '朱红宫门',
    image_prompt: 'cinematic wide shot, ancient chinese palace gate opening at dawn, a young woman in plain robes looking up, golden morning light, realistic film grade',
    video_prompt: 'slow push-in on the palace gate, gentle morning haze, subtle camera drift',
    status: 'done',
  },
  {
    id: 'sb2', episodeId: 'ep1', shotNo: 2,
    description: '苏晚脸部特写，眼神坚定。', camera: '特写 · 固定',
    characters: ['苏晚'], scene: '朱红宫门',
    image_prompt: 'close-up portrait, determined young woman, soft rim light, shallow depth of field, cinematic',
    video_prompt: 'static close-up, faint wind moving loose strands of hair',
    status: 'done',
  },
  {
    id: 'sb3', episodeId: 'ep1', shotNo: 3,
    description: '掖庭内一排宫女肃立，刘嬷嬷踱步的全景。', camera: '全景 · 横移',
    characters: ['苏晚', '刘嬷嬷'], scene: '掖庭',
    image_prompt: 'wide interior shot, row of palace maids standing in a dim hall, a stern elderly matron pacing, moody low-key lighting',
    video_prompt: 'slow lateral tracking across the standing maids',
    status: 'generating',
  },
]

export const generationTasks: GenerationTask[] = [
  { id: 't1', targetType: 'character_reference_image', targetId: 'ch1', taskType: 'image_generation', status: 'done', createdAt: '2026-06-27T10:00:00.000Z', resultUrl: 'mock://assets/ch1.png' },
  { id: 't2', targetType: 'character_reference_image', targetId: 'ch2', taskType: 'image_generation', status: 'done', createdAt: '2026-06-27T10:05:00.000Z', resultUrl: 'mock://assets/ch2.png' },
  { id: 't3', targetType: 'character_reference_image', targetId: 'ch3', taskType: 'image_generation', status: 'generating', createdAt: '2026-06-28T11:20:00.000Z', resultUrl: null },
]

/** Ordered narrative-pipeline steps used by the pipeline stepper component. */
export const pipelineSteps = [
  { key: 'novel', label: '小说导入' },
  { key: 'events', label: '事件提取' },
  { key: 'episodes', label: '剧集规划' },
  { key: 'script', label: '剧本改编' },
  { key: 'assets', label: '资产提取' },
  { key: 'storyboard', label: '分镜生成' },
  { key: 'image', label: '角色参考图' },
]

// ------------------------------------------------------------- mock lookups

export function getProject(id: string): Project | undefined {
  return projects.find((p) => p.id === id)
}

export function getEpisode(id: string): Episode | undefined {
  return episodes.find((e) => e.id === id)
}

export function getCharacter(id: string): Character | undefined {
  return characters.find((c) => c.id === id)
}
