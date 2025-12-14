import { create } from 'zustand'
import { api } from '../api/client'
import { AskResponse, LiveTraceEvent } from '../types'

type TraceStatus = 'idle' | 'connecting' | 'streaming' | 'done' | 'error'

type SystemState = {
  loading: boolean
  result?: AskResponse
  traceStatus: TraceStatus
  traceError?: string
  ask: (question: string, opts?: { stream?: boolean }) => Promise<void>
  stopStreaming: () => void
  clear: () => void
}

let activeWs: WebSocket | null = null

export const useSystemStore = create<SystemState>((set, get) => ({
  loading: false,
  result: undefined,
  traceStatus: 'idle',
  traceError: undefined,

  stopStreaming: () => {
    if (activeWs) {
      try {
        activeWs.close()
      } catch {
        // ignore
      }
      activeWs = null
    }
    set({ traceStatus: 'done' })
  },

  clear: () => {
    get().stopStreaming()
    set({ result: undefined, traceStatus: 'idle', traceError: undefined, loading: false })
  },

  ask: async (question, opts) => {
    // reset streaming for a new run
    get().stopStreaming()
    set({ loading: true, traceStatus: 'idle', traceError: undefined })

    const res = await api.post('/ask', { question, stream: !!opts?.stream })
    const data: AskResponse = res.data

    // if streaming, start with empty trace and let WS fill it in
    set({
      result: {
        ...data,
        reasoningTrace: data.liveTrace ? [] : data.reasoningTrace,
      },
      loading: false,
      traceStatus: data.liveTrace ? 'connecting' : 'idle',
    })

    const wsUrl = data?.liveTrace?.wsUrl
    const runId = data?.liveTrace?.runId
    if (wsUrl && runId) {
      try {
        const url = new URL(wsUrl)
        url.searchParams.set('runId', runId)
        const ws = new WebSocket(url.toString())
        activeWs = ws

        ws.onopen = () => set({ traceStatus: 'streaming' })

        ws.onmessage = (evt) => {
          try {
            const msg: LiveTraceEvent = JSON.parse(evt.data)
            if (msg?.type === 'iteration') {
              set((s) => ({
                result: {
                  ...(s.result as any),
                  reasoningTrace: [...((s.result?.reasoningTrace || []) as any[]), msg.payload],
                },
              }))
            }
            if (msg?.type === 'final') {
              set({ traceStatus: 'done' })
              try {
                ws.close()
              } catch {
                // ignore
              }
              activeWs = null
            }
          } catch {
            // ignore
          }
        }

        ws.onerror = () => set({ traceStatus: 'error', traceError: 'WebSocket error' })
        ws.onclose = () => {
          if (get().traceStatus === 'streaming') set({ traceStatus: 'done' })
          if (activeWs === ws) activeWs = null
        }
      } catch {
        set({ traceStatus: 'error', traceError: 'Failed to connect to live trace' })
      }
    }
  },
}))