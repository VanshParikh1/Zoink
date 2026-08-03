import { test, describe } from 'node:test'
import assert from 'node:assert'
import { grantAdminRole, revokeAdminRole, parseEmailArg } from './manageAdminRole'

function makeMockDb(users: { id: string; email: string; role: 'USER' | 'ADMIN' }[]) {
  return {
    user: {
      findFirst: async ({ where }: any) => {
        const email = where.email.equals as string
        return users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null
      },
      update: async ({ where, data }: any) => {
        const user = users.find((u) => u.id === where.id)!
        Object.assign(user, data)
        return { ...user }
      },
      count: async ({ where }: any) => users.filter((u) => u.role === where.role).length,
    },
  } as any
}

describe('parseEmailArg', () => {
  test('extracts the email from --email=... argv', () => {
    assert.strictEqual(parseEmailArg(['grant', '--email=foo@mail.utoronto.ca']), 'foo@mail.utoronto.ca')
  })

  test('throws when --email= is missing', () => {
    assert.throws(() => parseEmailArg(['grant']), /Usage: --email=/)
  })
})

describe('grantAdminRole', () => {
  test('refuses and does not create a user when the email is not found', async () => {
    const db = makeMockDb([])
    const outcome = await grantAdminRole('nobody@mail.utoronto.ca', db)
    assert.strictEqual(outcome.status, 'refused')
    assert.ok(outcome.message.includes('No user found'))
  })

  test('grants ADMIN to a matching user, case-insensitively', async () => {
    const db = makeMockDb([{ id: 'u-1', email: 'Foo@Mail.UToronto.ca', role: 'USER' }])
    const outcome = await grantAdminRole('foo@mail.utoronto.ca', db)
    assert.strictEqual(outcome.status, 'changed')
    assert.strictEqual(outcome.roleBefore, 'USER')
    assert.strictEqual(outcome.roleAfter, 'ADMIN')
    assert.strictEqual(outcome.userId, 'u-1')
  })

  test('is a no-op when the user is already ADMIN', async () => {
    const db = makeMockDb([{ id: 'u-1', email: 'foo@mail.utoronto.ca', role: 'ADMIN' }])
    const outcome = await grantAdminRole('foo@mail.utoronto.ca', db)
    assert.strictEqual(outcome.status, 'noop')
    assert.ok(outcome.message.includes('already ADMIN'))
  })
})

describe('revokeAdminRole', () => {
  test('refuses and does not modify anything when the email is not found', async () => {
    const db = makeMockDb([])
    const outcome = await revokeAdminRole('nobody@mail.utoronto.ca', db)
    assert.strictEqual(outcome.status, 'refused')
    assert.ok(outcome.message.includes('No user found'))
  })

  test('is a no-op when the user is already a plain USER', async () => {
    const db = makeMockDb([{ id: 'u-1', email: 'foo@mail.utoronto.ca', role: 'USER' }])
    const outcome = await revokeAdminRole('foo@mail.utoronto.ca', db)
    assert.strictEqual(outcome.status, 'noop')
  })

  test('revokes ADMIN when another admin remains', async () => {
    const db = makeMockDb([
      { id: 'u-1', email: 'foo@mail.utoronto.ca', role: 'ADMIN' },
      { id: 'u-2', email: 'bar@mail.utoronto.ca', role: 'ADMIN' },
    ])
    const outcome = await revokeAdminRole('foo@mail.utoronto.ca', db)
    assert.strictEqual(outcome.status, 'changed')
    assert.strictEqual(outcome.roleBefore, 'ADMIN')
    assert.strictEqual(outcome.roleAfter, 'USER')
  })

  test('refuses to revoke the last remaining admin', async () => {
    const db = makeMockDb([{ id: 'u-1', email: 'foo@mail.utoronto.ca', role: 'ADMIN' }])
    const outcome = await revokeAdminRole('foo@mail.utoronto.ca', db)
    assert.strictEqual(outcome.status, 'refused')
    assert.ok(outcome.message.includes('only remaining admin'))

    // Confirm nothing was actually changed in the DB.
    const stillAdmin = await db.user.findFirst({ where: { email: { equals: 'foo@mail.utoronto.ca' } } })
    assert.strictEqual(stillAdmin.role, 'ADMIN')
  })
})
