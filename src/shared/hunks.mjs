// Change by change review. An outside edit (an AI in VS Code) is split into hunks: each run of changed lines between
// two stretches of unchanged text. Every hunk can be kept or undone on its own.
//
//   analyze(from, to) -> { rows, hunks }
//     rows   what the review shows, in order: { kind: 'ctx', lines } or { kind: 'change', hunk, old, new }
//     hunks  [{ id, aStart, aEnd, bStart, bEnd, oldText, newText }]  offsets into `from` (a) and `to` (b)
import { diffLines } from 'diff'
import { splitFront } from './text.mjs'

export function analyze(from, to) {
  const a = splitFront(from || '')
  const b = splitFront(to || '')
  const same = a.front === b.front
  const A = same ? a.body : from || ''
  const B = same ? b.body : to || ''
  const offA = same ? a.front.length : 0
  const offB = same ? b.front.length : 0
  const rows = []
  const hunks = []
  let ia = 0
  let ib = 0
  let cur = null
  const close = () => {
    if (!cur) return
    cur.id = hunks.length
    hunks.push(cur)
    rows.push({ kind: 'change', hunk: cur.id, old: cur.oldText, new: cur.newText })
    cur = null
  }
  for (const p of diffLines(A, B)) {
    const len = p.value.length
    if (p.removed || p.added) {
      if (!cur) cur = { aStart: offA + ia, aEnd: offA + ia, bStart: offB + ib, bEnd: offB + ib, oldText: '', newText: '' }
      if (p.removed) { cur.oldText += p.value; ia += len; cur.aEnd = offA + ia } else { cur.newText += p.value; ib += len; cur.bEnd = offB + ib }
    } else {
      close()
      const lines = p.value.split('\n').filter((l) => l.trim())
      if (lines.length) rows.push({ kind: 'ctx', lines: lines.length > 3 ? [lines[0], '…', lines[lines.length - 1]] : lines })
      ia += len
      ib += len
    }
  }
  close()
  return { rows, hunks }
}

// `from` with this one hunk applied (keeping the change: it becomes part of the version you own).
export const applyKeep = (from, h) => from.slice(0, h.aStart) + h.newText + from.slice(h.aEnd)
// `to` with this one hunk taken back out (undoing the change).
export const applyUndo = (to, h) => to.slice(0, h.bStart) + h.oldText + to.slice(h.bEnd)
