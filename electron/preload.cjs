'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  geminiPost: (url, body) => ipcRenderer.invoke('gemini-post', { url, body }),
  geminiGet:  (url)       => ipcRenderer.invoke('gemini-get',  { url }),
});
