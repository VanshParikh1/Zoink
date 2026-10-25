import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import { createSubmitGuard } from './submitGuard'

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('submit guard', () => {
  test('a double tap in the same frame sends once', async () => {
    const guard = createSubmitGuard()
    let sent = 0
    const request = deferred()
    const first = guard.run(async () => {
      sent += 1
      await request.promise
    })
    const second = guard.run(async () => {
      sent += 1
    })
    assert.equal(guard.busy, true)
    request.resolve()
    assert.deepEqual(await Promise.all([first, second]), [true, false])
    assert.equal(sent, 1)
  })

  test('after it settles, the next tap goes through', async () => {
    const guard = createSubmitGuard()
    let sent = 0
    await guard.run(async () => {
      sent += 1
    })
    await guard.run(async () => {
      sent += 1
    })
    assert.equal(sent, 2)
    assert.equal(guard.busy, false)
  })

  test('a failed submit frees the guard, so a retry works', async () => {
    const guard = createSubmitGuard()
    await assert.rejects(
      guard.run(async () => {
        throw new Error('offline')
      })
    )
    assert.equal(guard.busy, false)
    assert.equal(await guard.run(async () => {}), true)
  })
})
