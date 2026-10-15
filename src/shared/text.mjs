// Small text helpers shared by the main process and the renderer.
import { stripComments } from './comments.mjs'

// Line endings are normalised to \n and a BOM is dropped, so an AI that writes CRLF
// does not show up as "every line changed".
export function normalize(s) {
  return String(s).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
}

// A chapter or note may start with a YAML-style block between --- lines.
export function splitFront(text) {
  const m = /^---\n[\s\S]*?\n---[ \t]*(?:\n|$)/.exec(text)
  if (!m) return { front: '', body: text }
  return { front: m[0], body: text.slice(m[0].length) }
}

// Reads simple "key: value" lines. Not a full YAML parser; enough for title/status.
export function parseFront(front) {
  const out = {}
  if (!front) return out
  for (const line of front.split('\n')) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*?)\s*$/.exec(line)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

// Returns the frontmatter block with `title:` set (added, replaced, or removed when the title is empty).
export function setFrontTitle(front, title) {
  const t = String(title).replace(/\s+/g, ' ').trim()
  const val = /[:#"']|^[-?\[\]{}>|*&!%@`]/.test(t) ? '"' + t.replace(/"/g, "'") + '"' : t
  if (!front) return t ? `---\ntitle: ${val}\n---\n` : ''
  const lines = front.replace(/\n$/, '').split('\n') // ['---', ..., '---']
  const i = lines.findIndex((l, k) => k > 0 && /^title:/i.test(l))
  if (i !== -1) {
    if (t) lines[i] = `title: ${val}`
    else lines.splice(i, 1)
  } else if (t) {
    lines.splice(1, 0, `title: ${val}`)
  }
  const out = lines.join('\n') + '\n'
  return out === '---\n---\n' ? '' : out
}

export function countWords(text) {
  const { body } = splitFront(text)
  const m = stripComments(body).match(/\S+/g)
  return m ? m.length : 0
}

// "Manuscript/Chapter 01 - A Weird Start.md" -> "Chapter 01 - A Weird Start"
export function baseName(rel) {
  return rel.split('/').pop().replace(/\.md$/i, '')
}

export function nextChapterNumber(rels) {
  let max = 0
  for (const r of rels) {
    const m = /^Manuscript\/Chapter\s+(\d+)/i.exec(r)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return max + 1
}

// The manuscript is either one file (Manuscript.md, chapters are "# Heading" sections) or a folder of chapter files.
export function isChapter(rel) {
  if (/^Manuscript\.md$/i.test(rel)) return true
  return /^Manuscript\//.test(rel) && !/^README\.md$/i.test(rel.split('/').pop())
}
