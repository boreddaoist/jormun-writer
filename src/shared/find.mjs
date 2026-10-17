// Find and replace, shared by the in-chapter find bar and the whole-book dialog. Pure text in, positions out.

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// All matches of `query` in `text`, as [{ from, to }]. An empty query matches nothing.
export function findMatches(text, query, { matchCase = false, wholeWord = false } = {}) {
  if (!query) return []
  const word = '[\\p{L}\\p{N}_]'
  const body = escapeRe(query)
  const src = wholeWord ? `(?<!${word})${body}(?!${word})` : body
  const re = new RegExp(src, 'gu' + (matchCase ? '' : 'i'))
  const out = []
  let m
  while ((m = re.exec(text))) {
    out.push({ from: m.index, to: m.index + m[0].length })
    if (m[0].length === 0) re.lastIndex++
  }
  return out
}

// Replace every match; returns { text, count }.
export function replaceAllIn(text, query, replacement, opts) {
  const ms = findMatches(text, query, opts)
  if (!ms.length) return { text, count: 0 }
  let out = ''
  let at = 0
  for (const m of ms) {
    out += text.slice(at, m.from) + replacement
    at = m.to
  }
  return { text: out + text.slice(at), count: ms.length }
}

// A one-line piece of text around a match, for result lists: { before, hit, after }.
export function snippet(text, m, radius = 48) {
  const flat = (s) => s.replace(/\s+/g, ' ')
  const a = Math.max(0, m.from - radius)
  const b = Math.min(text.length, m.to + radius)
  return {
    before: (a > 0 ? '…' : '') + flat(text.slice(a, m.from)),
    hit: flat(text.slice(m.from, m.to)),
    after: flat(text.slice(m.to, b)) + (b < text.length ? '…' : '')
  }
}
