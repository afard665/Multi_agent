import React, { useState } from 'react'
import Card from '../components/Card'
import TokenSummary from '../components/TokenSummary'
import TraceViewer from '../components/TraceViewer'
import { useSystemStore } from '../store/system'

export default function HomePage() {
  const [question, setQuestion] = useState('')
  const { ask, result, loading, traceStatus, traceError, stopStreaming, clear } = useSystemStore()

  return (
    <div className="space-y-4">
      <Card title="Ask the Multi-Agent System">
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="border p-2 flex-1"
              placeholder="Enter your question"
            />
            <button
              onClick={() => ask(question, { stream: true })}
              disabled={loading || !question.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-60"
            >
              {loading ? 'Thinking...' : 'Ask'}
            </button>
            <button onClick={clear} className="border px-4 py-2 rounded text-sm">
              Clear
            </button>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <div className="text-gray-600">
              Live trace:{' '}
              <span className="font-semibold">
                {traceStatus === 'idle' && 'idle'}
                {traceStatus === 'connecting' && 'connecting'}
                {traceStatus === 'streaming' && 'streaming'}
                {traceStatus === 'done' && 'done'}
                {traceStatus === 'error' && 'error'}
              </span>
              {traceError ? <span className="text-red-600"> — {traceError}</span> : null}
            </div>
            {(traceStatus === 'connecting' || traceStatus === 'streaming') && (
              <button className="text-blue-600" onClick={stopStreaming}>
                Stop streaming
              </button>
            )}
          </div>
        </div>
      </Card>

      {result && (
        <Card title="Result">
          <div className="space-y-3">
            <div>
              <div className="font-semibold">Final Answer</div>
              <p className="whitespace-pre-wrap">{result.finalAnswer}</p>
              <div className="text-sm text-gray-500">Confidence: {result.confidence}</div>
            </div>

            {result.tokens && <TokenSummary tokens={result.tokens} />}

            <div>
              <div className="font-semibold mb-2">Reasoning Trace</div>
              <TraceViewer trace={result.reasoningTrace} />
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}