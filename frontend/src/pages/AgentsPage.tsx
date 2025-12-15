import React, { useEffect, useMemo, useState } from 'react'
import Card from '../components/Card'
import Table from '../components/Table'
import { useAgentStore } from '../store/agents'
import { useSettingsStore } from '../store/settings'
import { useClientSettingsStore } from '../store/clientSettings'
import AdminRequired from '../components/AdminRequired'
import { useAdminStatusStore } from '../store/adminStatus'

export default function AgentsPage() {
  const { agents, error: agentsError, load: loadAgents, create, setEnabled, update, remove } = useAgentStore()
  const { providers, config, load: loadConfig } = useSettingsStore()
  const { adminApiKey, backendBaseUrl } = useClientSettingsStore()
  const { status: adminStatus, load: loadAdminStatus } = useAdminStatusStore()

  // create form
  const [name, setName] = useState('')
  const [role, setRole] = useState('responder')
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [temperature, setTemperature] = useState(0.2)
  const [maxTokens, setMaxTokens] = useState(1024)
  const [systemPrompt, setSystemPrompt] = useState('')

  const roleOptions = [
    { value: 'responder', label: 'responder' },
    { value: 'critic', label: 'critic' },
    { value: 'opponent', label: 'opponent' },
    { value: 'scoring_agent', label: 'scoring_agent' },
    { value: 'domain_expert', label: 'domain_expert' },
    { value: 'fact_checker', label: 'fact_checker' },
    { value: 'self_verifier', label: 'self_verifier' },
  ]

  useEffect(() => {
    loadAdminStatus()
  }, [adminApiKey, backendBaseUrl])

  const canUseAdmin = !!adminStatus?.enabled && (adminStatus.mode === 'insecure' || !!adminApiKey)

  useEffect(() => {
    if (!canUseAdmin) return
    loadAgents()
    loadConfig()
  }, [canUseAdmin])

  useEffect(() => {
    if (!(providers || []).length) return
    const keys = new Set((providers || []).map((p) => p.key))
    const configuredDefault = (config?.default_provider || '').trim()
    const desiredDefault = configuredDefault && keys.has(configuredDefault) ? configuredDefault : providers[0].key
    if (!provider || !keys.has(provider)) {
      setProvider(desiredDefault)
    }
  }, [providers, config?.default_provider])

  const modelsForSelectedProvider = useMemo(() => {
    const p = (providers || []).find((x) => x.key === provider)
    return p?.models || []
  }, [providers, provider])

  useEffect(() => {
    if (!modelsForSelectedProvider.length) {
      if (model) setModel('')
      return
    }
    if (!modelsForSelectedProvider.includes(model)) {
      setModel(modelsForSelectedProvider[0])
    }
  }, [modelsForSelectedProvider])

  const modelsForProvider = (providerKey: string) => {
    const p = (providers || []).find((x) => x.key === providerKey)
    return Array.isArray(p?.models) ? p!.models : []
  }

  const [rowDrafts, setRowDrafts] = useState<Record<string, { provider: string; model: string }>>({})

  useEffect(() => {
    setRowDrafts((prev) => {
      const next = { ...prev }
      for (const a of agents || []) {
        if (!next[a.id]) {
          next[a.id] = { provider: a.provider || '', model: a.model || '' }
        }
      }
      // prune removed agents
      for (const id of Object.keys(next)) {
        if (!(agents || []).some((a) => a.id === id)) delete next[id]
      }
      return next
    })
  }, [agents])

  const setRowProvider = (agentId: string, providerKey: string) => {
    setRowDrafts((s) => {
      const prev = s[agentId] || { provider: '', model: '' }
      const nextModels = modelsForProvider(providerKey)
      const nextModel = nextModels.length ? nextModels[0] : ''
      return { ...s, [agentId]: { provider: providerKey, model: nextModel } }
    })
  }

  const setRowModel = (agentId: string, modelKey: string) => {
    setRowDrafts((s) => ({ ...s, [agentId]: { ...(s[agentId] || { provider: '', model: '' }), model: modelKey } }))
  }

  const saveRowProviderModel = async (agentId: string) => {
    const a = (agents || []).find((x) => x.id === agentId)
    if (!a) return
    const d = rowDrafts[agentId]
    if (!d) return
    await update(agentId, { provider: d.provider, model: d.model })
  }

  const [promptAgentId, setPromptAgentId] = useState<string | null>(null)
  const promptAgent = useMemo(() => (agents || []).find((a) => a.id === promptAgentId) || null, [agents, promptAgentId])
  const [promptDraft, setPromptDraft] = useState('')

  useEffect(() => {
    if (!promptAgentId) return
    setPromptDraft(promptAgent?.system_prompt || '')
  }, [promptAgentId])

  const onSavePrompt = async () => {
    if (!promptAgentId) return
    await update(promptAgentId, { system_prompt: promptDraft })
    setPromptAgentId(null)
  }

  const onCreate = async () => {
    await create({
      name,
      role,
      provider,
      model,
      temperature,
      max_tokens: maxTokens,
      system_prompt: systemPrompt,
      enabled: true,
    } as any)
    setName('')
    setRole('responder')
    setSystemPrompt('')
  }

  const onDeleteAgent = async (agentId: string) => {
    const a = (agents || []).find((x) => x.id === agentId)
    const label = a?.name ? `${a.name} (${a.id})` : agentId
    const ok = window.confirm(`Delete agent ${label}?\n\nThis may break workflows that reference it.`)
    if (!ok) return
    await remove(agentId)
    if (promptAgentId === agentId) setPromptAgentId(null)
  }

  return (
    <div className="space-y-4">
      {!canUseAdmin && (
        <Card title="Agents">
          <AdminRequired feature="Agents management" mode={adminStatus?.mode} />
        </Card>
      )}

      {canUseAdmin && (
      <Card title="Agents">
        {agentsError ? <div className="text-sm text-red-600 mb-2">{agentsError}</div> : null}
        <Table
          headers={["Name", "Role", "Provider", "Model", "Enabled", "Actions"]}
          rowKeys={agents.map((a) => a.id)}
          rows={agents.map((a) => [
            a.name,
            a.role,
            <select
              className="border p-2 text-sm"
              value={rowDrafts[a.id]?.provider ?? a.provider}
              onChange={(e) => setRowProvider(a.id, e.target.value)}
            >
              {(providers || []).map((p) => (
                <option key={p.key} value={p.key}>
                  {p.displayName || p.key}
                </option>
              ))}
              {!!(rowDrafts[a.id]?.provider ?? a.provider) &&
                (providers || []).length > 0 &&
                !(providers || []).some((p) => p.key === (rowDrafts[a.id]?.provider ?? a.provider)) && (
                  <option value={rowDrafts[a.id]?.provider ?? a.provider}>{rowDrafts[a.id]?.provider ?? a.provider}</option>
                )}
            </select>,
            <select
              className="border p-2 text-sm"
              value={rowDrafts[a.id]?.model ?? a.model}
              onChange={(e) => setRowModel(a.id, e.target.value)}
              disabled={!modelsForProvider(rowDrafts[a.id]?.provider ?? a.provider).length}
            >
              {(() => {
                const pKey = rowDrafts[a.id]?.provider ?? a.provider
                const models = modelsForProvider(pKey)
                if (!models.length) {
                  return <option value="">No models</option>
                }
                return models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))
              })()}
            </select>,
            a.enabled ? 'Yes' : 'No',
            <div className="flex flex-wrap gap-3 items-center">
              <button className="text-blue-600" onClick={() => setEnabled(a.id, !a.enabled)}>
                {a.enabled ? 'Disable' : 'Enable'}
              </button>
              <button className="text-blue-600" onClick={() => setPromptAgentId(a.id)}>
                Prompt
              </button>
              <button
                className="text-blue-600 disabled:opacity-60"
                disabled={
                  (rowDrafts[a.id]?.provider ?? a.provider) === a.provider &&
                  (rowDrafts[a.id]?.model ?? a.model) === a.model
                }
                onClick={() => saveRowProviderModel(a.id)}
              >
                Save
              </button>
              <button className="text-red-600" onClick={() => onDeleteAgent(a.id)}>
                Delete
              </button>
            </div>,
          ])}
        />
      </Card>
      )}

      <Card title="Create Agent">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input className="border p-2" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">Role</label>
            <select className="border p-2" value={role} onChange={(e) => setRole(e.target.value)}>
              {roleOptions.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">Provider</label>
            <select
              className="border p-2"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              disabled={!canUseAdmin}
            >
              {(providers || []).map((p) => (
                <option key={p.key} value={p.key}>
                  {p.displayName || p.key}
                </option>
              ))}
              {(!providers || providers.length === 0) && <option value={provider || ''}>{provider || 'No providers configured'}</option>}
              {!!provider && (providers || []).length > 0 && !(providers || []).some((p) => p.key === provider) && (
                <option value={provider}>{provider}</option>
              )}
            </select>
            {(!providers || providers.length === 0) && (
              <div className="text-xs text-gray-500 mt-1">
                Add providers in <code>Settings</code> -&gt; <code>Server LLM Providers (Admin)</code>.
              </div>
            )}
          </div>

          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">Model</label>
            <select className="border p-2" value={model} onChange={(e) => setModel(e.target.value)} disabled={!canUseAdmin}>
              {(modelsForSelectedProvider.length ? modelsForSelectedProvider : model ? [model] : []).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <input className="border p-2" type="number" placeholder="Temperature" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} />
          <input className="border p-2" type="number" placeholder="Max tokens" value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} />

          <textarea className="border p-2 md:col-span-2 h-28" placeholder="System prompt" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
        </div>

        <div className="mt-3">
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-60"
            disabled={!canUseAdmin || !name.trim() || !role || !provider || !model}
            onClick={onCreate}
          >
            Create
          </button>
        </div>
      </Card>

      {promptAgentId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded shadow-lg w-full max-w-2xl">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-semibold">Edit Prompt: {promptAgent?.name || promptAgentId}</div>
              <button className="text-sm text-gray-600" onClick={() => setPromptAgentId(null)}>
                Close
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-xs text-gray-500">This updates <code>system_prompt</code> for the selected agent.</div>
              <textarea className="w-full border p-2 h-64 text-sm" value={promptDraft} onChange={(e) => setPromptDraft(e.target.value)} />
              <div className="flex items-center gap-2 justify-end">
                <button className="text-sm text-gray-600" onClick={() => setPromptAgentId(null)}>
                  Cancel
                </button>
                <button className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-60" disabled={!canUseAdmin} onClick={onSavePrompt}>
                  Save Prompt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
