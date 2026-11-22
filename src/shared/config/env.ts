export type ApiConnectionMode = 'relative-proxy' | 'cors-origin'

export interface ApiConfig {
  readonly baseUrl: string
  readonly mode: ApiConnectionMode
}

export function parseApiConfig(rawBaseUrl?: string): ApiConfig {
  const trimmed = (rawBaseUrl ?? '').trim()
  if (trimmed === '') {
    return { baseUrl: '', mode: 'relative-proxy' }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('VITE_API_BASE_URL debe estar vacío (modo proxy) o ser un origen http/https válido.')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('VITE_API_BASE_URL solo admite protocolos http: o https:.')
  }

  if (parsed.username || parsed.password) {
    throw new Error('VITE_API_BASE_URL no debe incluir credenciales (RD-10).')
  }

  if (parsed.pathname !== '/') {
    throw new Error('VITE_API_BASE_URL debe ser un origen sin ruta (solo se admite /).')
  }

  if (parsed.search !== '' || parsed.hash !== '' || trimmed.includes('?') || trimmed.includes('#')) {
    throw new Error('VITE_API_BASE_URL no debe incluir query string ni fragmento.')
  }

  return { baseUrl: parsed.origin, mode: 'cors-origin' }
}

const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env

export const apiConfig: ApiConfig = parseApiConfig(viteEnv?.VITE_API_BASE_URL)

export function resolveApiUrl(path: string, config: ApiConfig = apiConfig): string {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('La ruta de la API debe ser relativa y comenzar con una sola barra (ej. /api/sesiones).')
  }
  return `${config.baseUrl}${path}`
}
