import { createContext, useContext } from 'react'
import type { SessionOperationOptions } from './sessionStore.ts'
import type {
  EstadoSesion,
  ResultadoCierreSesion,
  UsuarioAutenticado,
} from './types/auth.ts'

export interface AuthContextValue extends EstadoSesion {
  readonly esAdministrador: boolean
  readonly establecerSesion: (
    credencialRaw: unknown,
    options?: SessionOperationOptions
  ) => Promise<UsuarioAutenticado>
  readonly consultarUsuarioActual: (
    options?: SessionOperationOptions
  ) => Promise<UsuarioAutenticado>
  readonly cerrarSesion: (
    options?: SessionOperationOptions
  ) => Promise<ResultadoCierreSesion>
  readonly limpiarSesionEnMemoria: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe utilizarse dentro de un AuthProvider.')
  }
  return context
}
