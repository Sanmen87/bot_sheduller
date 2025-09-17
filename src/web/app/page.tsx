import Link from 'next/link'
export default function Home() {
  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">CRM расписание — web UI</h1>
      <nav className="grid gap-2">
        <Link className="underline" href="/login">Вход</Link>
        <Link className="underline" href="/bookings">Бронирования</Link>
        <Link className="underline" href="/slots">Слоты</Link>
        <Link className="underline" href="/teachers">Учителя</Link>
        <Link className="underline" href="/reports/teacher-load">Отчёты: нагрузка</Link>
      </nav>
    </main>
  )
}