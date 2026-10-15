<script setup>
import { computed } from 'vue'
import { diffLines, diffWords } from 'diff'
import { splitFront } from '@shared/text.mjs'

const props = defineProps({ from: String, to: String })

// Paragraph-level diff; a removed paragraph followed by an added one is shown as one
// edited paragraph with word-level marks, so you see exactly which words the AI touched.
const rows = computed(() => {
  // Hide the frontmatter block when it did not change, so the diff starts at the prose.
  const a = splitFront(props.from || '')
  const b = splitFront(props.to || '')
  const same = a.front === b.front
  const parts = diffLines(same ? a.body : props.from || '', same ? b.body : props.to || '')
  const out = []
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (p.removed && parts[i + 1] && parts[i + 1].added) {
      out.push({ kind: 'mod', words: diffWords(p.value, parts[i + 1].value) })
      i++
    } else if (p.added) out.push({ kind: 'add', text: p.value.trim() })
    else if (p.removed) out.push({ kind: 'del', text: p.value.trim() })
    else {
      const lines = p.value.split('\n').filter((l) => l.trim())
      if (!lines.length) continue
      const shown = lines.length > 3 ? [lines[0], '…', lines[lines.length - 1]] : lines
      out.push({ kind: 'ctx', lines: shown })
    }
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
      <p v-else-if="r.kind === 'add'" class="row add">{{ r.text }}</p>
      <p v-else-if="r.kind === 'del'" class="row del">{{ r.text }}</p>
      <p v-else class="row mod"><template v-for="(w, j) in r.words" :key="j"><span :class="{ wadd: w.added, wdel: w.removed }">{{ w.value }}</span></template></p>
    </template>
  </div>
</template>
