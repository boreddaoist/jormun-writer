<script setup>
import { onMounted, onBeforeUnmount } from 'vue'

defineProps({ title: String, width: { type: Number, default: 420 } })
const emit = defineEmits(['close'])

function onKey(e) {
  if (e.key === 'Escape') { e.stopPropagation(); emit('close') }
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="modal-back" @mousedown.self="emit('close')">
    <div class="modal" role="dialog" :style="{ width: width + 'px' }">
      <header class="modal-head">
        <h2>{{ title }}</h2>
        <button class="icon-btn" title="Close (Esc)" @click="emit('close')">✕</button>
      </header>
      <div class="modal-body"><slot /></div>
      <footer v-if="$slots.footer" class="modal-foot"><slot name="footer" /></footer>
    </div>
  </div>
</template>
