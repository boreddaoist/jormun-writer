import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  CommentRangeStart, CommentRangeEnd, CommentReference, LevelFormat, Footer, PageNumber
} from 'docx'
import { parseBlocks } from '../shared/md.mjs'
import { splitFront } from '../shared/text.mjs'
import { stripComments, parseCommentText } from '../shared/comments.mjs'

const FONT = 'Georgia'
const HEADINGS = [HeadingLevel.HEADING_2, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6]

// ---------- inline -> runs (and Word comments) ----------
function runsFor(nodes, st, ctx) {
  const out = []
  for (const n of nodes) {
    if (n.t === 'text') {
      out.push(new TextRun({ text: n.v, bold: st.bold, italics: st.italics, strike: st.strike, font: FONT }))
    } else if (n.t === 'strong') out.push(...runsFor(n.c, { ...st, bold: true }, ctx))
    else if (n.t === 'em') out.push(...runsFor(n.c, { ...st, italics: true }, ctx))
    else if (n.t === 's') out.push(...runsFor(n.c, { ...st, strike: true }, ctx))
    else if (n.t === 'comment') {
      if (!ctx.includeComments) {
        if (n.anchor) out.push(...runsFor(n.anchor, st, ctx))
        continue
      }
      const id = ctx.comments.length
      const p = parseCommentText(n.text) // drops the AI: and [colour] tags from the note text
      const ai = p.author === 'AI'
      ctx.comments.push({
        id,
        author: ai ? 'AI' : ctx.author,
        initials: ai ? 'AI' : (ctx.author.match(/\b\w/g) || ['A']).slice(0, 2).join('').toUpperCase(),
        date: new Date(),
        children: [new Paragraph({ children: [new TextRun({ text: p.text, font: FONT })] })]
      })
      out.push(new CommentRangeStart(id))
      if (n.anchor) out.push(...runsFor(n.anchor, st, ctx))
      out.push(new CommentRangeEnd(id))
      out.push(new TextRun({ children: [new CommentReference(id)] }))
    }
  }
  return out
}

// ---------- blocks -> paragraphs ----------
function blocksToParagraphs(blocks, ctx) {
  const out = []
  let first = true // no first-line indent on the first paragraph of a chapter or after a scene break
  for (const b of blocks) {
    if (b.type === 'hr') {
      out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 }, children: [new TextRun({ text: '* * *', font: FONT })] }))
      first = true
    } else if (b.type === 'h') {
      out.push(new Paragraph({ heading: HEADINGS[b.level - 1], pageBreakBefore: !!ctx.h1Break && b.level === 1, children: runsFor(b.nodes, {}, ctx) }))
      first = true
    } else if (b.type === 'quote') {
      out.push(new Paragraph({ indent: { left: 720, right: 720 }, spacing: { line: 360, after: 120 }, children: runsFor(b.nodes, { italics: true }, ctx) }))
    } else if (b.type === 'list') {
      const instance = ++ctx.listCount
      for (const item of b.items) {
        out.push(new Paragraph({
          numbering: { reference: b.ordered ? 'numbers' : 'bullets', level: 0, instance },
          spacing: { line: 360 },
          children: runsFor(item, {}, ctx)
        }))
      }
      first = true
    } else {
      out.push(new Paragraph({
        spacing: { line: 360, after: 0 },
        indent: first ? undefined : { firstLine: 360 },
        children: runsFor(b.nodes, {}, ctx)
      }))
      first = false
    }
  }
  return out
}

const stripFront = (text) => splitFront(text).body

// payload: { title, author, chapters: [{title, text}], includeComments, titlePage }
export async function buildDocx({ title, author = 'Author', chapters, includeComments = false, titlePage = true }) {
  // a chapter with no title is a whole manuscript whose own # headings are the chapters: each starts a page
  const ctx = { includeComments, author, comments: [], listCount: 0, h1Break: chapters.some((c) => !c.title) }
  const children = []

  if (titlePage) {
    children.push(new Paragraph({ spacing: { before: 3600, after: 240 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: title, bold: true, size: 56, font: FONT })] }))
    if (author) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: author, size: 28, font: FONT })] }))
  }

  chapters.forEach((ch, i) => {
    if (ch.title) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        pageBreakBefore: titlePage || i > 0,
        spacing: { before: 0, after: 360 },
        children: [new TextRun({ text: ch.title, font: FONT })]
      }))
    }
    children.push(...blocksToParagraphs(parseBlocks(stripFront(ch.text)), ctx))
  })

  const doc = new Document({
    creator: author,
    title,
    comments: ctx.comments.length ? { children: ctx.comments } : undefined,
    styles: {
      default: { document: { run: { font: FONT, size: 24 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 36, bold: true, font: FONT }, paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 30, bold: true, font: FONT }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 26, bold: true, font: FONT }, paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } }
      ]
    },
    numbering: {
      config: [
        { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }
      ]
    },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18 })] })] }) },
      children
    }]
  })
  return Packer.toBuffer(doc)
}

export function buildMarkdown({ title, chapters, includeComments = false }) {
  const parts = [`# ${title}`]
  for (const ch of chapters) {
    let body = stripFront(ch.text).trim()
    if (!includeComments) body = stripComments(body)
    parts.push(ch.title ? `## ${ch.title}\n\n${body}` : body)
  }
  return parts.join('\n\n') + '\n'
}
