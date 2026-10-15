import test from 'node:test'
import assert from 'node:assert/strict'
import { parseComments, stripComments, addComment, resolveComment, editComment } from '../src/shared/comments.mjs'
import { parseInline, parseBlocks, render, inline } from '../src/shared/md.mjs'
import { countWords } from '../src/shared/text.mjs'
import { applyEdit, italic } from '../src/shared/format.mjs'

const BODY = 'He ran.\n{==the dog==}{>>AI: does the dog exist yet?<<} bit him.\nA loose one {>>check timeline<<} here.\n'

test('parseComments finds anchored and loose comments in order, with AI badge', () => {
  const cs = parseComments(BODY)
  assert.equal(cs.length, 2)
  assert.equal(cs[0].n, 1)
  assert.equal(cs[0].anchor, 'the dog')
  assert.equal(cs[0].author, 'AI')
  assert.equal(cs[0].text, 'does the dog exist yet?')
  assert.equal(BODY.slice(cs[0].anchorFrom, cs[0].anchorTo), 'the dog')
  assert.equal(cs[1].anchor, '')
  assert.equal(cs[1].text, 'check timeline')
  assert.equal(cs[1].author, '')
})

test('addComment on a selection wraps it; with no selection inserts a loose comment', () => {
  const t = 'The girl screamed.'
  const r = addComment(t, 4, 8, 'which girl?')
  assert.equal(applyEdit(t, r), 'The {==girl==}{>>which girl?<<} screamed.')
  assert.equal(applyEdit(t, addComment(t, 18, 18, 'end?')), 'The girl screamed.{>>end?<<}')
  assert.equal(addComment(t, 0, 3, 'multi\nline <<} text').insert, '{==The==}{>>multi line << } text<<}')
})

test('resolve keeps the passage, edit keeps the AI badge', () => {
  const [a] = parseComments(BODY)
  assert.equal(applyEdit(BODY, resolveComment(a)).split('\n')[1], 'the dog bit him.')
  const e = applyEdit(BODY, editComment(a, 'resolved by me'))
  assert.ok(e.includes('{==the dog==}{>>AI: resolved by me<<}'))
  const loose = parseComments(BODY)[1]
  assert.equal(applyEdit(BODY, resolveComment(loose)).split('\n')[2], 'A loose one  here.')
})

test('comments do not count as words', () => {
  const t = '---\ntitle: x\n---\none {==two==}{>>a long comment with many words<<} three {>>more words here<<}\n'
  assert.equal(stripComments('a {==b==}{>>c d<<} e {>>f<<}'), 'a b e ')
  assert.equal(countWords(t), 3)
})

test('inline parser: bold, italic, both, strike, nesting, no false italics', () => {
  assert.equal(inline('**b** *i* ~~s~~ ***bi***'), '<strong>b</strong> <em>i</em> <s>s</s> <strong><em>bi</em></strong>')
  assert.equal(inline('a * b * c'), 'a * b * c')
  assert.equal(inline('2 * 3 and snake_case_name'), '2 * 3 and snake_case_name')
  assert.equal(inline('**bold with *italic* inside**'), '<strong>bold with <em>italic</em> inside</strong>')
})

test('formatting round trip: italic toggled inside bold re-parses as bold+italic', () => {
  const t = 'a **word** b'
  const r = italic(t, 4, 8)
  assert.equal(inline(applyEdit(t, r)), 'a <strong><em>word</em></strong> b')
})

test('comments render as numbered highlights; numbering continues across calls', () => {
  const ctx = { n: 0 }
  const h1 = render('one {==two==}{>>AI: why?<<}', ctx)
  assert.ok(h1.includes('<mark class="hl c-purple" id="cm-1">two</mark><sup class="cmk c-purple" data-n="1" title="why?">1</sup>'))
  const h2 = render('{>>loose<<}', ctx)
  assert.ok(h2.includes('data-n="2"'))
})

test('comment text and anchors are escaped', () => {
  const h = render('{==<b>x</b>==}{>><script>"q"<</script><<}'.replace('<</script>', '</script>'))
  assert.ok(!h.includes('<script'))
  assert.ok(!h.includes('<b>x'))
})

test('comment inside bold keeps working', () => {
  const nodes = parseInline('**very {==odd==}{>>hm<<} thing**')
  assert.equal(nodes[0].t, 'strong')
  assert.equal(nodes[0].c.find((n) => n.t === 'comment').text, 'hm')
})

test('parseBlocks groups lists and keeps one paragraph per line', () => {
  const b = parseBlocks('# T\nfirst\nsecond\n- a\n- b\n1. x\n\n* * *\n> q')
  assert.deepEqual(b.map((x) => x.type), ['h', 'p', 'p', 'list', 'list', 'hr', 'quote'])
  assert.equal(b[3].items.length, 2)
  assert.equal(b[3].ordered, false)
  assert.equal(b[4].ordered, true)
})
