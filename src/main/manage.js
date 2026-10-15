// Project-level file management (no Electron here, so it can be tested): merge separate chapter files into one
// manuscript, and copy a whole project to another folder ("Save as").
import { promises as fs } from 'fs'
import path from 'path'
import { mergeChapters } from '../shared/sections.mjs'
import { normalize } from '../shared/text.mjs'

const exists = async (p) => { try { await fs.access(p); return true } catch { return false } }

// Manuscript/Chapter *.md  ->  Manuscript.md (one "# Heading" per chapter). The separate files are moved (not deleted)
// to .jormun/chapters-backup/<timestamp>/, which the app ignores, so nothing is lost.
export async function mergeManuscript(root, bookTitle) {
  const target = path.join(root, 'Manuscript.md')
  if (await exists(target)) throw new Error('Manuscript.md already exists in this project.')
  const dir = path.join(root, 'Manuscript')
  let names = []
  try { names = await fs.readdir(dir) } catch { /* no folder */ }
  names = names
    .filter((n) => /\.md$/i.test(n) && !/^README\.md$/i.test(n))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  if (!names.length) throw new Error('There are no chapter files in the Manuscript folder to merge.')
  const chapters = []
  for (const n of names) chapters.push({ rel: 'Manuscript/' + n, text: normalize(await fs.readFile(path.join(dir, n), 'utf8')) })
  await fs.writeFile(target, mergeChapters(chapters, bookTitle), 'utf8')
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-')
  const backup = path.join(root, '.jormun', 'chapters-backup', stamp)
  await fs.mkdir(backup, { recursive: true })
  for (const n of names) await fs.rename(path.join(dir, n), path.join(backup, n))
  return { count: names.length, backup }
}

// Copies the whole project folder (except node_modules) to `dest`, which must not exist yet (or be empty).
export async function copyProject(src, dest) {
  const s = path.resolve(src)
  const d = path.resolve(dest)
  const rel = path.relative(s, d)
  if (!rel || (!rel.startsWith('..') && !path.isAbsolute(rel))) throw new Error('Choose a folder outside the project itself.')
  const back = path.relative(d, s)
  if (!back.startsWith('..') && !path.isAbsolute(back)) throw new Error('Choose a folder that is not the parent of the project.')
  if (await exists(d)) {
    if ((await fs.readdir(d)).length) throw new Error('That folder already has files in it. Pick a new folder name.')
  }
  await fs.mkdir(path.dirname(d), { recursive: true })
  await fs.cp(s, d, { recursive: true, filter: (p) => path.basename(p) !== 'node_modules' })
  return d
}
