import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import { createShutdown, InFlight } from './shutdown'

function fakeServer(closeDelayMs = 0) {
  return { closed: false, close(cb?: (err?: Error) => void) { setTimeout(() => { this.closed = true; cb?.() }, closeDelayMs); return this as any } }
}

describe('graceful shutdown', () => {
  test('stops cron, waits for running work, then disconnects and exits 0', async () => {
    const order: string[] = []
    const inFlight = new InFlight()
    inFlight.run(async () => {
      await new Promise((r) => setTimeout(r, 50))
      order.push('job finished')
    })
    const server = fakeServer(10)
    let exitCode: number | undefined
    const shutdown = createShutdown({
      server,
      tasks: [{ stop: () => order.push('cron stopped') }],
      inFlight,
      disconnect: async () => { order.push('db disconnected') },
      exit: (code) => { exitCode = code },
      log: () => {},
    })

    await shutdown('SIGTERM')
    assert.deepEqual(order, ['cron stopped', 'job finished', 'db disconnected'])
    assert.equal(server.closed, true)
    assert.equal(exitCode, 0)
  })

  test('work offered after shutdown starts is not run', async () => {
    const inFlight = new InFlight()
    const shutdown = createShutdown({ server: fakeServer(), tasks: [], inFlight, disconnect: async () => {}, exit: () => {}, log: () => {} })
    await shutdown('SIGINT')
    let ran = false
    inFlight.run(async () => { ran = true })
    assert.equal(ran, false)
  })

  test('gives up after the cap and still disconnects', async () => {
    const inFlight = new InFlight()
    inFlight.run(() => new Promise(() => {}))
    let disconnected = false
    let exitCode: number | undefined
    const shutdown = createShutdown({
      server: fakeServer(),
      tasks: [],
      inFlight,
      disconnect: async () => { disconnected = true },
      exit: (code) => { exitCode = code },
      timeoutMs: 30,
      log: () => {},
    })
    await shutdown('SIGTERM')
    assert.equal(disconnected, true)
    assert.equal(exitCode, 1)
  })
})
