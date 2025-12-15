import { create } from 'zustand'
import { api } from '../api/client'

type Agent = {
  id: string
  name: string
  role: string
  enabled: boolean
  system_prompt: string
  model: string
  provider: string
  temperature: number
  max_tokens: number
}

type AgentState = {
  agents: Agent[]
  error?: string
  load: () => Promise<void>
  create: (agent: Partial<Agent>) => Promise<void>
  update: (id: string, patch: Partial<Agent>) => Promise<void>
  setEnabled: (id: string, enabled: boolean) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  error: undefined,
  load: async () => {
    try {
      const res = await api.get('/agents')
      set({ agents: res.data, error: undefined })
    } catch (err: any) {
      set({ agents: [], error: err?.response?.data?.error || err?.message || 'Failed to load agents' })
    }
  },
  create: async (agent) => {
    try {
      await api.post('/agents', agent)
      set({ error: undefined })
    } catch (err: any) {
      set({ error: err?.response?.data?.error || err?.message || 'Failed to create agent' })
    }
    await get().load()
  },
  update: async (id, patch) => {
    try {
      await api.patch(`/agents/${id}`, patch)
      set({ error: undefined })
    } catch (err: any) {
      set({ error: err?.response?.data?.error || err?.message || 'Failed to update agent' })
    }
    await get().load()
  },
  setEnabled: async (id, enabled) => {
    try {
      if (enabled) {
        await api.patch(`/agents/${id}`, { enabled: true })
      } else {
        await api.post(`/agents/${id}/disable`)
      }
      set({ error: undefined })
    } catch (err: any) {
      set({ error: err?.response?.data?.error || err?.message || 'Failed to update agent state' })
    }
    await get().load()
  },
  remove: async (id) => {
    try {
      await api.delete(`/agents/${encodeURIComponent(id)}`)
      set({ error: undefined })
      await get().load()
    } catch (err: any) {
      set({ error: err?.response?.data?.error || err?.message || 'Failed to delete agent' })
    }
  },
}))
