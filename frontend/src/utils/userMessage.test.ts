import test, { afterEach, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { HttpError, ResolvedRequest } from '../services/http'
import { setSimulatedOffline } from '../services/onlineState'
import { errorKind, isPickupPaymentFailure, isUnavailable, serverSentencesForTest, userMessage } from './userMessage'

const request: ResolvedRequest = { method: 'post', url: '/bookings', headers: {} }

function answered(status: number, data: unknown) {
  return new HttpError(`Request failed with status code ${status}`, request, {
    status,
    data,
    headers: new Headers(),
    config: request,
  })
}

function noAnswer() {
  return new HttpError('Network Error', request)
}

afterEach(() => setSimulatedOffline(null))

describe('userMessage', () => {
  test('a sentence the API writes for people is shown as sent', () => {
    const error = answered(409, {
      error: "This listing has a booking that isn't finished yet. Decline or cancel it, or complete the rental, then delete the listing.",
    })
    assert.equal(
      userMessage(error, { action: 'Could not delete listing.' }),
      "This listing has a booking that isn't finished yet. Decline or cancel it, or complete the rental, then delete the listing."
    )
  })

  test('a sentence with a number in it is matched by its pattern', () => {
    assert.equal(userMessage(answered(400, { error: 'Bookings cannot exceed 7 days.' })), 'Bookings cannot exceed 7 days.')
    assert.equal(
      userMessage(answered(400, { error: 'Validation failed.', issues: [{ path: 'body', message: 'Please use your University of Toronto student email (@mail.utoronto.ca or @utoronto.ca).' }] })),
      'Please use your University of Toronto student email (@mail.utoronto.ca or @utoronto.ca).'
    )
    assert.equal(userMessage(answered(409, { error: 'You can pay from Nov 9, 12:00\u202fAM.' })), 'You can pay from Nov 9, 12:00\u202fAM.')
    assert.equal(userMessage(answered(400, { error: 'Rentals with a deposit can be at most 3 days.' })), 'Rentals with a deposit can be at most 3 days.')
    assert.equal(
      userMessage(answered(400, { error: 'Validation failed.', issues: [{ path: 'body', message: 'Please use your McMaster University student email (@mcmaster.ca).' }] })),
      'Please use your McMaster University student email (@mcmaster.ca).'
    )
  })

  test('API wording with field names is reworded', () => {
    assert.equal(
      userMessage(answered(409, { error: 'That booking transition is not allowed.' })),
      'This booking has already moved on. Refresh to see where it stands.'
    )
    assert.equal(
      userMessage(answered(400, { error: 'refundAmountCents cannot exceed the deposit amount of $50.00.' })),
      "The amount can't be more than the deposit ($50.00)."
    )
  })

  test("Stripe's text inside a server message never reaches the screen", () => {
    const error = answered(409, {
      error: 'Could not authorize the deposit — payment was not completed: card_declined: Your card was declined. Please try again.',
    })
    assert.equal(userMessage(error), "Your deposit couldn't be authorized, so the payment didn't go through. Please try again.")
    assert.equal(
      userMessage(answered(500, { error: 'Failed to refund payment via Stripe: No such payment_intent: pi_123' })),
      'Something went wrong on our side. Please try again in a moment.'
    )
  })

  test('internal or unknown server text gets the plain message for its kind', () => {
    assert.equal(userMessage(answered(401, { error: 'No token provided.' })), 'Your session has ended. Please log in again.')
    assert.equal(userMessage(answered(400, { error: 'Invalid cursor.' })), "Something here isn't quite right. Check it and try again.")
    assert.equal(
      userMessage(answered(400, { error: 'Unknown field(s): insuranceFee' }), { action: "Couldn't send your request. Please try again." }),
      "Couldn't send your request. Please try again."
    )
    assert.equal(
      userMessage(answered(400, { error: 'Validation failed.', issues: [{ path: 'body.dailyPrice', message: 'Expected number, received string' }] })),
      "Something here isn't quite right. Check it and try again."
    )
    assert.equal(userMessage(answered(429, { error: 'Too many requests. Please try again later.' })), "You're doing that too often. Wait a minute and try again.")
    assert.equal(userMessage(answered(413, { error: 'That file is too large.' })), 'That photo is too large. Choose a smaller one.')
    assert.equal(userMessage(answered(503, { error: 'Service temporarily unavailable. Please try again.' })), 'Something went wrong on our side. Please try again in a moment.')
  })

  test('a 404 says what is gone when the screen knows', () => {
    const error = answered(404, { error: 'Listing not found.' })
    assert.equal(userMessage(error, { notFound: 'This listing is no longer available.' }), 'This listing is no longer available.')
    assert.equal(userMessage(error), 'This is no longer available.')
  })

  test('an HTML error page from a proxy is not shown', () => {
    assert.equal(userMessage(answered(502, '<html><body>Bad gateway</body></html>')), 'Something went wrong on our side. Please try again in a moment.')
  })

  test('no answer: offline, or the server could not be reached', () => {
    assert.equal(userMessage(noAnswer()), "Couldn't reach Zoink. Check your connection and try again.")
    setSimulatedOffline(true)
    assert.equal(userMessage(noAnswer()), "You're offline. Check your connection and try again.")
  })

  test('a write refused offline says it was not sent', () => {
    const refused = Object.assign(noAnswer(), { offline: true })
    assert.equal(userMessage(refused), "You're offline, so this wasn't sent. Try again when you're back online.")
    assert.equal(errorKind(refused), 'offline')
  })

  test('an error from the app itself never shows its message', () => {
    assert.equal(userMessage(new TypeError("Cannot read properties of undefined (reading 'id')")), 'Something went wrong. Please try again.')
    assert.equal(userMessage(new Error('boom'), { action: "Couldn't open the chat. Please try again." }), "Couldn't open the chat. Please try again.")
    assert.equal(userMessage(undefined), 'Something went wrong. Please try again.')
  })
})

describe('isPickupPaymentFailure', () => {
  const sentence =
    "The rental payment couldn't be collected, so the pickup didn't go through. Keep the item for now and try Zoink It again. If it keeps failing, contact support."

  test('the refused handoff is told apart from a lost tap race', () => {
    assert.equal(isPickupPaymentFailure(answered(409, { error: sentence })), true)
    assert.equal(isPickupPaymentFailure(answered(409, { error: 'This booking was updated by someone else. Please refresh and try again.' })), false)
    assert.equal(isPickupPaymentFailure(noAnswer()), false)
  })
})

describe('isUnavailable', () => {
  test('gone, someone else’s, or a malformed id: the fallback screen', () => {
    assert.equal(isUnavailable(answered(404, { error: 'Booking not found.' })), true)
    assert.equal(isUnavailable(answered(403, { error: 'You do not have access to this booking.' })), true)
    assert.equal(isUnavailable(answered(400, { error: 'Validation failed.' })), true)
  })

  test('a failure worth retrying is not', () => {
    assert.equal(isUnavailable(answered(500, { error: 'Something went wrong.' })), false)
    assert.equal(isUnavailable(noAnswer()), false)
  })
})

describe("the server sentences match the backend's wording", () => {
  // Every non-test source file, with string concatenation and escaped quotes
  // undone, so a sentence split over two literals still matches.
  function backendSource(dir: string): string {
    let text = ''
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'integration-tests' && entry.name !== 'scripts') text += backendSource(full)
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        text += fs.readFileSync(full, 'utf8') + '\n'
      }
    }
    return text
  }
  const source = backendSource(path.resolve(__dirname, '../../../backend/src'))
    .replace(/(['"`])\s+\+\s+\1/g, '')
    .replace(/\\'/g, "'")

  for (const sentence of [...serverSentencesForTest.shownAsIs, ...serverSentencesForTest.reworded, ...serverSentencesForTest.patternSources]) {
    test(sentence.slice(0, 70), () => {
      assert.ok(source.includes(sentence), `backend/src no longer says: ${sentence}`)
    })
  }
})
