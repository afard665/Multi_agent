import { create } from 'zustand'

const LS_BASE_URL = 'client.backendBaseUrl'
const LS_ADMIN_KEY = 'client.adminApiKey'
const LS_ASK_KEY = 'client.askApiKey'
const LS_WF_ALLOW_CREATE_AGENTS = 'client.workflowDesigner.allowCreateAgents'

function loadString(key: string) {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function loadBool(key: string, defaultValue: boolean) {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return defaultValue
    const v = raw.trim().toLowerCase()
    if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true
    if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false
    return defaultValue
  } catch {
    return defaultValue
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

function saveBool(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? 'true' : 'false')
  } catch {
    // ignore
  }
}


export type ClientSettingsState = {
  backendBaseUrl: string
  adminApiKey: string
  askApiKey: string
  workflowDesignerAllowCreateAgents: boolean
  setBackendBaseUrl: (v: string) => void
  setAdminApiKey: (v: string) => void
  setAskApiKey: (v: string) => void
  setWorkflowDesignerAllowCreateAgents: (v: boolean) => void
}

export const useClientSettingsStore = create<ClientSettingsState>((set) => ({
  backendBaseUrl: loadString(LS_BASE_URL),
  adminApiKey: loadString(LS_ADMIN_KEY),
  askApiKey: loadString(LS_ASK_KEY),
  workflowDesignerAllowCreateAgents: loadBool(LS_WF_ALLOW_CREATE_AGENTS, true),
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
  setAskApiKey: (v) => {
    const value = v.trim()
    saveString(LS_ASK_KEY, value)
    set({ askApiKey: value })
  },
  setWorkflowDesignerAllowCreateAgents: (v) => {
    saveBool(LS_WF_ALLOW_CREATE_AGENTS, !!v)
    set({ workflowDesignerAllowCreateAgents: !!v })
  },
}))

export function getStoredBackendBaseUrl() {
  return loadString(LS_BASE_URL)
}

export function getStoredAdminApiKey() {
  return loadString(LS_ADMIN_KEY)
}

export function getStoredAskApiKey() {
  return loadString(LS_ASK_KEY)
}

export function getStoredWorkflowDesignerAllowCreateAgents() {
  return loadBool(LS_WF_ALLOW_CREATE_AGENTS, true)
}
