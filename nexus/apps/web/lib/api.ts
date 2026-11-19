export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
async function raw(method: string, path: string, body?: unknown) {
  return fetch('/api/v1' + path, { method, credentials: 'same-origin', headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}
export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  let r = await raw(method, path, body);
  if (r.status === 401 && !path.startsWith('/auth/')) { const rf = await raw('POST', '/auth/refresh', {}); if (rf.ok) r = await raw(method, path, body); }
  const text = await r.text(); let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!r.ok) throw new ApiError(r.status, data?.message || 'Request failed');
  return data as T;
}
export const get = <T = any>(p: string) => api<T>('GET', p);
export const post = <T = any>(p: string, b: unknown = {}) => api<T>('POST', p, b);
export const put = <T = any>(p: string, b: unknown = {}) => api<T>('PUT', p, b);
export const patch = <T = any>(p: string, b: unknown) => api<T>('PATCH', p, b);
export const del = <T = any>(p: string) => api<T>('DELETE', p);
export const nad = (n: number | null | undefined) => (n == null ? 'Not published' : 'N$' + n.toLocaleString('en-ZA', { maximumFractionDigits: 0 }));
export const date = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not published');
