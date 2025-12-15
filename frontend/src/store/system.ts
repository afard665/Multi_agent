import { create } from 'zustand'
import { api } from '../api/client'
import { AskResponse, LiveTraceEvent } from '../types'

type TraceStatus = 'idle' | 'connecting' | 'streaming' | 'done' | 'error'

type SystemState = {
  loading: boolean
  result?: AskResponse
  traceStatus: TraceStatus
  traceError?: string
  ask: (question: string, opts?: { stream?: boolean; workflowId?: string; workflow?: any }) => Promise<void>
  stopStreaming: () => void
  clear: () => void
}

let activeWs: WebSocket | null = null
let connectTimer: number | null = null
let idleTimer: number | null = null

function clearWsTimers() {
  if (connectTimer != null) window.clearTimeout(connectTimer)
  if (idleTimer != null) window.clearTimeout(idleTimer)
  connectTimer = null
  idleTimer = null
}

export const useSystemStore = create<SystemState>((set, get) => ({
  loading: false,
  result: undefined,
  traceStatus: 'idle',
  traceError: undefined,

  stopStreaming: () => {
    clearWsTimers()
    const live = get().result?.liveTrace
    if (live?.runId && live?.cancelToken) {
      api.post(`/runs/${encodeURIComponent(live.runId)}/cancel`, { cancelToken: live.cancelToken }).catch(() => {
        // ignore
      })
    }

    if (activeWs) {
      try {
        activeWs.close()
      } catch {
        // ignore
      }
      activeWs = null
    }
    set({ traceStatus: 'done', loading: false })
  },

  clear: () => {
    get().stopStreaming()
    set({ result: undefined, traceStatus: 'idle', traceError: undefined, loading: false })
  },

  ask: async (question, opts) => {
    // reset streaming for a new run
    get().stopStreaming()
    set({ loading: true, traceStatus: 'idle', traceError: undefined })

    const runNonStreaming = async (reason: string) => {
      try {
        const res = await api.post('/ask', { question, stream: false, workflowId: opts?.workflowId, workflow: opts?.workflow })
        const data = res.data as AskResponse
        set({
          result: data,
          loading: false,
          traceStatus: 'idle',
          traceError: reason,
        })
      } catch (err: any) {
        const msg = err?.response?.data?.error || err?.message || 'Request failed'
        set({ loading: false, traceStatus: 'error', traceError: `${reason} — ${String(msg)}`, result: undefined })
      }
    }

    let data: AskResponse
    try {
      const res = await api.post('/ask', { question, stream: !!opts?.stream, workflowId: opts?.workflowId, workflow: opts?.workflow })
      data = res.data
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Request failed'
      set({ loading: false, traceStatus: 'error', traceError: String(msg), result: undefined })
      return
    }

    // if streaming, start with empty trace and let WS fill it in
    set({
      result: {
        ...data,
        reasoningTrace: data.liveTrace ? [] : data.reasoningTrace,
      },
      loading: !!data.liveTrace,
      traceStatus: data.liveTrace ? 'connecting' : 'idle',
    })

    const wsUrl = data?.liveTrace?.wsUrl
    const runId = data?.liveTrace?.runId
    if (data.liveTrace && (!wsUrl || !runId)) {
      set({ loading: false, traceStatus: 'error', traceError: 'Live trace unavailable (missing wsUrl/runId)' })
      return
    }
    if (wsUrl && runId) {
      try {
        const url = new URL(wsUrl)
        url.searchParams.set('runId', runId)
        const ws = new WebSocket(url.toString())
        activeWs = ws

        clearWsTimers()
        connectTimer = window.setTimeout(() => {
          if (activeWs === ws && get().traceStatus === 'connecting') {
            try {
              ws.close()
            } catch {
              // ignore
            }
            activeWs = null
            clearWsTimers()
            void runNonStreaming('Live trace connection timed out; falling back to non-streaming')
          }
        }, 5000)

        ws.onopen = () => {
          if (connectTimer != null) window.clearTimeout(connectTimer)
          connectTimer = null
          if (idleTimer != null) window.clearTimeout(idleTimer)
          idleTimer = window.setTimeout(() => {
            if (activeWs === ws && (get().traceStatus === 'streaming' || get().traceStatus === 'connecting')) {
              try {
                ws.close()
              } catch {
                // ignore
              }
              activeWs = null
              clearWsTimers()
              void runNonStreaming('Live trace stalled; falling back to non-streaming')
            }
          }, 60_000)
          set({ traceStatus: 'streaming', traceError: undefined })
        }

        ws.onmessage = (evt) => {
          try {
            if (idleTimer != null) window.clearTimeout(idleTimer)
            idleTimer = window.setTimeout(() => {
              if (activeWs === ws && (get().traceStatus === 'streaming' || get().traceStatus === 'connecting')) {
                try {
                  ws.close()
                } catch {
                  // ignore
                }
                activeWs = null
                clearWsTimers()
                void runNonStreaming('Live trace stalled; falling back to non-streaming')
              }
            }, 60_000)

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
              set((s) => ({
                traceStatus: 'done',
                loading: false,
                result: s.result
                  ? {
                      ...s.result,
                      finalAnswer: msg.payload?.answer ?? s.result.finalAnswer,
                      confidence: msg.payload?.confidence ?? s.result.confidence,
                      metaExplanation: msg.payload?.justification ?? s.result.metaExplanation,
                      tokens: msg.payload?.tokens ?? s.result.tokens,
                      iterations: (s.result.reasoningTrace || []).length,
                    }
                  : s.result,
              }))
              try {
                ws.close()
              } catch {
                // ignore
              }
              activeWs = null
              clearWsTimers()
            }
            if (msg?.type === 'error') {
              set({ loading: false, traceStatus: 'error', traceError: msg.payload?.error || 'Run error' })
              try {
                ws.close()
              } catch {
                // ignore
              }
              activeWs = null
              clearWsTimers()
            }
          } catch {
            // ignore
          }
        }

        ws.onerror = () => {
          if (activeWs === ws) activeWs = null
          clearWsTimers()
          void runNonStreaming('Live trace WebSocket failed; falling back to non-streaming')
        }
        ws.onclose = () => {
          clearWsTimers()
          if (get().traceStatus === 'streaming') set({ traceStatus: 'done', loading: false })
          if (activeWs === ws) activeWs = null
        }
      } catch {
        void runNonStreaming('Failed to connect to live trace; falling back to non-streaming')
      }
    }
  },
}))
