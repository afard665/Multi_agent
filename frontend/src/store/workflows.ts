import { create } from 'zustand'
import { api } from '../api/client'
import { Workflow } from '../types'

type WorkflowState = {
  workflows: Workflow[]
  error?: string
  load: () => Promise<void>
  create: (workflow: Partial<Workflow>) => Promise<Workflow | null>
  update: (id: string, patch: Partial<Workflow>) => Promise<Workflow | null>
  remove: (id: string) => Promise<void>
  suggest: (question: string, opts?: { allowCreateAgents?: boolean }) => Promise<{ workflow: Workflow; createdAgents: { id: string; name: string; role: string }[] } | null>
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflows: [],
  error: undefined,

  load: async () => {
    try {
      const res = await api.get('/workflows')
      set({ workflows: res.data || [], error: undefined })
    } catch (err: any) {
      set({ workflows: [], error: err?.response?.data?.error || err?.message || 'Failed to load workflows' })
    }
  },

  create: async (workflow) => {
    try {
      const res = await api.post('/workflows', workflow)
      set({ error: undefined })
      await get().load()
      return res.data as Workflow
    } catch (err: any) {
      set({ error: err?.response?.data?.error || err?.message || 'Failed to create workflow' })
      await get().load()
      return null
    }
  },

  update: async (id, patch) => {
    try {
      const res = await api.patch(`/workflows/${encodeURIComponent(id)}`, patch)
      set({ error: undefined })
      await get().load()
      return res.data as Workflow
    } catch (err: any) {
      set({ error: err?.response?.data?.error || err?.message || 'Failed to update workflow' })
      await get().load()
      return null
    }
  },

  remove: async (id) => {
    try {
      await api.delete(`/workflows/${encodeURIComponent(id)}`)
      set({ error: undefined })
    } catch (err: any) {
      set({ error: err?.response?.data?.error || err?.message || 'Failed to delete workflow' })
    }
    await get().load()
  },

  suggest: async (question, opts) => {
    try {
      const res = await api.post('/workflows/suggest', { question, allowCreateAgents: !!opts?.allowCreateAgents })
      set({ error: undefined })
      const data: any = res.data
      const createdAgents = Array.isArray(data?.createdAgents) ? data.createdAgents : []
      return { workflow: data as Workflow, createdAgents }
    } catch (err: any) {
      set({ error: err?.response?.data?.error || err?.message || 'Failed to suggest workflow' })
      return null
    }
  },
}))
