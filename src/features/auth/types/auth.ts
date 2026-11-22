import type { ApiError } from '../../../shared/api/apiError.ts'

/**
 * Roles oficiales del sistema (RF-CA-04).
 * AGENTS.md §6: el valor técnico serializado para Estándar puede ser "Estandar" o "Estándar".
 */
export type RolUsuario = 'Administrador' | 'Estandar' | 'Estándar'

/**
 * Respuesta comprobada de POST /api/sesiones (AGENTS.md §6).
 * El token es opaco; no se asume formato JWT.
 */
export interface CredencialSesionResponse {
  readonly token: string
  readonly vencimiento: string
}

/**
 * Identidad y rol devueltos por GET /api/usuarios/yo (RF-CA-07, docs/gestion-permisos.md §5).
 * `rol` está comprobado en la documentación; `id`, `nombre` y `correo` se leen de forma
 * opcional si el servidor los incluye en la respuesta.
 */
export interface UsuarioAutenticado {
  readonly id?: string
  readonly nombre?: string
  readonly correo?: string
  readonly rol: RolUsuario
}

export type EstadoAutenticacion = 'anonymous' | 'loading' | 'authenticated'

export type MotivoInvalidezSesion = 'sesion_expirada' | null

export interface EstadoSesion {
  readonly status: EstadoAutenticacion
  readonly usuario: UsuarioAutenticado | null
  readonly vencimiento: string | null
  readonly motivoInvalidez: MotivoInvalidezSesion
}

export interface ResultadoCierreSesion {
  readonly revocadaEnServidor: boolean
  readonly error?: ApiError
}

/**
 * Contratos de entrada/salida de autenticación cuyos esquemas JSON exactos
 * dependen de confirmación contra los Controllers/Models actuales del backend:
 *
 * 1. POST /api/sesiones (cuerpo de petición): confirmar si la clave es `contraseña` o `contrasena`.
 * 2. POST /api/usuarios (registro): confirmar claves exactas (`nombre`, `correo`, `contraseña`/`contrasena`).
 * 3. GET /activar?token=... y POST /activar/reenviar: confirmar ruta exacta en API para no colisionar con la vista `/activar`.
 * 4. PUT /api/usuarios/yo/contrasena: confirmar nombres de campos para contraseña actual y nueva.
 * 5. POST /api/recuperacion-contrasena y POST /api/recuperacion-contrasena/cambio: confirmar campos de solicitud y canje de código.
 */
export type ContratoAutenticacionPendiente =
  | 'POST /api/sesiones (request body)'
  | 'POST /api/usuarios (request/response)'
  | 'GET /activar y POST /activar/reenviar (ruta y DTO)'
  | 'PUT /api/usuarios/yo/contrasena (request body)'
  | 'POST /api/recuperacion-contrasena y /cambio (request body)'

const ISO_8601_WITH_TZ_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/

export function esFechaIso8601ConZona(valor: string): boolean {
  const match = ISO_8601_WITH_TZ_REGEX.exec(valor)
  if (!match) {
    return false
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const tzOffsetHour = match[8] !== undefined ? Number(match[8]) : 0
  const tzOffsetMinute = match[9] !== undefined ? Number(match[9]) : 0

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    tzOffsetHour > 23 ||
    tzOffsetMinute > 59
  ) {
    return false
  }

  const dateCheck = new Date(Date.UTC(year, month - 1, day))
  if (
    dateCheck.getUTCFullYear() !== year ||
    dateCheck.getUTCMonth() !== month - 1 ||
    dateCheck.getUTCDate() !== day
  ) {
    return false
  }

  return !Number.isNaN(Date.parse(valor))
}

export function esRolUsuario(valor: unknown): valor is RolUsuario {
  return valor === 'Administrador' || valor === 'Estandar' || valor === 'Estándar'
}

export function esAdministrador(usuario: UsuarioAutenticado | null | undefined): boolean {
  return usuario?.rol === 'Administrador'
}

export function validarCredencialSesion(data: unknown): CredencialSesionResponse {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('La respuesta de sesión no tiene un formato válido.')
  }
  const record = data as Record<string, unknown>
  const token = typeof record.token === 'string' ? record.token.trim() : ''
  const vencimiento = typeof record.vencimiento === 'string' ? record.vencimiento.trim() : ''

  if (!token || !vencimiento) {
    throw new Error('La respuesta de sesión no incluye token y vencimiento válidos.')
  }

  if (!esFechaIso8601ConZona(vencimiento)) {
    throw new Error(
      'El campo vencimiento debe ser una fecha ISO-8601 válida con zona horaria explícita.'
    )
  }

  return { token, vencimiento }
}

export function validarUsuarioAutenticado(data: unknown): UsuarioAutenticado {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('La respuesta de identidad del usuario no es un objeto válido.')
  }
  const record = data as Record<string, unknown>
  if (!esRolUsuario(record.rol)) {
    throw new Error('La respuesta de /api/usuarios/yo no contiene un rol válido.')
  }

  return {
    rol: record.rol,
    ...(typeof record.id === 'string' && record.id.trim() !== '' ? { id: record.id.trim() } : {}),
    ...(typeof record.nombre === 'string' && record.nombre.trim() !== ''
      ? { nombre: record.nombre.trim() }
      : {}),
    ...(typeof record.correo === 'string' && record.correo.trim() !== ''
      ? { correo: record.correo.trim() }
      : {}),
  }
}
