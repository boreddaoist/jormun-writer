// A deliberately small Markdown reader shared by Read mode, the Manuscript view and the Word export.
// Safe by construction: the HTML renderer escapes all text first and only adds a fixed set of tags.
// No links, images or raw HTML.
//
// Fiction drafts use one Enter per paragraph, so every non-blank line is its own paragraph here
// (strict Markdown would join consecutive lines).
//
// Inline: **bold**, *italic* / _italic_, ***both***, ~~strike~~, and CriticMarkup comments
//   {==passage==}{>>comment<<}  and  {>>comment<<}

import { parseCommentText } from './comments.mjs'
import { isIdeaLine } from './ideas.mjs'

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escAttr = (s) => esc(s).replace(/"/g, '&quot;')

// ---------- inline ----------
// Nodes carry absolute positions (`base` + index) so the live editor can hide or style exact ranges:
//   {t:'text', v, from, to}
//   {t:'strong'|'em'|'s', from, to, open, close, c}     open/close = length of the marker at each end
//   {t:'comment', from, to, anchor:[nodes]|null, anchorFrom, anchorTo, text, textFrom, textTo}
export function parseInline(s, base = 0) {
  const out = []
  let buf = ''
  let bufFrom = 0
  let i = 0
  const flush = () => { if (buf) { out.push({ t: 'text', v: buf, from: base + bufFrom, to: base + bufFrom + buf.length }); buf = '' } }
  while (i < s.length) {
    const rest = s.slice(i)
    let m
    if (s.startsWith('{==', i) && (m = /^\{==([^\n]*?)==\}\{>>([^\n]*?)<<\}/.exec(rest))) {
      flush()
      const anchorFrom = base + i + 3
      const anchorTo = anchorFrom + m[1].length
      const textFrom = anchorTo + 6 // "==}{>>"
      out.push({
        t: 'comment', from: base + i, to: base + i + m[0].length,
        anchor: parseInline(m[1], anchorFrom), anchorFrom, anchorTo,
        text: m[2], textFrom, textTo: textFrom + m[2].length
      })
      i += m[0].length; continue
    }
    if (s.startsWith('{>>', i) && (m = /^\{>>([^\n]*?)<<\}/.exec(rest))) {
      flush()
      const textFrom = base + i + 3
      out.push({
        t: 'comment', from: base + i, to: base + i + m[0].length,
        anchor: null, anchorFrom: -1, anchorTo: -1,
        text: m[1], textFrom, textTo: textFrom + m[1].length
      })
      i += m[0].length; continue
    }
    if (s.startsWith('***', i)) {
      const j = s.indexOf('***', i + 3)
      if (j > i + 3) {
        flush()
        // ***x*** = strong(**) wrapping em(*): the em closes with the first * of the closing run.
        out.push({
          t: 'strong', from: base + i, to: base + j + 3, open: 2, close: 2,
          c: [{ t: 'em', from: base + i + 2, to: base + j + 1, open: 1, close: 1, c: parseInline(s.slice(i + 3, j), base + i + 3) }]
        })
        i = j + 3; continue
      }
    }
    if (s.startsWith('**', i)) {
      const j = s.indexOf('**', i + 2)
      if (j > i + 2) {
        flush()
        out.push({ t: 'strong', from: base + i, to: base + j + 2, open: 2, close: 2, c: parseInline(s.slice(i + 2, j), base + i + 2) })
        i = j + 2; continue
      }
    }
    if (s.startsWith('~~', i)) {
      const j = s.indexOf('~~', i + 2)
      if (j > i + 2) {
        flush()
        out.push({ t: 's', from: base + i, to: base + j + 2, open: 2, close: 2, c: parseInline(s.slice(i + 2, j), base + i + 2) })
        i = j + 2; continue
      }
    }
    if (s[i] === '*' && s[i + 1] !== '*' && s[i + 1] !== ' ' && s[i + 1] !== undefined) {
      const j = s.indexOf('*', i + 1)
      if (j > i + 1 && s[j + 1] !== '*') {
        flush()
        out.push({ t: 'em', from: base + i, to: base + j + 1, open: 1, close: 1, c: parseInline(s.slice(i + 1, j), base + i + 1) })
        i = j + 1; continue
      }
    }
    if (s[i] === '_' && (i === 0 || !/\w/.test(s[i - 1])) && s[i + 1] !== undefined && s[i + 1] !== ' ') {
      const j = s.indexOf('_', i + 1)
      if (j > i + 1 && !/\w/.test(s[j + 1] || '')) {
        flush()
        out.push({ t: 'em', from: base + i, to: base + j + 1, open: 1, close: 1, c: parseInline(s.slice(i + 1, j), base + i + 1) })
        i = j + 1; continue
      }
    }
    if (!buf) bufFrom = i
    buf += s[i]
    i++
  }
  flush()
  return out
}

// Comment numbers follow document order, matching parseComments() in comments.mjs.
export function renderInlineHtml(nodes, ctx) {
  let h = ''
  for (const n of nodes) {
    if (n.t === 'text') h += esc(n.v)
    else if (n.t === 'strong') h += `<strong>${renderInlineHtml(n.c, ctx)}</strong>`
    else if (n.t === 'em') h += `<em>${renderInlineHtml(n.c, ctx)}</em>`
    else if (n.t === 's') h += `<s>${renderInlineHtml(n.c, ctx)}</s>`
    else if (n.t === 'comment') {
      const k = ++ctx.n
      const p = parseCommentText(n.text)
      if (n.anchor) h += `<mark class="hl c-${p.color}" id="cm-${k}">${renderInlineHtml(n.anchor, ctx)}</mark>`
      h += `<sup class="cmk c-${p.color}" data-n="${k}" title="${escAttr(p.text)}">${k}</sup>`
    }
  }
  return h
}

export function inline(raw) {
  return renderInlineHtml(parseInline(raw), { n: 0 })
}

// ---------- blocks ----------
const isRule = (l) => /^\s*(?:\*\s*\*\s*\*[\s*]*|-{3,}|_{3,})\s*$/.test(l)

// Blocks: {type:'p'|'h'|'quote', level?, nodes} {type:'hr'} {type:'list', ordered, items:[nodes]}
export function parseBlocks(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let list = null
  for (const line of lines) {
    if (!line.trim()) { list = null; continue }
    if (isIdeaLine(line)) continue // rewrite ideas are not story text
    if (isRule(line)) { list = null; blocks.push({ type: 'hr' }); continue }
    let m
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
      list = null
      blocks.push({ type: 'h', level: m[1].length, nodes: parseInline(m[2]) })
    } else if ((m = /^>\s?(.*)$/.exec(line))) {
      list = null
      blocks.push({ type: 'quote', nodes: parseInline(m[1]) })
    } else if ((m = /^\s*[-*+]\s+(.*)$/.exec(line))) {
      if (!list || list.ordered) { list = { type: 'list', ordered: false, items: [] }; blocks.push(list) }
      list.items.push(parseInline(m[1]))
    } else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
      if (!list || !list.ordered) { list = { type: 'list', ordered: true, items: [] }; blocks.push(list) }
      list.items.push(parseInline(m[1]))
    } else {
      list = null
      blocks.push({ type: 'p', nodes: parseInline(line) })
    }
  }
  return blocks
}

export function renderBlocksHtml(blocks, ctx) {
  const out = []
  for (const b of blocks) {
    if (b.type === 'hr') out.push('<hr>')
    else if (b.type === 'h') out.push(`<h${b.level}>${renderInlineHtml(b.nodes, ctx)}</h${b.level}>`)
    else if (b.type === 'quote') out.push(`<blockquote>${renderInlineHtml(b.nodes, ctx)}</blockquote>`)
    else if (b.type === 'list') {
      const tag = b.ordered ? 'ol' : 'ul'
      out.push(`<${tag}>`)
      for (const it of b.items) out.push(`<li>${renderInlineHtml(it, ctx)}</li>`)
      out.push(`</${tag}>`)
    } else out.push(`<p>${renderInlineHtml(b.nodes, ctx)}</p>`)
  }
  return out.join('\n')
}

// ctx.n carries the running comment number, so several chapters can share one numbering.
export function render(text, ctx = { n: 0 }) {
  return renderBlocksHtml(parseBlocks(text), ctx)
}
