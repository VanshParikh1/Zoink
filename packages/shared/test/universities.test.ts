import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isUniversityEmail,
  universityDomainsText,
  universityForEmail,
  UNIVERSITY_DOMAINS,
  UNIVERSITY_EMAIL_DOMAINS,
  UNIVERSITY_LABELS,
} from '../src/universities'

// Sign-up is open to student addresses at every school listed here (D-8,
// 2026-11-17): removing a domain locks its students out of registering.
test('the allowlist: every school and every accepted domain', () => {
  assert.deepEqual(UNIVERSITY_EMAIL_DOMAINS, {
    UOFT: ['mail.utoronto.ca'],
    TMU: ['torontomu.ca', 'ryerson.ca'],
    LAURIER: ['mylaurier.ca'],
    YORK: ['my.yorku.ca'],
    ONTARIO_TECH: ['ontariotechu.net'],
    MCMASTER: ['mcmaster.ca'],
    WATERLOO: ['uwaterloo.ca'],
  })
  assert.deepEqual(Object.keys(UNIVERSITY_LABELS).sort(), Object.keys(UNIVERSITY_EMAIL_DOMAINS).sort())
})

test('the hint domain is the student address', () => {
  assert.equal(UNIVERSITY_DOMAINS.UOFT, 'mail.utoronto.ca')
  assert.equal(UNIVERSITY_DOMAINS.YORK, 'my.yorku.ca')
  assert.equal(UNIVERSITY_DOMAINS.ONTARIO_TECH, 'ontariotechu.net')
})

test('an email matches its own school exactly, case-insensitively', () => {
  assert.equal(isUniversityEmail('UOFT', 'sam@mail.utoronto.ca'), true)
  assert.equal(isUniversityEmail('UOFT', ' Sam@Mail.UToronto.CA '), true)
  assert.equal(isUniversityEmail('TMU', 'sam@ryerson.ca'), true)
  // Staff and faculty domains no longer open an account (D-8).
  assert.equal(isUniversityEmail('UOFT', 'sam@utoronto.ca'), false)
  assert.equal(isUniversityEmail('YORK', 'sam@yorku.ca'), false)
  assert.equal(isUniversityEmail('ONTARIO_TECH', 'sam@ontariotechu.ca'), false)
  // Not a subdomain, a look-alike, or another school's domain.
  assert.equal(isUniversityEmail('UOFT', 'sam@cs.utoronto.ca'), false)
  assert.equal(isUniversityEmail('UOFT', 'sam@utoronto.ca.evil.com'), false)
  assert.equal(isUniversityEmail('UOFT', 'sam@my.yorku.ca'), false)
  assert.equal(isUniversityEmail('MCMASTER', 'mcmaster.ca'), false)
})

test('the school for an email, from any of its domains, retired ones included', () => {
  assert.equal(universityForEmail('a@mail.utoronto.ca'), 'UOFT')
  assert.equal(universityForEmail('a@utoronto.ca'), 'UOFT', 'an existing account on a retired domain keeps its school')
  assert.equal(universityForEmail('a@yorku.ca'), 'YORK')
  assert.equal(universityForEmail('a@torontomu.ca'), 'TMU')
  assert.equal(universityForEmail('a@gmail.com'), null)
  assert.equal(universityForEmail(null), null)
})

test('the domains in an error message', () => {
  assert.equal(universityDomainsText('UOFT'), '@mail.utoronto.ca')
  assert.equal(universityDomainsText('TMU'), '@torontomu.ca or @ryerson.ca')
  assert.equal(universityDomainsText('MCMASTER'), '@mcmaster.ca')
})
