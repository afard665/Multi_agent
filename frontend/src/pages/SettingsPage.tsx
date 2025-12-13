import React, { useEffect, useState } from 'react'
import Card from '../components/Card'
import { useSettingsStore } from '../store/settings'

export default function SettingsPage() {
  const { config, load, update } = useSettingsStore()
  const [maxIterations, setMaxIterations] = useState(5)
  useEffect(() => { load() }, [])
  useEffect(() => { if (config) setMaxIterations(config.maxIterations) }, [config])
  return (
    <Card title="Config">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="w-40">Max Iterations</label>
          <input type="number" value={maxIterations} onChange={(e) => setMaxIterations(Number(e.target.value))} className="border p-2" />
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={() => update({ maxIterations })}>Save</button>
      </div>
    </Card>
  )
}
