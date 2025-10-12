'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { toast } from 'sonner'

export default function ResetPasswordPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const disabled = useMemo(() => {
    if (!token) return true
    if (password.length < 8) return true
    if (password !== confirm) return true
    return false
  }, [token, password, confirm])

  useEffect(() => {
    document.title = 'Сброс пароля'
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (disabled) return
    setSubmitting(true)
    try {
      await api.post('/auth/password/reset', { token, new_password: password })
      toast.success('Пароль успешно обновлён!')
      setTimeout(() => router.push('/login'), 1500)
    } catch (err: any) {
      toast.error('Ошибка: не удалось обновить пароль')
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <div className="max-w-md mx-auto mt-16 p-6 bg-white rounded-2xl shadow">
        <h1 className="text-2xl font-semibold mb-4">Сброс пароля</h1>
        <p className="text-slate-600 mb-2">Ссылка некорректна или устарела.</p>
        <p className="text-slate-600">
          Попросите новую ссылку на странице{' '}
          <a href="/auth/forgot" className="text-blue-600 underline">
            восстановления пароля
          </a>.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto mt-16 p-6 bg-white rounded-2xl shadow">
      <h1 className="text-2xl font-semibold mb-1">Задайте новый пароль</h1>
      <p className="text-slate-600 mb-6 text-sm">
        Ссылка из письма активна в течение 1 часа.
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm mb-1">Новый пароль</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded-lg px-3 py-2"
            placeholder="Не короче 8 символов"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Повторите пароль</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>

        <button
          type="submit"
          disabled={disabled || submitting}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 disabled:opacity-50"
        >
          {submitting ? 'Сохраняю…' : 'Сохранить пароль'}
        </button>
      </form>
    </div>
  )
}
