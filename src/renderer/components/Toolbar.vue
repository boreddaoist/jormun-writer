<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { DIALECT_NAMES } from '../grammar.js'
import { prefs, FONTS, LINE_HEIGHTS, WIDTHS, SIZE_MIN, SIZE_MAX, bumpSize, ACCENTS } from '../prefs.js'

defineProps({
  commentCount: { type: Number, default: 0 },
  marginOpen: Boolean,
  formats: { type: Object, default: () => ({}) } // which formats are active at the cursor
})
const emit = defineEmits(['action', 'toggle-margin'])

// Buttons keep focus in the editor (mousedown would otherwise steal it and lose the selection).
const keep = (e) => e.preventDefault()

const fontOpen = ref(false)
const fontBox = ref(null)
function onDoc(e) {
  if (fontOpen.value && fontBox.value && !fontBox.value.contains(e.target)) fontOpen.value = false
}
onMounted(() => document.addEventListener('mousedown', onDoc))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDoc))
</script>

<template>
  <div class="toolbar" @mousedown="keep">
    <div class="tb-group">
      <button class="tb" title="Undo (Ctrl+Z)" @click="emit('action', 'undo')">↶</button>
      <button class="tb" title="Redo (Ctrl+Y)" @click="emit('action', 'redo')">↷</button>
    </div>
    <span class="tb-sep"></span>
    <div class="tb-group">
      <button class="tb b" :class="{ on: formats.bold }" title="Bold (Ctrl+B)" @click="emit('action', 'bold')">B</button>
      <button class="tb i" :class="{ on: formats.italic }" title="Italic (Ctrl+I)" @click="emit('action', 'italic')">I</button>
      <button class="tb s" :class="{ on: formats.strike }" title="Strikethrough" @click="emit('action', 'strike')">S</button>
    </div>
    <span class="tb-sep"></span>
    <div class="tb-group">
      <button class="tb" :class="{ on: formats.h1 }" title="Heading 1" @click="emit('action', 'h1')">H1</button>
      <button class="tb" :class="{ on: formats.h2 }" title="Heading 2" @click="emit('action', 'h2')">H2</button>
      <button class="tb" :class="{ on: formats.h3 }" title="Heading 3" @click="emit('action', 'h3')">H3</button>
      <button class="tb" :class="{ on: formats.bullet }" title="Bulleted list" @click="emit('action', 'bullet')">•</button>
      <button class="tb wide" title="Scene break" @click="emit('action', 'scene')">* * *</button>
    </div>

    <span class="spacer"></span>

    <div ref="fontBox" class="font-box" @mousedown.stop>
      <button class="tb text" :class="{ on: fontOpen }" title="Font, size, spacing and accent colour" @click="fontOpen = !fontOpen">Aa</button>
      <div v-if="fontOpen" class="pop">
        <label class="pop-row"><span>Font</span>
          <select v-model="prefs.font" class="tb-select">
            <option v-for="f in FONTS" :key="f.id" :value="f.id">{{ f.label }}</option>
          </select>
        </label>
        <div class="pop-row"><span>Size</span>
          <div class="tb-group">
            <button class="tb" title="Smaller (Ctrl+-)" :disabled="prefs.size <= SIZE_MIN" @click="bumpSize(-1)">−</button>
            <span class="tb-size">{{ prefs.size }}</span>
            <button class="tb" title="Larger (Ctrl+=)" :disabled="prefs.size >= SIZE_MAX" @click="bumpSize(1)">+</button>
          </div>
        </div>
        <label class="pop-row"><span>Spacing</span>
          <select v-model.number="prefs.lineHeight" class="tb-select">
            <option v-for="l in LINE_HEIGHTS" :key="l.value" :value="l.value">{{ l.label }}</option>
          </select>
        </label>
        <label class="pop-row"><span>Page width</span>
          <select v-model.number="prefs.width" class="tb-select">
            <option v-for="w in WIDTHS" :key="w.value" :value="w.value">{{ w.label }}</option>
          </select>
        </label>
        <div class="pop-row"><span>Accent</span>
          <div class="accent-dots">
            <button
              v-for="(a, id) in ACCENTS"
              :key="id"
              class="accent-dot"
              :class="[id, { on: prefs.accent === id }]"
              :title="a.label"
              @click="prefs.accent = id"
            ></button>
          </div>
        </div>
        <label class="pop-check" title="Offline grammar suggestions, underlined softly. You always decide: right-click an underline to fix or ignore it.">
          <input v-model="prefs.grammar" type="checkbox" /> Grammar suggestions
        </label>
        <label v-if="prefs.grammar" class="pop-row"><span>English</span>
          <select v-model="prefs.dialect" class="tb-select">
            <option v-for="d in DIALECT_NAMES" :key="d" :value="d">{{ d }}</option>
          </select>
        </label>
        <label class="pop-check" title="Off: ** # and note braces stay hidden, like in Word. On: they appear under the cursor.">
          <input v-model="prefs.reveal" type="checkbox" /> Show formatting marks
        </label>
      </div>
    </div>
  </div>
</template>
