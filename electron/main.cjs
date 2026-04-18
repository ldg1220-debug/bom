'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const https = require('https');
const path = require('path');

const IS_DEV = process.env.ELECTRON_DEV === 'true';

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

  if (IS_DEV) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
