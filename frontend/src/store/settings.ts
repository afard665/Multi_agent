import { create } from 'zustand'
import { api } from '../api/client'

export type Rate = { input: number; output: number; reasoning: number }

export type LlmProviderPublic = {
  key: string
  displayName?: string
  baseUrl: string
  models: string[]
}

export type LlmProviderAdmin = LlmProviderPublic & {
  apiKey: string
}

export type ConfigPublic = {
  provider_rates: Record<string, Rate>
  llm_providers?: Record<string, LlmProviderPublic>
  maxIterations: number
  maxTokens: number
}

export type ConfigAdmin = ConfigPublic & {
  llm_providers?: Record<string, LlmProviderAdmin>
}

type SettingsState = {
  config?: ConfigPublic
  adminConfig?: ConfigAdmin

  providers: LlmProviderPublic[]
  providersAdmin: LlmProviderAdmin[]

  load: () => Promise<void>
  loadAdmin: () => Promise<void>

  loadProviders: () => Promise<void>
  loadProvidersAdmin: () => Promise<void>

  upsertProvider: (key: string, payload: Omit<LlmProviderAdmin, 'key'>) => Promise<void>
  deleteProvider: (key: string) => Promise<void>

  update: (patch: Partial<ConfigPublic>) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  config: undefined,
  adminConfig: undefined,
  providers: [],
  providersAdmin: [],

  load: async () => {
    const res = await api.get('/config')
    set({ config: res.data })
  },

  loadAdmin: async () => {
    try {
      const res = await api.get('/config/admin')
      set({ adminConfig: res.data })
    } catch {
      set({ adminConfig: undefined })
    }
  },

  loadProviders: async () => {
    try {
      const res = await api.get('/providers')
      set({ providers: res.data })
    } catch {
      set({ providers: [] })
    }
  },

  loadProvidersAdmin: async () => {
    try {
      const res = await api.get('/providers/admin')
      set({ providersAdmin: res.data })
    } catch {
      set({ providersAdmin: [] })
    }
  },

  upsertProvider: async (key, payload) => {
    try {
      await api.put(`/providers/${encodeURIComponent(key)}`, payload)
    } catch {
      // ignore (likely missing admin key)
    }
    await Promise.all([get().load(), get().loadAdmin(), get().loadProviders(), get().loadProvidersAdmin()])
  },

  deleteProvider: async (key) => {
    try {
      await api.delete(`/providers/${encodeURIComponent(key)}`)
    } catch {
      // ignore (likely missing admin key)
    }
    await Promise.all([get().load(), get().loadAdmin(), get().loadProviders(), get().loadProvidersAdmin()])
  },

  update: async (patch) => {
    try {
      await api.patch('/config', patch)
    } catch {
      // ignore (likely missing admin key)
    }
    await Promise.all([get().load(), get().loadProviders()])
  },
}))
