<script setup>
// Version history of the open file: pick an earlier version, see what restoring it would change, restore it.
import { ref, computed, onMounted } from 'vue'
import Modal from './Modal.vue'
import DiffView from './DiffView.vue'
import { state, closeDialog, restoreVersion, titleOf } from '../store.js'
import { baseName } from '@shared/text.mjs'

const rel = computed(() => state.dialog.rel)
const items = ref([])
const loading = ref(true)
const picked = ref('')
const pickedText = ref('')
const failed = ref('')

const LABELS = {
  autosave: 'Saved',
  'session-start': 'Before this session',
  'before-outside-edit': 'Before an outside edit',
  'outside-edit': 'After an outside edit',
  'before-restore': 'Before a restore',
  deleted: 'File deleted'
}
const current = computed(() => (state.files[rel.value] ? state.files[rel.value].buffer : ''))
const wordsOf = (t) => (t.match(/\S+/g) || []).length

function when(ms) {
  const d = new Date(ms)
  const today = new Date()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const sameDay = d.toDateString() === today.toDateString()
  const y = new Date(today.getTime() - 86400000)
  if (sameDay) return 'Today, ' + time
  if (d.toDateString() === y.toDateString()) return 'Yesterday, ' + time
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ', ' + time
}

async function pick(id) {
  picked.value = id
  pickedText.value = ''
  failed.value = ''
  try {
    pickedText.value = await window.jormun.historyRead(rel.value, id)
  } catch (e) {
    failed.value = 'Could not read this version.'
  }
}

onMounted(async () => {
  try {
    items.value = await window.jormun.historyList(rel.value)
  } catch {
    items.value = []
  }
  loading.value = false
  if (items.value.length) pick(items.value[0].id)
})

const delta = (it) => it.words - wordsOf(current.value)
const canRestore = computed(() => !!picked.value && !failed.value && pickedText.value !== '' && pickedText.value !== current.value)

async function restore() {
  await restoreVersion(rel.value, pickedText.value)
  closeDialog()
}
</script>

<template>
  <Modal :title="'Version history: ' + (titleOf(rel) || baseName(rel))" :width="1000" @close="closeDialog">
    <p v-if="loading" class="muted">Loading…</p>
    <p v-else-if="!items.length" class="muted">
      No earlier versions yet. The app keeps a copy of this file every few minutes while you write, and always before and after an outside edit
      (an AI in VS Code, git, Obsidian) and before a restore.
    </p>
    <div v-else class="hist">
      <ul class="hist-list">
        <li v-for="it in items" :key="it.id" :class="{ on: it.id === picked }" @click="pick(it.id)">
          <div class="hist-when">{{ when(it.time) }}</div>
          <div class="hist-why">{{ LABELS[it.reason] || it.reason }}</div>
          <div class="hist-words">{{ it.words.toLocaleString() }} words<span v-if="delta(it)" :class="delta(it) > 0 ? 'plus' : 'minus'"> ({{ delta(it) > 0 ? '+' : '' }}{{ delta(it).toLocaleString() }} vs now)</span></div>
        </li>
      </ul>
      <div class="hist-view">
        <p v-if="failed" class="muted">{{ failed }}</p>
        <template v-else-if="pickedText !== ''">
          <p v-if="pickedText === current" class="muted">This version is the same as the current text.</p>
          <template v-else>
            <p class="muted small">If you restore this version, the text changes like this (green is added back, red is removed):</p>
            <DiffView :from="current" :to="pickedText" />
          </template>
        </template>
      </div>
    </div>
    <template #footer>
      <button class="btn" @click="closeDialog">Close</button>
      <button class="btn primary" :disabled="!canRestore" @click="restore">Restore this version</button>
    </template>
  </Modal>
</template>
