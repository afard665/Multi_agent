import React, { useEffect, useState } from 'react'
import Card from '../components/Card'
import Table from '../components/Table'
import { api } from '../api/client'
import RunDetail from '../components/RunDetail'

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  useEffect(() => { api.get('/logs').then((res) => setLogs(res.data)) }, [])
  const load = async (id: string) => {
    const res = await api.get(`/logs/${id}`)
    setSelected(res.data)
  }
  return (
    <div className="space-y-4">
      <Card title="Run Logs">
        <Table
          headers={["Question", "Confidence", "Iterations", "View"]}
          rows={logs.map((l) => [l.question, l.confidence?.toFixed?.(2), l.iterations, <button className="text-blue-600" onClick={() => load(l.id)}>Open</button>])}
        />
      </Card>
      {selected && (
        <Card title={`Run ${selected.id}`}>
          <div className="text-sm text-gray-600">{selected.question}</div>
          <RunDetail trace={selected.reasoningTrace} />
        </Card>
      )}
    </div>
  )
}
