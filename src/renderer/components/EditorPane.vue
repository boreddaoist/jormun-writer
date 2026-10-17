<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { splitFront, parseFront, countWords, setFrontTitle } from '@shared/text.mjs'
import * as fmt from '@shared/format.mjs'
import { extractHeadings } from '@shared/outline.mjs'
import { deleteSection, moveSection, headingTextRange } from '@shared/sections.mjs'
import { stripComments } from '@shared/comments.mjs'
import { findMatches } from '@shared/find.mjs'
import { isIdeaLine } from '@shared/ideas.mjs'
import { parseComments, addComment, addReply, resolveComment, editComment } from '@shared/comments.mjs'
import { state, edit, save, titleOf, setNav, toast, cards, openDialog } from '../store.js'
import { cardAt } from '@shared/cards.mjs'
import { lintText, isIgnored, ignoreLint } from '../grammar.js'
import { prefs, stepZoom } from '../prefs.js'
import ReviewBar from './ReviewBar.vue'
import Toolbar from './Toolbar.vue'
import LiveEditor from './LiveEditor.vue'
import CommentMargin from './CommentMargin.vue'
import ZoomControl from './ZoomControl.vue'

const props = defineProps({ rel: String })
const live = ref(null)
const row = ref(null)
const composing = ref(null) // { from, to, anchor } while the new-note box is open
const editRequest = ref({ key: '', t: 0 }) // "Edit note" from the right-click menu
const selInfo = ref({ head: 0, formats: {} })
const tick = ref(0) // bumped when the editor's layout changes, so margin cards re-measure

const file = computed(() => state.files[props.rel])
const parts = computed(() => splitFront(file.value.buffer))
const body = computed(() => parts.value.body)
const meta = computed(() => parseFront(parts.value.front))
const words = computed(() => countWords(file.value.buffer))
// words in the selection (notes' markup is not counted), shown next to the total while text is selected
const selWords = computed(() => {
  const i = selInfo.value
  if (!i || i.empty || i.to === undefined) return 0
  void body.value
  return countWords(stripComments(body.value.slice(i.from, i.to)))
})
const comments = computed(() => parseComments(body.value))

const ideaCount = computed(() => body.value.split('\n').filter(isIdeaLine).length)
const showMargin = computed(() => prefs.margin && !prefs.hideNotes && (comments.value.length > 0 || !!composing.value))
const activeComment = computed(() => comments.value.find((c) => selInfo.value.head >= c.from && selInfo.value.head <= c.to))
const activeKey = computed(() => (composing.value ? 'composer' : activeComment.value ? 'c' + activeComment.value.n : ''))

// Margin cards: each one level with its text (viewport y of the anchor, relative to the page row).
const items = computed(() => {
  void tick.value
  void body.value
  void prefs.zoom
  if (!live.value || !row.value) return []
  const rowTop = row.value.getBoundingClientRect().top
  const z = prefs.zoom / 100 // positions are screen pixels; the zoomed margin lays out in unzoomed ones
  const out = comments.value.map((c) => ({
    key: 'c' + c.n, kind: 'comment', comment: c,
    top: (live.value.posTop(c.anchor ? c.anchorFrom : c.from) - rowTop) / z,
    ax: live.value.posEndX(c.anchor ? c.anchorFrom : c.from, c.anchor ? c.anchorTo : c.from)
  }))
  if (composing.value) {
    out.push({ key: 'composer', kind: 'composer', anchor: composing.value.anchor, top: (live.value.posTop(composing.value.from) - rowTop) / z, ax: live.value.posEndX(composing.value.from, composing.value.to) })
  }
  return out
})

// a zoom change resizes the page without any text change: measure the editor again, then move the cards
watch(() => prefs.zoom, async () => {
  await nextTick()
  if (live.value) live.value.remeasure()
  bump()
  setTimeout(bump, 120)
})
// Ctrl + mouse wheel (or a trackpad pinch) zooms the page, like Word
let wheelAt = 0
function onWheel(e) {
  if (!e.ctrlKey) return
  e.preventDefault()
  const now = Date.now()
  if (now - wheelAt < 70) return
  wheelAt = now
  stepZoom(e.deltaY < 0 ? 1 : -1)
}

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
  if (a.name === 'note-edit') {
    prefs.margin = true
    selectComment(c)
    editRequest.value = { key: 'c' + c.n, t: Date.now() }
  }
}

function onAction(action) {
  const ed = live.value
  if (!ed) return
  if (action && typeof action === 'object') {
    if (action.name === 'idea-dismiss') { if (ideaPos != null) ed.dismissIdea(ideaPos); return }
    if (action.name === 'card-peek') return openDialog('card', { rel: action.rel })
    if (action.name === 'gram-fix') return ed.replaceRanges([{ from: action.from, to: action.to }], action.text)
    if (action.name === 'gram-ignore') { ignoreLint(action.key); gramTick.value++; return runGrammar() }
    return onNoteAction(action)
  }
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
  ed.apply(addComment(v, from, to, text))
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
function saveEdit(c, text, index = 0) {
  const cur = currentComment(c)
  if (cur) live.value.apply(editComment(cur, text, index))
}
function replyNote(c, text) {
  const cur = currentComment(c)
  if (cur) live.value.apply(addReply(cur, text))
}
function selectComment(c) {
  if (!live.value) return
  // put the caret at the start of the passage (not a selection of it, so typing never wipes the passage)
  const at = c.anchor ? c.anchorFrom : c.from
  live.value.select(at, at)
}
// Alt + click on a name: peek at its card
function onPeek(pos) {
  if (!live.value) return
  const hit = cardAt(cards.value, live.value.getText(), pos)
  if (hit) openDialog('card', { rel: hit.rel })
}
function onBadge(n) {
  const c = comments.value.find((x) => x.n === n)
  prefs.margin = true
  if (c) selectComment(c)
}

// ---- grammar suggestions: checked a moment after you stop typing, never changed without you ----
let gramTimer = 0
let gramRun = 0
let gramFailed = false
const gramTick = ref(0)
async function runGrammar() {
  const ed = live.value
  if (!ed) return
  if (!prefs.grammar) return ed.setGrammar([])
  const text = body.value
  const run = ++gramRun
  try {
    const lints = await lintText(text, prefs.dialect)
    if (run !== gramRun || body.value !== text || !live.value) return // typed meanwhile: the next run will repaint
    live.value.setGrammar(lints.filter((l) => !isIgnored(l)))
  } catch (e) {
    if (!gramFailed) { gramFailed = true; toast('Grammar suggestions are unavailable: ' + String(e.message || e).slice(0, 120), 7000) }
  }
}
watch([body, () => prefs.grammar, () => prefs.dialect, gramTick], () => {
  clearTimeout(gramTimer)
  gramTimer = setTimeout(runGrammar, 900)
})

// ---- find bar (Ctrl+F) ----
const findOpen = ref(false)
const findInput = ref(null)
const fq = ref('')
const rq = ref('')
const matchCase = ref(false)
const wholeWord = ref(false)
const cur = ref(0)
const matches = computed(() => (findOpen.value ? findMatches(body.value, fq.value, { matchCase: matchCase.value, wholeWord: wholeWord.value }) : []))
const findCount = computed(() => (fq.value ? (matches.value.length ? `${Math.min(cur.value, matches.value.length - 1) + 1} of ${matches.value.length}` : 'No matches') : ''))
function paintFind() {
  if (!live.value) return
  if (!findOpen.value) return live.value.setFind([])
  const i = matches.value.length ? Math.min(cur.value, matches.value.length - 1) : -1
  live.value.setFind(matches.value, i)
}
watch([matches, cur, findOpen], paintFind)
watch([fq, matchCase, wholeWord], () => {
  cur.value = nearest()
  const m = matches.value[cur.value]
  if (m && live.value) live.value.reveal(m.from, m.to)
})
// the first match at or after the caret, so typing a query jumps to what is next, not back to the top
function nearest() {
  const ms = matches.value
  if (!ms.length) return 0
  const head = selInfo.value.head || 0
  const i = ms.findIndex((m) => m.from >= head)
  return i === -1 ? 0 : i
}
function openFind() {
  const sel = selInfo.value
  if (sel && !sel.empty && live.value) {
    const t = live.value.selectedText()
    if (t && t.length < 80 && !t.includes('\n')) fq.value = t
  }
  findOpen.value = true
  nextTick(() => { findInput.value && findInput.value.focus(); findInput.value && findInput.value.select() })
}
function closeFind() {
  findOpen.value = false
  live.value && live.value.focus()
}
function stepFind(dir) {
  const n = matches.value.length
  if (!n) return
  cur.value = (Math.min(cur.value, n - 1) + dir + n) % n
  const m = matches.value[cur.value]
  live.value.reveal(m.from, m.to)
}
function replaceOne() {
  const n = matches.value.length
  if (!n || !live.value) return
  const m = matches.value[Math.min(cur.value, n - 1)]
  live.value.replaceRanges([m], rq.value)
  // the matches are recomputed from the new text; stay on the same position, which is now the next match
  nextTick(() => { const k = matches.value.length; if (k) { cur.value = Math.min(cur.value, k - 1); const nm = matches.value[cur.value]; live.value.reveal(nm.from, nm.to) } })
}
function replaceEvery() {
  const n = matches.value.length
  if (!n || !live.value) return
  live.value.replaceRanges(matches.value, rq.value)
  toast(n === 1 ? 'Replaced 1 match.' : `Replaced ${n} matches.`)
}
const onFindEvent = () => openFind()

let ideaPos = null // where the last right-click landed, when it was on a rewrite idea

// The main process asks this when you right-click: is the click in the editor, on a note, with text selected?
function contextInfo(x, y) {
  const el = document.elementFromPoint(x, y)
  const inEditor = !!(el && el.closest && el.closest('.live-host')) || (document.activeElement && document.activeElement.classList.contains('cm-content'))
  const hit = el && el.closest ? el.closest('.cm-cmt[data-n], .cm-badge[data-n]') : null
  const note = hit ? Number(hit.dataset.n) : activeComment.value ? activeComment.value.n : 0
  const cur = note ? comments.value.find((x) => x.n === note) : null
  const onIdea = !!(el && el.closest && el.closest('.cm-idea'))
  ideaPos = onIdea && live.value ? live.value.posAtCoords(x, y) : null
  // a card named under the click
  let card = null
  if (inEditor && live.value) {
    const at = live.value.posAtCoords(x, y)
    if (at != null) {
      const hit = cardAt(cards.value, live.value.getText(), at)
      if (hit) card = { rel: hit.rel, title: hit.title }
    }
  }
  // a grammar suggestion under the click
  let gram = null
  if (inEditor && live.value && prefs.grammar) {
    const at = live.value.posAtCoords(x, y)
    const g = at != null ? live.value.grammarAt(at) : null
    if (g) gram = { from: g.from, to: g.to, message: g.message, key: g.key, suggestions: g.suggestions.slice(0, 3) }
  }
  return { editor: !!inEditor, note, color: cur ? cur.color : '', selection: !selInfo.value.empty, idea: ideaPos != null, card, gram }
}

let offAction = null
onMounted(() => {
  window.addEventListener('resize', bump)
  offAction = window.jormun.onEditorAction((a) => onAction(a))
  window.__jwCtx = contextInfo
  window.addEventListener('jw:find', onFindEvent)
  gramTimer = setTimeout(runGrammar, 600)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', bump)
  window.removeEventListener('jw:find', onFindEvent)
  if (window.__jwCtx === contextInfo) delete window.__jwCtx
  if (offAction) offAction()
  if (raf) cancelAnimationFrame(raf)
  clearTimeout(gramTimer)
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
  <section v-if="file" class="editor" :class="{ 'hide-annot': prefs.hideNotes }">
    <Toolbar
      :formats="selInfo.formats"
      @action="onAction"
    />
    <ReviewBar :rel="rel" :file="file" />
    <div v-if="findOpen" class="findbar" @keydown.esc.stop.prevent="closeFind">
      <div class="frow">
        <input ref="findInput" v-model="fq" type="text" placeholder="Find" spellcheck="false" @keydown.enter.prevent="stepFind($event.shiftKey ? -1 : 1)" />
        <span class="fcount">{{ findCount }}</span>
        <button class="fbtn" title="Previous (Shift+Enter)" @click="stepFind(-1)">&#8593;</button>
        <button class="fbtn" title="Next (Enter)" @click="stepFind(1)">&#8595;</button>
        <button class="fbtn" :class="{ on: matchCase }" title="Match case" @click="matchCase = !matchCase">Aa</button>
        <button class="fbtn" :class="{ on: wholeWord }" title="Whole word" @click="wholeWord = !wholeWord">ab</button>
        <button class="fbtn" title="Close (Esc)" @click="closeFind">&#10005;</button>
      </div>
      <div class="frow">
        <input v-model="rq" type="text" placeholder="Replace with" spellcheck="false" @keydown.enter.prevent="replaceOne" />
        <button class="fbtn wide" :disabled="!matches.length" @click="replaceOne">Replace</button>
        <button class="fbtn wide" :disabled="!matches.length" @click="replaceEvery">Replace all</button>
      </div>
    </div>
    <div class="page-scroll" @wheel="onWheel">
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
              @peek="onPeek"
              @action="onAction"
            />
          </article>
        </div>
        <CommentMargin
          v-if="showMargin"
          :items="items"
          :active-key="activeKey"
          :edit-request="editRequest"
          :expanded="!!composing || !!activeComment"
          :zoom="prefs.zoom / 100"
          @select="(it) => selectComment(it.comment)"
          @reply="replyNote"
          @resolve="resolve"
          @save-edit="saveEdit"
          @submit="submitComment"
          @cancel="cancelComment"
          @settled="bump"
        />
      </div>
    </div>
    <div class="statusbar">
      <button
        v-if="comments.length || ideaCount"
        class="annot-toggle"
        :class="{ on: prefs.hideNotes }"
        :title="prefs.hideNotes ? 'Show the notes and rewrite ideas again' : 'Hide the notes and yellow rewrite ideas while you write'"
        @click="prefs.hideNotes = !prefs.hideNotes"
      >{{ prefs.hideNotes ? 'Show notes and ideas' : 'Hide notes and ideas' }}<span class="annot-n">{{ comments.length }} note{{ comments.length === 1 ? '' : 's' }} · {{ ideaCount }} idea{{ ideaCount === 1 ? '' : 's' }}</span></button>
      <div class="wordcount" title="Words in this document (notes are not counted)">
        <template v-if="selWords">{{ selWords.toLocaleString() }} of </template>{{ words.toLocaleString() }} words
      </div>
      <ZoomControl />
    </div>
  </section>
  <section v-else class="editor empty"><p class="muted">Pick a chapter on the left.</p></section>
</template>
