export type ApiErrorKind =
  | 'unauthorized'
  | 'invalid_credentials'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'service_unavailable'
  | 'validation'
  | 'http'
  | 'network'
  | 'aborted'

export interface ApiErrorInit {
  readonly kind: ApiErrorKind
  readonly status: number | null
  readonly message: string
  readonly fieldErrors?: Record<string, string[]>
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | null
  readonly fieldErrors: Record<string, string[]>

  constructor(init: ApiErrorInit) {
    super(init.message)
    this.name = 'ApiError'
    this.kind = init.kind
    this.status = init.status
    this.fieldErrors = init.fieldErrors ?? {}
  }
}

// Filtro heurístico de respaldo en cliente para mensajes 4xx (trazas, SQL, HTML y rutas Windows/Linux).
// No constituye por sí solo una garantía absoluta de RD-08: el backend es responsable de no emitir
// detalles internos y en errores 500-599 el cliente descarta por completo el cuerpo del servidor.
const INTERNAL_LEAK_PATTERN =
  /(?:\bat\s+[\w.<>$+]+\s*\(|System\.[\w.]+Exception|Microsoft\.[\w.]+|SqlException|\bSELECT\s+.+\bFROM\b|\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b|[A-Za-z]:[\\/][\w.\\/-]+|\\\\[\w.-]+\\[\w.\\-]+|(?:^|[\s(,'"])(?:\.{0,2}\/(?:home|var|usr|etc|opt|tmp|srv|root|proc|sys|dev|mnt|run|boot|lib|lib64|bin|sbin|app|src|workspace|builds)(?:\/[\w.-]+)+|\.{0,2}\/[\w.-]+\/[\w./-]+)|[\w./\\-]+\.(?:cs|csproj|sln|dll|pdb|sql|config|env)\b|<!DOCTYPE\s+html|<html\b)/i

export function sanitizeServerMessage(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 500 || INTERNAL_LEAK_PATTERN.test(trimmed)) {
    return null
  }
  return trimmed
}

export function extractFieldErrors(rawErrors: unknown): Record<string, string[]> {
  if (!rawErrors || typeof rawErrors !== 'object' || Array.isArray(rawErrors)) {
    return {}
  }

  const result: Record<string, string[]> = {}
  for (const [field, value] of Object.entries(rawErrors as Record<string, unknown>)) {
    if (typeof value === 'string') {
      const safe = sanitizeServerMessage(value)
      if (safe) {
        result[field] = [safe]
      }
    } else if (Array.isArray(value)) {
      const messages = value
        .map((item) => sanitizeServerMessage(item))
        .filter((msg): msg is string => msg !== null)
      if (messages.length > 0) {
        result[field] = messages
      }
    }
  }
  return result
}

const GENERIC_PROBLEM_TITLES = new Set([
  'one or more validation errors occurred.',
  'bad request',
  'unauthorized',
  'forbidden',
  'not found',
  'conflict',
  'an error occurred while processing your request.',
])

export function parseErrorBody(body: unknown): {
  message: string | null
  fieldErrors: Record<string, string[]>
} {
  if (typeof body === 'string') {
    return { message: sanitizeServerMessage(body), fieldErrors: {} }
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { message: null, fieldErrors: {} }
  }

  const record = body as Record<string, unknown>
  const fieldErrors = extractFieldErrors(record.errors ?? record.errores)

  const directMessage =
    sanitizeServerMessage(record.mensaje) ??
    sanitizeServerMessage(record.message) ??
    sanitizeServerMessage(record.detail)

  if (directMessage) {
    return { message: directMessage, fieldErrors }
  }

  const firstFieldError = Object.values(fieldErrors)[0]?.[0] ?? null
  if (firstFieldError) {
    return { message: firstFieldError, fieldErrors }
  }

  const title = sanitizeServerMessage(record.title)
  if (title && !GENERIC_PROBLEM_TITLES.has(title.toLowerCase())) {
    return { message: title, fieldErrors }
  }

  return { message: null, fieldErrors }
}

export function createHttpApiError(
  status: number,
  body: unknown,
  options: { isAuthenticatedRequest: boolean }
): ApiError {
  if (status >= 500 && status <= 599) {
    if (status === 503) {
      return new ApiError({
        kind: 'service_unavailable',
        status,
        message: 'El servicio está temporalmente ocupado. Intenta nuevamente en unos segundos.',
        fieldErrors: {},
      })
    }

    return new ApiError({
      kind: 'http',
      status,
      message: 'Ocurrió un error al procesar la solicitud en el servidor.',
      fieldErrors: {},
    })
  }

  const { message, fieldErrors } = parseErrorBody(body)

  if (status === 401) {
    if (options.isAuthenticatedRequest) {
      return new ApiError({
        kind: 'unauthorized',
        status,
        message: message ?? 'Tu sesión ha expirado o no es válida. Inicia sesión nuevamente.',
        fieldErrors,
      })
    }
    return new ApiError({
      kind: 'invalid_credentials',
      status,
      message: message ?? 'Credenciales inválidas. Verifica tu correo y contraseña.',
      fieldErrors,
    })
  }

  if (status === 403) {
    return new ApiError({
      kind: 'forbidden',
      status,
      message: message ?? 'No tienes permisos para realizar esta operación.',
      fieldErrors,
    })
  }

  if (status === 404) {
    return new ApiError({
      kind: 'not_found',
      status,
      message: message ?? 'El recurso solicitado no fue encontrado.',
      fieldErrors,
    })
  }

  if (status === 409) {
    return new ApiError({
      kind: 'conflict',
      status,
      message: message ?? 'La operación entró en conflicto con el estado actual del recurso.',
      fieldErrors,
    })
  }

  if (status === 400 || status === 422 || Object.keys(fieldErrors).length > 0) {
    return new ApiError({
      kind: 'validation',
      status,
      message: message ?? 'Los datos enviados no son válidos. Revisa los campos e intenta de nuevo.',
      fieldErrors,
    })
  }

  return new ApiError({
    kind: 'http',
    status,
    message: message ?? 'Ocurrió un error al procesar la solicitud en el servidor.',
    fieldErrors,
  })
}
