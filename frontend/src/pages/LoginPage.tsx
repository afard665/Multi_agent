import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Card from '../components/Card'
import { useAuthStore } from '../store/auth'
import { useClientSettingsStore } from '../store/clientSettings'

export default function LoginPage() {
  const navigate = useNavigate()
  const loc = useLocation() as any

  const { login, isAuthenticated } = useAuthStore()
  const { setAdminApiKey, setAskApiKey } = useClientSettingsStore()

  const fromPath = useMemo(() => {
    const from = loc?.state?.from?.pathname
    return typeof from === 'string' && from ? from : '/'
  }, [loc?.state])

  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>('')

  useEffect(() => {
    if (isAuthenticated) navigate(fromPath, { replace: true })
  }, [isAuthenticated, fromPath, navigate])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const res = login(username, password)
    if (!res.ok) {
      setError(res.error || 'Login failed')
      return
    }

    // Convenience: keep existing header-based auth working too.
    setAdminApiKey(password)
    setAskApiKey(password)

    navigate(fromPath, { replace: true })
  }

  return (
    <div className="max-w-md mx-auto pt-8">
      <Card title="Sign in">
        <form onSubmit={onSubmit} className="space-y-3">
          {error ? <div className="text-sm text-red-600">{error}</div> : null}

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">Username</label>
            <input className="border p-2" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">Password</label>
            <input
              className="border p-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button className="bg-blue-600 text-white px-4 py-2 rounded" type="submit">
            Login
          </button>
        </form>
      </Card>
    </div>
  )
}
