import { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

export default function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const loc = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: loc }} replace />
  }

  return <>{children}</>
}
