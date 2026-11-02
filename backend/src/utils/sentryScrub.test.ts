import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import type { ErrorEvent } from '@sentry/node'
import { FILTERED, loggableError, loggableMessage, redactPrismaArguments, scrubBreadcrumb, scrubEvent } from './sentryScrub'

function event(overrides: Partial<ErrorEvent>): ErrorEvent {
  return { type: undefined, ...overrides } as ErrorEvent
}

describe('scrubEvent', () => {
  test('filters credentials, contact details and one-time codes from request bodies', () => {
    const scrubbed = scrubEvent(event({
      request: {
        data: {
          email: 'alice@mail.utoronto.ca',
          password: 'hunter22',
          phone: '+14165550192',
          code: '123456',
          firstName: 'Alice',
          nested: { stripeSecretKey: 'sk_live_x', expoPushToken: 'ExponentPushToken[x]', note: 'hi' },
        },
      },
    }))
    const data = scrubbed.request!.data as any
    assert.equal(data.email, FILTERED)
    assert.equal(data.password, FILTERED)
    assert.equal(data.phone, FILTERED)
    assert.equal(data.code, FILTERED)
    assert.equal(data.firstName, 'Alice')
    assert.equal(data.nested.stripeSecretKey, FILTERED)
    assert.equal(data.nested.expoPushToken, FILTERED)
    assert.equal(data.nested.note, 'hi')
  })

  test('drops raw string bodies (e.g. the Stripe webhook payload) entirely', () => {
    const scrubbed = scrubEvent(event({ request: { data: '{"customer_email":"a@b.co","card":{"last4":"4242"}}' } }))
    assert.equal(scrubbed.request!.data, FILTERED)
  })

  test('filters auth headers and cookies, redacts emails in the URL and query', () => {
    const scrubbed = scrubEvent(event({
      request: {
        headers: { authorization: 'Bearer eyJ...', 'user-agent': 'Zoink/1.0' },
        cookies: { session: 'abc' },
        url: 'https://api.zoink.app/users?email=alice@mail.utoronto.ca',
        query_string: 'email=alice@mail.utoronto.ca',
      },
    }))
    assert.equal(scrubbed.request!.headers!.authorization, FILTERED)
    assert.equal(scrubbed.request!.headers!['user-agent'], 'Zoink/1.0')
    assert.equal((scrubbed.request!.cookies as any).session, FILTERED)
    assert.ok(!scrubbed.request!.url!.includes('alice@'))
    assert.ok(!String(scrubbed.request!.query_string).includes('alice@'))
  })

  test('keeps only the user id, and redacts emails in messages, exceptions and breadcrumbs', () => {
    const scrubbed = scrubEvent(event({
      user: { id: 'user-1', email: 'alice@mail.utoronto.ca', ip_address: '203.0.113.9' },
      message: 'failed for alice@mail.utoronto.ca',
      exception: { values: [{ type: 'Error', value: 'No such customer for bob@torontomu.ca' }] },
      breadcrumbs: [{ category: 'console', message: '[DEV] OTP for carol@mylaurier.ca: 123456', data: { code: '123456', status_code: 500 } }],
    }))
    assert.deepEqual(scrubbed.user, { id: 'user-1' })
    assert.ok(!scrubbed.message!.includes('@'))
    assert.ok(!scrubbed.exception!.values![0].value!.includes('@'))
    const crumb = scrubbed.breadcrumbs![0]
    assert.ok(!crumb.message!.includes('carol@'))
    assert.equal((crumb.data as any).code, FILTERED)
    assert.equal((crumb.data as any).status_code, 500, 'status_code is not mistaken for a code')
  })
})

describe('scrubBreadcrumb', () => {
  test('redacts emails and filters sensitive data keys', () => {
    const crumb = scrubBreadcrumb({ message: 'login alice@mail.utoronto.ca', data: { password: 'x', url: '/auth/login' } })
    assert.equal(crumb.message, 'login [email]')
    assert.equal((crumb.data as any).password, FILTERED)
    assert.equal((crumb.data as any).url, '/auth/login')
  })
})

// The shape of a PrismaClientValidationError's message (values made up).
const PRISMA_VALIDATION_MESSAGE = [
  '',
  'Invalid `prisma.user.create()` invocation in',
  '/app/dist/services/authService.js:120:13',
  '',
  '  119 const user = await prisma.user.create({',
  '→ 120   data: {',
  '          email: "alice@mail.utoronto.ca",',
  '          passwordHash: "$2b$12$abcdefghijklmnopqrstuv",',
  '          lastName: "Private",',
  '          phone: 1',
  '                 ~',
  '        }',
  '      })',
  '',
  'Argument `phone`: Invalid value provided. Expected String, provided Int.',
].join('\n')

describe('Prisma call arguments', () => {
  test('are dropped from a validation error message; the call and the reason stay', () => {
    const out = redactPrismaArguments(PRISMA_VALIDATION_MESSAGE)
    for (const leaked of ['alice@', '$2b$12$', 'Private']) assert.ok(!out.includes(leaked), `still contains ${leaked}`)
    assert.match(out, /Invalid `prisma\.user\.create\(\)` invocation/)
    assert.match(out, /Argument `phone`: Invalid value provided/)
  })

  test('other messages are left alone', () => {
    assert.equal(redactPrismaArguments('Card declined'), 'Card declined')
  })

  test('scrubEvent drops them from exception values', () => {
    const scrubbed = scrubEvent(event({ exception: { values: [{ type: 'PrismaClientValidationError', value: PRISMA_VALIDATION_MESSAGE }] } }))
    assert.ok(!scrubbed.exception!.values![0].value!.includes('$2b$12$'))
  })
})

describe('loggableError and loggableMessage', () => {
  test('return a redacted copy, keeping the name and stack frames, and leave the original alone', () => {
    const error = new Error(PRISMA_VALIDATION_MESSAGE)
    error.name = 'PrismaClientValidationError'
    const logged = loggableError(error) as Error
    assert.notEqual(logged, error)
    assert.equal(logged.name, 'PrismaClientValidationError')
    assert.ok(!String(logged.stack).includes('alice@') && !String(logged.stack).includes('$2b$12$'))
    assert.match(String(logged.stack), /\n\s+at /)
    assert.ok(error.message.includes('alice@'), 'the thrown error is not changed')
    assert.ok(!loggableMessage(error).includes('$2b$12$'))
  })

  test('hand back the same error when there is nothing to hide', () => {
    const error = new Error('Stripe is unavailable')
    assert.equal(loggableError(error), error)
    assert.equal(loggableMessage('not an error'), 'UNKNOWN_ERROR')
  })

  test('redact push tokens and emails in plain strings', () => {
    assert.equal(loggableError('"ExponentPushToken[abc]" for bob@torontomu.ca'), '"[push-token]" for [email]')
  })
})
