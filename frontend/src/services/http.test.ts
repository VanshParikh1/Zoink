import test, { afterEach, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildQuery, createHttpClient, HttpError } from './http'

type Call = { url: string; init: RequestInit }
let calls: Call[] = []
const realFetch = globalThis.fetch

function answer(status: number, body: unknown, contentType = 'application/json') {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body)
    return new Response(status === 204 ? null : text, { status, headers: { 'content-type': contentType } })
  }) as typeof fetch
}

afterEach(() => {
  globalThis.fetch = realFetch
  calls = []
})

describe('the HTTP client', () => {
  test('GET with params: base URL, query without empty values, parsed JSON', async () => {
    answer(200, { items: [1] })
    const api = createHttpClient({ baseURL: 'http://api.test', headers: { 'x-app': 'zoink' } })
    const res = await api.get('/bookings/me', { params: { limit: 20, cursor: undefined, flag: false, gone: null } })
    assert.equal(calls[0].url, 'http://api.test/bookings/me?limit=20&flag=false')
    assert.equal(calls[0].init.method, 'GET')
    assert.equal((calls[0].init.headers as Record<string, string>)['x-app'], 'zoink')
    assert.equal(calls[0].init.body, undefined)
    assert.deepEqual(res.data, { items: [1] })
    assert.equal(res.status, 200)
  })

  test('POST/PATCH send JSON; FormData goes as is with no Content-Type of ours', async () => {
    answer(201, { id: 'b1' })
    const api = createHttpClient({ baseURL: '' })
    await api.post('/bookings', { listingId: 'l1' })
    await api.patch('/listings/l1', { title: 'x' })
    const form = new FormData()
    form.append('image', 'bytes')
    await api.post('/listings/l1/images', form)
    assert.equal(calls[0].init.body, '{"listingId":"l1"}')
    assert.equal((calls[0].init.headers as Record<string, string>)['Content-Type'], 'application/json')
    assert.equal(calls[1].init.method, 'PATCH')
    assert.equal(calls[2].init.body, form)
    assert.equal((calls[2].init.headers as Record<string, string>)['Content-Type'], undefined)
  })

  test('a non-2xx answer rejects with response.status and the parsed body, like axios', async () => {
    answer(409, { error: 'That booking transition is not allowed.' })
    const api = createHttpClient({ baseURL: '' })
    const err = await api.patch('/bookings/b1/accept').catch((e) => e)
    assert.ok(err instanceof HttpError)
    assert.equal(err.message, 'Request failed with status code 409')
    assert.equal(err.response?.status, 409)
    assert.equal(err.response?.data.error, 'That booking transition is not allowed.')
    assert.equal(err.config.url, '/bookings/b1/accept')
  })

  test('no answer at all rejects with no response, and a 204 resolves with empty data', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('Network request failed')
    }) as typeof fetch
    const api = createHttpClient({ baseURL: '' })
    const err = await api.get('/health').catch((e) => e)
    assert.equal(err.message, 'Network Error')
    assert.equal(err.response, undefined)

    answer(204, undefined)
    assert.equal((await api.delete('/listings/l1')).data, '')
  })

  test('interceptors: request ones (last added first) can set headers; response ones see errors', async () => {
    answer(401, { error: 'Token expired.' })
    const api = createHttpClient({ baseURL: '' })
    api.defaults.headers.common.Authorization = 'Bearer default'
    const order: string[] = []
    api.interceptors.request.use((config) => {
      order.push('first added')
      return config
    })
    api.interceptors.request.use(async (config) => {
      order.push('last added')
      config.headers.Authorization = `Bearer ${config.sessionToken ?? 'current'}`
      return config
    })
    let seen: any
    api.interceptors.response.use(undefined, (error) => {
      seen = error
      return Promise.reject(error)
    })

    await api.post('/users/me/push-token/release', { expoPushToken: 't' }, { sessionToken: 'old' }).catch(() => {})
    assert.deepEqual(order, ['last added', 'first added'])
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer old')
    assert.equal(seen.response.status, 401)
    assert.equal(seen.config.headers.Authorization, 'Bearer old')
  })

  test('buildQuery encodes values', () => {
    assert.equal(buildQuery({ q: 'drill & saw', cursor: 'abc_-' }), '?q=drill+%26+saw&cursor=abc_-')
    assert.equal(buildQuery({}), '')
  })
})
