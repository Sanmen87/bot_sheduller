'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { RequireAuth, useAuth } from '@/lib/auth'

type Settings = {
  slot_duration_min: number
  reminder_minutes_before: number
  morning_poll_cron: string
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <SettingsInner />
    </RequireAuth>
  )
}

function SettingsInner() {
  const role = useAuth((s:any)=> s?.me?.role)
  const isAdmin = role === 'admin'

  const [data, setData] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [diag, setDiag] = useState<any>(null) // диагностическая инфа

  async function load() {
    setLoading(true)
    setError(null)
    setDiag(null)

    const diagObj: any = { steps: [] }

    try {
      diagObj.steps.push('api.get start')
      const viaApi = await api.get<Settings>('/admin/settings')
      diagObj.steps.push('api.get ok')
      diagObj.viaApi = viaApi
      setData(viaApi)
    } catch (e:any) {
      diagObj.steps.push('api.get error')
      diagObj.apiError = e?.message || String(e)
      setError(e?.message || 'Ошибка загрузки (api)')
    }

    // параллельно проверим сырой fetch тем же путём, что использует api
    try {
      diagObj.steps.push('raw fetch start')
      // @ts-ignore — в браузере переменная будет зашита на этапе сборки
      const base = process.env.NEXT_PUBLIC_API_BASE_URL as string | undefined
      diagObj.base = base ?? '(undefined)'
      const r = await fetch(`${base}/admin/settings`, { credentials: 'include' })
      diagObj.rawStatus = `${r.status} ${r.statusText}`
      try { diagObj.rawJson = await r.clone().json() } catch { diagObj.rawText = await r.text() }
    } catch (e:any) {
      diagObj.steps.push('raw fetch error')
      diagObj.rawError = e?.message || String(e)
    }

    setDiag(diagObj)
    setLoading(false)
  }

  useEffect(()=>{ load() }, []) // eslint-disable-line

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!data) return
    setLoading(true)
    setError(null)
    try {
      const saved = await api.put<Settings>('/admin/settings', data)
      setData(saved)
    } catch (e:any) {
      setError(e?.message || 'Ошибка сохранения')
    } finally {
      setLoading(false)
    }
  }

  if (!isAdmin) return <div className="p-4">Доступ только для администратора</div>

  return (
    <div className="max-w-2xl p-4 space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold">Системные настройки</h2>
        <span className="ml-auto text-sm text-slate-500">{loading ? 'Загрузка…' : ''}</span>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && (
        <form className="space-y-4" onSubmit={save}>
          <div>
            <label className="block text-sm mb-1">Длина академического часа, мин</label>
            <input
              type="number" min={1} className="w-full rounded border p-2"
              value={data.slot_duration_min}
              onChange={e=>setData({...data, slot_duration_min: Number(e.target.value) || 0})}
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Напоминание за, мин</label>
            <input
              type="number" min={1} className="w-full rounded border p-2"
              value={data.reminder_minutes_before}
              onChange={e=>setData({...data, reminder_minutes_before: Number(e.target.value) || 0})}
            />
          </div>

          <div>
            <label className="block text-sm mb-1">CRON опроса учителей</label>
            <input
              type="text" className="w-full rounded border p-2"
              value={data.morning_poll_cron}
              onChange={e=>setData({...data, morning_poll_cron: e.target.value})}
            />
            <p className="text-xs text-slate-500 mt-1">Напр.: <code>30 7 * * *</code></p>
          </div>

          <div className="flex gap-2">
            <button type="submit" className="rounded border px-3 py-2">Сохранить</button>
            <button type="button" onClick={load} className="rounded border px-3 py-2">Обновить</button>
          </div>
        </form>
      )}

      {/* Диагностика — всегда видно, почему страница «молчит» */}
      <details className="rounded border bg-white p-2">
        <summary className="cursor-pointer text-sm">Диагностика</summary>
        <pre className="mt-2 overflow-auto rounded bg-slate-50 p-2 text-xs">
{JSON.stringify({ loading, hasData: !!data, error, diag }, null, 2)}
        </pre>
      </details>
    </div>
  )
}
