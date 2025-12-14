import { create } from 'zustand'

const LS_BASE_URL = 'client.backendBaseUrl'
const LS_ADMIN_KEY = 'client.adminApiKey'

function loadString(key: string) {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function saveString(key: string, value: string) {
  try {
    if (!value) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

const LS_LLM_PROVIDER = 'client.llmProvider'
const LS_LLM_API_KEY = 'client.llmApiKey'
const LS_LLM_BASE_URL = 'client.llmBaseUrl'

export type ClientSettingsState = {
  backendBaseUrl: string
  adminApiKey: string
  llmProvider: string
  llmApiKey: string
  llmBaseUrl: string
  setBackendBaseUrl: (v: string) => void
  setAdminApiKey: (v: string) => void
  setLlmProvider: (v: string) => void
  setLlmApiKey: (v: string) => void
  setLlmBaseUrl: (v: string) => void
}

export const useClientSettingsStore = create<ClientSettingsState>((set) => ({
  backendBaseUrl: loadString(LS_BASE_URL),
  adminApiKey: loadString(LS_ADMIN_KEY),
  llmProvider: loadString(LS_LLM_PROVIDER),
  llmApiKey: loadString(LS_LLM_API_KEY),
  llmBaseUrl: loadString(LS_LLM_BASE_URL),
  setBackendBaseUrl: (v) => {
    const value = v.trim()
    saveString(LS_BASE_URL, value)
    set({ backendBaseUrl: value })
  },
  setAdminApiKey: (v) => {
    const value = v.trim()
    saveString(LS_ADMIN_KEY, value)
    set({ adminApiKey: value })
  },
  setLlmProvider: (v) => {
    const value = v.trim()
    saveString(LS_LLM_PROVIDER, value)
    set({ llmProvider: value })
  },
  setLlmApiKey: (v) => {
    const value = v.trim()
    saveString(LS_LLM_API_KEY, value)
    set({ llmApiKey: value })
  },
  setLlmBaseUrl: (v) => {
    const value = v.trim()
    saveString(LS_LLM_BASE_URL, value)
    set({ llmBaseUrl: value })
  },
}))

export function getStoredBackendBaseUrl() {
  return loadString(LS_BASE_URL)
}

export function getStoredAdminApiKey() {
  return loadString(LS_ADMIN_KEY)
}

export function getStoredLlmProvider() {
  return loadString(LS_LLM_PROVIDER)
}

export function getStoredLlmApiKey() {
  return loadString(LS_LLM_API_KEY)
}

export function getStoredLlmBaseUrl() {
  return loadString(LS_LLM_BASE_URL)
}