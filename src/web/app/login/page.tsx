'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const authed = useAuth((s) => s.authed)
  const setAuthed = useAuth((s) => s.setAuthed)
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

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/auth/login`, {
        method: 'POST',
        body,
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })

      if (!res.ok) {
        throw new Error(await res.text())
      }

      setAuthed(true)
      toast.success('Успешный вход')
      router.push('/bookings')
    } catch (err) {
      console.error(err)
      toast.error('Ошибка входа. Проверьте логин и пароль.')
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-20">
      <h2 className="mb-4 text-xl font-medium text-center">Войти</h2>

      <form onSubmit={onSubmit} className="space-y-3">
        <input
          className="w-full rounded border p-2"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          className="w-full rounded border p-2"
          placeholder="Пароль"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-white w-full hover:bg-black/80"
        >
          Войти
        </button>

        {/* Ссылка на восстановление пароля */}
        <div className="mt-3 text-center">
          <a
            href="/auth/forgot-password"
            className="text-sm text-blue-600 hover:underline"
          >
            Забыли пароль?
          </a>
        </div>
      </form>
    </div>
  )
}
