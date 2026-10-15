// Pure sync logic for one open file. No Electron, no Vue, no I/O: this is the part
// that decides what happens when you type and an AI edits the same file in VS Code.
//
// State per file:
//   baseline  last version a human "owned" (own typing, or an accepted AI change)
//   disk      last text known to be on disk
//   buffer    what is in the editor right now
//   pending   null | { from, to }   an outside edit waiting for review
//   conflict  null | { mine, theirs } outside edit arrived while we had unsaved typing

export function initState(text) {
  return { baseline: text, disk: text, buffer: text, pending: null, conflict: null, deleted: false }
}

export const isDirty = (s) => s.buffer !== s.disk

// The user typed. Typing on top of a pending outside change counts as accepting it,
// so nothing the user does can silently throw their own words away.
export function applyUserEdit(s, text) {
  if (text === s.buffer) return s
  const next = { ...s, buffer: text }
  if (s.pending) {
    next.baseline = s.pending.to
    next.pending = null
  }
  return next
}

// Our own write reached the disk.
export function onSaved(s, text) {
  return { ...s, disk: text, deleted: false, baseline: s.pending ? s.baseline : text }
}

// The file changed on disk and it was not our own write.
export function applyExternal(s, text) {
  if (text === s.disk) return s
  if (s.buffer !== s.disk) {
    // We have typing that is not saved yet: never overwrite it, ask instead.
    return { ...s, disk: text, deleted: false, conflict: { mine: s.buffer, theirs: text } }
  }
  const from = s.pending ? s.pending.from : s.baseline
  if (text === from) {
    // The outside edits were undone by the outside: nothing left to review.
    return { ...s, disk: text, buffer: text, pending: null, conflict: null, deleted: false }
  }
  return { ...s, disk: text, buffer: text, pending: { from, to: text }, conflict: null, deleted: false }
}

export function applyDeleted(s) {
  return { ...s, deleted: true }
}

export function acceptPending(s) {
  if (!s.pending) return s
  return { ...s, baseline: s.pending.to, pending: null }
}

// Undo the outside edits. The caller must write `buffer` to disk afterwards
// (buffer differs from disk, so the normal autosave path does that).
export function rejectPending(s) {
  if (!s.pending) return s
  const from = s.pending.from
  return { ...s, buffer: from, baseline: from, pending: null }
}

export function resolveConflict(s, choice) {
  if (!s.conflict) return s
  if (choice === 'mine') {
    // Keep typing; autosave overwrites the outside version.
    return { ...s, conflict: null, baseline: s.disk }
  }
  return { ...s, buffer: s.conflict.theirs, baseline: s.conflict.theirs, conflict: null, pending: null }
}
