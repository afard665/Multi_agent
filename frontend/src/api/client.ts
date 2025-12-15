import axios from 'axios'
import {
  getStoredAdminApiKey,
  getStoredAskApiKey,
  getStoredBackendBaseUrl,
} from '../store/clientSettings'
import { getStoredBasicAuthHeader } from '../store/auth'

function getApiBaseUrl() {
  const stored = getStoredBackendBaseUrl()
  if (!stored) return '/api'
  const normalized = stored.replace(/\/+$/, '')
  if (normalized.endsWith('/api')) return normalized

  // If user pasted a full endpoint (or anything under /api), normalize back to the API root.
  // Examples:
  // - http://localhost:3001/api/providers/test  => http://localhost:3001/api
  // - http://localhost:3001/api/v1            => http://localhost:3001/api
  const m = normalized.match(/\/api(\/|$)/)
  if (m && typeof m.index === 'number') {
    return normalized.slice(0, m.index) + '/api'
  }

  return normalized + '/api'
}

export const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  config.headers = config.headers || {}

  config.baseURL = getApiBaseUrl()

  const adminKey = getStoredAdminApiKey()
  if (adminKey) {
    ;(config.headers as any)['x-admin-key'] = adminKey
  }

  const askKey = getStoredAskApiKey()
  if (askKey) {
    ;(config.headers as any)['x-ask-key'] = askKey
  }

  const basicAuth = getStoredBasicAuthHeader()
  if (basicAuth && !(config.headers as any)['Authorization'] && !(config.headers as any)['authorization']) {
    ;(config.headers as any)['Authorization'] = basicAuth
  }


  return config
})
