import React from 'react'

type Props = { a: string; b: string }

export default function PromptDiffViewer({ a, b }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      <div className="card">
        <h4 className="font-semibold mb-1">Version A</h4>
        <pre className="whitespace-pre-wrap">{a}</pre>
      </div>
      <div className="card">
        <h4 className="font-semibold mb-1">Version B</h4>
        <pre className="whitespace-pre-wrap">{b}</pre>
      </div>
    </div>
  )
}
