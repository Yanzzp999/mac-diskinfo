/* eslint-disable @typescript-eslint/no-explicit-any */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as plist from 'plist';
import { DiskDevice, Volume } from '../../src/shared/types';

const execAsync = promisify(exec);

interface ThunderboltBridgeInfo {
  bridgeChip?: string;
  hostLink: string;
}

interface UsbBridgeInfo {
  bridgeChip?: string;
  hostLink: string;
}

interface ConnectionDetails {
  linkSpeed?: string;
  bridgeChip?: string;
  connectionPath?: string;
}

function isPartitionOfDisk(parentDisk: string, candidateBsdName: string | undefined) {
  if (!candidateBsdName) return false;
  return new RegExp(`^${parentDisk}s\\d+$`).test(candidateBsdName);
}

function normalizeName(value: string | undefined) {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function formatUsbSpeed(bitsPerSec: number): string {
  const gbps = bitsPerSec / 1000000000;
  if (gbps >= 20) return `USB4 ${gbps} Gb/s`;
  if (gbps >= 10) return `USB 10 Gb/s`;
  if (gbps >= 5) return `USB 5 Gb/s`;
  if (gbps >= 0.48) return `USB 480 Mb/s`;
  return `USB ${Math.round(gbps * 1000)} Mb/s`;
}

function formatThunderboltLink(mode: string | undefined, speed: string) {
  const normalizedSpeed = speed.replace(/^Up to\s+/i, '').trim();
  if (mode === 'usb_four' || normalizedSpeed.includes('40')) {
    return `Thunderbolt 4 ${normalizedSpeed}`;
  }

  if (normalizedSpeed.includes('20')) {
    return `Thunderbolt 3 ${normalizedSpeed}`;
  }

  return `Thunderbolt ${normalizedSpeed}`;
}

function describeBridgeChip(vendor: string | undefined, name: string | undefined) {
  const vendorName = vendor?.trim();
  const deviceName = name?.trim();

  if (!vendorName) return deviceName;
  if (!deviceName) return vendorName;
  if (deviceName.toLowerCase().includes(vendorName.toLowerCase())) return deviceName;

  return `${vendorName} ${deviceName}`;
}

function findThunderboltBridgeInfo(thunderboltData: any): ThunderboltBridgeInfo | undefined {
  const candidates: ThunderboltBridgeInfo[] = [];

  for (const bus of thunderboltData?.SPThunderboltDataType ?? []) {
    for (const device of bus._items ?? []) {
      const speed = device.receptacle_upstream_ambiguous_tag?.current_speed_key;
      if (!speed) continue;

      const vendor = typeof device.vendor_name_key === 'string' ? device.vendor_name_key : undefined;
      if (vendor === 'Apple Inc.') continue;

      const name = typeof device.device_name_key === 'string'
        ? device.device_name_key
        : typeof device._name === 'string'
          ? device._name
          : undefined;

      candidates.push({
        bridgeChip: describeBridgeChip(vendor, name),
        hostLink: formatThunderboltLink(device.mode_key, speed),
      });
    }
  }

  if (candidates.length === 1) return candidates[0];
  return candidates.find((candidate) => candidate.bridgeChip?.toLowerCase().includes('asmedia'));
}

function findUsbBridgeInfo(mediaName: string, usbIoregOut: string): UsbBridgeInfo | undefined {
  const lines = usbIoregOut.split('\n');
  let currentProductName = '';
  let currentVendorName = '';
  let currentLinkSpeed = 0;
  let genericCandidate: UsbBridgeInfo | undefined;
  const mediaNameNorm = normalizeName(mediaName);

  for (const line of lines) {
    const productMatch = line.match(/"kUSBProductString"\s*=\s*"([^"]+)"/);
    if (productMatch) {
      currentProductName = productMatch[1];
    }

    const vendorMatch = line.match(/"USB Vendor Name"\s*=\s*"([^"]+)"/);
    if (vendorMatch) {
      currentVendorName = vendorMatch[1];
    }

    const speedMatch = line.match(/"UsbLinkSpeed"\s*=\s*(\d+)/);
    if (speedMatch) {
      currentLinkSpeed = parseInt(speedMatch[1], 10);
    }

    if (!currentProductName || currentLinkSpeed <= 0) continue;

    const productNorm = normalizeName(currentProductName);
    const bridgeChip = describeBridgeChip(currentVendorName, currentProductName);
    const candidate = {
      bridgeChip,
      hostLink: formatUsbSpeed(currentLinkSpeed),
    };

    if (mediaNameNorm && (mediaNameNorm.includes(productNorm) || productNorm.includes(mediaNameNorm))) {
      return candidate;
    }

    if (
      !genericCandidate &&
      /(asm|asmedia|jmicron|realtek|sata|storage|enclosure|bridge|raid)/i.test(`${currentVendorName} ${currentProductName}`)
    ) {
      genericCandidate = candidate;
    }
  }

  return genericCandidate;
}

function getNvmeLinkInfo(bsdName: string, nvmeData: any) {
  for (const ctrl of nvmeData?.SPNVMeDataType ?? []) {
    for (const item of ctrl._items ?? []) {
      if (item.bsd_name !== bsdName) continue;

      const speed = item.spnvme_linkspeed;
      const width = item.spnvme_linkwidth;
      if (speed && width) {
        return `PCIe ${width} ${speed}`;
      }
    }
  }

  return undefined;
}

function detectConnectionDetails(
  bsdName: string,
  transport: string,
  isInternal: boolean,
  mediaName: string,
  nvmeData: any,
  thunderboltData: any,
  usbIoregOut: string,
): ConnectionDetails {
  if (isInternal) return {};

  const upperTransport = transport.toUpperCase();
  const thunderboltBridge = findThunderboltBridgeInfo(thunderboltData);
  const usbBridge = usbIoregOut ? findUsbBridgeInfo(mediaName, usbIoregOut) : undefined;

  if (transport === 'PCI-Express' || upperTransport.includes('PCI')) {
    const nvmeLinkInfo = getNvmeLinkInfo(bsdName, nvmeData);
    if (thunderboltBridge) {
      return {
        linkSpeed: nvmeLinkInfo
          ? `${thunderboltBridge.hostLink} · ${nvmeLinkInfo}`
          : thunderboltBridge.hostLink,
        bridgeChip: thunderboltBridge.bridgeChip,
        connectionPath: thunderboltBridge.bridgeChip
          ? `${thunderboltBridge.hostLink} -> ${thunderboltBridge.bridgeChip} bridge -> ${nvmeLinkInfo ?? 'PCIe'}`
          : undefined,
      };
    }

    return {
      linkSpeed: nvmeLinkInfo,
    };
  }

  if (upperTransport.includes('SATA')) {
    if (thunderboltBridge) {
      return {
        linkSpeed: thunderboltBridge.hostLink,
        bridgeChip: thunderboltBridge.bridgeChip,
        connectionPath: thunderboltBridge.bridgeChip
          ? `${thunderboltBridge.hostLink} -> ${thunderboltBridge.bridgeChip} bridge -> SATA`
          : `${thunderboltBridge.hostLink} -> SATA`,
      };
    }

    if (usbBridge) {
      return {
        linkSpeed: usbBridge.hostLink,
        bridgeChip: usbBridge.bridgeChip,
        connectionPath: usbBridge.bridgeChip
          ? `${usbBridge.hostLink} -> ${usbBridge.bridgeChip} bridge -> SATA`
          : `${usbBridge.hostLink} -> SATA`,
      };
    }
  }

  if (upperTransport.includes('USB')) {
    if (usbBridge) {
      return {
        linkSpeed: usbBridge.hostLink,
        bridgeChip: usbBridge.bridgeChip,
        connectionPath: usbBridge.bridgeChip
          ? `${usbBridge.hostLink} -> ${usbBridge.bridgeChip} bridge -> USB`
          : undefined,
      };
    }

    if (thunderboltBridge) {
      return {
        linkSpeed: thunderboltBridge.hostLink,
        bridgeChip: thunderboltBridge.bridgeChip,
        connectionPath: thunderboltBridge.bridgeChip
          ? `${thunderboltBridge.hostLink} -> ${thunderboltBridge.bridgeChip} bridge -> USB`
          : `${thunderboltBridge.hostLink} -> USB`,
      };
    }
  }

  if (thunderboltBridge) {
    return {
      linkSpeed: thunderboltBridge.hostLink,
      bridgeChip: thunderboltBridge.bridgeChip,
      connectionPath: thunderboltBridge.bridgeChip
        ? `${thunderboltBridge.hostLink} -> ${thunderboltBridge.bridgeChip} bridge -> ${transport}`
        : undefined,
    };
  }

  return {};
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

    let thunderboltData: any = {};
    try {
      const { stdout: thunderboltOut } = await execAsync('system_profiler SPThunderboltDataType -json');
      thunderboltData = JSON.parse(thunderboltOut);
    } catch (e) {
      console.warn('SPThunderboltDataType error:', e);
    }

    let usbIoregOut = '';
    try {
      const { stdout } = await execAsync('ioreg -r -c IOUSBHostDevice -d 3 -l');
      usbIoregOut = stdout;
    } catch (e) {
      console.warn('ioreg USB speed detection error:', e);
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
        const isSolidState = info.SolidState === true;
        const transport = info.BusProtocol || 'Unknown';
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
        
        const connectionDetails = detectConnectionDetails(
          bsdName,
          transport,
          isInternal,
          displayModel,
          nvmeData,
          thunderboltData,
          usbIoregOut,
        );

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
            // Only associate partitions that belong to this exact root disk.
            if (isPartitionOfDisk(bsdName, sv.bsd_name)) {
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
          linkSpeed: connectionDetails.linkSpeed,
          bridgeChip: connectionDetails.bridgeChip,
          connectionPath: connectionDetails.connectionPath,
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
