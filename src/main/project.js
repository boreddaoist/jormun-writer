import { promises as fs } from 'fs'
import path from 'path'
import chokidar from 'chokidar'
import { normalize } from '../shared/text.mjs'
import { History } from './history.js'

const IGNORE_DIRS = new Set(['node_modules', '.git', '.obsidian', '.jormun', '.claude', '.vscode'])
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_TOTAL_BYTES = 60 * 1024 * 1024

const toRel = (root, abs) => path.relative(root, abs).split(path.sep).join('/')
const ignoredSegment = (seg) => seg.startsWith('.') || IGNORE_DIRS.has(seg)

// Every path the renderer sends goes through here: it must be a .md file inside the project.
export function resolveInside(root, rel) {
  if (typeof rel !== 'string' || !rel.toLowerCase().endsWith('.md')) {
    throw new Error('Only .md files inside the project can be used')
  }
  const abs = path.resolve(root, rel)
  const r = path.relative(root, abs)
  if (!r || r.startsWith('..') || path.isAbsolute(r)) throw new Error('Path is outside the project')
  if (r.split(path.sep).some(ignoredSegment)) throw new Error('Path is in an ignored folder')
  return abs
}

async function walk(dir, root, out) {
  let entries
  try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (ignoredSegment(e.name)) continue
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) await walk(abs, root, out)
    else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) out.push(abs)
  }
}

export class Project {
  constructor(root, emit) {
    this.root = path.resolve(root)
    this.name = path.basename(this.root)
    this.emit = emit
    this.known = new Map() // rel -> last text seen on disk (read, written, or reported)
    this.watcher = null
    this.history = new History(this.root)
    this.sessionSnap = new Set() // files whose state at the start of this session is already in the history
  }

  async keep(rel, text, reason) {
    try { await this.history.snapshot(rel, text, reason) } catch { /* history must never get in the way of writing */ }
  }

  async load() {
    const stat = await fs.stat(this.root)
    if (!stat.isDirectory()) throw new Error('Not a folder: ' + this.root)
    const abs = []
    await walk(this.root, this.root, abs)
    const files = []
    let total = 0
    for (const a of abs) {
      const st = await fs.stat(a)
      if (st.size > MAX_FILE_BYTES) continue
      total += st.size
      if (total > MAX_TOTAL_BYTES) break
      const text = normalize(await fs.readFile(a, 'utf8'))
      const rel = toRel(this.root, a)
      this.known.set(rel, text)
      files.push({ rel, text })
    }
    files.sort((x, y) => x.rel.localeCompare(y.rel, undefined, { numeric: true }))
    return { root: this.root, name: this.name, files }
  }

  startWatch() {
    this.watcher = chokidar.watch(this.root, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 },
      ignored: (p) => {
        const rel = toRel(this.root, p)
        return !!rel && rel.split('/').some(ignoredSegment)
      }
    })
    const upsert = async (abs) => {
      const rel = toRel(this.root, abs)
      if (!rel.toLowerCase().endsWith('.md')) return
      try {
        const st = await fs.stat(abs)
        if (st.size > MAX_FILE_BYTES) return
        const text = normalize(await fs.readFile(abs, 'utf8'))
        const had = this.known.has(rel)
        if (had && this.known.get(rel) === text) return // our own write, or no real change
        const prev = this.known.get(rel)
        this.known.set(rel, text)
        if (had) {
          // keep both sides of an outside edit, so the version before it can always be brought back
          await this.keep(rel, prev, 'before-outside-edit')
          await this.keep(rel, text, 'outside-edit')
        }
        this.emit({ type: had ? 'change' : 'add', rel, text })
      } catch { /* file vanished between event and read; unlink will follow */ }
    }
    this.watcher.on('add', upsert).on('change', upsert)
    this.watcher.on('unlink', (abs) => {
      const rel = toRel(this.root, abs)
      if (!rel.toLowerCase().endsWith('.md')) return
      const last = this.known.get(rel)
      this.known.delete(rel)
      if (last !== undefined) this.keep(rel, last, 'deleted')
      this.emit({ type: 'unlink', rel })
    })
  }

  async write(rel, text) {
    const abs = resolveInside(this.root, rel)
    const clean = normalize(text)
    const prev = this.known.get(rel)
    if (prev !== undefined && prev !== clean && !this.sessionSnap.has(rel)) {
      this.sessionSnap.add(rel)
      await this.keep(rel, prev, 'session-start') // how the file looked before this session changed it
    }
    await this.keep(rel, clean, 'autosave') // limited to one every few minutes
    this.known.set(rel, clean) // set first so the watcher treats the echo as ours
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, clean, 'utf8')
    return true
  }

  async create(rel, text) {
    const abs = resolveInside(this.root, rel)
    try {
      await fs.access(abs)
      throw new Error('File already exists: ' + rel)
    } catch (e) {
      if (e.code !== 'ENOENT') throw e
    }
    await this.write(rel, text)
    return true
  }

  async close() {
    if (this.watcher) await this.watcher.close()
    this.watcher = null
  }
}
