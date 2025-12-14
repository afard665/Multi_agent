import React, { useEffect, useMemo, useState } from 'react'
import Card from '../components/Card'
import Table from '../components/Table'
import TokenSummary from '../components/TokenSummary'
import TraceViewer from '../components/TraceViewer'
import { api } from '../api/client'

function fmtTs(ts?: number) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return String(ts)
  }
}

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)

  const [q, setQ] = useState('')
  const [minConfidence, setMinConfidence] = useState<number | ''>('')

  useEffect(() => {
    api.get('/logs').then((res) => setLogs(res.data))
  }, [])

  const load = async (id: string) => {
    const res = await api.get(`/logs/${id}`)
    setSelected(res.data)
  }

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      const okQ = !q.trim() || String(l.question || '').toLowerCase().includes(q.trim().toLowerCase())
      const okC = minConfidence === '' || (typeof l.confidence === 'number' && l.confidence >= minConfidence)
      return okQ && okC
    })
  }, [logs, q, minConfidence])

  return (
    <div className="space-y-4">
      <Card title="Run Logs">
        <div className="flex flex-col md:flex-row gap-2 mb-3">
          <input className="border p-2 flex-1" placeholder="Search question…" value={q} onChange={(e) => setQ(e.target.value)} />
          <input
            className="border p-2 w-44"
            placeholder="Min confidence"
            type="number"
            value={minConfidence}
            onChange={(e) => setMinConfidence(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </div>

        <Table
          headers={["When", "Question", "Confidence", "Iterations", "Cost", "View"]}
          rows={filtered.map((l) => [
            fmtTs(l.timestamp),
            l.question,
            l.confidence?.toFixed?.(2),
            l.iterations,
            l.tokens?.totalCost != null ? `$${Number(l.tokens.totalCost).toFixed(6)}` : '—',
            <button className="text-blue-600" onClick={() => load(l.id)}>
              Open
            </button>,
          ])}
        />
      </Card>

      {selected && (
        <Card title={`Run ${selected.id}`}>
          <div className="space-y-3">
            <div>
              <div className="text-sm text-gray-600">{fmtTs(selected.timestamp)}</div>
              <div className="text-sm text-gray-600">{selected.question}</div>
            </div>

            <div>
              <div className="font-semibold">Final Answer</div>
              <div className="whitespace-pre-wrap text-sm">{selected.finalAnswer}</div>
              <div className="text-sm text-gray-600">Confidence: {selected.confidence}</div>
            </div>

            {selected.metaExplanation && (
              <div>
                <div className="font-semibold">Meta Explanation</div>
                <div className="whitespace-pre-wrap text-sm">{selected.metaExplanation}</div>
              </div>
            )}

            {selected.tokens && <TokenSummary tokens={selected.tokens} />}

            <div>
              <div className="font-semibold mb-2">Reasoning Trace</div>
              <TraceViewer trace={selected.reasoningTrace || []} />
            </div>

            <div>
              <div className="font-semibold mb-2">Raw JSON</div>
              <pre className="text-xs overflow-auto bg-gray-50 border rounded p-2">{JSON.stringify(selected, null, 2)}</pre>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}