'use client'
import { useEffect, useState } from 'react'
import { getWithCount } from '@/lib/api'
import type { Slot, LessonType, Mode } from '@/lib/types'
import { RequireAuth } from '@/lib/auth'

export default function SlotsPage() {
  return (
    <RequireAuth>
      <SlotsInner />
    </RequireAuth>
  )
}

function SlotsInner() {
  const [items, setItems] = useState<Slot[]>([])
  const [total, setTotal] = useState(0)
  const [mode, setMode] = useState<''|Mode>('')
  const [lt, setLt] = useState<''|LessonType>('')

  async function load() {
    const q = new URLSearchParams()
    q.set('_page', '1')
    q.set('_limit', '100')
    if (mode) q.set('mode', mode)
    if (lt) q.set('lesson_type', lt)
    const { data, total } = await getWithCount<Slot[]>(`/slots?${q.toString()}`)
    setItems(data)
    setTotal(total)
  }

  useEffect(() => { load() }, [mode, lt])

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Слоты</h2>

      <div className="flex flex-wrap gap-2">
        <select className="rounded border p-1" value={mode} onChange={e=>setMode(e.target.value as any)}>
          <option value="">Любой формат</option>
          <option value="online">Онлайн</option>
          <option value="offline">Оффлайн</option>
        </select>
        <select className="rounded border p-1" value={lt} onChange={e=>setLt(e.target.value as any)}>
          <option value="">Любой тип</option>
          <option value="individual">Индивидуальное</option>
          <option value="group">Групповое</option>
        </select>
        <span className="ml-auto text-sm text-slate-500">Всего: {total}</span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="pb-2">ID</th>
            <th className="pb-2">Учитель</th>
            <th className="pb-2">Старт</th>
            <th className="pb-2">Конец</th>
            <th className="pb-2">Тип</th>
            <th className="pb-2">Формат</th>
            <th className="pb-2">Вместимость</th>
            <th className="pb-2">Свободно</th>
          </tr>
        </thead>
        <tbody>
          {items.map(s => (
            <tr key={s.id} className="border-t">
              <td className="py-2">{s.id}</td>
              <td className="py-2">{s.teacher_id}</td>
              <td className="py-2">{new Date(s.start).toLocaleString()}</td>
              <td className="py-2">{new Date(s.end).toLocaleString()}</td>
              <td className="py-2">{s.lesson_type}</td>
              <td className="py-2">{s.mode}</td>
              <td className="py-2">{s.capacity}</td>
              <td className="py-2">{s.free_spots ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}