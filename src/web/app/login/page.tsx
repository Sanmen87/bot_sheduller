'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { setAuthed } = useAuth()
  const router = useRouter()

async function onSubmit(e: React.FormEvent) {
  e.preventDefault()
  const form = new URLSearchParams({ username: email, password })
  try {
    await api.post('/auth/login', form) // <-- отправляем form-urlencoded
    setAuthed(true)
    router.push('/bookings')
  } catch (e: any) {
    alert(`Ошибка входа: ${e?.message ?? 'неизвестно'}`)
  }
}

  return (
    <div className="max-w-sm">
      <h2 className="mb-4 text-xl font-medium">Войти</h2>
      <form onSubmit={onSubmit} className="space-y-3">
        <input className="w-full rounded border p-2" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input className="w-full rounded border p-2" placeholder="Пароль" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        <button className="rounded bg-black px-4 py-2 text-white">Войти</button>
      </form>
    </div>
  )
}
