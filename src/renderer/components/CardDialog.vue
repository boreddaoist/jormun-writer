<script setup>
// A character or place card, read in a pop-up so you never leave the chapter you are writing.
import { computed } from 'vue'
import Modal from './Modal.vue'
import { state, closeDialog, setActive, titleOf } from '../store.js'
import { render } from '@shared/md.mjs'
import { cardMarkdown } from '@shared/cards.mjs'

const rel = computed(() => state.dialog.rel)
const html = computed(() => (state.files[rel.value] ? render(cardMarkdown(state.files[rel.value].buffer)) : ''))
function open() {
  setActive(rel.value)
  closeDialog()
}
</script>

<template>
  <Modal :title="titleOf(rel)" :width="640" @close="closeDialog">
    <div class="card-peek" v-html="html"></div>
    <template #footer>
      <button class="btn" @click="closeDialog">Close</button>
      <button class="btn primary" title="Open this card in the editor" @click="open">Open card</button>
    </template>
  </Modal>
</template>
