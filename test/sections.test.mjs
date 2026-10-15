import test from 'node:test'
import assert from 'node:assert/strict'
import { extractHeadings } from '../src/shared/outline.mjs'
import { sectionRange, deleteSection, moveSection, addChapter, mergeChapters, headingTextRange } from '../src/shared/sections.mjs'
import { isChapter } from '../src/shared/text.mjs'

const DOC = '# One\n\nalpha\n\n## One A\n\nbeta\n\n# Two\n\ngamma\n\n# Three\n\ndelta\n'
const apply = (t, e) => t.slice(0, e.from) + e.insert + t.slice(e.to)
const H = (t) => extractHeadings(t)

test('a section runs to the next heading of the same or a higher level', () => {
  const hs = H(DOC)
  assert.equal(DOC.slice(...Object.values(sectionRange(DOC, hs, 0))), '# One\n\nalpha\n\n## One A\n\nbeta\n\n')
  assert.equal(DOC.slice(...Object.values(sectionRange(DOC, hs, 1))), '## One A\n\nbeta\n\n')
  assert.equal(DOC.slice(...Object.values(sectionRange(DOC, hs, 3))), '# Three\n\ndelta\n')
})

test('delete section removes the heading and everything under it', () => {
  assert.equal(apply(DOC, deleteSection(DOC, H(DOC), 0)), '# Two\n\ngamma\n\n# Three\n\ndelta\n')
  assert.equal(apply(DOC, deleteSection(DOC, H(DOC), 1)), '# One\n\nalpha\n\n# Two\n\ngamma\n\n# Three\n\ndelta\n')
})

test('move section swaps with its sibling and keeps the text intact', () => {
  assert.equal(apply(DOC, moveSection(DOC, H(DOC), 2, 'up')), '# Two\n\ngamma\n\n# One\n\nalpha\n\n## One A\n\nbeta\n\n# Three\n\ndelta\n')
  assert.equal(apply(DOC, moveSection(DOC, H(DOC), 0, 'down')), '# Two\n\ngamma\n\n# One\n\nalpha\n\n## One A\n\nbeta\n\n# Three\n\ndelta\n')
  // the last section moves up and the file still ends the way it did
  assert.equal(apply(DOC, moveSection(DOC, H(DOC), 3, 'up')), '# One\n\nalpha\n\n## One A\n\nbeta\n\n# Three\n\ndelta\n\n# Two\n\ngamma\n')
  assert.equal(moveSection(DOC, H(DOC), 0, 'up'), null, 'the first section cannot move up')
  assert.equal(moveSection(DOC, H(DOC), 3, 'down'), null, 'the last section cannot move down')
  assert.equal(moveSection(DOC, H(DOC), 1, 'up'), null, 'a sub-section stays inside its parent')
})

test('a sub-section swaps only with a sibling under the same parent', () => {
  const d = '# A\n\n## x\n\n1\n\n## y\n\n2\n\n# B\n\n## z\n\n3\n'
  assert.equal(apply(d, moveSection(d, H(d), 2, 'up')), '# A\n\n## y\n\n2\n\n## x\n\n1\n\n# B\n\n## z\n\n3\n')
  assert.equal(moveSection(d, H(d), 2, 'down'), null)
})

test('add chapter numbers it after the existing chapters', () => {
  const e = addChapter(DOC)
  const out = apply(DOC, e)
  assert.ok(out.endsWith('delta\n\n# Chapter 4\n\n'))
  assert.equal(e.headingPos, out.indexOf('# Chapter 4'))
  assert.equal(apply('', addChapter('')), '# Chapter 1\n\n')
})

test('rename: the editable part of a heading excludes the # marks', () => {
  const hs = H(DOC)
  const r = headingTextRange(DOC, hs[1])
  assert.equal(DOC.slice(r.from, r.to), 'One A')
})

test('merging chapter files makes one manuscript with a # heading per chapter', () => {
  const out = mergeChapters([
    { rel: 'Manuscript/Chapter 01 - A Weird Start.md', text: '---\ntitle: "A Weird Start"\n---\n\nHe ran.\n' },
    { rel: 'Manuscript/Chapter 02 - Untitled.md', text: '' },
    { rel: 'Manuscript/Chapter 03 - The Shop.md', text: '# The shop (own heading)\n\nQueue.\n' }
  ], 'My "Book"')
  assert.equal(out, '---\ntitle: "My \'Book\'"\nstatus: draft\n---\n\n# A Weird Start\n\nHe ran.\n\n# Untitled\n\n# The shop (own heading)\n\nQueue.\n')
})

test('Manuscript.md counts as the manuscript, README does not', () => {
  assert.ok(isChapter('Manuscript.md'))
  assert.ok(isChapter('Manuscript/Chapter 01 - X.md'))
  assert.ok(!isChapter('Manuscript/README.md'))
  assert.ok(!isChapter('Notes/Manuscript.md'))
})
