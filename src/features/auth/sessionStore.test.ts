import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { resolverRutaAcceso } from '../../app/router.ts'
import { getSessionToken, httpRequest } from '../../shared/api/httpClient.ts'
import { useAuth } from './AuthContext.ts'
import { AuthProvider } from './AuthProvider.ts'
import {
  cerrarSesion,
  establecerSesion,
  getSessionSnapshot,
  iniciarSesion,
  limpiarSesionEnMemoria,
} from './sessionStore.ts'
import { clasificarErrorLogin } from './types/auth.ts'

describe('Gestión de sesión en memoria y AuthProvider', () => {
  beforeEach(() => {
    limpiarSesionEnMemoria()
  })

  it('establece la sesión en memoria consultando /api/usuarios/yo y expone el contexto en AuthProvider', async () => {
    const fakeFetch: typeof fetch = async (input, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>
      assert.equal(input, '/api/usuarios/yo')
      assert.equal(headers.Authorization, 'Bearer token-admin-123')
      return new Response(
        JSON.stringify({
          id: 'u-1',
          nombre: 'Admin ITLA',
          correo: 'admin@itla.edu.do',
          rol: 'Administrador',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    }

    const usuario = await establecerSesion(
      { token: 'token-admin-123', vencimiento: '2026-11-16T20:00:00Z' },
      { fetchImpl: fakeFetch }
    )

    assert.equal(usuario.nombre, 'Admin ITLA')
    assert.equal(usuario.rol, 'Administrador')
    assert.equal(getSessionToken(), 'token-admin-123')
    assert.equal(getSessionSnapshot().status, 'authenticated')

    function ConsumerProbe() {
      const auth = useAuth()
      return createElement(
        'span',
        null,
        `${auth.status}:${auth.usuario?.nombre}:${auth.usuario?.rol}:${auth.esAdministrador}`
      )
    }

    const html = renderToStaticMarkup(
      createElement(AuthProvider, { children: createElement(ConsumerProbe) })
    )
    assert.equal(html, '<span>authenticated:Admin ITLA:Administrador:true</span>')
  })

  it('iniciarSesion envía POST /api/sesiones público con { correo, contraseña } sin recortar la contraseña y luego consulta /api/usuarios/yo', async () => {
    const requests: Array<{
      url: string
      method: string
      headers: Record<string, string>
      body: string | undefined
    }> = []

    const passwordConEspacios = '  ClaveConEspacios123  '

    const fakeFetch: typeof fetch = async (input, init) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      const headers = (init?.headers ?? {}) as Record<string, string>
      const body = typeof init?.body === 'string' ? init.body : undefined
      requests.push({ url, method, headers, body })

      if (url === '/api/sesiones' && method === 'POST') {
        return new Response(
          JSON.stringify({
            token: 'token-login-201',
            vencimiento: '2026-11-22T20:00:00Z',
          }),
          {
            status: 201,
            headers: { 'content-type': 'application/json' },
          }
        )
      }

      if (url === '/api/usuarios/yo' && method === 'GET') {
        return new Response(
          JSON.stringify({
            nombre: 'Laura Gómez',
            rol: 'Estandar',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      }

      return new Response(null, { status: 404 })
    }

    const usuario = await iniciarSesion(
      {
        correo: '  laura@itla.edu.do  ',
        contraseña: passwordConEspacios,
      },
      { fetchImpl: fakeFetch }
    )

    assert.equal(requests.length, 2)
    assert.equal(requests[0]?.url, '/api/sesiones')
    assert.equal(requests[0]?.method, 'POST')
    assert.equal(requests[0]?.headers.Authorization, undefined)
    assert.deepEqual(JSON.parse(requests[0]?.body ?? '{}'), {
      correo: 'laura@itla.edu.do',
      contraseña: passwordConEspacios,
    })

    assert.equal(requests[1]?.url, '/api/usuarios/yo')
    assert.equal(requests[1]?.headers.Authorization, 'Bearer token-login-201')

    assert.equal(usuario.nombre, 'Laura Gómez')
    assert.equal(usuario.rol, 'Estandar')
    assert.equal(getSessionSnapshot().status, 'authenticated')
  })

  it('distingue 401 credenciales incorrectas, 403 cuenta inactiva/bloqueada, 400 validación y fallos de red en login', async () => {
    // 401 credenciales incorrectas
    await assert.rejects(
      () =>
        iniciarSesion(
          { correo: 'user@itla.edu.do', contraseña: 'mal' },
          {
            fetchImpl: async () =>
              new Response(
                JSON.stringify({ mensaje: 'Correo o contraseña incorrectos.' }),
                { status: 401, headers: { 'content-type': 'application/json' } }
              ),
          }
        ),
      (error: unknown) => {
        const clasificado = clasificarErrorLogin(error)
        assert.equal(clasificado.categoria, 'credenciales_invalidas')
        assert.equal(clasificado.mensaje, 'Correo o contraseña incorrectos.')
        return true
      }
    )

    // 403 cuenta inactiva (RF-CA-15)
    await assert.rejects(
      () =>
        iniciarSesion(
          { correo: 'inactivo@itla.edu.do', contraseña: 'Password1' },
          {
            fetchImpl: async () =>
              new Response(
                JSON.stringify({ mensaje: 'La cuenta no está activa. Revisa tu correo.' }),
                { status: 403, headers: { 'content-type': 'application/json' } }
              ),
          }
        ),
      (error: unknown) => {
        const clasificado = clasificarErrorLogin(error)
        assert.equal(clasificado.categoria, 'cuenta_inactiva')
        assert.equal(clasificado.mensaje, 'La cuenta no está activa. Revisa tu correo.')
        return true
      }
    )

    // 403 cuenta bloqueada por intentos fallidos (RF-CA-19)
    await assert.rejects(
      () =>
        iniciarSesion(
          { correo: 'bloqueado@itla.edu.do', contraseña: 'Password1' },
          {
            fetchImpl: async () =>
              new Response(
                JSON.stringify({
                  mensaje: 'La cuenta está bloqueada durante 15 minutos por intentos fallidos.',
                }),
                { status: 403, headers: { 'content-type': 'application/json' } }
              ),
          }
        ),
      (error: unknown) => {
        const clasificado = clasificarErrorLogin(error)
        assert.equal(clasificado.categoria, 'cuenta_bloqueada')
        assert.ok(clasificado.mensaje.includes('15 minutos'))
        return true
      }
    )

    // 400 error de validación
    await assert.rejects(
      () =>
        iniciarSesion(
          { correo: 'invalido', contraseña: '123' },
          {
            fetchImpl: async () =>
              new Response(
                JSON.stringify({
                  errors: { correo: ['El correo electrónico no es válido.'] },
                }),
                { status: 400, headers: { 'content-type': 'application/problem+json' } }
              ),
          }
        ),
      (error: unknown) => {
        const clasificado = clasificarErrorLogin(error)
        assert.equal(clasificado.categoria, 'validacion')
        assert.deepEqual(clasificado.fieldErrors, {
          correo: ['El correo electrónico no es válido.'],
        })
        return true
      }
    )

    // Fallo de conexión
    await assert.rejects(
      () =>
        iniciarSesion(
          { correo: 'user@itla.edu.do', contraseña: 'Password1' },
          {
            fetchImpl: async () => {
              throw new TypeError('Failed to fetch')
            },
          }
        ),
      (error: unknown) => {
        const clasificado = clasificarErrorLogin(error)
        assert.equal(clasificado.categoria, 'conexion')
        return true
      }
    )
  })

  it('valida vencimiento como ISO-8601 con zona explícita y rechaza valores inválidos sin tocar el token ni el estado', async () => {
    let fetchCalls = 0
    const fakeFetch: typeof fetch = async () => {
      fetchCalls += 1
      return new Response(
        JSON.stringify({ nombre: 'Usuario Prueba', rol: 'Estandar' }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    }

    for (const invalidVencimiento of [
      'no-es-una-fecha',
      '2026-11-16',
      '2026-11-16T20:00:00',
      '2026-02-30T20:00:00Z',
      '2026-11-16T25:00:00Z',
      '2026-11-16T20:00:00+25:00',
    ]) {
      await assert.rejects(
        () =>
          establecerSesion(
            { token: 'token-no-debe-guardarse', vencimiento: invalidVencimiento },
            { fetchImpl: fakeFetch }
          ),
        /ISO-8601/
      )

      assert.equal(getSessionToken(), null)
      assert.equal(getSessionSnapshot().status, 'anonymous')
      assert.equal(getSessionSnapshot().vencimiento, null)
      assert.equal(fetchCalls, 0)
    }

    // Acepta offset numérico explícito y fracciones de segundo de .NET
    await establecerSesion(
      { token: 'token-offset', vencimiento: '2026-11-16T16:00:00.1234567-04:00' },
      { fetchImpl: fakeFetch }
    )
    assert.equal(getSessionToken(), 'token-offset')
    assert.equal(getSessionSnapshot().status, 'authenticated')
    assert.equal(getSessionSnapshot().vencimiento, '2026-11-16T16:00:00.1234567-04:00')
    assert.equal(fetchCalls, 1)
  })

  it('limpia el token en memoria si /api/usuarios/yo falla o no devuelve nombre y rol válidos', async () => {
    await assert.rejects(() =>
      establecerSesion(
        { token: 'token-invalido', vencimiento: '2026-11-16T20:00:00Z' },
        {
          fetchImpl: async () => new Response(null, { status: 401 }),
        }
      )
    )

    assert.equal(getSessionToken(), null)
    assert.equal(getSessionSnapshot().status, 'anonymous')
    assert.equal(getSessionSnapshot().usuario, null)

    await assert.rejects(() =>
      establecerSesion(
        { token: 'token-sin-nombre', vencimiento: '2026-11-16T20:00:00Z' },
        {
          fetchImpl: async () =>
            new Response(JSON.stringify({ rol: 'Estandar' }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
        }
      )
    )

    assert.equal(getSessionToken(), null)
    assert.equal(getSessionSnapshot().status, 'anonymous')
    assert.equal(getSessionSnapshot().usuario, null)
  })

  it('invalida la sesión del store ante un 401 autenticado y la conserva ante un 403', async () => {
    await establecerSesion(
      { token: 'token-estandar', vencimiento: '2026-11-16T20:00:00Z' },
      {
        fetchImpl: async () =>
          new Response(
            JSON.stringify({ nombre: 'Estudiante ITLA', rol: 'Estandar' }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          ),
      }
    )

    await assert.rejects(() =>
      httpRequest('/api/reservas', {
        method: 'GET',
        auth: true,
        fetchImpl: async () => new Response(null, { status: 403 }),
      })
    )
    assert.equal(getSessionSnapshot().status, 'authenticated')

    await assert.rejects(() =>
      httpRequest('/api/reservas/mias', {
        method: 'GET',
        auth: true,
        fetchImpl: async () => new Response(null, { status: 401 }),
      })
    )
    assert.equal(getSessionSnapshot().status, 'anonymous')
    assert.equal(getSessionSnapshot().motivoInvalidez, 'sesion_expirada')
    assert.equal(getSessionToken(), null)
  })

  it('cierra sesión limpiando memoria e informa explícitamente si la revocación remota falla', async () => {
    await establecerSesion(
      { token: 'token-para-cerrar', vencimiento: '2026-11-16T20:00:00Z' },
      {
        fetchImpl: async () =>
          new Response(
            JSON.stringify({ nombre: 'Estudiante ITLA', rol: 'Estandar' }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          ),
      }
    )

    const resultadoFallo = await cerrarSesion({
      fetchImpl: async (_input, init) => {
        const headers = (init?.headers ?? {}) as Record<string, string>
        assert.equal(headers.Authorization, 'Bearer token-para-cerrar')
        throw new TypeError('Network down')
      },
    })

    assert.equal(getSessionToken(), null)
    assert.equal(getSessionSnapshot().status, 'anonymous')
    assert.equal(resultadoFallo.revocadaEnServidor, false)
    assert.equal(resultadoFallo.error?.kind, 'network')
    assert.ok(getSessionSnapshot().avisoCierre?.includes('no se pudo revocar en el servidor'))

    await establecerSesion(
      { token: 'token-para-cerrar-ok', vencimiento: '2026-11-16T20:00:00Z' },
      {
        fetchImpl: async () =>
          new Response(
            JSON.stringify({ nombre: 'Admin ITLA', rol: 'Administrador' }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          ),
      }
    )

    const resultadoExito = await cerrarSesion({
      fetchImpl: async () => new Response(null, { status: 204 }),
    })

    assert.equal(getSessionToken(), null)
    assert.equal(getSessionSnapshot().status, 'anonymous')
    assert.equal(resultadoExito.revocadaEnServidor, true)
    assert.equal(resultadoExito.error, undefined)
    assert.equal(getSessionSnapshot().avisoCierre, null)
  })

  it('conserva la sesión nueva autenticada y la ruta / si un DELETE pendiente de la sesión anterior falla tardíamente', async () => {
    await establecerSesion(
      { token: 'token-sesion-anterior', vencimiento: '2026-11-22T20:00:00Z' },
      {
        fetchImpl: async () =>
          new Response(
            JSON.stringify({ nombre: 'Usuario Anterior', rol: 'Estandar' }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          ),
      }
    )

    let rechazarDeleteAnterior!: (reason?: unknown) => void
    const promesaDeleteAnterior = new Promise<Response>((_resolve, reject) => {
      rechazarDeleteAnterior = reject
    })

    // 1. Inicia el cierre de la primera sesión; el DELETE queda en curso
    const cierrePendiente = cerrarSesion({
      fetchImpl: async (_input, init) => {
        const headers = (init?.headers ?? {}) as Record<string, string>
        assert.equal(headers.Authorization, 'Bearer token-sesion-anterior')
        return promesaDeleteAnterior
      },
    })

    // La sesión local ya se limpió y el estado redirige a /login
    assert.equal(getSessionToken(), null)
    assert.equal(getSessionSnapshot().status, 'anonymous')
    assert.deepEqual(resolverRutaAcceso('/', getSessionSnapshot().status), {
      rutaEfectiva: '/login',
      redirigirA: '/login',
    })

    // 2. Mientras el DELETE sigue pendiente, el usuario inicia una sesión nueva exitosa
    await iniciarSesion(
      { correo: 'nuevo@itla.edu.do', contraseña: 'PasswordNueva123' },
      {
        fetchImpl: async (input) => {
          const url = String(input)
          if (url === '/api/sesiones') {
            return new Response(
              JSON.stringify({
                token: 'token-sesion-nueva',
                vencimiento: '2026-11-22T22:00:00Z',
              }),
              { status: 201, headers: { 'content-type': 'application/json' } }
            )
          }
          return new Response(
            JSON.stringify({ nombre: 'Usuario Nuevo', rol: 'Administrador' }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        },
      }
    )

    assert.equal(getSessionToken(), 'token-sesion-nueva')
    assert.equal(getSessionSnapshot().status, 'authenticated')
    assert.equal(getSessionSnapshot().usuario?.nombre, 'Usuario Nuevo')
    assert.deepEqual(resolverRutaAcceso('/', getSessionSnapshot().status), {
      rutaEfectiva: '/',
      redirigirA: null,
    })

    // 3. El DELETE anterior falla tardíamente
    rechazarDeleteAnterior(new TypeError('Fallo tardío de red en DELETE anterior'))
    const resultadoCierreAnterior = await cierrePendiente

    assert.equal(resultadoCierreAnterior.revocadaEnServidor, false)
    assert.equal(resultadoCierreAnterior.error?.kind, 'network')

    // La sesión nueva permanece intacta, autenticada, sin avisoCierre y en la ruta /
    assert.equal(getSessionToken(), 'token-sesion-nueva')
    assert.equal(getSessionSnapshot().status, 'authenticated')
    assert.equal(getSessionSnapshot().usuario?.nombre, 'Usuario Nuevo')
    assert.equal(getSessionSnapshot().avisoCierre, null)
    assert.deepEqual(resolverRutaAcceso('/', getSessionSnapshot().status), {
      rutaEfectiva: '/',
      redirigirA: null,
    })
  })

  it('protege la ruta / redirigiendo a /login sin sesión autenticada y solo permite / tras obtener identidad válida', () => {
    assert.deepEqual(resolverRutaAcceso('/', 'anonymous'), {
      rutaEfectiva: '/login',
      redirigirA: '/login',
    })
    assert.deepEqual(resolverRutaAcceso('/', 'loading'), {
      rutaEfectiva: '/login',
      redirigirA: '/login',
    })
    assert.deepEqual(resolverRutaAcceso('/login', 'anonymous'), {
      rutaEfectiva: '/login',
      redirigirA: null,
    })
    assert.deepEqual(resolverRutaAcceso('/login', 'authenticated'), {
      rutaEfectiva: '/',
      redirigirA: '/',
    })
    assert.deepEqual(resolverRutaAcceso('/', 'authenticated'), {
      rutaEfectiva: '/',
      redirigirA: null,
    })
  })
})
