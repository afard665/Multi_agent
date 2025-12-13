import React, { useEffect } from 'react'
import Card from '../components/Card'
import Table from '../components/Table'
import { useAgentStore } from '../store/agents'
import AgentEditor from '../components/AgentEditor'

export default function AgentsPage() {
  const { agents, load } = useAgentStore()
  useEffect(() => { load() }, [])
  return (
    <div className="space-y-4">
      <Card title="Agents">
        <Table
          headers={["Name", "Role", "Model", "Provider", "Enabled"]}
          rows={agents.map((a) => [a.name, a.role, a.model, a.provider, a.enabled ? 'Yes' : 'No'])}
        />
      </Card>
      <Card title="Edit Agent Prompt">
        <AgentEditor />
      </Card>
    </div>
  )
}
