import axios from 'axios'
import {
  getStoredAdminApiKey,
  getStoredBackendBaseUrl,
  getStoredLlmApiKey,
  getStoredLlmBaseUrl,
  getStoredLlmProvider,
} from '../store/clientSettings'

const baseURL = (() => {
  const stored = getStoredBackendBaseUrl()
  if (!stored) return '/api'
  return stored.replace(/\/+$/, '') + '/api'
})()

export const api = axios.create({ baseURL })

api.interceptors.request.use((config) => {
  config.headers = config.headers || {}

  const adminKey = getStoredAdminApiKey()
  if (adminKey) {
    ;(config.headers as any)['x-admin-key'] = adminKey
  }

  const llmProvider = getStoredLlmProvider()
  if (llmProvider) {
    ;(config.headers as any)['x-llm-provider'] = llmProvider
  }

  const llmApiKey = getStoredLlmApiKey()
  if (llmApiKey) {
    ;(config.headers as any)['x-llm-api-key'] = llmApiKey
  }

  const llmBaseUrl = getStoredLlmBaseUrl()
  if (llmBaseUrl) {
    ;(config.headers as any)['x-llm-base-url'] = llmBaseUrl
  }

  return config
})