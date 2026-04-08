import { exec } from 'child_process';
import { promisify } from 'util';
import { SmartReport } from '../../src/shared/types';

const execAsync = promisify(exec);

export async function getSmartReport(diskId: string): Promise<SmartReport> {
  const report: SmartReport = {
    diskId,
    readable: false
  };

  try {
    const { stdout } = await execAsync(`smartctl -a /dev/${diskId} --json`);
    const data = JSON.parse(stdout);
    parseSmartData(data, report);
  } catch (error: any) {
    if (error.stdout) {
      try {
        const data = JSON.parse(error.stdout);
        parseSmartData(data, report);
      } catch (e) {
        report.failureReason = error.message;
      }
    } else {
      report.failureReason = error.message || 'Unknown smartctl error';
    }
  }

  return report;
}

function parseSmartData(data: any, report: SmartReport) {
  if (data.smartctl?.messages) {
    const errorMsg = data.smartctl.messages.find((m: any) => m.severity === 'error');
    if (errorMsg) {
      report.failureReason = errorMsg.string;
    }
  }

  if (data.nvme_smart_health_information_log) {
    const log = data.nvme_smart_health_information_log;
    report.readable = true;
    report.temperatureC = log.temperature;
    report.availableSpare = log.available_spare;
    report.percentageUsed = log.percentage_used;
    // NVMe reports units in thousands of 512-byte sectors. 
    // We'll keep raw units here, frontend can format it or calculate actual bytes.
    report.dataUnitsRead = log.data_units_read;
    report.dataUnitsWritten = log.data_units_written;
    report.powerCycles = log.power_cycles;
    report.powerOnHours = log.power_on_hours;
    report.unsafeShutdowns = log.unsafe_shutdowns;
    report.mediaErrors = log.media_errors;
    report.errorLogEntries = log.num_err_log_entries;
  } else if (data.ata_smart_attributes?.table) {
     // SATA fallback
     report.readable = true;
     const powerOn = data.ata_smart_attributes.table.find((a:any) => a.id === 9);
     if (powerOn) report.powerOnHours = powerOn.raw.value;
  }
  
  if (data.smart_status) {
    report.healthPassed = data.smart_status.passed;
  }

  if (data.temperature?.current && report.temperatureC === undefined) {
    report.temperatureC = data.temperature.current;
    report.readable = true;
  }
}

export async function getTemperature(diskId: string): Promise<number | null> {
  try {
    const { stdout } = await execAsync(`smartctl -a /dev/${diskId} --json`);
    const data = JSON.parse(stdout);
    if (data.nvme_smart_health_information_log?.temperature !== undefined) {
      return data.nvme_smart_health_information_log.temperature;
    }
    if (data.temperature?.current !== undefined) {
      return data.temperature.current;
    }
  } catch (error: any) {
    if (error.stdout) {
      try {
        const data = JSON.parse(error.stdout);
        if (data.nvme_smart_health_information_log?.temperature !== undefined) {
          return data.nvme_smart_health_information_log.temperature;
        }
        if (data.temperature?.current !== undefined) {
          return data.temperature.current;
        }
      } catch (_) {}
    }
  }
  return null;
}
