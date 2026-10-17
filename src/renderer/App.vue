<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue'
import {
  state, startup, subscribe, pickProject, saveAll, reviewCount,
  newChapter, sectionOp, openDialog, openRecent, setActive, saveState, SAVE_LABELS, openNextReview, acceptAll
} from './store.js'
import { prefs, toggleSidebar, stepZoom, setZoom } from './prefs.js'
import { baseName } from '@shared/text.mjs'
import Sidebar from './components/Sidebar.vue'
import EditorPane from './components/EditorPane.vue'
import ManuscriptView from './components/ManuscriptView.vue'
import ProjectMenu from './components/ProjectMenu.vue'
import DialogHost from './components/DialogHost.vue'
import logo from './assets/logo.webp'

let unsubscribe = null
let unsubClose = null
let unsubUi = null

// The window asked to close: save everything first, and only warn if something truly can't be saved
// (an unresolved conflict, or a write that keeps failing).
async function handleClose() {
  await saveAll()
  const stuck = Object.entries(state.files).filter(([, f]) => f.conflict || f.error || f.buffer !== f.disk)
  if (stuck.length) {
    const names = stuck.slice(0, 5).map(([rel]) => baseName(rel)).join(', ')
    const ok = window.confirm(
      `${stuck.length} file(s) have changes that could not be saved:\n${names}\n\nClose anyway and lose those changes?`
    )
    if (!ok) return
  }
  await window.jormun.closeNow()
}

const SAVE_TIPS = {
  saved: 'Everything is saved. Your typing saves by itself, and edits made in VS Code appear here automatically. Click to save again now (Ctrl+S).',
  saving: 'Saving…',
  unsaved: 'You have changes that are not saved yet. They save automatically a moment after you stop typing. Click to save now (Ctrl+S).',
  error: 'A file could not be saved. Click to try again.',
  conflict: 'A file was changed in two places. Open it and choose which version to keep.'
}
const saveTip = computed(() => SAVE_TIPS[saveState.value])
// "Saved 14:02": the time of the last write, so you can see it is alive
const saveLabel = computed(() => {
  if (saveState.value !== 'saved' || !state.lastSaved) return SAVE_LABELS[saveState.value]
  return 'Saved ' + new Date(state.lastSaved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
})

function onKey(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveAll(); return }
  if (!(e.ctrlKey || e.metaKey) || state.dialog) return
  const k = e.key.toLowerCase()
  if (k === 'o') { e.preventDefault(); pickProject() }
  else if (k === 'p' && state.project) { e.preventDefault(); openDialog('quickOpen') }
  else if (k === 'n' && e.shiftKey) { e.preventDefault(); openDialog('newProject') }
  else if (k === 'f' && e.shiftKey && state.project) { e.preventDefault(); openDialog('find') }
  else if (k === 'f' && state.view === 'editor' && state.active) { e.preventDefault(); window.dispatchEvent(new Event('jw:find')) }
  else if (k === 'h' && e.shiftKey && state.active) { e.preventDefault(); openDialog('history', { rel: state.active }) }
  else if (k === 'n' && state.project) { e.preventDefault(); newChapter() }
  else if (e.key === '\\') { e.preventDefault(); toggleSidebar() }
  else if (e.key === '=' || e.key === '+') { e.preventDefault(); stepZoom(1) }
  else if (e.key === '-') { e.preventDefault(); stepZoom(-1) }
  else if (e.key === '0') { e.preventDefault(); setZoom(100) }
}
onMounted(async () => {
  unsubscribe = subscribe()
  unsubClose = window.jormun.onBeforeClose(handleClose)
  unsubUi = window.jormun.onUiAction((a) => {
    if (a.type === 'open') setActive(a.rel)
    else if (a.type === 'new-chapter') newChapter()
    else if (a.type === 'section') sectionOp(a.op, a.rel, a.pos)
  })
  window.addEventListener('keydown', onKey)
  window.addEventListener('blur', saveAll)
  await startup()
})
onBeforeUnmount(() => {
  if (unsubscribe) unsubscribe()
  if (unsubClose) unsubClose()
  if (unsubUi) unsubUi()
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('blur', saveAll)
})
</script>

<template>
  <div class="app">
    <header class="topbar">
      <ProjectMenu />
      <div class="spacer"></div>
      <button v-if="state.project" class="save-btn" :class="saveState" :title="saveTip" @click="saveAll">
        <span class="sdot"></span><span>{{ saveLabel }}</span>
      </button>
      <button v-if="reviewCount" class="review-pill" title="Open the next file with changes waiting for your decision" @click="openNextReview">{{ reviewCount }} to review</button>
      <button v-if="reviewCount" class="review-all" title="Keep every outside edit that is waiting (files with a conflict are skipped)" @click="acceptAll">Keep all</button>
    </header>

    <main v-if="state.project" class="body" :class="{ sbc: !prefs.sidebar }">
      <button v-if="!prefs.sidebar" class="icon-btn side-reopen" title="Show navigation (Ctrl+\)" @click="toggleSidebar">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <rect x="2.25" y="3.25" width="13.5" height="11.5" rx="2.25" /><path d="M7 3.5v11" />
        </svg>
      </button>
      <Sidebar :collapsed="!prefs.sidebar" />
      <ManuscriptView v-if="state.view === 'manuscript'" />
      <EditorPane v-else-if="state.active" :key="state.active" :rel="state.active" />
      <section v-else class="editor empty"><p class="muted">This project has no Markdown files yet.</p></section>
    </main>

    <main v-else class="welcome">
      <div v-if="state.loading" class="muted">Loading…</div>
      <div v-else class="welcome-card">
        <img class="logo big" :src="logo" alt="" draggable="false" />
        <h1>jormun</h1>
        <p>Write here; let an AI edit the same files in VS Code. Its changes appear here for you to keep or undo.</p>
        <div class="welcome-actions">
          <button class="btn primary big" @click="openDialog('newProject')">New project…</button>
          <button class="btn big" @click="pickProject">Open folder…</button>
        </div>
        <div v-if="state.recent.length" class="recent">
          <div class="menu-label">Recent</div>
          <button v-for="p in state.recent" :key="p.path" class="recent-item" :title="p.path" @click="openRecent(p.path)">
            <span>{{ p.name }}</span><span class="muted small path">{{ p.path }}</span>
          </button>
        </div>
      </div>
    </main>

    <DialogHost />

    <div class="toasts">
      <div v-for="t in state.toasts" :key="t.id" class="toast">{{ t.text }}</div>
    </div>
  </div>
</template>
