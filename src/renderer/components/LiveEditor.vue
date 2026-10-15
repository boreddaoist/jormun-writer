<script setup>
// Live-preview editor. The document is the exact Markdown text (nothing is converted or rewritten);
// bold, italics, headings, quotes and notes are only *drawn* nicely. By default the Markdown marks (**, #, >,
// and the {==  ==}{>> <<} of a note) stay hidden, like in Word. The "Show formatting marks" setting reveals the
// ones under the cursor, like Obsidian's live preview.
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { EditorState, EditorSelection, Annotation, Transaction, Facet, Compartment } from '@codemirror/state'
import { EditorView, ViewPlugin, Decoration, WidgetType, keymap, placeholder } from '@codemirror/view'
import { history, historyKeymap, defaultKeymap, undo, redo } from '@codemirror/commands'
import { describeLine, formatsAt, lineFormats, emptiedTokenRange } from '@shared/livemd.mjs'
import { parseComments, resolveComment } from '@shared/comments.mjs'
import { prefs } from '../prefs.js'

const props = defineProps({ modelValue: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue', 'selection', 'geometry', 'badge', 'action'])

const host = ref(null)
let view = null
const External = Annotation.define()

// Whether to show the Markdown marks under the cursor (off by default).
const revealFacet = Facet.define({ combine: (v) => (v.length ? v[0] : false) })
const revealComp = new Compartment()

// ---------- widgets ----------
class Badge extends WidgetType {
  constructor(n, ai, color) { super(); this.n = n; this.ai = ai; this.color = color }
  eq(o) { return o.n === this.n && o.ai === this.ai && o.color === this.color }
  toDOM() {
    const s = document.createElement('span')
    s.className = 'cm-badge c-' + this.color + (this.ai ? ' ai' : '')
    s.textContent = String(this.n)
    s.dataset.n = String(this.n)
    return s
  }
  ignoreEvent() { return false }
}
class Bullet extends WidgetType {
  eq() { return true }
  toDOM() {
    const s = document.createElement('span')
    s.className = 'cm-bullet'
    s.textContent = '•'
    return s
  }
}

// `kind` tells Backspace/Delete what a hidden range is: an inline mark, a line prefix, or a note marker.
const hideInline = Decoration.replace({ kind: 'inline' })
const hideBlock = Decoration.replace({ kind: 'block' })
const bulletDeco = Decoration.replace({ widget: new Bullet(), kind: 'block' })
const mark = (cls) => Decoration.mark({ class: cls })
const M = {
  strong: mark('cm-strong'), em: mark('cm-em'), s: mark('cm-strike'),
  syn: mark('cm-syntax'), raw: mark('cm-cmt-raw')
}
// A note's highlighted passage carries its colour and number (the number lets a right-click find the note).
const noteMarks = new Map()
const noteMark = (color, num, on) => {
  const k = color + ':' + num + ':' + (on ? 1 : 0)
  if (!noteMarks.has(k)) noteMarks.set(k, Decoration.mark({ class: 'cm-cmt c-' + color + (on ? ' on' : ''), attributes: { 'data-n': String(num) } }))
  return noteMarks.get(k)
}
const lineDeco = {}
const line = (cls) => (lineDeco[cls] ||= Decoration.line({ class: cls }))

// Pressing B / I / S with no word under the caret writes an empty pair (****) with the caret inside, like switching
// bold on in Word. Until you type, the pair is hidden; if you move away without typing it is removed again.
let pending = null // { from, len }
const EMPTY_PAIR = /^(\*\*\*\*|\*\*|~~~~)$/

// ---------- decorations ----------
function build(v, comments) {
  const { state } = v
  const reveal = state.facet(revealFacet)
  const sel = state.selection.ranges
  const touches = (a, b) => reveal && sel.some((r) => r.from <= b && r.to >= a)
  const out = []
  const atomic = []
  const push = (from, to, deco) => { if (to > from) out.push(deco.range(from, to)) }
  const hideRange = (from, to, kind = 'inline') => {
    if (to <= from) return
    const d = kind === 'block' ? hideBlock : hideInline
    out.push(d.range(from, to))
    atomic.push(d.range(from, to))
  }
  const syntax = (from, to, active, kind) => { if (active) push(from, to, M.syn); else hideRange(from, to, kind) }
  const widgetRange = (from, to, deco) => { if (to > from) { out.push(deco.range(from, to)); atomic.push(deco.range(from, to)) } }
  const noteHide = Decoration.replace({ kind: 'note' }) // the hidden {>>note<<}; Backspace right after it deletes the note

  if (pending && EMPTY_PAIR.test(state.doc.sliceString(pending.from, pending.from + pending.len))) {
    const mid = pending.from + pending.len / 2
    hideRange(pending.from, mid)
    hideRange(mid, pending.from + pending.len)
  }

  const walk = (nodes) => {
    for (const n of nodes) {
      if (n.t === 'text') continue
      if (n.t === 'comment') {
        const c = comments.get(n.from)
        const on = !!c && sel.some((r) => r.head >= c.from && r.head <= c.to)
        const num = c ? c.n : 0
        const ai = c ? c.author === 'AI' : false
        const col = c ? c.color : 'blue'
        if (touches(n.from, n.to)) {
          // marks are revealed and the cursor is inside: show the raw note so it can be edited
          if (n.anchor) {
            push(n.from, n.anchorFrom, M.syn)
            push(n.anchorFrom, n.anchorTo, noteMark(col, num, on))
            walk(n.anchor)
            push(n.anchorTo, n.to, M.raw)
          } else {
            push(n.from, n.to, M.raw)
          }
        } else if (n.anchor) {
          hideRange(n.from, n.anchorFrom)
          push(n.anchorFrom, n.anchorTo, noteMark(col, num, on))
          walk(n.anchor)
          widgetRange(n.anchorTo, n.to, noteHide)
        } else {
          widgetRange(n.from, n.to, noteHide)
        }
        continue
      }
      const active = touches(n.from, n.to)
      push(n.from + n.open, n.to - n.close, n.t === 'strong' ? M.strong : n.t === 'em' ? M.em : M.s)
      syntax(n.from, n.from + n.open, active)
      syntax(n.to - n.close, n.to, active)
      walk(n.c)
    }
  }

  for (const { from, to } of v.visibleRanges) {
    let pos = from
    while (pos <= to) {
      const ln = state.doc.lineAt(pos)
      const d = describeLine(ln.text, ln.from)
      const onLine = touches(ln.from, ln.to)
      if (d.type === 'h') {
        out.push(line('cm-h cm-h' + Math.min(d.level, 3)).range(ln.from))
        syntax(ln.from, ln.from + d.prefixLen, onLine, 'block')
      } else if (d.type === 'quote') {
        out.push(line('cm-quote').range(ln.from))
        syntax(ln.from, ln.from + d.prefixLen, onLine, 'block')
      } else if (d.type === 'ul') {
        out.push(line('cm-li').range(ln.from))
        if (onLine) push(ln.from, ln.from + d.prefixLen, M.syn)
        else widgetRange(ln.from, ln.from + d.prefixLen, bulletDeco)
      } else if (d.type === 'ol') {
        out.push(line('cm-li').range(ln.from))
      } else if (d.type === 'hr') {
        out.push(line('cm-hr').range(ln.from))
      }
      walk(d.nodes)
      pos = ln.to + 1
    }
  }
  // a bar in the margin beside the paragraph(s) a note belongs to; the whole paragraph tints while the note is selected
  for (const c of comments.values()) {
    const a = c.anchor ? c.anchorFrom : c.from
    const b = c.anchor ? c.anchorTo : c.to
    if (a > state.doc.length) continue
    const on = sel.some((r) => r.head >= c.from && r.head <= c.to)
    const l1 = state.doc.lineAt(Math.min(a, state.doc.length)).number
    const l2 = state.doc.lineAt(Math.min(Math.max(b, a), state.doc.length)).number
    for (let i = l1; i <= l2; i++) {
      out.push(line('cm-noteline c-' + c.color + (on ? ' on' : '') + (i === l1 ? ' first' : '') + (i === l2 ? ' last' : '')).range(state.doc.line(i).from))
    }
  }
  return { decorations: Decoration.set(out, true), atomic: Decoration.set(atomic, true) }
}

const livePlugin = ViewPlugin.fromClass(class {
  constructor(v) {
    this.comments = this.computeComments(v)
    Object.assign(this, build(v, this.comments))
  }
  computeComments(v) {
    const m = new Map()
    for (const c of parseComments(v.state.doc.toString())) m.set(c.from, c)
    return m
  }
  update(u) {
    if (u.docChanged) this.comments = this.computeComments(u.view)
    if (u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged || u.transactions.some((t) => t.reconfigured)) {
      Object.assign(this, build(u.view, this.comments))
    }
  }
}, {
  decorations: (p) => p.decorations,
  provide: (plugin) => EditorView.atomicRanges.of((v) => {
    const p = v.plugin(plugin)
    return p ? p.atomic : Decoration.none
  })
})

// ---------- Backspace / Delete next to hidden marks ----------
// The marks are invisible, so deleting must act on what you can SEE: skip over hidden inline marks and delete
// the visible character (never a lone "**", which would leave stray asterisks). The last character of a bold /
// italic span removes the whole span, and a note's number badge removes the note (the text stays).
function smartDelete(v, dir) {
  const { state } = v
  const sel = state.selection.main
  if (!sel.empty || state.facet(revealFacet)) return false
  const p = v.plugin(livePlugin)
  if (!p) return false

  let pos = sel.head
  let moved = false
  for (let guard = 0; guard < 16; guard++) {
    let hit = null
    p.atomic.between(pos, pos, (from, to, deco) => {
      if (from < to && (dir < 0 ? to === pos : from === pos)) hit = { from, to, kind: deco.spec.kind }
    })
    if (!hit) break
    if (hit.kind === 'note') {
      const c = [...p.comments.values()].find((x) => (x.anchor ? x.anchorTo === hit.from : x.from === hit.from))
      if (!c) return false
      const r = resolveComment(c)
      v.dispatch({ changes: { from: r.from, to: r.to, insert: r.insert }, selection: { anchor: r.selEnd }, userEvent: 'delete.note' })
      return true
    }
    if (hit.kind !== 'inline') break // heading / quote / bullet prefix: the normal Backspace removes it, which is what you want
    pos = dir < 0 ? hit.from : hit.to
    moved = true
  }

  // The visible character the key should remove.
  const doc = state.doc
  let from
  let to
  if (dir < 0) {
    if (pos <= 0) return moved
    to = pos
    from = pos - 1
    if (from > 0 && /[\uDC00-\uDFFF]/.test(doc.sliceString(from, from + 1))) from--
  } else {
    if (pos >= doc.length) return moved
    from = pos
    to = pos + 1
    if (/[\uD800-\uDBFF]/.test(doc.sliceString(from, from + 1)) && to < doc.length) to++
  }

  // If that character is the last one inside a bold / italic / strike span, remove the whole span.
  let token = null
  const ln = doc.lineAt(from)
  if (from >= ln.from && to <= ln.to) token = emptiedTokenRange(describeLine(ln.text, ln.from).nodes, from, to)
  if (token) { from = token.from; to = token.to }

  // Nothing special about this deletion: let the normal Backspace / Delete do it.
  if (!moved && !token) return false

  v.dispatch({ changes: { from, to }, selection: { anchor: from }, userEvent: dir < 0 ? 'delete.backward' : 'delete.forward' })
  return true
}

// ---------- selection info for the toolbar ----------
function selectionInfo(state) {
  const r = state.selection.main
  const ln = state.doc.lineAt(r.head)
  const d = describeLine(ln.text, ln.from)
  return { from: r.from, to: r.to, head: r.head, empty: r.empty, formats: { ...formatsAt(d.nodes, r.head), ...lineFormats(ln.text) } }
}

// ---------- lifecycle ----------
onMounted(() => {
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        history(),
        keymap.of([
          { key: 'Mod-b', run: () => { emit('action', 'bold'); return true } },
          { key: 'Mod-i', run: () => { emit('action', 'italic'); return true } },
          { key: 'Mod-Alt-m', run: () => { emit('action', 'comment'); return true } },
          { key: 'Mod-s', run: () => { emit('action', 'save'); return true } },
          { key: 'Backspace', run: (v) => smartDelete(v, -1) },
          { key: 'Delete', run: (v) => smartDelete(v, 1) },
          ...historyKeymap,
          ...defaultKeymap
        ]),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ spellcheck: 'true' }),
        placeholder('Start writing…'),
        revealComp.of(revealFacet.of(prefs.reveal)),
        livePlugin,
        EditorView.domEventHandlers({
          mousedown: (e) => {
            const b = e.target && e.target.closest ? e.target.closest('.cm-badge') : null
            if (b) { emit('badge', Number(b.dataset.n)); return true }
            return false
          }
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !u.transactions.some((t) => t.annotation(External))) {
            emit('update:modelValue', u.state.doc.toString())
          }
          if (pending) {
            const mine = u.transactions.some((t) => t.isUserEvent('input.format'))
            if (u.docChanged && !mine) pending = null // you typed: the pair is real formatting now
            else if (u.selectionSet && !mine && u.state.selection.main.head !== pending.from + pending.len / 2) {
              const p = pending
              pending = null
              queueMicrotask(() => {
                if (view && EMPTY_PAIR.test(view.state.doc.sliceString(p.from, p.from + p.len))) {
                  view.dispatch({ changes: { from: p.from, to: p.from + p.len, insert: '' } })
                }
              })
            }
          }
          if (u.selectionSet || u.docChanged) emit('selection', selectionInfo(u.state))
          if (u.docChanged || u.geometryChanged || u.viewportChanged) emit('geometry')
        })
      ]
    })
  })
  // Start with the cursor at the end, ready to continue writing, without scrolling there.
  view.dispatch({ selection: { anchor: view.state.doc.length } })
  view.focus()
  emit('selection', selectionInfo(view.state))
  emit('geometry')
})

onBeforeUnmount(() => { if (view) view.destroy(); view = null })

watch(() => prefs.reveal, (on) => {
  if (view) view.dispatch({ effects: revealComp.reconfigure(revealFacet.of(on)) })
})

// A change that came from outside (an AI edit, git): apply only what differs, keep the caret, and keep
// it out of Ctrl+Z (the app has its own "Undo AI changes").
watch(() => props.modelValue, (next) => {
  if (!view) return
  const cur = view.state.doc.toString()
  if (next === cur) return
  const min = Math.min(cur.length, next.length)
  let a = 0
  while (a < min && cur.charCodeAt(a) === next.charCodeAt(a)) a++
  let b = 0
  while (b < min - a && cur.charCodeAt(cur.length - 1 - b) === next.charCodeAt(next.length - 1 - b)) b++
  view.dispatch({
    changes: { from: a, to: cur.length - b, insert: next.slice(a, next.length - b) },
    annotations: [External.of(true), Transaction.addToHistory.of(false)]
  })
})

// ---------- API for the parent ----------
const getText = () => (view ? view.state.doc.toString() : '')
const getSelection = () => {
  const r = view.state.selection.main
  return { from: r.from, to: r.to }
}
// r = { from, to, insert, selStart, selEnd } as produced by format.mjs / comments.mjs
function apply(r) {
  if (!view) return
  pending = r.from === r.to && EMPTY_PAIR.test(r.insert) ? { from: r.from, len: r.insert.length } : null
  view.dispatch({
    changes: { from: r.from, to: r.to, insert: r.insert },
    selection: { anchor: r.selStart, head: r.selEnd },
    userEvent: 'input.format'
  })
  view.focus()
}
function select(from, to, y = 'center') {
  if (!view) return
  view.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y, yMargin: 48 }) })
  view.focus()
}
// Viewport y of a document position (used to put note cards level with their text).
function posTop(pos) {
  if (!view) return 0
  const p = Math.max(0, Math.min(pos, view.state.doc.length))
  const c = view.coordsAtPos(p)
  if (c) return c.top
  return view.documentTop + view.lineBlockAt(p).top
}
const focus = () => view && view.focus()
const doUndo = () => { if (view) { undo(view); view.focus() } }
const doRedo = () => { if (view) { redo(view); view.focus() } }
function selectedText() {
  const r = view.state.selection.main
  return view.state.sliceDoc(r.from, r.to)
}

// Viewport x of the right end of the first visual line of a passage (where the line to its note card starts).
function posEndX(from, to) {
  if (!view) return 0
  const a = Math.max(0, Math.min(from, view.state.doc.length))
  const end = Math.min(view.moveToLineBoundary(EditorSelection.cursor(a), true).head, Math.max(to, a))
  // the box of the last visible character of that line (the position itself can sit next to hidden note marks)
  const c = (end > a && view.coordsAtPos(end - 1, 1)) || view.coordsAtPos(a)
  return c ? c.right : 0
}
const remeasure = () => { if (view) view.requestMeasure() }
defineExpose({ remeasure, getText, getSelection, apply, select, posTop, posEndX, focus, doUndo, doRedo, selectedText })

// Clicking the empty area below the text puts the cursor at the end.
function onHostMouseDown(e) {
  if (e.target === host.value && view) {
    e.preventDefault()
    view.dispatch({ selection: { anchor: view.state.doc.length } })
    view.focus()
  }
}
</script>

<template>
  <div ref="host" class="live-host" @mousedown="onHostMouseDown"></div>
</template>
