import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { parseApiConfig, resolveApiUrl } from '../config/env.ts'
import { ApiError } from './apiError.ts'
import {
  getSessionToken,
  httpRequest,
  onSessionInvalidated,
  setSessionToken,
} from './httpClient.ts'

describe('Configuración de destino de la API (env)', () => {
  it('usa modo proxy con rutas relativas cuando VITE_API_BASE_URL está vacío', () => {
    const config = parseApiConfig('')
    assert.equal(config.mode, 'relative-proxy')
    assert.equal(config.baseUrl, '')
    assert.equal(resolveApiUrl('/api/sesiones', config), '/api/sesiones')
  })

  it('usa modo CORS cuando se define un origen http/https válido y normaliza mediante URL.origin', () => {
    const config = parseApiConfig('https://API.RESERVAX.EDU.DO:443/')
    assert.equal(config.mode, 'cors-origin')
    assert.equal(config.baseUrl, 'https://api.reservax.edu.do')
    assert.equal(
      resolveApiUrl('/api/usuarios/yo', config),
      'https://api.reservax.edu.do/api/usuarios/yo'
    )
  })

  it('rechaza protocolos no HTTP(S), credenciales, query, fragmento, rutas distintas de / o destinos externos', () => {
    assert.throws(() => parseApiConfig('ftp://servidor.local'))
    assert.throws(() => parseApiConfig('https://user:pass@api.reservax.edu.do'))
    assert.throws(() => parseApiConfig('https://api.reservax.edu.do/api'))
    assert.throws(() => parseApiConfig('https://api.reservax.edu.do/v1/'))
    assert.throws(() => parseApiConfig('https://api.reservax.edu.do///'))
    assert.throws(() => parseApiConfig('https://api.reservax.edu.do?entorno=prod'))
    assert.throws(() => parseApiConfig('https://api.reservax.edu.do/?'))
    assert.throws(() => parseApiConfig('https://api.reservax.edu.do#seccion'))
    assert.throws(() => parseApiConfig('https://api.reservax.edu.do/#'))
    assert.throws(() => resolveApiUrl('https://otro-dominio.com/api'))
    assert.throws(() => resolveApiUrl('//otro-dominio.com/api'))
  })
})

describe('Cliente HTTP sobre fetch', () => {
  beforeEach(() => {
    setSessionToken(null)
  })

  it('solo adjunta el token en memoria a operaciones autenticadas bajo /api', async () => {
    setSessionToken('token-opaco-secreto')
    const capturedHeaders: Array<Record<string, string>> = []

    const fakeFetch: typeof fetch = async (_input, init) => {
      capturedHeaders.push((init?.headers ?? {}) as Record<string, string>)
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    await httpRequest('/api/sesiones', {
      method: 'POST',
      auth: false,
      body: { correo: 'usuario@itla.edu.do' },
      fetchImpl: fakeFetch,
    })

    await httpRequest('/api/usuarios/yo', {
      method: 'GET',
      auth: true,
      fetchImpl: fakeFetch,
    })

    assert.equal(capturedHeaders[0]?.Authorization, undefined)
    assert.equal(capturedHeaders[1]?.Authorization, 'Bearer token-opaco-secreto')

    await assert.rejects(
      () =>
        httpRequest('/activar?token=abc', {
          method: 'GET',
          auth: true,
          fetchImpl: fakeFetch,
        }),
      /bajo \/api/
    )
  })

  it('soporta respuestas JSON, vacías (204 o sin cuerpo) y texto no JSON', async () => {
    const jsonResult = await httpRequest<{ rol: string }>('/api/usuarios/yo', {
      fetchImpl: async () =>
        new Response(JSON.stringify({ rol: 'Administrador' }), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        }),
    })
    assert.deepEqual(jsonResult, { rol: 'Administrador' })

    const empty204 = await httpRequest<undefined>('/api/sesiones', {
      method: 'DELETE',
      fetchImpl: async () => new Response(null, { status: 204 }),
    })
    assert.equal(empty204, undefined)

    const empty200 = await httpRequest<undefined>('/api/reservas/1/confirmar', {
      method: 'PUT',
      fetchImpl: async () => new Response('', { status: 200 }),
    })
    assert.equal(empty200, undefined)

    const plainText = await httpRequest<string>('/activar?token=123', {
      fetchImpl: async () =>
        new Response('Cuenta activada correctamente.', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
    })
    assert.equal(plainText, 'Cuenta activada correctamente.')
  })

  it('conserva mensajes controlados 4xx, filtra rutas internas Windows/Linux y nunca propaga cuerpo en 500-599', async () => {
    await assert.rejects(
      () =>
        httpRequest('/api/reservas', {
          method: 'POST',
          fetchImpl: async () =>
            new Response(JSON.stringify({ mensaje: 'El espacio ya está reservado en ese horario.' }), {
              status: 409,
              headers: { 'content-type': 'application/json' },
            }),
        }),
      (err: unknown) => {
        assert(err instanceof ApiError)
        assert.equal(err.kind, 'conflict')
        assert.equal(err.status, 409)
        assert.equal(err.message, 'El espacio ya está reservado en ese horario.')
        return true
      }
    )

    await assert.rejects(
      () =>
        httpRequest('/api/usuarios', {
          method: 'POST',
          fetchImpl: async () =>
            new Response(
              JSON.stringify({
                title: 'One or more validation errors occurred.',
                errors: {
                  correo: ['El formato del correo no es válido.'],
                },
              }),
              {
                status: 400,
                headers: { 'content-type': 'application/problem+json' },
              }
            ),
        }),
      (err: unknown) => {
        assert(err instanceof ApiError)
        assert.equal(err.kind, 'validation')
        assert.equal(err.status, 400)
        assert.equal(err.message, 'El formato del correo no es válido.')
        assert.deepEqual(err.fieldErrors, { correo: ['El formato del correo no es válido.'] })
        return true
      }
    )

    // En 4xx, filtra rutas internas de Windows y Linux sin exponerlas al usuario
    for (const leakedMessage of [
      'Error al abrir C:\\Users\\app\\ Infrastructure\\Repo.cs',
      'Fallo leyendo /var/www/reservax/appsettings.json en el servidor',
      'No se encontró /home/runner/work/backend/Controllers/ReservasController.cs',
    ]) {
      await assert.rejects(
        () =>
          httpRequest('/api/reservas', {
            method: 'POST',
            fetchImpl: async () =>
              new Response(
                JSON.stringify({
                  mensaje: leakedMessage,
                  errors: { archivo: [leakedMessage] },
                }),
                {
                  status: 400,
                  headers: { 'content-type': 'application/json' },
                }
              ),
          }),
        (err: unknown) => {
          assert(err instanceof ApiError)
          assert.equal(err.kind, 'validation')
          assert.equal(
            err.message,
            'Los datos enviados no son válidos. Revisa los campos e intenta de nuevo.'
          )
          assert.deepEqual(err.fieldErrors, {})
          return true
        }
      )
    }

    // En 500-599, ignora siempre mensajes y fieldErrors del servidor y devuelve mensaje público genérico
    await assert.rejects(
      () =>
        httpRequest('/api/reservas', {
          fetchImpl: async () =>
            new Response(
              JSON.stringify({
                mensaje: 'Mensaje interno del servidor 500 que no debe propagarse.',
                errors: { baseDatos: ['Timeout en nodo primario'] },
              }),
              {
                status: 500,
                headers: { 'content-type': 'application/json' },
              }
            ),
        }),
      (err: unknown) => {
        assert(err instanceof ApiError)
        assert.equal(err.kind, 'http')
        assert.equal(err.status, 500)
        assert.equal(err.message, 'Ocurrió un error al procesar la solicitud en el servidor.')
        assert.deepEqual(err.fieldErrors, {})
        return true
      }
    )

    await assert.rejects(
      () =>
        httpRequest('/api/reservas', {
          method: 'POST',
          fetchImpl: async () =>
            new Response(
              JSON.stringify({
                mensaje: 'No se pudo adquirir sp_getapplock en la instancia SQL.',
                errors: { lock: ['Detalle interno 503'] },
              }),
              {
                status: 503,
                headers: { 'content-type': 'application/json' },
              }
            ),
        }),
      (err: unknown) => {
        assert(err instanceof ApiError)
        assert.equal(err.kind, 'service_unavailable')
        assert.equal(err.status, 503)
        assert.equal(
          err.message,
          'El servicio está temporalmente ocupado. Intenta nuevamente en unos segundos.'
        )
        assert.deepEqual(err.fieldErrors, {})
        return true
      }
    )
  })

  it('distingue fallos de red y cancelación por AbortController', async () => {
    await assert.rejects(
      () =>
        httpRequest('/api/reservas', {
          fetchImpl: async () => {
            throw new TypeError('Failed to fetch')
          },
        }),
      (err: unknown) => {
        assert(err instanceof ApiError)
        assert.equal(err.kind, 'network')
        assert.equal(err.status, null)
        return true
      }
    )

    const controller = new AbortController()
    controller.abort()

    await assert.rejects(
      () =>
        httpRequest('/api/reservas', {
          signal: controller.signal,
          fetchImpl: async () => {
            throw new DOMException('Aborted', 'AbortError')
          },
        }),
      (err: unknown) => {
        assert(err instanceof ApiError)
        assert.equal(err.kind, 'aborted')
        assert.equal(err.status, null)
        return true
      }
    )
  })

  it('401 en petición autenticada invalida solo la sesión correspondiente; 401 en login y 403 no cierran sesión', async () => {
    const invalidatedTokens: string[] = []
    const unsubscribe = onSessionInvalidated((token) => invalidatedTokens.push(token))

    try {
      setSessionToken('token-activo-1')

      // 401 en login (auth: false) -> invalid_credentials, conserva sesión activa
      await assert.rejects(
        () =>
          httpRequest('/api/sesiones', {
            method: 'POST',
            auth: false,
            fetchImpl: async () =>
              new Response(JSON.stringify({ mensaje: 'Credenciales incorrectas.' }), {
                status: 401,
                headers: { 'content-type': 'application/json' },
              }),
          }),
        (err: unknown) => {
          assert(err instanceof ApiError)
          assert.equal(err.kind, 'invalid_credentials')
          return true
        }
      )
      assert.equal(getSessionToken(), 'token-activo-1')
      assert.equal(invalidatedTokens.length, 0)

      // 403 en llamada autenticada -> forbidden, NO cierra la sesión
      await assert.rejects(
        () =>
          httpRequest('/api/usuarios', {
            method: 'GET',
            auth: true,
            fetchImpl: async () =>
              new Response(JSON.stringify({ mensaje: 'Requiere rol Administrador.' }), {
                status: 403,
                headers: { 'content-type': 'application/json' },
              }),
          }),
        (err: unknown) => {
          assert(err instanceof ApiError)
          assert.equal(err.kind, 'forbidden')
          return true
        }
      )
      assert.equal(getSessionToken(), 'token-activo-1')
      assert.equal(invalidatedTokens.length, 0)

      // Si una petición inició con token-activo-1 pero la sesión cambió a token-activo-2
      // antes de recibir el 401, NO debe invalidar token-activo-2
      await assert.rejects(
        () =>
          httpRequest('/api/reservas/mias', {
            method: 'GET',
            auth: true,
            fetchImpl: async () => {
              setSessionToken('token-activo-2')
              return new Response(null, { status: 401 })
            },
          }),
        (err: unknown) => {
          assert(err instanceof ApiError)
          assert.equal(err.kind, 'unauthorized')
          return true
        }
      )
      assert.equal(getSessionToken(), 'token-activo-2')
      assert.equal(invalidatedTokens.length, 0)

      // 401 con la sesión actual sí invalida la sesión en memoria
      await assert.rejects(
        () =>
          httpRequest('/api/usuarios/yo', {
            method: 'GET',
            auth: true,
            fetchImpl: async () => new Response(null, { status: 401 }),
          }),
        (err: unknown) => {
          assert(err instanceof ApiError)
          assert.equal(err.kind, 'unauthorized')
          return true
        }
      )
      assert.equal(getSessionToken(), null)
      assert.deepEqual(invalidatedTokens, ['token-activo-2'])
    } finally {
      unsubscribe()
    }
  })
})
