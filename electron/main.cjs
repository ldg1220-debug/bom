'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const https = require('https');
const path = require('path');

const IS_DEV = process.env.ELECTRON_DEV === 'true';

let mainWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: 'BOM Builder',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;
  win.once('closed', () => { if (mainWindow === win) mainWindow = null; });

  if (IS_DEV) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // 닫기 버튼을 눌렀을 때 renderer에게 먼저 확인을 요청하고, 응답을 받은 뒤에만 실제로 닫는다.
  let closeConfirmed = false;
  let closeInProgress = false; // 이미 대화상자가 떠 있는 동안 중복 요청 방지

  win.on('close', (e) => {
    if (closeConfirmed) return;
    e.preventDefault();
    if (closeInProgress) return; // 이미 renderer에게 요청 중이면 무시
    closeInProgress = true;
    win.webContents.send('before-close');
  });

  function onConfirmClose() {
    closeInProgress = false;
    closeConfirmed = true;
    win.close();
  }
  function onCancelClose() {
    closeInProgress = false;
    // 사용자가 취소 → 닫지 않음
  }

  ipcMain.on('confirm-close', onConfirmClose);
  ipcMain.on('cancel-close', onCancelClose);

  // 창이 파괴될 때 리스너 정리
  win.once('closed', () => {
    ipcMain.removeListener('confirm-close', onConfirmClose);
    ipcMain.removeListener('cancel-close', onCancelClose);
  });
}

function httpsRequest(options, body) {
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf-8') })
      );
    });
    req.on('error', (err) =>
      resolve({ status: 0, body: JSON.stringify({ error: { message: err.message } }) })
    );
    if (body) req.write(body);
    req.end();
  });
}

// Gemini generateContent (POST) — bypasses CORS from Node.js process
ipcMain.handle('gemini-post', async (_evt, { url, body }) => {
  const u = new URL(url);
  const buf = Buffer.from(body, 'utf-8');
  return httpsRequest(
    {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': buf.length },
    },
    buf
  );
});

// Gemini listModels (GET)
ipcMain.handle('gemini-get', async (_evt, { url }) => {
  const u = new URL(url);
  return httpsRequest({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET' });
});

// ── 자동 업데이트 (GitHub Releases) ──────────────────────────────
// 백그라운드에서 새 버전을 확인·다운로드하고, 준비되면 renderer에 알려
// 사용자가 원할 때 재시작해서 적용하도록 한다. 패키징된 빌드에서만 동작.
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4시간마다 재확인

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('update-downloaded', () => {
  mainWindow?.webContents.send('update-ready');
});
autoUpdater.on('error', (err) => {
  console.error('자동 업데이트 오류:', err?.message || err);
});

ipcMain.on('restart-to-update', () => {
  autoUpdater.quitAndInstall();
});

function checkForUpdates() {
  if (IS_DEV || !app.isPackaged) return;
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('업데이트 확인 실패:', err?.message || err);
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  checkForUpdates();
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
