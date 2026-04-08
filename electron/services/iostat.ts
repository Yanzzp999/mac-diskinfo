import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface DiskSpeedData {
  bsdName: string;
  readSpeedBytes: number;
  writeSpeedBytes: number;
  timestamp: number;
}

interface LastStats {
  bytesRead: number;
  bytesWritten: number;
  timestamp: number;
}

const activeMonitors = new Map<string, NodeJS.Timeout>();
const lastStatsMap = new Map<string, LastStats>();

/**
 * Reads cumulative byte counters from IOBlockStorageDriver.
 * `-l` is required so the output includes "BSD Name", which lets us
 * map the block driver stats back to a specific whole disk such as disk0.
 */
async function getDiskStats(bsdName: string): Promise<{ bytesRead: number, bytesWritten: number } | null> {
  try {
    const { stdout } = await execAsync('ioreg -c IOBlockStorageDriver -r -w 0 -l');
    
    // The output contains blocks of IOBlockStorageDriver.
    // We need to parse block by block, or search for the block that eventually has a child with "BSD Name" = "disk0"
    // Since ioreg -r outputs an indented tree format:
    // +-o IOBlockStorageDriver
    //   |   "Statistics" = ...
    //   +-o IOMedia
    //   | +-o IOMediaBSDClient
    //   |   |   "BSD Name" = "diskX"
    
    // A more reliable way is to find the block matching our bsdName
    // We'll split the output by IOBlockStorageDriver root nodes.
    const blocks = stdout.split('+-o IOBlockStorageDriver');
    
    for (const block of blocks) {
      if (block.includes(`"BSD Name" = "${bsdName}"`)) {
        // Found the right block, extract Statistics
        const statsMatch = block.match(/"Statistics"\s*=\s*({[^}]+})/);
        if (statsMatch && statsMatch[1]) {
          const statsString = statsMatch[1];
          // E.g. {"Operations (Write)"=123,"Bytes (Read)"=456,"Bytes (Write)"=789}
          
          let bytesRead = 0;
          let bytesWritten = 0;
          
          const readMatch = statsString.match(/"Bytes \(Read\)"=(\d+)/);
          if (readMatch && readMatch[1]) {
            bytesRead = parseInt(readMatch[1], 10);
          }
          
          const writeMatch = statsString.match(/"Bytes \(Write\)"=(\d+)/);
          if (writeMatch && writeMatch[1]) {
            bytesWritten = parseInt(writeMatch[1], 10);
          }
          
          return { bytesRead, bytesWritten };
        }
      }
    }
  } catch (error) {
    console.warn("getDiskStats error:", error);
  }
  
  return null;
}

export function startIoMonitor(
  bsdName: string,
  intervalMs: number,
  callback: (data: DiskSpeedData) => void
) {
  // If already tracking, clear the old one
  if (activeMonitors.has(bsdName)) {
    stopIoMonitor(bsdName);
  }

  // Initial fetch to prime the lastStatsMap so the first calculation isn't huge
  getDiskStats(bsdName).then(stats => {
    if (stats) {
      const now = Date.now();
      lastStatsMap.set(bsdName, {
        bytesRead: stats.bytesRead,
        bytesWritten: stats.bytesWritten,
        timestamp: now
      });

      // Seed the chart immediately so the UI does not look broken
      // while we wait for the first real interval delta.
      callback({
        bsdName,
        readSpeedBytes: 0,
        writeSpeedBytes: 0,
        timestamp: now
      });
    }
  });

  const timer = setInterval(async () => {
    const stats = await getDiskStats(bsdName);
    if (stats) {
      const now = Date.now();
      const lastStats = lastStatsMap.get(bsdName);
      
      let readSpeedBytes = 0;
      let writeSpeedBytes = 0;

      if (lastStats) {
        const timeDiffSec = (now - lastStats.timestamp) / 1000;
        if (timeDiffSec > 0) {
          const readDiff = stats.bytesRead - lastStats.bytesRead;
          const writeDiff = stats.bytesWritten - lastStats.bytesWritten;
          
          // Handle counter wraps or errors gracefully
          readSpeedBytes = readDiff >= 0 ? Math.round(readDiff / timeDiffSec) : 0;
          writeSpeedBytes = writeDiff >= 0 ? Math.round(writeDiff / timeDiffSec) : 0;
        }
      }

      lastStatsMap.set(bsdName, {
        bytesRead: stats.bytesRead,
        bytesWritten: stats.bytesWritten,
        timestamp: now
      });

      callback({
        bsdName,
        readSpeedBytes,
        writeSpeedBytes,
        timestamp: now
      });
    }
  }, intervalMs);

  activeMonitors.set(bsdName, timer);
}

export function stopIoMonitor(bsdName: string) {
  const timer = activeMonitors.get(bsdName);
  if (timer) {
    clearInterval(timer);
    activeMonitors.delete(bsdName);
  }
  lastStatsMap.delete(bsdName);
}
