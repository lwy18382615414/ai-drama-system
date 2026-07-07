<template>
  <div class="modal" @click.self="close">
    <div class="msheet">
      <p class="mtitle">新建项目</p>
      <p class="mhint">
        粘贴小说正文,或拖入文件。章节拆分与项目画像在后台完成,创建后立即进入工作台。
      </p>

      <div
        :class="['drop', dragOver ? 'over' : '']"
        @click="fileInput?.click()"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop.prevent="onDrop"
      >
        <template v-if="epubFile">
          已选择 <b>{{ epubFile.name }}</b><br />
          <span style="font-size: 11.5px">点击可重新选择</span>
        </template>
        <template v-else>
          拖入 <b>.txt / .epub</b> 到此处,或 <b>点击选择文件</b><br />
          <span style="font-size: 11.5px">也可直接把正文粘贴到下方</span>
        </template>
      </div>
      <input
        ref="fileInput"
        type="file"
        accept=".txt,.epub"
        style="display: none"
        @change="onFilePicked"
      />

      <div class="field">
        <label>正文(可粘贴)</label>
        <textarea
          v-model="novelText"
          class="inp"
          rows="5"
          placeholder="第一章 ……"
          :disabled="!!epubFile"
        ></textarea>
      </div>
      <div class="field">
        <label>项目名称</label>
        <input v-model="projectName" class="inp" placeholder="未命名项目(可改)" />
      </div>

      <div class="mfoot">
        <div class="f1"></div>
        <button class="btn" :disabled="submitting" @click="close">取消</button>
        <button class="btn pri" :disabled="submitting" @click="submit">
          {{ submitting ? '创建中…' : '创建并进入工作台' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { projectApi } from '@/api'

const emit = defineEmits<{ close: []; created: [projectId: string] }>()

const fileInput = ref<HTMLInputElement>()
const novelText = ref('')
const projectName = ref('')
const epubFile = ref<File | null>(null)
/** True once the body text came from a dropped/picked .txt file (source tagging). */
const fromTxtFile = ref(false)
const dragOver = ref(false)
const submitting = ref(false)

function close() {
  if (submitting.value) return
  emit('close')
}

function onFilePicked(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) void acceptFile(file)
  ;(e.target as HTMLInputElement).value = ''
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) void acceptFile(file)
}

async function acceptFile(file: File) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.epub')) {
    // EPUB is parsed server-side on submit; keep the File and disable the textarea.
    epubFile.value = file
    novelText.value = ''
    fromTxtFile.value = false
    if (!projectName.value) projectName.value = file.name.replace(/\.epub$/i, '')
  } else if (name.endsWith('.txt')) {
    epubFile.value = null
    novelText.value = await file.text()
    fromTxtFile.value = true
    if (!projectName.value) projectName.value = file.name.replace(/\.txt$/i, '')
  } else {
    ElMessage.error('仅支持 .txt 或 .epub 文件')
  }
}

async function submit() {
  submitting.value = true
  try {
    const title = projectName.value.trim() || undefined
    let projectId: string

    if (epubFile.value) {
      const { chapters, meta } = await projectApi.previewNovelFile(epubFile.value)
      if (!chapters.length) return void ElMessage.error('未能从该 EPUB 解析出章节')
      const { project } = await projectApi.createProjectFromNovel({
        title,
        source: 'epub',
        chapters: chapters.map((c) => ({ title: c.title, content: c.content })),
        novelMeta: meta,
      })
      projectId = project.id
    } else if (novelText.value.trim()) {
      const { chapters } = await projectApi.previewNovel(novelText.value)
      if (!chapters.length) return void ElMessage.error('未能从正文解析出章节')
      const { project } = await projectApi.createProjectFromNovel({
        title,
        source: fromTxtFile.value ? 'txt' : 'paste',
        chapters: chapters.map((c) => ({ title: c.title, content: c.content })),
      })
      projectId = project.id
    } else if (title) {
      // No novel content — create a blank project from just the name.
      const { project } = await projectApi.createProject({ title })
      projectId = project.id
    } else {
      return void ElMessage.warning('请粘贴正文、拖入文件,或至少填写项目名称')
    }

    ElMessage.success('创建成功')
    emit('created', projectId)
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  background: rgba(20, 20, 22, 0.42);
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
}
.msheet {
  background: #fff;
  border-radius: 14px;
  width: 520px;
  max-width: 92vw;
  padding: 26px 28px 24px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
  font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
}
.mtitle {
  font-size: 17px;
  font-weight: 700;
  margin: 0 0 4px;
  color: #221e18;
}
.mhint {
  font-size: 12.5px;
  color: #9a9da4;
  margin: 0 0 16px;
  line-height: 1.6;
}
.drop {
  border: 1.5px dashed #d6d5d0;
  border-radius: 10px;
  background: #fafaf8;
  padding: 26px;
  text-align: center;
  color: #9a9da4;
  font-size: 13px;
  line-height: 1.7;
  margin-bottom: 16px;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.drop:hover,
.drop.over {
  border-color: #cf6134;
  background: #fdf5f1;
}
.drop b {
  color: #cf6134;
  font-weight: 600;
}
.field {
  margin-bottom: 8px;
}
.field label {
  display: block;
  font-size: 12px;
  color: #8a8d94;
  margin-bottom: 6px;
}
.inp {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #dcdbd6;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 13.5px;
  font-family: inherit;
  color: #2a2d33;
  outline: none;
  resize: vertical;
}
.inp:focus {
  border-color: #cf6134;
}
.inp:disabled {
  background: #f6f5f2;
  color: #9a9da4;
}
.mfoot {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
}
.mfoot .note {
  font-size: 11.5px;
  color: #b0b2b8;
}
.f1 {
  flex: 1;
}
.btn {
  border: 1px solid #dcdbd6;
  background: #fff;
  border-radius: 8px;
  padding: 8px 15px;
  font-size: 13px;
  cursor: pointer;
  color: #2a2d33;
  font-weight: 500;
  font-family: inherit;
}
.btn:hover {
  border-color: #c7c5bf;
}
.btn.pri {
  background: #cf6134;
  border-color: #cf6134;
  color: #fff;
}
.btn.pri:hover {
  background: #bb5329;
}
.btn[disabled] {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
