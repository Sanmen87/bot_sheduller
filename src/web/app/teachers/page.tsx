'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { Teacher } from '@/lib/types'
import { RequireAuth } from '@/lib/auth'

export default function TeachersPage() {
  return (
    <RequireAuth>
      <TeachersInner />
    </RequireAuth>
  )
}

function TeachersInner() {
  const [items, setItems] = useState<Teacher[]>([])
  const [name, setName] = useState('')

  async function load() {
    const q = name ? `?q=${encodeURIComponent(name)}` : ''
    const data = await api.get<Teacher[]>(`/teachers${q}`)
    setItems(data)
  }

  useEffect(() => { load() }, [name])

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Учителя</h2>
      <input className="rounded border p-2" placeholder="Поиск" value={name} onChange={e=>setName(e.target.value)} />
      <ul className="divide-y">
        {items.map(t=> (
          <li key={t.id} className="py-2">{t.name}</li>
        ))}
      </ul>
    </div>
  )
}