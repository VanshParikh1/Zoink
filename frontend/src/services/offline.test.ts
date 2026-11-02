import test, { afterEach, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createHttpClient } from './http'
import { refuseWhenOffline } from './offlineGate'
import { isOffline, isSimulatedOffline, setDeviceOffline, setSimulatedOffline, subscribeOffline } from './onlineState'
import { userMessage } from '../utils/userMessage'

const realFetch = globalThis.fetch
let sent: string[] = []

function serverAnswers() {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent.push(`${init.method} ${url}`)
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
}

// The app's client as services/api.ts builds it, minus the native token store.
function client() {
  const api = createHttpClient({ baseURL: 'http://api.test' })
  api.interceptors.request.use(refuseWhenOffline)
  return api
}

afterEach(() => {
  globalThis.fetch = realFetch
  sent = []
  setDeviceOffline(false)
  setSimulatedOffline(null)
})

describe('online state', () => {
  test('listeners hear changes only, not repeats', () => {
    const heard: boolean[] = []
    const unsubscribe = subscribeOffline((offline) => heard.push(offline))
    setDeviceOffline(true)
    setDeviceOffline(true)
    setDeviceOffline(false)
    unsubscribe()
    setDeviceOffline(true)
    assert.deepEqual(heard, [true, false])
  })

  test("a QA build's simulated state wins over the device until handed back", () => {
    setSimulatedOffline(true)
    assert.equal(isOffline(), true)
    assert.equal(isSimulatedOffline(), true)
    setDeviceOffline(true)
    assert.equal(isSimulatedOffline(), false, 'really offline now')
    setSimulatedOffline(false)
    assert.equal(isOffline(), false, 'forced online')
    setSimulatedOffline(null)
    assert.equal(isOffline(), true, 'back to the device')
  })
})

describe('requests while offline', () => {
  test('online: writes and reads go out', async () => {
    serverAnswers()
    const api = client()
    await api.get('/listings')
    await api.post('/bookings', { listingId: 'l1' })
    assert.deepEqual(sent, ['GET http://api.test/listings', 'POST http://api.test/bookings'])
  })

  test('offline: every kind of write is refused before sending, with a clear message', async () => {
    serverAnswers()
    setDeviceOffline(true)
    const api = client()
    for (const send of [
      () => api.post('/conversations/c1/messages', { body: 'hi' }),
      () => api.patch('/bookings/b1/accept'),
      () => api.delete('/listings/l1'),
    ]) {
      await assert.rejects(send(), (error: any) => {
        assert.equal(error.offline, true)
        assert.equal(userMessage(error), "You're offline, so this wasn't sent. Try again when you're back online.")
        return true
      })
    }
    assert.deepEqual(sent, [], 'nothing reached the network')
  })

  test('offline on the device: reads are left to the query cache (not refused here)', async () => {
    serverAnswers()
    setDeviceOffline(true)
    await client().get('/listings')
    assert.deepEqual(sent, ['GET http://api.test/listings'])
  })

  test('simulated offline (QA builds): reads fail as with no connection', async () => {
    serverAnswers()
    setSimulatedOffline(true)
    await assert.rejects(client().get('/listings'), (error: any) => {
      assert.equal(error.response, undefined)
      assert.equal(userMessage(error), "You're offline. Check your connection and try again.")
      return true
    })
    assert.deepEqual(sent, [])
  })

  test('back online: the same write goes through', async () => {
    serverAnswers()
    setDeviceOffline(true)
    const api = client()
    await assert.rejects(api.post('/conversations/c1/messages', { body: 'hi' }))
    setDeviceOffline(false)
    await api.post('/conversations/c1/messages', { body: 'hi' })
    assert.deepEqual(sent, ['POST http://api.test/conversations/c1/messages'])
  })
})
