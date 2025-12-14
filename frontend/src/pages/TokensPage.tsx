import React, { useEffect, useMemo, useState } from 'react'
import Card from '../components/Card'
import Table from '../components/Table'
import { api } from '../api/client'

type RangeKey = '24h' | '7d' | '30d' | 'all'

function rangeToMs(r: RangeKey) {
  if (r === '24h') return 24 * 60 * 60 * 1000
  if (r === '7d') return 7 * 24 * 60 * 60 * 1000
  if (r === '30d') return 30 * 24 * 60 * 60 * 1000
  return Infinity
}

function fmtMoney(n: number) {
  if (!Number.isFinite(n)) return String(n)
  return `$${n.toFixed(6)}`
}

export default function TokensPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [range, setRange] = useState<RangeKey>('7d')

  useEffect(() => {
    api.get('/logs').then((res) => setLogs(res.data))
  }, [])

  const filtered = useMemo(() => {
    const ms = rangeToMs(range)
    if (ms === Infinity) return logs
    const cutoff = Date.now() - ms
    return logs.filter((l) => (l.timestamp ? l.timestamp >= cutoff : true))
  }, [logs, range])

  const { providerTotals, agentTotals } = useMemo(() => {
    const providerTotals: Record<string, { input: number; output: number; reasoning: number; cost: number }> = {}
    const agentTotals: Record<string, { input: number; output: number; reasoning: number; cost: number }> = {}

    for (const l of filtered) {
      const pUsage = l.tokens?.providerUsage || {}
      for (const p of Object.keys(pUsage)) {
        if (!providerTotals[p]) providerTotals[p] = { input: 0, output: 0, reasoning: 0, cost: 0 }
        providerTotals[p].input += Number(pUsage[p].input || 0)
        providerTotals[p].output += Number(pUsage[p].output || 0)
        providerTotals[p].reasoning += Number(pUsage[p].reasoning || 0)
        providerTotals[p].cost += Number(pUsage[p].cost || 0)
      }

      const aUsage = l.tokens?.agentUsage || {}
      for (const a of Object.keys(aUsage)) {
        if (!agentTotals[a]) agentTotals[a] = { input: 0, output: 0, reasoning: 0, cost: 0 }
        agentTotals[a].input += Number(aUsage[a].input || 0)
        agentTotals[a].output += Number(aUsage[a].output || 0)
        agentTotals[a].reasoning += Number(aUsage[a].reasoning || 0)
        agentTotals[a].cost += Number(aUsage[a].cost || 0)
      }
    }

    return { providerTotals, agentTotals }
  }, [filtered])

  return (
    <div className="space-y-4">
      <Card title="Token Usage">
        <div className="flex items-center gap-2 mb-3 text-sm">
          <div className="text-gray-600">Time range:</div>
          <select className="border p-2" value={range} onChange={(e) => setRange(e.target.value as RangeKey)}>
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7d</option>
            <option value="30d">Last 30d</option>
            <option value="all">All</option>
          </select>
          <div className="text-gray-500">({filtered.length} runs)</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="font-semibold mb-2">By Provider</div>
            <Table
              headers={["Provider", "In", "Out", "Reasoning", "Cost"]}
              rows={Object.entries(providerTotals).map(([p, u]) => [p, u.input, u.output, u.reasoning, fmtMoney(u.cost)])}
            />
          </div>
          <div>
            <div className="font-semibold mb-2">By Agent</div>
            <Table headers={["Agent", "In", "Out", "Reasoning", "Cost"]} rows={Object.entries(agentTotals).map(([a, u]) => [a, u.input, u.output, u.reasoning, fmtMoney(u.cost)])} />
          </div>
        </div>
      </Card>
    </div>
  )
}