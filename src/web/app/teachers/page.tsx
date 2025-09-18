'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { api, getWithCount } from '@/lib/api'
import { RequireAuth, useAuth } from '@/lib/auth'

type AnyTeacher = {
  id: number
  user_name?: string
  user?: { id: number; first_name?: string|null; last_name?: string|null; username?: string|null; email?: string|null }
}
type Teacher = { id: number; name: string }

type UserRow = {
  id: number
  telegram_id: number
  role: 'guest'|'client'|'teacher'|'admin'
  first_name?: string|null
  last_name?: string|null
  username?: string|null
  email?: string|null
  phone?: string|null
}

type Subject = { id: number; name: string; code?: string|null }

export default function TeachersPage() {
  return (
    <RequireAuth>
      <TeachersInner />
    </RequireAuth>
  )
}

function TeachersInner() {
  const meRole = useAuth((s:any)=> s?.me?.role)
  const isAdmin = meRole === 'admin'

  const [items, setItems] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')

  const [addOpen, setAddOpen] = useState(false)

  const normalizeTeacher = (t: AnyTeacher): Teacher => {
    if (t.user_name && String(t.user_name).trim()) return { id: t.id, name: t.user_name! }
    const u = t.user
    const full = ([(u?.first_name||''),(u?.last_name||'')].join(' ').trim()) || (u?.username ?? '') || (u?.email ?? '')
    return { id: t.id, name: full || `user ${u?.id ?? t.id}` }
  }

  async function load() {
    setLoading(true)
    try {
      const search = q ? `?q=${encodeURIComponent(q)}` : ''
      const raw = await api.get<AnyTeacher[]>(`/teachers${search}`)
      setItems(raw.map(normalizeTeacher))
    } finally {
      setLoading(false)
    }
  }
  useEffect(()=>{ load() }, [q]) // eslint-disable-line

  async function onDelete(id: number) {
    if (!isAdmin) return
    if (!confirm('Удалить учителя? Это также удалит его слоты.')) return
    const prev = items
    setItems(prev.filter(t => t.id !== id))
    try { await api.delete(`/teachers/${id}`) }
    catch (e:any) { alert(`Не удалось удалить: ${e?.message ?? 'ошибка'}`); setItems(prev) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold">Учителя</h2>
        <div className="ml-auto flex items-center gap-2">
          {isAdmin && (
            <button
              className="rounded bg-black px-3 py-2 text-white"
              onClick={()=> setAddOpen(true)}
            >
              Добавить учителя
            </button>
          )}
          <span className="text-sm text-slate-500">
            {loading ? 'Загрузка…' : `Всего: ${items.length}`}
          </span>
        </div>
      </div>

      {/* Поиск */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="w-80 rounded border p-2"
          placeholder="Поиск по имени / username / email"
          value={q}
          onChange={(e)=> setQ(e.target.value)}
        />
      </div>

      {/* Таблица */}
      <div className="rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="w-20 px-3 py-2">ID</th>
              <th className="px-3 py-2">Имя</th>
              <th className="w-44 px-3 py-2 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading ? (
              <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={3}>Ничего не найдено</td></tr>
            ) : items.map(t=> (
              <tr key={t.id} className="border-t">
                <td className="px-3 py-2">{t.id}</td>
                <td className="px-3 py-2">{t.name || <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    className="rounded border px-2 py-1 hover:bg-red-50 hover:border-red-300 disabled:opacity-50"
                    onClick={()=> onDelete(t.id)}
                    disabled={!isAdmin}
                    title={isAdmin ? 'Удалить' : 'Только для админов'}
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {addOpen && (
        <AddTeacherModal
          onClose={()=> setAddOpen(false)}
          onCreated={(t)=> { setItems(prev=> [t, ...prev]); setAddOpen(false) }}
        />
      )}
    </div>
  )
}

/** ====== Модалка добавления учителя ====== */
function AddTeacherModal({ onClose, onCreated }: { onClose: ()=>void; onCreated: (t: Teacher)=>void }) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const limit = 20

  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [picked, setPicked] = useState<number[]>([])
  const [mode, setMode] = useState<'online'|'offline'|'mixed'>('online')
  const [saving, setSaving] = useState(false)

  // debounce поиска
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(()=>{
    if (debRef.current) clearTimeout(debRef.current)
    debRef.current = setTimeout(()=> { setPage(1); loadUsers(true) }, 300)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(()=> { loadUsers(false) }, [page]) // eslint-disable-line
  useEffect(()=> { loadSubjects() }, [])

  async function loadUsers(reset: boolean) {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      qs.set('exclude_teachers', 'true')
      if (query) qs.set('q', query)
      qs.set('limit', String(limit))
      qs.set('offset', String((page-1)*limit))
      const { data, total } = await getWithCount<UserRow>(`/users?${qs.toString()}`)
      setTotal(total)
      setUsers(reset ? data as any : ([...(users as any), ...(data as any)]))
    } finally { setLoading(false) }
  }

  async function loadSubjects() {
    // Subjects — админские, но модалка тоже только для админа
    const list = await api.get<Subject[]>('/subjects?_=1') // q/limit необязательны
    setSubjects(list)
  }

  const canLoadMore = users.length < total

  async function submit() {
    if (!selectedUser) return
    setSaving(true)
    try {
      const payload = {
        user_id: selectedUser.id,
        default_mode: mode,
        bio: null,
        subject_ids: picked,
      }
      const created = await api.post<any>('/teachers', payload)
      // нормализуем имя для списка
      const name = [
        created?.user_name,
        [created?.user?.first_name, created?.user?.last_name].filter(Boolean).join(' '),
        created?.user?.username,
        created?.user?.email,
      ].find((v: string)=> v && String(v).trim()) || `user ${created?.id}`
      onCreated({ id: created?.id, name })
    } catch (e:any) {
      alert(`Не удалось добавить учителя: ${e?.message ?? 'ошибка'}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-xl bg-white p-4 shadow-xl">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">Добавить учителя</h3>
          <button className="ml-auto rounded border px-3 py-1" onClick={onClose}>Закрыть</button>
        </div>

        {/* Шаг 1: выбрать пользователя */}
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Найти пользователя</label>
            <input
              className="w-full rounded border p-2"
              placeholder="Имя, username или email…"
              value={query}
              onChange={(e)=> setQuery(e.target.value)}
            />
            <div className="max-h-64 overflow-auto rounded border">
              {users.map(u => {
                const title = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || u.email || `user ${u.id}`
                return (
                  <button
                    key={u.id}
                    className={`flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left hover:bg-slate-50 ${selectedUser?.id===u.id?'bg-slate-100':''}`}
                    onClick={()=> setSelectedUser(u)}
                  >
                    <span className="truncate">{title}</span>
                    <span className="shrink-0 text-xs text-slate-500">id {u.id}</span>
                  </button>
                )
              })}
              {users.length === 0 && !loading && (
                <div className="p-3 text-sm text-slate-500">Ничего не найдено</div>
              )}
              {loading && <div className="p-3 text-sm text-slate-500">Загрузка…</div>}
            </div>
            {canLoadMore && (
              <button className="mt-2 rounded border px-3 py-1" onClick={()=> setPage(p=> p+1)} disabled={loading}>
                Загрузить ещё
              </button>
            )}
            <div className="text-xs text-slate-500">Найдено: {total}</div>
          </div>

          {/* Шаг 2: параметры учителя */}
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Формат по умолчанию</label>
              <select className="w-full rounded border p-2" value={mode} onChange={(e)=> setMode(e.target.value as any)}>
                <option value="online">Онлайн</option>
                <option value="offline">Оффлайн</option>
                <option value="mixed">Смешанный</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Предметы</label>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {subjects.map(s => {
                  const checked = picked.includes(s.id)
                  return (
                    <label key={s.id} className="flex items-center gap-2 rounded border p-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={()=> setPicked(prev => checked ? prev.filter(x=>x!==s.id) : [...prev, s.id])}
                      />
                      <span className="truncate">{s.name}</span>
                    </label>
                  )
                })}
                {subjects.length === 0 && <div className="text-sm text-slate-500">Нет данных о предметах</div>}
              </div>
            </div>

            <button
              className="mt-2 w-full rounded bg-black px-4 py-2 text-white disabled:opacity-60"
              disabled={!selectedUser || saving}
              onClick={submit}
            >
              {saving ? 'Добавляем…' : 'Добавить учителя'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
