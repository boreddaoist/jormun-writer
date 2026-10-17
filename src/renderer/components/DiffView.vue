<script setup>
import { computed } from 'vue'
import { diffWords } from 'diff'
import { splitFront } from '@shared/text.mjs'
import { analyze } from '@shared/hunks.mjs'

const props = defineProps({ from: String, to: String, actions: Boolean })
const emit = defineEmits(['keep', 'undo'])

// Paragraph-level diff; a removed paragraph followed by an added one is shown as one
// edited paragraph with word-level marks, so you see exactly which words the AI touched.
const rows = computed(() => {
  // Hide the frontmatter block when it did not change, so the diff starts at the prose.
  const out = []
  for (const r of analyze(props.from, props.to).rows) {
    if (r.kind === 'ctx') out.push(r)
    else if (r.old.trim() && r.new.trim()) out.push({ kind: 'mod', hunk: r.hunk, words: diffWords(r.old, r.new) })
    else if (r.new.trim()) out.push({ kind: 'add', hunk: r.hunk, text: r.new.trim() })
    else out.push({ kind: 'del', hunk: r.hunk, text: r.old.trim() })
  }
  return out
})

const stats = computed(() => {
  let add = 0
  let del = 0
  const count = (s) => (s.match(/\S+/g) || []).length
  for (const r of rows.value) {
    if (r.kind === 'add') add += count(r.text)
    else if (r.kind === 'del') del += count(r.text)
    else if (r.kind === 'mod') {
      for (const w of r.words) {
        if (w.added) add += count(w.value)
        else if (w.removed) del += count(w.value)
      }
    }
  }
  return { add, del }
})

defineExpose({ stats })
</script>

<template>
  <div class="diff">
    <div class="diff-stats">
      <span class="plus">+{{ stats.add }} words</span>
      <span class="minus">−{{ stats.del }} words</span>
    </div>
    <template v-for="(r, i) in rows" :key="i">
      <p v-if="r.kind === 'ctx'" class="row ctx"><template v-for="(l, j) in r.lines" :key="j">{{ l }}<br /></template></p>
      <div v-else class="hunk" :class="{ acts: actions }">
        <p v-if="r.kind === 'add'" class="row add">{{ r.text }}</p>
        <p v-else-if="r.kind === 'del'" class="row del">{{ r.text }}</p>
        <p v-else class="row mod"><template v-for="(w, j) in r.words" :key="j"><span :class="{ wadd: w.added, wdel: w.removed }">{{ w.value }}</span></template></p>
        <span v-if="actions" class="hunk-btns">
          <button class="btn mini" title="Undo just this change" @click="emit('undo', r.hunk)">Undo</button>
          <button class="btn mini primary" title="Keep just this change" @click="emit('keep', r.hunk)">Keep</button>
        </span>
      </div>
    </template>
  </div>
</template>
