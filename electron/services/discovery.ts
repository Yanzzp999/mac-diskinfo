import { exec } from 'child_process';
import { promisify } from 'util';
import * as plist from 'plist';
import { DiskDevice } from '../../src/shared/types';

const execAsync = promisify(exec);

export async function discoverDisks(): Promise<DiskDevice[]> {
  const devices: DiskDevice[] = [];
  try {
    const { stdout: listOut } = await execAsync('diskutil list -plist');
    const listData = plist.parse(listOut) as any;
    const allDisks = listData.AllDisks || [];
    
    // Filter out synthesized volumes or slices, basically get disk0, disk1...
    const rootDisks = allDisks.filter((d: string) => d.match(/^disk\d+$/));
    
    let nvmeData: any = {};
    try {
      const { stdout: nvmeOut } = await execAsync('system_profiler SPNVMeDataType -json');
      nvmeData = JSON.parse(nvmeOut);
    } catch(e) {
      console.warn("SPNVMeDataType error:", e);
    }

    for (const d of rootDisks) {
      try {
        const { stdout: infoOut } = await execAsync(`diskutil info -plist ${d}`);
        const info = plist.parse(infoOut) as any;
        
        const bsdName = info.DeviceIdentifier || d;
        let isInternal = info.Internal === true;
        let transport = info.BusProtocol || 'Unknown';
        if (transport === 'Apple Fabric') isInternal = true; 

        // If it's a disk image or APFS synthesized disk mapped as physical somehow skip it,
        // but typically root NVMe is enough
        if (info.VirtualOrPhysical === 'Virtual') continue;

        let smartStatus: string | undefined;
        let displayModel = info.MediaName || info.IORegistryEntryName || bsdName;
        let serial: string | undefined;
        
        if (nvmeData.SPNVMeDataType) {
          for (const ctrl of nvmeData.SPNVMeDataType) {
             if (ctrl._items) {
                for (const item of ctrl._items) {
                   if (item.bsd_name === bsdName) {
                      smartStatus = item.smart_status;
                      serial = item.device_serial;
                      if (item.device_model) displayModel = item.device_model;
                   }
                }
             }
          }
        }
        
        devices.push({
          id: bsdName,
          bsdName: bsdName,
          displayName: displayModel,
          model: displayModel,
          serial: serial,
          sizeBytes: info.IOKitSize || info.TotalSize || 0,
          isInternal,
          transport,
          smartSupported: true, 
          smartStatus
        });
      } catch (e) {
        console.error(`Error parsing info for ${d}`, e);
      }
    }
  } catch(e) {
     console.error('Failed to discover disks:', e);
  }
  return devices;
}
