/**
 * Base API client.
 *
 * All requests go to the same origin (Caddy proxies /api/* to the backend).
 * The httpOnly auth cookie is sent automatically by the browser.
 * No token management is needed in JavaScript.
 */

import type { ApiError } from '@/types/api'

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(detail)
    this.name = 'ApiRequestError'
  }
}

/** Extract a human-readable message from any API error shape. */
function extractDetail(body: ApiError | unknown): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as ApiError).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail.map((e) => e.msg).join('; ')
    }
  }
  return 'An unexpected error occurred.'
}

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: 'include',  // Always send cookies
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })

  if (!res.ok) {
    let body: unknown
    try { body = await res.json() } catch { body = null }
    throw new ApiRequestError(res.status, extractDetail(body))
  }

  // 204 No Content
  if (res.status === 204) return undefined as T

  return res.json() as Promise<T>
}

export const api = {
  get:    <T>(path: string) => request<T>(path),
  post:   <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch:  <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
