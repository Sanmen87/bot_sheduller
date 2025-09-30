const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000'

type HttpMethod = 'GET'|'POST'|'PATCH'|'DELETE'

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
    const text = await res.text().catch(()=> '')
    throw new Error(text || res.statusText)
  }
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('text/csv')) {
    // @ts-expect-error
    return await res.text()
  }
  if (ct.includes('application/json')) return await res.json()
  // @ts-expect-error
  return undefined
}

export const api = {
  get: <T>(p: string) => request<T>(p, 'GET'),
  post: <T>(p: string, b?: any) => request<T>(p, 'POST', b),
  patch: <T>(p: string, b?: any) => request<T>(p, 'PATCH', b),
  delete: <T>(p: string) => request<T>(p, 'DELETE'),
}

export async function getWithCount<T>(path: string): Promise<{data: T; total: number}> {
  const res = await fetch(BASE + path, { credentials: 'include' })
  if (!res.ok) throw new Error(await res.text())
  const total = Number(res.headers.get('X-Total-Count') || '0')
  const data = await res.json()
  return { data, total }
}

// ⬇️ НОРМАЛИЗАЦИЯ ВРЕМЕНИ
function toHms(v?: string): string | undefined {
  if (!v) return v
  return v.length === 5 ? v + ':00' : v
}

// ⬇️ ПОЛУЧИТЬ СЛОТЫ НА ДАТУ
export async function getSlotsByDate(dateISO: string, teacherIds?: number[]) {
  const params = new URLSearchParams()
  // если бек принимает единственный параметр date:
  params.set('date', dateISO)
  if (teacherIds?.length) params.set('teacher_id', teacherIds.join(','))

  // если у вас API использует date_from/date_to – раскомментируйте и удалите set('date',...)
  // params.set('date_from', dateISO)
  // params.set('date_to', dateISO)

  const res = await fetch(`${BASE}/slots?${params.toString()}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to load slots')
  return res.json()
}

// ⬇️ PATCH СЛОТА
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

// ⬇️ СОЗДАНИЕ СЛОТОВ ИНТЕРВАЛОМ (экспорт, чтобы импортировать на странице)
export async function createSlotsByInterval(params: {
  teacher_id: number
  date: string
  subject_id: number
  start_time: string // 'HH:MM'
  end_time: string   // 'HH:MM'
  step_min?: number
  lesson_type: 'individual'|'group'   // ← добавили
  capacity: number
  mode: 'online'|'offline'
  status: 'available'|'booked'|'canceled'|'hidden'|'tentative'
}) {
  const {
    teacher_id, date, subject_id, start_time, end_time,
    step_min, lesson_type, capacity, mode, status
  } = params

  return api.post(`/teachers/${teacher_id}/slots`, {
    date,
    subject_id,
    start_time: toHms(start_time), // → "HH:MM:00"
    end_time: toHms(end_time),     // → "HH:MM:00"
    step_min,
    lesson_type,                   // ← ВАЖНО: теперь уходит на бэк
    capacity,
    mode,
    status,
    skip_conflicts: true,
  })
}