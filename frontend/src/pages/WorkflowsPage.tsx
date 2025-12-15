import React, { useEffect, useMemo, useRef, useState } from 'react'
import Card from '../ui/Card'
import { useWorkflowStore } from '../store/workflows'
import { useAgentStore } from '../store/agents'
import { Workflow, WorkflowEdge, WorkflowNode } from '../types'
import AdminRequired from '../components/AdminRequired'
import { useAdminStatusStore } from '../store/adminStatus'
import { useClientSettingsStore } from '../store/clientSettings'

const NODE_W = 220
const NODE_H = 76
const LS_LOCAL_AI_WORKFLOW = 'local.aiWorkflowDraft'

function makeId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`
  }
}

function deepClone<T>(v: T): T {
  try {
    return structuredClone(v)
  } catch {
    return JSON.parse(JSON.stringify(v))
  }
}

function computeTopo(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  const nodeIds = nodes.map((n) => n.id)
  const nodeIdSet = new Set(nodeIds)

  const indeg = new Map<string, number>()
  const outgoing = new Map<string, string[]>()

  for (const id of nodeIds) {
    indeg.set(id, 0)
    outgoing.set(id, [])
  }

  for (const e of edges) {
    if (!nodeIdSet.has(e.from) || !nodeIdSet.has(e.to)) throw new Error(`Edge references missing node: ${e.from} -> ${e.to}`)
    if (e.from === e.to) throw new Error('Self-loop edges are not allowed')
    indeg.set(e.to, (indeg.get(e.to) || 0) + 1)
    outgoing.get(e.from)!.push(e.to)
  }

  const q: string[] = []
  for (const [id, d] of indeg.entries()) {
    if (d === 0) q.push(id)
  }

  const order: string[] = []
  while (q.length) {
    const id = q.shift()!
    order.push(id)
    for (const to of outgoing.get(id) || []) {
      indeg.set(to, (indeg.get(to) || 0) - 1)
      if (indeg.get(to) === 0) q.push(to)
    }
  }

  if (order.length !== nodeIds.length) throw new Error('Workflow contains a cycle')
  return order
}

function nodePoint(node: WorkflowNode, side: 'left' | 'right') {
  return {
    x: side === 'left' ? node.x : node.x + NODE_W,
    y: node.y + NODE_H / 2,
  }
}

function edgePath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = Math.max(60, Math.min(220, Math.abs(to.x - from.x) / 2))
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y} ${to.x - dx} ${to.y} ${to.x} ${to.y}`
}

export default function WorkflowsPage() {
  const canvasRef = useRef<HTMLDivElement | null>(null)

  const { workflows, error: workflowsError, load: loadWorkflows, create, update, remove } = useWorkflowStore()
  const { agents, load: loadAgents } = useAgentStore()

  const { adminApiKey } = useClientSettingsStore()
  const { status: adminStatus, load: loadAdminStatus } = useAdminStatusStore()

  useEffect(() => {
    loadAdminStatus()
    loadWorkflows()
  }, [])

  const canUseAdmin = !!adminStatus?.enabled && (adminStatus.mode === 'insecure' || !!adminApiKey)

  const [localAiWorkflow, setLocalAiWorkflow] = useState<Workflow | null>(null)
  useEffect(() => {
    const readLocal = () => {
      try {
        const raw = localStorage.getItem(LS_LOCAL_AI_WORKFLOW)
        if (!raw) {
          setLocalAiWorkflow(null)
          return
        }
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && typeof parsed.name === 'string' && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
          setLocalAiWorkflow(parsed as Workflow)
        }
      } catch {
        // ignore
      }
    }

    readLocal()
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_LOCAL_AI_WORKFLOW) readLocal()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const allWorkflows = useMemo(() => {
    const local = localAiWorkflow ? [{ ...localAiWorkflow, id: '__local_ai__' as any, tags: Array.from(new Set([...(localAiWorkflow.tags || []), 'ai'])) }] : []
    const server = workflows || []
    const merged = [...local, ...server.filter((w) => w.id !== '__local_ai__')]
    return merged
  }, [localAiWorkflow, workflows])

  useEffect(() => {
    if (!canUseAdmin) return
    loadAgents()
  }, [canUseAdmin])

  const agentById = useMemo(() => new Map((agents || []).map((a) => [a.id, a])), [agents])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = useMemo(() => (allWorkflows || []).find((w) => w.id === selectedId) || null, [allWorkflows, selectedId])
  const isLocalSelected = selectedId === '__local_ai__'

  const [draft, setDraft] = useState<Workflow | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [uiError, setUiError] = useState<string>('')

  useEffect(() => {
    setUiError('')
    setConnectFrom(null)
    setSelectedNodeId(null)
    setDraft(selected ? deepClone(selected) : null)
  }, [selectedId, selected?.updatedAt, localAiWorkflow])

  const isDirty = useMemo(() => {
    if (!selected || !draft) return false
    const a = JSON.stringify({ name: selected.name, description: selected.description, nodes: selected.nodes, edges: selected.edges })
    const b = JSON.stringify({ name: draft.name, description: draft.description, nodes: draft.nodes, edges: draft.edges })
    return a !== b
  }, [selected, draft])

  const [drag, setDrag] = useState<{ nodeId: string; offsetX: number; offsetY: number } | null>(null)

  const onCanvasPointerMove = (e: React.PointerEvent) => {
    if (!drag || !draft || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const nx = e.clientX - rect.left - drag.offsetX
    const ny = e.clientY - rect.top - drag.offsetY
    setDraft((d) => {
      if (!d) return d
      return {
        ...d,
        nodes: d.nodes.map((n) => (n.id === drag.nodeId ? { ...n, x: Math.round(nx), y: Math.round(ny) } : n)),
      }
    })
  }

  const onCanvasPointerUp = () => {
    setDrag(null)
  }

  const onStartDrag = (e: React.PointerEvent, nodeId: string) => {
    if (!draft || !canvasRef.current) return
    const node = draft.nodes.find((n) => n.id === nodeId)
    if (!node) return
    const rect = canvasRef.current.getBoundingClientRect()
    setDrag({
      nodeId,
      offsetX: e.clientX - rect.left - node.x,
      offsetY: e.clientY - rect.top - node.y,
    })
  }

  const addNode = (agentId: string) => {
    if (!draft) return
    if (!agentId) return
    const id = makeId()
    const idx = draft.nodes.length
    const label = agentById.get(agentId)?.name || agentId
    const node: WorkflowNode = { id, agentId, label, x: 40 + idx * 30, y: 40 + idx * 30 }
    setDraft({ ...draft, nodes: [...draft.nodes, node] })
    setSelectedNodeId(id)
    setUiError('')
  }

  const deleteNode = (nodeId: string) => {
    if (!draft) return
    setDraft({
      ...draft,
      nodes: draft.nodes.filter((n) => n.id !== nodeId),
      edges: draft.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
    })
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
    if (connectFrom === nodeId) setConnectFrom(null)
  }

  const addEdge = (from: string, to: string) => {
    if (!draft) return
    if (from === to) return
    if (draft.edges.some((e) => e.from === from && e.to === to)) return
    const nextEdges = [...draft.edges, { id: makeId(), from, to }]
    try {
      computeTopo(draft.nodes, nextEdges)
    } catch (e: any) {
      setUiError(e?.message || 'Invalid edge')
      return
    }
    setDraft({ ...draft, edges: nextEdges })
    setUiError('')
  }

  const deleteEdge = (edgeId: string) => {
    if (!draft) return
    setDraft({ ...draft, edges: draft.edges.filter((e) => e.id !== edgeId) })
  }

  const onSave = async () => {
    if (!draft) return
    if (!selectedId) return
    if (isLocalSelected) return
    try {
      if (draft.nodes.length) computeTopo(draft.nodes, draft.edges)
      const saved = await update(selectedId, {
        name: draft.name,
        description: draft.description,
        nodes: draft.nodes,
        edges: draft.edges,
      } as any)
      if (!saved) {
        const err = (useWorkflowStore as any).getState?.().error
        setUiError(err || 'Failed to save')
        return
      }
      setUiError('')
    } catch (e: any) {
      setUiError(e?.message || 'Failed to save')
    }
  }

  const onCreateNew = async () => {
    const created = await create({ name: 'New workflow', nodes: [], edges: [] } as any)
    if (created?.id) setSelectedId(created.id)
  }

  const onDeleteWorkflow = async () => {
    if (!selectedId) return
    if (isLocalSelected) return
    const ok = window.confirm('Delete this workflow?')
    if (!ok) return
    await remove(selectedId)
    setSelectedId(null)
    setDraft(null)
  }

  const selectedNode = useMemo(() => (draft?.nodes || []).find((n) => n.id === selectedNodeId) || null, [draft, selectedNodeId])

  const [newNodeAgentId, setNewNodeAgentId] = useState('')
  useEffect(() => {
    if (!canUseAdmin) return
    if (newNodeAgentId) return
    if (agents?.length) setNewNodeAgentId(agents[0].id)
  }, [canUseAdmin, agents])

  return (
    <div className="space-y-4">
      {!canUseAdmin && (
        <Card title="Workflow Builder">
          <AdminRequired feature="Workflow editing" mode={adminStatus?.mode} />
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card
          title="Workflows"
          actions={
            <div className="flex items-center gap-3">
              {localAiWorkflow ? (
                <button
                  className="text-sm text-gray-700 hover:text-gray-900"
                  onClick={() => {
                    try {
                      localStorage.removeItem(LS_LOCAL_AI_WORKFLOW)
                    } catch {
                      // ignore
                    }
                    setLocalAiWorkflow(null)
                    if (selectedId === '__local_ai__') {
                      setSelectedId(null)
                      setDraft(null)
                    }
                  }}
                >
                  Clear local AI draft
                </button>
              ) : null}
              <button className="text-sm text-blue-600 disabled:opacity-60" disabled={!canUseAdmin} onClick={onCreateNew}>
                New
              </button>
            </div>
          }
          className="lg:col-span-1"
        >
          {workflowsError ? <div className="text-sm text-red-600 mb-2">{workflowsError}</div> : null}
          <div className="space-y-1">
            {(allWorkflows || []).length === 0 && <div className="text-sm text-gray-500">No workflows yet.</div>}
            {(allWorkflows || []).map((w) => (
              <button
                key={w.id}
                className={[
                  'w-full text-left px-3 py-2 rounded border text-sm',
                  selectedId === w.id ? 'bg-blue-50 border-blue-200' : 'bg-white hover:bg-gray-50',
                ].join(' ')}
                onClick={() => setSelectedId(w.id)}
              >
                <div className="flex items-center gap-2">
                  <div className="font-semibold truncate flex-1">{w.name}</div>
                  {(w.aiDesign || (w.tags || []).includes('ai')) ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-purple-50 border-purple-200 text-purple-700">
                      {w.id === '__local_ai__' ? 'AI (local)' : 'AI'}
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-gray-600">
                  {(w.nodes || []).length} nodes · {(w.edges || []).length} edges
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card
          title="Editor"
          actions={
            <div className="flex items-center gap-2">
              {connectFrom ? (
                <span className="text-xs text-gray-600">
                  Connecting from <code>{connectFrom}</code>
                  <button className="ml-2 text-blue-600" onClick={() => setConnectFrom(null)}>
                    Cancel
                  </button>
                </span>
              ) : null}
              <button className="text-sm text-blue-600 disabled:opacity-60" disabled={!canUseAdmin || isLocalSelected || !draft || !isDirty} onClick={onSave}>
                Save
              </button>
              <button className="text-sm text-red-600 disabled:opacity-60" disabled={!canUseAdmin || isLocalSelected || !draft} onClick={onDeleteWorkflow}>
                Delete
              </button>
            </div>
          }
          className="lg:col-span-3"
        >
          {!draft ? (
            <div className="text-sm text-gray-500">Select a workflow to edit.</div>
          ) : (
            <div className="space-y-3">
              {uiError ? <div className="text-sm text-red-600">{uiError}</div> : null}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-600">Name</label>
                  <input
                    className="border p-2 w-full"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    disabled={!canUseAdmin}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Add agent node</label>
                  <div className="flex gap-2">
                    <select
                      className="border p-2 flex-1 text-sm"
                      value={newNodeAgentId}
                      onChange={(e) => setNewNodeAgentId(e.target.value)}
                      disabled={!canUseAdmin || !agents.length}
                    >
                      {(agents || []).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.role})
                        </option>
                      ))}
                      {!agents.length && <option value="">No agents</option>}
                    </select>
                    <button className="border px-3 rounded text-sm disabled:opacity-60" disabled={!canUseAdmin || !newNodeAgentId} onClick={() => addNode(newNodeAgentId)}>
                      Add
                    </button>
                  </div>
                </div>
              </div>

              {draft.aiDesign ? (
                <div className="border rounded p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-sm">AI Workflow Design</div>
                      <div className="text-xs text-gray-600 mt-0.5">Generated from Ask page</div>
                    </div>
                    <div className="text-xs text-gray-600 text-right">
                      <div className="font-mono">{draft.aiDesign.provider}</div>
                      <div className="font-mono">{draft.aiDesign.model}</div>
                    </div>
                  </div>

                  {draft.aiDesign.question ? (
                    <div className="text-xs text-gray-700 mt-2">
                      <span className="text-gray-500">Question:</span> {draft.aiDesign.question}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                    <div className="space-y-2">
                      <div className="font-semibold text-xs text-gray-700">Sent</div>
                      {(draft.aiDesign.messages || []).map((m, idx) => (
                        <div key={idx}>
                          <div className="text-[11px] text-gray-600 mb-1">{m.role}</div>
                          <pre className="text-xs whitespace-pre-wrap border rounded p-2 bg-gray-50 max-h-56 overflow-auto">{m.content}</pre>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <div className="font-semibold text-xs text-gray-700">Received</div>
                      <div>
                        <div className="text-[11px] text-gray-600 mb-1">assistant</div>
                        <pre className="text-xs whitespace-pre-wrap border rounded p-2 bg-gray-50 max-h-56 overflow-auto">{draft.aiDesign.responseText}</pre>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <div
                ref={canvasRef}
                className="relative w-full h-[560px] overflow-hidden border rounded bg-[linear-gradient(to_right,#f3f4f6_1px,transparent_1px),linear-gradient(to_bottom,#f3f4f6_1px,transparent_1px)] bg-[size:24px_24px]"
                onPointerMove={onCanvasPointerMove}
                onPointerUp={onCanvasPointerUp}
                onPointerLeave={onCanvasPointerUp}
                onClick={() => setSelectedNodeId(null)}
              >
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                  <defs>
                    <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                    </marker>
                  </defs>
                  {(draft.edges || []).map((e) => {
                    const from = (draft.nodes || []).find((n) => n.id === e.from)
                    const to = (draft.nodes || []).find((n) => n.id === e.to)
                    if (!from || !to) return null
                    const p1 = nodePoint(from, 'right')
                    const p2 = nodePoint(to, 'left')
                    return <path key={e.id} d={edgePath(p1, p2)} stroke="#94a3b8" strokeWidth="2" fill="none" markerEnd="url(#arrow)" />
                  })}
                </svg>

                {(draft.nodes || []).map((n) => {
                  const agent = agentById.get(n.agentId)
                  const title = n.label || agent?.name || n.agentId
                  const sub = agent ? `${agent.role} · ${agent.id}` : n.agentId
                  const isSelected = selectedNodeId === n.id

                  return (
                    <div
                      key={n.id}
                      className={[
                        'absolute rounded border shadow-sm bg-white select-none',
                        isSelected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200',
                      ].join(' ')}
                      style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedNodeId(n.id)
                      }}
                    >
                      <div
                        className="px-2 py-1 border-b bg-gray-50 cursor-move flex items-center justify-between"
                        onPointerDown={(e) => {
                          e.stopPropagation()
                          onStartDrag(e, n.id)
                        }}
                      >
                        <div className="text-sm font-semibold truncate" title={title}>
                          {title}
                        </div>
                        <button
                          className="text-xs text-gray-500 hover:text-red-600"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteNode(n.id)
                          }}
                        >
                          Delete
                        </button>
                      </div>
                      <div className="px-2 py-2 text-xs text-gray-600 truncate" title={sub}>
                        {sub}
                      </div>

                      <button
                        title="Connect from"
                        className={[
                          'absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 rounded-full border',
                          connectFrom === n.id ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300 hover:border-blue-400',
                        ].join(' ')}
                        onClick={(e) => {
                          e.stopPropagation()
                          setConnectFrom(n.id)
                          setUiError('')
                        }}
                      />
                      <button
                        title="Connect to"
                        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border bg-white border-gray-300 hover:border-blue-400"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (connectFrom && connectFrom !== n.id) {
                            addEdge(connectFrom, n.id)
                            setConnectFrom(null)
                          }
                        }}
                      />
                    </div>
                  )
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border rounded p-3">
                  <div className="font-semibold text-sm mb-2">Selected Node</div>
                  {!selectedNode ? (
                    <div className="text-sm text-gray-500">Click a node to edit.</div>
                  ) : (
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-gray-600">Label</label>
                        <input
                          className="border p-2 w-full text-sm"
                          value={selectedNode.label || ''}
                          onChange={(e) =>
                            setDraft((d) =>
                              d
                                ? { ...d, nodes: d.nodes.map((n) => (n.id === selectedNode.id ? { ...n, label: e.target.value } : n)) }
                                : d
                            )
                          }
                          disabled={!canUseAdmin}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Agent</label>
                        <select
                          className="border p-2 w-full text-sm"
                          value={selectedNode.agentId}
                          onChange={(e) =>
                            setDraft((d) =>
                              d
                                ? { ...d, nodes: d.nodes.map((n) => (n.id === selectedNode.id ? { ...n, agentId: e.target.value } : n)) }
                                : d
                            )
                          }
                          disabled={!canUseAdmin}
                        >
                          {(agents || []).map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({a.role})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="text-xs text-gray-500">
                        Node id: <code>{selectedNode.id}</code>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border rounded p-3">
                  <div className="font-semibold text-sm mb-2">Edges</div>
                  {(draft.edges || []).length === 0 ? (
                    <div className="text-sm text-gray-500">No edges yet. Use the connectors on nodes.</div>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {draft.edges.map((e) => {
                        const from = draft.nodes.find((n) => n.id === e.from)
                        const to = draft.nodes.find((n) => n.id === e.to)
                        const fromLabel = from?.label || agentById.get(from?.agentId || '')?.name || e.from
                        const toLabel = to?.label || agentById.get(to?.agentId || '')?.name || e.to
                        return (
                          <li key={e.id} className="flex items-center justify-between gap-2">
                            <div className="truncate">
                              {fromLabel} → {toLabel}
                            </div>
                            <button className="text-xs text-red-600 disabled:opacity-60" disabled={!canUseAdmin} onClick={() => deleteEdge(e.id)}>
                              Remove
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
