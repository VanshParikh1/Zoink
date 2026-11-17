import type { Server } from 'http'

// Railway sends SIGTERM on every deploy. Without a handler the process died
// mid-request or mid-job, e.g. between a Stripe call and the DB write that
// records it.

type Stoppable = { stop: () => unknown }

/** Tracks work started outside a request (cron ticks) so shutdown can wait
 *  for it, and refuses new work once shutdown has begun. */
export class InFlight {
  private readonly running = new Set<Promise<unknown>>()
  private closed = false

  /** Runs `work` unless shutdown has started. */
  run(work: () => Promise<unknown>): void {
    if (this.closed) return
    const p = work().finally(() => this.running.delete(p))
    this.running.add(p)
  }

  close(): Promise<void> {
    this.closed = true
    return Promise.allSettled([...this.running]).then(() => undefined)
  }
}

export function createShutdown(deps: {
  server: Pick<Server, 'close'>
  tasks: Stoppable[]
  inFlight: InFlight
  disconnect: () => Promise<unknown>
  exit: (code: number) => void
  timeoutMs?: number
  log?: (message: string) => void
}) {
  const { server, tasks, inFlight, disconnect, exit, timeoutMs = 25_000, log = console.log } = deps
  let started = false

  return async function shutdown(signal: string) {
    if (started) return
    started = true
    log(`${signal} received: closing the server and waiting for in-flight work.`)

    for (const task of tasks) task.stop()
    const serverClosed = new Promise<void>((resolve) => server.close(() => resolve()))
    const drained = Promise.all([serverClosed, inFlight.close()])

    let timer: NodeJS.Timeout | undefined
    const timedOut = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs)
    })
    const result = await Promise.race([drained.then(() => 'drained' as const), timedOut])
    clearTimeout(timer)
    if (result === 'timeout') log(`In-flight work still running after ${timeoutMs} ms; exiting anyway.`)

    try {
      await disconnect()
    } catch {
      // Exiting either way.
    }
    exit(result === 'timeout' ? 1 : 0)
  }
}
