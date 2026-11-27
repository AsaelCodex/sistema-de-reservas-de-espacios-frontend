import { useEffect, useSyncExternalStore } from 'react'
import './App.css'
import {
  getBrowserPathname,
  navigateTo,
  resolverRutaAcceso,
  subscribeBrowserPathname,
} from './app/router.ts'
import { useAuth } from './features/auth/AuthContext.ts'
import { HomeView } from './features/auth/components/HomeView.tsx'
import { LoginView } from './features/auth/components/LoginView.tsx'

function App() {
  const { status, usuario } = useAuth()
  const pathname = useSyncExternalStore(
    subscribeBrowserPathname,
    getBrowserPathname,
    () => '/login'
  )

  const { rutaEfectiva, redirigirA } = resolverRutaAcceso(pathname, status)

  useEffect(() => {
    if (redirigirA) {
      navigateTo(redirigirA, { replace: true })
    }
  }, [redirigirA])

  if (rutaEfectiva === '/' && status === 'authenticated' && usuario) {
    return <HomeView />
  }

  return <LoginView />
}

export default App
