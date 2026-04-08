import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  scanDisks: () => ipcRenderer.invoke('scan-disks'),
  getSmartReport: (diskId: string) => ipcRenderer.invoke('get-smart-report', diskId),
  getTemperature: (diskId: string) => ipcRenderer.invoke('get-temperature', diskId),
  startDiskSpeedMonitor: (bsdName: string) => ipcRenderer.send('start-disk-speed-monitor', bsdName),
  stopDiskSpeedMonitor: (bsdName: string) => ipcRenderer.send('stop-disk-speed-monitor', bsdName),
  onDiskSpeedUpdate: (callback: (data: any) => void) => {
    ipcRenderer.on('disk-speed-update', (_event, data) => callback(data));
  },
  removeDiskSpeedUpdateListener: () => {
    ipcRenderer.removeAllListeners('disk-speed-update');
  },
});
