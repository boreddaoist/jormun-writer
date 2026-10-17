// Version history: a local copy of earlier versions of every file you write, kept next to the project in the hidden
// .jormun/history folder (so Word-style "restore an older version" works, and so does recovering a file that was
// deleted or overwritten from outside).
//
//   .jormun/history/<file path, URL-encoded>/<time in ms, 13 digits>-<reason>.md
//
// A snapshot is only kept when its text differs from the newest one. Routine autosaves are limited to one every few
// minutes; the important moments (start of a session, just before and just after an outside edit, before a restore,
// a deletion) are always kept.
import { promises as fs } from 'fs'
import path from 'path'

export const REASONS = ['autosave', 'session-start', 'before-outside-edit', 'outside-edit', 'before-restore', 'deleted']
const MIN_GAP_MS = 5 * 60 * 1000
const KEEP_RECENT = 120 // newest snapshots, all kept
const KEEP_DAYS = 60 // older ones: the last snapshot of each day, for this many days
const NAME = /^(\d{13})-([a-z-]+)\.md$/

const words = (t) => (t.match(/\S+/g) || []).length

export class History {
  constructor(root, now = () => Date.now()) {
    this.dir = path.join(root, '.jormun', 'history')
    this.now = now
    this.last = new Map() // rel -> { time, text } newest snapshot this session (avoids re-reading the folder)
  }

  folder(rel) {
    return path.join(this.dir, encodeURIComponent(rel))
  }

  async names(rel) {
    let list
    try { list = await fs.readdir(this.folder(rel)) } catch { return [] }
    return list.filter((n) => NAME.test(n)).sort().reverse() // newest first
  }

  async newest(rel) {
    const cached = this.last.get(rel)
    if (cached) return cached
    const [name] = await this.names(rel)
    if (!name) return null
    const text = await fs.readFile(path.join(this.folder(rel), name), 'utf8')
    const hit = { time: Number(NAME.exec(name)[1]), text }
    this.last.set(rel, hit)
    return hit
  }

  // Returns the snapshot id, or null when nothing was stored (same text as the newest one, or too soon after it).
  async snapshot(rel, text, reason = 'autosave') {
    if (!REASONS.includes(reason)) throw new Error('Unknown history reason: ' + reason)
    if (typeof text !== 'string') return null
    const prev = await this.newest(rel)
    const now = this.now()
    if (prev && prev.text === text && reason !== 'deleted') return null // a deletion is always marked, so the timeline shows it
    if (reason === 'autosave' && prev && now - prev.time < MIN_GAP_MS) return null
    const time = prev && now <= prev.time ? prev.time + 1 : now // keep names strictly increasing
    const id = `${String(time).padStart(13, '0')}-${reason}.md`
    await fs.mkdir(this.folder(rel), { recursive: true })
    await fs.writeFile(path.join(this.folder(rel), id), text, 'utf8')
    this.last.set(rel, { time, text })
    await this.prune(rel)
    return id
  }

  // [{ id, time, reason, bytes, words }] newest first
  async list(rel) {
    const out = []
    for (const id of await this.names(rel)) {
      const m = NAME.exec(id)
      const p = path.join(this.folder(rel), id)
      try {
        const text = await fs.readFile(p, 'utf8')
        out.push({ id, time: Number(m[1]), reason: m[2], bytes: Buffer.byteLength(text), words: words(text) })
      } catch { /* pruned while listing */ }
    }
    return out
  }

  async read(rel, id) {
    if (!NAME.test(id)) throw new Error('Bad history id')
    return fs.readFile(path.join(this.folder(rel), id), 'utf8')
  }

  async prune(rel) {
    const names = await this.names(rel)
    if (names.length <= KEEP_RECENT) return
    const keep = new Set(names.slice(0, KEEP_RECENT))
    const days = new Set()
    for (const n of names.slice(KEEP_RECENT)) {
      const day = Math.floor(Number(NAME.exec(n)[1]) / 86400000)
      if (days.size < KEEP_DAYS && !days.has(day)) { days.add(day); keep.add(n) } // names are newest first: the first of a day is its last
    }
    for (const n of names) {
      if (!keep.has(n)) await fs.rm(path.join(this.folder(rel), n), { force: true })
    }
  }
}
