import { exec } from 'child_process';
import { promisify } from 'util';
import * as plist from 'plist';
import { DiskDevice, Volume } from '../../src/shared/types';

const execAsync = promisify(exec);

export async function discoverDisks(): Promise<DiskDevice[]> {
  const devices: DiskDevice[] = [];
  try {
    const { stdout: listOut } = await execAsync('diskutil list -plist');
    const listData = plist.parse(listOut) as any;
    const allDisks = listData.AllDisks || [];
    const allDisksAndPartitions = listData.AllDisksAndPartitions || [];
    
    // Filter out synthesized volumes or slices, basically get disk0, disk1...
    const rootDisks = allDisks.filter((d: string) => d.match(/^disk\d+$/));
    
    let nvmeData: any = {};
    try {
      const { stdout: nvmeOut } = await execAsync('system_profiler SPNVMeDataType -json');
      nvmeData = JSON.parse(nvmeOut);
    } catch(e) {
      console.warn("SPNVMeDataType error:", e);
    }

    // Get storage/volume info from system_profiler for filesystem details
    let storageData: any[] = [];
    try {
      const { stdout: storageOut } = await execAsync('system_profiler SPStorageDataType -json');
      storageData = JSON.parse(storageOut).SPStorageDataType || [];
    } catch(e) {
      console.warn("SPStorageDataType error:", e);
    }

    for (const d of rootDisks) {
      try {
        const { stdout: infoOut } = await execAsync(`diskutil info -plist ${d}`);
        const info = plist.parse(infoOut) as any;
        
        const bsdName = info.DeviceIdentifier || d;
        let isInternal = info.Internal === true;
        let isSolidState = info.SolidState === true;
        let transport = info.BusProtocol || 'Unknown';
        if (transport === 'Apple Fabric') isInternal = true; 

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
        
        // Collect volumes for this disk
        const volumes: Volume[] = [];
        
        // From AllDisksAndPartitions, find APFS containers that belong to this disk
        const diskEntry = allDisksAndPartitions.find((e: any) => e.DeviceIdentifier === bsdName);
        
        // Collect all APFS container disk identifiers that belong to this physical disk
        const containerIds: string[] = [];
        if (diskEntry?.Partitions) {
          for (const part of diskEntry.Partitions) {
            if (part.Content === 'Apple_APFS') {
              // Find the container that uses this partition as physical store
              for (const entry of allDisksAndPartitions) {
                if (entry.APFSPhysicalStores?.some((s: any) => s.DeviceIdentifier === part.DeviceIdentifier)) {
                  containerIds.push(entry.DeviceIdentifier);
                  // Add APFS volumes from this container
                  if (entry.APFSVolumes) {
                    for (const vol of entry.APFSVolumes) {
                      if (vol.OSInternal) continue; // Skip system internal volumes
                      const storageInfo = storageData.find((s: any) => s.bsd_name === vol.DeviceIdentifier);
                      volumes.push({
                        name: vol.VolumeName || vol.DeviceIdentifier,
                        bsdName: vol.DeviceIdentifier,
                        fileSystem: storageInfo?.file_system || 'APFS',
                        mountPoint: vol.MountPoint || storageInfo?.mount_point,
                        sizeBytes: vol.Size || 0,
                        capacityUsed: vol.CapacityInUse
                      });
                    }
                  }
                }
              }
            }
          }
        }

        // Also check for non-APFS partitions (e.g. EFI, NTFS, FAT)
        if (diskEntry?.Partitions) {
          for (const part of diskEntry.Partitions) {
            if (part.Content !== 'Apple_APFS' && part.Content !== 'Apple_APFS_ISC' && part.Content !== 'Apple_APFS_Recovery') {
              const storageInfo = storageData.find((s: any) => s.bsd_name === part.DeviceIdentifier);
              // For USB drives, check if any storage volume maps to a partition under this disk
              volumes.push({
                name: part.VolumeName || part.Content || part.DeviceIdentifier,
                bsdName: part.DeviceIdentifier,
                fileSystem: storageInfo?.file_system || part.Content,
                mountPoint: storageInfo?.mount_point,
                sizeBytes: part.Size || 0,
              });
            }
          }
        }

        // For USB drives that might only show up in SPStorageDataType
        if (volumes.length === 0) {
          for (const sv of storageData) {
            // Check if this storage volume's bsd_name starts with a partition of this disk
            if (sv.bsd_name && sv.bsd_name.startsWith(bsdName.replace('disk', 'disk'))) {
              // Check if the physical_drive matches
              if (sv.physical_drive) {
                volumes.push({
                  name: sv._name || sv.bsd_name,
                  bsdName: sv.bsd_name,
                  fileSystem: sv.file_system,
                  mountPoint: sv.mount_point,
                  sizeBytes: sv.size_in_bytes || 0,
                });
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
          isSolidState,
          transport,
          smartSupported: true, 
          smartStatus,
          volumes
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
