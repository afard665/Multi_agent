import { create } from 'zustand'
import { api } from '../api/client'

export type AdminStatus = {
  enabled: boolean
  mode: 'key' | 'insecure' | 'disabled'
}

type AdminStatusState = {
  status?: AdminStatus
  error?: string
  load: () => Promise<void>
}

export const useAdminStatusStore = create<AdminStatusState>((set) => ({
  status: undefined,
  error: undefined,
  load: async () => {
    try {
      const res = await api.get('/admin/status')
      set({ status: res.data, error: undefined })
    } catch (e: any) {
      set({ status: undefined, error: e?.message || 'Failed to load admin status' })
    }
  },
}))

