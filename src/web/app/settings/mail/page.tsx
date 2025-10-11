'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import toast from 'react-hot-toast'

type MailSettings = {
  enabled: boolean
  from_addr: string
  host: string
  port: number
  user: string
  starttls: boolean
}

type MailTestResult = {
  ok: boolean
  kind: 'success' | 'auth' | 'connect' | 'smtp' | 'unknown' | 'bad_request'
  message: string
  details?: string
}

export default function MailSettingsPage() {
  const role = useAuth((s) => s?.me?.role)
  const isAdmin = role === 'admin'

  const [data, setData] = useState<MailSettings | null>(null)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [testEmail, setTestEmail] = useState('')
  const [testing, setTesting] = useState(false)
  const [lastTest, setLastTest] = useState<MailTestResult | null>(null)

  useEffect(() => {
    if (!isAdmin) return
    api
      .get<MailSettings>('/admin/settings/mail')
      .then(setData)
      .catch((err) => toast.error(err.message || 'Ошибка загрузки'))
      .finally(() => setLoading(false))
  }, [isAdmin])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!data) return
    setSaving(true)
    try {
      await api.put('/admin/settings/mail', { ...data, password })
      toast.success('Настройки сохранены')
      setPassword('')
    } catch (err: any) {
      toast.error(err.message || 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const sendTest = async () => {
    if (!testEmail) {
      toast.error('Укажите email для теста')
      return
    }
    setTesting(true)
    try {
      const res = await api.post<MailTestResult>('/admin/settings/mail/test', { to: testEmail })
      setLastTest(res)
      if (res.ok) {
        toast.success(res.message || 'Тестовое письмо отправлено')
      } else {
        const hint =
          res.kind === 'auth'
            ? ' Проверьте логин и пароль SMTP.'
            : res.kind === 'connect'
            ? ' Нет соединения с SMTP-сервером (порт/фаервол/DNS).'
            : res.kind === 'smtp'
            ? ' Сервер отклонил запрос — проверьте адреса и политику сервера.'
            : ''
        toast.error((res.message || 'Ошибка тестовой отправки.') + hint)
      }
    } catch (err: any) {
      const fail: MailTestResult = {
        ok: false,
        kind: 'unknown',
        message: 'Ошибка вызова API тестовой отправки',
        details: String(err?.message || err),
      }
      setLastTest(fail)
      toast.error(fail.message)
    } finally {
      setTesting(false)
    }
  }

  if (!isAdmin) {
    return <div className="p-4">Доступ только для администратора</div>
  }

  if (loading) return <div className="p-4">Загрузка...</div>
  if (!data) return null

  return (
    <div className="max-w-2xl p-4 space-y-6">
      {/* Навигация */}
      <div>
        <a href="/settings" className="text-sm text-blue-600 hover:underline">
          &larr; Назад к общим настройкам
        </a>
      </div>

      <h2 className="text-xl font-semibold">Настройки почты (SMTP)</h2>

      <form onSubmit={save} className="space-y-4">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="enabled"
            checked={data.enabled}
            onChange={(e) => setData({ ...data, enabled: e.target.checked })}
          />
          <label htmlFor="enabled">Включить рассылку</label>
        </div>

        <div>
          <label className="block text-sm mb-1">От кого (From)</label>
          <input
            type="email"
            className="w-full rounded border p-2"
            value={data.from_addr}
            onChange={(e) => setData({ ...data, from_addr: e.target.value })}
            required
          />
        </div>

        <div>
          <label className="block text-sm mb-1">SMTP-сервер</label>
          <input
            type="text"
            className="w-full rounded border p-2"
            value={data.host}
            onChange={(e) => setData({ ...data, host: e.target.value })}
            required
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Порт</label>
          <input
            type="number"
            className="w-full rounded border p-2"
            value={data.port}
            onChange={(e) => setData({ ...data, port: Number(e.target.value) })}
            required
          />
        </div>

        <div>
          <label className="block text_sm mb-1">Логин (обычно email)</label>
          <input
            type="text"
            className="w-full rounded border p-2"
            value={data.user}
            onChange={(e) => setData({ ...data, user: e.target.value })}
            required
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Пароль</label>
          <input
            type="password"
            className="w-full rounded border p-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Введите пароль (не сохраняется в браузере)"
            required
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="starttls"
            checked={data.starttls}
            onChange={(e) => setData({ ...data, starttls: e.target.checked })}
          />
          <label htmlFor="starttls">Использовать STARTTLS</label>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-black text-white px-4 py-2 disabled:opacity-60"
            disabled={saving}
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </form>

      <div className="pt-6 border-t">
        <h3 className="font-medium mb-2">Тестовая отправка</h3>
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="test@example.com"
            className="rounded border p-2 flex-1"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
          />
          <button
            className="rounded border px-4 py-2 disabled:opacity-60"
            onClick={sendTest}
            disabled={testing}
          >
            {testing ? 'Отправка...' : 'Отправить тест'}
          </button>
        </div>

        {/* Результат последнего теста */}
        {lastTest && (
          <div
            className={`mt-3 rounded border p-3 text-sm ${
              lastTest.ok ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
            }`}
          >
            <div className="font-medium">
              {lastTest.ok ? 'Успешно: письмо отправлено' : 'Ошибка тестовой отправки'}
            </div>
            <div className="mt-1">{lastTest.message}</div>
            {lastTest.details && (
              <pre className="mt-2 overflow-auto rounded bg-white/60 p-2 text-xs text-slate-700">
                {lastTest.details}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
