import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { useClientSettingsStore } from '../store/clientSettings'

const links = [
  { to: '/', label: 'Home' },
  { to: '/agents', label: 'Agents' },
  { to: '/logs', label: 'Log' },
  { to: '/tokens', label: 'Tokens' },
  { to: '/docs', label: 'Docs' },
  { to: '/settings', label: 'Settings' },
]

export default function Navbar() {
  const loc = useLocation()
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const logout = useAuthStore((s) => s.logout)
  const { setAdminApiKey, setAskApiKey } = useClientSettingsStore()

  const onLogout = () => {
    logout()
    setAdminApiKey('')
    setAskApiKey('')
    navigate('/login', { replace: true })
  }
  return (
    <nav className="bg-white shadow">
      <div className="max-w-6xl mx-auto px-4 py-3 flex gap-4">
        <span className="font-bold">Multi-Agent Dashboard</span>
        {!isAuthenticated ? (
          <Link to="/login" className={`text-sm ${loc.pathname === '/login' ? 'font-semibold text-blue-600' : 'text-gray-600'}`}>
            Login
          </Link>
        ) : (
          <>
            {links.map((l) => (
              <Link key={l.to} to={l.to} className={`text-sm ${loc.pathname === l.to ? 'font-semibold text-blue-600' : 'text-gray-600'}`}>
                {l.label}
              </Link>
            ))}
            <button className="text-sm text-gray-600 ml-auto" onClick={onLogout}>
              Logout
            </button>
          </>
        )}
      </div>
    </nav>
  )
}
