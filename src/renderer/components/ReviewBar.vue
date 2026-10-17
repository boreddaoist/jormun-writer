<script setup>
import { ref, computed } from 'vue'
import DiffView from './DiffView.vue'
import { acceptChange, rejectChange, resolveConflict, restoreDeleted, keepChange, undoChange } from '../store.js'

const props = defineProps({ rel: String, file: Object })
const open = ref(true)

const mode = computed(() => {
  if (props.file.deleted) return 'deleted'
  if (props.file.conflict) return 'conflict'
  if (props.file.pending) return 'pending'
  return ''
})
</script>

<template>
  <div v-if="mode" class="review" :class="mode">
    <template v-if="mode === 'pending'">
      <div class="review-head">
        <strong>Edited outside the app</strong>
        <span class="muted">(an AI in VS Code, git, or another editor). Already applied. Your call:</span>
        <span class="spacer"></span>
        <button class="btn ghost" @click="open = !open">{{ open ? 'Hide changes' : 'Show changes' }}</button>
        <button class="btn" @click="rejectChange(rel)">Undo AI changes</button>
        <button class="btn primary" @click="acceptChange(rel)">Keep</button>
      </div>
      <DiffView v-if="open" :from="file.pending.from" :to="file.pending.to" actions @keep="(i) => keepChange(rel, i)" @undo="(i) => undoChange(rel, i)" />
    </template>

    <template v-else-if="mode === 'conflict'">
      <div class="review-head">
        <strong>Changed in two places</strong>
        <span class="muted">You had unsaved typing when the file also changed outside. Nothing was overwritten.</span>
        <span class="spacer"></span>
        <button class="btn ghost" @click="open = !open">{{ open ? 'Hide' : 'Compare' }}</button>
        <button class="btn" @click="resolveConflict(rel, 'theirs')">Take outside version</button>
        <button class="btn primary" @click="resolveConflict(rel, 'mine')">Keep mine</button>
      </div>
      <DiffView v-if="open" :from="file.conflict.theirs" :to="file.conflict.mine" />
      <p v-if="open" class="muted small">Green is what only you have; red is what only the outside version has.</p>
    </template>

    <template v-else>
      <div class="review-head">
        <strong>This file was deleted or renamed on disk</strong>
        <span class="muted">Your text is still here.</span>
        <span class="spacer"></span>
        <button class="btn primary" @click="restoreDeleted(rel)">Save it again</button>
      </div>
    </template>
  </div>
</template>
