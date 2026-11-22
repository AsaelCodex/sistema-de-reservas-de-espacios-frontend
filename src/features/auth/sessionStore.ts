import { ApiError } from '../../shared/api/apiError.ts'
import {
  clearSessionTokenIfMatches,
  getSessionToken,
  httpRequest,
  onSessionInvalidated,
  setSessionToken,
} from '../../shared/api/httpClient.ts'
import type { ApiConfig } from '../../shared/config/env.ts'
import {
  validarCredencialSesion,
  validarUsuarioAutenticado,
  type EstadoSesion,
  type ResultadoCierreSesion,
  type UsuarioAutenticado,
} from './types/auth.ts'

export interface SessionOperationOptions {
  readonly fetchImpl?: typeof fetch
  readonly config?: ApiConfig
  readonly signal?: AbortSignal
}

const INITIAL_STATE: EstadoSesion = {
  status: 'anonymous',
  usuario: null,
  vencimiento: null,
  motivoInvalidez: null,
}

let currentState: EstadoSesion = INITIAL_STATE
const listeners = new Set<() => void>()

function updateState(next: EstadoSesion): void {
  currentState = next
  for (const listener of listeners) {
    listener()
  }
}

onSessionInvalidated(() => {
  updateState({
    status: 'anonymous',
    usuario: null,
    vencimiento: null,
    motivoInvalidez: 'sesion_expirada',
  })
})

export function getSessionSnapshot(): EstadoSesion {
  return currentState
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function limpiarSesionEnMemoria(): void {
  setSessionToken(null)
  updateState(INITIAL_STATE)
}

/**
 * Activa una sesión exclusivamente en memoria a partir de `{ token, vencimiento }`
 * devueltos por `POST /api/sesiones` y consulta `/api/usuarios/yo` para obtener
 * la identidad y el rol reales desde el servidor.
 */
export async function establecerSesion(
  credencialRaw: unknown,
  options: SessionOperationOptions = {}
): Promise<UsuarioAutenticado> {
  const { token, vencimiento } = validarCredencialSesion(credencialRaw)

  setSessionToken(token)
  updateState({
    status: 'loading',
    usuario: null,
    vencimiento,
    motivoInvalidez: null,
  })

  try {
    const rawUser = await httpRequest<unknown>('/api/usuarios/yo', {
      method: 'GET',
      auth: true,
      fetchImpl: options.fetchImpl,
      config: options.config,
      signal: options.signal,
    })

    const usuario = validarUsuarioAutenticado(rawUser)

    if (getSessionToken() === token) {
      updateState({
        status: 'authenticated',
        usuario,
        vencimiento,
        motivoInvalidez: null,
      })
    }

    return usuario
  } catch (error) {
    if (getSessionToken() === token) {
      clearSessionTokenIfMatches(token)
      updateState(INITIAL_STATE)
    }
    throw error
  }
}

export async function consultarUsuarioActual(
  options: SessionOperationOptions = {}
): Promise<UsuarioAutenticado> {
  const activeToken = getSessionToken()
  const rawUser = await httpRequest<unknown>('/api/usuarios/yo', {
    method: 'GET',
    auth: true,
    fetchImpl: options.fetchImpl,
    config: options.config,
    signal: options.signal,
  })

  const usuario = validarUsuarioAutenticado(rawUser)

  if (activeToken && getSessionToken() === activeToken) {
    updateState({
      status: 'authenticated',
      usuario,
      vencimiento: currentState.vencimiento,
      motivoInvalidez: null,
    })
  }

  return usuario
}

/**
 * Limpia siempre el estado sensible en memoria e invoca `DELETE /api/sesiones`.
 * Si la revocación remota falla, informa `revocadaEnServidor: false` junto al error
 * sin afirmar éxito en el servidor (AGENTS.md §7).
 */
export async function cerrarSesion(
  options: SessionOperationOptions = {}
): Promise<ResultadoCierreSesion> {
  const tokenToRevoke = getSessionToken()
  limpiarSesionEnMemoria()

  if (!tokenToRevoke) {
    return { revocadaEnServidor: false }
  }

  try {
    await httpRequest<unknown>('/api/sesiones', {
      method: 'DELETE',
      auth: false,
      headers: {
        Authorization: `Bearer ${tokenToRevoke}`,
      },
      fetchImpl: options.fetchImpl,
      config: options.config,
      signal: options.signal,
    })
    return { revocadaEnServidor: true }
  } catch (error) {
    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError({
            kind: 'http',
            status: null,
            message: 'No se pudo confirmar el cierre de sesión en el servidor.',
          })
    return {
      revocadaEnServidor: false,
      error: apiError,
    }
  }
}
