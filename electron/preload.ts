import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { DiskSpeedData } from '../src/shared/types';

contextBridge.exposeInMainWorld('electron', {
  scanDisks: () => ipcRenderer.invoke('scan-disks'),
  getSmartReport: (diskId: string) => ipcRenderer.invoke('get-smart-report', diskId),
  getTemperature: (diskId: string) => ipcRenderer.invoke('get-temperature', diskId),
  startDiskSpeedMonitor: (bsdName: string) => ipcRenderer.send('start-disk-speed-monitor', bsdName),
  stopDiskSpeedMonitor: (bsdName: string) => ipcRenderer.send('stop-disk-speed-monitor', bsdName),
  onDiskSpeedUpdate: (callback: (data: DiskSpeedData) => void) => {
    const listener = (_event: IpcRendererEvent, data: DiskSpeedData) => {
      callback(data);
    };

    ipcRenderer.on('disk-speed-update', listener);

    return () => {
      ipcRenderer.off('disk-speed-update', listener);
    };
  },
});
