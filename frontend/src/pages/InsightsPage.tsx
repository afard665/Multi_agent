import React, { useEffect, useState } from 'react'
import Card from '../components/Card'
import Table from '../components/Table'
import { api } from '../api/client'

export default function InsightsPage() {
  const [perf, setPerf] = useState<any>({})
  const [history, setHistory] = useState<any[]>([])
  useEffect(() => {
    api.get('/memory/agent_performance').then((res) => setPerf(res.data))
    api.get('/memory/question_history').then((res) => setHistory(res.data))
  }, [])
  return (
    <div className="space-y-4">
      <Card title="Agent Performance">
        <Table
          headers={["Agent", "Runs", "Avg Score", "Avg Severity", "Avg Cost"]}
          rows={Object.entries(perf).map(([id, p]: any) => [id, p.runs, p.avgScore?.toFixed?.(2), p.avgSeverity?.toFixed?.(2), p.avgCost?.toFixed?.(4)])}
        />
      </Card>
      <Card title="Question Timeline">
        <Table
          headers={["Question", "Confidence"]}
          rows={history.slice(-20).reverse().map((h) => [h.question, h.confidence])}
        />
      </Card>
    </div>
  )
}
