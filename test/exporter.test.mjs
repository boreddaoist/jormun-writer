import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { buildDocx, buildMarkdown } from '../src/main/exporter.js'

const chapters = [
  {
    title: 'A Weird Start',
    text: '---\ntitle: A Weird Start\nstatus: draft\n---\nHe came *home* to a **broken** door.\nThe {==girl==}{>>AI: who is she?<<} said nothing & left.\n\n* * *\n\n> a quote\n- one\n- two\n'
  },
  { title: 'Second', text: 'Plain chapter with {>>loose note<<} text.\n# Inner heading\nBody.' }
]

async function unzip(buf) {
  const z = await JSZip.loadAsync(buf)
  const get = async (n) => (z.file(n) ? z.file(n).async('string') : null)
  return { z, doc: await get('word/document.xml'), comments: await get('word/comments.xml') }
}
const text = (xml) => (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((s) => s.replace(/<[^>]+>/g, '')).join('|')

test('docx contains title page, chapter headings, formatting, no frontmatter, no comments by default', async () => {
  const buf = await buildDocx({ title: 'My Novel', author: 'Jun', chapters, includeComments: false, titlePage: true })
  const { doc, comments } = await unzip(buf)
  const t = text(doc)
  assert.ok(t.includes('My Novel'))
  assert.ok(t.includes('A Weird Start') && t.includes('Second'))
  assert.ok(!t.includes('status: draft'), 'frontmatter must not leak into the book')
  assert.ok(!t.includes('who is she') && !t.includes('loose note'), 'comments off: comment text is not in the body')
  assert.ok(t.includes('girl'), 'comments off: the highlighted passage text stays')
  assert.ok(/<w:i\/>|<w:i /.test(doc), 'italic run')
  assert.ok(/<w:b\/>|<w:b /.test(doc), 'bold run')
  assert.equal(comments, null)
  assert.ok(t.includes('* * *'))
})

test('includeComments writes real Word comments with authors', async () => {
  const buf = await buildDocx({ title: 'My Novel', author: 'Jun', chapters, includeComments: true, titlePage: false })
  const { doc, comments } = await unzip(buf)
  assert.ok(comments, 'word/comments.xml exists')
  assert.ok(doc.includes('commentRangeStart') && doc.includes('commentRangeEnd') && doc.includes('commentReference'))
  assert.ok(text(comments).includes('who is she?'))
  assert.ok(text(comments).includes('loose note'))
  assert.ok(comments.includes('w:author="AI"'), 'AI: prefix becomes author AI')
  assert.ok(comments.includes('w:author="Jun"'))
  assert.ok(!text(comments).includes('AI:'), 'the AI: prefix is not repeated in the comment text')
})

test('markdown compile drops frontmatter and (optionally) comments', () => {
  const md = buildMarkdown({ title: 'My Novel', chapters, includeComments: false })
  assert.ok(md.startsWith('# My Novel\n\n## A Weird Start'))
  assert.ok(!md.includes('status: draft'))
  assert.ok(md.includes('The girl said nothing'))
  assert.ok(!md.includes('{>>'))
  const withC = buildMarkdown({ title: 'My Novel', chapters, includeComments: true })
  assert.ok(withC.includes('{==girl==}{>>AI: who is she?<<}'))
})

test('no title page: first chapter does not start on a blank page', async () => {
  const buf = await buildDocx({ title: 'T', chapters: [chapters[0]], titlePage: false })
  const { doc } = await unzip(buf)
  assert.ok(!doc.includes('pageBreakBefore'))
})
