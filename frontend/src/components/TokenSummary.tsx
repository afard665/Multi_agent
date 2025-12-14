import React from 'react'
import { TokenUsageSummary } from '../types'
import Table from './Table'

function fmtMoney(n: number) {
  if (!Number.isFinite(n)) return String(n)
  return `$${n.toFixed(6)}`
}

export default function TokenSummary({ tokens }: { tokens: TokenUsageSummary }) {
  const providerRows = Object.entries(tokens.providerUsage || {}).map(([provider, u]) => [
    provider,
    u.input,
    u.output,
    u.reasoning,
    fmtMoney(u.cost),
  ])

  const agentRows = Object.entries(tokens.agentUsage || {}).map(([agent, u]) => [agent, u.input, u.output, u.reasoning, fmtMoney(u.cost)])

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-700">
        <span className="font-semibold">Totals:</span> in {tokens.totalInputTokens}, out {tokens.totalOutputTokens}, reasoning {tokens.totalReasoningTokens} —{' '}
        <span className="font-semibold">{fmtMoney(tokens.totalCost)}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="font-semibold mb-2">By Provider</div>
          <Table headers={["Provider", "In", "Out", "Reasoning", "Cost"]} rows={providerRows as any} />
        </div>
        <div>
          <div className="font-semibold mb-2">By Agent</div>
          <Table headers={["Agent", "In", "Out", "Reasoning", "Cost"]} rows={agentRows as any} />
        </div>
      </div>
    </div>
  )
}