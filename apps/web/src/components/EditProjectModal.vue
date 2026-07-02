<script setup lang="ts">
import { ref, watch } from 'vue'
import type { FormInst, FormRules } from 'naive-ui'
import { getApiErrorMessage } from '@/api/client'
import { updateProject, type ProjectDetail } from '@/api/projects'

const show = defineModel<boolean>('show', { required: true })
const props = defineProps<{ project: ProjectDetail }>()
const emit = defineEmits<{ saved: [project: ProjectDetail] }>()

const message = useMessage()
const formRef = ref<FormInst | null>(null)
const submitting = ref(false)

const formValue = ref({
  title: '',
  description: '',
  genre: '',
  targetPlatform: '',
  visualStyle: '',
  episodeDuration: 60,
})

const rules: FormRules = {
  title: [{ required: true, message: '请输入项目标题', trigger: ['blur', 'input'] }],
  genre: [{ required: true, message: '请输入题材', trigger: ['blur', 'input'] }],
  targetPlatform: [{ required: true, message: '请输入目标平台', trigger: ['blur', 'input'] }],
  visualStyle: [{ required: true, message: '请输入视觉风格', trigger: ['blur', 'input'] }],
  episodeDuration: [{ required: true, type: 'number', message: '请输入单集时长', trigger: ['blur', 'change'] }],
}

function resetFromProject() {
  formValue.value = {
    title: props.project.title,
    description: props.project.description ?? '',
    genre: props.project.genre,
    targetPlatform: props.project.targetPlatform,
    visualStyle: props.project.visualStyle,
    episodeDuration: props.project.episodeDuration,
  }
  formRef.value?.restoreValidation()
}

watch(
  () => [show.value, props.project.id, props.project.updatedAt] as const,
  ([visible]) => {
    if (visible) resetFromProject()
  },
  { immediate: true },
)

async function submit() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  submitting.value = true
  try {
    const project = await updateProject(props.project.id, {
      title: formValue.value.title.trim(),
      description: formValue.value.description.trim() || null,
      genre: formValue.value.genre.trim(),
      targetPlatform: formValue.value.targetPlatform.trim(),
      visualStyle: formValue.value.visualStyle.trim(),
      episodeDuration: formValue.value.episodeDuration,
    })
    message.success('项目信息已更新')
    show.value = false
    emit('saved', project)
  } catch (error) {
    message.error(getApiErrorMessage(error))
  } finally {
    submitting.value = false
  }
}

function cancel() {
  if (submitting.value) return
  show.value = false
  resetFromProject()
}
</script>

<template>
  <n-modal
    v-model:show="show"
    preset="card"
    title="编辑项目信息"
    style="max-width: 560px"
    :mask-closable="!submitting"
    @after-enter="resetFromProject"
  >
    <n-form ref="formRef" :model="formValue" :rules="rules" label-placement="top">
      <n-form-item label="项目标题" path="title">
        <n-input v-model:value="formValue.title" placeholder="例如：午夜信号" @keydown.enter.prevent="submit" />
      </n-form-item>

      <n-form-item label="简介描述" path="description">
        <n-input
          v-model:value="formValue.description"
          type="textarea"
          placeholder="简单描述这个短剧项目"
          :autosize="{ minRows: 3, maxRows: 6 }"
        />
      </n-form-item>

      <div class="sf-grid sf-grid--2">
        <n-form-item label="题材" path="genre">
          <n-input v-model:value="formValue.genre" placeholder="drama / 悬疑 / 都市" />
        </n-form-item>

        <n-form-item label="目标平台" path="targetPlatform">
          <n-input v-model:value="formValue.targetPlatform" placeholder="short_video" />
        </n-form-item>
      </div>

      <div class="sf-grid sf-grid--2">
        <n-form-item label="视觉风格" path="visualStyle">
          <n-input v-model:value="formValue.visualStyle" placeholder="realistic / cinematic noir" />
        </n-form-item>

        <n-form-item label="单集时长（秒）" path="episodeDuration">
          <n-input-number v-model:value="formValue.episodeDuration" :min="1" :precision="0" style="width: 100%" />
        </n-form-item>
      </div>
    </n-form>

    <div class="sf-row" style="justify-content: flex-end; gap: 8px">
      <n-button :disabled="submitting" @click="cancel">取消</n-button>
      <n-button type="primary" :loading="submitting" @click="submit">保存</n-button>
    </div>
  </n-modal>
</template>
