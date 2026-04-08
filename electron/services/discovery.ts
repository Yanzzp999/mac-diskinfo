import { exec } from 'child_process';
import { promisify } from 'util';
import * as plist from 'plist';
import { DiskDevice, Volume } from '../../src/shared/types';

const execAsync = promisify(exec);

/**
 * Detect link speed for external drives.
 * Returns a human-readable string like "Thunderbolt 4 · 40 Gb/s" or "USB 5 Gb/s".
 */
async function detectLinkSpeed(
  bsdName: string,
  transport: string,
  isInternal: boolean,
  mediaName: string,
  nvmeData: any,
): Promise<string | undefined> {
  if (isInternal) return undefined;

  // --- NVMe external drives: get PCIe link info + Thunderbolt tunnel info ---
  if (transport === 'PCI-Express' || transport.toUpperCase().includes('PCI')) {
    let nvmeLinkInfo = '';
    // Get NVMe PCIe link speed and width from SPNVMeDataType
    if (nvmeData?.SPNVMeDataType) {
      for (const ctrl of nvmeData.SPNVMeDataType) {
        if (ctrl._items) {
          for (const item of ctrl._items) {
            if (item.bsd_name === bsdName) {
              const speed = item.spnvme_linkspeed; // e.g. "16.0 GT/s"
              const width = item.spnvme_linkwidth; // e.g. "x4"
              if (speed && width) {
                nvmeLinkInfo = `PCIe ${width} ${speed}`;
              }
            }
          }
        }
      }
    }

    // Check if connected via Thunderbolt
    try {
      const { stdout: tbOut } = await execAsync('system_profiler SPThunderboltDataType -json');
      const tbData = JSON.parse(tbOut);
      if (tbData.SPThunderboltDataType) {
        for (const bus of tbData.SPThunderboltDataType) {
          if (bus._items) {
            for (const device of bus._items) {
              // Thunderbolt device found connected on this bus
              const upstreamTag = device.receptacle_upstream_ambiguous_tag;
              if (upstreamTag?.current_speed_key) {
                const tbSpeed = upstreamTag.current_speed_key; // "40 Gb/s"
                const mode = device.mode_key; // "usb_four", "thunderbolt"
                let tbVersion = 'Thunderbolt';
                if (mode === 'usb_four' || tbSpeed.includes('40')) {
                  tbVersion = 'Thunderbolt 4';
                } else if (tbSpeed.includes('20')) {
                  tbVersion = 'Thunderbolt 3';
                }
                // Return combined info
                if (nvmeLinkInfo) {
                  return `${tbVersion} ${tbSpeed} · ${nvmeLinkInfo}`;
                }
                return `${tbVersion} ${tbSpeed}`;
              }
            }
          }
          // Also check receptacle directly if device is connected
          const receptacle = bus.receptacle_1_tag;
          if (receptacle?.receptacle_status_key === 'receptacle_connected' && receptacle?.current_speed_key) {
            const tbSpeed = receptacle.current_speed_key;
            if (nvmeLinkInfo) {
              return `Thunderbolt · ${tbSpeed} · ${nvmeLinkInfo}`;
            }
          }
        }
      }
    } catch (e) {
      console.warn('SPThunderboltDataType error:', e);
    }

    if (nvmeLinkInfo) return nvmeLinkInfo;
  }

  // --- USB drives: get link speed from ioreg ---
  if (transport === 'USB') {
    try {
      const { stdout: ioregOut } = await execAsync(
        'ioreg -r -c IOUSBHostDevice -d 3 -l'
      );
      // Parse ioreg output line by line, looking for USB storage devices
      const lines = ioregOut.split('\n');
      let currentProductName = '';
      let currentLinkSpeed = 0;
      let foundSpeed: number | null = null;

      for (const line of lines) {
        const productMatch = line.match(/"kUSBProductString"\s*=\s*"([^"]+)"/);
        if (productMatch) {
          currentProductName = productMatch[1];
        }
        const speedMatch = line.match(/"UsbLinkSpeed"\s*=\s*(\d+)/);
        if (speedMatch) {
          currentLinkSpeed = parseInt(speedMatch[1], 10);
        }
        // Match by media name (case-insensitive partial match)
        if (currentProductName && currentLinkSpeed > 0) {
          const nameNorm = mediaName.toLowerCase().replace(/[^a-z0-9]/g, '');
          const prodNorm = currentProductName.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (nameNorm.includes(prodNorm) || prodNorm.includes(nameNorm)) {
            foundSpeed = currentLinkSpeed;
            break;
          }
        }
      }

      if (foundSpeed) {
        return formatUsbSpeed(foundSpeed);
      }

      // Fallback: try to find any USB mass storage device speed
      // by searching for devices near "disk" entries
      currentProductName = '';
      currentLinkSpeed = 0;
      for (const line of lines) {
        const speedMatch = line.match(/"UsbLinkSpeed"\s*=\s*(\d+)/);
        if (speedMatch) {
          const speed = parseInt(speedMatch[1], 10);
          if (speed >= 480000000) { // At least USB 2.0 High Speed
            return formatUsbSpeed(speed);
          }
        }
      }
    } catch (e) {
      console.warn('ioreg USB speed detection error:', e);
    }
  }

  return undefined;
}

function formatUsbSpeed(bitsPerSec: number): string {
  const gbps = bitsPerSec / 1000000000;
  if (gbps >= 20) return `USB4 ${gbps} Gb/s`;
  if (gbps >= 10) return `USB 10 Gb/s`;
  if (gbps >= 5) return `USB 5 Gb/s`;
  if (gbps >= 0.48) return `USB 480 Mb/s`;
  return `USB ${Math.round(gbps * 1000)} Mb/s`;
}

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
        
        // Detect link speed for external drives
        const linkSpeed = await detectLinkSpeed(bsdName, transport, isInternal, displayModel, nvmeData);

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
                      let sizeBytes = vol.Size || storageInfo?.size_in_bytes || 0;
                      let capacityUsed = vol.CapacityInUse;
                      if (storageInfo?.free_space_in_bytes !== undefined && storageInfo?.size_in_bytes !== undefined) {
                        capacityUsed = storageInfo.size_in_bytes - storageInfo.free_space_in_bytes;
                        sizeBytes = storageInfo.size_in_bytes;
                      }
                      
                      volumes.push({
                        name: vol.VolumeName || vol.DeviceIdentifier,
                        bsdName: vol.DeviceIdentifier,
                        fileSystem: storageInfo?.file_system || 'APFS',
                        mountPoint: vol.MountPoint || storageInfo?.mount_point,
                        sizeBytes: sizeBytes,
                        capacityUsed: capacityUsed
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
              let sizeBytes = part.Size || storageInfo?.size_in_bytes || 0;
              let capacityUsed = undefined;
              if (storageInfo?.free_space_in_bytes !== undefined && storageInfo?.size_in_bytes !== undefined) {
                capacityUsed = storageInfo.size_in_bytes - storageInfo.free_space_in_bytes;
                sizeBytes = storageInfo.size_in_bytes;
              }
              // For USB drives, check if any storage volume maps to a partition under this disk
              volumes.push({
                name: part.VolumeName || part.Content || part.DeviceIdentifier,
                bsdName: part.DeviceIdentifier,
                fileSystem: storageInfo?.file_system || part.Content,
                mountPoint: storageInfo?.mount_point,
                sizeBytes: sizeBytes,
                capacityUsed: capacityUsed,
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
                let capacityUsed = undefined;
                if (sv.free_space_in_bytes !== undefined && sv.size_in_bytes !== undefined) {
                  capacityUsed = sv.size_in_bytes - sv.free_space_in_bytes;
                }
                volumes.push({
                  name: sv._name || sv.bsd_name,
                  bsdName: sv.bsd_name,
                  fileSystem: sv.file_system,
                  mountPoint: sv.mount_point,
                  sizeBytes: sv.size_in_bytes || 0,
                  capacityUsed: capacityUsed,
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
          linkSpeed,
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
