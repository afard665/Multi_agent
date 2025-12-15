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
  default_provider?: string
  llm_providers?: Record<string, LlmProviderPublic>
  maxIterations: number
  maxTokens: number
  workflow_designer?: {
    provider?: string
    model?: string
    systemPrompt?: string
  }
}

export type ConfigAdmin = ConfigPublic & {
  llm_providers?: Record<string, LlmProviderAdmin>
}

function providersFromConfig(cfg: ConfigPublic | undefined): LlmProviderPublic[] {
  const map = cfg?.llm_providers || {}
  return Object.entries(map).map(([recordKey, p]) => {
    const anyP = p as any
    return {
      key: String(anyP?.key || recordKey),
      displayName: anyP?.displayName,
      baseUrl: String(anyP?.baseUrl || ''),
      models: Array.isArray(anyP?.models) ? anyP.models : [],
    }
  })
}

type SettingsState = {
  config?: ConfigPublic
  adminConfig?: ConfigAdmin

  providers: LlmProviderPublic[]
  providersAdmin: LlmProviderAdmin[]
  error?: string

  load: () => Promise<void>
  loadAdmin: () => Promise<void>

  loadProviders: () => Promise<void>
  loadProvidersAdmin: () => Promise<void>

  upsertProvider: (key: string, payload: Omit<LlmProviderAdmin, 'key'>) => Promise<void>
  deleteProvider: (key: string) => Promise<void>

  testProvider: (
    payload: Pick<LlmProviderAdmin, 'baseUrl' | 'apiKey'> & { model?: string; testChat?: boolean }
  ) => Promise<{
    ok: boolean
    models?: string[]
    modelCount?: number
    baseUrlUsed?: string
    baseUrlTried?: string
    status?: number
    statusText?: string
    error?: string
    model?: string
    chatOk?: boolean | null
    chatError?: { error?: string; status?: number; statusText?: string; data?: any; httpStatus?: number } | null
    modelsError?: { error?: string; status?: number; statusText?: string; data?: any; httpStatus?: number } | null
  }>

  update: (patch: Partial<ConfigPublic>) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  config: undefined,
  adminConfig: undefined,
  providers: [],
  providersAdmin: [],
  error: undefined,

  load: async () => {
    try {
      const res = await api.get('/config')
      const cfg = res.data as ConfigPublic
      const providers = providersFromConfig(cfg)
      set({ config: cfg, providers, error: undefined })
    } catch (err: any) {
      set({ config: undefined, providers: [], error: err?.response?.data?.error || err?.message || 'Failed to load config' })
    }
  },

  loadAdmin: async () => {
    try {
      const res = await api.get('/config/admin')
      set({ adminConfig: res.data, error: undefined })
    } catch (err: any) {
      set({ adminConfig: undefined, error: err?.response?.data?.error || err?.message || 'Failed to load admin config' })
    }
  },

  loadProviders: async () => {
    try {
      const res = await api.get('/config')
      const cfg = res.data as ConfigPublic
      const providers = providersFromConfig(cfg)
      set({ providers, error: undefined })
    } catch (err: any) {
      set({ providers: [], error: err?.response?.data?.error || err?.message || 'Failed to load providers' })
    }
  },

  loadProvidersAdmin: async () => {
    try {
      const res = await api.get('/providers/admin')
      set({ providersAdmin: res.data, error: undefined })
    } catch (err: any) {
      set({ providersAdmin: [], error: err?.response?.data?.error || err?.message || 'Failed to load admin providers' })
    }
  },

  upsertProvider: async (key, payload) => {
    try {
      await api.put(`/providers/${encodeURIComponent(key)}`, payload)
      set({ error: undefined })
    } catch (err: any) {
      set({ error: err?.response?.data?.error || err?.message || 'Failed to save provider' })
    }
    await Promise.all([get().load(), get().loadAdmin(), get().loadProviders(), get().loadProvidersAdmin()])
  },

  deleteProvider: async (key) => {
    try {
      await api.delete(`/providers/${encodeURIComponent(key)}`)
      set({ error: undefined })
    } catch (err: any) {
      set({ error: err?.response?.data?.error || err?.message || 'Failed to delete provider' })
    }
    await Promise.all([get().load(), get().loadAdmin(), get().loadProviders(), get().loadProvidersAdmin()])
  },

  testProvider: async (payload) => {
    try {
      const res = await api.post('/providers/test', payload)
      return res.data
    } catch (err: any) {
      const data = err?.response?.data
      if (data && typeof data === 'object') {
        return {
          ...data,
          ok: false,
          status: (data as any)?.status || err?.response?.status,
          statusText: (data as any)?.statusText || err?.response?.statusText,
        }
      }
      return {
        ok: false,
        error: err?.message || 'Failed to test provider',
        status: err?.response?.status,
        statusText: err?.response?.statusText,
      }
    }
  },

  update: async (patch) => {
    try {
      await api.patch('/config', patch)
      set({ error: undefined })
    } catch (err: any) {
      set({ error: err?.response?.data?.error || err?.message || 'Failed to update config' })
    }
    await Promise.all([get().load(), get().loadProviders()])
  },
}))
