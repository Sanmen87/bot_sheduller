'use client'
import { create } from 'zustand'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from './api'
import type { User } from './types'

type AuthState = {
  authed: boolean
  me: User | null
  setAuthed: (v: boolean) => void
  setMe: (u: User | null) => void
}
export const useAuth = create<AuthState>((set) => ({
  authed: false,
  me: null,
  setAuthed: (v) => set({ authed: v }),
  setMe: (u) => set({ me: u, authed: !!u }),
}))

export function AuthBootstrap() {
  useEffect(() => {
    api.get<User>('/auth/me')
      .then((u) => useAuth.getState().setMe(u))
      .catch(() => useAuth.getState().setMe(null))
  }, [])
  return null
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  useEffect(() => {
    api.get<User>('/auth/me')
      .then((u) => useAuth.getState().setMe(u))
      .catch(() => {
        useAuth.getState().setMe(null)
        router.replace('/login')
      })
  }, [router])
  const authed = useAuth((s) => s.authed)
  if (!authed) return null
  return <>{children}</>
}

export async function logout(router?: ReturnType<typeof useRouter>) {
  try { await api.post('/auth/logout') } catch {}
  useAuth.getState().setMe(null)
  router?.replace('/login')
}
