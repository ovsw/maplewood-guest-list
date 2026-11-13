// Turns pasted text into guest names and decides which of them fit the booking.
// No DOM here: the content script and the tests both load this file, and it
// publishes its functions on globalThis because content scripts cannot import.
(() => {
  const HEADER =
    /^(?:(?:(?:first|last|full|guest|child|kid|children)(?:'s)?\s+)?names?|guests?(?:\s+list)?|phone|mobile|email|contact(?:\s+details?)?|rsvp|age|notes?|waiver|checked\s+in)$/i
  const GREETING =
    /^(?:hi|hello|hey|dear|thanks|thank\s+you|regards|best|sincerely|cheers|sent\s+from)\b/i
  const SUFFIX = /^(?:jr|sr|ii|iii|iv)\.?$/i
  const LIST_MARKER = /^\s*(?:[-–—•*·▪◦‣✓✔☐□>]+|\(?\d{1,3}[.):-])\s*/
  const MAX_WORDS = 5

  // The form two names take when they are the same guest.
  const nameKey = (name) => name.trim().replace(/\s+/g, ' ').toLowerCase()

  const isContact = (cell) =>
    cell.includes('@') || cell.replace(/\D/g, '').length >= 7

  function cleanName(piece) {
    let name = piece
      .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
      .replace(LIST_MARKER, '')
    name = name
      .split(/\s+/)
      .filter((word) => !word.includes('@'))
      .join(' ')
      // Aluvii builds its rows as HTML text, so quotes and angle brackets in a
      // name break the row. Digits are ages, phone numbers or row numbers.
      .replace(/["“”„<>`\d]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s.,;:!?+/\\|_-]+|[\s.,;:!?+/\\|_-]+$/g, '')
    if (!/\p{L}/u.test(name)) return ''
    if (HEADER.test(name) || GREETING.test(name)) return ''
    if (name.split(' ').length > MAX_WORDS) return ''
    return name
  }

  // One line of plain text can hold several guests: "Emma, Liam and Noah".
  function splitLine(line) {
    const pieces = []
    // "Here is our guest list: Emma, Liam" keeps what follows the label.
    const list = line.slice(line.lastIndexOf(':') + 1)
    for (const segment of list.split(/[,;]/)) {
      const trimmed = segment.trim()
      if (SUFFIX.test(trimmed) && pieces.length) {
        pieces[pieces.length - 1] += ` ${trimmed}`
        continue
      }
      const parts = trimmed.split(/\s+(?:and|&)\s+/i)
      // "We will bring our own cake and candles" is a sentence, not two guests.
      const isSentence = parts.some((part) => part.split(/\s+/).length > MAX_WORDS)
      if (!isSentence) pieces.push(...parts)
    }
    return pieces
  }

  // A spreadsheet row is one guest: first and last name may be separate cells,
  // and phone, email and number cells are not part of the name.
  function rowToName(line) {
    return line
      .split('\t')
      .map((cell) => cell.trim())
      .filter((cell) => cell && !isContact(cell) && !HEADER.test(cell))
      .join(' ')
  }

  /**
   * @param {string} text Pasted from an email, a text file or a spreadsheet.
   * @returns {{names: string[], repeated: string[]}} Names in pasted order, and
   *   the names that appeared more than once (kept once in `names`).
   */
  function parseGuestList(text) {
    const names = []
    const repeated = []
    const seen = new Set()
    const lines = String(text)
      .replace(/[   ]/g, ' ')
      .replace(/[​-‍﻿]/g, '')
      .replace(/[‘’]/g, "'")
      .split(/\r\n|\r|\n/)
    for (const line of lines) {
      const pieces = line.includes('\t') ? [rowToName(line)] : splitLine(line)
      for (const piece of pieces) {
        const name = cleanName(piece)
        if (!name) continue
        const key = nameKey(name)
        if (seen.has(key)) {
          repeated.push(name)
        } else {
          seen.add(key)
          names.push(name)
        }
      }
    }
    return { names, repeated }
  }

  /**
   * Decides what a paste would do to a booking. Nothing is added when the
   * names do not all fit: the guest count is what the party paid for.
   *
   * @param {{names: string[], existing: string[], emptyRows: number}} input
   * @returns {{toAdd: string[], alreadyListed: string[], tooMany: number}}
   *   `tooMany` is how many names have no empty row; above 0, add nothing.
   */
  function planImport({ names, existing, emptyRows }) {
    const listed = new Set(existing.map(nameKey))
    const toAdd = names.filter((name) => !listed.has(nameKey(name)))
    const alreadyListed = names.filter((name) => listed.has(nameKey(name)))
    return {
      toAdd,
      alreadyListed,
      tooMany: Math.max(0, toAdd.length - emptyRows),
    }
  }

  globalThis.maplewoodGuestList = { parseGuestList, planImport, nameKey }
})()
