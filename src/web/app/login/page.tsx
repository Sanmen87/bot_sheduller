'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const authed = useAuth(s => s.authed)
  const setAuthed = useAuth(s => s.setAuthed)
  const router = useRouter()

  useEffect(() => {
    // если уже авторизован — сразу редиректим на бронирования
    if (authed) {
      router.replace('/bookings')
    }
  }, [authed, router])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      // API принимает form-data (username/password), а не JSON
      const body = new URLSearchParams()
      body.set('username', email)
      body.set('password', password)

      await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/auth/login`, {
        method: 'POST',
        body,
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })

      setAuthed(true)
      toast.success('Успешный вход')
      router.push('/bookings')
    } catch (err) {
      console.error(err)
      toast.error('Ошибка входа')
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-20">
      <h2 className="mb-4 text-xl font-medium">Войти</h2>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          className="w-full rounded border p-2"
          placeholder="Email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <input
          className="w-full rounded border p-2"
          placeholder="Пароль"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <button className="rounded bg-black px-4 py-2 text-white w-full">
          Войти
        </button>
      </form>
    </div>
  )
}
