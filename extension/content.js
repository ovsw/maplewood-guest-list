// Adds a "Paste guest list" box above the guest list of an Aluvii booking
// (More > Guest List). Each pasted name goes into the next empty row the same
// way a person types it: fill the field, leave it, let Aluvii save and redraw.
(() => {
  const { parseGuestList, planImport } = globalThis.maplewoodGuestList
  const TABLE_ID = 'GuestList-Table'
  const BOX_ID = 'mw-guest-paste'
  const SAVE_TIMEOUT_MS = 20_000
  const GUEST_NAME = 'input[id^="guest_Name_"]'
  const ANY_NAME = `${GUEST_NAME}, input[id^="guest_Group_Name_"]`

  if (!/^\/employee\/events\//i.test(location.pathname)) return

  const getTable = () => document.getElementById(TABLE_ID)

  // A row is empty when its name is blank. That covers the rows Aluvii has not
  // saved yet and the guests whose name was typed and then deleted: Aluvii
  // keeps those as nameless guests, and typing a name into one renames it.
  const emptyInputs = (table) =>
    [...table.querySelectorAll(GUEST_NAME)].filter((input) => !input.value.trim())

  const namedCount = (table) =>
    table.querySelectorAll(GUEST_NAME).length - emptyInputs(table).length

  const existingNames = (table) =>
    [...table.querySelectorAll(ANY_NAME)].map((input) => input.value).filter((v) => v.trim())

  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

  // Resolves once Aluvii has redrawn the table with one more named guest.
  // The redraw replaces every row, so the field that was typed into is gone;
  // until then the typed name is only on screen, not saved.
  function waitForSavedGuest(table, input, countBefore) {
    return new Promise((resolve, reject) => {
      const finish = (error) => {
        observer.disconnect()
        clearTimeout(timer)
        if (error) reject(error)
        else resolve()
      }
      const observer = new MutationObserver(() => {
        if (!table.isConnected) return finish(new Error('The guest list was closed.'))
        if (input.isConnected) return
        if (namedCount(table) > countBefore) finish()
        else finish(new Error('Aluvii did not save the name.'))
      })
      const timer = setTimeout(
        () => finish(new Error('Aluvii did not save the name.')),
        SAVE_TIMEOUT_MS,
      )
      observer.observe(document.body, { childList: true, subtree: true })
    })
  }

  async function addGuest(name) {
    const table = getTable()
    if (!table) throw new Error('The guest list was closed.')
    const input = emptyInputs(table)[0]
    if (!input) throw new Error('There is no empty row left.')
    const saved = waitForSavedGuest(table, input, namedCount(table))
    input.value = name
    // Aluvii saves a guest when the name field loses focus.
    input.dispatchEvent(new FocusEvent('blur'))
    await saved
  }

  function el(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text) node.textContent = text
    return node
  }

  function buildBox() {
    const box = el('div')
    box.id = BOX_ID
    const open = el('button', 'mw-button', 'Paste guest list')
    open.type = 'button'
    const panel = el('div', 'mw-panel')
    panel.hidden = true
    const label = el('label', 'mw-label', 'Paste the names from an email, a text file or Excel')
    const textarea = el('textarea', 'form-control mw-text')
    textarea.id = `${BOX_ID}-text`
    textarea.rows = 8
    textarea.placeholder = 'One name per line, or separated by commas'
    label.htmlFor = textarea.id
    const status = el('p', 'mw-status')
    status.setAttribute('role', 'status')
    const preview = el('ol', 'mw-preview')
    const add = el('button', 'mw-button', 'Add guests')
    add.type = 'button'
    add.disabled = true
    panel.append(label, textarea, status, preview, add)
    box.append(open, panel)

    let running = false

    const say = (text, isError = false) => {
      status.textContent = text
      status.classList.toggle('mw-error', isError)
    }

    function refresh() {
      const table = getTable()
      if (running || !table) return
      const { names, repeated } = parseGuestList(textarea.value)
      const emptyRows = emptyInputs(table).length
      const plan = planImport({ names, existing: existingNames(table), emptyRows })
      preview.replaceChildren(...plan.toAdd.map((name) => el('li', '', name)))
      add.textContent = plan.toAdd.length ? `Add ${plural(plan.toAdd.length, 'guest')}` : 'Add guests'
      add.disabled = !plan.toAdd.length || plan.tooMany > 0

      if (!textarea.value.trim()) return say(`${plural(emptyRows, 'empty row')} on this booking.`)
      if (plan.tooMany > 0) {
        return say(
          `Too many names: the list has ${plan.toAdd.length} and this booking has ` +
            `${plural(emptyRows, 'empty row')}. Nothing was added. Remove ` +
            `${plural(plan.tooMany, 'name')} or raise the guest count first.`,
          true,
        )
      }
      const notes = [`${plural(plan.toAdd.length, 'name')} to add, ${plural(emptyRows, 'empty row')}.`]
      if (plan.alreadyListed.length) {
        notes.push(`Already on the list, left out: ${plan.alreadyListed.join(', ')}.`)
      }
      if (repeated.length) notes.push(`Pasted twice, added once: ${repeated.join(', ')}.`)
      say(notes.join(' '))
    }

    async function run() {
      const table = getTable()
      if (!table || running) return
      const plan = planImport({
        names: parseGuestList(textarea.value).names,
        existing: existingNames(table),
        emptyRows: emptyInputs(table).length,
      })
      if (!plan.toAdd.length || plan.tooMany > 0) return refresh()

      running = true
      add.disabled = true
      textarea.disabled = true
      let added = 0
      let failure = null
      for (const name of plan.toAdd) {
        say(`Adding ${added + 1} of ${plan.toAdd.length}: ${name}`)
        try {
          await addGuest(name)
          added += 1
        } catch (error) {
          failure = error
          break
        }
      }
      running = false
      textarea.disabled = false
      // What is left in the box is what still has to be added.
      textarea.value = plan.toAdd.slice(added).join('\n')
      refresh()
      if (failure) {
        say(
          `Stopped at "${plan.toAdd[added]}": ${failure.message} ` +
            `${plural(added, 'guest')} added, ${plan.toAdd.length - added} not added ` +
            `(still in the box). Check the list, then try again.`,
          true,
        )
      } else {
        say(`Added ${plural(added, 'guest')}.`)
      }
    }

    open.addEventListener('click', () => {
      panel.hidden = !panel.hidden
      if (!panel.hidden) {
        refresh()
        textarea.focus()
      }
    })
    textarea.addEventListener('input', refresh)
    add.addEventListener('click', run)
    return box
  }

  // Aluvii loads the guest list into the page only when its tab is opened, and
  // again each time it is reopened, so keep watching for the table.
  function mount() {
    const table = getTable()
    if (table && !document.getElementById(BOX_ID)) table.before(buildBox())
  }

  new MutationObserver(mount).observe(document.body, { childList: true, subtree: true })
  mount()
})()
