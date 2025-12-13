import React, { useState } from 'react'
import { useAgentStore } from '../store/agents'

export default function AgentEditor() {
  const { agents, update } = useAgentStore()
  const [selected, setSelected] = useState<string | null>(null)
  const agent = agents.find((a) => a.id === selected)
  const [prompt, setPrompt] = useState('')

  const handleSave = async () => {
    if (agent) await update(agent.id, { system_prompt: prompt })
  }

  return (
    <div className="card">
      <div className="flex gap-2 mb-2">
        <select value={selected || ''} onChange={(e) => { setSelected(e.target.value); setPrompt(agents.find(a => a.id === e.target.value)?.system_prompt || '') }} className="border p-2 text-sm">
          <option value="">Select agent</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <button onClick={handleSave} className="bg-blue-600 text-white px-3 py-1 rounded text-sm">Save Prompt</button>
      </div>
      {agent && (
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="w-full border p-2 h-32 text-sm" />
      )}
    </div>
  )
}
