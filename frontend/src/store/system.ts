import { create } from 'zustand'
import { api } from '../api/client'

type RunResult = any

type SystemState = {
  loading: boolean
  result?: RunResult
  ask: (question: string) => Promise<void>
}

export const useSystemStore = create<SystemState>((set) => ({
  loading: false,
  result: undefined,
  ask: async (question) => {
    set({ loading: true })
    const res = await api.post('/ask', { question })
    set({ result: res.data, loading: false })
  },
}))
