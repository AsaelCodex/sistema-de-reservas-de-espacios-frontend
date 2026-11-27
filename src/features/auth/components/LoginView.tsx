import { useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../AuthContext.ts'
import { clasificarErrorLogin, type ErrorLoginClasificado } from '../types/auth.ts'

function obtenerErrorCampo(
  fieldErrors: Record<string, string[]>,
  claves: readonly string[]
): string | null {
  for (const [key, messages] of Object.entries(fieldErrors)) {
    if (claves.includes(key.toLowerCase()) && messages.length > 0) {
      return messages[0] ?? null
    }
  }
  return null
}

export function LoginView() {
  const { iniciarSesion, motivoInvalidez, avisoCierre } = useAuth()

  const [correo, setCorreo] = useState('')
  const [contraseña, setContraseña] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errorLogin, setErrorLogin] = useState<ErrorLoginClasificado | null>(null)
  const [errorCorreoLocal, setErrorCorreoLocal] = useState<string | null>(null)
  const [errorContraseñaLocal, setErrorContraseñaLocal] = useState<string | null>(null)

  const enviandoRef = useRef(false)

  const errorCorreoServidor = errorLogin
    ? obtenerErrorCampo(errorLogin.fieldErrors, ['correo', 'email'])
    : null
  const errorContraseñaServidor = errorLogin
    ? obtenerErrorCampo(errorLogin.fieldErrors, ['contraseña', 'contrasena', 'password'])
    : null

  const errorCorreo = errorCorreoLocal ?? errorCorreoServidor
  const errorContraseña = errorContraseñaLocal ?? errorContraseñaServidor

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (enviandoRef.current) {
      return
    }

    setErrorLogin(null)
    const correoFaltante = correo.trim() === '' ? 'Ingresa tu correo electrónico.' : null
    // No se recorta ni transforma la contraseña; solo se comprueba que no esté vacía.
    const contraseñaFaltante = contraseña.length === 0 ? 'Ingresa tu contraseña.' : null

    setErrorCorreoLocal(correoFaltante)
    setErrorContraseñaLocal(contraseñaFaltante)

    if (correoFaltante || contraseñaFaltante) {
      return
    }

    enviandoRef.current = true
    setEnviando(true)

    try {
      await iniciarSesion({
        correo,
        contraseña,
      })
    } catch (error) {
      setErrorLogin(clasificarErrorLogin(error))
    } finally {
      enviandoRef.current = false
      setEnviando(false)
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-card" aria-labelledby="login-titulo">
        <header className="auth-header">
          <p className="auth-brand">ReservaX · ITLA</p>
          <h1 id="login-titulo">Iniciar sesión</h1>
          <p className="auth-subtitle">
            Ingresa con tu cuenta institucional para acceder al sistema de reservas.
          </p>
        </header>

        {avisoCierre && (
          <div
            className="alert alert-warning"
            role="alert"
            data-alert-type="aviso_cierre"
          >
            <strong>Aviso de cierre de sesión:</strong> {avisoCierre}
          </div>
        )}

        {motivoInvalidez === 'sesion_expirada' && !errorLogin && (
          <div
            className="alert alert-warning"
            role="alert"
            data-alert-type="sesion_expirada"
          >
            <strong>Sesión expirada:</strong> Tu sesión anterior dejó de ser válida. Inicia
            sesión nuevamente.
          </div>
        )}

        {errorLogin && (
          <div
            className="alert alert-error"
            role="alert"
            data-error-category={errorLogin.categoria}
          >
            <strong>{errorLogin.titulo}:</strong> {errorLogin.mensaje}
          </div>
        )}

        <form
          className="auth-form"
          onSubmit={handleSubmit}
          noValidate
          aria-busy={enviando}
        >
          <div className="form-field">
            <label htmlFor="login-correo">Correo electrónico</label>
            <input
              id="login-correo"
              name="correo"
              type="email"
              autoComplete="email"
              placeholder="usuario@itla.edu.do"
              required
              disabled={enviando}
              value={correo}
              onChange={(event) => {
                setCorreo(event.target.value)
                if (errorCorreoLocal) {
                  setErrorCorreoLocal(null)
                }
              }}
              aria-invalid={Boolean(errorCorreo)}
              aria-describedby={errorCorreo ? 'login-correo-error' : undefined}
            />
            {errorCorreo && (
              <p id="login-correo-error" className="field-error" role="alert">
                {errorCorreo}
              </p>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="login-contrasena">Contraseña</label>
            <input
              id="login-contrasena"
              name="contraseña"
              type="password"
              autoComplete="current-password"
              required
              disabled={enviando}
              value={contraseña}
              onChange={(event) => {
                setContraseña(event.target.value)
                if (errorContraseñaLocal) {
                  setErrorContraseñaLocal(null)
                }
              }}
              aria-invalid={Boolean(errorContraseña)}
              aria-describedby={errorContraseña ? 'login-contrasena-error' : undefined}
            />
            {errorContraseña && (
              <p id="login-contrasena-error" className="field-error" role="alert">
                {errorContraseña}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={enviando}
          >
            {enviando ? 'Verificando acceso...' : 'Iniciar sesión'}
          </button>
        </form>
      </section>
    </main>
  )
}
