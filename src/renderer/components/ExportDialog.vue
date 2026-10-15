<script setup>
import { ref, computed } from 'vue'
import Modal from './Modal.vue'
import { state, chapters, titleOf, closeDialog, runExport } from '../store.js'
import { isChapter } from '@shared/text.mjs'
import { prefs } from '../prefs.js'

const format = ref('docx')
const scope = ref('all')
const includeComments = ref(false)
const titlePage = ref(true)
const title = ref((state.project && state.project.name) || '')
const busy = ref(false)

const canCurrent = computed(() => state.active && isChapter(state.active))
const count = computed(() => (scope.value === 'current' && canCurrent.value ? 1 : chapters.value.length))

async function go() {
  busy.value = true
  const ok = await runExport({
    format: format.value,
    scope: scope.value,
    title: title.value.trim(),
    author: prefs.author.trim(),
    includeComments: includeComments.value,
    titlePage: format.value === 'docx' && titlePage.value
  })
  busy.value = false
  if (ok) closeDialog()
}
</script>

<template>
  <Modal title="Export manuscript" :width="460" @close="closeDialog">
    <div class="field">
      <span>Format</span>
      <div class="seg">
        <button :class="{ on: format === 'docx' }" @click="format = 'docx'">Word (.docx)</button>
        <button :class="{ on: format === 'md' }" @click="format = 'md'">Markdown (.md)</button>
      </div>
    </div>
    <div class="field">
      <span>What</span>
      <div class="seg">
        <button :class="{ on: scope === 'all' }" @click="scope = 'all'">All chapters ({{ chapters.length }})</button>
        <button :class="{ on: scope === 'current' }" :disabled="!canCurrent" @click="scope = 'current'">
          Current chapter
        </button>
      </div>
      <small v-if="scope === 'current' && canCurrent" class="muted">{{ titleOf(state.active) }}</small>
    </div>
    <label class="field">
      <span>Book title</span>
      <input v-model="title" type="text" />
    </label>
    <label v-if="format === 'docx'" class="field">
      <span>Author</span>
      <input v-model="prefs.author" type="text" placeholder="Shown on the title page and on your notes" />
    </label>
    <label v-if="format === 'docx'" class="check"><input v-model="titlePage" type="checkbox" /> Title page</label>
    <label class="check"><input v-model="includeComments" type="checkbox" />
      Include notes <span class="muted small">{{ format === 'docx' ? '(as real Word comments)' : '(as {>>…<<} marks)' }}</span>
    </label>
    <template #footer>
      <button class="btn ghost" @click="closeDialog">Cancel</button>
      <button class="btn primary" :disabled="busy || !count" @click="go">Export…</button>
    </template>
  </Modal>
</template>
