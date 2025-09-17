'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth, logout } from '@/lib/auth'

export default function Header() {
  const authed = useAuth(s => s.authed)
  const router = useRouter()

  return (
    <div className="mb-6 flex items-center gap-4">
      <h1 className="text-2xl font-semibold">CRM расписание — web UI</h1>
      <div className="ml-auto flex items-center gap-4 text-sm">
        {authed ? (
          <>
            <Link className="underline" href="/bookings">Бронирования</Link>
            <Link className="underline" href="/slots">Слоты</Link>
            <Link className="underline" href="/teachers">Учителя</Link>
            <Link className="underline" href="/reports/teacher-load">Отчёты</Link>
            <button
              className="rounded border px-2 py-1"
              onClick={() => logout(router)}
            >
              Выйти
            </button>
          </>
        ) : (
          <Link className="underline" href="/login">Вход</Link>
        )}
      </div>
    </div>
  )
}
