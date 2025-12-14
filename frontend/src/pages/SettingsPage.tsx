import React, { useEffect, useMemo, useState } from 'react'
import Card from '../components/Card'
import { useClientSettingsStore } from '../store/clientSettings'
import { LlmProviderAdmin, useSettingsStore } from '../store/settings'

type Rate = { input: number; output: number; reasoning: number }

type RateRow = { key: string; input: number; output: number; reasoning: number }

export default function SettingsPage() {
  const { config, load, update, providersAdmin, loadProvidersAdmin, upsertProvider, deleteProvider } = useSettingsStore()
  const {
    backendBaseUrl,
    adminApiKey,
    llmProvider,
    llmApiKey,
    llmBaseUrl,
    setBackendBaseUrl,
    setAdminApiKey,
    setLlmProvider,
    setLlmApiKey,
    setLlmBaseUrl,
  } = useClientSettingsStore()

  const [maxIterations, setMaxIterations] = useState(5)
  const [maxTokens, setMaxTokens] = useState(2048)
  const [providerRates, setProviderRates] = useState<Record<string, Rate>>({
    default: { input: 0.000001, output: 0.000001, reasoning: 0.000001 },
  })

  useEffect(() => {
    load()
    loadProvidersAdmin()
  }, [])

  useEffect(() => {
    if (!config) return
    setMaxIterations(config.maxIterations)
    setMaxTokens(config.maxTokens)
    setProviderRates(config.provider_rates || providerRates)
  }, [config])

  const rows: RateRow[] = useMemo(() => {
    return Object.entries(providerRates || {}).map(([key, r]) => ({ key, input: r.input, output: r.output, reasoning: r.reasoning }))
  }, [providerRates])

  const setRow = (key: string, patch: Partial<Rate>) => {
    setProviderRates((s) => ({
      ...s,
      [key]: {
        input: s[key]?.input ?? 0,
        output: s[key]?.output ?? 0,
        reasoning: s[key]?.reasoning ?? 0,
        ...patch,
      },
    }))
  }

  const addProvider = () => {
    const key = prompt('Provider key (e.g. openai, anthropic, groq):')
    if (!key) return
    if (providerRates[key]) return
    setProviderRates((s) => ({ ...s, [key]: { ...s.default } }))
  }

  const removeProvider = (key: string) => {
    if (key === 'default') return
    setProviderRates((s) => {
      const next = { ...s }
      delete next[key]
      return next
    })
  }

  const onSave = async () => {
    await update({ maxIterations, maxTokens, provider_rates: providerRates })
  }

  const [providerForm, setProviderForm] = useState<Omit<LlmProviderAdmin, 'key'>>({
    displayName: '',
    baseUrl: '',
    apiKey: '',
    models: [],
  })
  const [providerKey, setProviderKey] = useState('')

  const setModelsFromText = (text: string) => {
    const models = text
      .split(/\r?\n|,/)
      .map((s) => s.trim())
      .filter(Boolean)
    setProviderForm((p) => ({ ...p, models }))
  }

  const onSaveProvider = async () => {
    const key = providerKey.trim()
    if (!key) return
    await upsertProvider(key, {
      displayName: providerForm.displayName?.trim() || undefined,
      baseUrl: providerForm.baseUrl.trim(),
      apiKey: providerForm.apiKey.trim(),
      models: providerForm.models,
    })
    setProviderKey('')
    setProviderForm({ displayName: '', baseUrl: '', apiKey: '', models: [] })
  }

  const onEditProvider = (p: LlmProviderAdmin) => {
    setProviderKey(p.key)
    setProviderForm({
      displayName: p.displayName || '',
      baseUrl: p.baseUrl || '',
      apiKey: p.apiKey || '',
      models: Array.isArray(p.models) ? p.models : [],
    })
  }

  return (
    <div className="space-y-4">
      <Card title="Client">
        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">Backend Base URL</label>
            <input
              className="border p-2"
              placeholder="http://localhost:3001"
              value={backendBaseUrl}
              onChange={(e) => setBackendBaseUrl(e.target.value)}
            />
            <div className="text-xs text-gray-500">
              Leave empty to use same-origin <code>/api</code>.
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">Admin API Key</label>
            <input
              className="border p-2"
              placeholder="ADMIN_API_KEY"
              value={adminApiKey}
              onChange={(e) => setAdminApiKey(e.target.value)}
            />
            <div className="text-xs text-gray-500">
              Stored in your browser localStorage and sent as <code>x-admin-key</code> header.
            </div>
          </div>

          <div className="border-t pt-4" />

          <div className="text-sm font-semibold">LLM Overrides (per request)</div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">Provider</label>
            <input className="border p-2" placeholder="avalai / openai / mock" value={llmProvider} onChange={(e) => setLlmProvider(e.target.value)} />
            <div className="text-xs text-gray-500">Sent as <code>x-llm-provider</code> header. Leave empty to use server config.</div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">API Key</label>
            <input className="border p-2" placeholder="sk-..." value={llmApiKey} onChange={(e) => setLlmApiKey(e.target.value)} />
            <div className="text-xs text-gray-500">Sent as <code>x-llm-api-key</code> header. Leave empty to use server env.</div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">Base URL</label>
            <input
              className="border p-2"
              placeholder="https://api.openai.com/v1"
              value={llmBaseUrl}
              onChange={(e) => setLlmBaseUrl(e.target.value)}
            />
            <div className="text-xs text-gray-500">Sent as <code>x-llm-base-url</code> header. Leave empty to use server env.</div>
          </div>

          <div className="text-xs text-gray-500">
            Note: these are stored in localStorage and used by the backend for this request only.
          </div>
        </div>
      </Card>

      <Card title="Server LLM Providers (Admin)">
        <div className="space-y-3">
          <div className="text-xs text-gray-500">
            این بخش داخل <code>config.json</code> سمت سرور ذخیره می‌شود. برای کارکردن، باید <code>ADMIN_API_KEY</code> روی بک‌اند تنظیم باشد.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input className="border p-2" placeholder="Provider key (e.g. avalai, openai, groq)" value={providerKey} onChange={(e) => setProviderKey(e.target.value)} />
            <input className="border p-2" placeholder="Display name (optional)" value={providerForm.displayName || ''} onChange={(e) => setProviderForm((p) => ({ ...p, displayName: e.target.value }))} />
            <input className="border p-2 md:col-span-2" placeholder="Base URL (e.g. https://api.openai.com/v1)" value={providerForm.baseUrl} onChange={(e) => setProviderForm((p) => ({ ...p, baseUrl: e.target.value }))} />
            <input className="border p-2 md:col-span-2" placeholder="API Key" value={providerForm.apiKey} onChange={(e) => setProviderForm((p) => ({ ...p, apiKey: e.target.value }))} />
            <textarea
              className="border p-2 md:col-span-2 h-24"
              placeholder="Models (comma or newline separated)"
              value={providerForm.models.join('\n')}
              onChange={(e) => setModelsFromText(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <button className="bg-blue-600 text-white px-3 py-2 rounded disabled:opacity-60" disabled={!providerKey.trim() || !providerForm.baseUrl.trim()} onClick={onSaveProvider}>
              Save Provider
            </button>
            <button className="text-sm text-gray-600" onClick={() => { setProviderKey(''); setProviderForm({ displayName: '', baseUrl: '', apiKey: '', models: [] }) }}>
              Clear
            </button>
          </div>

          <div className="border-t pt-3" />

          <div className="font-semibold">Saved Providers</div>
          <div className="space-y-2">
            {(providersAdmin || []).length === 0 && <div className="text-sm text-gray-500">No providers saved.</div>}
            {(providersAdmin || []).map((p) => (
              <div key={p.key} className="border rounded p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm">{p.displayName || p.key}</div>
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
      </Card>

      <Card title="Config">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="w-40">Max Iterations</label>
            <input type="number" value={maxIterations} onChange={(e) => setMaxIterations(Number(e.target.value))} className="border p-2" />
          </div>

          <div className="flex items-center gap-2">
            <label className="w-40">Max Tokens</label>
            <input type="number" value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} className="border p-2" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">Provider Rates</div>
              <button className="text-blue-600 text-sm" onClick={addProvider}>
                Add provider
              </button>
            </div>

            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.key} className="border rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-sm">{r.key}</div>
                    {r.key !== 'default' && (
                      <button className="text-sm text-red-600" onClick={() => removeProvider(r.key)}>
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input
                      className="border p-2"
                      type="number"
                      step="0.000001"
                      value={r.input}
                      onChange={(e) => setRow(r.key, { input: Number(e.target.value) })}
                      placeholder="input rate"
                    />
                    <input
                      className="border p-2"
                      type="number"
                      step="0.000001"
                      value={r.output}
                      onChange={(e) => setRow(r.key, { output: Number(e.target.value) })}
                      placeholder="output rate"
                    />
                    <input
                      className="border p-2"
                      type="number"
                      step="0.000001"
                      value={r.reasoning}
                      onChange={(e) => setRow(r.key, { reasoning: Number(e.target.value) })}
                      placeholder="reasoning rate"
                    />
                  </div>

                  <div className="text-xs text-gray-500 mt-2">Rates are $ per token.</div>
                </div>
              ))}
            </div>
          </div>

          <button className="bg-blue-600 text-white px-3 py-2 rounded" onClick={onSave}>
            Save
          </button>

          <div className="text-xs text-gray-500">Note: saving requires ADMIN_API_KEY configured on the backend.</div>
        </div>
      </Card>
    </div>
  )
}