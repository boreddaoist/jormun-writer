// Markdown formatting operations for the writing toolbar. Pure functions.
// Each takes (text, start, end) for the textarea selection and returns the edit to apply:
//   { from, to, insert, selStart, selEnd }   (replace text[from..to] with `insert`, then select selStart..selEnd)

const WORD = /[\p{L}\p{N}'’-]/u

function isSingleStar(mark) { return mark === '*' }

// Toggle an inline mark (**bold**, *italic*, ~~strike~~) around the selection or the word at the caret.
export function toggleWrap(text, start, end, mark) {
  const m = mark.length
  if (start === end) {
    // Caret just before the closing mark of a span you are typing in (**word|**): pressing the button again
    // steps out of the format, like switching bold off in Word, instead of un-bolding the word.
    if (text.slice(start, start + m) === mark && (mark !== '*' || (text[start + 1] !== '*' && text[start - 1] !== '*'))) {
      const ls = text.lastIndexOf('\n', start - 1) + 1
      const before = text.slice(ls, start)
      const count = (before.match(mark === '*' ? /(?<!\*)\*(?!\*)/g : mark === '**' ? /\*\*/g : /~~/g) || []).length
      if (count % 2 === 1) {
        return { from: start, to: start, insert: '', selStart: start + m, selEnd: start + m }
      }
    }
    let a = start
    let b = end
    // Only a caret strictly inside a word formats that word. At the edge of a word or on an empty spot the button
    // switches the format on for what you type next (an empty pair, hidden until you type).
    const inside = start > 0 && WORD.test(text[start - 1]) && start < text.length && WORD.test(text[start])
    if (inside) {
      while (a > 0 && WORD.test(text[a - 1])) a--
      while (b < text.length && WORD.test(text[b])) b++
    }
    if (a === b) {
      return { from: start, to: end, insert: mark + mark, selStart: start + m, selEnd: start + m }
    }
    start = a
    end = b
  } else {
    // Only the words get the mark, never the spaces or line breaks around them.
    while (start < end && /\s/.test(text[start])) start++
    while (end > start && /\s/.test(text[end - 1])) end--
    if (start === end) return { from: start, to: start, insert: '', selStart: start, selEnd: start }
  }
  if (mark === '*' || mark === '**') return toggleStars(text, start, end, mark === '**')
  const sel = text.slice(start, end)

  // Marks inside the selection: "**word**" selected.
  const insideOk = !isSingleStar(mark) || (!sel.startsWith('**') && !sel.endsWith('**'))
  if (sel.length >= 2 * m && sel.startsWith(mark) && sel.endsWith(mark) && insideOk) {
    const inner = sel.slice(m, sel.length - m)
    return { from: start, to: end, insert: inner, selStart: start, selEnd: start + inner.length }
  }

  // Marks just outside the selection: "**" word "**" with the word selected.
  const before = text.slice(start - m, start)
  const after = text.slice(end, end + m)
  const outsideOk = !isSingleStar(mark) || (text[start - 2] !== '*' && text[end + 1] !== '*')
  if (before === mark && after === mark && outsideOk) {
    return { from: start - m, to: end + m, insert: sel, selStart: start - m, selEnd: start - m + sel.length }
  }

  return { from: start, to: end, insert: mark + sel + mark, selStart: start + m, selEnd: end + m }
}

// Bold and italic share the asterisk: *italic*, **bold**, ***both***. Count the run of stars around the words
// (looking through a ~~strike~~ pair) and rewrite it, so italic on bold text gives ***x*** and bold off from
// ***x*** leaves *x* instead of piling up more stars.
function toggleStars(text, start, end, bold) {
  // the selection includes its own stars: look at the words inside them
  let lead = 0
  while (start + lead < end && text[start + lead] === '*') lead++
  let trail = 0
  while (end - 1 - trail >= start + lead && text[end - 1 - trail] === '*') trail++
  const inward = Math.min(lead, trail)
  start += inward
  end -= inward
  let s = start
  let e = end
  while (text.slice(s - 2, s) === '~~' && text.slice(e, e + 2) === '~~' && s - 2 >= 0) { s -= 2; e += 2 }
  let left = 0
  while (s - 1 - left >= 0 && text[s - 1 - left] === '*') left++
  let right = 0
  while (e + right < text.length && text[e + right] === '*') right++
  const k = Math.min(left, right, 3)
  const hasBold = k >= 2
  const hasItalic = k === 1 || k === 3
  const nextBold = bold ? !hasBold : hasBold
  const nextItalic = bold ? hasItalic : !hasItalic
  const nk = (nextBold ? 2 : 0) + (nextItalic ? 1 : 0)
  const stars = '*'.repeat(nk)
  const from = s - k
  const to = e + k
  const core = text.slice(s, e)
  const selStart = from + nk + (start - s)
  return { from, to, insert: stars + core + stars, selStart, selEnd: selStart + (end - start) }
}

// Lines touched by the selection, as [lineStart, lineEnd).
function lineRange(text, start, end) {
  const ls = text.lastIndexOf('\n', start - 1) + 1
  const e = end > start && text[end - 1] === '\n' ? end - 1 : end
  let le = text.indexOf('\n', e)
  if (le === -1) le = text.length
  return [ls, le]
}

// Toggle a line prefix ("- ", "> ", "# ", "## ") on every line in the selection.
// Headings replace any other heading level instead of stacking.
export function toggleLinePrefix(text, start, end, prefix) {
  const [ls, le] = lineRange(text, start, end)
  const lines = text.slice(ls, le).split('\n')
  const isHeading = prefix.startsWith('#')
  // a line is a heading, a quote or a bullet, never two at once: a new block format replaces the old one
  const stripBlock = (l) => (/^(\*\s*){3,}$|^-{3,}$/.test(l.trim()) ? l : l.replace(/^(#{1,6}\s+|>\s?|[-+*]\s+)/, ''))
  const allHave = lines.every((l) => l.startsWith(prefix) && (!isHeading || !/^#{1,6}\s/.test(l.slice(prefix.length))))
  const out = lines.map((l) => {
    if (allHave) return l.slice(prefix.length)
    return l.startsWith(prefix) && !(isHeading && /^#{1,6}\s/.test(l.slice(prefix.length))) ? l : prefix + stripBlock(l)
  })
  const insert = out.join('\n')
  if (start === end) {
    // Keep the caret on its line, shifted by the change in length.
    const delta = insert.length - (le - ls)
    const caret = Math.max(ls, Math.min(start + delta, ls + insert.length))
    return { from: ls, to: le, insert, selStart: caret, selEnd: caret }
  }
  return { from: ls, to: le, insert, selStart: ls, selEnd: ls + insert.length }
}

// Insert a scene break (* * *) on its own line, with blank lines around it.
export function sceneBreak(text, start, end) {
  const before = text.slice(0, end)
  const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  const after = text.slice(end)
  const tail = after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
  const insert = lead + '* * *' + tail
  const caret = end + insert.length
  return { from: end, to: end, insert, selStart: caret, selEnd: caret }
}

export const bold = (t, s, e) => toggleWrap(t, s, e, '**')
export const italic = (t, s, e) => toggleWrap(t, s, e, '*')
export const strike = (t, s, e) => toggleWrap(t, s, e, '~~')
export const h1 = (t, s, e) => toggleLinePrefix(t, s, e, '# ')
export const h2 = (t, s, e) => toggleLinePrefix(t, s, e, '## ')
export const h3 = (t, s, e) => toggleLinePrefix(t, s, e, '### ')
export const quote = (t, s, e) => toggleLinePrefix(t, s, e, '> ')
export const bullet = (t, s, e) => toggleLinePrefix(t, s, e, '- ')

// Apply a result to a string (used by tests; the app applies it to the textarea instead).
export function applyEdit(text, r) {
  return text.slice(0, r.from) + r.insert + text.slice(r.to)
}
