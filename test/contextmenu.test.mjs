import test from 'node:test'
import assert from 'node:assert/strict'
import { editorMenuTemplate, fileMenuTemplate } from '../src/main/contextmenu.js'

const labels = (t) => t.map((i) => i.label || i.role || (i.type === 'separator' ? '---' : '?'))
const FLAGS = { editFlags: { canCut: true, canCopy: true, canPaste: true } }

test('selected text: "Add note to selection" comes first, then clipboard, then Format', () => {
  const sent = []
  const t = editorMenuTemplate(FLAGS, { send: (n) => sent.push(n) }, { editor: true, selection: true })
  assert.deepEqual(labels(t), ['Add note to selection…', '---', 'cut', 'copy', 'paste', 'selectAll', '---', 'Format'])
  t[0].click()
  const fmt = t.find((i) => i.label === 'Format').submenu
  assert.deepEqual(labels(fmt), ['Bold', 'Italic', 'Strikethrough', '---', 'Heading 1', 'Heading 2', 'Heading 3', 'Quote', 'Bulleted list', 'Scene break'])
  fmt[0].click(); fmt[4].click(); fmt[9].click()
  assert.deepEqual(sent, ['comment', 'bold', 'h1', 'scene'])
})

test('no selection: the note item says "here"', () => {
  const t = editorMenuTemplate(FLAGS, { send() {} }, { editor: true, selection: false })
  assert.equal(t[0].label, 'Add note here…')
})

test('on an existing note: Edit and Delete replace "Add note"', () => {
  const sent = []
  const t = editorMenuTemplate(FLAGS, { send: (a) => sent.push(a) }, { editor: true, note: 3, selection: false })
  assert.deepEqual(labels(t).slice(0, 3), ['Edit note', 'Resolve note', '---'])
  assert.ok(!labels(t).some((l) => String(l).startsWith('Add note')))
  t[0].click()
  t[1].click()
  assert.deepEqual(sent, [{ name: 'note-edit', n: 3 }, { name: 'note-delete', n: 3 }])
})

test('editor menu: shortcuts are shown but not registered (the editor handles the keys)', () => {
  const t = editorMenuTemplate({}, { send() {} }, { editor: true })
  assert.equal(t[0].accelerator, 'Ctrl+Alt+M')
  assert.equal(t[0].registerAccelerator, false)
  const bold = t.find((i) => i.label === 'Format').submenu[0]
  assert.equal(bold.accelerator, 'Ctrl+B')
  assert.equal(bold.registerAccelerator, false)
})

test('spelling suggestions come first and can replace or add to the dictionary', () => {
  const calls = []
  const deps = { send() {}, replaceMisspelling: (w) => calls.push('replace:' + w), addToDictionary: (w) => calls.push('add:' + w) }
  const t = editorMenuTemplate({ misspelledWord: 'wired', dictionarySuggestions: ['weird', 'wire', 'wiry'] }, deps, { editor: true, selection: true })
  assert.deepEqual(labels(t).slice(0, 6), ['weird', 'wire', 'wiry', 'Add to dictionary', '---', 'Add note to selection…'])
  t[0].click()
  t[3].click()
  assert.deepEqual(calls, ['replace:weird', 'add:wired'])
  const none = editorMenuTemplate({ misspelledWord: 'zzqx', dictionarySuggestions: [] }, deps, { editor: true })
  assert.equal(none[0].label, 'No spelling suggestions')
  assert.equal(none[0].enabled, false)
})

test('outside the editor (a text field) there is no note/format section', () => {
  const t = editorMenuTemplate({ editFlags: { canPaste: true } }, { send() {} }, { editor: false })
  assert.deepEqual(labels(t), ['cut', 'copy', 'paste', 'selectAll'])
  assert.equal(t[2].enabled, true)
  assert.equal(t[0].enabled, false)
})

test('navigation pane menus: a heading, and the pane header', () => {
  const sent = []
  const deps = { send: (a) => sent.push(a), reveal: (r) => sent.push('reveal:' + r), copyPath: (r) => sent.push('copy:' + r) }
  // a heading with a position: rename / move / delete the section it heads
  const sec = fileMenuTemplate('chapter', { rel: 'Manuscript.md', pos: 40, fallback: false }, deps)
  assert.deepEqual(labels(sec), ['Go to heading', 'Rename heading', '---', 'Move section up', 'Move section down', 'Delete section…', '---', 'Show file in File Explorer', 'Copy file path'])
  sec[1].click(); sec[3].click(); sec[4].click(); sec[5].click()
  assert.deepEqual(sent.splice(0), [
    { type: 'section', op: 'rename', rel: 'Manuscript.md', pos: 40 },
    { type: 'section', op: 'up', rel: 'Manuscript.md', pos: 40 },
    { type: 'section', op: 'down', rel: 'Manuscript.md', pos: 40 },
    { type: 'section', op: 'delete', rel: 'Manuscript.md', pos: 40 }
  ])
  // a file with no headings has no section to move
  const ch = fileMenuTemplate('chapter', { rel: 'Manuscript/Chapter 01.md', fallback: true, pos: 0 }, deps)
  assert.deepEqual(labels(ch), ['Go to heading', '---', 'Show file in File Explorer', 'Copy file path'])
  ch[0].click(); ch[2].click(); ch[3].click()
  assert.deepEqual(sent, [{ type: 'open', rel: 'Manuscript/Chapter 01.md' }, 'reveal:Manuscript/Chapter 01.md', 'copy:Manuscript/Chapter 01.md'])
  const head = fileMenuTemplate('chapters-header', {}, deps)
  assert.deepEqual(labels(head), ['Add a chapter'])
  head[0].click()
  assert.deepEqual(sent.pop(), { type: 'new-chapter' })
  assert.deepEqual(fileMenuTemplate('note', { rel: 'x.md' }, deps), [], 'notes pages no longer have a sidebar menu')
})

test('a card named under the click gets a Peek item first', () => {
  const sent = []
  const t = editorMenuTemplate(FLAGS, { send: (a) => sent.push(a) }, { editor: true, selection: false, card: { rel: 'Characters/Mo Lan.md', title: 'Mo Lan' } })
  assert.equal(t[0].label, 'Peek at card: Mo Lan')
  t[0].click()
  assert.deepEqual(sent, [{ name: 'card-peek', rel: 'Characters/Mo Lan.md' }])
})
