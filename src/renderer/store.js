import { reactive, computed } from 'vue'
import * as S from '@shared/sync.mjs'
import { splitFront, parseFront, countWords, baseName, nextChapterNumber, isChapter } from '@shared/text.mjs'
import { extractHeadings, visibleOutline } from '@shared/outline.mjs'
import { addChapter } from '@shared/sections.mjs'

const api = window.jormun
const SAVE_DELAY_MS = 700
export const state = reactive({
  project: null, // { root, name }
  files: {},     // rel -> sync state + { timer, saving, error }
  active: null,
  view: 'editor', // 'editor' | 'manuscript' (all chapters read as one document)
  dialog: null,   // { type: 'newProject' | 'export' | 'quickOpen', ...props }
  recent: [],     // [{ path, name }]
  nav: { rel: '', head: 0 },   // where the cursor is, so the outline can highlight the current heading
  jump: { rel: '', pos: 0, t: 0 }, // "go to this heading" request, picked up by the editor
  op: { rel: '', pos: 0, name: '', t: 0 }, // "rename / move / delete this section" request, picked up by the editor
  toasts: [],
  loading: true
})

// ---------- derived ----------
export const rels = computed(() => Object.keys(state.files).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })))
export const chapters = computed(() => rels.value.filter(isChapter))
// separate chapter files that could be merged into one Manuscript.md
export const looseChapters = computed(() => !state.files['Manuscript.md'] && chapters.value.length > 0)
export const activeFile = computed(() => (state.active ? state.files[state.active] : null))

export function titleOf(rel) {
  const f = state.files[rel]
  const t = f ? parseFront(splitFront(f.buffer).front).title : ''
  return t || baseName(rel)
}
export function statusOf(rel) {
  const f = state.files[rel]
  return f ? parseFront(splitFront(f.buffer).front).status || '' : ''
}
export const wordsOf = (rel) => (state.files[rel] ? countWords(state.files[rel].buffer) : 0)
export const manuscriptWords = computed(() => chapters.value.reduce((n, r) => n + wordsOf(r), 0))
export const reviewCount = computed(() => rels.value.filter((r) => state.files[r].pending || state.files[r].conflict).length)

// ---------- outline (the Navigation pane): the H1-H3 headings of the manuscript ----------
const outlineCache = new Map() // rel -> { text, entries }, so only an edited chapter is re-parsed
export const outline = computed(() => {
  const out = []
  for (const rel of chapters.value) {
    const text = state.files[rel].buffer
    let hit = outlineCache.get(rel)
    if (!hit || hit.text !== text) {
      const body = splitFront(text).body
      const hs = extractHeadings(body)
      const entries = hs.length
        ? hs.map((h, i) => ({ id: rel + '#' + i, rel, level: h.level, text: h.text, pos: h.pos, fallback: false }))
        : [{ id: rel + '#0', rel, level: 1, text: titleOf(rel), pos: 0, fallback: true }] // no headings: the file stays reachable by its title
      hit = { text, entries }
      outlineCache.set(rel, hit)
    }
    out.push(...hit.entries)
  }
  return out
})
const folded = reactive({}) // outline entry id -> true when collapsed
export const visibleNav = computed(() => visibleOutline(outline.value, folded))
export const toggleFold = (id) => { folded[id] = !folded[id] }
export const activeNavId = computed(() => {
  if (state.view !== 'editor' || state.nav.rel !== state.active) return ''
  let id = ''
  for (const e of outline.value) {
    if (e.rel !== state.nav.rel) continue
    if (e.pos <= state.nav.head) id = e.id
    else break
  }
  return id
})
export function setNav(rel, head) {
  if (state.nav.rel !== rel || state.nav.head !== head) state.nav = { rel, head }
}
export function goToHeading(entry) {
  setActive(entry.rel)
  state.jump = { rel: entry.rel, pos: entry.pos, t: Date.now() }
}

// One status for the whole project, shown in the title bar: the worst state of any file wins.
export const saveState = computed(() => {
  const files = Object.values(state.files)
  if (files.some((f) => f.conflict)) return 'conflict'
  if (files.some((f) => f.error)) return 'error'
  if (files.some((f) => f.saving)) return 'saving'
  if (files.some((f) => f.buffer !== f.disk)) return 'unsaved'
  return 'saved'
})
export const SAVE_LABELS = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved', error: 'Save failed', conflict: 'Needs your decision' }

// ---------- toasts ----------
let toastId = 0
export function toast(text, ms = 4000) {
  const id = ++toastId
  state.toasts.push({ id, text })
  setTimeout(() => {
    const i = state.toasts.findIndex((t) => t.id === id)
    if (i !== -1) state.toasts.splice(i, 1)
  }, ms)
}

// ---------- project ----------
function makeFile(text) {
  return { ...S.initState(text), timer: null, saving: false, error: '' }
}
const SYNC_KEYS = ['baseline', 'disk', 'buffer', 'pending', 'conflict', 'deleted']
function patch(rel, next) {
  const f = state.files[rel]
  if (!f) return
  for (const k of SYNC_KEYS) f[k] = next[k] // never touches timer / saving / error
}

export function loadProject(data) {
  for (const f of Object.values(state.files)) clearTimeout(f.timer)
  state.files = {}
  outlineCache.clear()
  for (const k of Object.keys(folded)) delete folded[k]
  for (const f of data.files) state.files[f.rel] = makeFile(f.text)
  state.project = { root: data.root, name: data.name }
  state.view = 'editor'
  state.dialog = null
  const first = data.files.find((f) => isChapter(f.rel)) || data.files[0]
  state.active = first ? first.rel : null
  refreshRecent()
}

export async function refreshRecent() {
  try { state.recent = await api.recentProjects() } catch { state.recent = [] }
}

export async function startup() {
  state.loading = true
  try {
    await refreshRecent()
    const data = await api.startupProject()
    if (data) loadProject(data)
  } finally {
    state.loading = false
  }
}

export async function pickProject() {
  await saveAll() // never drop the last second of typing when switching projects
  const data = await api.pickProject()
  if (data) loadProject(data)
}

// Re-read every file from disk (a manual "sync"). Saves first; asks before dropping anything that cannot be saved.
export async function reloadProject() {
  if (!state.project) return
  await saveAll()
  const stuck = Object.values(state.files).filter((f) => f.conflict || f.error || f.buffer !== f.disk).length
  if (stuck && !window.confirm(`${stuck} file(s) have changes that could not be saved. Reload from disk and lose them?`)) return
  try {
    loadProject(await api.openProject(state.project.root))
    toast('Reloaded from disk.')
  } catch (e) {
    toast('Could not reload: ' + String(e.message || e))
  }
}

export async function openRecent(dir) {
  await saveAll()
  try {
    loadProject(await api.openProject(dir))
  } catch (e) {
    toast(String(e.message || e).replace(/^Error invoking remote method '[^']*': (Error: )?/, ''))
    refreshRecent()
  }
}

// Asks for a parent folder (native dialog), creates <parent>/<name> and opens it.
export async function createNewProject(name) {
  await saveAll()
  try {
    const data = await api.createProject(name)
    if (data) loadProject(data)
    return !!data
  } catch (e) {
    toast(String(e.message || e).replace(/^Error invoking remote method '[^']*': (Error: )?/, ''))
    return false
  }
}

// ---------- dialogs + views ----------
export function openDialog(type, props = {}) { state.dialog = { type, ...props } }
export function closeDialog() { state.dialog = null }
export function showManuscript() { if (state.project) state.view = 'manuscript' }

export const revealProject = () => api.revealProject()

export function setActive(rel) {
  if (state.files[rel]) {
    state.active = rel
    state.view = 'editor'
  }
}

// The title-bar "n to review" button: open the next file that has an outside change or a conflict waiting.
export function openNextReview() {
  const rel = rels.value.find((r) => state.files[r].pending || state.files[r].conflict)
  if (rel) setActive(rel)
}

// ---------- editing + saving ----------
export function edit(rel, text) {
  const f = state.files[rel]
  if (!f) return
  const wasPending = !!f.pending
  patch(rel, S.applyUserEdit(f, text))
  if (wasPending && !f.pending) toast('Kept the AI changes because you kept writing on top of them.')
  scheduleSave(rel)
}

function scheduleSave(rel) {
  const f = state.files[rel]
  if (!f) return
  clearTimeout(f.timer)
  f.timer = setTimeout(() => save(rel), SAVE_DELAY_MS)
}

// `restore` is only for "Save it again": a file that was deleted or renamed from outside must NOT come back on its own
// (saveAll runs on every window blur, and it used to recreate such files from the stale buffer).
export async function save(rel, restore = false) {
  const f = state.files[rel]
  if (!f || f.conflict || f.saving) return
  clearTimeout(f.timer)
  const text = f.buffer
  if (text === f.disk && !(f.deleted && restore)) return
  f.saving = true
  f.error = ''
  try {
    await api.writeFile(rel, text)
    patch(rel, S.onSaved(f, text))
  } catch (e) {
    f.error = String(e.message || e)
  } finally {
    f.saving = false
  }
  if (f.buffer !== f.disk && !f.conflict) scheduleSave(rel) // typed during the save
}

export async function saveAll() {
  await Promise.all(Object.keys(state.files).map((r) => save(r)))
}

// ---------- outside changes (an AI in VS Code, git, Obsidian...) ----------
export function onFsEvent(ev) {
  if (!state.project) return
  const { type, rel, text } = ev
  if (type === 'unlink') {
    if (state.files[rel]) patch(rel, S.applyDeleted(state.files[rel]))
    return
  }
  if (!state.files[rel]) {
    state.files[rel] = makeFile(text)
    if (isChapter(rel)) toast('New chapter from outside: ' + baseName(rel))
    return
  }
  const f = state.files[rel]
  const before = f.pending ? f.pending.to : null
  patch(rel, S.applyExternal(f, text))
  if (f.conflict) toast('Changed in two places: ' + baseName(rel))
  else if (f.pending && f.pending.to !== before && rel !== state.active) toast('Edited from outside: ' + baseName(rel))
}

export function acceptChange(rel) {
  const f = state.files[rel]
  if (f) patch(rel, S.acceptPending(f))
}

// Keep every outside edit that is waiting. Files with a two-sided conflict need your own decision and are left alone.
export function acceptAll() {
  let n = 0
  for (const rel of Object.keys(state.files)) {
    const f = state.files[rel]
    if (f.pending && !f.conflict) { patch(rel, S.acceptPending(f)); n++ }
  }
  if (n) toast(n === 1 ? 'Kept 1 outside edit.' : `Kept ${n} outside edits.`)
}

export async function rejectChange(rel) {
  const f = state.files[rel]
  if (!f) return
  patch(rel, S.rejectPending(f))
  await save(rel)
  toast('Restored your version.')
}

export async function resolveConflict(rel, choice) {
  const f = state.files[rel]
  if (!f) return
  patch(rel, S.resolveConflict(f, choice))
  await save(rel)
}

// Bring back an older version from the history. The current text is stored in the history first, so a restore can be undone.
export async function restoreVersion(rel, text) {
  const f = state.files[rel]
  if (!f) return
  try { await api.historySnapshot(rel, f.buffer, 'before-restore') } catch { /* history is a safety net, not a gate */ }
  edit(rel, text)
  await save(rel, true)
  toast('Restored an earlier version. The version you had before is in the history too.', 6000)
}

export async function restoreDeleted(rel) {
  const f = state.files[rel]
  if (!f) return
  await save(rel, true)
}

// ---------- chapters ----------
export async function newChapter() {
  if (!state.project) return
  const single = state.files['Manuscript.md']
  if (single) {
    // the whole book is one file: a chapter is a new "# Chapter N" heading at the end
    const { front, body } = splitFront(single.buffer)
    const e = addChapter(body)
    edit('Manuscript.md', front + body.slice(0, e.from) + e.insert + body.slice(e.to))
    setActive('Manuscript.md')
    setTimeout(() => { state.jump = { rel: 'Manuscript.md', pos: e.headingPos, t: Date.now() } }, 60)
    return
  }
  const n = nextChapterNumber(rels.value)
  const rel = `Manuscript/Chapter ${String(n).padStart(2, '0')} - Untitled.md`
  const text = '---\ntitle: Untitled\nstatus: draft\n---\n\n'
  try {
    await api.createFile(rel, text)
    state.files[rel] = makeFile(text)
    setActive(rel)
  } catch (e) {
    toast('Could not create chapter: ' + (e.message || e))
  }
}

// Rename / move / delete the section a heading in the Navigation pane stands for. The editor does the edit
// (so Ctrl+Z works); this just points it at the right heading.
export function sectionOp(name, rel, pos) {
  if (!state.files[rel]) return
  if (name === 'delete' && !window.confirm('Delete this section and everything under it?\n\n(Ctrl+Z brings it back.)')) return
  setActive(rel)
  setTimeout(() => { state.op = { rel, pos, name, t: Date.now() } }, 60)
}

// Put every chapter file into one Manuscript.md (the files are kept in a hidden backup folder).
export async function mergeChapters() {
  if (!state.project || !looseChapters.value) return
  await saveAll()
  try {
    const r = await api.mergeChapters()
    if (!r) return
    loadProject(r.data)
    toast(`Merged ${r.count} chapters into Manuscript.md. The separate files are kept in .jormun/chapters-backup.`, 9000)
  } catch (e) {
    toast('Could not merge: ' + String(e.message || e))
  }
}

// Copy the whole project to a new folder and carry on in the copy.
export async function saveProjectAs() {
  if (!state.project) return
  await saveAll()
  try {
    const data = await api.saveProjectAs()
    if (!data) return
    loadProject(data)
    toast('Saved a copy and switched to it: ' + data.root, 7000)
  } catch (e) {
    toast('Could not save a copy: ' + String(e.message || e))
  }
}

// ---------- export ----------
export async function runExport(opts) {
  const list = opts.scope === 'current' && state.active && isChapter(state.active) ? [state.active] : chapters.value
  if (!list.length) { toast('There are no chapters to export.'); return false }
  const payload = {
    format: opts.format,
    title: opts.title || (state.project && state.project.name) || 'Manuscript',
    author: opts.author || '',
    includeComments: !!opts.includeComments,
    titlePage: !!opts.titlePage,
    // the single-file manuscript has its own # headings, so it is exported without an extra title above them
    chapters: list.map((rel) => ({ title: rel === 'Manuscript.md' ? '' : titleOf(rel), text: state.files[rel].buffer }))
  }
  try {
    const out = await api.exportRun(payload)
    if (out) toast('Exported: ' + out, 6000)
    return !!out
  } catch (e) {
    toast('Export failed: ' + String(e.message || e))
    return false
  }
}

export function subscribe() {
  return api.onFsEvent(onFsEvent)
}

// Test hook: lets the automated checks drive the same functions the menus call.
if (typeof window !== 'undefined') window.__jwStore = { state, sectionOp, newChapter, mergeChapters, saveProjectAs, outline, edit, openDialog, restoreVersion }
