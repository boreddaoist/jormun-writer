<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const openKofi = () => window.jormun.openKofi()
import {
  state, pickProject, openRecent, openDialog, revealProject, reloadProject, saveAll, newChapter, saveProjectAs, mergeChapters, looseChapters, checkForUpdates
} from '../store.js'
import { prefs, toggleSidebar } from '../prefs.js'
import logo from '../assets/logo.webp'

const open = ref(false)
const root = ref(null)
function onDoc(e) {
  if (open.value && root.value && !root.value.contains(e.target)) open.value = false
}
onMounted(() => document.addEventListener('mousedown', onDoc))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDoc))
const isCurrent = (p) => state.project && state.project.root.replace(/[\\/]+$/, '') === p.path.replace(/[\\/]+$/, '')

// 16px line icons (stroke paths), one per menu item
const ICON = {
  save: 'M3 2.5h8l2.5 2.5v8.5a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5v-10.5a.5.5 0 0 1 .5-.5zM5 2.5v3.5h5V2.5M5 14v-4h6v4',
  chapter: 'M4 2.5h6l3 3v8H4zM9.5 2.5v3.5H13M6.5 9h4M6.5 11.5h4',
  project: 'M2 4.5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1zM8 7.5v3.5M6.25 9.25h3.5',
  folder: 'M2 4.5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z',
  file: 'M4 2.5h5.5L13 6v7.5H4zM9.5 2.5V6H13',
  export: 'M8 2.5v7.5M5 5.5 8 2.5l3 3M3 10v3h10v-3',
  reveal: 'M2 4.5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1zM6 9.5h4',
  saveas: 'M3 2.5h8l2.5 2.5v4M5 2.5v3.5h5V2.5M3 2.5v11h5M12 10.5v4M10 12.5h4',
  merge: 'M3 3h5l1.5 1.5H13V8M3 3v9h4M9 10.5h5M11.5 8v5',
  heart: 'M8 13.5S2.5 10 2.5 6.2A2.9 2.9 0 0 1 8 5a2.9 2.9 0 0 1 5.5 1.2C13.5 10 8 13.5 8 13.5z',
  reload: 'M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3',
  find: 'M7 2.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 0 1 0-9zM10.3 10.3L13.5 13.5',
  history: 'M8 2.5a5.5 5.5 0 1 1-5.2 3.7M2.5 2.5v3.7h3.7M8 5v3.2l2.2 1.3',
  sidebar: 'M2.5 3.5h11v9h-11zM6.5 3.5v9'
}
</script>

<template>
  <div ref="root" class="menu">
    <button class="icon-btn menu-btn logo-btn" :class="{ on: open }" title="Menu" @click="open = !open">
      <img class="logo" :src="logo" alt="Jormun Writer" draggable="false" />
    </button>
    <button class="proj-btn" :class="{ on: open }" :title="state.project ? state.project.root : 'Projects'" @click="open = !open">
      <span class="pname">{{ state.project ? state.project.name : 'Projects' }}</span>
      <span class="caret">▾</span>
    </button>
    <div v-if="open" class="menu-pop" @click="open = false">
      <template v-if="state.project">
        <button class="menu-item" @click="saveAll"><svg class="mi-ic" viewBox="0 0 16 16"><path :d="ICON.save" /></svg>Save <kbd>Ctrl+S</kbd></button>
        <button class="menu-item" @click="saveProjectAs"><svg class="mi-ic" viewBox="0 0 16 16"><path :d="ICON.saveas" /></svg>Save project as…</button>
        <button class="menu-item" @click="newChapter"><svg class="mi-ic" viewBox="0 0 16 16"><path :d="ICON.chapter" /></svg>New chapter <kbd>Ctrl+N</kbd></button>
        <button class="menu-item" @click="openDialog('quickOpen')"><svg class="mi-ic" viewBox="0 0 16 16"><path :d="ICON.file" /></svg>Open file… <kbd>Ctrl+P</kbd></button>
        <div class="menu-sep"></div>
      </template>
      <button class="menu-item" @click="openDialog('newProject')"><svg class="mi-ic" viewBox="0 0 16 16"><path :d="ICON.project" /></svg>New project… <kbd>Ctrl+Shift+N</kbd></button>
      <button class="menu-item" @click="pickProject"><svg class="mi-ic" viewBox="0 0 16 16"><path :d="ICON.folder" /></svg>Open project folder… <kbd>Ctrl+O</kbd></button>
      <template v-if="state.recent.length">
        <div class="menu-sep"></div>
        <div class="menu-label">Recent projects</div>
        <button
          v-for="p in state.recent"
          :key="p.path"
          class="menu-item"
          :class="{ current: isCurrent(p) }"
          :disabled="isCurrent(p)"
          :title="p.path"
          @click="openRecent(p.path)"
        ><span class="mi-ic"></span>{{ p.name }}<span v-if="isCurrent(p)" class="mi-hint">open</span></button>
      </template>
      <template v-if="state.project">
        <div class="menu-sep"></div>
        <button v-if="looseChapters" class="menu-item" title="Put all chapter files into one Manuscript.md" @click="mergeChapters"><svg class="mi-ic" viewBox="0 0 16 16"><path :d="ICON.merge" /></svg>Merge chapters into one file…</button>
        <button class="menu-item" title="Find and replace across the whole project" @click="openDialog('find')"><svg class="mi-ic" viewBox="0 0 16 16"><path :d="ICON.find" /></svg>Find in project… <kbd>Ctrl+Shift+F</kbd></button>
        <button class="menu-item" :disabled="!state.active" title="Earlier versions of the open file" @click="openDialog('history', { rel: state.view === 'manuscript' && state.files['Manuscript.md'] ? 'Manuscript.md' : state.active })"><svg class="mi-ic" viewBox="0 0 16 16"><path :d="ICON.history" /></svg>Version history… <kbd>Ctrl+Shift+H</kbd></button>
        <button class="menu-item" @click="openDialog('export')"><svg class="mi-ic" viewBox="0 0 16 16"><path :d="ICON.export" /></svg>Export manuscript…</button>
        <button class="menu-item" @click="toggleSidebar"><svg class="mi-ic" viewBox="0 0 16 16"><path :d="ICON.sidebar" /></svg>{{ prefs.sidebar ? 'Hide' : 'Show' }} navigation <kbd>Ctrl+\</kbd></button>
        <div class="menu-sep"></div>
        <button class="menu-item" @click="revealProject"><svg class="mi-ic" viewBox="0 0 16 16"><path :d="ICON.reveal" /></svg>Show in File Explorer</button>
        <button class="menu-item" title="Re-read every file from disk" @click="reloadProject"><svg class="mi-ic" viewBox="0 0 16 16"><path :d="ICON.reload" /></svg>Reload from disk</button>
      </template>
      <div class="menu-sep"></div>
      <button class="menu-item" title="Asks GitHub for the newest release (the only time the app goes online, and only when you click)" @click="checkForUpdates"><svg class="mi-ic" viewBox="0 0 16 16"><path :d="ICON.reload" /></svg>Check for updates</button>
      <button class="menu-item" title="Opens ko-fi.com/boredjun in your browser" @click="openKofi"><svg class="mi-ic" viewBox="0 0 16 16"><path :d="ICON.heart" /></svg>Support on Ko-fi</button>
    </div>
  </div>
</template>
