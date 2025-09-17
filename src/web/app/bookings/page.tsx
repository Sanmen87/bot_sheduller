'use client'
import { useEffect, useState } from 'react'
import { getWithCount, api } from '@/lib/api'
import type { Booking } from '@/lib/types'
import { RequireAuth } from '@/lib/auth'

export default function BookingsPage() {
  return (
    <RequireAuth>
      <BookingsInner />
    </RequireAuth>
  )
}

function BookingsInner() {
  const [items, setItems] = useState<Booking[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<string>('')

  async function load() {
    const q = new URLSearchParams()
    q.set('_page', String(page))
    q.set('_limit', '20')
    if (status) q.set('status', status)
    const { data, total } = await getWithCount<Booking[]>(`/bookings?${q.toString()}`)
    setItems(data)
    setTotal(total)
  }

  useEffect(() => { load() }, [page, status])

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Бронирования</h2>

      <div className="flex items-center gap-2">
        <label className="text-sm">Статус:</label>
        <select className="rounded border p-1" value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="">Все</option>
          <option value="new">Новые</option>
          <option value="confirmed">Подтверждённые</option>
          <option value="cancelled">Отменённые</option>
        </select>
        <a className="ml-auto underline" href={`${process.env.NEXT_PUBLIC_API_BASE_URL}/bookings/export.csv`} target="_blank">Экспорт CSV</a>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="pb-2">ID</th>
            <th className="pb-2">Слот</th>
            <th className="pb-2">Студент</th>
            <th className="pb-2">Статус</th>
            <th className="pb-2"></th>
          </tr>
        </thead>
        <tbody>
          {items.map(b => (
            <tr key={b.id} className="border-t">
              <td className="py-2">{b.id}</td>
              <td className="py-2">{b.slot_id}</td>
              <td className="py-2">{b.student_id}</td>
              <td className="py-2">{b.status}</td>
              <td className="py-2">
                <button className="rounded border px-2 py-1" onClick={async()=>{
                  const next = b.status === 'confirmed' ? 'cancelled' : 'confirmed'
                  await api.patch(`/bookings/${b.id}`, { status: next })
                  load()
                }}>Toggle</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Pagination total={total} page={page} onPage={setPage} />
    </div>
  )
}

function Pagination({ total, page, onPage }: { total: number; page: number; onPage: (p:number)=>void }) {
  const pages = Math.max(1, Math.ceil(total / 20))
  return (
    <div className="flex gap-2">
      <button disabled={page<=1} className="rounded border px-2 py-1 disabled:opacity-50" onClick={()=>onPage(page-1)}>Назад</button>
      <span className="text-sm">{page}/{pages} • всего {total}</span>
      <button disabled={page>=pages} className="rounded border px-2 py-1 disabled:opacity-50" onClick={()=>onPage(page+1)}>Вперёд</button>
    </div>
  )
}
