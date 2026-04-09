import {
  app,
  BrowserWindow,
  ipcMain,
  webContents,
  type Event,
  type RenderProcessGoneDetails,
  type WebContents,
  type WebContentsDidStartNavigationEventParams,
} from 'electron';
import * as path from 'path';
import { discoverDisks } from './services/discovery';
import { getSmartReport, getTemperature } from './services/smart';
import { createIoMonitor, type IoMonitorSession } from './services/iostat';

interface ActiveDiskSpeedMonitor {
  bsdName: string;
  session: IoMonitorSession;
}

interface RendererMonitorContext {
  activeMonitor: ActiveDiskSpeedMonitor | null;
  teardown: () => void;
}

const diskSpeedMonitorContexts = new Map<number, RendererMonitorContext>();

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
  const iconPath = app.isPackaged
    ? path.join(__dirname, '../dist/icon.png')
    : path.join(__dirname, '../../public/icon.png');

  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    title: "DiskSight",
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

  ipcMain.handle('get-temperature', async (_, diskId) => {
    return await getTemperature(diskId);
  });

  ipcMain.on('start-disk-speed-monitor', (event, bsdName) => {
    startDiskSpeedMonitor(event.sender, bsdName);
  });

  ipcMain.on('stop-disk-speed-monitor', (event, bsdName) => {
    stopMatchingDiskSpeedMonitor(event.sender.id, bsdName);
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
