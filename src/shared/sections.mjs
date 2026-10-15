// Chapters as sections of one manuscript file: a chapter is a "# Heading" and everything under it.
// All functions work on the document body (without frontmatter) and return edits in the shape the editor
// applies: { from, to, insert, selStart, selEnd }. Positions are character offsets in `body`.
import { extractHeadings } from './outline.mjs'
import { splitFront, parseFront, baseName } from './text.mjs'

const trailing = (s) => /\s*$/.exec(s)[0]

// [from, to) of heading i and everything under it, up to the next heading of the same or a higher level.
export function sectionRange(body, hs, i) {
  const h = hs[i]
  let to = body.length
  for (let k = i + 1; k < hs.length; k++) {
    if (hs[k].level <= h.level) { to = hs[k].pos; break }
  }
  return { from: h.pos, to }
}

export function deleteSection(body, hs, i) {
  const { from, to } = sectionRange(body, hs, i)
  return { from, to, insert: '', selStart: from, selEnd: from }
}

// Swap a section with the neighbouring section of the same level inside the same parent. null when it can't move.
export function moveSection(body, hs, i, dir) {
  const level = hs[i].level
  let other = -1
  if (dir === 'up') {
    for (let k = i - 1; k >= 0; k--) {
      if (hs[k].level < level) break
      if (hs[k].level === level) { other = k; break }
    }
  } else {
    const me = sectionRange(body, hs, i)
    for (let k = i + 1; k < hs.length; k++) {
      if (hs[k].pos < me.to) continue
      if (hs[k].level < level) break
      if (hs[k].level === level) { other = k; break }
    }
  }
  if (other === -1) return null
  const [a, b] = dir === 'up' ? [other, i] : [i, other] // a comes first in the document
  const ra = sectionRange(body, hs, a)
  const rb = sectionRange(body, hs, b)
  const ta = body.slice(ra.from, ra.to)
  const tb = body.slice(rb.from, rb.to)
  const swapped = tb.trimEnd() + (trailing(ta) || '\n\n') + ta.trimEnd() + trailing(tb)
  const movedStart = dir === 'up' ? ra.from : ra.from + tb.trimEnd().length + (trailing(ta) || '\n\n').length
  return { from: ra.from, to: rb.to, insert: swapped, selStart: movedStart, selEnd: movedStart }
}

// The editable text of a heading line (after the "## "), for "Rename heading".
export function headingTextRange(body, h) {
  const prefix = /^#{1,3}\s+/.exec(body.slice(h.pos, h.end))
  const from = h.pos + (prefix ? prefix[0].length : 0)
  return { from, to: h.end }
}

// Appends "# Chapter N" (N = number of chapters so far + 1) at the end and puts the caret under it.
export function addChapter(body) {
  const n = extractHeadings(body).filter((h) => h.level === 1).length + 1
  const core = body.replace(/\s+$/, '')
  const insert = (core ? '\n\n' : '') + `# Chapter ${n}\n\n`
  const from = core.length
  const headingPos = from + (core ? 2 : 0)
  return { from, to: body.length, insert, selStart: from + insert.length, selEnd: from + insert.length, headingPos }
}

// ---- merging separate chapter files into one manuscript ----
const chapterName = (rel) => baseName(rel).replace(/^Chapter\s+\d+\s*[-–—:.]?\s*/i, '').trim() || baseName(rel)

// chapters: [{ rel, text }] already in reading order. Each file becomes "# Title" + its text (a file that already
// starts with a "# " heading keeps it). Returns the full text of the new Manuscript.md.
export function mergeChapters(chapters, bookTitle) {
  const parts = []
  for (const ch of chapters) {
    const { front, body } = splitFront(ch.text)
    const title = parseFront(front).title || chapterName(ch.rel)
    const b = body.replace(/^\s*\n/, '').trimEnd()
    parts.push(/^#\s+\S/.test(b) ? b : `# ${title}${b ? '\n\n' + b : ''}`)
  }
  const name = String(bookTitle || 'Manuscript').replace(/"/g, "'")
  return `---\ntitle: "${name}"\nstatus: draft\n---\n\n${parts.join('\n\n')}\n`
}
