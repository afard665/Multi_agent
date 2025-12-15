import { create } from 'zustand'

const LS_BASIC_AUTH_HEADER = 'auth.basicAuthHeader'

const EXPECTED_USER = 'admin'
const EXPECTED_PASSWORD = 'amin@1005'

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

function makeBasicAuthHeader(username: string, password: string) {
  const token = btoa(`${username}:${password}`)
  return `Basic ${token}`
}

export type AuthState = {
  basicAuthHeader: string
  isAuthenticated: boolean
  login: (username: string, password: string) => { ok: boolean; error?: string }
  logout: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  basicAuthHeader: loadString(LS_BASIC_AUTH_HEADER),
  isAuthenticated: !!loadString(LS_BASIC_AUTH_HEADER),
  login: (username, password) => {
    const u = username.trim()
    const p = password

    if (u !== EXPECTED_USER || p !== EXPECTED_PASSWORD) {
      return { ok: false, error: 'Invalid username or password' }
    }

    const header = makeBasicAuthHeader(EXPECTED_USER, EXPECTED_PASSWORD)
    saveString(LS_BASIC_AUTH_HEADER, header)
    set({ basicAuthHeader: header, isAuthenticated: true })
    return { ok: true }
  },
  logout: () => {
    saveString(LS_BASIC_AUTH_HEADER, '')
    set({ basicAuthHeader: '', isAuthenticated: false })
  },
}))

export function getStoredBasicAuthHeader() {
  return loadString(LS_BASIC_AUTH_HEADER)
}

