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