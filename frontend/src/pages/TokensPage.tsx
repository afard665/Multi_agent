import React, { useEffect, useState } from 'react'
import Card from '../components/Card'
import Table from '../components/Table'
import { api } from '../api/client'

export default function TokensPage() {
  const [logs, setLogs] = useState<any[]>([])
  useEffect(() => { api.get('/logs').then((res) => setLogs(res.data)) }, [])
  const providerTotals: Record<string, number> = {}
  logs.forEach((l) => {
    const usage = l.tokens?.providerUsage || {}
    Object.keys(usage).forEach((p) => {
      providerTotals[p] = (providerTotals[p] || 0) + usage[p].cost
    })
  })
  return (
    <div className="space-y-4">
      <Card title="Provider Usage">
        <Table headers={["Provider", "Cost"]} rows={Object.entries(providerTotals).map(([p, c]) => [p, c.toFixed(4)])} />
      </Card>
    </div>
  )
}
