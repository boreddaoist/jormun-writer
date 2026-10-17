import { app, BrowserWindow, ipcMain, dialog, Menu, shell, clipboard } from 'electron'
import { join, basename, dirname } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'fs'
import { spawn } from 'child_process'
import { Project, resolveInside } from './project.js'
import { editorMenuTemplate, fileMenuTemplate } from './contextmenu.js'
import { createProject } from './scaffold.js'
import { mergeManuscript, copyProject } from './manage.js'
import { buildDocx, buildMarkdown } from './exporter.js'
import aiInstructions from '../../docs/AI-INSTRUCTIONS.md?raw'
import appIcon from '../../build/icon.png?asset'

// Dev/QA only: run with a throwaway settings folder so tests never touch the real preferences.
if (process.env.JORMUN_USER_DATA) app.setPath('userData', process.env.JORMUN_USER_DATA)

let win = null
let project = null
let forceClose = false // true once the page has saved everything (or the app is quitting anyway)

// ---- tiny settings file (remembers the last project) ----
const settingsPath = () => join(app.getPath('userData'), 'settings.json')
function readSettings() {
  try { return JSON.parse(readFileSync(settingsPath(), 'utf8')) } catch { return {} }
}
function saveSettings(patch) {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(settingsPath(), JSON.stringify({ ...readSettings(), ...patch }, null, 2))
  } catch { /* settings are a convenience only */ }
}

function argProject() {
  const i = process.argv.indexOf('--project')
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1]
  return process.env.JORMUN_PROJECT || null
}

const MAX_RECENT = 8
function rememberRecent(root) {
  const list = (readSettings().recent || []).filter((p) => p !== root)
  list.unshift(root)
  return list.slice(0, MAX_RECENT)
}
function recentProjects() {
  return (readSettings().recent || [])
    .filter((p) => { try { return statSync(p).isDirectory() } catch { return false } })
    .map((p) => ({ path: p, name: p.split(/[\\/]/).pop() }))
}

async function openProject(dir) {
  if (project) await project.close()
  const p = new Project(dir, (ev) => {
    if (win && !win.isDestroyed()) win.webContents.send('fs:event', ev)
  })
  const data = await p.load()
  p.startWatch()
  project = p
  saveSettings({ lastProject: p.root, recent: rememberRecent(p.root) })
  return data
}

function createWindow() {
  win = new BrowserWindow({
    icon: appIcon, // the taskbar / window icon (the installed app also carries it in the .exe)
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: '#020308',
    title: 'Jormun Writer',
    // Custom title bar: our own bar is the window's top edge; Windows draws only the min/max/close buttons over it.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#070910', symbolColor: '#9ca6ba', height: 42 },
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  // Show the window as soon as the page has loaded. ready-to-show alone was not reliable with the custom title bar,
  // so there are two more triggers plus a timer: the window must never stay hidden.
  const reveal = () => {
    if (win && !win.isDestroyed() && !win.isVisible()) { win.show(); win.focus() }
  }
  win.once('ready-to-show', reveal)
  win.webContents.once('did-finish-load', reveal)
  win.webContents.once('did-fail-load', reveal)
  setTimeout(reveal, 4000)
  // Closing the window first asks the page to save everything (and to warn if something can't be saved).
  win.on('close', (e) => {
    if (forceClose) return
    e.preventDefault()
    win.webContents.send('app:before-close')
  })
  win.webContents.on('render-process-gone', () => { forceClose = true }) // a crashed page must never trap the window
  // Right-click in the editor: spelling, clipboard, New comment and Format. (Native menu, so it matches Windows.)
  win.webContents.on('context-menu', async (_e, params) => {
    if (process.env.JORMUN_QA_MENU_DUMP) {
      console.log('[ctx]', JSON.stringify({ editable: params.isEditable, sel: params.selectionText, x: params.x, y: params.y, field: params.inputFieldType, control: params.formControlType }))
    }
    if (!params.isEditable && !params.selectionText && !params.misspelledWord) return
    const wc = win.webContents
    // Ask the page what was right-clicked: the editor? a note? is text selected?
    let ctx = { editor: false }
    try {
      const x = Number(params.x) || 0
      const y = Number(params.y) || 0
      ctx = (await wc.executeJavaScript(`window.__jwCtx ? window.__jwCtx(${x}, ${y}) : null`)) || ctx
    } catch { /* page not ready: show the basic menu */ }
    const tpl = editorMenuTemplate(params, {
      send: (a) => wc.send('editor:action', a),
      replaceMisspelling: (w) => wc.replaceMisspelling(w),
      addToDictionary: (w) => wc.session.addWordToSpellCheckerDictionary(w)
    }, ctx)
    if (process.env.JORMUN_QA_MENU_DUMP) { console.log('[menu]', JSON.stringify(tpl)); return }
    Menu.buildFromTemplate(tpl).popup({ window: win })
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../../dist/renderer/index.html'))

  // Dev/QA only: JORMUN_QA_JS runs a script in the page (used to click buttons in tests).
  const qaJs = process.env.JORMUN_QA_JS || (process.env.JORMUN_QA_FILE ? readFileSync(process.env.JORMUN_QA_FILE, 'utf8') : '')
  if (qaJs) {
    win.webContents.on('console-message', (_e, _level, msg) => console.log('[renderer]', msg))
    win.webContents.once('did-finish-load', () => {
      const at = parseInt(process.env.JORMUN_QA_AT_MS || '4000', 10)
      // An automated launch is not the foreground window; give it real focus so the editor behaves as it does for a person.
      win.show(); win.focus(); win.webContents.focus()
      setTimeout(() => win.webContents.executeJavaScript(qaJs).catch((e) => console.error('QA script error:', e.message)), at)
    })
  }

  // Dev/QA only: JORMUN_QA_CLOSE_AT_MS simulates clicking the window's X button.
  if (process.env.JORMUN_QA_CLOSE_AT_MS) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => { if (win && !win.isDestroyed()) win.close() }, parseInt(process.env.JORMUN_QA_CLOSE_AT_MS, 10))
    })
  }

  // Dev/QA only: JORMUN_QA_ACTION="name,delayMs" sends an editor action as a right-click menu item would.
  if (process.env.JORMUN_QA_ACTION) {
    // "italic@5000" or a JSON action like '{"name":"note-color","n":2,"color":"green"}@5000'
    const spec = process.env.JORMUN_QA_ACTION
    const at = spec.lastIndexOf('@')
    const raw = spec.slice(0, at)
    const delay = parseInt(spec.slice(at + 1), 10)
    const action = raw.startsWith('{') ? JSON.parse(raw) : raw
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => win.webContents.send('editor:action', action), delay)
    })
  }

  // Dev/QA only: JORMUN_QA_RIGHTCLICK="x,y,delayMs" sends a real right-click to the page.
  if (process.env.JORMUN_QA_RIGHTCLICK) {
    const [x, y, delay] = process.env.JORMUN_QA_RIGHTCLICK.split(',').map(Number)
    win.webContents.once('did-finish-load', () => {
      win.show(); win.focus(); win.webContents.focus()
      setTimeout(() => {
        for (const type of ['mouseDown', 'mouseUp']) win.webContents.sendInputEvent({ type, x, y, button: 'right', clickCount: 1 })
      }, delay)
    })
  }

  // Dev/QA only: JORMUN_QA_CLICKTYPE="x,y,delayMs,text" sends a real left-click, then real key presses.
  if (process.env.JORMUN_QA_CLICKTYPE) {
    const [x, y, delay, text] = process.env.JORMUN_QA_CLICKTYPE.split(',')
    win.webContents.once('did-finish-load', () => {
      win.show(); win.focus(); win.webContents.focus()
      setTimeout(async () => {
        const wc = win.webContents
        for (const type of ['mouseDown', 'mouseUp']) wc.sendInputEvent({ type, x: Number(x), y: Number(y), button: 'left', clickCount: 1 })
        await new Promise((r) => setTimeout(r, 800))
        for (const ch of text) { wc.sendInputEvent({ type: 'char', keyCode: ch }); await new Promise((r) => setTimeout(r, 120)) }
      }, Number(delay))
    })
  }

  // Dev/QA only: JORMUN_SCREENSHOT=<png path> saves a screenshot and quits.
  if (process.env.JORMUN_SCREENSHOT) {
    win.webContents.once('did-finish-load', () => {
      const wait = parseInt(process.env.JORMUN_SCREENSHOT_AFTER_MS || '3500', 10)
      setTimeout(async () => {
        const img = await win.webContents.capturePage()
        writeFileSync(process.env.JORMUN_SCREENSHOT, img.toPNG())
        app.quit()
      }, wait)
    })
  }
}

function registerIpc() {
  ipcMain.handle('project:startup', async () => {
    const candidate = argProject() || readSettings().lastProject
    if (candidate && existsSync(candidate) && statSync(candidate).isDirectory()) {
      try { return await openProject(candidate) } catch { return null }
    }
    return null
  })
  ipcMain.handle('project:pick', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Open a Jormun project folder',
      properties: ['openDirectory']
    })
    if (r.canceled || !r.filePaths[0]) return null
    return openProject(r.filePaths[0])
  })
  ipcMain.handle('app:close-now', () => {
    forceClose = true
    if (win && !win.isDestroyed()) win.close()
  })
  ipcMain.handle('ctx:file', (_e, kind, info) => {
    const safe = info && typeof info === 'object' ? info : {}
    const tpl = fileMenuTemplate(kind, safe, {
      send: (a) => win.webContents.send('ui:action', a),
      reveal: (rel) => { if (project) shell.showItemInFolder(resolveInside(project.root, rel)) },
      copyPath: (rel) => { if (project) clipboard.writeText(resolveInside(project.root, rel)) }
    })
    if (process.env.JORMUN_QA_MENU_DUMP) { console.log('[filemenu]', JSON.stringify(tpl)); return }
    if (tpl.length) Menu.buildFromTemplate(tpl).popup({ window: win })
  })
  // The one outside link in the app (a fixed address, never a URL from the page).
  ipcMain.handle('app:kofi', () => shell.openExternal('https://ko-fi.com/boredjun'))
  ipcMain.handle('project:reveal', () => {
    if (project) shell.openPath(project.root)
    return !!project
  })
  ipcMain.handle('project:recent', () => recentProjects())
  ipcMain.handle('project:open', async (_e, dir) => {
    if (typeof dir !== 'string' || !existsSync(dir) || !statSync(dir).isDirectory()) throw new Error('That folder is no longer there.')
    return openProject(dir)
  })
  ipcMain.handle('project:create', async (_e, name) => {
    // Dev/QA only: JORMUN_QA_DIALOG_DIR stands in for the native folder picker.
    let parent = process.env.JORMUN_QA_DIALOG_DIR
    if (!parent) {
      const r = await dialog.showOpenDialog(win, {
        title: 'Choose where to create the project folder',
        properties: ['openDirectory', 'createDirectory']
      })
      if (r.canceled || !r.filePaths[0]) return null
      parent = r.filePaths[0]
    }
    const root = await createProject(parent, name, aiInstructions)
    return openProject(root)
  })
  // Merge Manuscript/Chapter*.md into one Manuscript.md (the separate files are moved to a hidden backup folder).
  ipcMain.handle('project:merge', async () => {
    if (!project) return null
    if (!process.env.JORMUN_QA_DIALOG_DIR) {
      const r = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['Merge into one file', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
        title: 'Merge chapters',
        message: 'Put all chapters into one file?',
        detail: 'Every chapter file in the Manuscript folder becomes a heading in a single Manuscript.md. The separate files are not deleted: they are moved into a hidden .jormun/chapters-backup folder in the project.'
      })
      if (r.response !== 0) return null
    }
    const root = project.root
    const { count } = await mergeManuscript(root, basename(root))
    return { data: await openProject(root), count }
  })
  // Copy the whole project to a folder the user picks and continue working in the copy.
  ipcMain.handle('project:saveAs', async () => {
    if (!project) return null
    let dest = process.env.JORMUN_QA_DIALOG_DIR ? join(process.env.JORMUN_QA_DIALOG_DIR, 'saved-as-copy') : ''
    if (!dest) {
      const r = await dialog.showSaveDialog(win, {
        title: 'Save project as (choose a new folder name)',
        defaultPath: join(dirname(project.root), basename(project.root) + ' copy'),
        buttonLabel: 'Save project here',
        properties: ['createDirectory', 'showOverwriteConfirmation']
      })
      if (r.canceled || !r.filePath) return null
      dest = r.filePath
    }
    await copyProject(project.root, dest)
    return openProject(dest)
  })
  ipcMain.handle('export:run', async (_e, payload) => {
    const isDocx = payload.format === 'docx'
    const safe = String(payload.title || 'Manuscript').replace(/[\\/:*?"<>|]/g, '').trim() || 'Manuscript'
    const qa = process.env.JORMUN_QA_DIALOG_DIR // Dev/QA only: skip the native save dialog
    let filePath
    if (qa) {
      filePath = join(qa, safe + (isDocx ? '.docx' : '.md'))
    } else {
      const r = await dialog.showSaveDialog(win, {
        title: isDocx ? 'Export to Word' : 'Export to Markdown',
        defaultPath: join(app.getPath('documents'), safe + (isDocx ? '.docx' : '.md')),
        filters: isDocx ? [{ name: 'Word document', extensions: ['docx'] }] : [{ name: 'Markdown', extensions: ['md'] }]
      })
      if (r.canceled || !r.filePath) return null
      filePath = r.filePath
    }
    if (isDocx) writeFileSync(filePath, await buildDocx(payload))
    else writeFileSync(filePath, buildMarkdown(payload), 'utf8')
    if (!qa) shell.showItemInFolder(filePath)
    return filePath
  })
  ipcMain.handle('file:write', (_e, rel, text) => {
    if (!project) throw new Error('No project open')
    return project.write(rel, text)
  })
  // Version history of one file: list, read one version, store a snapshot (done before a restore).
  ipcMain.handle('history:list', async (_e, rel) => {
    if (!project) return []
    resolveInside(project.root, rel)
    return project.history.list(rel)
  })
  ipcMain.handle('history:read', async (_e, rel, id) => {
    if (!project) throw new Error('No project open')
    resolveInside(project.root, rel)
    return project.history.read(rel, id)
  })
  ipcMain.handle('history:snapshot', async (_e, rel, text, reason) => {
    if (!project) return null
    resolveInside(project.root, rel)
    return project.history.snapshot(rel, text, reason === 'before-restore' ? 'before-restore' : 'autosave')
  })
  ipcMain.handle('file:create', (_e, rel, text) => {
    if (!project) throw new Error('No project open')
    return project.create(rel, text)
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  app.on('before-quit', () => { forceClose = true })
  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('com.jormun.writer') // so Windows groups the window under our icon, not Electron's
    Menu.setApplicationMenu(null)
    registerIpc()
    createWindow()
  })
  app.on('window-all-closed', async () => {
    if (project) await project.close()
    app.quit()
  })
}
