// Inline notes (Word calls them comments), stored in the Markdown itself using CriticMarkup:
//
//     {==the passage being discussed==}{>>the note<<}      note on a passage
//     {>>a note with no passage<<}                          loose note
//
// Because they live in the file, an AI can leave notes for the author and read the author's.
// The note text may start with two optional tags, in either order:
//     AI:        marks the note as the AI's        {>>AI: does the dog exist yet?<<}
//     [green]    a colour (blue is the default)  {>>[green] check the timeline<<}
//     both:      {>>AI: [blue] her hair is black here<<}
// Notes are one line each; line breaks inside a note are turned into spaces.

export const NOTE_COLORS = ['blue', 'green', 'yellow', 'orange', 'pink', 'purple']
export const DEFAULT_COLOR = 'blue' // the Jormun ocean blue, so an untagged note matches the app's accent

const RE = /\{==([^\n]*?)==\}\{>>([^\n]*?)<<\}|\{>>([^\n]*?)<<\}/g
const HEAD = /^\s*(?:(AI:)\s*)?(?:\[(yellow|green|blue|pink|purple|orange)\]\s*)?(?:(AI:)\s*)?/i

// Split a note's raw text into its tags and the visible text.
export function parseCommentText(raw) {
  const m = HEAD.exec(raw)
  return {
    text: raw.slice(m[0].length),
    author: m[1] || m[3] ? 'AI' : '',
    color: m[2] ? m[2].toLowerCase() : DEFAULT_COLOR
  }
}

// The inverse: build the raw text from its parts. Yellow is the default, so it is written as no tag.
export function composeCommentText({ text, author = '', color = DEFAULT_COLOR }) {
  const tag = color && color !== DEFAULT_COLOR && NOTE_COLORS.includes(color) ? `[${color}] ` : ''
  return (author === 'AI' ? 'AI: ' : '') + tag + text
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
      color: p.color
    })
  }
  return out
}

export function stripComments(text) {
  return text.replace(/\{==([^\n]*?)==\}\{>>[^\n]*?<<\}/g, '$1').replace(/\{>>[^\n]*?<<\}/g, '')
}

const clean = (s) => s.replace(/\s*\n\s*/g, ' ').replace(/<<\}/g, '<< }').trim()

// Edits below follow the same shape as format.mjs: { from, to, insert, selStart, selEnd }.

export function addComment(body, from, to, text, color = DEFAULT_COLOR) {
  const t = composeCommentText({ text: clean(text), color })
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

// Change the text and/or the colour of a note; its author tag is kept.
export function editComment(c, text, color) {
  const t = composeCommentText({ text: clean(text), author: c.author, color: color === undefined ? c.color : color })
  const insert = c.anchor ? `{==${c.anchor}==}{>>${t}<<}` : `{>>${t}<<}`
  return { from: c.from, to: c.to, insert, selStart: c.from + insert.length, selEnd: c.from + insert.length }
}

export const setCommentColor = (c, color) => editComment(c, c.text, color)
