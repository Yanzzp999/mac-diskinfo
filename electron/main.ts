import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  webContents,
  type Event,
  type RenderProcessGoneDetails,
  type WebContents,
  type WebContentsDidStartNavigationEventParams,
} from 'electron';
import * as path from 'path';
import { writeFile } from 'node:fs/promises';
import { discoverDisks } from './services/discovery';
import { getSmartReport, getTemperature } from './services/smart';
import { createIoMonitor, type IoMonitorSession } from './services/iostat';
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateState,
  installUpdate,
  onUpdateStateChange,
} from './services/updater';

interface ActiveDiskSpeedMonitor {
  bsdName: string;
  session: IoMonitorSession;
}

interface RendererMonitorContext {
  activeMonitor: ActiveDiskSpeedMonitor | null;
  teardown: () => void;
}

const diskSpeedMonitorContexts = new Map<number, RendererMonitorContext>();
const verifyResultFileArg = process.argv.find((arg) => arg.startsWith('--verify-result-file='));
const verifyResultFilePath = verifyResultFileArg?.slice('--verify-result-file='.length) || null;

async function writeVerifyResult(status: 'renderer-ready' | 'did-fail-load', details: Record<string, unknown>) {
  if (!verifyResultFilePath) return;

  await writeFile(verifyResultFilePath, JSON.stringify({
    status,
    timestamp: new Date().toISOString(),
    ...details,
  }, null, 2));
}

function getAppRootPath() {
  return app.isPackaged ? app.getAppPath() : path.join(__dirname, '../..');
}

function teardownRendererMonitorContext(senderId: number) {
  const context = diskSpeedMonitorContexts.get(senderId);
  if (!context || context.activeMonitor) return;

  context.teardown();
  diskSpeedMonitorContexts.delete(senderId);
}

function stopActiveDiskSpeedMonitor(senderId: number) {
  const context = diskSpeedMonitorContexts.get(senderId);
  if (!context?.activeMonitor) {
    teardownRendererMonitorContext(senderId);
    return;
  }

  context.activeMonitor.session.stop();
  context.activeMonitor = null;
  teardownRendererMonitorContext(senderId);
}

function stopMatchingDiskSpeedMonitor(senderId: number, bsdName: string) {
  const context = diskSpeedMonitorContexts.get(senderId);
  if (!context?.activeMonitor) {
    teardownRendererMonitorContext(senderId);
    return;
  }

  if (context.activeMonitor.bsdName !== bsdName) return;

  context.activeMonitor.session.stop();
  context.activeMonitor = null;
  teardownRendererMonitorContext(senderId);
}

function getOrCreateRendererMonitorContext(contents: WebContents) {
  const senderId = contents.id;
  const existingContext = diskSpeedMonitorContexts.get(senderId);
  if (existingContext) return existingContext;

  const handleDestroyed = () => {
    stopActiveDiskSpeedMonitor(senderId);
  };

  const handleRenderProcessGone = (
    event: Event,
    details: RenderProcessGoneDetails
  ) => {
    void event;
    console.warn(`[disk-speed-monitor] renderer ${senderId} exited: ${details.reason}`);
    stopActiveDiskSpeedMonitor(senderId);
  };

  const handleDidStartNavigation = (
    details: Event<WebContentsDidStartNavigationEventParams>
  ) => {
    if (!details.isMainFrame || details.isSameDocument) return;
    stopActiveDiskSpeedMonitor(senderId);
  };

  contents.on('destroyed', handleDestroyed);
  contents.on('render-process-gone', handleRenderProcessGone);
  contents.on('did-start-navigation', handleDidStartNavigation);

  const context: RendererMonitorContext = {
    activeMonitor: null,
    teardown: () => {
      contents.removeListener('destroyed', handleDestroyed);
      contents.removeListener('render-process-gone', handleRenderProcessGone);
      contents.removeListener('did-start-navigation', handleDidStartNavigation);
    },
  };

  diskSpeedMonitorContexts.set(senderId, context);
  return context;
}

function startDiskSpeedMonitor(contents: WebContents, bsdName: string) {
  const senderId = contents.id;

  // The renderer exposes one disk-speed stream at a time, so replace any
  // existing monitor before starting a fresh session for the selected disk.
  stopActiveDiskSpeedMonitor(senderId);
  const context = getOrCreateRendererMonitorContext(contents);

  const session = createIoMonitor(bsdName, 2000, {
    onData: (data) => {
      const targetContents = webContents.fromId(senderId);
      if (!targetContents || targetContents.isDestroyed()) {
        stopActiveDiskSpeedMonitor(senderId);
        return;
      }

      try {
        targetContents.send('disk-speed-update', data);
      } catch (error) {
        console.warn(`[disk-speed-monitor] failed to deliver update for ${bsdName} to renderer ${senderId}:`, error);
        stopActiveDiskSpeedMonitor(senderId);
      }
    },
    onError: (error) => {
      console.warn(`[disk-speed-monitor] monitor failed for ${bsdName} on renderer ${senderId}:`, error);
      stopActiveDiskSpeedMonitor(senderId);
    },
  });

  context.activeMonitor = { bsdName, session };
}

function createWindow() {
  const appRootPath = getAppRootPath();
  const iconPath = app.isPackaged
    ? path.join(appRootPath, 'dist/icon.png')
    : path.join(appRootPath, 'public/icon.png');
  const rendererEntryPath = path.join(appRootPath, 'dist/index.html');

  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    title: "mac-diskinfo",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(iconPath);
  }


  // Depending on whether we're in dev or prod, load localhost or dist index.html
  if (app.isPackaged) {
    mainWindow.loadFile(rendererEntryPath);
  } else {
    // Note: port 5173 is the default for Vite. 
    // We should make sure Vite config is running on this port in dev mode
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[app] failed to load renderer', {
      errorCode,
      errorDescription,
      validatedURL,
      rendererEntryPath,
      appRootPath,
      isPackaged: app.isPackaged,
    });

    void writeVerifyResult('did-fail-load', {
      errorCode,
      errorDescription,
      validatedURL,
      rendererEntryPath,
      appRootPath,
      isPackaged: app.isPackaged,
    });
  });

  mainWindow.webContents.once('did-finish-load', () => {
    console.log('[app] renderer did-finish-load', {
      rendererEntryPath,
      appRootPath,
      isPackaged: app.isPackaged,
    });
    mainWindow.webContents.send('update-state', getUpdateState());
  });
}

app.whenReady().then(() => {
  onUpdateStateChange((state) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('update-state', state);
      }
    }
  });

  ipcMain.handle('scan-disks', async () => {
    return await discoverDisks();
  });

  ipcMain.handle('get-smart-report', async (_, diskId, hints) => {
    return await getSmartReport(diskId, hints);
  });

  ipcMain.handle('get-temperature', async (_, diskId, hints) => {
    return await getTemperature(diskId, hints);
  });

  ipcMain.on('start-disk-speed-monitor', (event, bsdName) => {
    startDiskSpeedMonitor(event.sender, bsdName);
  });

  ipcMain.on('stop-disk-speed-monitor', (event, bsdName) => {
    stopMatchingDiskSpeedMonitor(event.sender.id, bsdName);
  });

  ipcMain.handle('check-for-updates', async () => {
    return await checkForUpdates();
  });

  ipcMain.handle('download-update', async () => {
    return await downloadUpdate();
  });

  ipcMain.handle('install-update', async () => {
    installUpdate();
  });

  ipcMain.handle('get-update-state', () => {
    return getUpdateState();
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  ipcMain.on('renderer-ready', () => {
    console.log('[app] renderer reported ready');
    void writeVerifyResult('renderer-ready', {
      isPackaged: app.isPackaged,
      appRootPath: getAppRootPath(),
    });
  });

  ipcMain.on('open-external', (_, url: string) => {
    void shell.openExternal(url);
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  for (const senderId of Array.from(diskSpeedMonitorContexts.keys())) {
    stopActiveDiskSpeedMonitor(senderId);
  }
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
