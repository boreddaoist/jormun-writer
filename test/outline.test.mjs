import test from 'node:test'
import assert from 'node:assert/strict'
import { extractHeadings, activeHeadingIndex, buildOutline, visibleOutline, plainText } from '../src/shared/outline.mjs'
import { parseInline } from '../src/shared/md.mjs'

const DOC = '# Part One\n\nText here.\n## The break-in\nMore text.\n### A detail\n#### too deep\n#hashtag not a heading\n## **Bold** *title* {==x==}{>>n<<}\n'

test('extractHeadings finds H1-H3 with exact positions, strips marks, ignores H4+ and #tags', () => {
  const hs = extractHeadings(DOC)
  assert.deepEqual(hs.map((h) => [h.level, h.text]), [
    [1, 'Part One'], [2, 'The break-in'], [3, 'A detail'], [2, 'Bold title x']
  ])
  for (const h of hs) assert.ok(DOC.slice(h.pos, h.end).startsWith('#'), 'pos points at the line start')
  assert.equal(DOC.slice(hs[1].pos, hs[1].end), '## The break-in')
})

test('plainText drops formatting marks and note markup', () => {
  assert.equal(plainText(parseInline('a **b** *c* ~~d~~ {==e==}{>>note<<} {>>loose<<}')), 'a b c d e ')
})

test('activeHeadingIndex: the heading the cursor is under', () => {
  const hs = extractHeadings(DOC)
  assert.equal(activeHeadingIndex(hs, 0), 0)
  assert.equal(activeHeadingIndex(hs, DOC.indexOf('More text')), 1)
  assert.equal(activeHeadingIndex(hs, DOC.length), 3)
  assert.equal(activeHeadingIndex([], 5), -1)
  assert.equal(activeHeadingIndex(extractHeadings('intro\n# First'), 2), -1, 'before the first heading')
})

test('buildOutline: headings across files; a file without headings keeps one entry', () => {
  const out = buildOutline([
    { rel: 'Manuscript/A.md', title: 'Raw scene', body: 'just text, no headings' },
    { rel: 'Manuscript/B.md', title: 'B', body: '# One\n## Two\n' }
  ])
  assert.deepEqual(out.map((e) => [e.rel, e.level, e.text, e.fallback]), [
    ['Manuscript/A.md', 1, 'Raw scene', true],
    ['Manuscript/B.md', 1, 'One', false],
    ['Manuscript/B.md', 2, 'Two', false]
  ])
})

test('visibleOutline hides the children of a folded entry and marks entries that have children', () => {
  const out = buildOutline([{ rel: 'a.md', title: 'a', body: '# A\n## A1\n### A1x\n## A2\n# B\n## B1\n' }])
  const all = visibleOutline(out, {})
  assert.deepEqual(all.map((e) => e.text), ['A', 'A1', 'A1x', 'A2', 'B', 'B1'])
  assert.deepEqual(all.map((e) => e.hasKids), [true, true, false, false, true, false])
  const foldedA = visibleOutline(out, { 'a.md#0': true })
  assert.deepEqual(foldedA.map((e) => e.text), ['A', 'B', 'B1'])
  assert.equal(foldedA[0].folded, true)
  const foldedA1 = visibleOutline(out, { 'a.md#1': true })
  assert.deepEqual(foldedA1.map((e) => e.text), ['A', 'A1', 'A2', 'B', 'B1'], 'folding A1 hides only A1x')
  assert.equal(visibleOutline(out, { 'a.md#2': true })[2].folded, false, 'an entry without children cannot be folded')
})
