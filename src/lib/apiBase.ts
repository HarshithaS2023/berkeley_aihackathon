const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {}

/** Backend root. In dev, defaults to `/api` (Vite proxy). Set VITE_API_BASE to override. */
export const API_BASE = (env.VITE_API_BASE ?? '/api').replace(/\/$/, '')
