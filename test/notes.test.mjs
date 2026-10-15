import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseCommentText, composeCommentText, parseComments, addComment, editComment, setCommentColor, resolveComment,
  NOTE_COLORS, DEFAULT_COLOR
} from '../src/shared/comments.mjs'
import { applyEdit } from '../src/shared/format.mjs'
import { render } from '../src/shared/md.mjs'
import { buildDocx } from '../src/main/exporter.js'
import JSZip from 'jszip'

test('the default note colour is blue (the Jormun accent)', () => {
  assert.equal(DEFAULT_COLOR, 'blue')
  assert.equal(NOTE_COLORS[0], 'blue')
  assert.equal(NOTE_COLORS.length, 6)
})

test('note text tags: colour and AI, in either order, are split from the visible text', () => {
  assert.deepEqual(parseCommentText('plain'), { text: 'plain', author: '', color: 'blue' })
  assert.deepEqual(parseCommentText('[green] check this'), { text: 'check this', author: '', color: 'green' })
  assert.deepEqual(parseCommentText('AI: why?'), { text: 'why?', author: 'AI', color: 'blue' })
  assert.deepEqual(parseCommentText('AI: [orange] why?'), { text: 'why?', author: 'AI', color: 'orange' })
  assert.deepEqual(parseCommentText('AI: [blue] why?'), { text: 'why?', author: 'AI', color: 'blue' }, 'an explicit [blue] still works')
  assert.deepEqual(parseCommentText('[Pink] AI: why?'), { text: 'why?', author: 'AI', color: 'pink' })
  assert.deepEqual(parseCommentText('[purple]no space'), { text: 'no space', author: '', color: 'purple' })
  assert.equal(parseCommentText('[nonsense] stays text').text, '[nonsense] stays text')
  assert.equal(parseCommentText('mention [green] later').text, 'mention [green] later', 'tags only count at the start')
})

test('compose is the inverse of parse; the default colour is written as no tag', () => {
  for (const c of NOTE_COLORS) {
    const raw = composeCommentText({ text: 'hello', author: 'AI', color: c })
    assert.deepEqual(parseCommentText(raw), { text: 'hello', author: 'AI', color: c })
  }
  assert.equal(composeCommentText({ text: 'x', color: 'blue' }), 'x')
  assert.equal(composeCommentText({ text: 'x', color: 'yellow' }), '[yellow] x')
  assert.equal(composeCommentText({ text: 'x', color: 'green' }), '[green] x')
  assert.equal(composeCommentText({ text: 'x', author: 'AI', color: 'green' }), 'AI: [green] x')
})

test('adding a coloured note writes the tag; parseComments reads it back', () => {
  const t = 'The girl screamed.'
  const body = applyEdit(t, addComment(t, 4, 8, 'which girl?', 'green'))
  assert.equal(body, 'The {==girl==}{>>[green] which girl?<<} screamed.')
  const [c] = parseComments(body)
  assert.equal(c.color, 'green')
  assert.equal(c.text, 'which girl?')
  assert.equal(applyEdit(t, addComment(t, 4, 8, 'plain')), 'The {==girl==}{>>plain<<} screamed.')
})

test('changing colour keeps the text and the AI tag; editing text keeps the colour', () => {
  const body = 'a {==b==}{>>AI: [green] check<<} c'
  const [c] = parseComments(body)
  assert.equal(applyEdit(body, setCommentColor(c, 'pink')), 'a {==b==}{>>AI: [pink] check<<} c')
  assert.equal(applyEdit(body, setCommentColor(c, 'blue')), 'a {==b==}{>>AI: check<<} c', 'back to the default removes the tag')
  assert.equal(applyEdit(body, editComment(c, 'new words')), 'a {==b==}{>>AI: [green] new words<<} c')
  assert.equal(applyEdit(body, resolveComment(c)), 'a b c')
})

test('Manuscript view HTML carries the colour class and hides the tags', () => {
  const h = render('x {==y==}{>>AI: [green] why<<}')
  assert.ok(h.includes('class="hl c-green"'))
  assert.ok(h.includes('class="cmk c-green"'))
  assert.ok(h.includes('title="why"'))
})

test('Word export: note text has no tags, AI author is kept', async () => {
  const buf = await buildDocx({
    title: 'T', author: 'Jun', includeComments: true, titlePage: false,
    chapters: [{ title: 'C', text: 'a {==b==}{>>AI: [blue] check the hair<<} c {>>[green] mine<<}' }]
  })
  const z = await JSZip.loadAsync(buf)
  const xml = await z.file('word/comments.xml').async('string')
  const texts = (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((s) => s.replace(/<[^>]+>/g, ''))
  assert.deepEqual(texts, ['check the hair', 'mine'])
  assert.ok(xml.includes('w:author="AI"') && xml.includes('w:author="Jun"'))
})
