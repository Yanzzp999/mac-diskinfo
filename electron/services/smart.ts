/* eslint-disable @typescript-eslint/no-explicit-any */

import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { promisify } from 'util';
import { SmartAttribute, SmartQueryHints, SmartReport } from '../../src/shared/types';

const execFileAsync = promisify(execFile);
const smartctlBackendCache = new Map<string, string | undefined>();
const SMARTCTL_CANDIDATE_PATHS = [
  '/opt/homebrew/bin/smartctl',
  '/opt/homebrew/sbin/smartctl',
  '/usr/local/bin/smartctl',
  '/usr/local/sbin/smartctl',
  'smartctl',
];
const SMARTCTL_FALLBACK_PATH_ENTRIES = [
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
  '/usr/local/sbin',
];

let smartctlBinaryPath: string | null = null;

interface SmartctlAttempt {
  backend?: string;
  data?: any;
  failureReason?: string;
}

function sanitizeDiskId(diskId: string) {
  if (!/^[A-Za-z0-9]+$/.test(diskId)) {
    throw new Error(`Invalid disk identifier: ${diskId}`);
  }

  return diskId;
}

function dedupeBackends(backends: Array<string | undefined>) {
  const seen = new Set<string>();
  const unique: Array<string | undefined> = [];

  for (const backend of backends) {
    const key = backend ?? '__default__';
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(backend);
  }

  return unique;
}

function resolveSmartctlBinary() {
  if (smartctlBinaryPath) return smartctlBinaryPath;

  smartctlBinaryPath =
    SMARTCTL_CANDIDATE_PATHS.find((candidate) => candidate !== 'smartctl' && existsSync(candidate)) ??
    'smartctl';

  return smartctlBinaryPath;
}

function buildSmartctlEnv() {
  const existingPath = process.env.PATH ?? '';
  const pathEntries = existingPath.split(':').filter(Boolean);

  for (const candidate of SMARTCTL_FALLBACK_PATH_ENTRIES) {
    if (!pathEntries.includes(candidate)) {
      pathEntries.unshift(candidate);
    }
  }

  return {
    ...process.env,
    PATH: pathEntries.join(':'),
  };
}

function buildSmartctlBackends(diskId: string, hints?: SmartQueryHints) {
  const candidates: Array<string | undefined> = [];

  if (smartctlBackendCache.has(diskId)) {
    candidates.push(smartctlBackendCache.get(diskId));
  }

  candidates.push(undefined);

  if (hints?.isInternal) {
    return dedupeBackends(candidates);
  }

  const hintText = `${hints?.transport ?? ''} ${hints?.bridgeChip ?? ''} ${hints?.connectionPath ?? ''}`.toLowerCase();
  const isAtaLike = hints?.transport.toUpperCase().includes('SATA') || hintText.includes('sata');
  const isAsmediaBridge = hintText.includes('asmedia') || hintText.includes('thunderbolt');

  candidates.push('auto');

  if (isAtaLike) {
    candidates.push('sat,auto', 'sat', 'sat,12');
  }

  if (isAsmediaBridge) {
    candidates.push('sntasmedia', 'sntasmedia/sat');
  }

  candidates.push(
    'sntjmicron',
    'sntjmicron/sat',
    'sntrealtek',
    'sntrealtek/sat',
    'usbsunplus/sat',
    'usbjmicron'
  );

  return dedupeBackends(candidates);
}

async function runSmartctl(diskId: string, backend?: string): Promise<SmartctlAttempt> {
  const safeDiskId = sanitizeDiskId(diskId);
  const smartctlBinary = resolveSmartctlBinary();
  const args = ['-a'];

  if (backend) {
    args.push('-d', backend);
  }

  args.push(`/dev/${safeDiskId}`, '--json');

  try {
    const { stdout } = await execFileAsync(smartctlBinary, args, {
      env: buildSmartctlEnv(),
    });
    return {
      backend,
      data: JSON.parse(stdout),
    };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return {
        backend,
        failureReason: 'smartctl was not found. Install smartmontools or make sure Homebrew paths are available to the app.',
      };
    }

    if (error.stdout) {
      try {
        return {
          backend,
          data: JSON.parse(error.stdout),
        };
      } catch {
        // Fall through and return the shell error below.
      }
    }

    return {
      backend,
      failureReason: error.stderr || error.message || 'Unknown smartctl error',
    };
  }
}

function normalizeAttributeName(name: string | undefined) {
  return (name ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function getRawAttributeValue(attribute: any): number | undefined {
  const rawValue = attribute?.raw?.value;

  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return rawValue;
  }

  if (typeof rawValue === 'string') {
    const numeric = Number.parseInt(rawValue.replace(/,/g, ''), 10);
    if (Number.isFinite(numeric)) return numeric;
  }

  const rawString = attribute?.raw?.string;
  if (typeof rawString === 'string') {
    const match = rawString.replace(/,/g, '').match(/-?\d+/);
    if (match) {
      const numeric = Number.parseInt(match[0], 10);
      if (Number.isFinite(numeric)) return numeric;
    }
  }

  return undefined;
}

function mapAtaAttributes(attributes: any[]): SmartAttribute[] {
  return attributes.map((attribute) => ({
    id: attribute.id,
    name: attribute.name,
    value: typeof attribute.value === 'number' ? attribute.value : undefined,
    worst: typeof attribute.worst === 'number' ? attribute.worst : undefined,
    threshold: typeof attribute.thresh === 'number' ? attribute.thresh : undefined,
    rawValue: getRawAttributeValue(attribute),
    rawString: typeof attribute.raw?.string === 'string' ? attribute.raw.string : undefined,
  }));
}

function findAtaAttribute(attributes: SmartAttribute[], ids: number[], names: string[] = []) {
  const nameSet = new Set(names.map(normalizeAttributeName));
  return attributes.find((attribute) => {
    if (ids.includes(attribute.id)) return true;
    if (nameSet.size === 0) return false;
    return nameSet.has(normalizeAttributeName(attribute.name));
  });
}

function formatInterfaceSpeed(data: any) {
  const current = data.interface_speed?.current?.sata_value;
  const max = data.interface_speed?.max?.sata_value;

  if (typeof current === 'string' && typeof max === 'string') {
    return current === max ? current : `${current} negotiated · ${max} max`;
  }

  if (typeof current === 'string') return current;
  if (typeof max === 'string') return `Up to ${max}`;

  const sataVersion = data.sata_version?.string;
  if (typeof sataVersion === 'string') {
    const match = sataVersion.match(/\(current:\s*([^)]+)\)/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return undefined;
}

function parseAtaSmartData(data: any, report: SmartReport) {
  const table = Array.isArray(data.ata_smart_attributes?.table)
    ? data.ata_smart_attributes.table
    : [];

  if (table.length === 0) return;

  const attributes = mapAtaAttributes(table);
  report.protocol = 'ata';
  report.readable = true;
  report.rawAttributes = attributes;

  const powerOn = findAtaAttribute(attributes, [9], ['poweronhours']);
  const powerCycles = findAtaAttribute(attributes, [12], ['powercyclecount']);
  const startStop = findAtaAttribute(attributes, [4], ['startstopcount']);
  const loadUnload = findAtaAttribute(attributes, [193], ['loadcyclecount', 'loadunloadcyclecount']);
  const reallocated = findAtaAttribute(attributes, [5], ['reallocatedsectorct']);
  const reallocationEvents = findAtaAttribute(attributes, [196], ['reallocationeventcount']);
  const pending = findAtaAttribute(attributes, [197], ['currentpendingsector']);
  const offlineUncorrectable = findAtaAttribute(attributes, [198], ['offlineuncorrectable']);
  const crcErrors = findAtaAttribute(attributes, [199], ['udmacrcerrorcount']);
  const spinRetry = findAtaAttribute(attributes, [10], ['spinretrycount']);

  report.powerOnHours ??= powerOn?.rawValue;
  report.powerCycles ??= powerCycles?.rawValue;
  report.startStopCount = startStop?.rawValue;
  report.loadUnloadCount = loadUnload?.rawValue;
  report.reallocatedSectors = reallocated?.rawValue;
  report.reallocationEvents = reallocationEvents?.rawValue;
  report.currentPendingSectors = pending?.rawValue;
  report.offlineUncorrectable = offlineUncorrectable?.rawValue;
  report.udmaCrcErrors = crcErrors?.rawValue;
  report.spinRetryCount = spinRetry?.rawValue;

  if (typeof data.power_on_time?.hours === 'number' && report.powerOnHours === undefined) {
    report.powerOnHours = data.power_on_time.hours;
  }

  if (typeof data.power_cycle_count === 'number' && report.powerCycles === undefined) {
    report.powerCycles = data.power_cycle_count;
  }

  if (typeof data.rotation_rate === 'number' && data.rotation_rate > 0) {
    report.rotationRateRpm = data.rotation_rate;
  }

  if (typeof data.sata_version?.string === 'string') {
    report.sataVersion = data.sata_version.string;
  }

  report.interfaceSpeed = formatInterfaceSpeed(data);

  if (typeof data.logical_block_size === 'number') {
    report.logicalSectorSize = data.logical_block_size;
  }

  if (typeof data.physical_block_size === 'number') {
    report.physicalSectorSize = data.physical_block_size;
  }

  const ataErrorCount = data.ata_smart_error_log?.summary?.count;
  if (typeof ataErrorCount === 'number' && report.errorLogEntries === undefined) {
    report.errorLogEntries = ataErrorCount;
  }
}

function parseSmartData(data: any, report: SmartReport) {
  if (data.smartctl?.messages) {
    const errorMsg = data.smartctl.messages.find((message: any) => message.severity === 'error');
    if (errorMsg) {
      report.failureReason = errorMsg.string;
    }
  }

  if (data.nvme_smart_health_information_log) {
    const log = data.nvme_smart_health_information_log;
    report.protocol = 'nvme';
    report.readable = true;
    report.temperatureC = log.temperature;
    report.availableSpare = log.available_spare;
    report.percentageUsed = log.percentage_used;
    report.dataUnitsRead = log.data_units_read;
    report.dataUnitsWritten = log.data_units_written;
    report.powerCycles = log.power_cycles;
    report.powerOnHours = log.power_on_hours;
    report.unsafeShutdowns = log.unsafe_shutdowns;
    report.mediaErrors = log.media_errors;
    report.errorLogEntries = log.num_err_log_entries;
  }

  parseAtaSmartData(data, report);

  if (data.smart_status) {
    report.healthPassed = data.smart_status.passed;
  }

  if (typeof data.temperature?.current === 'number' && report.temperatureC === undefined) {
    report.temperatureC = data.temperature.current;
    report.readable = true;
  }

  if (typeof data.firmware_version === 'string') {
    report.firmwareVersion = data.firmware_version;
  }

  if (!report.protocol) {
    report.protocol = 'unknown';
  }
}

function scoreSmartReport(report: SmartReport) {
  let score = 0;

  if (report.readable) score += 30;
  if (report.protocol === 'nvme') score += 50;
  if (report.protocol === 'ata') score += 45;
  if ((report.rawAttributes?.length ?? 0) > 0) score += 20;

  const populatedKeys = [
    report.temperatureC,
    report.healthPassed,
    report.powerOnHours,
    report.powerCycles,
    report.availableSpare,
    report.percentageUsed,
    report.reallocatedSectors,
    report.currentPendingSectors,
    report.offlineUncorrectable,
    report.udmaCrcErrors,
    report.rotationRateRpm,
    report.sataVersion,
    report.interfaceSpeed,
    report.logicalSectorSize,
    report.physicalSectorSize,
  ];

  for (const value of populatedKeys) {
    if (value !== undefined) score += 2;
  }

  return score;
}

function isGoodEnoughMatch(report: SmartReport) {
  if (report.protocol === 'nvme' && report.readable) return true;
  if (report.protocol === 'ata' && report.readable && (report.rawAttributes?.length ?? 0) >= 4) return true;
  return false;
}

async function loadSmartReport(diskId: string, hints?: SmartQueryHints): Promise<SmartReport> {
  const backends = buildSmartctlBackends(diskId, hints);
  let bestReport: SmartReport | null = null;
  let bestBackend: string | undefined;
  let bestScore = -1;
  let firstFailureReason: string | undefined;

  for (const backend of backends) {
    const attempt = await runSmartctl(diskId, backend);
    if (!attempt.data) {
      firstFailureReason ??= attempt.failureReason;
      continue;
    }

    const report: SmartReport = {
      diskId,
      readable: false,
      smartctlDeviceType: backend ?? 'default',
    };

    parseSmartData(attempt.data, report);

    const score = scoreSmartReport(report);
    if (score > bestScore) {
      bestScore = score;
      bestReport = report;
      bestBackend = backend;
    }

    if (isGoodEnoughMatch(report)) {
      break;
    }
  }

  if (bestReport) {
    smartctlBackendCache.set(diskId, bestBackend);
    return bestReport;
  }

  return {
    diskId,
    readable: false,
    protocol: 'unknown',
    failureReason: firstFailureReason ?? 'Unknown smartctl error',
  };
}

export async function getSmartReport(diskId: string, hints?: SmartQueryHints): Promise<SmartReport> {
  return loadSmartReport(diskId, hints);
}

export async function getTemperature(diskId: string, hints?: SmartQueryHints): Promise<number | null> {
  const report = await loadSmartReport(diskId, hints);
  return report.temperatureC ?? null;
}
