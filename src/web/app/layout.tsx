import './globals.css'
import type { ReactNode } from 'react'
export const metadata = { title: 'CRM Schedule' }
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-dvh bg-slate-50 text-slate-900">
        <div className="mx-auto max-w-6xl p-4">{children}</div>
      </body>
    </html>
  )
}