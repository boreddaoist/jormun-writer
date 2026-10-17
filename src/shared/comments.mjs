// Inline notes (Word calls them comments), stored in the Markdown itself using CriticMarkup:
//
//     {==the passage being discussed==}{>>the note<<}      note on a passage
//     {>>a note with no passage<<}                          loose note
//
// Because they live in the file, an AI can leave notes for the author and read the author's.
//
// A note is a conversation. Its messages sit on one line, separated by " ↳ ". A message that starts with
// "AI:" is the AI's; any other message is the author's:
//
//     {==her hair==}{>>AI: black here, brown in chapter 2? ↳ typo, it is black everywhere ↳ AI: ok, noted<<}
//
// The colour follows who started the note: the author's notes are blue, the AI's are purple. (Old notes may carry
// a [green]-style colour tag; it is ignored.) Notes are one line each; line breaks inside a message become spaces.

import { stripIdeas } from './ideas.mjs'

export const THREAD_SEP = ' ↳ '
export const AUTHOR_COLOR = 'blue' // the Jormun ocean blue, same as the app's accent
export const AI_COLOR = 'purple'

const RE = /\{==([^\n]*?)==\}\{>>([^\n]*?)<<\}|\{>>([^\n]*?)<<\}/g
const HEAD = /^\s*(?:(AI:)\s*)?(?:\[(?:yellow|green|blue|pink|purple|orange)\]\s*)?(?:(AI:)\s*)?/i

export const noteColor = (author) => (author === 'AI' ? AI_COLOR : AUTHOR_COLOR)

// The messages of a note: [{ author: 'AI' | '', text }], oldest first.
export function parseMessages(raw) {
  const out = raw.split(/\s*↳\s*/).map((seg) => {
    const m = HEAD.exec(seg)
    return { author: m[1] || m[2] ? 'AI' : '', text: seg.slice(m[0].length).trim() }
  })
  return out.filter((m, i) => m.text || i === 0)
}

// The first message, plus the whole thread.
export function parseCommentText(raw) {
  const messages = parseMessages(raw)
  const first = messages[0]
  return { text: first.text, author: first.author, color: noteColor(first.author), messages }
}

const clean = (s) => s.replace(/\s*\n\s*/g, ' ').replace(/<<\}/g, '<< }').replace(/↳/g, '→').trim()

export function composeThread(messages) {
  return messages.map((m) => (m.author === 'AI' ? 'AI: ' : '') + clean(m.text)).join(THREAD_SEP)
}

export function parseComments(body) {
  const out = []
  RE.lastIndex = 0
  let m
  while ((m = RE.exec(body))) {
    const hasAnchor = m[1] !== undefined
    const raw = hasAnchor ? m[2] : m[3]
    const p = parseCommentText(raw)
    out.push({
      n: out.length + 1,
      from: m.index,
      to: m.index + m[0].length,
      anchor: hasAnchor ? m[1] : '',
      anchorFrom: hasAnchor ? m.index + 3 : -1,
      anchorTo: hasAnchor ? m.index + 3 + m[1].length : -1,
      raw,
      text: p.text,
      author: p.author,
      color: p.color,
      messages: p.messages
    })
  }
  return out
}

// Where a conversation stands. `waiting` = the AI spoke last, so it is waiting for the author.
//   started: 'AI' | 'you'     who wrote the first message
//   last:    'AI' | 'you'     who wrote the last message
export function threadStatus(c) {
  const msgs = c.messages && c.messages.length ? c.messages : [{ author: c.author }]
  const started = msgs[0].author === 'AI' ? 'AI' : 'you'
  const last = msgs[msgs.length - 1].author === 'AI' ? 'AI' : 'you'
  return { started, last, waiting: last === 'AI', replies: msgs.length - 1 }
}

export function stripComments(text) {
  return stripIdeas(text).replace(/\{==([^\n]*?)==\}\{>>[^\n]*?<<\}/g, '$1').replace(/\{>>[^\n]*?<<\}/g, '')
}

// Edits below follow the same shape as format.mjs: { from, to, insert, selStart, selEnd }.

const wrap = (c, raw) => (c.anchor ? `{==${c.anchor}==}{>>${raw}<<}` : `{>>${raw}<<}`)

export function addComment(body, from, to, text, author = '') {
  const t = composeThread([{ author, text }])
  if (from < to) {
    const sel = body.slice(from, to).replace(/==\}|\{==/g, '')
    const insert = `{==${sel}==}{>>${t}<<}`
    return { from, to, insert, selStart: from + insert.length, selEnd: from + insert.length }
  }
  const insert = `{>>${t}<<}`
  return { from, to: from, insert, selStart: from + insert.length, selEnd: from + insert.length }
}

// Resolving (or deleting) removes the marker and keeps the passage text.
export function resolveComment(c) {
  return { from: c.from, to: c.to, insert: c.anchor, selStart: c.from, selEnd: c.from + c.anchor.length }
}

// Answer a note: appends a message to its thread.
export function addReply(c, text, author = '') {
  const insert = wrap(c, composeThread([...c.messages, { author, text }]))
  return { from: c.from, to: c.to, insert, selStart: c.from + insert.length, selEnd: c.from + insert.length }
}

// Change the text of one message in the thread (the first one by default); who wrote it is kept.
export function editComment(c, text, index = 0) {
  const messages = c.messages.map((m, i) => (i === index ? { ...m, text } : m))
  const insert = wrap(c, composeThread(messages))
  return { from: c.from, to: c.to, insert, selStart: c.from + insert.length, selEnd: c.from + insert.length }
}
