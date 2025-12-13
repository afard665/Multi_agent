import { ReactNode } from 'react'

export default function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card mb-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  )
}
