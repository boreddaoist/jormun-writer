<script setup>
// Every note of the open file in one list, like Word's Review pane: who wrote it, whether it waits for your answer,
// a click jumps to it, and you can resolve one or all of the ones you are looking at.
import { ref, computed } from 'vue'
import { state, activeNotes, resolveNotes, toast } from '../store.js'
import { threadStatus } from '@shared/comments.mjs'
import { prefs } from '../prefs.js'

const filter = ref('all')
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'waiting', label: 'Waiting for me' },
  { id: 'mine', label: 'Mine' },
  { id: 'ai', label: 'AI' }
]

const rows = computed(() => activeNotes.value.map((c) => ({ c, st: threadStatus(c) })))
const counts = computed(() => ({
  all: rows.value.length,
  waiting: rows.value.filter((r) => r.st.waiting).length,
  mine: rows.value.filter((r) => r.st.started === 'you').length,
  ai: rows.value.filter((r) => r.st.started === 'AI').length
}))
const shown = computed(() => rows.value.filter((r) => {
  if (filter.value === 'waiting') return r.st.waiting
  if (filter.value === 'mine') return r.st.started === 'you'
  if (filter.value === 'ai') return r.st.started === 'AI'
  return true
}))

const label = (r) => {
  if (r.st.waiting) return 'Waiting for your answer'
  if (r.st.started === 'AI') return r.st.replies ? 'You answered' : 'AI note'
  return r.st.replies ? 'AI answered' : 'Your note'
}
const firstText = (c) => (c.messages && c.messages.length ? c.messages[0].text : c.text)
const lastText = (c) => (c.messages && c.messages.length ? c.messages[c.messages.length - 1].text : c.text)

function go(c) {
  prefs.margin = true
  state.jump = { rel: state.active, pos: c.anchor ? c.anchorFrom : c.from, t: Date.now() }
}
function resolveOne(c) {
  resolveNotes(state.active, [c])
}
function resolveShown() {
  const list = shown.value.map((r) => r.c)
  if (!list.length) return
  if (!window.confirm(`Resolve ${list.length} note${list.length === 1 ? '' : 's'}?\n\nThe notes are removed and the text under them stays. (Version history keeps the file as it was.)`)) return
  const n = resolveNotes(state.active, list)
  toast(`Resolved ${n} note${n === 1 ? '' : 's'}.`)
}
</script>

<template>
  <div class="notes-panel">
    <div class="np-filters">
      <button v-for="f in FILTERS" :key="f.id" :class="{ on: filter === f.id }" @click="filter = f.id">{{ f.label }} {{ counts[f.id] }}</button>
    </div>
    <ul class="np-list">
      <li v-for="r in shown" :key="r.c.from" class="np-item" @click="go(r.c)">
        <div class="np-top">
          <span class="np-dot" :class="{ ai: r.st.started === 'AI' }"></span>
          <span class="np-anchor">{{ r.c.anchor || 'Note without a passage' }}</span>
        </div>
        <div class="np-text">{{ r.st.replies ? lastText(r.c) : firstText(r.c) }}</div>
        <div class="np-foot">
          <span class="np-chip" :class="{ wait: r.st.waiting }">{{ label(r) }}</span>
          <span v-if="r.st.replies">{{ r.st.replies }} repl{{ r.st.replies === 1 ? 'y' : 'ies' }}</span>
          <button class="np-resolve" title="Resolve: remove this note, keep the text" @click.stop="resolveOne(r.c)">Resolve</button>
        </div>
      </li>
      <li v-if="!shown.length" class="muted small empty-note">{{ rows.length ? 'No notes match this filter.' : 'No notes in this file. Select a passage and right-click to add one.' }}</li>
    </ul>
    <button v-if="shown.length > 1" class="btn np-bulk" @click="resolveShown">Resolve these {{ shown.length }}</button>
  </div>
</template>
