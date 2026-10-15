import { promises as fs } from 'fs'
import path from 'path'

export function cleanProjectName(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '')
}

const overview = (title) => `---
title: "${title.replace(/"/g, "'")}"
tags: [overview]
status: idea
---

# ${title}

> **Logline:** one or two sentences: who wants what, and what stands in the way.

## Characters
-

## World
-

## Plot
-
`

const manuscript = (title) => `---
title: "${title.replace(/"/g, "'")}"
status: draft
---

# Chapter 1

`

// Creates <parentDir>/<name> with Manuscript.md (the whole book in one file), Characters/, Worldbuilding/, Plot/, an
// overview note and a CLAUDE.md that tells an AI how to edit the project. Refuses to touch an existing folder.
export async function createProject(parentDir, name, aiInstructions = '') {
  const clean = cleanProjectName(name)
  if (!clean) throw new Error('Give the project a name.')
  const root = path.join(parentDir, clean)
  try {
    await fs.access(root)
    throw new Error(`A folder named "${clean}" already exists there.`)
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }
  for (const dir of ['Characters', 'Worldbuilding', 'Plot']) {
    await fs.mkdir(path.join(root, dir), { recursive: true })
  }
  await fs.writeFile(path.join(root, 'Manuscript.md'), manuscript(clean), 'utf8')
  await fs.writeFile(path.join(root, 'Overview.md'), overview(clean), 'utf8')
  if (aiInstructions) await fs.writeFile(path.join(root, 'CLAUDE.md'), aiInstructions, 'utf8')
  return root
}
