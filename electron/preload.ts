import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  scanDisks: () => ipcRenderer.invoke('scan-disks'),
  getSmartReport: (diskId: string) => ipcRenderer.invoke('get-smart-report', diskId),
});
