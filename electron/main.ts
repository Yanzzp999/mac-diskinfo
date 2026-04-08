import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { discoverDisks } from './services/discovery';
import { getSmartReport } from './services/smart';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    title: "DiskSight",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Depending on whether we're in dev or prod, load localhost or dist index.html
  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    // Note: port 5173 is the default for Vite. 
    // We should make sure Vite config is running on this port in dev mode
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  ipcMain.handle('scan-disks', async () => {
    return await discoverDisks();
  });

  ipcMain.handle('get-smart-report', async (_, diskId) => {
    return await getSmartReport(diskId);
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
