import React, { useEffect, useMemo, useState } from 'react'
import Card from '../components/Card'
import { useClientSettingsStore } from '../store/clientSettings'
import { LlmProviderAdmin, useSettingsStore } from '../store/settings'
import AdminRequired from '../components/AdminRequired'
import { useAdminStatusStore } from '../store/adminStatus'

export default function SettingsPage() {
  const { config, error, load, update, providers, providersAdmin, loadProvidersAdmin, upsertProvider, deleteProvider, testProvider } = useSettingsStore()
  const {
    backendBaseUrl,
    adminApiKey,
    askApiKey,
    workflowDesignerAllowCreateAgents,
    setBackendBaseUrl,
    setAdminApiKey,
    setAskApiKey,
    setWorkflowDesignerAllowCreateAgents,
  } = useClientSettingsStore()

  const { status: adminStatus, load: loadAdminStatus } = useAdminStatusStore()
  const canUseAdmin = !!adminStatus?.enabled && (adminStatus.mode === 'insecure' || !!adminApiKey)

  const [clientDraft, setClientDraft] = useState(() => ({
    backendBaseUrl,
    adminApiKey,
    askApiKey,
  }))

  const clientDirty = useMemo(() => {
    return (
      clientDraft.backendBaseUrl !== backendBaseUrl ||
      clientDraft.adminApiKey !== adminApiKey ||
      clientDraft.askApiKey !== askApiKey
    )
  }, [
    clientDraft.backendBaseUrl,
    clientDraft.adminApiKey,
    clientDraft.askApiKey,
    backendBaseUrl,
    adminApiKey,
    askApiKey,
  ])

  useEffect(() => {
    if (clientDirty) return
    setClientDraft({ backendBaseUrl, adminApiKey, askApiKey })
  }, [backendBaseUrl, adminApiKey, askApiKey, clientDirty])

  const [showAdminApiKey, setShowAdminApiKey] = useState(false)
  const [showAskApiKey, setShowAskApiKey] = useState(false)

  const [maxIterations, setMaxIterations] = useState(5)
  const [maxTokens, setMaxTokens] = useState(2048)

  const WORKFLOW_DESIGNER_DEFAULT_PROMPT =
    'You are an expert workflow designer for a multi-agent LLM system. ' +
    'Design minimal, practical DAG workflows. Output strictly valid JSON only, matching the requested schema.'

  const [wfProvider, setWfProvider] = useState('')
  const [wfModel, setWfModel] = useState('')
  const [wfSystemPrompt, setWfSystemPrompt] = useState(WORKFLOW_DESIGNER_DEFAULT_PROMPT)
  const [wfTouched, setWfTouched] = useState(false)

  const [defaultProviderDraft, setDefaultProviderDraft] = useState('')
  const [defaultProviderTouched, setDefaultProviderTouched] = useState(false)

  useEffect(() => {
    load()
    loadAdminStatus()
  }, [])

  useEffect(() => {
    if (!canUseAdmin) return
    loadProvidersAdmin()
  }, [canUseAdmin])

  useEffect(() => {
    if (!config) return
    setMaxIterations(config.maxIterations)
    setMaxTokens(config.maxTokens)
  }, [config])

  const wfDirty = useMemo(() => {
    const cfg = config?.workflow_designer || {}
    const provider = (cfg.provider || '').trim()
    const model = (cfg.model || '').trim()
    const systemPrompt = (cfg.systemPrompt || WORKFLOW_DESIGNER_DEFAULT_PROMPT).trim()
    return wfProvider !== provider || wfModel !== model || wfSystemPrompt !== systemPrompt
  }, [config, wfProvider, wfModel, wfSystemPrompt])

  useEffect(() => {
    if (!config) return
    if (wfTouched) return
    const cfg = config.workflow_designer || {}
    setWfProvider((cfg.provider || '').trim())
    setWfModel((cfg.model || '').trim())
    setWfSystemPrompt(((cfg.systemPrompt || WORKFLOW_DESIGNER_DEFAULT_PROMPT) as string).trim())
  }, [config, wfTouched])

  useEffect(() => {
    if (!config) return
    if (defaultProviderTouched) return
    setDefaultProviderDraft((config.default_provider || '').trim())
  }, [config, defaultProviderTouched])

  const modelsForWorkflowProvider = useMemo(() => {
    const key = (wfProvider || '').trim()
    if (!key) return []
    const p = (providers || []).find((x) => x.key === key)
    return p?.models || []
  }, [providers, wfProvider])

  const onSave = async () => {
    if (!canUseAdmin) return
    await update({ maxIterations, maxTokens })
  }

  const serverDirty = useMemo(() => {
    if (!config) return false
    if (maxIterations !== config.maxIterations) return true
    if (maxTokens !== config.maxTokens) return true
    return false
  }, [config, maxIterations, maxTokens])

  const onCancelServer = () => {
    if (!config) return
    setMaxIterations(config.maxIterations)
    setMaxTokens(config.maxTokens)
  }

  const onSaveWorkflowDesigner = async () => {
    if (!canUseAdmin) return
    await update({
      workflow_designer: {
        provider: wfProvider,
        model: wfModel,
        systemPrompt: wfSystemPrompt,
      },
    })
    setWfTouched(false)
  }

  const onCancelWorkflowDesigner = () => {
    const cfg = config?.workflow_designer || {}
    setWfProvider((cfg.provider || '').trim())
    setWfModel((cfg.model || '').trim())
    setWfSystemPrompt(((cfg.systemPrompt || WORKFLOW_DESIGNER_DEFAULT_PROMPT) as string).trim())
    setWfTouched(false)
  }

  const defaultProviderDirty = useMemo(() => {
    const current = (config?.default_provider || '').trim()
    return defaultProviderDraft !== current
  }, [config, defaultProviderDraft])

  const onSaveDefaultProvider = async () => {
    if (!canUseAdmin) return
    await update({ default_provider: defaultProviderDraft })
    setDefaultProviderTouched(false)
  }

  const onCancelDefaultProvider = () => {
    setDefaultProviderDraft((config?.default_provider || '').trim())
    setDefaultProviderTouched(false)
  }

  const onSaveClient = () => {
    setBackendBaseUrl(clientDraft.backendBaseUrl)
    setAdminApiKey(clientDraft.adminApiKey)
    setAskApiKey(clientDraft.askApiKey)

    load()
    loadAdminStatus()
  }

  const onCancelClient = () => {
    setClientDraft({ backendBaseUrl, adminApiKey, askApiKey })
  }

  const [providerForm, setProviderForm] = useState<Omit<LlmProviderAdmin, 'key'>>({
    displayName: '',
    baseUrl: '',
    apiKey: '',
    models: [],
  })
  const [savingProvider, setSavingProvider] = useState(false)
  const [providerPreset, setProviderPreset] = useState<'openai_compatible' | 'avalai' | 'anthropic'>('openai_compatible')
  const [testingProvider, setTestingProvider] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [showProviderApiKey, setShowProviderApiKey] = useState(false)

  const setModelsFromText = (text: string) => {
    const models = text
      .split(/\r?\n|,/)
      .map((s) => s.trim())
      .filter(Boolean)
    setProviderForm((p) => ({ ...p, models }))
  }

  const onSaveProvider = async () => {
    const displayName = providerForm.displayName?.trim()
    const baseUrl = providerForm.baseUrl.trim()
    if (!baseUrl) return
    if (!canUseAdmin) return
    
    // Generate key from display name or base URL
    let key = ''
    if (displayName) {
      key = displayName.toLowerCase().replace(/[^a-z0-9]/g, '_')
    } else {
      // Extract from base URL as fallback
      try {
        const url = new URL(baseUrl)
        key = url.hostname.toLowerCase().replace(/[^a-z0-9]/g, '_')
      } catch {
        key = 'provider_' + Date.now()
      }
    }
    
    setSavingProvider(true)
    try {
      await upsertProvider(key, {
        displayName: displayName || undefined,
        baseUrl,
        apiKey: providerForm.apiKey.trim(),
        models: providerForm.models,
      })
    } finally {
      setSavingProvider(false)
    }
  }

  const onEditProvider = (p: LlmProviderAdmin) => {
    const keyLower = String(p.key || '').toLowerCase()
    const baseLower = String(p.baseUrl || '').toLowerCase()
    if (keyLower.startsWith('avalai') || baseLower.includes('avalai')) setProviderPreset('avalai')
    else if (keyLower.startsWith('anthropic') || baseLower.includes('anthropic')) setProviderPreset('anthropic')
    else setProviderPreset('openai_compatible')

    setProviderForm({
      displayName: p.displayName || '',
      baseUrl: p.baseUrl || '',
      apiKey: p.apiKey || '',
      models: Array.isArray(p.models) ? p.models : [],
    })
  }

  const onPresetChange = (preset: 'openai_compatible' | 'avalai' | 'anthropic') => {
    setProviderPreset(preset)
    setTestResult(null)
    if (preset === 'avalai') {
      setProviderForm((p) => ({ ...p, baseUrl: p.baseUrl?.trim() ? p.baseUrl : 'https://api.avalai.ir/v1' }))
    }
    if (preset === 'openai_compatible') {
      setProviderForm((p) => ({ ...p, baseUrl: p.baseUrl?.trim() ? p.baseUrl : 'https://api.openai.com/v1' }))
    }
  }

  const onTestProvider = async () => {
    if (!canUseAdmin) return
    const baseUrl = providerForm.baseUrl.trim()
    const apiKey = providerForm.apiKey.trim()
    if (!baseUrl) return
    setTestingProvider(true)
    setTestResult(null)
    try {
      const model = (providerForm.models || [])[0]
      const res = await testProvider({ baseUrl, apiKey, model, testChat: Boolean(model) })
      if (res?.ok) {
        const modelsCount = res.modelCount ?? (res.models || []).length
        const baseHint = res.baseUrlUsed ? ` (using ${res.baseUrlUsed})` : ''
        const chatHint = res.chatOk === true ? 'ok' : res.chatOk === false ? 'failed' : 'skipped'
        setTestResult({ ok: true, message: `Connected${baseHint}. Models: ${modelsCount}. Chat: ${chatHint}` })
      } else {
        const statusHint = res?.status ? ` (${res.status})` : ''
        const errMsg =
          res?.chatError?.error ||
          res?.modelsError?.error ||
          res?.error ||
          'Connection failed'
        const hint =
          res?.status === 404 ? ' Check Client → Backend Base URL and ensure the backend is running/restarted.' : ''
        setTestResult({ ok: false, message: `${String(errMsg)}${statusHint}${hint}` })
      }
    } finally {
      setTestingProvider(false)
    }
  }

  return (
    <div className="space-y-4">
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      <Card title="Client">
        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">Backend Base URL</label>
            <input
              className="border p-2"
              placeholder="http://localhost:3001"
              value={clientDraft.backendBaseUrl}
              onChange={(e) => setClientDraft((s) => ({ ...s, backendBaseUrl: e.target.value }))}
            />
            <div className="text-xs text-gray-500">
              Leave empty to use same-origin <code>/api</code> (dev proxy supported). If you set it, use only the server origin (e.g. <code>http://localhost:3001</code>) or end with <code>/api</code>.
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">Admin API Key</label>
            <div className="flex gap-2">
              <input
                className="border p-2 flex-1"
                type={showAdminApiKey ? 'text' : 'password'}
                placeholder="ADMIN_API_KEY"
                value={clientDraft.adminApiKey}
                onChange={(e) => setClientDraft((s) => ({ ...s, adminApiKey: e.target.value }))}
              />
              <button className="border px-3 text-sm" onClick={() => setShowAdminApiKey((v) => !v)}>
                {showAdminApiKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="text-xs text-gray-500">
              Stored in your browser localStorage and sent as <code>x-admin-key</code> header.
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">Ask API Key (optional)</label>
            <div className="flex gap-2">
              <input
                className="border p-2 flex-1"
                type={showAskApiKey ? 'text' : 'password'}
                placeholder="ASK_API_KEY"
                value={clientDraft.askApiKey}
                onChange={(e) => setClientDraft((s) => ({ ...s, askApiKey: e.target.value }))}
              />
              <button className="border px-3 text-sm" onClick={() => setShowAskApiKey((v) => !v)}>
                {showAskApiKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="text-xs text-gray-500">
              If the backend is configured with <code>ASK_API_KEY</code>, requests to <code>/api/ask</code> require <code>x-ask-key</code>.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="bg-blue-600 text-white px-3 py-2 rounded disabled:opacity-60" disabled={!clientDirty} onClick={onSaveClient}>
              Save Client Settings
            </button>
            <button className="text-sm text-gray-600 disabled:opacity-60" disabled={!clientDirty} onClick={onCancelClient}>
              Cancel
            </button>
          </div>

                  </div>
      </Card>

      <Card title="Server LLM Providers (Admin)">
        {!canUseAdmin && <AdminRequired feature="Server provider registry" mode={adminStatus?.mode} />}
        {canUseAdmin && (
        <div className="space-y-3">
          <div className="text-xs text-gray-500">
            این بخش داخل <code>config.json</code> سمت سرور ذخیره می‌شود.
          </div>

          <div className="text-xs text-gray-500">
            Provider endpoints must be OpenAI-compatible (<code>/models</code> and <code>/chat/completions</code>).
            AvalAI is supported via the same API shape.
            Anthropic (Claude) is not supported unless you are using an OpenAI-compatible gateway.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">Provider type</label>
              <select
                className="border p-2"
                value={providerPreset}
                onChange={(e) => onPresetChange(e.target.value as any)}
              >
                <option value="openai_compatible">OpenAI-compatible</option>
                <option value="avalai">AvalAI</option>
                <option value="anthropic">Anthropic (Claude)</option>
              </select>
            </div>
                        <input className="border p-2" placeholder="Display name (optional)" value={providerForm.displayName || ''} onChange={(e) => setProviderForm((p) => ({ ...p, displayName: e.target.value }))} />
            <input className="border p-2 md:col-span-2" placeholder="Base URL (e.g. https://api.openai.com/v1)" value={providerForm.baseUrl} onChange={(e) => setProviderForm((p) => ({ ...p, baseUrl: e.target.value }))} />
            <div className="md:col-span-2 flex gap-2">
              <input
                className="border p-2 flex-1"
                type={showProviderApiKey ? 'text' : 'password'}
                placeholder="API Key"
                value={providerForm.apiKey}
                onChange={(e) => setProviderForm((p) => ({ ...p, apiKey: e.target.value }))}
              />
              <button className="border px-3 text-sm" onClick={() => setShowProviderApiKey((v) => !v)}>
                {showProviderApiKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <textarea
              className="border p-2 md:col-span-2 h-24"
              placeholder="Models (comma or newline separated)"
              value={(providerForm.models || []).join('\n')}
              onChange={(e) => setModelsFromText(e.target.value)}
            />
          </div>

          <div className="text-xs text-gray-500">
            Models are auto-synced from <code>{'<baseUrl>'}/models</code> when you click <b>Save Provider</b>.
            If your provider blocks <code>/models</code>, you can still enter models manually.
          </div>

          <div className="flex items-center gap-2">
            <button
              className="bg-blue-600 text-white px-3 py-2 rounded disabled:opacity-60"
              disabled={savingProvider || !providerForm.baseUrl.trim()}
              onClick={onSaveProvider}
            >
              {savingProvider ? 'Saving…' : 'Save Provider'}
            </button>
            <button
              className="border px-3 py-2 rounded text-sm disabled:opacity-60"
              disabled={testingProvider || !providerForm.baseUrl.trim() || providerPreset === 'anthropic'}
              onClick={onTestProvider}
            >
              {testingProvider ? 'Testing…' : 'Test Connection'}
            </button>
            <button className="text-sm text-gray-600" onClick={() => { setProviderForm({ displayName: '', baseUrl: '', apiKey: '', models: [] }) }}>
              Clear
            </button>
          </div>

          {testResult && (
            <div className={testResult.ok ? 'text-sm text-green-700' : 'text-sm text-red-600'}>
              {testResult.message}
            </div>
          )}

          <div className="border-t pt-3" />

          <div className="font-semibold">Saved Providers</div>
          <div className="border rounded p-3 bg-gray-50">
            <div className="font-semibold text-sm mb-2">Default provider</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-end">
              <div className="flex flex-col">
                <label className="text-xs text-gray-500 mb-1">Provider</label>
                <select
                  className="border p-2"
                  value={defaultProviderDraft}
                  onChange={(e) => {
                    setDefaultProviderDraft(e.target.value)
                    setDefaultProviderTouched(true)
                  }}
                  disabled={!canUseAdmin}
                >
                  <option value="">Auto (cheapest)</option>
                  {(providersAdmin || []).map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.displayName || p.key}
                    </option>
                  ))}
                  {!!defaultProviderDraft &&
                    (providersAdmin || []).length > 0 &&
                    !(providersAdmin || []).some((p) => p.key === defaultProviderDraft) && (
                      <option value={defaultProviderDraft}>{defaultProviderDraft}</option>
                    )}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="bg-blue-600 text-white px-3 py-2 rounded disabled:opacity-60"
                  disabled={!canUseAdmin || !defaultProviderDirty}
                  onClick={onSaveDefaultProvider}
                >
                  Save
                </button>
                <button
                  className="text-sm text-gray-600 disabled:opacity-60"
                  disabled={!defaultProviderDirty}
                  onClick={onCancelDefaultProvider}
                >
                  Cancel
                </button>
              </div>
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Used as the default for agents created by the AI workflow designer (and other auto-fill defaults in the UI).
            </div>
          </div>

          <div className="space-y-2">
            {(providersAdmin || []).length === 0 && <div className="text-sm text-gray-500">No providers saved.</div>}
            {(providersAdmin || []).map((p) => (
              <div key={p.key} className="border rounded p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm flex items-center gap-2">
                      <span>{p.displayName || p.key}</span>
                      {!!(config?.default_provider || '').trim() && (config?.default_provider || '').trim() === p.key && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Default</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">{p.baseUrl}</div>
                    <div className="text-xs text-gray-500">Models: {(p.models || []).join(', ') || '-'}</div>
                    <div className="text-xs text-gray-500">API Key: {p.apiKey ? 'set' : 'empty'}</div>
                  </div>
                  <div className="flex gap-3">
                    <button className="text-sm text-blue-600" onClick={() => onEditProvider(p)}>Edit</button>
                    <button className="text-sm text-red-600" onClick={() => deleteProvider(p.key)}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        )}
      </Card>

      <Card title="Config">
        {!canUseAdmin && <div className="mb-3"><AdminRequired feature="Server config changes" mode={adminStatus?.mode} /></div>}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="w-40">Max Iterations (cap)</label>
            <input type="number" min={1} value={maxIterations} onChange={(e) => setMaxIterations(Number(e.target.value))} className="border p-2" />
          </div>
          <div className="text-xs text-gray-500">
            The orchestrator picks an iteration budget per ask, up to this cap.
          </div>

          <div className="flex items-center gap-2">
            <label className="w-40">Max Tokens</label>
            <input type="number" min={1} value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} className="border p-2" />
          </div>

          <div className="flex items-center gap-2">
            <button className="bg-blue-600 text-white px-3 py-2 rounded disabled:opacity-60" disabled={!canUseAdmin || !serverDirty} onClick={onSave}>
              Save
            </button>
            <button className="text-sm text-gray-600 disabled:opacity-60" disabled={!serverDirty} onClick={onCancelServer}>
              Cancel
            </button>
          </div>

          {adminStatus?.mode === 'key' && <div className="text-xs text-gray-500">Note: saving requires ADMIN_API_KEY configured on the backend.</div>}
        </div>
      </Card>

      <Card title="Workflow Designer (AI)">
        {!canUseAdmin && <div className="mb-3"><AdminRequired feature="Workflow designer settings" mode={adminStatus?.mode} /></div>}
        <div className="space-y-3">
          <div className="text-xs text-gray-500">
            Controls the provider/model/system prompt used by <code>/api/workflows/suggest</code>.
          </div>

          <div className="border rounded p-3 bg-gray-50">
            <div className="font-semibold text-sm mb-2">Ask page behavior</div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={workflowDesignerAllowCreateAgents}
                onChange={(e) => setWorkflowDesignerAllowCreateAgents(e.target.checked)}
                disabled={!canUseAdmin}
              />
              <span>
                Allow the AI designer to create missing agents (<code>allowCreateAgents</code>)
              </span>
            </label>
            <div className="text-xs text-gray-500 mt-2">
              Stored in your browser localStorage. When enabled (and admin access is available), the designer may create up to 3 new agents if needed.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">Provider</label>
              <select
                className="border p-2"
                value={wfProvider}
                onChange={(e) => {
                  const next = e.target.value
                  setWfProvider(next)
                  setWfModel('')
                  setWfTouched(true)
                }}
                disabled={!canUseAdmin}
              >
                <option value="">Auto (cheapest)</option>
                {(providers || []).map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.displayName || p.key}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">Model</label>
              <select
                className="border p-2"
                value={wfModel}
                onChange={(e) => {
                  setWfModel(e.target.value)
                  setWfTouched(true)
                }}
                disabled={!canUseAdmin || !wfProvider}
              >
                <option value="">Auto (provider default)</option>
                {modelsForWorkflowProvider.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
                {!!wfProvider && !!wfModel && !modelsForWorkflowProvider.includes(wfModel) && (
                  <option value={wfModel}>{wfModel}</option>
                )}
              </select>
              {!wfProvider && <div className="text-xs text-gray-500 mt-1">Select a provider to choose a model.</div>}
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-gray-500 mb-1">System Prompt</label>
              <textarea
                className="border p-2 w-full h-32 text-sm"
                value={wfSystemPrompt}
                onChange={(e) => {
                  setWfSystemPrompt(e.target.value)
                  setWfTouched(true)
                }}
                disabled={!canUseAdmin}
              />
              <div className="text-xs text-gray-500 mt-1">
                This is the system message for the workflow designer. Keep it strict: JSON-only output, DAG-only, minimal agents.
              </div>
              <button
                className="text-sm text-blue-600 mt-2 disabled:opacity-60"
                disabled={!canUseAdmin}
                onClick={() => {
                  setWfSystemPrompt(WORKFLOW_DESIGNER_DEFAULT_PROMPT)
                  setWfTouched(true)
                }}
              >
                Reset to default prompt
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="bg-blue-600 text-white px-3 py-2 rounded disabled:opacity-60" disabled={!canUseAdmin || !wfDirty} onClick={onSaveWorkflowDesigner}>
              Save
            </button>
            <button className="text-sm text-gray-600 disabled:opacity-60" disabled={!wfDirty} onClick={onCancelWorkflowDesigner}>
              Cancel
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}
