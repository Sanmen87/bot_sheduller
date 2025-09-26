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

export async function getSlotsByDate(dateISO: string, teacherIds?: number[]) {
  const params = new URLSearchParams();
  // Вариант 1 — если бек принимает `date`
  params.set('date', dateISO); 
  if (teacherIds?.length) params.set('teacher_id', teacherIds.join(','));

  // Если ваш API использует from/to, просто раскомментируйте эти две строки и удалите set('date',...)
  // params.set('date_from', dateISO);
  // params.set('date_to', dateISO);

  const res = await fetch(`${API_BASE}/slots?${params.toString()}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load slots');
  return res.json();
}

export async function patchSlot(id: number, payload: {
  start_time?: string; // "HH:MM"
  end_time?: string;
  subject_id?: number;
  lesson_type?: 'individual'|'group'|string|null;
  mode?: 'online'|'offline'|null;
  status?: 'available'|'booked'|'canceled'|'hidden'|'tentative';
}) {
  const res = await fetch(`${API_BASE}/slots/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ошибка сохранения: ${res.status} ${text}`);
  }
  return res.json();
}