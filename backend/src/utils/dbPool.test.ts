import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'net'
import { once } from 'events'
import type { AddressInfo } from 'net'
import { createPool, DB_CONNECTION_TIMEOUT_MS } from './dbPool'

test('the app pool gives up on getting a connection after a bounded time', async () => {
  const pool = createPool('postgres://user:pass@127.0.0.1:5432/db')
  try {
    assert.equal(pool.options.connectionTimeoutMillis, DB_CONNECTION_TIMEOUT_MS)
    assert.ok(DB_CONNECTION_TIMEOUT_MS > 0 && Number.isFinite(DB_CONNECTION_TIMEOUT_MS))
  } finally {
    await pool.end()
  }
})

test('a database that accepts the connection but never answers fails the query instead of hanging', async () => {
  // Accepts TCP connections and never replies, like a stuck database.
  const sockets: net.Socket[] = []
  const server = net.createServer((socket) => sockets.push(socket)).listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address() as AddressInfo
  const pool = createPool(`postgres://user:pass@127.0.0.1:${port}/db`, { connectionTimeoutMillis: 200 })

  const started = Date.now()
  try {
    await assert.rejects(pool.query('SELECT 1'))
    assert.ok(Date.now() - started < 5_000, 'rejected promptly')
  } finally {
    await pool.end().catch(() => {})
    for (const socket of sockets) socket.destroy()
    server.close()
  }
})
