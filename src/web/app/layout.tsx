import './globals.css'
import type { ReactNode } from 'react'
import Header from '@/components/Header'   // клиентский компонент можно рендерить здесь
import { AuthBootstrap } from '@/lib/auth' // тоже клиентский компонент

export const metadata = { title: 'CRM Schedule' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-dvh bg-slate-50 text-slate-900">
        <AuthBootstrap />
        <div className="mx-auto max-w-6xl p-4">
          <Header />
          {children}
        </div>
      </body>
    </html>
  )
}
