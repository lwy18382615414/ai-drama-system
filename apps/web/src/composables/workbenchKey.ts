import type { InjectionKey } from 'vue'
import type { WorkbenchStore } from '@/composables/useWorkbenchStore'

export const WorkbenchKey: InjectionKey<WorkbenchStore> = Symbol('workbench')
