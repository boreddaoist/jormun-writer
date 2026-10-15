<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { splitFront, parseFront, countWords, setFrontTitle } from '@shared/text.mjs'
import * as fmt from '@shared/format.mjs'
import { extractHeadings } from '@shared/outline.mjs'
import { deleteSection, moveSection, headingTextRange } from '@shared/sections.mjs'
import { parseComments, addComment, resolveComment, editComment, setCommentColor, DEFAULT_COLOR } from '@shared/comments.mjs'
import { state, edit, save, titleOf, setNav, toast } from '../store.js'
import { prefs } from '../prefs.js'
import ReviewBar from './ReviewBar.vue'
import Toolbar from './Toolbar.vue'
import LiveEditor from './LiveEditor.vue'
import CommentMargin from './CommentMargin.vue'

const props = defineProps({ rel: String })
const live = ref(null)
const row = ref(null)
const composing = ref(null) // { from, to, anchor } while the new-note box is open
const composeColor = ref(DEFAULT_COLOR)
const editRequest = ref({ key: '', t: 0 }) // "Edit note" from the right-click menu
const selInfo = ref({ head: 0, formats: {} })
const tick = ref(0) // bumped when the editor's layout changes, so margin cards re-measure

const file = computed(() => state.files[props.rel])
const parts = computed(() => splitFront(file.value.buffer))
const body = computed(() => parts.value.body)
const meta = computed(() => parseFront(parts.value.front))
const words = computed(() => countWords(file.value.buffer))
const comments = computed(() => parseComments(body.value))

const showMargin = computed(() => prefs.margin && (comments.value.length > 0 || !!composing.value))
const activeComment = computed(() => comments.value.find((c) => selInfo.value.head >= c.from && selInfo.value.head <= c.to))
const activeKey = computed(() => (composing.value ? 'composer' : activeComment.value ? 'c' + activeComment.value.n : ''))

// Margin cards: each one level with its text (viewport y of the anchor, relative to the page row).
const items = computed(() => {
  void tick.value
  void body.value
  if (!live.value || !row.value) return []
  const rowTop = row.value.getBoundingClientRect().top
  const out = comments.value.map((c) => ({
    key: 'c' + c.n, kind: 'comment', comment: c,
    top: live.value.posTop(c.anchor ? c.anchorFrom : c.from) - rowTop,
    ax: live.value.posEndX(c.anchor ? c.anchorFrom : c.from, c.anchor ? c.anchorTo : c.from)
  }))
  if (composing.value) {
    out.push({ key: 'composer', kind: 'composer', anchor: composing.value.anchor, top: live.value.posTop(composing.value.from) - rowTop, ax: live.value.posEndX(composing.value.from, composing.value.to) })
  }
  return out
})

let raf = 0
function bump() {
  if (raf) return
  raf = requestAnimationFrame(() => { raf = 0; tick.value++ })
}

// ---- chapter title: edited in place, stored as `title:` in the file's frontmatter ----
function commitTitle(v) {
  const t = String(v).trim()
  if (t === titleOf(props.rel)) return
  edit(props.rel, setFrontTitle(parts.value.front, t) + parts.value.body)
}

// ---- text flows ----
function onBody(v) {
  edit(props.rel, parts.value.front + v)
}
function onSel(info) {
  selInfo.value = info
  setNav(props.rel, info.head) // lets the outline highlight the heading you are under
}

// A click on a heading in the outline asks this editor to scroll there (only requests made just now count,
// so reopening a file later never replays an old jump).
const mountedAt = Date.now()
let lastJump = 0
watch(() => [state.jump.t, live.value], () => {
  const j = state.jump
  if (!live.value || j.rel !== props.rel || j.t <= lastJump || j.t < mountedAt - 1500) return
  lastJump = j.t
  live.value.select(j.pos, j.pos, 'start')
}, { immediate: true })

// A right-click on a heading in the Navigation pane: rename / move / delete that section of the document.
let lastOp = 0
watch(() => [state.op.t, live.value], () => {
  const o = state.op
  if (!live.value || o.rel !== props.rel || o.t <= lastOp || o.t < mountedAt - 1500) return
  lastOp = o.t
  const ed = live.value
  const body = ed.getText()
  const hs = extractHeadings(body)
  let i = hs.findIndex((h) => h.pos === o.pos)
  if (i === -1) i = hs.reduce((best, h, k) => (h.pos <= o.pos ? k : best), -1)
  if (i === -1) return
  if (o.name === 'rename') {
    const r = headingTextRange(body, hs[i])
    return ed.select(r.from, r.to, 'center')
  }
  const e = o.name === 'delete' ? deleteSection(body, hs, i) : moveSection(body, hs, i, o.name)
  if (!e) return toast(o.name === 'up' ? 'It is already the first one here.' : 'It is already the last one here.')
  ed.apply(e)
  ed.select(e.selStart, e.selStart, 'center')
}, { immediate: true })

// ---- toolbar, keys and the right-click menu all arrive here ----
const FORMATS = {
  bold: fmt.bold, italic: fmt.italic, strike: fmt.strike,
  h1: fmt.h1, h2: fmt.h2, h3: fmt.h3, quote: fmt.quote, bullet: fmt.bullet, scene: fmt.sceneBreak
}
// Right-click menu actions that target one note: { name: 'note-edit' | 'note-delete' | 'note-color', n, color? }
function onNoteAction(a) {
  const c = comments.value.find((x) => x.n === a.n)
  if (!c) return
  if (a.name === 'note-delete') return resolve(c)
  if (a.name === 'note-color') return setColor(c, a.color)
  if (a.name === 'note-edit') {
    prefs.margin = true
    selectComment(c)
    editRequest.value = { key: 'c' + c.n, t: Date.now() }
  }
}

function onAction(action) {
  const ed = live.value
  if (!ed) return
  if (action && typeof action === 'object') return onNoteAction(action)
  const name = action
  if (name === 'undo') return ed.doUndo()
  if (name === 'redo') return ed.doRedo()
  if (name === 'save') return save(props.rel)
  if (name === 'comment') return startComment()
  const op = FORMATS[name]
  if (op) {
    const { from, to } = ed.getSelection()
    ed.apply(op(ed.getText(), from, to))
  }
}

// ---- comments ----
function startComment() {
  const ed = live.value
  if (!ed) return
  let { from, to } = ed.getSelection()
  const v = ed.getText()
  while (from < to && /\s/.test(v[from])) from++
  while (to > from && /\s/.test(v[to - 1])) to--
  composing.value = { from, to, anchor: v.slice(from, to) }
  composeColor.value = DEFAULT_COLOR
  prefs.margin = true
  bump()
}

function submitComment(text) {
  const ed = live.value
  const c = composing.value
  if (!ed || !c) return
  const v = ed.getText()
  let { from, to } = c
  if (c.anchor && v.slice(from, to) !== c.anchor) {
    // The text moved while the box was open (for example an AI edit): find the passage again.
    const i = v.indexOf(c.anchor)
    if (i !== -1) { from = i; to = i + c.anchor.length } else { from = to = Math.min(from, v.length) }
  } else if (!c.anchor) {
    from = to = Math.min(from, v.length)
  }
  ed.apply(addComment(v, from, to, text, composeColor.value))
  composing.value = null
}
function cancelComment() {
  composing.value = null
  live.value && live.value.focus()
}

function currentComment(c) {
  const list = parseComments(live.value.getText())
  return list.find((x) => x.n === c.n && x.raw === c.raw) || list.find((x) => x.raw === c.raw && x.anchor === c.anchor)
}
function resolve(c) {
  const cur = currentComment(c)
  if (cur) live.value.apply(resolveComment(cur))
}
function saveEdit(c, text) {
  const cur = currentComment(c)
  if (cur) live.value.apply(editComment(cur, text))
}
function setColor(c, color) {
  const cur = currentComment(c)
  if (cur && cur.color !== color) live.value.apply(setCommentColor(cur, color))
}
function selectComment(c) {
  if (!live.value) return
  // put the caret at the start of the passage (not a selection of it, so typing never wipes the passage)
  const at = c.anchor ? c.anchorFrom : c.from
  live.value.select(at, at)
}
function onBadge(n) {
  const c = comments.value.find((x) => x.n === n)
  prefs.margin = true
  if (c) selectComment(c)
}

// The main process asks this when you right-click: is the click in the editor, on a note, with text selected?
function contextInfo(x, y) {
  const el = document.elementFromPoint(x, y)
  const inEditor = !!(el && el.closest && el.closest('.live-host')) || (document.activeElement && document.activeElement.classList.contains('cm-content'))
  const hit = el && el.closest ? el.closest('.cm-cmt[data-n], .cm-badge[data-n]') : null
  const note = hit ? Number(hit.dataset.n) : activeComment.value ? activeComment.value.n : 0
  const cur = note ? comments.value.find((x) => x.n === note) : null
  return { editor: !!inEditor, note, color: cur ? cur.color : '', selection: !selInfo.value.empty }
}

let offAction = null
onMounted(() => {
  window.addEventListener('resize', bump)
  offAction = window.jormun.onEditorAction((a) => onAction(a))
  window.__jwCtx = contextInfo
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', bump)
  if (window.__jwCtx === contextInfo) delete window.__jwCtx
  if (offAction) offAction()
  if (raf) cancelAnimationFrame(raf)
})

const saveLabel = computed(() => {
  const f = file.value
  if (f.error) return 'Save failed: ' + f.error
  if (f.conflict) return 'Waiting for your decision'
  if (f.saving) return 'Saving…'
  if (f.buffer !== f.disk) return 'Unsaved'
  return 'Saved'
})
</script>

<template>
  <section v-if="file" class="editor">
    <Toolbar
      :formats="selInfo.formats"
      @action="onAction"
    />
    <ReviewBar :rel="rel" :file="file" />
    <div class="page-scroll">
      <div ref="row" class="page-row">
        <div class="page-col">
          <article class="page">
            <header class="page-head">
              <input
                class="title-input"
                :value="titleOf(rel)"
                spellcheck="true"
                aria-label="Chapter title"
                @keydown.enter.prevent="$event.target.blur(); live && live.focus()"
                @keydown.esc.prevent="$event.target.value = titleOf(rel); $event.target.blur()"
                @blur="commitTitle($event.target.value)"
              />
            </header>
            <LiveEditor
              ref="live"
              :model-value="body"
              @update:model-value="onBody"
              @selection="onSel"
              @geometry="bump"
              @badge="onBadge"
              @action="onAction"
            />
          </article>
        </div>
        <CommentMargin
          v-if="showMargin"
          :items="items"
          :active-key="activeKey"
          :composer-color="composeColor"
          :edit-request="editRequest"
          :expanded="!!composing || !!activeComment"
          @select="(it) => selectComment(it.comment)"
          @composer-color="(c) => (composeColor = c)"
          @set-color="setColor"
          @resolve="resolve"
          @save-edit="saveEdit"
          @submit="submitComment"
          @cancel="cancelComment"
          @settled="bump"
        />
      </div>
    </div>
  </section>
  <section v-else class="editor empty"><p class="muted">Pick a chapter on the left.</p></section>
</template>
