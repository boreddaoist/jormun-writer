<script setup>
// Word-style zoom: minus, slider, plus and the percentage (click it for presets). Zoom changes how big the page
// and the notes are drawn; it does not change the font size you chose in Aa.
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { prefs, setZoom, stepZoom, ZOOM_MIN, ZOOM_MAX, ZOOM_PRESETS } from '../prefs.js'

const open = ref(false)
const root = ref(null)
function onDoc(e) {
  if (open.value && root.value && !root.value.contains(e.target)) open.value = false
}
onMounted(() => document.addEventListener('mousedown', onDoc))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDoc))
</script>

<template>
  <div ref="root" class="zoomctl">
    <button class="zbtn" title="Zoom out (Ctrl+-)" :disabled="prefs.zoom <= ZOOM_MIN" @click="stepZoom(-1)">−</button>
    <input
      class="zrange"
      type="range"
      :min="ZOOM_MIN"
      :max="ZOOM_MAX"
      step="10"
      :value="prefs.zoom"
      aria-label="Zoom"
      @input="setZoom(Number($event.target.value))"
    />
    <button class="zbtn" title="Zoom in (Ctrl+=)" :disabled="prefs.zoom >= ZOOM_MAX" @click="stepZoom(1)">+</button>
    <button class="zpct" title="Zoom presets. Ctrl+0 resets to 100%" @click="open = !open">{{ prefs.zoom }}%</button>
    <div v-if="open" class="zpop">
      <button v-for="z in ZOOM_PRESETS" :key="z" class="zitem" :class="{ on: prefs.zoom === z }" @click="setZoom(z); open = false">{{ z }}%</button>
    </div>
  </div>
</template>
