<script setup>
import { ref, onMounted } from 'vue'
import Modal from './Modal.vue'
import { closeDialog, createNewProject } from '../store.js'

const name = ref('')
const busy = ref(false)
const input = ref(null)
onMounted(() => input.value && input.value.focus())

async function submit() {
  if (!name.value.trim() || busy.value) return
  busy.value = true
  const ok = await createNewProject(name.value.trim())
  busy.value = false
  if (ok) closeDialog()
}
</script>

<template>
  <Modal title="New project" @close="closeDialog">
    <p class="muted small">
      Creates a folder with <b>Manuscript</b>, <b>Characters</b>, <b>Worldbuilding</b> and <b>Plot</b>, a first chapter,
      and a <code>CLAUDE.md</code> that tells an AI how to edit it. You pick where the folder goes next.
    </p>
    <label class="field">
      <span>Project name</span>
      <input ref="input" v-model="name" type="text" placeholder="My Novel" @keydown.enter="submit" />
    </label>
    <template #footer>
      <button class="btn ghost" @click="closeDialog">Cancel</button>
      <button class="btn primary" :disabled="!name.trim() || busy" @click="submit">Choose location…</button>
    </template>
  </Modal>
</template>
