import { ReactNode } from 'react'

type Props = { headers: string[]; rows: ReactNode[][] }

export default function Table({ headers, rows }: Props) {
  return (
    <table className="min-w-full text-sm">
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} className="text-left p-2 border-b">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => (
          <tr key={idx} className="border-b last:border-0">
            {r.map((c, i) => (
              <td key={i} className="p-2">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
