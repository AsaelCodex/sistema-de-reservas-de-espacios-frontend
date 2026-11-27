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
  type IniciarSesionRequest,
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
  avisoCierre: null,
}

let currentState: EstadoSesion = INITIAL_STATE
let sessionEpoch = 0
const listeners = new Set<() => void>()

function updateState(next: EstadoSesion): void {
  currentState = next
  for (const listener of listeners) {
    listener()
  }
}

onSessionInvalidated(() => {
  sessionEpoch += 1
  updateState({
    status: 'anonymous',
    usuario: null,
    vencimiento: null,
    motivoInvalidez: 'sesion_expirada',
    avisoCierre: null,
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
  sessionEpoch += 1
  setSessionToken(null)
  updateState(INITIAL_STATE)
}

/**
 * Envía `POST /api/sesiones` como petición pública con las claves exactas
 * `{ correo, contraseña }` (sin recortar ni transformar la contraseña) y,
 * al recibir la credencial, la pasa a `establecerSesion`.
 */
export async function iniciarSesion(
  credenciales: IniciarSesionRequest,
  options: SessionOperationOptions = {}
): Promise<UsuarioAutenticado> {
  const credencialRaw = await httpRequest<unknown>('/api/sesiones', {
    method: 'POST',
    auth: false,
    body: {
      correo: credenciales.correo.trim(),
      contraseña: credenciales.contraseña,
    },
    fetchImpl: options.fetchImpl,
    config: options.config,
    signal: options.signal,
  })

  return establecerSesion(credencialRaw, options)
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

  sessionEpoch += 1
  const activeEpoch = sessionEpoch

  setSessionToken(token)
  updateState({
    status: 'loading',
    usuario: null,
    vencimiento,
    motivoInvalidez: null,
    avisoCierre: null,
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

    if (sessionEpoch === activeEpoch && getSessionToken() === token) {
      updateState({
        status: 'authenticated',
        usuario,
        vencimiento,
        motivoInvalidez: null,
        avisoCierre: null,
      })
    }

    return usuario
  } catch (error) {
    if (sessionEpoch === activeEpoch && getSessionToken() === token) {
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
  const activeEpoch = sessionEpoch
  const rawUser = await httpRequest<unknown>('/api/usuarios/yo', {
    method: 'GET',
    auth: true,
    fetchImpl: options.fetchImpl,
    config: options.config,
    signal: options.signal,
  })

  const usuario = validarUsuarioAutenticado(rawUser)

  if (activeToken && sessionEpoch === activeEpoch && getSessionToken() === activeToken) {
    updateState({
      status: 'authenticated',
      usuario,
      vencimiento: currentState.vencimiento,
      motivoInvalidez: null,
      avisoCierre: null,
    })
  }

  return usuario
}

/**
 * Limpia siempre el estado sensible en memoria e invoca `DELETE /api/sesiones`.
 * El resultado y el aviso de fallo quedan asociados a la sesión que se cerró:
 * si ya comenzó una sesión nueva mientras el DELETE seguía en curso, no altera
 * el estado, el token ni la ruta de la sesión nueva.
 */
export async function cerrarSesion(
  options: SessionOperationOptions = {}
): Promise<ResultadoCierreSesion> {
  const tokenToRevoke = getSessionToken()
  limpiarSesionEnMemoria()
  const closedSessionEpoch = sessionEpoch

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

    if (sessionEpoch === closedSessionEpoch && getSessionToken() === null) {
      updateState({
        ...INITIAL_STATE,
        avisoCierre: `La sesión se cerró en este navegador, pero no se pudo revocar en el servidor: ${apiError.message}`,
      })
    }

    return {
      revocadaEnServidor: false,
      error: apiError,
    }
  }
}
