import test from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions } from '../src/shared/version.mjs'

test('versions compare number by number, not as text', () => {
  assert.equal(compareVersions('0.3.2', '0.3.1'), 1)
  assert.equal(compareVersions('v0.10.0', '0.9.9'), 1)
  assert.equal(compareVersions('0.3.2', 'v0.3.2'), 0)
  assert.equal(compareVersions('0.2.0', '0.3.0'), -1)
  assert.equal(compareVersions('1', '0.9.9'), 1)
})
