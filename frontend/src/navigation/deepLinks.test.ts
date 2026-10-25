import test, { afterEach, describe } from 'node:test'
import assert from 'node:assert/strict'
import { DeepLinkTarget, parseDeepLink, pendingDeepLink, routeDeepLink, setDeepLinkOpener, targetForNotification } from './deepLinks'

const LISTING = '3f2c1a9e-5b7d-4c11-9a2e-8d6f0b4e7a21'

afterEach(() => {
  setDeepLinkOpener(null)
  // Drain anything a test left waiting.
  setDeepLinkOpener(() => {})
  setDeepLinkOpener(null)
})

describe('parseDeepLink', () => {
  test('listing, booking and chat links open their screens', () => {
    assert.deepEqual(parseDeepLink(`zoink://listing/${LISTING}`), { screen: 'ListingDetail', params: { listingId: LISTING } })
    assert.deepEqual(parseDeepLink('zoink://booking/abc-123'), { screen: 'BookingDetail', params: { bookingId: 'abc-123' } })
    assert.deepEqual(parseDeepLink('zoink://chat/c1'), { screen: 'ConversationThread', params: { conversationId: 'c1' } })
  })

  test('the forms a link takes in the wild: triple slash, trailing slash, query, capitals', () => {
    for (const url of [`zoink:///listing/${LISTING}`, `zoink://listing/${LISTING}/`, `zoink://listing/${LISTING}?utm=share#x`, `ZOINK://Listing/${LISTING}`]) {
      assert.deepEqual(parseDeepLink(url), { screen: 'ListingDetail', params: { listingId: LISTING } }, url)
    }
  })

  test('an unknown place, a missing id or a malformed id opens the fallback screen', () => {
    for (const url of ['zoink://profile/u1', 'zoink://listing', 'zoink://listing/', 'zoink://listing/a/b', 'zoink://booking/%3Cscript%3E', 'zoink://chat/' + 'x'.repeat(65)]) {
      assert.deepEqual(parseDeepLink(url), { screen: 'LinkNotFound' }, url)
    }
  })

  test('links that just open the app, or belong to Stripe or the dev client, are left alone', () => {
    for (const url of ['zoink://', 'zoink:///', 'zoink://stripe-redirect?payment_intent=pi_1', 'zoink://expo-development-client/?url=x', 'https://zoink.app/listing/1', 'exp+zoink://expo-development-client']) {
      assert.equal(parseDeepLink(url), null, url)
    }
  })

  test('QA links only in QA builds', () => {
    assert.deepEqual(parseDeepLink('zoink://qa/offline/on', { qa: true }), { qa: 'offline', mode: 'on' })
    assert.deepEqual(parseDeepLink('zoink://qa/offline/device', { qa: true }), { qa: 'offline', mode: 'device' })
    assert.deepEqual(parseDeepLink('zoink://qa/crash/tab', { qa: true }), { qa: 'crash', level: 'tab' })
    assert.deepEqual(parseDeepLink('zoink://qa/offline/on'), { screen: 'LinkNotFound' })
    assert.deepEqual(parseDeepLink('zoink://qa/crash/root'), { screen: 'LinkNotFound' })
  })
})

describe('targetForNotification', () => {
  test('a message opens its chat, even when it also names the listing', () => {
    assert.deepEqual(targetForNotification({ conversationId: 'c1', listingId: 'l1' }), { screen: 'ConversationThread', params: { conversationId: 'c1' } })
  })

  test('booking notifications open the booking', () => {
    assert.deepEqual(targetForNotification({ bookingId: 'b1', listingId: 'l1', phase: 'pickup' }), { screen: 'BookingDetail', params: { bookingId: 'b1' } })
    assert.deepEqual(targetForNotification({ bookingId: 'b1', reviewId: 'r1' }), { screen: 'BookingDetail', params: { bookingId: 'b1' } })
  })

  test('nothing usable: no navigation', () => {
    assert.equal(targetForNotification(undefined), null)
    assert.equal(targetForNotification({}), null)
    assert.equal(targetForNotification({ bookingId: 42 }), null)
    assert.equal(targetForNotification({ bookingId: '../admin' }), null)
  })
})

describe('routing a link', () => {
  // Typed as the union, so an assertion about one doesn't narrow the list.
  const target = (t: DeepLinkTarget) => t
  const booking = target({ screen: 'BookingDetail', params: { bookingId: 'b1' } })
  const chat = target({ screen: 'ConversationThread', params: { conversationId: 'c1' } })

  test('warm: the app is up, so it opens at once', () => {
    const opened: DeepLinkTarget[] = []
    setDeepLinkOpener((t) => opened.push(t))
    routeDeepLink(booking)
    assert.deepEqual(opened, [booking])
    assert.equal(pendingDeepLink(), null)
  })

  test('cold or signed out: held until the signed-in app registers, then opened once', () => {
    routeDeepLink(booking)
    assert.deepEqual(pendingDeepLink(), booking)
    const opened: DeepLinkTarget[] = []
    setDeepLinkOpener((t) => opened.push(t))
    assert.deepEqual(opened, [booking])
    // Re-registering (e.g. the stack remounts) doesn't open it again.
    setDeepLinkOpener(null)
    setDeepLinkOpener((t) => opened.push(t))
    assert.deepEqual(opened, [booking])
  })

  test('several while signed out: the latest wins', () => {
    routeDeepLink(booking)
    routeDeepLink(chat)
    const opened: DeepLinkTarget[] = []
    setDeepLinkOpener((t) => opened.push(t))
    assert.deepEqual(opened, [chat])
  })

  test('after sign-out, links wait again', () => {
    const opened: DeepLinkTarget[] = []
    setDeepLinkOpener((t) => opened.push(t))
    setDeepLinkOpener(null)
    routeDeepLink(chat)
    assert.deepEqual(opened, [])
    assert.deepEqual(pendingDeepLink(), chat)
  })
})
