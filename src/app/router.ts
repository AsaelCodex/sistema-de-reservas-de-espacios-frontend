import type { EstadoAutenticacion } from '../features/auth/types/auth.ts'

export type AppRoute = '/' | '/login'

/**
 * Resuelve la ruta efectiva según el estado de autenticación:
 * - Sin sesión autenticada (`anonymous` o `loading` mientras se verifica `/api/usuarios/yo`),
 *   cualquier visita a `/` u otra ruta redirige a `/login`.
 * - Con sesión e identidad confirmadas (`authenticated`), `/login` redirige a `/`.
 */
export function resolverRutaAcceso(
  pathname: string,
  status: EstadoAutenticacion
): { readonly rutaEfectiva: AppRoute; readonly redirigirA: AppRoute | null } {
  const normalizada = pathname.trim() || '/'

  if (status !== 'authenticated') {
    if (normalizada !== '/login') {
      return { rutaEfectiva: '/login', redirigirA: '/login' }
    }
    return { rutaEfectiva: '/login', redirigirA: null }
  }

  if (normalizada !== '/') {
    return { rutaEfectiva: '/', redirigirA: '/' }
  }

  return { rutaEfectiva: '/', redirigirA: null }
}

const routeListeners = new Set<() => void>()
let popstateBound = false

function notifyRouteListeners(): void {
  for (const listener of routeListeners) {
    listener()
  }
}

export function getBrowserPathname(): string {
  if (typeof window === 'undefined') {
    return '/login'
  }
  return window.location.pathname || '/'
}

export function subscribeBrowserPathname(listener: () => void): () => void {
  if (typeof window !== 'undefined' && !popstateBound) {
    window.addEventListener('popstate', notifyRouteListeners)
    popstateBound = true
  }
  routeListeners.add(listener)
  return () => {
    routeListeners.delete(listener)
  }
}

export function navigateTo(path: AppRoute, options: { replace?: boolean } = {}): void {
  if (typeof window === 'undefined') {
    return
  }
  if (window.location.pathname !== path) {
    if (options.replace) {
      window.history.replaceState(null, '', path)
    } else {
      window.history.pushState(null, '', path)
    }
  }
  notifyRouteListeners()
}
