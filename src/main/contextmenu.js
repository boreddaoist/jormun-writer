// Native right-click menus, built as plain data so they can be tested. index.js turns these into real menus.
//
// deps for the editor menu:  { send(actionOrName), replaceMisspelling(word), addToDictionary(word) }
// deps for the file menu:    { send(action), reveal(rel), copyPath(rel) }
// ctx (asked of the page at the click point): { editor: bool, note: number (0 = none), color: string, selection: bool }


const acc = (label, accelerator, click) => ({ label, accelerator, registerAccelerator: false, click })
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

export function editorMenuTemplate(params, deps, ctx = {}) {
  const t = []
  const send = (a) => () => deps.send(a)

  if (params.misspelledWord) {
    const sugg = (params.dictionarySuggestions || []).slice(0, 5)
    if (sugg.length) for (const s of sugg) t.push({ label: s, click: () => deps.replaceMisspelling(s) })
    else t.push({ label: 'No spelling suggestions', enabled: false })
    t.push({ label: 'Add to dictionary', click: () => deps.addToDictionary(params.misspelledWord) })
    t.push({ type: 'separator' })
  }

  // Notes (Word's comments): add one to the selection, or edit / delete the one under the cursor.
  if (ctx.editor && ctx.idea) {
    t.push({ label: 'Dismiss rewrite idea', click: send({ name: 'idea-dismiss' }) })
    t.push({ type: 'separator' })
  }
  if (ctx.editor) {
    if (ctx.note) {
      const n = ctx.note
      t.push({ label: 'Edit note', click: send({ name: 'note-edit', n }) })
      t.push({ label: 'Resolve note', click: send({ name: 'note-delete', n }) })
    } else {
      t.push(acc(ctx.selection ? 'Add note to selection…' : 'Add note here…', 'Ctrl+Alt+M', send('comment')))
    }
    t.push({ type: 'separator' })
  }

  const f = params.editFlags || {}
  t.push({ role: 'cut', enabled: !!f.canCut })
  t.push({ role: 'copy', enabled: !!f.canCopy })
  t.push({ role: 'paste', enabled: !!f.canPaste })
  t.push({ role: 'selectAll' })

  if (ctx.editor) {
    t.push({ type: 'separator' })
    t.push({
      label: 'Format',
      submenu: [
        acc('Bold', 'Ctrl+B', send('bold')),
        acc('Italic', 'Ctrl+I', send('italic')),
        { label: 'Strikethrough', click: send('strike') },
        { type: 'separator' },
        { label: 'Heading 1', click: send('h1') },
        { label: 'Heading 2', click: send('h2') },
        { label: 'Heading 3', click: send('h3') },
        { label: 'Quote', click: send('quote') },
        { label: 'Bulleted list', click: send('bullet') },
        { label: 'Scene break', click: send('scene') }
      ]
    })
  }
  return t
}

// The Navigation pane's menus. kind: 'chapter' (a heading's file) | 'chapters-header'
export function fileMenuTemplate(kind, info, deps) {
  const t = []
  if (kind === 'chapter') {
    t.push({ label: 'Go to heading', click: () => deps.send({ type: 'open', rel: info.rel }) })
    if (!info.fallback && Number.isFinite(info.pos)) {
      const act = (op) => () => deps.send({ type: 'section', op, rel: info.rel, pos: info.pos })
      t.push({ label: 'Rename heading', click: act('rename') })
      t.push({ type: 'separator' })
      t.push({ label: 'Move section up', click: act('up') })
      t.push({ label: 'Move section down', click: act('down') })
      t.push({ label: 'Delete section…', click: act('delete') })
    }
    t.push({ type: 'separator' })
    t.push({ label: 'Show file in File Explorer', click: () => deps.reveal(info.rel) })
    t.push({ label: 'Copy file path', click: () => deps.copyPath(info.rel) })
  } else if (kind === 'chapters-header') {
    t.push({ label: 'Add a chapter', click: () => deps.send({ type: 'new-chapter' }) })
  }
  return t
}
