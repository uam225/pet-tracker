import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { authApi } from '@/api'
import { ApiRequestError } from '@/api/client'
import type { User } from '@/types/api'

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setUser: (user: User | null) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // On mount, attempt to restore session from the existing httpOnly cookie.
  useEffect(() => {
    authApi.me()
      .then(setUser)
      .catch((err) => {
        // 401 = not authenticated; expected on first visit or after logout.
        if (!(err instanceof ApiRequestError) || err.status !== 401) {
          console.error('Failed to restore session:', err)
        }
        setUser(null)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const u = await authApi.login(email, password)
    setUser(u)
  }

  const logout = async () => {
    await authApi.logout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
