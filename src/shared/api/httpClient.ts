import { apiConfig, resolveApiUrl, type ApiConfig } from '../config/env.ts'
import { ApiError, createHttpApiError } from './apiError.ts'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface HttpRequestOptions {
  readonly method?: HttpMethod
  readonly body?: unknown
  readonly auth?: boolean
  readonly signal?: AbortSignal
  readonly headers?: Record<string, string>
  readonly config?: ApiConfig
  readonly fetchImpl?: typeof fetch
}

type SessionInvalidatedListener = (invalidatedToken: string) => void

let inMemoryToken: string | null = null
const sessionInvalidatedListeners = new Set<SessionInvalidatedListener>()

export function setSessionToken(token: string | null): void {
  const normalized = token?.trim() ?? ''
  inMemoryToken = normalized !== '' ? normalized : null
}

export function getSessionToken(): string | null {
  return inMemoryToken
}

export function clearSessionTokenIfMatches(expectedToken: string): boolean {
  if (inMemoryToken === null || inMemoryToken !== expectedToken) {
    return false
  }
  inMemoryToken = null
  for (const listener of sessionInvalidatedListeners) {
    listener(expectedToken)
  }
  return true
}

export function onSessionInvalidated(listener: SessionInvalidatedListener): () => void {
  sessionInvalidatedListeners.add(listener)
  return () => {
    sessionInvalidatedListeners.delete(listener)
  }
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) {
    return true
  }
  return error instanceof Error && error.name === 'AbortError'
}

function isApiAuthenticatedPath(path: string): boolean {
  return path === '/api' || path.startsWith('/api/') || path.startsWith('/api?')
}

export async function httpRequest<T = unknown>(
  path: string,
  options: HttpRequestOptions = {}
): Promise<T> {
  const {
    method = 'GET',
    body,
    auth = false,
    signal,
    headers: customHeaders,
    config = apiConfig,
    fetchImpl = globalThis.fetch,
  } = options

  const url = resolveApiUrl(path, config)

  if (auth && !isApiAuthenticatedPath(path)) {
    throw new Error('El token de sesión solo puede enviarse a rutas autenticadas bajo /api.')
  }

  const requestToken = auth ? inMemoryToken : null
  if (auth && !requestToken) {
    throw new ApiError({
      kind: 'unauthorized',
      status: 401,
      message: 'No hay una sesión activa. Inicia sesión nuevamente.',
    })
  }

  const requestHeaders: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    ...customHeaders,
  }

  let serializedBody: string | undefined
  if (body !== undefined) {
    requestHeaders['Content-Type'] = requestHeaders['Content-Type'] ?? 'application/json'
    serializedBody = typeof body === 'string' ? body : JSON.stringify(body)
  }

  if (auth && requestToken) {
    requestHeaders.Authorization = `Bearer ${requestToken}`
  }

  let response: Response
  try {
    response = await fetchImpl(url, {
      method,
      headers: requestHeaders,
      body: serializedBody,
      signal,
    })
  } catch (error) {
    if (isAbortError(error, signal)) {
      throw new ApiError({
        kind: 'aborted',
        status: null,
        message: 'La solicitud fue cancelada.',
      })
    }
    throw new ApiError({
      kind: 'network',
      status: null,
      message: 'No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.',
    })
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  const isJsonContent = contentType.includes('application/json') || contentType.includes('+json')

  let rawText = ''
  if (response.status !== 204 && response.status !== 205) {
    try {
      rawText = await response.text()
    } catch (error) {
      if (isAbortError(error, signal)) {
        throw new ApiError({
          kind: 'aborted',
          status: null,
          message: 'La solicitud fue cancelada.',
        })
      }
      throw new ApiError({
        kind: 'network',
        status: response.status,
        message: 'Ocurrió un fallo de red al leer la respuesta del servidor.',
      })
    }
  }

  const hasBody = rawText.trim() !== ''
  let parsedBody: unknown = undefined

  if (hasBody) {
    if (isJsonContent) {
      try {
        parsedBody = JSON.parse(rawText)
      } catch {
        if (response.ok) {
          throw new ApiError({
            kind: 'http',
            status: response.status,
            message: 'El servidor devolvió una respuesta JSON inválida.',
          })
        }
        parsedBody = rawText
      }
    } else {
      parsedBody = rawText
    }
  }

  if (!response.ok) {
    if (response.status === 401 && auth && requestToken) {
      clearSessionTokenIfMatches(requestToken)
    }
    throw createHttpApiError(response.status, parsedBody, {
      isAuthenticatedRequest: auth,
    })
  }

  return parsedBody as T
}
