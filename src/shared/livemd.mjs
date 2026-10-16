// Pure helpers for the live-preview editor (no DOM, no CodeMirror), so they can be tested.
import { parseInline } from './md.mjs'
import { IDEA_LINE } from './ideas.mjs'

const RULE = /^\s*(?:\*\s*\*\s*\*[\s*]*|-{3,}|_{3,})\s*$/

// Classify one line and parse its inline content with absolute positions.
// `base` is the document offset of the line start.
//   -> { type: 'p'|'h'|'quote'|'ul'|'ol'|'hr', level?, prefixLen, nodes }
export function describeLine(text, base = 0) {
  let m
  if ((m = IDEA_LINE.exec(text))) return { type: 'idea', prefixLen: m[1].length, suffixLen: m[3].length, nodes: [] }
  if (RULE.test(text)) return { type: 'hr', prefixLen: 0, nodes: [] }
  if ((m = /^(#{1,6})\s+/.exec(text))) {
    return { type: 'h', level: m[1].length, prefixLen: m[0].length, nodes: parseInline(text.slice(m[0].length), base + m[0].length) }
  }
  if ((m = /^>\s?/.exec(text))) {
    return { type: 'quote', prefixLen: m[0].length, nodes: parseInline(text.slice(m[0].length), base + m[0].length) }
  }
  if ((m = /^\s*[-*+]\s+/.exec(text))) {
    return { type: 'ul', prefixLen: m[0].length, nodes: parseInline(text.slice(m[0].length), base + m[0].length) }
  }
  if ((m = /^\s*\d+[.)]\s+/.exec(text))) {
    return { type: 'ol', prefixLen: m[0].length, nodes: parseInline(text.slice(m[0].length), base + m[0].length) }
  }
  return { type: 'p', prefixLen: 0, nodes: parseInline(text, base) }
}

// Which inline formats are active at document offset `pos` (inside a node's content, or touching its markers)?
export function formatsAt(nodes, pos) {
  const out = { bold: false, italic: false, strike: false }
  const walk = (list) => {
    for (const n of list) {
      if (pos < n.from || pos > n.to) continue
      if (n.t === 'strong') out.bold = true
      else if (n.t === 'em') out.italic = true
      else if (n.t === 's') out.strike = true
      if (n.c) walk(n.c)
      if (n.t === 'comment' && n.anchor) walk(n.anchor)
    }
  }
  walk(nodes)
  return out
}

// Block formats for the line containing the caret, for the toolbar's "on" states.
export function lineFormats(text) {
  const d = describeLine(text, 0)
  return { h1: d.type === 'h' && d.level === 1, h2: d.type === 'h' && d.level === 2, h3: d.type === 'h' && d.level === 3, quote: d.type === 'quote', bullet: d.type === 'ul' }
}

// With the Markdown marks hidden, deleting the last visible character inside **bold** must remove the whole
// token, or an empty "****" would be left behind and show up as stray asterisks. Given the inline nodes of a
// line and a deletion range [d0, d1), return the range of the outermost bold / italic / strike token that
// the deletion would leave empty (markers included), or null.
export function emptiedTokenRange(nodes, d0, d1) {
  if (d1 <= d0) return null
  for (const n of nodes) {
    if (n.t === 'comment') {
      if (n.anchor && d0 >= n.anchorFrom && d1 <= n.anchorTo) return emptiedTokenRange(n.anchor, d0, d1)
      continue
    }
    if (!n.c) continue
    const cf = n.from + n.open
    const ct = n.to - n.close
    if (d0 < cf || d1 > ct) continue
    if (d0 === cf && d1 === ct) return { from: n.from, to: n.to }
    const inner = emptiedTokenRange(n.c, d0, d1)
    if (inner) return inner.from === cf && inner.to === ct ? { from: n.from, to: n.to } : inner
    return null
  }
  return null
}

// Word-style margin balloons: each card wants to sit level with its text (`top`), but cards may not
// overlap, so each one is pushed down below the one before it. Input must be sorted by `top`.
// Returns the final top of each card, in the same order.
export function stackCards(items, gap = 8) {
  const out = []
  let floor = -Infinity
  for (const it of items) {
    const top = Math.max(it.top, floor)
    out.push(top)
    floor = top + it.height + gap
  }
  return out
}
