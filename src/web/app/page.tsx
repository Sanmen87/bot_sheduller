'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'

export default function Home() {
  const router = useRouter()
  const authed = useAuth(s => s.authed)

  useEffect(() => {
    // быстрый локальный роутинг по текущему флагу
    if (authed) {
      router.replace('/bookings')
      return
    }
    // подстраховка: уточним статус у бэка
    api.get('/auth/me')
      .then(() => {
        useAuth.getState().setAuthed(true)
        router.replace('/bookings')
      })
      .catch(() => {
        useAuth.getState().setAuthed(false)
        router.replace('/login')
      })
  }, [authed, router])

  return null
}
