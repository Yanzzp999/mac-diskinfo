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

interface IoMonitorHandlers {
  onData: (data: DiskSpeedData) => void;
  onError?: (error: unknown) => void;
}

export interface IoMonitorSession {
  stop: () => void;
}

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

export function createIoMonitor(
  bsdName: string,
  intervalMs: number,
  handlers: IoMonitorHandlers
): IoMonitorSession {
  let timer: NodeJS.Timeout | null = null;
  let lastStats: LastStats | null = null;
  let stopped = false;

  let isPolling = false;

  const stop = () => {
    stopped = true;
    lastStats = null;

    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const reportError = (error: unknown) => {
    if (!handlers.onError) return;

    try {
      handlers.onError(error);
    } catch (reportingError) {
      console.warn('[disk-speed-monitor] error handler failed:', reportingError);
    }
  };

  const pollStats = async () => {
    if (stopped || isPolling) return;
    isPolling = true;

    try {
      const stats = await getDiskStats(bsdName);
      if (!stats || stopped) return;

      const now = Date.now();

      // Prime the monitor with the first cumulative sample and wait for
      // the next interval before emitting a real 2s average.
      if (!lastStats) {
        lastStats = {
          bytesRead: stats.bytesRead,
          bytesWritten: stats.bytesWritten,
          timestamp: now
        };
        return;
      }

      const timeDiffSec = (now - lastStats.timestamp) / 1000;
      let readSpeedBytes = 0;
      let writeSpeedBytes = 0;

      if (timeDiffSec > 0) {
        const readDiff = stats.bytesRead - lastStats.bytesRead;
        const writeDiff = stats.bytesWritten - lastStats.bytesWritten;

        // Handle counter wraps or errors gracefully
        readSpeedBytes = readDiff >= 0 ? Math.round(readDiff / timeDiffSec) : 0;
        writeSpeedBytes = writeDiff >= 0 ? Math.round(writeDiff / timeDiffSec) : 0;
      }

      lastStats = {
        bytesRead: stats.bytesRead,
        bytesWritten: stats.bytesWritten,
        timestamp: now
      };

      handlers.onData({
        bsdName,
        readSpeedBytes,
        writeSpeedBytes,
        timestamp: now
      });
    } catch (error) {
      stop();
      reportError(error);
    } finally {
      isPolling = false;
    }
  };

  void pollStats();

  timer = setInterval(() => {
    void pollStats();
  }, intervalMs);

  return { stop };
}
