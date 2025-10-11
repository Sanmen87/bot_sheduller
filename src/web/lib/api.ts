// lib/api.ts
const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000'

// ▼ ДОБАВИЛИ 'PUT'
type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT'

async function request<T>(path: string, method: HttpMethod = 'GET', body?: any): Promise<T> {
  const isForm = body instanceof URLSearchParams
  const res = await fetch(BASE + path, {
    method,
    credentials: 'include',
    headers: body
      ? isForm
        ? { 'Content-Type': 'application/x-www-form-urlencoded' }
        : { 'Content-Type': 'application/json' }
      : undefined,
    body: body
      ? isForm
        ? body.toString()
        : JSON.stringify(body)
      : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || res.statusText)
  }

  // Нормально обрабатываем 204 No Content
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return (await res.json()) as T
  if (ct.includes('text/csv'))         return (await res.text()) as unknown as T
  return undefined as unknown as T
}

export const api = {
  get:    <T>(p: string)        => request<T>(p, 'GET'),
  post:   <T>(p: string, b?: any) => request<T>(p, 'POST', b),
  patch:  <T>(p: string, b?: any) => request<T>(p, 'PATCH', b),
  put:    <T>(p: string, b?: any) => request<T>(p, 'PUT', b),   // ◄◄◄ ДОБАВЛЕНО
  delete: <T>(p: string)        => request<T>(p, 'DELETE'),
}

// --------- существующие функции оставляем как есть ---------

export async function getWithCount<T>(path: string): Promise<{ data: T; total: number }> {
  const res = await fetch(BASE + path, { credentials: 'include' })
  if (!res.ok) throw new Error(await res.text())
  const total = Number(res.headers.get('X-Total-Count') || '0')
  const data = await res.json()
  return { data, total }
}

// НОРМАЛИЗАЦИЯ ВРЕМЕНИ
function toHms(v?: string): string | undefined {
  if (!v) return v
  return v.length === 5 ? v + ':00' : v
}

// ПОЛУЧИТЬ СЛОТЫ НА ДАТУ
export async function getSlotsByDate(dateISO: string, teacherIds?: number[]) {
  const params = new URLSearchParams()
  params.set('date', dateISO)
  if (teacherIds?.length) params.set('teacher_id', teacherIds.join(','))
  const res = await fetch(`${BASE}/slots?${params.toString()}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to load slots')
  return res.json()
}

// PATCH СЛОТА
export async function patchSlot(id: number, payload: {
  start_time?: string
  end_time?: string
  subject_id?: number
  lesson_type?: 'individual'|'group'|string|null
  mode?: 'online'|'offline'|null
  status?: 'available'|'booked'|'canceled'|'hidden'|'tentative'
  capacity?: number
}) {
  const body = {
    ...payload,
    start_time: toHms(payload.start_time),
    end_time: toHms(payload.end_time),
  }
  const res = await fetch(`${BASE}/slots/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Ошибка сохранения: ${res.status} ${text}`)
  }
  return res.json()
}

// СОЗДАНИЕ СЛОТОВ ИНТЕРВАЛОМ
export async function createSlotsByInterval(params: {
  teacher_id: number
  date: string
  subject_id: number
  start_time: string
  end_time: string
  step_min?: number
  lesson_type: 'individual'|'group'
  capacity: number
  mode: 'online'|'offline'
  status: 'available'|'booked'|'canceled'|'hidden'|'tentative'
}) {
  const { teacher_id, date, subject_id, start_time, end_time, step_min, lesson_type, capacity, mode, status } = params
  return api.post(`/teachers/${teacher_id}/slots`, {
    date,
    subject_id,
    start_time: toHms(start_time),
    end_time: toHms(end_time),
    step_min,
    lesson_type,
    capacity,
    mode,
    status,
    skip_conflicts: true,
  })
}

// УДАЛЕНИЕ СЛОТА
export async function deleteSlot(id: number) {
  const res = await fetch(`${BASE}/slots/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Не удалось удалить слот: ${res.status} ${text || res.statusText}`)
  }
}

// ▼ УДОБНЫЕ ХЕЛПЕРЫ ДЛЯ ПОЧТЫ (без «диагностики»)
export type MailSettingsPayload = {
  enabled: boolean
  from_addr: string
  host: string
  port: number
  user: string
  password?: string // можно не передавать, если бэк трактует пустой как «не менять»
  starttls: boolean
}

export function saveMailSettings(payload: MailSettingsPayload) {
  return api.put('/admin/settings/mail', payload)
}

export function sendMailTest(to: string) {
  return api.post('/admin/settings/mail/test', { to })
}
