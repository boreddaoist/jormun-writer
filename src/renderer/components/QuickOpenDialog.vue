<script setup>
// "Open file…" (Ctrl+P): jump to any Markdown file in the project by typing part of its name.
import { ref, computed, watch, onMounted } from 'vue'
import Modal from './Modal.vue'
import { rels, titleOf, closeDialog, setActive } from '../store.js'

const q = ref('')
const idx = ref(0)
const input = ref(null)
onMounted(() => input.value && input.value.focus())

const items = computed(() => {
  const s = q.value.trim().toLowerCase()
  return rels.value.filter((r) => !s || r.toLowerCase().includes(s) || titleOf(r).toLowerCase().includes(s)).slice(0, 14)
})
watch(q, () => { idx.value = 0 })

function open(rel) {
  setActive(rel)
  closeDialog()
}
function onKey(e) {
  if (e.key === 'ArrowDown') { e.preventDefault(); idx.value = Math.min(idx.value + 1, items.value.length - 1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); idx.value = Math.max(idx.value - 1, 0) }
  else if (e.key === 'Enter') {
    const r = items.value[idx.value]
    if (r) open(r)
  }
}
</script>

<template>
  <Modal title="Open file" :width="540" @close="closeDialog">
    <label class="field">
      <input ref="input" v-model="q" type="text" placeholder="Type part of a file name…" @keydown="onKey" />
    </label>
    <ul class="qo-list">
      <li v-for="(r, i) in items" :key="r" :class="{ on: i === idx }" @click="open(r)" @mousemove="idx = i">
        <span class="qo-title">{{ titleOf(r) }}</span>
        <span class="muted small qo-path">{{ r }}</span>
      </li>
      <li v-if="!items.length" class="muted small qo-empty">No matching files.</li>
    </ul>
  </Modal>
</template>
