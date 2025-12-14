import React, { useEffect, useState } from 'react'
import Card from '../components/Card'
import Table from '../components/Table'
import { api } from '../api/client'

export default function InsightsPage() {
  const [perf, setPerf] = useState<any>({})
  const [history, setHistory] = useState<any[]>([])
  const [error, setError] = useState<string>('')
  useEffect(() => {
    api
      .get('/memory/agent_performance')
      .then((res) => {
        setPerf(res.data)
        setError('')
      })
      .catch((err) => {
        setPerf({})
        setError(err?.response?.data?.error || err?.message || 'Failed to load insights')
      })
    api
      .get('/memory/question_history')
      .then((res) => {
        setHistory(res.data)
        setError('')
      })
      .catch((err) => {
        setHistory([])
        setError(err?.response?.data?.error || err?.message || 'Failed to load insights')
      })
  }, [])
  return (
    <div className="space-y-4">
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
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
