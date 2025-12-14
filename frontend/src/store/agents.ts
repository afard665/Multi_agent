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
  load: () => Promise<void>
  create: (agent: Partial<Agent>) => Promise<void>
  update: (id: string, patch: Partial<Agent>) => Promise<void>
  setEnabled: (id: string, enabled: boolean) => Promise<void>
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  load: async () => {
    const res = await api.get('/agents')
    set({ agents: res.data })
  },
  create: async (agent) => {
    await api.post('/agents', agent)
    await get().load()
  },
  update: async (id, patch) => {
    await api.patch(`/agents/${id}`, patch)
    await get().load()
  },
  setEnabled: async (id, enabled) => {
    if (enabled) {
      await api.patch(`/agents/${id}`, { enabled: true })
    } else {
      await api.post(`/agents/${id}/disable`)
    }
    await get().load()
  },
}))