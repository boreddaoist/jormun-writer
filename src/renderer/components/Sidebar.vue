<script setup>
// The Navigation pane: the document's H1 / H2 / H3 headings as a table of contents, like Word.
// Click a heading to jump to it; sections fold; the heading you are working under is highlighted.
import {
  state, visibleNav, activeNavId, manuscriptWords, toggleFold, goToHeading,
  newChapter, showManuscript, openDialog, notesWaiting, activeNotes
} from '../store.js'
import { prefs, toggleSidebar } from '../prefs.js'
import NotesPanel from './NotesPanel.vue'

defineProps({ collapsed: Boolean })

const flag = (rel) => {
  const f = state.files[rel]
  if (!f) return ''
  if (f.conflict) return '!'
  if (f.pending) return 'AI'
  if (f.deleted) return '×'
  return ''
}
// Right-click menus are native; the main process builds them (open, show in Explorer, copy path).
const menu = (kind, info) => window.jormun.fileMenu(kind, info)
</script>

<template>
  <aside class="sidebar" :class="{ collapsed }" :aria-hidden="collapsed">
    <div class="side-section scroll">
      <div class="side-title" @contextmenu.prevent="menu('chapters-header', {})">
        <button class="icon-btn side-toggle" title="Hide navigation (Ctrl+\)" @click="toggleSidebar">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <rect x="2.25" y="3.25" width="13.5" height="11.5" rx="2.25" /><path d="M7 3.5v11" /><path d="M4.2 7.2v3.6" stroke-width="2" />
          </svg>
        </button>
        <button
          class="side-link"
          :class="{ on: state.view === 'manuscript' }"
          title="Read all chapters as one document"
          @click="showManuscript"
        >Navigation</button>
        <span class="muted small">{{ manuscriptWords.toLocaleString() }} words</span>
        <button class="icon" title="Add a chapter (Ctrl+N)" @click="newChapter">+</button>
      </div>

      <div class="side-tabs" role="tablist">
        <button role="tab" :aria-selected="prefs.sideTab === 'nav'" :class="{ on: prefs.sideTab === 'nav' }" @click="prefs.sideTab = 'nav'">Headings</button>
        <button role="tab" :aria-selected="prefs.sideTab === 'notes'" :class="{ on: prefs.sideTab === 'notes' }" @click="prefs.sideTab = 'notes'">
          Notes<span v-if="activeNotes.length" class="tabcount" :class="{ hot: notesWaiting }" :title="notesWaiting ? notesWaiting + ' waiting for your answer' : activeNotes.length + ' notes'">{{ notesWaiting || activeNotes.length }}</span>
        </button>
      </div>

      <NotesPanel v-if="prefs.sideTab === 'notes'" />
      <ul v-else class="nav">
        <li
          v-for="(e, i) in visibleNav"
          :key="e.id"
          class="nav-item"
          :class="['lv' + e.level, { active: e.id === activeNavId, fb: e.fallback }]"
          :style="{ paddingLeft: 6 + (e.level - 1) * 14 + 'px' }"
          @click="goToHeading(e)"
          @contextmenu.prevent="menu('chapter', { rel: e.rel, pos: e.pos, fallback: e.fallback })"
        >
          <button v-if="e.hasKids" class="fold" :title="e.folded ? 'Expand' : 'Collapse'" @click.stop="toggleFold(e.id)">{{ e.folded ? '▸' : '▾' }}</button>
          <span v-else class="fold-space"></span>
          <span class="label">{{ e.text }}</span>
          <span v-if="flag(e.rel) && (i === 0 || visibleNav[i - 1].rel !== e.rel)" class="flag" :class="{ warn: flag(e.rel) === '!' }">{{ flag(e.rel) }}</span>
        </li>
        <li v-if="!visibleNav.length" class="muted small empty-note">
          No headings yet. Make a heading with H1, H2 or H3 in the toolbar and it appears here.
        </li>
      </ul>
    </div>

    <button class="side-foot" title="Jump to any file in the project (Ctrl+P)" @click="openDialog('quickOpen')">
      Open file… <kbd>Ctrl+P</kbd>
    </button>
  </aside>
</template>
