import { useRef, useState } from 'react'
import { useAuth } from '../AuthContext.ts'

export function HomeView() {
  const { usuario, cerrarSesion } = useAuth()
  const [cerrando, setCerrando] = useState(false)
  const cerrandoRef = useRef(false)

  if (!usuario) {
    return null
  }

  async function handleCerrarSesion() {
    if (cerrandoRef.current) {
      return
    }
    cerrandoRef.current = true
    setCerrando(true)
    try {
      await cerrarSesion()
    } finally {
      cerrandoRef.current = false
      setCerrando(false)
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-card" aria-labelledby="panel-titulo">
        <header className="auth-header">
          <p className="auth-brand">ReservaX · ITLA</p>
          <h1 id="panel-titulo">Sesión activa</h1>
          <p className="auth-subtitle">
            Identidad verificada en el servidor para la sesión actual en memoria.
          </p>
        </header>

        <dl className="profile-summary" aria-label="Datos del usuario autenticado">
          <div className="profile-row">
            <dt>Nombre</dt>
            <dd data-testid="usuario-nombre">{usuario.nombre}</dd>
          </div>
          <div className="profile-row">
            <dt>Rol</dt>
            <dd data-testid="usuario-rol">
              <span className="role-badge">{usuario.rol}</span>
            </dd>
          </div>
          {usuario.correo && (
            <div className="profile-row">
              <dt>Correo</dt>
              <dd>{usuario.correo}</dd>
            </div>
          )}
        </dl>

        <div className="profile-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleCerrarSesion}
            disabled={cerrando}
          >
            {cerrando ? 'Cerrando sesión...' : 'Cerrar sesión'}
          </button>
        </div>
      </section>
    </main>
  )
}
