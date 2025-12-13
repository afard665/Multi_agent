import { create } from 'zustand'
import { api } from '../api/client'

type Config = {
  provider_rates: Record<string, { input: number; output: number; reasoning: number }>
  maxIterations: number
  maxTokens: number
}

type SettingsState = {
  config?: Config
  load: () => Promise<void>
  update: (patch: Partial<Config>) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  config: undefined,
  load: async () => {
    const res = await api.get('/config')
    set({ config: res.data })
  },
  update: async (patch) => {
    await api.patch('/config', patch)
    await get().load()
  },
}))
