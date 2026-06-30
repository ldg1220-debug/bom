'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  geminiPost: (url, body) => ipcRenderer.invoke('gemini-post', { url, body }),
  geminiGet:  (url)       => ipcRenderer.invoke('gemini-get',  { url }),

  // 종료 확인: main이 닫기 전 renderer에게 먼저 묻는다
  onBeforeClose: (cb) => ipcRenderer.on('before-close', cb),
  confirmClose:  ()   => ipcRenderer.send('confirm-close'),
  cancelClose:   ()   => ipcRenderer.send('cancel-close'),
});
