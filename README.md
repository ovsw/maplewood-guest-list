# Maplewood guest list paste

A Chrome extension for the Maplewood staff. It adds a **Paste guest list** box
to a booking in the Aluvii employee portal (More > Guest List), so a guest list
sent by email or in a spreadsheet does not have to be typed name by name.

Background:
[maplewoodyearround.com-2026#138](https://github.com/ovsw/maplewoodyearround.com-2026/issues/138).

## What it does

1. Staff paste the list as it arrived: one name per line, names separated by
   commas, a numbered list, or cells copied from Excel.
2. The box shows the names it found and how many empty rows the booking has.
3. **Add guests** puts each name into the next empty row, one at a time, the
   same way typing it does. Aluvii saves each name itself.

Rules:

- More names than empty rows is an error and nothing is added. The guest count
  is what the party paid for, so staff remove names or raise the count first.
- A name already on the booking is left out. A name pasted twice is added once.
- A row that holds a name is never changed.
- A row is empty when its name is blank. That includes a guest whose name was
  typed and then deleted: Aluvii keeps a nameless guest, and the box reuses it.
- Phone numbers, emails, ages and notes in brackets are dropped; only the name
  is entered.
- If Aluvii fails to save a name, the run stops and the names not yet added
  stay in the box.

The box cannot tell "Smith, John" from two guests, or an email signature from
a name. Staff read the preview before pressing **Add guests**.

## Install

Download
[maplewood-guest-list.zip](https://github.com/ovsw/maplewood-guest-list/releases/latest/download/maplewood-guest-list.zip)
and unzip it. In Chrome, open `chrome://extensions`, turn on **Developer
mode**, choose **Load unpacked** and pick the unzipped folder. Keep the folder:
Chrome reads the extension from it.

To run it from this repository, pick the `extension/` folder. After a code
change, press the reload icon on the extension's card and reload the booking.

## How it works

- `extension/parse.js` turns pasted text into names and decides whether they
  fit. It has no DOM code.
- `extension/content.js` runs on `maplewoodyearround.aluvii.com` booking pages.
  Aluvii saves a guest when the name field loses focus, then redraws the table.
  The script fills the first empty row, sends that event and waits for the
  redraw before the next name. It makes no request of its own.
- The extension asks for no permissions and stores nothing.

## Tests

```sh
npm install
npx playwright install chromium   # once
npm test                          # parse.js
npm run test:e2e                  # the paste box, in Chromium
```

`test:e2e` drives the box against `test/fixture.html`, a stand-in for the
Aluvii page with made-up guests. It blocks all network requests. Never test
against a live booking: ask the Maplewood staff for a test booking.

## Release

Set the new version in `extension/manifest.json` and `package.json`, then:

```sh
npm run zip
gh release create v<version> maplewood-guest-list.zip --title v<version> --notes "<what changed>"
```

The install link above always serves the newest release.
