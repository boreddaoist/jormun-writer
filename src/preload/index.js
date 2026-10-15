import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('jormun', {
  startupProject: () => ipcRenderer.invoke('project:startup'),
  pickProject: () => ipcRenderer.invoke('project:pick'),
  recentProjects: () => ipcRenderer.invoke('project:recent'),
  openProject: (dir) => ipcRenderer.invoke('project:open', dir),
  createProject: (name) => ipcRenderer.invoke('project:create', name),
  mergeChapters: () => ipcRenderer.invoke('project:merge'),
  saveProjectAs: () => ipcRenderer.invoke('project:saveAs'),
  exportRun: (payload) => ipcRenderer.invoke('export:run', payload),
  writeFile: (rel, text) => ipcRenderer.invoke('file:write', rel, text),
  createFile: (rel, text) => ipcRenderer.invoke('file:create', rel, text),
  closeNow: () => ipcRenderer.invoke('app:close-now'),
  revealProject: () => ipcRenderer.invoke('project:reveal'),
  fileMenu: (kind, info) => ipcRenderer.invoke('ctx:file', kind, info),
  onEditorAction: (cb) => {
    const handler = (_e, name) => cb(name)
    ipcRenderer.on('editor:action', handler)
    return () => ipcRenderer.removeListener('editor:action', handler)
  },
  onUiAction: (cb) => {
    const handler = (_e, a) => cb(a)
    ipcRenderer.on('ui:action', handler)
    return () => ipcRenderer.removeListener('ui:action', handler)
  },
  onBeforeClose: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('app:before-close', handler)
    return () => ipcRenderer.removeListener('app:before-close', handler)
  },
  onFsEvent: (cb) => {
    const handler = (_e, ev) => cb(ev)
    ipcRenderer.on('fs:event', handler)
    return () => ipcRenderer.removeListener('fs:event', handler)
  }
})
