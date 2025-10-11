'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import toast from 'react-hot-toast'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)

  // Простейшая арифметическая капча (без сторонних сервисов).
  // Если нужно подключить hCaptcha/ReCAPTCHA — заменяем этот блок.
  const [a, setA] = useState(0)
  const [b, setB] = useState(0)
  const [captcha, setCaptcha] = useState('')

  useEffect(() => {
    // Генерим пример  (10–99) + (1–9)
    setA(10 + Math.floor(Math.random() * 90))
    setB(1 + Math.floor(Math.random() * 9))
    setCaptcha('')
  }, [])

  const expected = useMemo(() => String(a + b), [a, b])
  const captchaOk = captcha.trim() === expected

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      toast.error('Введите email')
      return
    }
    if (!captchaOk) {
      toast.error('Капча не совпадает')
      return
    }
    setSending(true)
    try {
      // ⚠️ Эндпоинт можно поменять под ваш бэкенд:
      // распространённые варианты: '/auth/password/forgot' или '/auth/reset/request'
      await api.post('/auth/password/forgot', { email })
      toast.success('Если такой email существует, мы отправили письмо со ссылкой на сброс.')
      setEmail('')
      // Сменим пример капчи после отправки
      setA(10 + Math.floor(Math.random() * 90))
      setB(1 + Math.floor(Math.random() * 9))
      setCaptcha('')
    } catch (err: any) {
      // Если бэк вернёт осмысленную ошибку — покажем её
      toast.error(err?.message || 'Не удалось отправить письмо для сброса')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto max-w-md p-6">
      <a href="/login" className="text-sm text-blue-600 hover:underline">
        &larr; Назад к входу
      </a>

      <h1 className="mt-3 text-2xl font-semibold">Восстановление пароля</h1>
      <p className="mt-1 text-sm text-slate-600">
        Укажите адрес электронной почты — мы пришлём ссылку для сброса пароля.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm mb-1">Email</label>
          <input
            type="email"
            className="w-full rounded border p-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>

        {/* Капча */}
        <div>
          <label className="block text-sm mb-1">Проверка: решите пример</label>
          <div className="flex items-center gap-2">
            <div className="rounded border px-3 py-2 bg-slate-50 select-none">
              {a} + {b} = ?
            </div>
            <input
              type="text"
              inputMode="numeric"
              className="flex-1 rounded border p-2"
              value={captcha}
              onChange={(e) => setCaptcha(e.target.value)}
              placeholder="Ответ"
              required
            />
            <button
              type="button"
              className="rounded border px-3 py-2"
              onClick={() => {
                setA(10 + Math.floor(Math.random() * 90))
                setB(1 + Math.floor(Math.random() * 9))
                setCaptcha('')
              }}
              title="Обновить капчу"
            >
              ↻
            </button>
          </div>
          {!captchaOk && captcha.trim() !== '' && (
            <div className="mt-1 text-xs text-red-600">Ответ неверный</div>
          )}
        </div>

        <button
          type="submit"
          className="w-full rounded bg-black text-white px-4 py-2 disabled:opacity-60"
          disabled={sending}
        >
          {sending ? 'Отправляем...' : 'Отправить письмо для сброса'}
        </button>
      </form>
    </div>
  )
}
