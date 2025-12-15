import React, { useEffect, useMemo, useState } from 'react'
import { useAgentStore } from '../store/agents'
import { api } from '../api/client'
import PromptDiffViewer from './PromptDiffViewer'
import { useClientSettingsStore } from '../store/clientSettings'
import { useAdminStatusStore } from '../store/adminStatus'

type PromptVersion = {
  agentId: string
  versionId: string
  system_prompt: string
  createdAt: number
  createdBy: 'meta' | 'admin'
  note?: string
}

function fmtTs(ts?: number) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return String(ts)
  }
}

export default function AgentEditor() {
  const { agents, update, load } = useAgentStore()
  const { adminApiKey } = useClientSettingsStore()
  const { status: adminStatus, load: loadAdminStatus } = useAdminStatusStore()
  const canUseAdmin = !!adminStatus?.enabled && (adminStatus.mode === 'insecure' || !!adminApiKey)
  const [selected, setSelected] = useState<string | null>(null)
  const agent = agents.find((a) => a.id === selected)
  const [prompt, setPrompt] = useState('')
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [error, setError] = useState<string>('')
  const [diffA, setDiffA] = useState<string>('')
  const [diffB, setDiffB] = useState<string>('')

  const handleSave = async () => {
    if (!canUseAdmin) return
    if (agent) {
      await update(agent.id, { system_prompt: prompt })
      await loadVersions(agent.id)
    }
  }

  const loadVersions = async (agentId: string) => {
    if (!canUseAdmin) return
    try {
      const res = await api.get(`/prompts/${encodeURIComponent(agentId)}/versions`)
      const list = (res.data || []) as PromptVersion[]
      setVersions(list)
      setError('')
    } catch (e: any) {
      setVersions([])
      setError(e?.response?.data?.error || e?.message || 'Failed to load prompt versions')
    }
  }

  useEffect(() => {
    loadAdminStatus()
  }, [])

  useEffect(() => {
    if (!agent?.id) return
    if (!canUseAdmin) return
    loadVersions(agent.id)
  }, [agent?.id, canUseAdmin])

  const versionsSorted = useMemo(() => {
    return [...(versions || [])].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  }, [versions])

  useEffect(() => {
    if (!versionsSorted.length) {
      setDiffA('')
      setDiffB('')
      return
    }
    const latest = versionsSorted[0]
    const prev = versionsSorted[1]
    setDiffA(latest?.versionId || '')
    setDiffB(prev?.versionId || latest?.versionId || '')
  }, [agent?.id, versionsSorted.length])

  const selectedA = versionsSorted.find((v) => v.versionId === diffA)
  const selectedB = versionsSorted.find((v) => v.versionId === diffB)

  const rollback = async (versionId: string) => {
    if (!canUseAdmin) return
    if (!agent) return
    try {
      await api.post(`/prompts/${encodeURIComponent(agent.id)}/rollback`, { versionId })
      await load()
      await loadVersions(agent.id)
      setError('')
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Rollback failed')
    }
  }

  return (
    <div className="card">
      <div className="flex gap-2 mb-2">
        <select
          value={selected || ''}
          onChange={(e) => {
            setSelected(e.target.value)
            setPrompt(agents.find((a) => a.id === e.target.value)?.system_prompt || '')
            setVersions([])
            setError('')
          }}
          className="border p-2 text-sm"
        >
          <option value="">Select agent</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <button onClick={handleSave} disabled={!canUseAdmin || !agent} className="bg-blue-600 text-white px-3 py-1 rounded text-sm disabled:opacity-60">
          Save Prompt
        </button>
      </div>
      {agent && (
        <div className="space-y-3">
          {!canUseAdmin && <div className="text-xs text-gray-500">برای ویرایش/نسخه‌بندی پرامپت، دسترسی ادمین لازم است.</div>}
          {error ? <div className="text-sm text-red-600">{error}</div> : null}

          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="w-full border p-2 h-32 text-sm" />

          <div className="border-t pt-3">
            <div className="font-semibold text-sm mb-2">Prompt Versions</div>
            {versionsSorted.length === 0 && <div className="text-sm text-gray-500">No versions.</div>}
            {versionsSorted.length > 0 && (
              <div className="space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-end">
                  <div className="flex flex-col">
                    <label className="text-xs text-gray-500 mb-1">Diff A</label>
                    <select className="border p-2 text-sm" value={diffA} onChange={(e) => setDiffA(e.target.value)}>
                      {versionsSorted.map((v) => (
                        <option key={v.versionId} value={v.versionId}>
                          {fmtTs(v.createdAt)} — {v.createdBy} {v.note ? `(${v.note})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs text-gray-500 mb-1">Diff B</label>
                    <select className="border p-2 text-sm" value={diffB} onChange={(e) => setDiffB(e.target.value)}>
                      {versionsSorted.map((v) => (
                        <option key={v.versionId} value={v.versionId}>
                          {fmtTs(v.createdAt)} — {v.createdBy} {v.note ? `(${v.note})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {selectedA && selectedB && <PromptDiffViewer a={selectedA.system_prompt} b={selectedB.system_prompt} />}

                <div className="space-y-1">
                  <div className="text-xs text-gray-500">Rollback creates a new version marked as rollback.</div>
                  <div className="flex flex-wrap gap-2">
                    {versionsSorted.slice(0, 5).map((v) => (
                      <button
                        key={v.versionId}
                        className="border px-3 py-1 rounded text-sm disabled:opacity-60"
                        disabled={!canUseAdmin}
                        onClick={() => rollback(v.versionId)}
                      >
                        Rollback to {fmtTs(v.createdAt)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
