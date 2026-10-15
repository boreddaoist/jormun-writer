// The document outline (Word's Navigation pane): the H1 / H2 / H3 headings of a document, with their positions.
import { parseInline } from './md.mjs'

const HEADING = /^(#{1,3})\s+(.*?)\s*#*\s*$/

// Visible text of inline nodes, without the ** / * / ~~ marks and without the notes' markup.
export function plainText(nodes) {
  let s = ''
  for (const n of nodes) {
    if (n.t === 'text') s += n.v
    else if (n.t === 'comment') s += n.anchor ? plainText(n.anchor) : ''
    else s += plainText(n.c)
  }
  return s
}

// body: the document text (without frontmatter). Returns [{ level, text, pos, end }] where pos / end are
// character offsets of the heading line in `body`.
export function extractHeadings(body) {
  const out = []
  let pos = 0
  for (const line of body.split('\n')) {
    const m = HEADING.exec(line)
    if (m && m[2].trim()) {
      out.push({ level: m[1].length, text: plainText(parseInline(m[2])).trim(), pos, end: pos + line.length })
    }
    pos += line.length + 1
  }
  return out
}

// Index of the heading the cursor is under (the last heading at or before `head`), or -1.
export function activeHeadingIndex(headings, head) {
  let idx = -1
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].pos <= head) idx = i
    else break
  }
  return idx
}

// Outline entries for the sidebar, across several files (chapters). A file with no headings still gets one
// entry (its title), so it stays reachable. `files` = [{ rel, title, body }].
export function buildOutline(files) {
  const out = []
  for (const f of files) {
    const hs = extractHeadings(f.body)
    if (!hs.length) {
      out.push({ id: f.rel + '#0', rel: f.rel, level: 1, text: f.title, pos: 0, fallback: true })
    } else {
      hs.forEach((h, i) => out.push({ id: f.rel + '#' + i, rel: f.rel, level: h.level, text: h.text, pos: h.pos, fallback: false }))
    }
  }
  return out
}

// Hide the children of folded entries. Returns the entries to show, each with `hasKids` and `folded`.
export function visibleOutline(entries, folded) {
  const out = []
  let skip = null // { rel, level } of a folded entry whose deeper entries are hidden
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    if (skip && e.rel === skip.rel && e.level > skip.level) continue
    skip = null
    const next = entries[i + 1]
    const hasKids = !!next && next.rel === e.rel && next.level > e.level
    const isFolded = !!folded[e.id] && hasKids
    out.push({ ...e, hasKids, folded: isFolded })
    if (isFolded) skip = { rel: e.rel, level: e.level }
  }
  return out
}
