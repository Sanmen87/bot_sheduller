'use client'
import { useEffect, useState } from 'react'
import { getWithCount, api } from '@/lib/api'
import { RequireAuth } from '@/lib/auth'
import type { UserRow, UserRole } from '@/lib/types'
import { toast } from 'sonner'
import clsx from 'clsx'

export default function UsersPage() {
  return (
    <RequireAuth>
      <UsersInner />
    </RequireAuth>
  )
}

function UsersInner() {
  const [items, setItems] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [role, setRole] = useState<UserRole | ''>('')
  const [ver, setVer] = useState<'' | 'true' | 'false'>('')
  const [editing, setEditing] = useState<UserRow | null>(null)

  const limit = 20
  const offset = (page - 1) * limit

  async function load() {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (role) p.set('role', role)
    if (ver) p.set('is_verified', ver)
    p.set('limit', String(limit))
    p.set('offset', String(offset))

    try {
      const { data, total } = await getWithCount<UserRow[]>(`/users?${p.toString()}`)
      setItems(data)
      setTotal(total)
    } catch (e: any) {
      toast.error(e?.message || 'Не удалось загрузить пользователей')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, role, ver, page])

  async function toggleVerify(u: UserRow) {
    try {
      await api.patch(`/users/${u.id}`, { is_verified: !u.is_verified })
      setItems(prev => prev.map(x => (x.id === u.id ? { ...x, is_verified: !x.is_verified } : x)))
    } catch (e: any) {
      toast.error(e?.message || 'Ошибка при изменении верификации')
    }
  }

  async function remove(u: UserRow) {
    const force = confirm(
      'Удалить вместе с данными учителя, если он учитель? Нажмите OK для форс-удаления, Cancel — обычное удаление.',
    )
    try {
      const qs = force ? '?force=true' : ''
      await api.delete(`/users/${u.id}${qs}`)
      setItems(prev => prev.filter(x => x.id !== u.id))
      setTotal(t => t - 1)
      toast.success('Пользователь удалён')
    } catch (e: any) {
      toast.error(e?.message || 'Не удалось удалить (возможно, есть активные брони)')
    }
  }

  const pages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Пользователи</h2>

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="w-64 rounded border p-2"
          placeholder="Поиск: имя/username/email/phone"
          value={q}
          onChange={e => {
            setPage(1)
            setQ(e.target.value)
          }}
        />
        <select
          className="rounded border p-2"
          value={role}
          onChange={e => {
            setPage(1)
            setRole(e.target.value as any)
          }}
        >
          <option value="">Все роли</option>
          <option value="admin">Админ</option>
          <option value="teacher">Учитель</option>
          <option value="client">Клиент</option>
          <option value="guest">Гость</option>
        </select>

        <select
          className="rounded border p-2"
          value={ver}
          onChange={e => {
            setPage(1)
            setVer(e.target.value as any)
          }}
          title="Фильтр по верификации"
        >
          <option value="">Все</option>
          <option value="false">Не верифицированные</option>
          <option value="true">Верифицированные</option>
        </select>

        <span className="ml-auto text-sm text-slate-500">Всего: {total}</span>
      </div>

      {/* без внутреннего горизонтального скролла */}
      <div className="rounded border bg-white">
        <table className="table-fixed w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left">
              <th className="p-2 w-24">Роль</th>
              <th className="p-2 w-[18rem]">username</th>
              <th className="p-2 w-28">Telegram ID</th>
              <th className={clsx('p-2 w-[20rem]', 'hidden lg:table-cell')}>Email</th>
              <th className={clsx('p-2 w-[16rem]', 'hidden xl:table-cell')}>Телефон</th>
              <th className="p-2 w-28">is_verified</th>
              <th className="p-2 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {items.map(u => (
              <tr key={u.id} className="border-t">
                <td className="p-2 whitespace-nowrap">{u.role}</td>

                <td className="p-2">
                  <span className="block max-w-[18rem] truncate" title={u.username || ''}>
                    {u.username || '—'}
                  </span>
                </td>

                <td className="p-2 whitespace-nowrap">{u.telegram_id}</td>

                <td className={clsx('p-2 hidden lg:table-cell')}>
                  <span className="block max-w-[20rem] truncate break-words" title={u.email || ''}>
                    {u.email || '—'}
                  </span>
                </td>

                <td className={clsx('p-2 hidden xl:table-cell')}>
                  <span className="block max-w-[16rem] truncate" title={u.phone || ''}>
                    {u.phone || '—'}
                  </span>
                </td>

                <td className="p-2">
                  <input type="checkbox" checked={u.is_verified} onChange={() => toggleVerify(u)} />
                </td>

                <td className="p-2 text-right space-x-2">
                  <button className="rounded border px-2 py-1" onClick={() => setEditing(u)}>
                    Изменить
                  </button>
                  <button className="rounded border px-2 py-1" onClick={() => remove(u)}>
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="p-4 text-slate-500" colSpan={99}>
                  Ничего не найдено
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <button
          disabled={page <= 1}
          className="rounded border px-2 py-1 disabled:opacity-50"
          onClick={() => setPage(p => p - 1)}
        >
          Назад
        </button>
        <span className="text-sm">
          {page}/{pages}
        </span>
        <button
          disabled={page >= pages}
          className="rounded border px-2 py-1 disabled:opacity-50"
          onClick={() => setPage(p => p + 1)}
        >
          Вперёд
        </button>
      </div>

      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={nu => setItems(prev => prev.map(x => (x.id === nu.id ? nu : x)))}
        />
      )}
    </div>
  )
}

/* === модалка редактирования: все поля + дубль is_verified === */
function EditUserModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserRow
  onClose: () => void
  onSaved: (u: UserRow) => void
}) {
  const [form, setForm] = useState({
    role: user.role,
    username: user.username ?? '',
    email: user.email ?? '',
    phone: user.phone ?? '',
    is_verified: user.is_verified,
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const payload: any = {
        role: form.role,
        username: form.username || null,
        email: form.email || null,
        phone: form.phone || null,
        is_verified: form.is_verified,
      }
      // ожидаем, что API вернёт обновлённого пользователя
      const updated = await api.patch<UserRow>(`/users/${user.id}`, payload)
      onSaved(updated)
      onClose()
    } catch (e: any) {
      toast.error(e?.message || 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-4 shadow-xl">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Пользователь #{user.id}</h3>
          <button className="ml-auto rounded border px-3 py-1" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-sm">Роль</span>
            <select
              className="rounded border p-2"
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}
            >
              <option value="admin">admin</option>
              <option value="teacher">teacher</option>
              <option value="client">client</option>
              <option value="guest">guest</option>
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-sm">username</span>
            <input
              className="rounded border p-2"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm">Email</span>
            <input
              className="rounded border p-2"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm">Телефон</span>
            <input
              className="rounded border p-2"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            />
          </label>

          <label className="mt-1 inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_verified}
              onChange={e => setForm(f => ({ ...f, is_verified: e.target.checked }))}
            />
            <span>is_verified</span>
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded border px-3 py-1" onClick={onClose}>
            Отмена
          </button>
          <button disabled={saving} className="rounded border px-3 py-1 disabled:opacity-50" onClick={save}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  )
}
