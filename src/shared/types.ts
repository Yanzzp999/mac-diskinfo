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
  smartSupported: boolean;
  smartStatus?: string;    // "Verified", "Failing", etc.
}

export interface SmartReport {
  diskId: string;
  readable: boolean;
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
  failureReason?: string;
}

declare global {
  interface Window {
    electron: {
      scanDisks: () => Promise<DiskDevice[]>;
      getSmartReport: (diskId: string) => Promise<SmartReport>;
    }
  }
}
