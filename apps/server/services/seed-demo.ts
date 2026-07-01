import type { DatabaseClient } from '../../../packages/database/index.js'
import {
  assets,
  characters,
  episodeCharacterLinks,
  episodeEventLinks,
  episodePropLinks,
  episodes,
  episodeSceneLinks,
  generationTasks,
  novelChapters,
  novelEvents,
  projects,
  props,
  scenes,
  scripts,
  storyboards,
} from '../../../packages/database/index.js'

const now = () => new Date().toISOString()
const json = (value: unknown) => JSON.stringify(value)

export async function seedDemoProject(db: DatabaseClient, projectId = 'demo-midnight-signal') {
  const createdAt = now()
  const episodeIds = Array.from({ length: 24 }, (_, index) => `demo-ep-${String(index + 1).padStart(2, '0')}`)
  const chapterIds = Array.from({ length: 12 }, (_, index) => `demo-chapter-${String(index + 1).padStart(2, '0')}`)

  await db.insert(projects).values({
    id: projectId,
    title: '午夜信号',
    description: '深夜电台女主播林夏收到一通来自“已故”听众的来电，牵出一桩尘封七年的失踪案。都市悬疑 · 竖屏微短剧 · 24 集。',
    genre: '都市悬疑',
    targetPlatform: 'short_video',
    visualStyle: 'cinematic realistic vertical short drama, moody neon noir',
    episodeDuration: 90,
    status: 'image_generation',
    createdAt,
    updatedAt: createdAt,
  })

  await db.insert(novelChapters).values(
    chapterIds.map((id, index) => ({
      id,
      projectId,
      chapterNo: index + 1,
      title: ['频率', '失眠者', '98.6兆赫', '点歌卡', '控制室', '地下二层', '旧档案', '便利店', '雨夜', '录音带', '回声', '最后直播'][index],
      content:
        index === 2
          ? '红色的 ON AIR 灯亮起时，城市已经睡了。林夏把耳机压紧，指尖沿着调音台滑过，指针最终停在 98.6 —— 那是一个早该废弃的频率。这里是《午夜信号》，她对着麦克风，声音低得像怕惊醒谁。电平表毫无征兆地跳到满格。一段沙沙的电流声，盖过了铺垫好的背景音乐。林夏皱眉，伸手去调增益，却听见电流里浮起一个女孩的声音：林夏……你还记得七年前那个晚上吗？那声音她认得，是苏晚。'
          : `第 ${index + 1} 章示例文本：林夏继续追踪七年前苏晚失踪案的线索，电台、旧档案和城市夜色不断交错。`,
      wordCount: index === 2 ? 2140 : 1600 + index * 80,
      source: 'demo_seed',
      status: index < 3 ? 'extracted' : 'pending',
      createdAt,
      updatedAt: createdAt,
    })),
  )

  const events = [
    ['ev-001', chapterIds[0], 1, '悬念钩子', '深夜来电', '林夏在直播中接到自称苏晚的来电，电流里的声音穿越七年而来。', ['林夏', '苏晚'], '直播间', '深夜', '诡异', 'high', 'critical'],
    ['ev-002', chapterIds[0], 2, '信息揭示', '废弃频率', '调音台指针停在 98.6 兆赫，一个早已废弃的频率重新出现。', ['林夏'], '直播间', '深夜', '不安', 'medium', 'major'],
    ['ev-003', chapterIds[1], 1, '人物钩子', '陈默的沉默', '技术工程师陈默异常回避林夏追问，像是早就知道些什么。', ['林夏', '陈默'], '控制室', '凌晨', '紧张', 'medium', 'major'],
    ['ev-004', chapterIds[1], 2, '剧情反转', '被删除的音频', '后台音频文件被人删除，通话记录也一片空白。', ['陈默'], '控制室', '凌晨', '怀疑', 'high', 'major'],
    ['ev-005', chapterIds[2], 1, '悬念钩子', '深夜来电', '林夏在直播中接到自称苏晚的来电，电流里的声音穿越七年而来。', ['林夏'], '直播间', '深夜', '紧张', 'high', 'critical'],
    ['ev-006', chapterIds[2], 2, '剧情反转', '断线的信号', '通话在关键处中断，调音台显示出一段不该存在的异常频率。', ['林夏', '陈默'], '调音台', '深夜', '不安', 'medium', 'major'],
    ['ev-007', chapterIds[2], 3, '人物钩子', '陈默的沉默', '陈默避开林夏的目光，像是早就知道苏晚的声音会出现。', ['陈默'], '控制室', '深夜', '压抑', 'medium', 'normal'],
    ['ev-008', chapterIds[2], 4, '信息揭示', '尘封的旧档案', '林夏在资料室翻出七年前苏晚失踪的旧报道，时间正是那个晚上。', ['林夏'], '资料室', '凌晨', '冷静', 'low', 'major'],
  ] as const

  await db.insert(novelEvents).values(
    events.map(([id, chapterId, eventNo, eventType, summary, detail, eventCharacters, location, timeHint, emotionTone, conflictLevel, importance]) => ({
      id,
      projectId,
      chapterId,
      eventNo,
      eventType,
      summary,
      detail,
      charactersJson: json(eventCharacters),
      location,
      timeHint,
      emotionTone,
      conflictLevel,
      importance,
      sourceTextRangeJson: null,
      createdAt,
      updatedAt: createdAt,
    })),
  )

  const episodeTitles = ['深夜来电', '断线的频率', '98.6 兆赫', '沉默的工程师', '点歌卡', '旧档案', '地下二层', '便利店监控']
  await db.insert(episodes).values(
    episodeIds.map((id, index) => ({
      id,
      projectId,
      episodeNo: index + 1,
      title: episodeTitles[index] ?? `回声 ${index + 1}`,
      summary: index === 2 ? '林夏锁定那个废弃频率，循声找到城中村的老公寓。' : '林夏继续追查苏晚失踪案，旧线索与新异常彼此呼应。',
      openingHook: index === 2 ? '收音机自动跳到 98.6，发出规律的滴答声。' : '夜色中，一个被遗忘的线索重新浮现。',
      endingHook: index === 2 ? '门后的房间，时间停在了七年前。' : '她发现事情远比想象中更早开始。',
      scriptId: index < 18 ? `demo-script-${String(index + 1).padStart(2, '0')}` : null,
      videoUrl: null,
      status: index < 18 ? 'scripted' : index < 20 ? 'processing' : 'pending',
      createdAt,
      updatedAt: createdAt,
    })),
  )

  await db.insert(episodeEventLinks).values(
    events.slice(0, 6).map(([eventId], index) => ({
      id: `demo-link-event-${index + 1}`,
      projectId,
      episodeId: episodeIds[Math.min(index, 2)],
      novelEventId: eventId,
      orderInEpisode: index + 1,
      usageType: index === 0 ? 'hook' : 'primary',
      createdAt,
      updatedAt: createdAt,
    })),
  )

  const characterRows = [
    ['char-linxia', '林夏', '调查记者 · 女主', '女', '齐肩黑发，米色风衣，常年失眠的眼神', '理性、执拗、不肯放手', '陈默的旧识', '/static/mock-images/linxia.png'],
    ['char-chenmo', '陈默', '电台工程师 · 疑点人物', '男', '清瘦，细框眼镜，总穿深色卫衣', '沉默、警惕、藏事', '林夏的同事', '/static/mock-images/chenmo.png'],
    ['char-zhoukai', '周凯', '刑警队长 · 配角', '男', '寸头，身形壮实，风衣不离身', '老练、固执、认死理', '七年前旧案负责人', null],
    ['char-suwan', '苏晚', '失踪女孩 · 关键线索', '女', '短发，校服，只出现在回忆里', '敏感、倔强、带着秘密', '七年前的失踪者', null],
  ] as const

  await db.insert(characters).values(
    characterRows.map(([id, name, role, gender, appearance, personality, relationship, referenceImageUrl], index) => ({
      id,
      projectId,
      name,
      aliasJson: json([]),
      role,
      age: index === 3 ? '17' : '28-35',
      gender,
      appearance,
      personality,
      background: relationship,
      relationshipJson: json([{ target: '林夏', relation: relationship }]),
      referenceImageUrl,
      voiceId: null,
      status: index === 3 ? 'failed' : index === 2 ? 'processing' : 'active',
      createdAt,
      updatedAt: createdAt,
    })),
  )

  const sceneRows = ['直播间', '控制室', '调音台特写', '资料室', '老公寓', '地下二层', '便利店', '雨夜街口'].map((name, index) => ({
    id: `scene-${index + 1}`,
    projectId,
    name,
    description: `${name}，冷色调都市悬疑场景，适合竖屏短剧。`,
    locationType: index < 4 ? 'interior' : 'exterior',
    visualStyle: 'cinematic noir, low-key lighting',
    visualPrompt: `cinematic ${name}, moody suspense, vertical 9:16`,
    referenceImageUrl: index < 7 ? `/static/mock-images/scene-${index + 1}.png` : null,
    status: index === 7 ? 'failed' : 'active',
    createdAt,
    updatedAt: createdAt,
  }))
  await db.insert(scenes).values(sceneRows)

  const propRows = ['收音机', '点歌卡', '旧录音带', '苏晚档案', '钥匙', '红色 ON AIR 灯'].map((name, index) => ({
    id: `prop-${index + 1}`,
    projectId,
    name,
    description: `${name} 是推动线索的重要道具。`,
    significance: index < 3 ? '关键线索' : '氛围道具',
    visualPrompt: `close-up of ${name}, suspense prop, cinematic lighting`,
    referenceImageUrl: null,
    status: 'active',
    createdAt,
    updatedAt: createdAt,
  }))
  await db.insert(props).values(propRows)

  await db.insert(scripts).values(
    episodeIds.slice(0, 18).map((episodeId, index) => {
      const isEp3 = index === 2
      return {
        id: `demo-script-${String(index + 1).padStart(2, '0')}`,
        projectId,
        episodeId,
        title: isEp3 ? '98.6 兆赫' : episodeTitles[index] ?? `回声 ${index + 1}`,
        summary: isEp3 ? '林夏在深夜电台中听见苏晚的声音。' : '示例剧本摘要。',
        openingHook: isEp3 ? '红色 ON AIR 灯骤然亮起。' : '异常信号出现。',
        endingHook: isEp3 ? '苏晚问她是否记得七年前。' : '新的疑点出现。',
        content: isEp3
          ? '场景 1 — 内景 · 深夜电台直播间 — 夜\n\n红色的 ON AIR 灯亮起。林夏戴上耳机，指尖划过调音台，指针停在 98.6。\n\n林夏\n（对着麦克风，声音低缓）\n这里是《午夜信号》。今晚，我们聊聊那些没能说出口的告别。\n\n电平表毫无征兆地跳到满格。一段沙沙的电流声，盖过了背景音乐。\n\n苏晚 (V.O.)\n（声音失真，穿过电流）\n林夏……你还记得七年前那个晚上吗？'
          : '示例剧本正文。',
        structuredJson: json({
          sections: [
            { sectionNo: 1, type: 'scene_description', scene: '直播间', characters: ['林夏'], emotion: '紧张', text: '红色 ON AIR 灯亮起，林夏戴上耳机。' },
            { sectionNo: 2, type: 'dialogue', character: '林夏', emotion: '平静', text: '这里是《午夜信号》。今晚，我们聊聊那些没能说出口的告别。' },
            { sectionNo: 3, type: 'narration', scene: '直播间', emotion: '不安', text: '电平表突然满格，电流声盖过背景音乐。' },
            { sectionNo: 4, type: 'dialogue', character: '苏晚 (V.O.)', emotion: '诡异', text: '林夏……你还记得七年前那个晚上吗？' },
            { sectionNo: 5, type: 'action', character: '林夏', emotion: '惊恐', text: '林夏猛地抬头盯着扬声器。' },
            { sectionNo: 6, type: 'scene_description', scene: '控制室', emotion: '压抑', text: '陈默站在控制室阴影里。' },
            { sectionNo: 7, type: 'dialogue', character: '陈默', emotion: '回避', text: '你不该继续查下去。' },
            { sectionNo: 8, type: 'hook', emotion: '悬疑', text: '屏幕上跳出一个被删除的音频文件名。' },
          ],
        }),
        status: 'completed',
        createdAt,
        updatedAt: createdAt,
      }
    }),
  )

  await db.insert(episodeCharacterLinks).values(characterRows.map(([id], index) => ({ id: `demo-ep3-char-${index + 1}`, projectId, episodeId: episodeIds[2], characterId: id, usageType: index < 2 ? 'main' : 'mentioned', createdAt, updatedAt: createdAt })))
  await db.insert(episodeSceneLinks).values(sceneRows.slice(0, 4).map((scene, index) => ({ id: `demo-ep3-scene-${index + 1}`, projectId, episodeId: episodeIds[2], sceneId: scene.id, usageType: 'used', createdAt, updatedAt: createdAt })))
  await db.insert(episodePropLinks).values(propRows.slice(0, 3).map((prop, index) => ({ id: `demo-ep3-prop-${index + 1}`, projectId, episodeId: episodeIds[2], propId: prop.id, usageType: 'used', createdAt, updatedAt: createdAt })))

  await db.insert(storyboards).values(
    Array.from({ length: 26 }, (_, index) => ({
      id: `shot-${String(index + 1).padStart(3, '0')}`,
      projectId,
      episodeId: episodeIds[2],
      shotNo: index + 1,
      duration: index % 3 === 0 ? 4 : 3,
      sceneId: sceneRows[index % 4].id,
      characterIdsJson: json(index % 2 === 0 ? ['char-linxia'] : ['char-linxia', 'char-chenmo']),
      propIdsJson: json(index % 3 === 0 ? ['prop-1'] : []),
      scriptSectionNo: (index % 8) + 1,
      shotType: index % 4 === 0 ? 'close_up' : 'medium_shot',
      cameraAngle: index % 5 === 0 ? 'low_angle' : 'eye_level',
      cameraMovement: index % 2 === 0 ? 'slow_push_in' : 'static',
      action:
        index === 0
          ? '林夏戴上耳机，俯身靠近麦克风，指尖搭在推子上'
          : index === 1
            ? '调音台指针跳到 98.6，电平表瞬间满格'
            : index === 2
              ? '林夏猛地抬头盯着扬声器'
              : '林夏在冷光中追踪异常信号',
      dialogueJson: json(index === 0 ? [{ character: '林夏', text: '这里是《午夜信号》' }] : []),
      narration: index === 1 ? '一段沙沙的电流声盖过了音乐' : null,
      emotion: index === 2 ? '惊恐' : index === 1 ? '不安' : '专注',
      imagePrompt:
        index === 0
          ? 'cinematic, dim radio studio, red ON AIR light, woman with headphones close to mic, moody rim light, 9:16'
          : index === 1
            ? 'extreme close-up of vintage mixing console, needle at 98.6, VU meter maxed, cold blue glow, 9:16'
            : 'vertical cinematic suspense shot, neon noir radio mystery, 9:16',
      videoPrompt: index === 0 ? 'slow push-in on her face, faint flicker of the red light' : 'subtle camera movement, suspense atmosphere',
      firstFrameImageUrl: index < 18 ? `/static/mock-images/shot-${String(index + 1).padStart(3, '0')}.png` : null,
      lastFrameImageUrl: null,
      videoUrl: null,
      ttsAudioUrl: null,
      subtitleUrl: null,
      composedVideoUrl: null,
      status: index < 18 ? 'completed' : index < 24 ? 'pending' : index === 24 ? 'processing' : 'failed',
      createdAt,
      updatedAt: createdAt,
    })),
  )

  const taskRows = [
    ['img-char-suwan', null, 'character', 'char-suwan', 'character_reference_image', 'failed', '引用图缺失，请先上传参考素材'],
    ['img-shot-003', episodeIds[2], 'storyboard', 'shot-003', 'storyboard_first_frame', 'failed', '内容安全审核未通过'],
    ['img-shot-012', episodeIds[2], 'storyboard', 'shot-012', 'storyboard_first_frame', 'failed', '生成超时 (60s)'],
    ['img-scene-8', null, 'scene', 'scene-8', 'scene_reference_image', 'failed', '模型返回空结果'],
    ['img-char-zhoukai', null, 'character', 'char-zhoukai', 'character_reference_image', 'processing', null],
  ] as const

  await db.insert(generationTasks).values(
    taskRows.map(([id, episodeId, targetType, targetId, taskType, status, errorMessage]) => ({
      id,
      projectId,
      episodeId,
      storyboardId: targetType === 'storyboard' ? targetId : null,
      targetType,
      targetId,
      taskType,
      provider: 'mock-image-provider',
      model: 'mock-image-model',
      inputJson: json({ prompt: 'demo image generation prompt' }),
      outputJson: null,
      status,
      retryCount: status === 'failed' ? 1 : 0,
      errorMessage,
      startedAt: status === 'processing' ? createdAt : null,
      completedAt: status === 'failed' ? createdAt : null,
      createdAt,
      updatedAt: createdAt,
    })),
  )

  await db.insert(assets).values([
    ...characterRows.slice(0, 2).map(([id, name, , , , , , referenceImageUrl], index) => ({
      id: `asset-char-${index + 1}`,
      projectId,
      assetType: 'character_reference_image',
      targetType: 'character',
      targetId: id,
      generationTaskId: null,
      url: referenceImageUrl ?? `/static/mock-images/${id}.png`,
      provider: 'mock-image-provider',
      model: 'mock-image-model',
      prompt: `${name} character reference`,
      metadataJson: json({ aspectRatio: '9:16' }),
      status: 'active',
      createdAt,
      updatedAt: createdAt,
    })),
    ...sceneRows.slice(0, 7).map((scene, index) => ({
      id: `asset-scene-${index + 1}`,
      projectId,
      assetType: 'scene_reference_image',
      targetType: 'scene',
      targetId: scene.id,
      generationTaskId: null,
      url: scene.referenceImageUrl ?? `/static/mock-images/${scene.id}.png`,
      provider: 'mock-image-provider',
      model: 'mock-image-model',
      prompt: scene.visualPrompt,
      metadataJson: json({ aspectRatio: '9:16' }),
      status: 'active',
      createdAt,
      updatedAt: createdAt,
    })),
    ...Array.from({ length: 18 }, (_, index) => ({
      id: `asset-shot-${String(index + 1).padStart(3, '0')}`,
      projectId,
      assetType: 'storyboard_first_frame',
      targetType: 'storyboard',
      targetId: `shot-${String(index + 1).padStart(3, '0')}`,
      generationTaskId: null,
      url: `/static/mock-images/shot-${String(index + 1).padStart(3, '0')}.png`,
      provider: 'mock-image-provider',
      model: 'mock-image-model',
      prompt: 'demo storyboard first frame prompt',
      metadataJson: json({ aspectRatio: '9:16' }),
      status: 'active',
      createdAt,
      updatedAt: createdAt,
    })),
  ])
}
