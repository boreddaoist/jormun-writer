<script setup>
import { state } from '../store.js'
import NewProjectDialog from './NewProjectDialog.vue'
import QuickOpenDialog from './QuickOpenDialog.vue'
import ExportDialog from './ExportDialog.vue'
import HistoryDialog from './HistoryDialog.vue'
import FindDialog from './FindDialog.vue'
</script>

<template>
  <NewProjectDialog v-if="state.dialog && state.dialog.type === 'newProject'" />
  <QuickOpenDialog v-else-if="state.dialog && state.dialog.type === 'quickOpen'" />
  <ExportDialog v-else-if="state.dialog && state.dialog.type === 'export'" />
  <HistoryDialog v-else-if="state.dialog && state.dialog.type === 'history'" />
  <FindDialog v-else-if="state.dialog && state.dialog.type === 'find'" />
</template>
