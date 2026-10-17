import test from 'node:test'
import assert from 'node:assert/strict'
import { analyze, applyKeep, applyUndo } from '../src/shared/hunks.mjs'
import * as S from '../src/shared/sync.mjs'

const FROM = '---\ntitle: T\n---\n\nOne.\n\nTwo.\n\nThree.\n\nFour.\n\nFive.\n'
const TO = '---\ntitle: T\n---\n\nOne changed.\n\nTwo.\n\nThree.\n\nFour.\n\nFive.\n\nSix added.\n'

test('an outside edit is split into separate changes', () => {
  const { hunks, rows } = analyze(FROM, TO)
  assert.equal(hunks.length, 2)
  assert.equal(hunks[0].oldText.trim(), 'One.')
  assert.equal(hunks[0].newText.trim(), 'One changed.')
  assert.equal(hunks[1].newText.trim(), 'Six added.')
  assert.equal(hunks[1].oldText, '')
  assert.deepEqual(rows.filter((r) => r.kind === 'change').map((r) => r.hunk), [0, 1])
})

test('keeping one change moves only it into the version you own', () => {
  const { hunks } = analyze(FROM, TO)
  const kept = applyKeep(FROM, hunks[0])
  assert.ok(kept.includes('One changed.') && !kept.includes('Six added.'))
  let s = S.applyExternal(S.initState(FROM), TO)
  s = S.keepHunk(s, 0)
  assert.equal(s.buffer, TO, 'the text on screen does not change')
  assert.ok(s.pending && s.pending.from.includes('One changed.') && !s.pending.from.includes('Six added.'))
  assert.equal(analyze(s.pending.from, s.pending.to).hunks.length, 1)
  s = S.keepHunk(s, 0)
  assert.equal(s.pending, null, 'when every change is kept the review is finished')
  assert.equal(s.baseline, TO)
})

test('undoing one change takes only it back out', () => {
  const { hunks } = analyze(FROM, TO)
  const back = applyUndo(TO, hunks[1])
  assert.ok(back.includes('One changed.') && !back.includes('Six added.'))
  let s = S.applyExternal(S.initState(FROM), TO)
  s = S.undoHunk(s, 1)
  assert.ok(!s.buffer.includes('Six added.') && s.buffer.includes('One changed.'))
  assert.ok(S.isDirty(s), 'the buffer now differs from disk, so autosave writes it')
  assert.equal(analyze(s.pending.from, s.pending.to).hunks.length, 1)
  s = S.undoHunk(s, 0)
  assert.equal(s.buffer, FROM)
  assert.equal(s.pending, null, 'every change undone: back to the original')
})

test('one change kept and the other undone ends with the right text', () => {
  let s = S.applyExternal(S.initState(FROM), TO)
  s = S.keepHunk(s, 0)
  s = S.undoHunk(s, 0)
  assert.equal(s.pending, null)
  assert.equal(s.buffer, FROM.replace('One.', 'One changed.'))
})

test('a changed frontmatter is part of the diff', () => {
  const a = '---\ntitle: A\n---\n\nText.\n'
  const b = '---\ntitle: B\n---\n\nText.\n'
  const { hunks } = analyze(a, b)
  assert.equal(hunks.length, 1)
  assert.equal(applyUndo(b, hunks[0]), a)
})
