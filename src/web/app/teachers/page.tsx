'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { RequireAuth, useAuth } from '@/lib/auth'

type AnyTeacher = { id: number } & Record<string, any>
type Teacher = { id: number; name: string }

export default function TeachersPage() {
  return (
    <RequireAuth>
      <TeachersInner />
    </RequireAuth>
  )
}

function TeachersInner() {
  const role = useAuth(s => s.me?.role)
  const isAdmin = role === 'admin'

  const [items, setItems] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')

  // нормализуем имя из разных возможных полей
  const normalize = (t: AnyTeacher): Teacher => ({
    id: t.id,
    name: (t.name ?? t.full_name ?? t.fullName ?? t.title ?? t.display_name ?? t.email ?? '').toString(),
  })

  async function load() {
    setLoading(true)
    try {
      const search = q ? `?q=${encodeURIComponent(q)}` : ''
      const raw = await api.get<AnyTeacher[]>(`/teachers${search}`)
      setItems(raw.map(normalize))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [q])

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!isAdmin || !name.trim()) return
    setCreating(true)
    try {
      const created = await api.post<AnyTeacher>('/teachers', { name: name.trim() })
      setName('')
      setItems(prev => [normalize(created), ...prev])
    } catch (e: any) {
      alert(`Не удалось создать учителя: ${e?.message ?? 'ошибка'}`)
    } finally {
      setCreating(false)
    }
  }

  function startEdit(t: Teacher) {
    setEditingId(t.id)
    setEditName(t.name)
  }
  function cancelEdit() {
    setEditingId(null)
    setEditName('')
  }

  async function saveEdit(id: number) {
    if (!isAdmin) return
    const newName = editName.trim()
    if (!newName) return
    // оптимистично
    const prev = items
    setItems(prev.map(t => (t.id === id ? { ...t, name: newName } : t)))
    try {
      // если у бэка нет PATCH — словим 405 и покажем сообщение
      const updated = await api.patch<AnyTeacher>(`/teachers/${id}`, { name: newName })
      setItems(cur => cur.map(t => (t.id === id ? normalize(updated) : t)))
      setEditingId(null)
    } catch (e: any) {
      alert(
        /405|404/.test(String(e))
          ? 'API не поддерживает редактирование учителя (PATCH /teachers/{id}).'
          : `Ошибка сохранения: ${e?.message ?? 'неизвестно'}`
      )
      // откат
      setItems(prev)
    }
  }

  async function onDelete(id: number) {
    if (!isAdmin) return
    if (!confirm('Удалить учителя?')) return
    const prev = items
    setItems(prev.filter(t => t.id !== id))
    try {
      await api.delete(`/teachers/${id}`)
    } catch (e: any) {
      alert(`Не удалось удалить: ${e?.message ?? 'ошибка'}`)
      setItems(prev)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold">Учителя</h2>
        <span className="ml-auto text-sm text-slate-500">
          {loading ? 'Загрузка…' : `Всего: ${items.length}`}
        </span>
      </div>

      {/* Поиск */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="rounded border p-2 w-80"
          placeholder="Поиск по имени"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>

      {/* Добавление — только admin */}
      <form onSubmit={onCreate} className="flex flex-wrap items-center gap-2">
        <input
          className="rounded border p-2 w-80 disabled:bg-slate-100"
          placeholder={isAdmin ? 'Имя нового учителя' : 'Доступно только админам'}
          value={name}
          onChange={e => setName(e.target.value)}
          disabled={!isAdmin}
        />
        <button
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-60"
          disabled={!isAdmin || creating || !name.trim()}
        >
          {creating ? 'Создаём…' : 'Добавить'}
        </button>
      </form>

      {/* Таблица */}
      <div className="rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="px-3 py-2 w-20">ID</th>
              <th className="px-3 py-2">Имя</th>
              <th className="px-3 py-2 w-44 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading ? (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={3}>
                  Ничего не найдено
                </td>
              </tr>
            ) : (
              items.map(t => (
                <tr key={t.id} className="border-t">
                  <td className="px-3 py-2">{t.id}</td>
                  <td className="px-3 py-2">
                    {editingId === t.id ? (
                      <input
                        className="rounded border p-1 w-80"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        autoFocus
                      />
                    ) : (
                      <span>{t.name || <span className="text-slate-400">—</span>}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right space-x-2">
                    {editingId === t.id ? (
                      <>
                        <button
                          className="rounded border px-2 py-1"
                          onClick={() => saveEdit(t.id)}
                          disabled={!isAdmin || !editName.trim()}
                        >
                          Сохранить
                        </button>
                        <button className="rounded border px-2 py-1" onClick={cancelEdit}>
                          Отмена
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="rounded border px-2 py-1 disabled:opacity-50"
                          onClick={() => startEdit(t)}
                          disabled={!isAdmin}
                          title={isAdmin ? 'Редактировать' : 'Только для админов'}
                        >
                          Редактировать
                        </button>
                        <button
                          className="rounded border px-2 py-1 hover:bg-red-50 hover:border-red-300 disabled:opacity-50"
                          onClick={() => onDelete(t.id)}
                          disabled={!isAdmin}
                          title={isAdmin ? 'Удалить' : 'Только для админов'}
                        >
                          Удалить
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
