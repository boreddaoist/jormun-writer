import test from 'node:test'
import assert from 'node:assert/strict'
import * as S from '../src/shared/sync.mjs'
import { splitFront, parseFront, countWords, normalize, nextChapterNumber, isChapter } from '../src/shared/text.mjs'

test('outside edit on a clean file becomes a pending review and updates the editor', () => {
  let s = S.initState('one')
  s = S.applyExternal(s, 'one two')
  assert.equal(s.buffer, 'one two')
  assert.deepEqual(s.pending, { from: 'one', to: 'one two' })
  assert.equal(s.conflict, null)
})

test('repeated outside edits keep the ORIGINAL as the reject target', () => {
  let s = S.initState('a')
  s = S.applyExternal(s, 'b')
  s = S.applyExternal(s, 'c')
  assert.deepEqual(s.pending, { from: 'a', to: 'c' })
  s = S.rejectPending(s)
  assert.equal(s.buffer, 'a')
  assert.equal(s.pending, null)
  assert.ok(S.isDirty(s), 'reject leaves buffer != disk so autosave writes the original back')
})

test('accept moves the baseline to the new text', () => {
  let s = S.applyExternal(S.initState('a'), 'b')
  s = S.acceptPending(s)
  assert.equal(s.baseline, 'b')
  assert.equal(s.pending, null)
  assert.equal(s.buffer, 'b')
})

test('typing on top of a pending change accepts it instead of losing words', () => {
  let s = S.applyExternal(S.initState('a'), 'b')
  s = S.applyUserEdit(s, 'b!')
  assert.equal(s.pending, null)
  assert.equal(s.baseline, 'b')
  assert.equal(s.buffer, 'b!')
})

test('outside edit while the user has unsaved typing is a conflict, never an overwrite', () => {
  let s = S.initState('a')
  s = S.applyUserEdit(s, 'a mine')
  s = S.applyExternal(s, 'a theirs')
  assert.equal(s.buffer, 'a mine')
  assert.deepEqual(s.conflict, { mine: 'a mine', theirs: 'a theirs' })
  assert.equal(S.resolveConflict(s, 'theirs').buffer, 'a theirs')
  const keep = S.resolveConflict(s, 'mine')
  assert.equal(keep.buffer, 'a mine')
  assert.ok(S.isDirty(keep), 'keeping mine must still be written to disk')
})

test('echo of our own save is ignored', () => {
  let s = S.applyUserEdit(S.initState('a'), 'ab')
  s = S.onSaved(s, 'ab')
  assert.equal(S.applyExternal(s, 'ab'), s)
  assert.equal(s.baseline, 'ab')
})

test('outside edit that reverts to the baseline clears the review', () => {
  let s = S.applyExternal(S.initState('a'), 'b')
  s = S.applyExternal(s, 'a')
  assert.equal(s.pending, null)
  assert.equal(s.buffer, 'a')
})

test('saving while a review is pending does not move the baseline', () => {
  let s = S.applyExternal(S.initState('a'), 'b')
  s = S.onSaved(s, 'b')
  assert.equal(s.baseline, 'a')
  assert.ok(s.pending)
})

test('frontmatter split / parse / word count', () => {
  const t = '---\ntitle: "A Weird Start"\nstatus: draft\n---\nHello brave new world\n'
  const { front, body } = splitFront(t)
  assert.equal(body, 'Hello brave new world\n')
  assert.deepEqual(parseFront(front), { title: 'A Weird Start', status: 'draft' })
  assert.equal(countWords(t), 4)
  assert.deepEqual(splitFront('no front'), { front: '', body: 'no front' })
})

test('normalize handles BOM and CRLF', () => {
  assert.equal(normalize('﻿a\r\nb\rc'), 'a\nb\nc')
})

test('chapter helpers', () => {
  assert.equal(nextChapterNumber(['Manuscript/Chapter 01 - x.md', 'Manuscript/Chapter 07 - y.md', 'Notes/z.md']), 8)
  assert.equal(nextChapterNumber([]), 1)
  assert.ok(isChapter('Manuscript/Chapter 01 - x.md'))
  assert.ok(!isChapter('Manuscript/README.md'))
  assert.ok(!isChapter('Characters/Hero.md'))
})
