import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import {
  CANADIAN_PHONE_REGEX,
  hasErrors,
  validateDispute,
  validateListing,
  validateProfile,
  validateRegistration,
  validateReport,
  validateResolution,
  validateReview,
  validateSignIn,
} from './formValidation'

const goodRegistration = {
  email: 'Sam.Lee@mail.utoronto.ca ',
  university: 'UOFT' as const,
  firstName: 'Sam',
  lastName: 'Lee',
  phone: '(416) 555-0192',
  password: 'correct horse',
}

describe('sign in', () => {
  test('both fields are required; whitespace is not an email', () => {
    assert.deepEqual(validateSignIn({ email: '  ', password: '' }), { email: 'Enter your student email.', password: 'Enter your password.' })
    assert.deepEqual(validateSignIn({ email: 'a@b.ca', password: ' ' }), {})
  })
})

describe('registration', () => {
  test('a complete, matching form passes', () => {
    const errors = validateRegistration(goodRegistration)
    assert.deepEqual(errors, {})
    assert.equal(hasErrors(errors), false)
  })

  test('every empty field is named at once', () => {
    const errors = validateRegistration({ email: '', university: null, firstName: ' ', lastName: '', phone: '', password: '' })
    assert.deepEqual(Object.keys(errors).sort(), ['email', 'firstName', 'lastName', 'password', 'phone', 'university'])
  })

  test("the email must be the chosen university's", () => {
    assert.equal(validateRegistration({ ...goodRegistration, email: 'sam@gmail.com' }).email, 'Use your @mail.utoronto.ca address.')
  })

  test('phone: the forms the server accepts pass, others do not', () => {
    for (const phone of ['4165550192', '416-555-0192', '+1 416 555 0192', '1 (416) 555-0192']) {
      assert.equal(validateRegistration({ ...goodRegistration, phone }).phone, undefined, phone)
    }
    for (const phone of ['555-0192', '0165550192', '416555019', 'call me']) {
      assert.equal(validateRegistration({ ...goodRegistration, phone }).phone, 'Enter a 10-digit phone number.', phone)
    }
  })

  test('password length is 8 to 128, as the server allows', () => {
    assert.equal(validateRegistration({ ...goodRegistration, password: 'short' }).password, 'Use at least 8 characters.')
    assert.equal(validateRegistration({ ...goodRegistration, password: 'x'.repeat(129) }).password, 'Use 128 characters or fewer.')
    assert.equal(validateRegistration({ ...goodRegistration, password: 'x'.repeat(128) }).password, undefined)
  })

  test("the phone rule is the server's rule", () => {
    const schema = fs.readFileSync(path.resolve(__dirname, '../../../backend/src/schemas/auth.schema.ts'), 'utf8')
    assert.ok(schema.includes(`CANADIAN_PHONE_REGEX = ${CANADIAN_PHONE_REGEX.toString()}`), 'backend/src/schemas/auth.schema.ts changed its phone rule')
  })
})

describe('listing', () => {
  const good = { title: 'Drill', category: 'Tools', description: 'Cordless', dailyPrice: '12', deposit: '', itemValue: '', city: 'Toronto' }

  test('a complete listing passes; photos only counted when creating', () => {
    assert.deepEqual(validateListing(good), {})
    assert.equal(validateListing(good, { photoCount: 0, minPhotos: 1 }).photos, 'Add at least one photo of your item.')
    assert.equal(validateListing(good, { photoCount: 1, minPhotos: 1 }).photos, undefined)
  })

  test('price must be a positive number', () => {
    assert.equal(validateListing({ ...good, dailyPrice: '' }).dailyPrice, 'Add a price.')
    assert.equal(validateListing({ ...good, dailyPrice: '0' }).dailyPrice, 'Must be more than $0.')
    assert.equal(validateListing({ ...good, dailyPrice: 'abc' }).dailyPrice, 'Must be more than $0.')
  })

  test('a deposit needs an item value at least as large', () => {
    assert.equal(validateListing({ ...good, deposit: '50' }).itemValue, 'Needed with a deposit.')
    assert.equal(validateListing({ ...good, deposit: '50', itemValue: '40' }).deposit, "Can't be more than the item value.")
    assert.deepEqual(validateListing({ ...good, deposit: '40', itemValue: '40' }), {})
    assert.equal(validateListing({ ...good, deposit: '-1', itemValue: '40' }).deposit, 'Must be $0 or more.')
  })

  test('messages stay short enough for the narrow price fields', () => {
    const errors = validateListing({ ...good, dailyPrice: '0', deposit: '50', itemValue: '40' })
    for (const key of ['dailyPrice', 'deposit', 'itemValue'] as const) {
      if (errors[key]) assert.ok(errors[key]!.length <= 34, `${key}: ${errors[key]}`)
    }
  })
})

describe('profile, reports, reviews, admin', () => {
  test('profile phone is optional but must be real when given', () => {
    assert.deepEqual(validateProfile({ firstName: 'Sam', lastName: 'Lee', phone: '' }), {})
    assert.equal(validateProfile({ firstName: 'Sam', lastName: 'Lee', phone: '12' }).phone, 'Enter a 10-digit phone number.')
  })

  test('a dispute needs a reason and a real description', () => {
    assert.deepEqual(validateDispute({ reason: null, description: 'short' }, 10), {
      reason: 'Choose what went wrong.',
      description: 'Add at least 10 characters.',
    })
    assert.deepEqual(validateDispute({ reason: 'ITEM_DAMAGED', description: 'Scratched lens' }, 10), {})
  })

  test('a report may leave details blank, but not a stub', () => {
    assert.deepEqual(validateReport({ reason: 'SPAM', description: '' }, 10), {})
    assert.equal(validateReport({ reason: 'SPAM', description: 'bad' }, 10).description, 'Add at least 10 characters, or leave it blank.')
  })

  test('reviews: all three scores, and the item when renting', () => {
    assert.equal(validateReview({ scores: [5, 4, null], ratesItem: false }).scores, 'Rate all three to continue.')
    assert.equal(validateReview({ scores: [5, 4, 3], ratesItem: true, itemRating: null }).itemRating, 'Rate the item to continue.')
    assert.deepEqual(validateReview({ scores: [5, 4, 3], ratesItem: true, itemRating: 4 }), {})
  })

  test('an admin resolution: outcome, a note, and an amount within the cap', () => {
    assert.deepEqual(Object.keys(validateResolution({ resolution: null, notes: '', minNotes: 5 })).sort(), ['notes', 'resolution'])
    assert.equal(validateResolution({ resolution: 'RESOLVED_REFUND', notes: 'Damaged', minNotes: 5, amount: { input: '0', capDollars: 50 } }).amount, 'Enter an amount over $0.')
    assert.equal(validateResolution({ resolution: 'RESOLVED_REFUND', notes: 'Damaged', minNotes: 5, amount: { input: '50.01', capDollars: 50 } }).amount, "Can't be more than $50.00.")
    assert.deepEqual(validateResolution({ resolution: 'RESOLVED_REFUND', notes: 'Damaged', minNotes: 5, amount: { input: '50', capDollars: 50 } }), {})
  })
})
