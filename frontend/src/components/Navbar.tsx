import { Link, useLocation } from 'react-router-dom'

const links = [
  { to: '/', label: 'Home' },
  { to: '/agents', label: 'Agents' },
  { to: '/logs', label: 'Logs' },
  { to: '/tokens', label: 'Tokens' },
  { to: '/insights', label: 'Insights' },
  { to: '/settings', label: 'Settings' },
]

export default function Navbar() {
  const loc = useLocation()
  return (
    <nav className="bg-white shadow">
      <div className="max-w-6xl mx-auto px-4 py-3 flex gap-4">
        <span className="font-bold">Multi-Agent Dashboard</span>
        {links.map((l) => (
          <Link key={l.to} to={l.to} className={`text-sm ${loc.pathname === l.to ? 'font-semibold text-blue-600' : 'text-gray-600'}`}>
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
