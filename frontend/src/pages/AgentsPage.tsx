import React, { useEffect, useMemo, useState } from 'react'
import Card from '../components/Card'
import Table from '../components/Table'
import { useAgentStore } from '../store/agents'
import { useSettingsStore } from '../store/settings'
import AgentEditor from '../components/AgentEditor'

export default function AgentsPage() {
  const { agents, load, create, setEnabled, update } = useAgentStore()
  const { providers, loadProviders } = useSettingsStore()

  // create form
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [provider, setProvider] = useState('avalai')
  const [model, setModel] = useState('avalai-small')
  const [temperature, setTemperature] = useState(0.2)
  const [maxTokens, setMaxTokens] = useState(1024)
  const [systemPrompt, setSystemPrompt] = useState('')

  useEffect(() => {
    load()
    loadProviders()
  }, [])

  const modelsForSelectedProvider = useMemo(() => {
    const p = (providers || []).find((x) => x.key === provider)
    return p?.models || []
  }, [providers, provider])

  useEffect(() => {
    if (!modelsForSelectedProvider.length) return
    if (!modelsForSelectedProvider.includes(model)) {
      setModel(modelsForSelectedProvider[0])
    }
  }, [modelsForSelectedProvider])

  // edit existing agent provider/model
  const [editAgentId, setEditAgentId] = useState('')
  const editAgent = agents.find((a) => a.id === editAgentId)
  const [editProvider, setEditProvider] = useState('')
  const [editModel, setEditModel] = useState('')

  const editModelsForProvider = useMemo(() => {
    const p = (providers || []).find((x) => x.key === editProvider)
    return p?.models || []
  }, [providers, editProvider])

  useEffect(() => {
    if (!editAgent) return
    setEditProvider(editAgent.provider)
    setEditModel(editAgent.model)
  }, [editAgentId])

  useEffect(() => {
    if (!editModelsForProvider.length) return
    if (!editModelsForProvider.includes(editModel)) {
      setEditModel(editModelsForProvider[0])
    }
  }, [editModelsForProvider])

  const onSaveAgentProviderModel = async () => {
    if (!editAgent) return
    await update(editAgent.id, { provider: editProvider, model: editModel })
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
    setRole('')
    setSystemPrompt('')
  }

  return (
    <div className="space-y-4">
      <Card title="Agents">
        <Table
          headers={["Name", "Role", "Model", "Provider", "Enabled", "Actions"]}
          rows={agents.map((a) => [
            a.name,
            a.role,
            a.model,
            a.provider,
            a.enabled ? 'Yes' : 'No',
            <button className="text-blue-600" onClick={() => setEnabled(a.id, !a.enabled)}>
              {a.enabled ? 'Disable' : 'Enable'}
            </button>,
          ])}
        />
      </Card>

      <Card title="Create Agent">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input className="border p-2" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="border p-2" placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} />

          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">Provider</label>
            <select
              className="border p-2"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              {(providers || []).map((p) => (
                <option key={p.key} value={p.key}>
                  {p.displayName || p.key}
                </option>
              ))}
              {(!providers || providers.length === 0) && <option value="avalai">avalai</option>}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">Model</label>
            <select className="border p-2" value={model} onChange={(e) => setModel(e.target.value)}>
              {(modelsForSelectedProvider.length ? modelsForSelectedProvider : [model]).map((m) => (
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
            disabled={!name.trim()}
            onClick={onCreate}
          >
            Create
          </button>
        </div>

        <div className="text-xs text-gray-500 mt-2">Note: creating/enabling/disabling requires ADMIN_API_KEY configured on the backend.</div>
      </Card>

      <Card title="Edit Agent Settings">
        <div className="space-y-2">
          <div className="text-xs text-gray-500">برای ذخیره‌سازی نیاز به ADMIN_API_KEY دارید.</div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">Agent</label>
              <select className="border p-2" value={editAgentId} onChange={(e) => setEditAgentId(e.target.value)}>
                <option value="">Select agent</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">Provider</label>
              <select className="border p-2" value={editProvider} onChange={(e) => setEditProvider(e.target.value)} disabled={!editAgentId}>
                {(providers || []).map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.displayName || p.key}
                  </option>
                ))}
                {(!providers || providers.length === 0) && <option value={editProvider || 'avalai'}>{editProvider || 'avalai'}</option>}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">Model</label>
              <select className="border p-2" value={editModel} onChange={(e) => setEditModel(e.target.value)} disabled={!editAgentId}>
                {(editModelsForProvider.length ? editModelsForProvider : editModel ? [editModel] : []).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button className="bg-blue-600 text-white px-3 py-2 rounded disabled:opacity-60" disabled={!editAgentId} onClick={onSaveAgentProviderModel}>
            Save Provider/Model
          </button>
        </div>
      </Card>

      <Card title="Edit Agent Prompt">
        <AgentEditor />
      </Card>
    </div>
  )
}