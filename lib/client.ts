export async function api<T = unknown>(url: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch('/api/' + url, {
    method,
    credentials: 'same-origin',
    headers: data ? { 'Content-Type': 'application/json' } : undefined,
    body: data ? JSON.stringify(data) : undefined,
    cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || '요청에 실패했습니다.');
  return result;
}
