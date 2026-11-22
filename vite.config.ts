import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const apiBaseUrl = env.VITE_API_BASE_URL?.trim() ?? ''
  const proxyTarget = env.VITE_DEV_API_PROXY_TARGET?.trim() || 'http://localhost:5000'

  return {
    plugins: [react()],
    server: {
      // Solo se activa el proxy para /api cuando se usan rutas relativas (VITE_API_BASE_URL vacío).
      // No se intercepta /activar para preservar la futura ruta de pantalla en el navegador.
      proxy:
        apiBaseUrl === ''
          ? {
              '/api': {
                target: proxyTarget,
                changeOrigin: true,
              },
            }
          : undefined,
    },
  }
})
