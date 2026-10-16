// Rewrite ideas: a suggestion for how a paragraph could be written, shown in yellow right under it. They never
// change the author's text; the author reads one and rewrites by hand. Stored as a whole line placed directly
// after the paragraph (no blank line between):
//
//     He did not know what else to do besides close the damn door.
//     {!! Try it plainer and flatter: he fixes on the door because it is the one thing he can control. !!}
//
// An idea is not story text: it is not counted, not exported and not shown in the Manuscript view.

export const IDEA_LINE = /^([ \t]*\{!!\s?)(.*?)(\s?!!\}[ \t]*)$/

export const isIdeaLine = (line) => IDEA_LINE.test(line)

export function stripIdeas(text) {
  return text.replace(/^[ \t]*\{!!.*?!!\}[ \t]*(?:\r?\n|$)/gm, '')
}

// The range to delete to dismiss the idea on the line containing `pos` (the line break goes with it), or null.
export function ideaLineRange(body, pos) {
  const p = Math.max(0, Math.min(pos, body.length))
  const from = body.lastIndexOf('\n', p - 1) + 1
  let end = body.indexOf('\n', p)
  if (end < 0) end = body.length
  const text = body.slice(from, end).replace(/\r$/, '')
  if (!isIdeaLine(text)) return null
  if (end < body.length) return { from, to: end + 1 }
  return { from: Math.max(0, from - 1), to: end } // last line: take the break before it instead
}

// Add an idea under the paragraph that contains `pos`. The text is kept on one line.
export function addIdea(body, pos, text) {
  const p = Math.max(0, Math.min(pos, body.length))
  let end = body.indexOf('\n', p)
  if (end < 0) end = body.length
  // skip ideas already under this paragraph so a new one goes below them
  let at = end
  for (;;) {
    const next = body.indexOf('\n', at + 1)
    const line = body.slice(at + 1, next < 0 ? body.length : next)
    if (at < body.length && isIdeaLine(line.replace(/\r$/, ''))) at = next < 0 ? body.length : next
    else break
  }
  const clean = text.replace(/\s*\n\s*/g, ' ').replace(/!!\}/g, '! !}').trim()
  const insert = `\n{!! ${clean} !!}`
  return { from: at, to: at, insert, selStart: at + insert.length, selEnd: at + insert.length }
}
