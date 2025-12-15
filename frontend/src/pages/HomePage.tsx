import React, { useEffect, useState } from 'react'
import Card from '../components/Card'
import TokenSummary from '../components/TokenSummary'
import TraceViewer from '../components/TraceViewer'
import { useSystemStore } from '../store/system'
import { useWorkflowStore } from '../store/workflows'
import { useAdminStatusStore } from '../store/adminStatus'
import { useClientSettingsStore } from '../store/clientSettings'
import { Workflow } from '../types'

const LS_LOCAL_AI_WORKFLOW = 'local.aiWorkflowDraft'

function saveLocalAiWorkflow(workflow: Workflow) {
  try {
    localStorage.setItem(LS_LOCAL_AI_WORKFLOW, JSON.stringify(workflow))
  } catch {
    // ignore
  }
}

function buildAdjacency(workflow: Workflow) {
  const nodes = workflow.nodes || []
  const edges = workflow.edges || []
  const idToIndex = new Map<string, number>()
  nodes.forEach((n, i) => idToIndex.set(n.id, i))
  const n = nodes.length
  const adj: boolean[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => false))
  for (const e of edges) {
    const a = idToIndex.get(e.from)
    const b = idToIndex.get(e.to)
    if (a == null || b == null) continue
    adj[a][b] = true
  }
  return { adj, labels: nodes.map((n) => String(n.agentId || '').trim()) }
}

function sameWorkflowStructure(a: Workflow, b: Workflow) {
  const aNodes = a.nodes || []
  const bNodes = b.nodes || []
  const aEdges = a.edges || []
  const bEdges = b.edges || []
  if (aNodes.length !== bNodes.length) return false
  if (aEdges.length !== bEdges.length) return false

  const A = buildAdjacency(a)
  const B = buildAdjacency(b)
  const n = A.labels.length

  const byLabelB = new Map<string, number[]>()
  for (let j = 0; j < n; j++) {
    const lbl = B.labels[j]
    const arr = byLabelB.get(lbl) || []
    arr.push(j)
    byLabelB.set(lbl, arr)
  }

  for (let i = 0; i < n; i++) {
    const lbl = A.labels[i]
    if (!byLabelB.has(lbl)) return false
  }

  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => {
    const ai = byLabelB.get(A.labels[i])?.length || 0
    const aj = byLabelB.get(A.labels[j])?.length || 0
    return ai - aj
  })

  const used = Array.from({ length: n }, () => false)
  const mapAtoB = Array.from({ length: n }, () => -1)

  const backtrack = (k: number): boolean => {
    if (k === n) return true
    const i = order[k]
    const candidates = byLabelB.get(A.labels[i]) || []
    for (const j of candidates) {
      if (used[j]) continue
      let ok = true
      for (let ii = 0; ii < n; ii++) {
        const jj = mapAtoB[ii]
        if (jj === -1) continue
        if (A.adj[i][ii] !== B.adj[j][jj]) {
          ok = false
          break
        }
        if (A.adj[ii][i] !== B.adj[jj][j]) {
          ok = false
          break
        }
      }
      if (!ok) continue

      used[j] = true
      mapAtoB[i] = j
      if (backtrack(k + 1)) return true
      used[j] = false
      mapAtoB[i] = -1
    }
    return false
  }

  return backtrack(0)
}

export default function HomePage() {
  const [question, setQuestion] = useState('')
  const { ask, result, loading, traceStatus, traceError, stopStreaming, clear } = useSystemStore()
  const { workflows, load: loadWorkflows, suggest, create, update } = useWorkflowStore()
  const { adminApiKey, backendBaseUrl, workflowDesignerAllowCreateAgents } = useClientSettingsStore()
  const { status: adminStatus, load: loadAdminStatus } = useAdminStatusStore()
  const canUseAdmin = !!adminStatus?.enabled && (adminStatus.mode === 'insecure' || !!adminApiKey)

  const [workflowChoice, setWorkflowChoice] = useState<string>('') // '' = default, '__ai__' = ad-hoc, otherwise saved id
  const [aiWorkflow, setAiWorkflow] = useState<Workflow | null>(null)
  const [aiCreatedAgents, setAiCreatedAgents] = useState<{ id: string; name: string; role: string }[]>([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiNotice, setAiNotice] = useState('')

  useEffect(() => {
    loadWorkflows()
  }, [])

  useEffect(() => {
    loadAdminStatus()
  }, [adminApiKey, backendBaseUrl])

  const onDesignWorkflow = async () => {
    setAiError('')
    setAiNotice('')
    if (!question.trim()) {
      setAiError('Enter a question first.')
      return
    }
    setAiLoading(true)
    try {
      const allowCreateAgents = canUseAdmin && workflowDesignerAllowCreateAgents
      let res = await suggest(question, { allowCreateAgents })
      // If admin is misconfigured (wrong key), retry without agent creation so the feature still works.
      if (!res && allowCreateAgents) {
        res = await suggest(question, { allowCreateAgents: false })
      }
      if (!res) {
        setAiWorkflow(null)
        setAiCreatedAgents([])
        const err = (useWorkflowStore as any).getState?.().error
        setAiError(err || 'Failed to design workflow.')
        return
      }

      if (!canUseAdmin) {
        setAiWorkflow(res.workflow)
        setAiCreatedAgents([])
        setWorkflowChoice('__ai__')
        setAiNotice('Designed workflow using existing agents (not saved). Add admin access in Settings to enable saving and agent creation.')
        saveLocalAiWorkflow({ ...(res.workflow as any), id: '__local_ai__' })
        return
      }

      const match = (workflows || []).find((w) => sameWorkflowStructure(res.workflow as any, w as any)) || null
      if (match) {
        setAiWorkflow(null)
        setAiCreatedAgents(res.createdAgents || [])
        // If we matched an existing workflow, tag it as AI-generated and attach the prompt/response used.
        const mergedTags = Array.from(new Set([...(match.tags || []), ...(res.workflow.tags || []), 'ai'])).filter(Boolean)
        const patched = await update(match.id, { tags: mergedTags, aiDesign: res.workflow.aiDesign })
        if (patched?.id) {
          setWorkflowChoice(match.id)
          setAiNotice(`Matched existing workflow: ${match.name} (tagged as AI)`)
          return
        }

        // Could not patch (likely unauthorized). Fall back to a local/temporary AI workflow so the user can still see the design.
        setAiWorkflow(res.workflow)
        setWorkflowChoice('__ai__')
        setAiNotice(`Matched existing workflow: ${match.name} (could not save AI tag/messages; using temporary AI workflow instead)`)
        saveLocalAiWorkflow({ ...(res.workflow as any), id: '__local_ai__' })
        return
      }

      const saved = await create({
        name: res.workflow.name,
        description: res.workflow.description,
        nodes: res.workflow.nodes,
        edges: res.workflow.edges,
        tags: Array.from(new Set([...(res.workflow.tags || []), 'ai'])).filter(Boolean),
        aiDesign: res.workflow.aiDesign,
      })

      if (!saved?.id) {
        setAiWorkflow(res.workflow)
        setAiCreatedAgents(res.createdAgents || [])
        setWorkflowChoice('__ai__')
        const err = (useWorkflowStore as any).getState?.().error
        setAiError(err || 'Could not save workflow. Configure admin access in Settings, or use the temporary AI workflow.')
        saveLocalAiWorkflow({ ...(res.workflow as any), id: '__local_ai__' })
        return
      }

      setAiWorkflow(null)
      setAiCreatedAgents(res.createdAgents || [])
      setWorkflowChoice(saved.id)
      setAiNotice(`Saved workflow: ${saved.name}`)
    } catch (e: any) {
      setAiError(e?.message || 'Failed to design workflow.')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Ask the Multi-Agent System">
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="border p-2 flex-1"
              placeholder="Enter your question"
            />
            <button
              onClick={() =>
                ask(question, {
                  stream: true,
                  workflowId: workflowChoice && workflowChoice !== '__ai__' ? workflowChoice : undefined,
                  workflow: workflowChoice === '__ai__' ? aiWorkflow : undefined,
                })
              }
              disabled={loading || !question.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-60"
            >
              {loading ? 'Thinking...' : 'Ask'}
            </button>
            <button onClick={clear} className="border px-4 py-2 rounded text-sm">
              Clear
            </button>
          </div>

          <div className="flex flex-col md:flex-row gap-2 md:items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Workflow</label>
              <select
                className="border p-2 text-sm"
                value={workflowChoice}
                onChange={(e) => setWorkflowChoice(e.target.value)}
              >
                <option value="">Default (auto)</option>
                {(workflows || []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
                {aiWorkflow && (
                  <option value="__ai__">AI: {aiWorkflow.name}</option>
                )}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="border px-3 py-2 rounded text-sm disabled:opacity-60"
                disabled={aiLoading || loading || !question.trim()}
                onClick={onDesignWorkflow}
              >
                {aiLoading ? 'Designing…' : 'Design workflow (AI)'}
              </button>
              {aiError ? <span className="text-sm text-red-600">{aiError}</span> : null}
              {aiNotice ? <span className="text-sm text-green-700">{aiNotice}</span> : null}
              {workflowChoice === '__ai__' && aiWorkflow ? (
                <span className="text-xs text-gray-600">Using AI workflow: {aiWorkflow.name}</span>
              ) : null}
              {aiCreatedAgents.length ? (
                <span className="text-xs text-gray-600">
                  Created agents: {aiCreatedAgents.map((a) => a.name).join(', ')}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <div className="text-gray-600">
              Live trace:{' '}
              <span className="font-semibold">
                {traceStatus === 'idle' && 'idle'}
                {traceStatus === 'connecting' && 'connecting'}
                {traceStatus === 'streaming' && 'streaming'}
                {traceStatus === 'done' && 'done'}
                {traceStatus === 'error' && 'error'}
              </span>
              {traceError ? <span className="text-red-600"> — {traceError}</span> : null}
            </div>
            {(traceStatus === 'connecting' || traceStatus === 'streaming') && (
              <button className="text-blue-600" onClick={stopStreaming}>
                Stop streaming
              </button>
            )}
          </div>
        </div>
      </Card>

      {result && (
        <Card title="Result">
          <div className="space-y-3">
            <div>
              <div className="font-semibold">Final Answer</div>
              <p className="whitespace-pre-wrap">{result.finalAnswer}</p>
              <div className="text-sm text-gray-500">Confidence: {result.confidence}</div>
            </div>

            {result.tokens && <TokenSummary tokens={result.tokens} />}

            <div>
              <div className="font-semibold mb-2">Reasoning Trace</div>
              <TraceViewer trace={result.reasoningTrace} />
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
