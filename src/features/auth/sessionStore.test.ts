import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { getSessionToken, httpRequest } from '../../shared/api/httpClient.ts'
import { useAuth } from './AuthContext.ts'
import { AuthProvider } from './AuthProvider.ts'
import {
  cerrarSesion,
  establecerSesion,
  getSessionSnapshot,
  limpiarSesionEnMemoria,
} from './sessionStore.ts'

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

    assert.equal(usuario.rol, 'Administrador')
    assert.equal(getSessionToken(), 'token-admin-123')
    assert.equal(getSessionSnapshot().status, 'authenticated')

    function ConsumerProbe() {
      const auth = useAuth()
      return createElement(
        'span',
        null,
        `${auth.status}:${auth.usuario?.rol}:${auth.esAdministrador}`
      )
    }

    const html = renderToStaticMarkup(
      createElement(AuthProvider, { children: createElement(ConsumerProbe) })
    )
    assert.equal(html, '<span>authenticated:Administrador:true</span>')
  })

  it('valida vencimiento como ISO-8601 con zona explícita y rechaza valores inválidos sin tocar el token ni el estado', async () => {
    let fetchCalls = 0
    const fakeFetch: typeof fetch = async () => {
      fetchCalls += 1
      return new Response(JSON.stringify({ rol: 'Estandar' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
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

  it('limpia el token en memoria si la consulta inicial a /api/usuarios/yo falla', async () => {
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
  })

  it('invalida la sesión del store ante un 401 autenticado y la conserva ante un 403', async () => {
    await establecerSesion(
      { token: 'token-estandar', vencimiento: '2026-11-16T20:00:00Z' },
      {
        fetchImpl: async () =>
          new Response(JSON.stringify({ rol: 'Estandar' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
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
          new Response(JSON.stringify({ rol: 'Estandar' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
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

    await establecerSesion(
      { token: 'token-para-cerrar-ok', vencimiento: '2026-11-16T20:00:00Z' },
      {
        fetchImpl: async () =>
          new Response(JSON.stringify({ rol: 'Administrador' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      }
    )

    const resultadoExito = await cerrarSesion({
      fetchImpl: async () => new Response(null, { status: 204 }),
    })

    assert.equal(getSessionToken(), null)
    assert.equal(getSessionSnapshot().status, 'anonymous')
    assert.equal(resultadoExito.revocadaEnServidor, true)
    assert.equal(resultadoExito.error, undefined)
  })
})
