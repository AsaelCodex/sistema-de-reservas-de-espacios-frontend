import { createElement, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { AuthContext, type AuthContextValue } from './AuthContext.ts'
import {
  cerrarSesion,
  consultarUsuarioActual,
  establecerSesion,
  getSessionSnapshot,
  limpiarSesionEnMemoria,
  subscribeSession,
} from './sessionStore.ts'
import { esAdministrador } from './types/auth.ts'

export interface AuthProviderProps {
  readonly children: ReactNode
}

/**
 * Proveedor de sesión con almacenamiento de token exclusivamente en memoria.
 * Recargar la página requiere iniciar sesión nuevamente.
 * Nota: mantener el token en memoria evita persistirlo en almacenamiento web,
 * pero no elimina por sí mismo el riesgo de XSS.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const snapshot = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getSessionSnapshot
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      ...snapshot,
      esAdministrador: esAdministrador(snapshot.usuario),
      establecerSesion,
      consultarUsuarioActual,
      cerrarSesion,
      limpiarSesionEnMemoria,
    }),
    [snapshot]
  )

  return createElement(AuthContext.Provider, { value }, children)
}
