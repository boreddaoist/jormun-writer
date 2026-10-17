import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseCommentText, parseMessages, composeThread, parseComments, addComment, addReply, editComment, resolveComment,
  noteColor, THREAD_SEP
} from '../src/shared/comments.mjs'
import { applyEdit } from '../src/shared/format.mjs'
import { render } from '../src/shared/md.mjs'
import { buildDocx } from '../src/main/exporter.js'
import JSZip from 'jszip'

test('two voices: the author is blue, the AI is purple', () => {
  assert.equal(noteColor(''), 'blue')
  assert.equal(noteColor('AI'), 'purple')
})

test('a note is a thread: messages split on the arrow, AI: marks the AI, the rest is the author', () => {
  assert.deepEqual(parseMessages('plain'), [{ author: '', text: 'plain' }])
  assert.deepEqual(parseMessages('AI: why?'), [{ author: 'AI', text: 'why?' }])
  assert.deepEqual(parseMessages('AI: black here? ↳ it is black everywhere ↳ AI: ok, noted'), [
    { author: 'AI', text: 'black here?' },
    { author: '', text: 'it is black everywhere' },
    { author: 'AI', text: 'ok, noted' }
  ])
  assert.equal(parseMessages('a ↳ ↳ b').length, 2, 'an empty reply is dropped')
  assert.equal(parseMessages('mention AI: later').length, 1)
  assert.equal(parseMessages('mention AI: later')[0].author, '', 'AI: only counts at the start of a message')
})

test('old colour tags are ignored: the visible text is clean and the colour follows the author', () => {
  assert.deepEqual(parseCommentText('[green] check this').text, 'check this')
  assert.equal(parseCommentText('[green] check this').color, 'blue')
  const ai = parseCommentText('AI: [orange] why?')
  assert.equal(ai.text, 'why?')
  assert.equal(ai.author, 'AI')
  assert.equal(ai.color, 'purple')
  assert.equal(parseCommentText('[nonsense] stays text').text, '[nonsense] stays text')
})

test('compose is the inverse of parse and writes the arrow between messages', () => {
  const msgs = [{ author: 'AI', text: 'q?' }, { author: '', text: 'a' }]
  const raw = composeThread(msgs)
  assert.equal(raw, 'AI: q? ↳ a')
  assert.deepEqual(parseMessages(raw), msgs)
  assert.equal(composeThread([{ author: '', text: 'x ↳ y' }]), 'x → y', 'an arrow typed inside a message cannot split the thread')
  assert.equal(THREAD_SEP, ' ↳ ')
})

test('add a note, reply to it, edit one message, resolve', () => {
  const t = 'The girl screamed.'
  let body = applyEdit(t, addComment(t, 4, 8, 'which girl?', 'AI'))
  assert.equal(body, 'The {==girl==}{>>AI: which girl?<<} screamed.')
  let [c] = parseComments(body)
  assert.equal(c.author, 'AI')
  assert.equal(c.color, 'purple')
  assert.equal(c.messages.length, 1)

  body = applyEdit(body, addReply(c, 'Jinx, the raven one'))
  assert.equal(body, 'The {==girl==}{>>AI: which girl? ↳ Jinx, the raven one<<} screamed.')
  ;[c] = parseComments(body)
  assert.equal(c.messages.length, 2)
  assert.equal(c.author, 'AI', 'the thread keeps the colour of who started it')

  body = applyEdit(body, addReply(c, 'thanks, clear now', 'AI'))
  ;[c] = parseComments(body)
  assert.equal(c.messages.map((m) => m.author).join(','), 'AI,,AI')

  const edited = applyEdit(body, editComment(c, 'Jinx, the one with the sack', 1))
  assert.ok(edited.includes('AI: which girl? ↳ Jinx, the one with the sack ↳ AI: thanks, clear now'))
  assert.equal(applyEdit(body, resolveComment(c)), 'The girl screamed.', 'resolving removes the whole thread and keeps the text')
  assert.equal(applyEdit(t, addComment(t, 4, 8, 'plain')), 'The {==girl==}{>>plain<<} screamed.')
})

test('Manuscript view HTML uses the starter colour and shows the first message', () => {
  const h = render('x {==y==}{>>AI: why ↳ because<<}')
  assert.ok(h.includes('class="hl c-purple"'))
  assert.ok(h.includes('class="cmk c-purple"'))
  assert.ok(h.includes('title="why"'))
})

test('Word export: the first message is the comment, replies follow with who said them', async () => {
  const buf = await buildDocx({
    title: 'T', author: 'Jun', includeComments: true, titlePage: false,
    chapters: [{ title: 'C', text: 'a {==b==}{>>AI: check the hair ↳ it is black ↳ AI: ok<<} c {>>mine<<}' }]
  })
  const z = await JSZip.loadAsync(buf)
  const xml = await z.file('word/comments.xml').async('string')
  const texts = (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((s) => s.replace(/<[^>]+>/g, ''))
  assert.deepEqual(texts, ['check the hair', 'Jun: it is black', 'AI: ok', 'mine'])
  assert.ok(xml.includes('w:author="AI"') && xml.includes('w:author="Jun"'))
})

import { threadStatus } from '../src/shared/comments.mjs'
test('thread status says who spoke first and whether the AI is waiting for the author', () => {
  const st = (raw) => threadStatus(parseComments('x {>>' + raw + '<<} y')[0])
  assert.deepEqual(st('AI: why?'), { started: 'AI', last: 'AI', waiting: true, replies: 0 })
  assert.deepEqual(st('AI: why? \u21b3 because'), { started: 'AI', last: 'you', waiting: false, replies: 1 })
  assert.deepEqual(st('mine'), { started: 'you', last: 'you', waiting: false, replies: 0 })
  assert.deepEqual(st('mine \u21b3 AI: ok'), { started: 'you', last: 'AI', waiting: true, replies: 1 })
})
