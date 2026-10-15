<script setup>
import { state } from '../store.js'
import NewProjectDialog from './NewProjectDialog.vue'
import QuickOpenDialog from './QuickOpenDialog.vue'
import ExportDialog from './ExportDialog.vue'
</script>

<template>
  <NewProjectDialog v-if="state.dialog && state.dialog.type === 'newProject'" />
  <QuickOpenDialog v-else-if="state.dialog && state.dialog.type === 'quickOpen'" />
  <ExportDialog v-else-if="state.dialog && state.dialog.type === 'export'" />
</template>
