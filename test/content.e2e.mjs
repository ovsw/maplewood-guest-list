// Drives the paste box in Chromium against test/fixture.html. The fixture is
// served on the real Aluvii address from local files; every other request is
// blocked, so nothing here can reach Aluvii.
// Run: npm run test:e2e
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'

import { chromium } from '@playwright/test'

const here = new URL('.', import.meta.url)

const PAGE = 'https://maplewoodyearround.aluvii.com/Employee/Events/BookingDashBoard'
const FILES = {
  '/Employee/Events/BookingDashBoard': ['fixture.html', 'text/html'],
  '/Employee/Events/parse.js': ['../extension/parse.js', 'text/javascript'],
  '/Employee/Events/content.js': ['../extension/content.js', 'text/javascript'],
  '/Employee/Events/content.css': ['../extension/content.css', 'text/css'],
}

let browser

before(async () => {
  browser = await chromium.launch()
})
after(() => browser?.close())

async function openBooking(query = '') {
  const page = await browser.newPage()
  await page.route('**/*', async (route) => {
    const file = FILES[new URL(route.request().url()).pathname]
    if (!file) return route.abort()
    await route.fulfill({ body: await readFile(new URL(file[0], here)), contentType: file[1] })
  })
  await page.goto(`${PAGE}${query}`)
  return page
}

async function openPasteBox(query) {
  const page = await openBooking(query)
  await page.getByRole('button', { name: 'Paste guest list' }).click()
  return page
}

const savedNames = (page) => page.evaluate(() => window.savedGuests.map((guest) => guest.name))
const status = (page) => page.locator('#mw-guest-paste .mw-status')
const box = (page) => page.locator('#mw-guest-paste textarea')

test('each pasted name is saved into an empty row, in order', async () => {
  const page = await openPasteBox('?count=5&filled=1')
  await box(page).fill('1. Emma Stone\n2. Liam Park\nNoah Diaz, Ava Lee')
  await page.getByRole('button', { name: 'Add 4 guests' }).click()
  await assert.doesNotReject(status(page).filter({ hasText: 'Added 4 guests.' }).waitFor())
  assert.deepEqual(await savedNames(page), [
    'Ada Fixture',
    'Emma Stone',
    'Liam Park',
    'Noah Diaz',
    'Ava Lee',
  ])
  assert.equal(await box(page).inputValue(), '')
})

test('too many names: an error, and nothing is added', async () => {
  const page = await openPasteBox('?count=3&filled=1')
  await box(page).fill('Emma Stone\nLiam Park\nNoah Diaz')
  const text = await status(page).textContent()
  assert.match(text, /Too many names: the list has 3 and this booking has 2 empty rows/)
  assert.equal(await page.getByRole('button', { name: /^Add/ }).isDisabled(), true)
  assert.deepEqual(await savedNames(page), ['Ada Fixture'])
})

test('a guest already on the booking is left out', async () => {
  const page = await openPasteBox('?count=3&filled=2')
  await box(page).fill('ada fixture\nEmma Stone')
  await page.getByRole('button', { name: 'Add 1 guest' }).click()
  await status(page).filter({ hasText: 'Added 1 guest.' }).waitFor()
  assert.deepEqual(await savedNames(page), ['Ada Fixture', 'Ben Sample', 'Emma Stone'])
})

test('a guest whose name was deleted counts as an empty row and is reused', async () => {
  const page = await openPasteBox('?count=3&filled=1&blank=1')
  await box(page).fill('Emma Stone\nLiam Park')
  assert.match(await status(page).textContent(), /2 names to add, 2 empty rows/)
  await page.getByRole('button', { name: 'Add 2 guests' }).click()
  await status(page).filter({ hasText: 'Added 2 guests.' }).waitFor()
  assert.deepEqual(await savedNames(page), ['Ada Fixture', 'Emma Stone', 'Liam Park'])
})

test('a failed save stops the run and keeps the rest in the box', async () => {
  const page = await openPasteBox('?count=4&failAt=2')
  await box(page).fill('Emma Stone\nLiam Park\nNoah Diaz')
  await page.getByRole('button', { name: 'Add 3 guests' }).click()
  await status(page).filter({ hasText: 'Stopped at "Liam Park"' }).waitFor({ timeout: 30_000 })
  assert.deepEqual(await savedNames(page), ['Emma Stone'])
  assert.equal(await box(page).inputValue(), 'Liam Park\nNoah Diaz')
})

test('the box appears when the guest list loads after the page', async () => {
  const page = await openBooking('?late=1')
  await page.getByRole('button', { name: 'Paste guest list' }).waitFor()
})
