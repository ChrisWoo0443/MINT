import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthContextType {
  session: Session | null
  user: User | null
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession)
      setUser(currentSession?.user ?? null)
    })

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, updatedSession) => {
      setSession(updatedSession)
      setUser(updatedSession?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async (): Promise<void> => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, user, signOut }}>{children}</AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
