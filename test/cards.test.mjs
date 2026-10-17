import test from 'node:test'
import assert from 'node:assert/strict'
import { cardIndex, cardAt, cardMarkdown } from '../src/shared/cards.mjs'

const files = [
  { rel: 'Manuscript.md', text: '# One\n\nText' },
  { rel: 'Characters/Mo Lan.md', text: '---\ntitle: Mo Lan\naliases: [Black Queen, Queen Mother, Mother Queen]\n---\n\n# Mo Lan\n\n> [!abstract] At a glance\n> Role: Queen\n\nThe Queen. _TBD_\n' },
  { rel: 'Characters/Mo Rou.md', text: '---\ntitle: Mo Rou\naliases: [Jinx]\n---\n\n# Mo Rou\n' },
  { rel: 'Templates/Character Sketch.md', text: '---\ntitle: Character Sketch\n---\n' }
]
const idx = cardIndex(files)

test('cards come from titles, file names and aliases; the manuscript and templates are left out', () => {
  const names = idx.map((c) => c.name)
  assert.ok(names.includes('Mo Lan') && names.includes('Black Queen') && names.includes('Jinx'))
  assert.ok(!names.includes('Character Sketch') && !names.some((n) => n === 'Manuscript'))
  assert.equal(idx[0].name.length >= idx[idx.length - 1].name.length, true, 'longest first')
})

test('the card under a position is found by any of its names', () => {
  const t = 'Jinx stole it while the Black Queen watched, and Jinxed things.'
  assert.equal(cardAt(idx, t, 2).rel, 'Characters/Mo Rou.md')
  assert.equal(cardAt(idx, t, t.indexOf('Queen') + 1).rel, 'Characters/Mo Lan.md')
  assert.equal(cardAt(idx, t, t.indexOf('stole')), null)
  assert.equal(cardAt(idx, t, t.indexOf('Jinxed') + 2), null, 'only whole words')
  assert.equal(cardAt(idx, 'mo lan smiled', 3).rel, 'Characters/Mo Lan.md', 'case does not matter')
})

test('a card is shown without frontmatter, with callouts as plain bold titles', () => {
  const md = cardMarkdown(files[1].text)
  assert.ok(!md.includes('---') && !md.includes('[!abstract]'))
  assert.ok(md.includes('> **At a glance**'))
  assert.ok(md.includes('The Queen. …'))
})
