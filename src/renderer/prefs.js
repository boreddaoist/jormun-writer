import { reactive, watchEffect } from 'vue'

export const FONTS = [
  { id: 'lato', label: 'Lato', stack: "'Lato', 'Segoe UI', sans-serif" },
  { id: 'calibri', label: 'Calibri', stack: "'Calibri', 'Carlito', 'Lato', sans-serif" },
  { id: 'inter', label: 'Inter', stack: "'Inter', 'Segoe UI', sans-serif" },
  { id: 'literata', label: 'Literata', stack: "'Literata', Georgia, serif" },
  { id: 'garamond', label: 'EB Garamond', stack: "'EB Garamond', Garamond, Georgia, serif" },
  { id: 'georgia', label: 'Georgia', stack: "Georgia, 'Times New Roman', serif" },
  { id: 'consolas', label: 'Consolas (mono)', stack: "Consolas, 'Courier New', monospace" }
]
export const LINE_HEIGHTS = [
  { value: 1.5, label: 'Tight' },
  { value: 1.7, label: 'Normal' },
  { value: 2, label: 'Relaxed' }
]
export const WIDTHS = [
  { value: 820, label: 'Narrow' },
  { value: 980, label: 'Normal' },
  { value: 1120, label: 'Wide' }
]
// View zoom (like Word's): scales the page and the notes together, without touching the real font size.
export const ZOOM_MIN = 50
export const ZOOM_MAX = 300
export const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200, 300]
export const SIZE_MIN = 13
export const SIZE_MAX = 30

// The two accents of the Jormun apps (taken from Jormun Reader's design tokens): ocean blue is the default.
export const ACCENTS = {
  ocean: { label: 'Ocean', color: '#0098DA', hover: '#1aabeb', rgb: '0, 152, 218' },
  fuchsia: { label: 'Fuchsia', color: '#e8316a', hover: '#f0456f', rgb: '232, 49, 106' }
}

const KEY = 'jw.prefs'
const defaults = {
  font: 'lato', size: 20, lineHeight: 1.7, width: 980, zoom: 100, sidebar: true, author: '', margin: true,
  accent: 'ocean',
  reveal: false // show the Markdown marks (** # >) under the cursor; off = they stay hidden like in Word
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}')
    const p = { ...defaults, ...raw }
    if (raw.size === 19) p.size = defaults.size // the old default size moves up one step
    if (!FONTS.some((f) => f.id === p.font)) p.font = defaults.font
    p.size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, Number(p.size) || defaults.size))
    if (!LINE_HEIGHTS.some((l) => l.value === p.lineHeight)) p.lineHeight = defaults.lineHeight
    if (!WIDTHS.some((w) => w.value === p.width)) p.width = defaults.width
    p.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(Number(p.zoom) || 100)))
    p.sidebar = p.sidebar !== false
    p.author = String(p.author || '')
    p.margin = true // the notes margin is always on (no toggle any more)
    p.accent = ACCENTS[p.accent] ? p.accent : defaults.accent
    p.reveal = p.reveal === true
    return p
  } catch {
    return { ...defaults }
  }
}

export const prefs = reactive(load())

watchEffect(() => {
  const font = FONTS.find((f) => f.id === prefs.font) || FONTS[0]
  const accent = ACCENTS[prefs.accent] || ACCENTS.ocean
  const root = document.documentElement
  root.style.setProperty('--editor-font', font.stack)
  root.style.setProperty('--editor-size', (prefs.size * prefs.zoom) / 100 + 'px')
  root.style.setProperty('--page-w', (prefs.width * prefs.zoom) / 100 + 'px')
  root.style.setProperty('--zoom', String(prefs.zoom / 100))
  root.style.setProperty('--editor-lh', String(prefs.lineHeight))
  root.style.setProperty('--accent', accent.color)
  root.style.setProperty('--accent-hover', accent.hover)
  root.style.setProperty('--accent-rgb', accent.rgb)
  try {
    localStorage.setItem(KEY, JSON.stringify({
      font: prefs.font, size: prefs.size, lineHeight: prefs.lineHeight, width: prefs.width, zoom: prefs.zoom, sidebar: prefs.sidebar,
      author: prefs.author, margin: prefs.margin, accent: prefs.accent, reveal: prefs.reveal
    }))
  } catch { /* preferences are a convenience; the app works without storage */ }
})

export function bumpSize(delta) {
  prefs.size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, prefs.size + delta))
}
export function setZoom(v) {
  prefs.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(v)))
}
export function stepZoom(dir) {
  // 10% steps that land on multiples of 10, like Word
  const cur = prefs.zoom
  setZoom(dir > 0 ? Math.floor(cur / 10) * 10 + 10 : Math.ceil(cur / 10) * 10 - 10)
}
export function toggleSidebar() {
  prefs.sidebar = !prefs.sidebar
}
