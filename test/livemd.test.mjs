import test from 'node:test'
import assert from 'node:assert/strict'
import { parseInline } from '../src/shared/md.mjs'
import { describeLine, formatsAt, lineFormats, stackCards, emptiedTokenRange } from '../src/shared/livemd.mjs'
import { parseComments } from '../src/shared/comments.mjs'

const slice = (s, a, b) => s.slice(a, b)

test('inline nodes carry exact positions for bold, italic and strike', () => {
  const s = 'a **bold** and *it* and ~~gone~~'
  const [t1, strong, , em, , strike] = parseInline(s)
  assert.equal(slice(s, strong.from, strong.to), '**bold**')
  assert.equal(strong.open, 2)
  assert.equal(slice(s, strong.from + strong.open, strong.to - strong.close), 'bold')
  assert.equal(slice(s, em.from, em.to), '*it*')
  assert.equal(slice(s, strike.from + 2, strike.to - 2), 'gone')
  assert.equal(slice(s, t1.from, t1.to), 'a ')
})

test('positions are offset by base', () => {
  const nodes = parseInline('x **y**', 100)
  assert.equal(nodes[1].from, 102)
  assert.equal(nodes[1].to, 107)
})

test('bold+italic: em sits inside strong with correct marker lengths', () => {
  const s = '***both***'
  const [strong] = parseInline(s)
  assert.deepEqual([strong.from, strong.to, strong.open, strong.close], [0, 10, 2, 2])
  const em = strong.c[0]
  assert.deepEqual([em.from, em.to, em.open, em.close], [2, 8, 1, 1])
  assert.equal(slice(s, em.from + em.open, em.to - em.close), 'both')
})

test('nested italic inside bold keeps absolute positions', () => {
  const s = '**a *b* c**'
  const [strong] = parseInline(s)
  const em = strong.c.find((n) => n.t === 'em')
  assert.equal(slice(s, em.from, em.to), '*b*')
})

test('comment nodes expose anchor and text ranges, matching parseComments', () => {
  const s = 'He {==the dog==}{>>AI: which dog?<<} bit {>>loose<<} him.'
  const nodes = parseInline(s)
  const [c1, c2] = nodes.filter((n) => n.t === 'comment')
  assert.equal(slice(s, c1.anchorFrom, c1.anchorTo), 'the dog')
  assert.equal(slice(s, c1.textFrom, c1.textTo), 'AI: which dog?')
  assert.equal(slice(s, c1.from, c1.to), '{==the dog==}{>>AI: which dog?<<}')
  assert.equal(c2.anchor, null)
  assert.equal(slice(s, c2.from, c2.to), '{>>loose<<}')
  const pc = parseComments(s)
  assert.deepEqual(pc.map((c) => [c.from, c.to]), [[c1.from, c1.to], [c2.from, c2.to]])
})

test('describeLine classifies lines and gives the prefix length', () => {
  assert.deepEqual(pick(describeLine('# Title')), { type: 'h', level: 1, prefixLen: 2 })
  assert.deepEqual(pick(describeLine('### Deep')), { type: 'h', level: 3, prefixLen: 4 })
  assert.deepEqual(pick(describeLine('> said')), { type: 'quote', prefixLen: 2 })
  assert.deepEqual(pick(describeLine('- item')), { type: 'ul', prefixLen: 2 })
  assert.deepEqual(pick(describeLine('1. item')), { type: 'ol', prefixLen: 3 })
  assert.equal(describeLine('* * *').type, 'hr')
  assert.equal(describeLine('---').type, 'hr')
  assert.equal(describeLine('*italic* start').type, 'p')
  assert.equal(describeLine('plain').type, 'p')
})
const pick = (d) => ({ type: d.type, ...(d.level ? { level: d.level } : {}), prefixLen: d.prefixLen })

test('inline nodes after a prefix are positioned in the whole document', () => {
  const doc = 'first\n## a **b**'
  const lineFrom = 6
  const d = describeLine('## a **b**', lineFrom)
  const strong = d.nodes.find((n) => n.t === 'strong')
  assert.equal(doc.slice(strong.from, strong.to), '**b**')
})

test('formatsAt reports what is active at the caret', () => {
  const s = 'x **bold *both* y** z'
  const nodes = parseInline(s)
  assert.deepEqual(formatsAt(nodes, 0), { bold: false, italic: false, strike: false })
  assert.equal(formatsAt(nodes, 6).bold, true)
  assert.equal(formatsAt(nodes, 6).italic, false)
  const inBoth = s.indexOf('both') + 1
  assert.deepEqual(formatsAt(nodes, inBoth), { bold: true, italic: true, strike: false })
})

test('lineFormats flags headings, quotes and bullets', () => {
  assert.equal(lineFormats('## Hi').h2, true)
  assert.equal(lineFormats('### Hi').h3, true)
  assert.equal(lineFormats('# Hi').h2, false)
  assert.equal(lineFormats('> q').quote, true)
  assert.equal(lineFormats('- x').bullet, true)
})

test('emptiedTokenRange: deleting the only character inside a token removes the whole token', () => {
  const run = (s, d0, d1) => {
    const r = emptiedTokenRange(parseInline(s), d0, d1)
    return r ? s.slice(0, r.from) + s.slice(r.to) : null
  }
  assert.equal(run('a **b** c', 4, 5), 'a  c', 'one letter in bold: bold and its marks go')
  assert.equal(run('a **bc** c', 4, 5), null, 'two letters: only the letter goes, bold stays')
  assert.equal(run('x *y* z', 3, 4), 'x  z')
  assert.equal(run('~~q~~', 2, 3), '')
  assert.equal(run('***a***', 3, 4), '', 'bold+italic of one letter: both go')
  assert.equal(run('**a *b* c**', 5, 6), '**a  c**', 'only the emptied italic goes; the bold around it has other text and stays')
  assert.equal(run('plain text', 2, 3), null)
  assert.equal(run('{==x==}{>>n<<}', 3, 4), null, 'a one-letter note passage is not a format token')
  assert.equal(run('{==**x**==}{>>n<<}', 5, 6), '{====}{>>n<<}', 'bold inside a note passage is emptied correctly')
})

test('stackCards keeps cards level with their text and pushes overlaps down', () => {
  const items = [{ top: 100, height: 80 }, { top: 120, height: 60 }, { top: 400, height: 50 }]
  assert.deepEqual(stackCards(items, 10), [100, 190, 400])
  assert.deepEqual(stackCards([], 10), [])
  assert.deepEqual(stackCards([{ top: 5, height: 10 }], 10), [5])
})
