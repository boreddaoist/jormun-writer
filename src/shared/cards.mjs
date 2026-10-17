// Character and place cards: any Markdown file outside the manuscript whose title or aliases name something. Used to peek at
// a card from the page (right-click a name, or Alt+click it) without leaving the chapter.
import { splitFront, parseFront, baseName, isChapter } from './text.mjs'

const aliasesOf = (front) => {
  const m = /^aliases:\s*\[(.*?)\]\s*$/m.exec(front || '')
  return m ? m[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean) : []
}

// files: [{ rel, text }] -> [{ name, rel, title }], longest names first (so "Mo Lan" wins over "Mo")
export function cardIndex(files) {
  const out = []
  for (const f of files) {
    if (isChapter(f.rel) || /^templates\//i.test(f.rel)) continue
    const { front } = splitFront(f.text)
    const title = parseFront(front).title || baseName(f.rel)
    const names = new Set([title, baseName(f.rel), ...aliasesOf(front)])
    for (const n of names) if (n && n.trim().length >= 3) out.push({ name: n.trim(), rel: f.rel, title })
  }
  return out.sort((a, b) => b.name.length - a.name.length)
}

const word = /[\p{L}\p{N}_]/u

// The card whose name covers position `pos` of `text` (case-insensitive, whole words), or null.
export function cardAt(index, text, pos) {
  const lo = Math.max(0, pos - 60)
  const hi = Math.min(text.length, pos + 60)
  const win = text.slice(lo, hi).toLowerCase()
  for (const c of index) {
    const n = c.name.toLowerCase()
    let from = 0
    for (;;) {
      const i = win.indexOf(n, from)
      if (i === -1) break
      const a = lo + i
      const b = a + n.length
      const before = a > 0 ? text[a - 1] : ''
      const after = b < text.length ? text[b] : ''
      if (a <= pos && pos <= b && !(before && word.test(before)) && !(after && word.test(after))) return c
      from = i + 1
    }
  }
  return null
}

// The card as readable Markdown: no frontmatter, and Obsidian callout markers turned into plain headings.
export function cardMarkdown(text) {
  const body = splitFront(text).body
  return body
    .replace(/^>\s*\[!\w+\][+-]?\s*(.*)$/gm, (_m, t) => (t ? '> **' + t + '**' : '>'))
    .replace(/_TBD_/g, '…')
}
