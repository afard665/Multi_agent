import React, { useMemo, useState } from 'react'
import { ReasoningTraceEntry } from '../types'

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded p-3 bg-gray-50">
      <div className="font-semibold mb-2 text-sm">{title}</div>
      {children}
    </div>
  )
}

export default function TraceViewer({ trace }: { trace: ReasoningTraceEntry[] }) {
  const [open, setOpen] = useState<Record<number, boolean>>({})

  const sorted = useMemo(() => [...(trace || [])].sort((a, b) => a.iteration - b.iteration), [trace])

  if (!trace || trace.length === 0) {
    return <div className="text-sm text-gray-500">No trace yet.</div>
  }

  return (
    <div className="space-y-3">
      {sorted.map((t) => {
        const isOpen = open[t.iteration] ?? t.iteration === sorted[sorted.length - 1].iteration
        return (
          <div key={t.iteration} className="card">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold">Iteration {t.iteration}</div>
                <div className="text-xs text-gray-600">Agents ran: {t.agentsRan.join(', ') || '—'}</div>
              </div>
              <button
                className="text-sm text-blue-600"
                onClick={() => setOpen((s) => ({ ...s, [t.iteration]: !isOpen }))}
              >
                {isOpen ? 'Collapse' : 'Expand'}
              </button>
            </div>

            {isOpen && (
              <div className="mt-3 space-y-3">
                <Panel title="Responder outputs">
                  <ul className="space-y-2 text-sm">
                    {t.responderOutputs.map((r) => (
                      <li key={r.agent_id} className="border-b pb-2 last:border-0 last:pb-0">
                        <div className="font-semibold">
                          {r.nodeLabel ? (
                            <>
                              {r.nodeLabel} <span className="font-normal text-xs text-gray-600">({r.agent_id})</span>{' '}
                            </>
                          ) : (
                            <>
                              {r.agent_id}{' '}
                            </>
                          )}
                          <span className="font-normal text-xs text-gray-600">
                            {r.provider ? `(${r.provider}${r.model ? ` / ${r.model}` : ''})` : ''}
                          </span>
                        </div>
                        <div className="whitespace-pre-wrap">{r.content}</div>
                      </li>
                    ))}
                  </ul>
                </Panel>

                <Panel title="Critiques">
                  <ul className="space-y-2 text-sm">
                    {t.criticOutputs.map((c) => (
                      <li key={`${c.agent_id}:${c.candidateId}`} className="border-b pb-2 last:border-0 last:pb-0">
                        <div className="font-semibold">
                          {c.agent_id}{' '}
                          <span className="font-normal text-xs text-gray-600">→ {c.candidateId}</span>
                        </div>
                        <div className="whitespace-pre-wrap">{c.content}</div>
                      </li>
                    ))}
                  </ul>
                </Panel>

                {t.factChecks?.length > 0 && (
                  <Panel title="Fact checks">
                    <ul className="space-y-2 text-sm">
                      {t.factChecks.map((f) => (
                        <li key={f.agent_id} className="border-b pb-2 last:border-0 last:pb-0">
                          <div className="font-semibold">{f.agent_id}</div>
                          <div className="text-xs text-gray-600">Confidence: {f.confidence}</div>
                          {f.unsupportedClaims?.length ? (
                            <ul className="list-disc ml-5">
                              {f.unsupportedClaims.map((c, idx) => (
                                <li key={idx}>{c}</li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-xs text-gray-600">No unsupported claims detected.</div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Panel>
                )}

                <Panel title="Meta decision (raw)">
                  <pre className="text-xs overflow-auto bg-white border rounded p-2">{JSON.stringify(t.metaDecision, null, 2)}</pre>
                </Panel>

                {t.evidence?.length > 0 && (
                  <Panel title="Evidence">
                    <ul className="space-y-2 text-sm">
                      {t.evidence.map((e) => (
                        <li key={e.docId}>
                          <div className="font-semibold">{e.title}</div>
                          <div className="text-xs text-gray-600">{e.excerpt}</div>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
