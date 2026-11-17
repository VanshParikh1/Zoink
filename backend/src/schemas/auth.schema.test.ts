import test from 'node:test'
import assert from 'node:assert/strict'
import { RegisterSchema } from './auth.schema'

function register(email: string, university: string) {
  return RegisterSchema.safeParse({
    body: {
      email,
      password: 'correct horse',
      firstName: 'Sam',
      lastName: 'Lee',
      phone: '416-555-0192',
      university,
      acceptedTermsVersion: '1.0',
      acceptedPrivacyVersion: '1.0',
      ageAttested: true,
    },
  })
}

test('registration accepts every domain of the chosen school', () => {
  for (const [university, email] of [
    ['UOFT', 'sam@mail.utoronto.ca'],
    ['TMU', 'sam@torontomu.ca'],
    ['TMU', 'sam@ryerson.ca'],
    ['YORK', 'sam@my.yorku.ca'],
    ['MCMASTER', 'sam@mcmaster.ca'],
    ['ONTARIO_TECH', 'sam@ontariotechu.net'],
    ['LAURIER', 'sam@mylaurier.ca'],
    ['WATERLOO', 'sam@uwaterloo.ca'],
  ]) {
    assert.equal(register(email, university).success, true, `${university} ${email}`)
  }
})

test("registration rejects another school's or a look-alike domain, naming the accepted ones", () => {
  for (const email of ['sam@gmail.com', 'sam@my.yorku.ca', 'sam@cs.utoronto.ca', 'sam@utoronto.ca.evil.com', 'sam@utoronto.ca']) {
    const result = register(email, 'UOFT')
    assert.equal(result.success, false, email)
    assert.equal(result.error!.issues[0].message, 'Please use your University of Toronto student email (@mail.utoronto.ca).')
  }
})

test('staff and faculty domains no longer open an account (D-8)', () => {
  for (const [university, email] of [
    ['UOFT', 'sam@utoronto.ca'],
    ['YORK', 'sam@yorku.ca'],
    ['ONTARIO_TECH', 'sam@ontariotechu.ca'],
  ]) {
    assert.equal(register(email, university).success, false, `${university} ${email}`)
  }
})
