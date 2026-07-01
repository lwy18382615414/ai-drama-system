<script setup lang="ts">
import { ref } from 'vue'
import type { FormInst, FormRules } from 'naive-ui'
import { createProject, type ProjectSummary } from '@/api/projects'
import { getApiErrorMessage } from '@/api/client'

const show = defineModel<boolean>('show', { required: true })
const emit = defineEmits<{ created: [project: ProjectSummary] }>()

const message = useMessage()
const formRef = ref<FormInst | null>(null)
const submitting = ref(false)

const formValue = ref({
  title: '',
  description: '',
})

const rules: FormRules = {
  title: [{ required: true, message: '请输入项目标题', trigger: ['blur', 'input'] }],
}

function resetForm() {
  formValue.value = { title: '', description: '' }
  formRef.value?.restoreValidation()
}

async function submit() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  submitting.value = true
  try {
    const project = await createProject({
      title: formValue.value.title,
      description: formValue.value.description || undefined,
    })
    message.success('项目创建成功')
    resetForm()
    show.value = false
    emit('created', project)
  } catch (error) {
    message.error(getApiErrorMessage(error))
  } finally {
    submitting.value = false
  }
}

function cancel() {
  resetForm()
  show.value = false
}
</script>

<template>
  <n-modal v-model:show="show" preset="card" title="新建项目" style="max-width: 480px" :mask-closable="!submitting">
    <n-form ref="formRef" :model="formValue" :rules="rules" label-placement="top">
      <n-form-item label="项目标题" path="title">
        <n-input v-model:value="formValue.title" placeholder="例如：午夜信号" @keydown.enter.prevent="submit" />
      </n-form-item>
      <n-form-item label="简介描述（可选）" path="description">
        <n-input
          v-model:value="formValue.description"
          type="textarea"
          placeholder="简单描述一下这个短剧项目…"
          :autosize="{ minRows: 3, maxRows: 6 }"
        />
      </n-form-item>
    </n-form>

    <div class="sf-row" style="justify-content: flex-end; gap: 8px">
      <n-button :disabled="submitting" @click="cancel">取消</n-button>
      <n-button type="primary" :loading="submitting" @click="submit">创建</n-button>
    </div>
  </n-modal>
</template>
