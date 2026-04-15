import { execFile as execFileCallback, spawn } from 'node:child_process';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import process from 'node:process';
import plist from 'plist';

const execFile = promisify(execFileCallback);
const WORKDIR = process.cwd();
const RELEASE_DIR = path.join(WORKDIR, 'release');
const VERIFY_TIMEOUT_MS = 20000;
const VERIFY_INTERVAL_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findPackagedApp() {
  const entries = await readdir(RELEASE_DIR, { withFileTypes: true });
  const macBuildDir = entries.find((entry) => entry.isDirectory() && entry.name.startsWith('mac-'));

  if (!macBuildDir) {
    throw new Error(`No packaged macOS app directory found in ${RELEASE_DIR}`);
  }

  const appDir = path.join(RELEASE_DIR, macBuildDir.name);
  const appEntries = await readdir(appDir, { withFileTypes: true });
  const appBundle = appEntries.find((entry) => entry.isDirectory() && entry.name.endsWith('.app'));

  if (!appBundle) {
    throw new Error(`No .app bundle found in ${appDir}`);
  }

  return path.join(appDir, appBundle.name);
}

async function waitForVerifyResult(resultFilePath) {
  const deadline = Date.now() + VERIFY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const result = JSON.parse(await readFile(resultFilePath, 'utf8'));
      return result;
    } catch {
      // App may still be starting up.
    }

    await sleep(VERIFY_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for renderer verification result at ${resultFilePath}`);
}

async function killMatchingProcesses(profileDir) {
  const { stdout } = await execFile('ps', ['-ax', '-o', 'pid=', '-o', 'command=']);
  const matches = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.includes(profileDir))
    .map((line) => Number(line.split(/\s+/, 1)[0]))
    .filter((pid) => Number.isInteger(pid));

  for (const pid of matches) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Process may have already exited.
    }
  }
}

async function verifyBundledSmartctl(appBundlePath) {
  const bundledSmartctlPath = path.join(appBundlePath, 'Contents', 'Resources', 'smartmontools', 'bin', 'smartctl');
  const bundledDriveDbPath = path.join(appBundlePath, 'Contents', 'Resources', 'smartmontools', 'share', 'smartmontools', 'drivedb.h');

  await access(bundledSmartctlPath);
  await access(bundledDriveDbPath);

  const { stdout } = await execFile(bundledSmartctlPath, ['-V']);

  if (!stdout.includes('smartctl')) {
    throw new Error('Bundled smartctl binary did not execute as expected');
  }

  console.log('[verify] bundled smartctl is present and executable');
}

function extractLatestMacVersion(latestMacContent) {
  const versionMatch = latestMacContent.match(/^version:\s*(.+)$/m);

  if (!versionMatch?.[1]) {
    throw new Error('Could not find a version field in release/latest-mac.yml');
  }

  return versionMatch[1].trim().replace(/^['"]|['"]$/g, '');
}

async function verifyPackagedVersion(appBundlePath) {
  const infoPlistPath = path.join(appBundlePath, 'Contents', 'Info.plist');
  const latestMacPath = path.join(RELEASE_DIR, 'latest-mac.yml');
  const [infoPlistContent, latestMacContent] = await Promise.all([
    readFile(infoPlistPath, 'utf8'),
    readFile(latestMacPath, 'utf8'),
  ]);

  const infoPlist = plist.parse(infoPlistContent);
  const appVersion = String(infoPlist.CFBundleShortVersionString ?? '').trim();
  const latestMacVersion = extractLatestMacVersion(latestMacContent);
  const expectedVersion = process.env.APP_VERSION?.trim();

  if (!appVersion) {
    throw new Error(`CFBundleShortVersionString is missing in ${infoPlistPath}`);
  }

  if (appVersion !== latestMacVersion) {
    throw new Error(
      `Packaged app version ${appVersion} does not match latest-mac.yml version ${latestMacVersion}`
    );
  }

  if (expectedVersion && appVersion !== expectedVersion) {
    throw new Error(
      `Packaged app version ${appVersion} does not match expected APP_VERSION ${expectedVersion}`
    );
  }

  console.log(`[verify] packaged version ${appVersion} matches latest-mac.yml`);
}

async function main() {
  const appBundlePath = await findPackagedApp();
  const profileDir = await mkdtemp(path.join(os.tmpdir(), 'mac-diskinfo-verify-profile-'));
  const resultFilePath = path.join(profileDir, 'verify-result.json');

  console.log(`[verify] launching ${appBundlePath}`);
  await verifyBundledSmartctl(appBundlePath);
  await verifyPackagedVersion(appBundlePath);

  const openProcess = spawn('open', [
    '-na',
    appBundlePath,
    '--args',
    `--user-data-dir=${profileDir}`,
    `--verify-result-file=${resultFilePath}`,
  ], {
    cwd: WORKDIR,
    env: {
      ...process.env,
      CI: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  openProcess.stdout.on('data', (chunk) => {
    stdout += String(chunk);
  });

  openProcess.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  try {
    const result = await waitForVerifyResult(resultFilePath);
    console.log(`[verify] status: ${result.status}`);

    if (result.status !== 'renderer-ready') {
      throw new Error(`Unexpected verification result: ${JSON.stringify(result, null, 2)}`);
    }

    console.log('[verify] packaged app rendered expected UI');
  } finally {
    await killMatchingProcesses(profileDir);
    await sleep(1000);
    await rm(profileDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('[verify] packaged app verification failed');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
