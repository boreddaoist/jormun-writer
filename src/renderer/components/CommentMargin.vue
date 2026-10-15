<script setup>
// Word-style note balloons in the right margin. Each card sits level with the text it belongs to;
// cards that would overlap are pushed down (stackCards). Items come from the editor with a viewport-relative `top`.
import { ref, reactive, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { stackCards } from '@shared/livemd.mjs'
import { prefs } from '../prefs.js'

const props = defineProps({
  items: { type: Array, default: () => [] }, // { key, top, kind: 'comment'|'composer', comment?, anchor? }
  activeKey: { type: String, default: '' },
  expanded: { type: Boolean, default: true }, // false = slim strip of note dots; true = full cards (Word opens the pane on click)
  editRequest: { type: Object, default: () => ({ key: '', t: 0 }) } // asks a card to open its editor (right-click -> Edit note)
})
const emit = defineEmits(['select', 'resolve', 'save-edit', 'submit', 'cancel', 'reply', 'settled'])

const heights = reactive({})
const els = {}
const draft = ref('')

const ro = typeof ResizeObserver !== 'undefined'
  ? new ResizeObserver((entries) => {
      for (const e of entries) {
        const k = e.target.dataset.key
        if (k) heights[k] = Math.ceil(e.target.getBoundingClientRect().height)
      }
    })
  : null

function setEl(key, el) {
  if (el) {
    if (els[key] !== el) {
      if (els[key] && ro) ro.unobserve(els[key])
      els[key] = el
      el.dataset.key = key
      if (ro) ro.observe(el)
      heights[key] = Math.ceil(el.getBoundingClientRect().height)
    }
  } else if (els[key]) {
    if (ro) ro.unobserve(els[key])
    delete els[key]
  }
}
onBeforeUnmount(() => { if (ro) ro.disconnect() })

// only the selected note is a full card; every other note stays a small dot (and the whole strip is dots when nothing is selected)
const isDot = (i) => i.kind === 'comment' && (!props.expanded || i.key !== props.activeKey)
// A thin line from the end of the noted text's first line across the gutter to the open card (an elbow when
// the card was pushed down).
const aside = ref(null)
const link = computed(() => {
  const it = props.items.find((i) => i.key === props.activeKey)
  if (!props.expanded || !it || !aside.value || !it.ax) return null
  const asideLeft = aside.value.getBoundingClientRect().left
  const x0 = Math.min(it.ax - asideLeft, -20) // start (relative to the margin's left edge)
  const x1 = -12 // the open card is nudged 12px left
  const yC = tops.value[it.key] || 0 // the card's top edge
  const yA = it.top // along the top edge of the text: straight across into the card's top-left corner (a bend only if the card was pushed down)
  const top = Math.min(yA, yC)
  const h = Math.abs(yA - yC)
  return { color: it.comment ? it.comment.color : 'blue', left: x0, w: x1 - x0, top, h: h + 2, a: yA - top + 1, c: yC - top + 1 }
})
const sorted = computed(() => [...props.items].sort((a, b) => a.top - b.top))
const tops = computed(() => {
  const arr = stackCards(sorted.value.map((i) => ({ top: i.top, height: isDot(i) ? 34 : heights[i.key] || 96 })), 8)
  const m = {}
  sorted.value.forEach((it, k) => { m[it.key] = arr[k] })
  return m
})

const nameOf = (m) => (m.author === 'AI' ? 'AI' : prefs.author || 'You')
const initialOf = (m) => (m.author === 'AI' ? 'AI' : (prefs.author || 'You').trim().charAt(0).toUpperCase())

const composerKey = computed(() => (props.items.find((i) => i.kind === 'composer') || {}).key)
watch(composerKey, async (k) => {
  if (k) {
    draft.value = ''
    await nextTick()
    const el = els[k] && els[k].querySelector('textarea')
    if (el) el.focus()
  }
})

// "Edit note" from the right-click menu
watch(() => props.editRequest, async (r) => {
  for (let i = 0; i < 6; i++) {
    await nextTick()
    const el = els[r.key] && els[r.key].querySelector('textarea')
    if (el) { el.focus(); el.select(); return }
    await new Promise((res) => setTimeout(res, 40))
  }
})

function submit() {
  const t = draft.value.trim()
  if (!t) return
  emit('submit', t)
  draft.value = ''
}
// Your own messages are edited in place (key = card key + message index); it saves when you leave the field.
const drafts = reactive({})
const replyDrafts = reactive({})
function commit(c, key, index) {
  const k = key + ':' + index
  const old = c.messages[index].text
  const t = (drafts[k] ?? old).trim()
  delete drafts[k]
  if (t && t !== old) emit('save-edit', c, t, index)
}
function revert(key, index, e) {
  const k = key + ':' + index
  delete drafts[k]
  const it = props.items.find((i) => i.key === key)
  e.target.value = it ? it.comment.messages[index].text : ''
  e.target.blur()
}
function sendReply(c, key) {
  const t = (replyDrafts[key] || '').trim()
  if (!t) return
  replyDrafts[key] = ''
  emit('reply', c, t)
}
</script>

<template>
  <aside ref="aside" class="margin" :class="{ slim: !expanded }" aria-label="Notes" @transitionend.self="emit('settled')">
    <svg v-if="link" class="mlink" :class="'c-' + link.color" :style="{ top: link.top + 'px', left: link.left + 'px', width: link.w + 'px', height: link.h + 'px' }" :width="link.w" :height="link.h" aria-hidden="true">
      <path :d="`M0 ${link.a} H${Math.max(link.w - 14, 0)} V${link.c} H${link.w}`" fill="none" />
    </svg>
    <template v-for="it in sorted" :key="it.key">
      <button
        v-if="isDot(it)"
        class="mdot"
        :class="['c-' + it.comment.color, { ai: it.comment.author === 'AI', side: expanded }]"
        :style="{ top: (tops[it.key] || 0) + 'px' }"
        :title="nameOf(it.comment.messages[0]) + ': ' + it.comment.text + (it.comment.messages.length > 1 ? ' (+' + (it.comment.messages.length - 1) + ' repl' + (it.comment.messages.length > 2 ? 'ies' : 'y') + ')' : '')"
        @click="emit('select', it)"
      >{{ initialOf(it.comment.messages[0]) }}</button>
      <!-- new note box -->
      <article v-else-if="it.kind === 'composer'" :ref="(el) => setEl(it.key, el)" class="mcard composer active c-blue" :style="{ top: (tops[it.key] || 0) + 'px' }">
        <header>
          <span class="avatar">{{ (prefs.author || 'You').trim().charAt(0).toUpperCase() }}</span>
          <strong>{{ prefs.author || 'You' }}</strong>
        </header>
        <blockquote v-if="it.anchor" class="mquote">“{{ it.anchor.length > 70 ? it.anchor.slice(0, 69) + '…' : it.anchor }}”</blockquote>
        <textarea
          v-model="draft"
          rows="3"
          placeholder="Write a note… (Enter to add, Shift+Enter for a new line)"
          @keydown.enter.exact.prevent="submit"
          @keydown.esc.stop="emit('cancel')"
        ></textarea>
        <div class="mrow">
          <button class="btn ghost" @click="emit('cancel')">Cancel</button>
          <button class="btn primary" :disabled="!draft.trim()" @click="submit">Add note</button>
        </div>
      </article>

      <!-- existing note -->
      <article
        v-else
        :ref="(el) => setEl(it.key, el)"
        class="mcard"
        :class="['c-' + it.comment.color, { active: it.key === activeKey, ai: it.comment.author === 'AI' }]"
        :style="{ top: (tops[it.key] || 0) + 'px' }"
        @click="emit('select', it)"
      >
        <!-- the conversation: your messages are editable right in the card, the AI's are read-only -->
        <div v-for="(m, mi) in it.comment.messages" :key="mi" class="msg" :class="{ ai: m.author === 'AI' }">
          <header>
            <span class="avatar" :class="{ ai: m.author === 'AI' }">{{ initialOf(m) }}</span>
            <strong>{{ nameOf(m) }}</strong>
            <span v-if="mi === 0" class="mnum">{{ it.comment.n }}</span>
          </header>
          <textarea
            v-if="it.key === activeKey && m.author !== 'AI'"
            class="mtext-edit"
            :value="drafts[it.key + ':' + mi] ?? m.text"
            rows="1"
            @click.stop
            @input="drafts[it.key + ':' + mi] = $event.target.value"
            @blur="commit(it.comment, it.key, mi)"
            @keydown.enter.exact.prevent="$event.target.blur()"
            @keydown.esc.stop="revert(it.key, mi, $event)"
          ></textarea>
          <p v-else class="mtext">{{ m.text }}</p>
        </div>
        <textarea
          v-if="it.key === activeKey"
          v-model="replyDrafts[it.key]"
          class="mreply"
          rows="1"
          placeholder="Reply…"
          @click.stop
          @keydown.enter.exact.prevent="sendReply(it.comment, it.key)"
        ></textarea>
        <footer v-if="it.key === activeKey">
          <button class="link ok" title="Resolve this note: it leaves the text and the margin (Ctrl+Z brings it back)" @click.stop="emit('resolve', it.comment)">Resolve</button>
        </footer>
      </article>
    </template>
  </aside>
</template>
