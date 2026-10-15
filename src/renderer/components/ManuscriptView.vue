<script setup>
import { computed } from 'vue'
import { splitFront } from '@shared/text.mjs'
import { render } from '@shared/md.mjs'
import { parseComments } from '@shared/comments.mjs'
import ZoomControl from './ZoomControl.vue'
import { stepZoom } from '../prefs.js'
import { state, chapters, titleOf, wordsOf, manuscriptWords, setActive, openDialog } from '../store.js'

// One document made of every chapter in order. Comment numbers continue across chapters.
const sections = computed(() => {
  const ctx = { n: 0 }
  return chapters.value.map((rel) => {
    const body = splitFront(state.files[rel].buffer).body
    return { rel, title: titleOf(rel), words: wordsOf(rel), html: render(body, ctx), comments: parseComments(body).length }
  })
})
const commentTotal = computed(() => sections.value.reduce((n, s) => n + s.comments, 0))
</script>

<template>
  <section class="editor">
    <div class="toolbar ms-bar">
      <strong>Manuscript</strong>
      <span class="muted">{{ chapters.length }} chapters · {{ manuscriptWords.toLocaleString() }} words<template v-if="commentTotal"> · {{ commentTotal }} {{ commentTotal === 1 ? 'note' : 'notes' }}</template></span>
      <span class="spacer"></span>
      <button class="tb text" @click="openDialog('export')">Export…</button>
    </div>
    <div class="page-scroll" @wheel="(e) => { if (e.ctrlKey) { e.preventDefault(); stepZoom(e.deltaY < 0 ? 1 : -1) } }">
      <article class="page ms">
        <p v-if="!sections.length" class="muted">No chapters yet. Press + in the sidebar to start one.</p>
        <section v-for="s in sections" :key="s.rel" class="ms-chapter">
          <header>
            <h1 title="Open this chapter to edit" @click="setActive(s.rel)">{{ s.title }}</h1>
            <div class="meta">
              <span class="muted">{{ s.words.toLocaleString() }} words</span>
              <span class="muted dot">·</span>
              <button class="link" @click="setActive(s.rel)">Edit chapter</button>
            </div>
          </header>
          <div class="read" v-html="s.html"></div>
        </section>
      </article>
    </div>
    <div class="statusbar"><ZoomControl /></div>
  </section>
</template>
