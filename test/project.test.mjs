import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Project, resolveInside } from '../src/main/project.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function makeProject() {
  const root = mkdtempSync(join(tmpdir(), 'jw-test-'))
  mkdirSync(join(root, 'Manuscript'))
  mkdirSync(join(root, 'Characters'))
  mkdirSync(join(root, '.obsidian'))
  writeFileSync(join(root, 'Manuscript', 'Chapter 01 - A.md'), '---\ntitle: A\n---\nHello\r\nworld\r\n')
  writeFileSync(join(root, 'Characters', 'Jun.md'), 'Jun')
  writeFileSync(join(root, 'Characters', 'image.png'), 'x')
  writeFileSync(join(root, '.obsidian', 'app.md'), 'hidden')
  return root
}

test('resolveInside blocks traversal, non-md and ignored folders', () => {
  const root = makeProject()
  assert.throws(() => resolveInside(root, '../evil.md'))
  assert.throws(() => resolveInside(root, 'Manuscript/x.txt'))
  assert.throws(() => resolveInside(root, '.obsidian/app.md'))
  assert.throws(() => resolveInside(root, '/etc/passwd.md'))
  assert.ok(resolveInside(root, 'Manuscript/Chapter 01 - A.md').endsWith('.md'))
  rmSync(root, { recursive: true, force: true })
})

test('load returns only visible .md files, with line endings normalised', async () => {
  const root = makeProject()
  const p = new Project(root, () => {})
  const data = await p.load()
  assert.deepEqual(data.files.map((f) => f.rel), ['Characters/Jun.md', 'Manuscript/Chapter 01 - A.md'])
  assert.equal(data.files[1].text, '---\ntitle: A\n---\nHello\nworld\n')
  rmSync(root, { recursive: true, force: true })
})

test('watcher reports outside edits but not the app\'s own writes', async () => {
  const root = makeProject()
  const events = []
  const p = new Project(root, (e) => events.push(e))
  await p.load()
  p.startWatch()
  await sleep(500)

  await p.write('Characters/Jun.md', 'Jun wrote this') // our own write
  await sleep(900)
  assert.equal(events.length, 0, 'own write must not echo back as an outside change')

  writeFileSync(join(root, 'Characters', 'Jun.md'), 'An AI rewrote this') // outside edit
  await sleep(900)
  assert.equal(events.length, 1)
  assert.deepEqual(events[0], { type: 'change', rel: 'Characters/Jun.md', text: 'An AI rewrote this' })

  writeFileSync(join(root, 'Manuscript', 'Chapter 02 - New.md'), 'fresh') // new file from outside
  await sleep(900)
  assert.ok(events.some((e) => e.type === 'add' && e.rel === 'Manuscript/Chapter 02 - New.md'))

  rmSync(join(root, 'Characters', 'Jun.md'))
  await sleep(900)
  assert.ok(events.some((e) => e.type === 'unlink' && e.rel === 'Characters/Jun.md'))

  await p.close()
  rmSync(root, { recursive: true, force: true })
})

test('create refuses to overwrite an existing file', async () => {
  const root = makeProject()
  const p = new Project(root, () => {})
  await p.load()
  await assert.rejects(() => p.create('Characters/Jun.md', 'x'), /already exists/)
  await p.create('Manuscript/Chapter 02 - B.md', 'new')
  assert.equal(readFileSync(join(root, 'Manuscript', 'Chapter 02 - B.md'), 'utf8'), 'new')
  assert.ok(existsSync(join(root, 'Manuscript')))
  rmSync(root, { recursive: true, force: true })
})

import { createProject, cleanProjectName } from '../src/main/scaffold.js'

test('createProject builds the folder structure and refuses an existing folder', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'jw-new-'))
  const root = await createProject(parent, 'My: Novel?', '# AI rules\n')
  assert.ok(root.endsWith('My Novel'), 'illegal characters are removed from the folder name')
  for (const f of ['Manuscript.md', 'Overview.md', 'CLAUDE.md']) {
    assert.ok(existsSync(join(root, f)), f)
  }
  for (const d of ['Characters', 'Worldbuilding', 'Plot']) assert.ok(existsSync(join(root, d)), d)
  assert.equal(readFileSync(join(root, 'CLAUDE.md'), 'utf8'), '# AI rules\n')
  await assert.rejects(() => createProject(parent, 'My Novel'), /already exists/)
  await assert.rejects(() => createProject(parent, '   ??  '), /name/)
  assert.equal(cleanProjectName('  a  b. '), 'a b')
  // and the new project loads and shows the chapter
  const p = new Project(root, () => {})
  const data = await p.load()
  assert.ok(data.files.some((f) => f.rel === 'Manuscript.md'))
  rmSync(parent, { recursive: true, force: true })
})

import { mergeManuscript, copyProject } from '../src/main/manage.js'

test('merge: chapter files become one Manuscript.md and the originals are kept in a hidden backup', async () => {
  const root = mkdtempSync(join(tmpdir(), 'jw-merge-'))
  mkdirSync(join(root, 'Manuscript'))
  writeFileSync(join(root, 'Manuscript', 'Chapter 02 - B.md'), 'second\n')
  writeFileSync(join(root, 'Manuscript', 'Chapter 10 - C.md'), 'tenth\n')
  writeFileSync(join(root, 'Manuscript', 'Chapter 01 - A.md'), '---\ntitle: First\n---\nfirst\n')
  writeFileSync(join(root, 'Manuscript', 'README.md'), 'keep me')
  const r = await mergeManuscript(root, 'Book')
  assert.equal(r.count, 3)
  const text = readFileSync(join(root, 'Manuscript.md'), 'utf8')
  assert.ok(text.indexOf('# First') < text.indexOf('# B') && text.indexOf('# B') < text.indexOf('# C'), 'numeric order: 01, 02, 10')
  assert.ok(existsSync(join(root, 'Manuscript', 'README.md')), 'README stays')
  assert.ok(!existsSync(join(root, 'Manuscript', 'Chapter 01 - A.md')), 'originals are moved away')
  assert.ok(existsSync(join(r.backup, 'Chapter 01 - A.md')), 'and kept in the backup')
  await assert.rejects(() => mergeManuscript(root, 'Book'), /already exists/)
  rmSync(root, { recursive: true, force: true })
})

test('save as: copies the project, refuses a folder inside it or one that already has files', async () => {
  const base = mkdtempSync(join(tmpdir(), 'jw-saveas-'))
  const src = join(base, 'proj')
  mkdirSync(join(src, 'Notes'), { recursive: true })
  mkdirSync(join(src, 'node_modules'))
  writeFileSync(join(src, 'Manuscript.md'), 'text')
  writeFileSync(join(src, 'Notes', 'a.md'), 'a')
  writeFileSync(join(src, 'node_modules', 'x.js'), 'x')
  await assert.rejects(() => copyProject(src, join(src, 'copy')), /outside/)
  const dest = join(base, 'elsewhere', 'proj copy')
  await copyProject(src, dest)
  assert.equal(readFileSync(join(dest, 'Manuscript.md'), 'utf8'), 'text')
  assert.ok(existsSync(join(dest, 'Notes', 'a.md')))
  assert.ok(!existsSync(join(dest, 'node_modules')), 'node_modules is not copied')
  await assert.rejects(() => copyProject(src, dest), /already has files/)
  rmSync(base, { recursive: true, force: true })
})
