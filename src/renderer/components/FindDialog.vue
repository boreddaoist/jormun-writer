<script setup>
// Find and replace across the whole project (Ctrl+Shift+F): see every match, jump to one, or replace them all.
import { ref, computed, onMounted } from 'vue'
import Modal from './Modal.vue'
import { state, rels, chapters, titleOf, closeDialog, setActive, replaceInProject, searchProject, toast } from '../store.js'
import { snippet } from '@shared/find.mjs'
import { splitFront } from '@shared/text.mjs'

const q = ref('')
const rq = ref('')
const matchCase = ref(false)
const wholeWord = ref(false)
const scope = ref(chapters.value.length ? 'book' : 'all')
const input = ref(null)
onMounted(() => input.value && input.value.focus())

const list = computed(() => (scope.value === 'book' ? chapters.value : rels.value))
const results = computed(() => (q.value ? searchProject(q.value, { matchCase: matchCase.value, wholeWord: wholeWord.value }, list.value) : []))
const total = computed(() => results.value.reduce((n, r) => n + r.matches.length, 0))
const LIMIT = 150
const shown = computed(() => {
  let left = LIMIT
  return results.value.map((r) => {
    const take = r.matches.slice(0, Math.max(0, left))
    left -= take.length
    return { ...r, take, more: r.matches.length - take.length }
  })
})

function go(rel, m) {
  const frontLen = splitFront(state.files[rel].buffer).front.length
  setActive(rel)
  state.jump = { rel, pos: Math.max(0, m.from - frontLen), t: Date.now() }
  closeDialog()
}
function replaceAll() {
  if (!total.value) return
  const files = results.value.length
  if (!window.confirm(`Replace ${total.value} match${total.value === 1 ? '' : 'es'} in ${files} file${files === 1 ? '' : 's'}?\n\n(Every file keeps its earlier versions in Version history.)`)) return
  const r = replaceInProject(q.value, rq.value, { matchCase: matchCase.value, wholeWord: wholeWord.value }, list.value)
  toast(`Replaced ${r.count} match${r.count === 1 ? '' : 'es'} in ${r.files} file${r.files === 1 ? '' : 's'}.`, 6000)
  closeDialog()
}
</script>

<template>
  <Modal title="Find in project" :width="760" @close="closeDialog">
    <div class="fp-top">
      <input ref="input" v-model="q" type="text" placeholder="Find" spellcheck="false" />
      <input v-model="rq" type="text" placeholder="Replace with" spellcheck="false" />
    </div>
    <div class="fp-opts">
      <label><input v-model="matchCase" type="checkbox" /> Match case</label>
      <label><input v-model="wholeWord" type="checkbox" /> Whole word</label>
      <label>
        In
        <select v-model="scope">
          <option value="book" :disabled="!chapters.length">The manuscript</option>
          <option value="all">The whole project (cards, plot, notes)</option>
        </select>
      </label>
      <span class="spacer"></span>
      <span class="muted small">{{ q ? (total ? total + ' match' + (total === 1 ? '' : 'es') + ' in ' + results.length + ' file' + (results.length === 1 ? '' : 's') : 'No matches') : '' }}</span>
    </div>
    <div class="fp-results">
      <section v-for="r in shown" :key="r.rel" class="fp-file">
        <h3>{{ titleOf(r.rel) }} <span class="muted small">{{ r.rel }} · {{ r.matches.length }}</span></h3>
        <button v-for="(m, i) in r.take" :key="i" class="fp-hit" @click="go(r.rel, m)">
          <template v-for="s in [snippet(r.text, m)]" :key="i">{{ s.before }}<mark>{{ s.hit }}</mark>{{ s.after }}</template>
        </button>
        <p v-if="r.more" class="muted small">…and {{ r.more }} more in this file</p>
      </section>
    </div>
    <template #footer>
      <button class="btn" @click="closeDialog">Close</button>
      <button class="btn primary" :disabled="!total" @click="replaceAll">Replace all{{ total ? ' (' + total + ')' : '' }}</button>
    </template>
  </Modal>
</template>
