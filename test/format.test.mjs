import test from 'node:test'
import assert from 'node:assert/strict'
import { toggleWrap, toggleLinePrefix, sceneBreak, bold, italic, strike, h1, h2, quote, bullet, applyEdit } from '../src/shared/format.mjs'
import { render, inline } from '../src/shared/md.mjs'

const run = (text, s, e, fn) => {
  const r = fn(text, s, e)
  return { text: applyEdit(text, r), sel: [r.selStart, r.selEnd] }
}

test('bold wraps the selection and unwraps it again', () => {
  let r = run('make this loud', 5, 9, bold)
  assert.equal(r.text, 'make **this** loud')
  assert.equal('make **this** loud'.slice(...r.sel), 'this')
  // select just the word again -> unwrap (marks outside the selection)
  r = run(r.text, r.sel[0], r.sel[1], bold)
  assert.equal(r.text, 'make this loud')
  // select including the marks -> unwrap (marks inside the selection)
  assert.equal(run('make **this** loud', 5, 13, bold).text, 'make this loud')
})

test('caret in a word formats the word; caret in empty space inserts a pair', () => {
  assert.equal(run('hello world', 2, 2, italic).text, '*hello* world')
  const r = run('hello ', 6, 6, bold)
  assert.equal(r.text, 'hello ****')
  assert.deepEqual(r.sel, [8, 8])
})

test('italic inside bold does not strip the bold', () => {
  const t = 'a **word** b'
  const r = run(t, 4, 8, italic)
  assert.equal(r.text, 'a ***word*** b')
})

test('strikethrough toggles', () => {
  assert.equal(run('gone', 0, 4, strike).text, '~~gone~~')
  assert.equal(run('~~gone~~', 2, 6, strike).text, 'gone')
})

test('headings replace each other and toggle off', () => {
  assert.equal(run('Title', 0, 5, h1).text, '# Title')
  assert.equal(run('# Title', 3, 3, h2).text, '## Title')
  assert.equal(run('## Title', 4, 4, h2).text, 'Title')
  assert.equal(run('# Title', 0, 7, h1).text, 'Title')
})

test('quote and bullet apply to every selected line, and toggle off', () => {
  const t = 'one\ntwo\nthree'
  const q = run(t, 0, 7, quote)
  assert.equal(q.text, '> one\n> two\nthree')
  assert.equal(run(q.text, 0, q.sel[1], quote).text, 'one\ntwo\nthree')
  assert.equal(run('a\nb', 0, 3, bullet).text, '- a\n- b')
})

test('selection ending at the start of the next line does not touch that line', () => {
  assert.equal(run('one\ntwo', 0, 4, quote).text, '> one\ntwo')
})

test('caret stays on its line after a prefix toggle', () => {
  const r = run('hello', 5, 5, bullet)
  assert.equal(r.text, '- hello')
  assert.deepEqual(r.sel, [7, 7])
})

test('scene break gets blank lines around it', () => {
  assert.equal(run('end of scene.', 13, 13, sceneBreak).text, 'end of scene.\n\n* * *\n\n')
  assert.equal(run('a\n\nb', 1, 1, sceneBreak).text, 'a\n\n* * *\n\n\nb'.replace('\n\n\nb', '\n\nb'))
})

test('reader escapes HTML and renders the basics', () => {
  assert.equal(inline('<b>x</b> & **bold** and *it*'), '&lt;b&gt;x&lt;/b&gt; &amp; <strong>bold</strong> and <em>it</em>')
  const html = render('# T\nfirst\nsecond\n\n* * *\n> q\n- a\n- b')
  assert.ok(html.includes('<h1>T</h1>'))
  assert.ok(html.includes('<p>first</p>\n<p>second</p>'), 'one Enter = one paragraph')
  assert.ok(html.includes('<hr>'))
  assert.ok(html.includes('<blockquote>q</blockquote>'))
  assert.ok(html.includes('<ul>\n<li>a</li>\n<li>b</li>\n</ul>'))
})

test('reader never emits script or links', () => {
  const html = render('[x](javascript:alert(1)) <script>alert(1)</script> <img src=x onerror=alert(1)>')
  assert.ok(!html.includes('<script'))
  assert.ok(!html.includes('<img'))
  assert.ok(!html.includes('<a '))
})

test('selected whitespace and line breaks are left outside the marks', () => {
  assert.equal(run('\nhello there\n', 0, 13, bold).text, '\n**hello there**\n')
  assert.equal(run('a  b', 1, 3, bold).text, 'a  b', 'selecting only spaces changes nothing')
})

import { h3 } from '../src/shared/format.mjs'
test('heading 3 toggles and replaces other levels', () => {
  assert.equal(applyEdit('Title', h3('Title', 0, 5)), '### Title')
  assert.equal(applyEdit('## Title', h3('## Title', 3, 3)), '### Title')
  assert.equal(applyEdit('### Title', h3('### Title', 4, 4)), 'Title')
})

// ---- bold + italic share the asterisk ----
test('italic on bold text gives ***x***, and each can be switched off separately', () => {
  let t = run('a brave b', 2, 7, bold).text
  assert.equal(t, 'a **brave** b')
  t = run(t, 4, 9, italic).text
  assert.equal(t, 'a ***brave*** b')
  t = run(t, 5, 10, italic).text
  assert.equal(t, 'a **brave** b')
  t = run(t, 4, 9, italic).text
  assert.equal(t, 'a ***brave*** b')
  t = run(t, 5, 10, bold).text
  assert.equal(t, 'a *brave* b')
  t = run(t, 3, 8, italic).text
  assert.equal(t, 'a brave b')
})

test('a block format replaces another one on the same line instead of stacking', () => {
  let t = run('Line', 2, 2, quote).text
  t = run(t, 3, 3, bullet).text
  assert.equal(t, '- Line')
  t = run(t, 3, 3, h2).text
  assert.equal(t, '## Line')
})

test('pressing a format button with the caret before the closing mark steps out of the format', () => {
  // **word|** : caret after "word", before the closing **
  const r = run('say **word** now', 10, 10, bold)
  assert.equal(r.text, 'say **word** now', 'nothing is un-bolded')
  assert.deepEqual(r.sel, [12, 12], 'the caret moves past the closing mark')
  // caret in the middle of the word still toggles the word
  assert.equal(run('say **word** now', 7, 7, bold).text, 'say word now')
  // *it|* and ~~gone|~~
  assert.deepEqual(run('a *it* b', 5, 5, italic).sel, [6, 6])
  assert.deepEqual(run('a ~~gone~~ b', 8, 8, strike).sel, [10, 10])
})

import { setFrontTitle, parseFront } from '../src/shared/text.mjs'
test('setFrontTitle adds, replaces and removes the title in the frontmatter', () => {
  assert.equal(setFrontTitle('', 'The Break-in'), '---\ntitle: The Break-in\n---\n')
  assert.equal(parseFront(setFrontTitle('---\nstatus: draft\n---\n', 'New')).title, 'New')
  assert.equal(setFrontTitle('---\nstatus: draft\n---\n', 'New'), '---\ntitle: New\nstatus: draft\n---\n')
  assert.equal(setFrontTitle('---\ntitle: Old\nstatus: draft\n---\n', 'Fresh'), '---\ntitle: Fresh\nstatus: draft\n---\n')
  assert.equal(setFrontTitle('---\ntitle: Old\n---\n', ''), '', 'an empty title with nothing else removes the block')
  assert.equal(parseFront(setFrontTitle('', 'Part 2: The Shop')).title, 'Part 2: The Shop')
})
