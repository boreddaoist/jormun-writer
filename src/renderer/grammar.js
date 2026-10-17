// Offline grammar suggestions, powered by Harper (harper.js): it runs inside the app, nothing is sent anywhere.
// The engine (about 20 MB) is only loaded the first time grammar checking is on.
//
// Spelling is left to the built-in spell checker (the red underlines), and the rules that fight with fiction (curse
// words, dialogue contractions, "closed compound" nit-picks, ellipsis style, long sentences) are switched off.

export const DIALECTS = { American: 0, British: 1, Australian: 2, Canadian: 3, Indian: 4 }
export const DIALECT_NAMES = Object.keys(DIALECTS)

const OFF = [
  'AvoidCurses', 'CompoundNouns', 'OpenCompounds', 'PhrasalVerbAsCompoundNoun', 'MakeupCompoundNoun', 'OvertimeCompoundNoun',
  'LongSentences', 'UseEllipsisCharacter', 'EllipsisLength', 'SpellCheck', 'Misspell', 'SpelledNumbers', 'AvoidContractions', 'NoFrenchSpaces'
]
// text inside notes and rewrite ideas is not the story: Harper skips it (this is a Rust regex)
const MASK = '(?m)^[{]!!.*!![}]$|[{]>>.*?<<[}]|[{]==|==[}]'

let loading = null
let linter = null
let current = ''
let queue = Promise.resolve() // the engine handles one request at a time

async function load() {
  const harper = await import('harper.js')
  const bytes = await window.jormun.grammarWasm()
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/wasm' }))
  return { harper, binary: harper.createBinaryModuleFromUrl(url, 'full') }
}

async function engine(dialect) {
  if (!loading) loading = load()
  const { harper, binary } = await loading
  if (!linter || current !== dialect) {
    const l = new harper.LocalLinter({ binary, dialect: DIALECTS[dialect] ?? 0 })
    await l.setup()
    const cfg = await l.getLintConfig()
    for (const k of OFF) if (k in cfg) cfg[k] = false
    await l.setLintConfig(cfg)
    linter = l
    current = dialect
  }
  return linter
}

const keyOf = (l) => l.kind + '|' + l.text.toLowerCase()

// [{ from, to, kind, message, text, suggestions: [string], key }] for a piece of Markdown
export function lintText(text, dialect = 'American') {
  const run = queue.then(async () => {
    const l = await engine(dialect)
    const lints = await l.lint(text, { language: 'markdown', regex_mask: MASK })
    const out = []
    for (const x of lints) {
      const s = x.span()
      const problem = text.slice(s.start, s.end)
      const lint = {
        from: s.start, to: s.end, kind: x.lint_kind(), message: x.message(), text: problem,
        suggestions: x.suggestions().map((q) => {
          const r = q.get_replacement_text()
          const k = q.kind()
          return k === 1 ? '' : k === 2 ? problem + r : r // remove / insert after / replace
        })
      }
      lint.key = keyOf(lint)
      out.push(lint)
    }
    return out
  })
  queue = run.catch(() => {})
  return run
}

// ---- "ignore this suggestion": remembered for good (by kind and text), on this computer ----
const IGNORE_KEY = 'jw.gramIgnore'
function loadIgnored() {
  try { return new Set(JSON.parse(localStorage.getItem(IGNORE_KEY) || '[]')) } catch { return new Set() }
}
let ignored = loadIgnored()
export const isIgnored = (lint) => ignored.has(lint.key)
export function ignoreLint(key) {
  ignored.add(key)
  try { localStorage.setItem(IGNORE_KEY, JSON.stringify([...ignored])) } catch { /* the ignore list is a convenience */ }
}
