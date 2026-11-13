import assert from 'node:assert/strict'
import { test } from 'node:test'

import '../extension/parse.js'

const { parseGuestList, planImport } = globalThis.maplewoodGuestList

const names = (text) => parseGuestList(text).names

test('one name per line', () => {
  assert.deepEqual(names('Emma Stone\nLiam Park\r\n\r\nNoah Diaz\n'), [
    'Emma Stone',
    'Liam Park',
    'Noah Diaz',
  ])
})

test('a sentence-style list from an email', () => {
  assert.deepEqual(
    names('Hi Carla,\nHere is our guest list: Emma Stone, Liam Park and Noah Diaz.\nThanks!'),
    ['Emma Stone', 'Liam Park', 'Noah Diaz'],
  )
})

test('numbered and bulleted lists', () => {
  assert.deepEqual(names('1. Emma Stone\n2) Liam Park\n- Noah Diaz\n• Ava Lee\n(5) Mia Cruz'), [
    'Emma Stone',
    'Liam Park',
    'Noah Diaz',
    'Ava Lee',
    'Mia Cruz',
  ])
})

test('a spreadsheet column with a header', () => {
  assert.deepEqual(names('Guest Name\nEmma Stone\nLiam Park'), ['Emma Stone', 'Liam Park'])
})

test('spreadsheet rows: first and last name cells, contact cells dropped', () => {
  const pasted = [
    'First Name\tLast Name\tPhone\tEmail',
    'Emma\tStone\t(555) 010-0199\temma@example.com',
    'Liam\tPark\t\t',
    '3\tNoah Diaz\t5550100123',
  ].join('\n')
  assert.deepEqual(names(pasted), ['Emma Stone', 'Liam Park', 'Noah Diaz'])
})

test('ages, notes in brackets and stray punctuation are removed', () => {
  assert.deepEqual(names('Emma Stone (age 6);  Liam Park - 7\nNoah "Bud" Diaz <noah@example.com>'), [
    'Emma Stone',
    'Liam Park',
    'Noah Bud Diaz',
  ])
})

test('names keep hyphens, apostrophes, accents and suffixes', () => {
  assert.deepEqual(names("Anne-Marie O’Brien, José Núñez, John Smith, Jr."), [
    "Anne-Marie O'Brien",
    'José Núñez',
    'John Smith Jr',
  ])
})

test('a repeated name is kept once and reported', () => {
  assert.deepEqual(parseGuestList('Emma Stone\nemma  stone\nLiam Park'), {
    names: ['Emma Stone', 'Liam Park'],
    repeated: ['emma stone'],
  })
})

test('lines that are not names are ignored', () => {
  assert.deepEqual(names('We will bring our own cake and candles too\n12345\n---\n\nEmma Stone'), [
    'Emma Stone',
  ])
})

test('plan: every new name gets an empty row', () => {
  assert.deepEqual(
    planImport({ names: ['Emma Stone', 'Liam Park'], existing: ['Ava Lee'], emptyRows: 2 }),
    { toAdd: ['Emma Stone', 'Liam Park'], alreadyListed: [], tooMany: 0 },
  )
})

test('plan: a guest already on the booking is not added again', () => {
  assert.deepEqual(
    planImport({ names: ['Emma Stone', 'Liam Park'], existing: [' emma stone '], emptyRows: 1 }),
    { toAdd: ['Liam Park'], alreadyListed: ['Emma Stone'], tooMany: 0 },
  )
})

test('plan: more names than empty rows is reported', () => {
  assert.equal(
    planImport({ names: ['Emma Stone', 'Liam Park', 'Noah Diaz'], existing: [], emptyRows: 1 })
      .tooMany,
    2,
  )
})
