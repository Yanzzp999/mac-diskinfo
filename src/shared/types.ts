export interface Volume {
  name: string;
  bsdName: string;
  fileSystem?: string;
  mountPoint?: string;
  sizeBytes: number;
  capacityUsed?: number;
}

export interface DiskDevice {
  id: string;              // Unique ID (bsd_name)
  bsdName: string;         // e.g. "disk0"
  displayName: string;     // e.g. "APPLE SSD AP1024R"
  model: string;
  serial?: string;
  sizeBytes: number;
  isInternal: boolean;
  isSolidState?: boolean;
  transport: string;       // "NVMe", "SATA", "USB", "Apple Fabric"
  linkSpeed?: string;      // e.g. "Thunderbolt 4 · 40 Gb/s", "USB 5 Gb/s"
  bridgeChip?: string;     // e.g. "ASMedia 246x"
  connectionPath?: string; // e.g. "Thunderbolt 4 40 Gb/s -> ASMedia 246x bridge -> SATA"
  smartSupported: boolean;
  smartStatus?: string;    // "Verified", "Failing", etc.
  volumes: Volume[];
}

export type SmartQueryHints = Pick<DiskDevice, 'transport' | 'isInternal' | 'bridgeChip' | 'connectionPath'>;

export interface SmartAttribute {
  id: number;
  name: string;
  value?: number;
  worst?: number;
  threshold?: number;
  rawValue?: number;
  rawString?: string;
}

export interface SmartReport {
  diskId: string;
  readable: boolean;
  protocol?: 'nvme' | 'ata' | 'unknown';
  smartctlDeviceType?: string;
  firmwareVersion?: string;
  healthPassed?: boolean;
  temperatureC?: number;
  powerOnHours?: number;
  percentageUsed?: number;
  availableSpare?: number;
  powerCycles?: number;
  unsafeShutdowns?: number;
  mediaErrors?: number;
  errorLogEntries?: number;
  dataUnitsRead?: number;
  dataUnitsWritten?: number;
  rotationRateRpm?: number;
  sataVersion?: string;
  interfaceSpeed?: string;
  logicalSectorSize?: number;
  physicalSectorSize?: number;
  startStopCount?: number;
  loadUnloadCount?: number;
  reallocatedSectors?: number;
  reallocationEvents?: number;
  currentPendingSectors?: number;
  offlineUncorrectable?: number;
  udmaCrcErrors?: number;
  spinRetryCount?: number;
  rawAttributes?: SmartAttribute[];
  failureReason?: string;
}

export interface DiskSpeedData {
  bsdName: string;
  readSpeedBytes: number;
  writeSpeedBytes: number;
  timestamp: number;
}

declare global {
  interface Window {
    electron: {
      scanDisks: () => Promise<DiskDevice[]>;
      getSmartReport: (diskId: string, hints?: SmartQueryHints) => Promise<SmartReport>;
      getTemperature: (diskId: string, hints?: SmartQueryHints) => Promise<number | null>;
      startDiskSpeedMonitor: (bsdName: string) => void;
      stopDiskSpeedMonitor: (bsdName: string) => void;
      onDiskSpeedUpdate: (callback: (data: DiskSpeedData) => void) => () => void;
    }
  }
}
