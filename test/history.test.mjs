import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { History } from '../src/main/history.js'
import { Project } from '../src/main/project.js'

const tmp = () => mkdtempSync(join(tmpdir(), 'jw-hist-'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

test('a snapshot is kept only when the text differs; autosaves are limited to one every few minutes', async () => {
  const root = tmp()
  let t = 1_700_000_000_000
  const h = new History(root, () => t)
  assert.ok(await h.snapshot('a.md', 'one', 'autosave'))
  assert.equal(await h.snapshot('a.md', 'one', 'session-start'), null, 'same text: nothing stored')
  t += 60_000
  assert.equal(await h.snapshot('a.md', 'two', 'autosave'), null, 'too soon after the last autosave')
  assert.ok(await h.snapshot('a.md', 'two', 'before-outside-edit'), 'important moments are always kept')
  t += 6 * 60_000
  assert.ok(await h.snapshot('a.md', 'three', 'autosave'), 'later autosaves are kept again')
  const list = await h.list('a.md')
  assert.deepEqual(list.map((x) => x.reason), ['autosave', 'before-outside-edit', 'autosave'])
  assert.ok(list[0].time > list[1].time && list[1].time > list[2].time, 'newest first')
  assert.equal(await h.read('a.md', list[2].id), 'one')
  assert.deepEqual(list.map((x) => x.words), [1, 1, 1])
  await assert.rejects(() => h.read('a.md', '../../x.md'))
  rmSync(root, { recursive: true, force: true })
})

test('paths with folders are stored safely and files stay separate', async () => {
  const root = tmp()
  const h = new History(root)
  await h.snapshot('Characters/Mo Lan.md', 'x', 'session-start')
  await h.snapshot('Manuscript.md', 'y', 'session-start')
  assert.equal((await h.list('Characters/Mo Lan.md')).length, 1)
  assert.equal((await h.list('Manuscript.md')).length, 1)
  assert.deepEqual(await h.list('Nope.md'), [])
  rmSync(root, { recursive: true, force: true })
})

test('old snapshots are thinned: the newest are all kept, older ones one per day', async () => {
  const root = tmp()
  let t = Date.UTC(2026, 0, 1)
  const h = new History(root, () => t)
  for (let i = 0; i < 200; i++) { t += 3_600_000; await h.snapshot('a.md', 'v' + i, 'session-start') } // one an hour for about 8 days
  const list = await h.list('a.md')
  assert.ok(list.length < 200 && list.length >= 120, 'thinned to ' + list.length)
  assert.equal(await h.read('a.md', list[0].id), 'v199', 'the newest survives')
  rmSync(root, { recursive: true, force: true })
})

test('a project keeps the start-of-session version, outside edits and deletions', async () => {
  const root = tmp()
  mkdirSync(join(root, 'Manuscript'))
  writeFileSync(join(root, 'Manuscript.md'), 'original\n')
  const p = new Project(root, () => {})
  await p.load()
  p.startWatch()
  try {
  await sleep(300)
  await p.write('Manuscript.md', 'typed once\n')
  await p.write('Manuscript.md', 'typed twice\n')
  let list = await p.history.list('Manuscript.md')
  const start = list.find((x) => x.reason === 'session-start')
  assert.ok(start)
  assert.equal(await p.history.read('Manuscript.md', start.id), 'original\n')
  writeFileSync(join(root, 'Manuscript.md'), 'an AI wrote this\n')
  await sleep(900)
  list = await p.history.list('Manuscript.md')
  assert.ok(list.some((x) => x.reason === 'before-outside-edit'))
  assert.ok(list.some((x) => x.reason === 'outside-edit'))
  rmSync(join(root, 'Manuscript.md'))
  await sleep(900)
  list = await p.history.list('Manuscript.md')
  assert.ok(list.some((x) => x.reason === 'deleted'), 'a deleted file can still be recovered')
  } finally {
    await p.close()
  }
  assert.ok(existsSync(join(root, '.jormun', 'history')))
  rmSync(root, { recursive: true, force: true })
})
