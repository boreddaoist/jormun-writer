import test from 'node:test'
import assert from 'node:assert/strict'
import { isIdeaLine, stripIdeas, ideaLineRange, addIdea } from '../src/shared/ideas.mjs'
import { applyEdit } from '../src/shared/format.mjs'
import { stripComments } from '../src/shared/comments.mjs'
import { countWords } from '../src/shared/text.mjs'
import { describeLine } from '../src/shared/livemd.mjs'
import { parseBlocks, render } from '../src/shared/md.mjs'
import { buildMarkdown } from '../src/main/exporter.js'

const doc = 'First paragraph here.\n{!! Try it flatter, one dry sentence. !!}\n\nSecond one.\n'

test('an idea is one whole line wrapped in {!! !!}', () => {
  assert.ok(isIdeaLine('{!! try this !!}'))
  assert.ok(isIdeaLine('{!!try this!!}'))
  assert.ok(!isIdeaLine('text {!! inline !!}'), 'it must be the whole line')
  assert.ok(!isIdeaLine('{==a==}{>>note<<}'))
  assert.equal(describeLine('{!! try this !!}', 0).type, 'idea')
})

test('ideas are not story text: not counted, not rendered, not exported', () => {
  assert.equal(stripIdeas(doc), 'First paragraph here.\n\nSecond one.\n')
  assert.equal(stripComments(doc), 'First paragraph here.\n\nSecond one.\n')
  assert.equal(countWords(doc), 5)
  assert.equal(parseBlocks(doc).length, 2)
  assert.ok(!render(doc).includes('flatter'))
  const md = buildMarkdown({ title: 'T', includeComments: true, chapters: [{ title: '', text: doc }] })
  assert.ok(!md.includes('flatter') && md.includes('Second one.'))
})

test('dismissing removes the line and its break, keeps the paragraph', () => {
  const r = ideaLineRange(doc, doc.indexOf('flatter'))
  assert.equal(applyEdit(doc, { from: r.from, to: r.to, insert: '' }), 'First paragraph here.\n\nSecond one.\n')
  assert.equal(ideaLineRange(doc, 3), null, 'a normal paragraph is not an idea')
  const tail = 'Para.\n{!! x !!}'
  const t = ideaLineRange(tail, tail.length - 2)
  assert.equal(tail.slice(0, t.from) + tail.slice(t.to), 'Para.')
})

test('addIdea puts the idea under the paragraph, below ideas already there', () => {
  const body = 'One.\n\nTwo.\n'
  let b = applyEdit(body, addIdea(body, 1, 'plainer'))
  assert.equal(b, 'One.\n{!! plainer !!}\n\nTwo.\n')
  b = applyEdit(b, addIdea(b, 1, 'or dry\nand short'))
  assert.equal(b, 'One.\n{!! plainer !!}\n{!! or dry and short !!}\n\nTwo.\n')
})
