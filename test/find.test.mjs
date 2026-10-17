import test from 'node:test'
import assert from 'node:assert/strict'
import { findMatches, replaceAllIn, snippet } from '../src/shared/find.mjs'

test('find ignores case by default and can match case', () => {
  const t = 'Jinx saw jinx and JINX.'
  assert.equal(findMatches(t, 'jinx').length, 3)
  assert.equal(findMatches(t, 'jinx', { matchCase: true }).length, 1)
  assert.deepEqual(findMatches(t, 'Jinx', { matchCase: true }), [{ from: 0, to: 4 }])
  assert.deepEqual(findMatches(t, ''), [], 'an empty query finds nothing')
})

test('whole word does not match inside longer words, and handles accents', () => {
  assert.equal(findMatches('Karma karmas karma.', 'karma', { wholeWord: true }).length, 2)
  assert.equal(findMatches('Karma karmas', 'karma').length, 2)
  assert.equal(findMatches('caffè caffès', 'caffè', { wholeWord: true }).length, 1)
})

test('special characters in the query are plain text', () => {
  assert.equal(findMatches('a (b) c. d*', '(b)').length, 1)
  assert.equal(findMatches('a.b a-b', 'a.b').length, 1)
  assert.equal(findMatches('x {>>note<<} y', '{>>').length, 1)
})

test('replace all returns the new text and the count, and the replacement is literal', () => {
  const r = replaceAllIn('Jinx and Jinx', 'Jinx', 'Mo Rou')
  assert.deepEqual(r, { text: 'Mo Rou and Mo Rou', count: 2 })
  assert.equal(replaceAllIn('a b', 'a', '$&').text, '$& b', 'no regex tricks in the replacement')
  assert.deepEqual(replaceAllIn('nothing', 'zzz', 'y'), { text: 'nothing', count: 0 })
})

test('snippets are one line and mark the match', () => {
  const t = 'first line\nthe quick brown fox jumps\nlast'
  const m = findMatches(t, 'brown')[0]
  const s = snippet(t, m, 12)
  assert.equal(s.hit, 'brown')
  assert.ok(!/\n/.test(s.before + s.after))
  assert.ok(s.before.endsWith('quick '))
})
