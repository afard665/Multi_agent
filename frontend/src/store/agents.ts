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
  update: (id: string, patch: Partial<Agent>) => Promise<void>
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  load: async () => {
    const res = await api.get('/agents')
    set({ agents: res.data })
  },
  update: async (id, patch) => {
    await api.patch(`/agents/${id}`, patch)
    await get().load()
  },
}))
