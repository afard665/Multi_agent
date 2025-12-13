import React from 'react'
import { ReasoningTraceEntry } from '../types'

export default function RunDetail({ trace }: { trace: ReasoningTraceEntry[] }) {
  return (
    <div className="space-y-3">
      {trace.map((t) => (
        <div key={t.iteration} className="card">
          <div className="font-semibold mb-1">Iteration {t.iteration}</div>
          <div className="text-sm text-gray-600">Agents: {t.agentsRan.join(', ')}</div>
          <div className="mt-2">
            <div className="font-semibold">Responder Outputs</div>
            <ul className="list-disc ml-4 text-sm">
              {t.responderOutputs.map((r) => (
                <li key={r.agent_id}>{r.agent_id}: {r.content}</li>
              ))}
            </ul>
          </div>
          <div className="mt-2">
            <div className="font-semibold">Critiques</div>
            <ul className="list-disc ml-4 text-sm">
              {t.criticOutputs.map((c) => (
                <li key={c.agent_id}>{c.agent_id}: {c.content}</li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  )
}
