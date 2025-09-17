'use client'
import { create } from 'zustand'
import { useEffect } from 'react'
import { api } from './api'

type AuthState = { authed: boolean; setAuthed: (v: boolean)=>void }
export const useAuth = create<AuthState>((set)=> ({ authed: false, setAuthed: (v)=> set({ authed: v }) }))

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const authed = useAuth(s => s.authed)
  useEffect(() => {
    api.get('/auth/me').then(() => useAuth.getState().setAuthed(true)).catch(()=>{})
  }, [])
  if (!authed) return <div className="text-sm text-slate-500">Проверяем авторизацию…</div>
  return <>{children}</>
}