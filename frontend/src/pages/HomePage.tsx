import React, { useState } from 'react'
import Card from '../components/Card'
import { useSystemStore } from '../store/system'
import RunDetail from '../components/RunDetail'

export default function HomePage() {
  const [question, setQuestion] = useState('')
  const { ask, result, loading } = useSystemStore()

  return (
    <div className="space-y-4">
      <Card title="Ask the Multi-Agent System">
        <div className="flex gap-2 mb-2">
          <input value={question} onChange={(e) => setQuestion(e.target.value)} className="border p-2 flex-1" placeholder="Enter your question" />
          <button onClick={() => ask(question)} disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded">
            {loading ? 'Thinking...' : 'Ask'}
          </button>
        </div>
      </Card>
      {result && (
        <Card title="Result">
          <div className="mb-2">
            <div className="font-semibold">Final Answer</div>
            <p>{result.finalAnswer}</p>
            <div className="text-sm text-gray-500">Confidence: {result.confidence}</div>
          </div>
          <RunDetail trace={result.reasoningTrace} />
        </Card>
      )}
    </div>
  )
}
