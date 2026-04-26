import { chmod, copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const WORKDIR = process.cwd();
const OUTPUT_DIR = path.join(WORKDIR, 'build-resources', 'smartmontools');
const EXISTING_BUNDLE_PATHS = {
  smartctl: path.join(OUTPUT_DIR, 'bin', 'smartctl'),
  driveDb: path.join(OUTPUT_DIR, 'share', 'smartmontools', 'drivedb.h'),
  license: path.join(OUTPUT_DIR, 'licenses', 'smartmontools-COPYING.txt'),
};
const SMARTCTL_CANDIDATE_PATHS = [
  '/opt/homebrew/bin/smartctl',
  '/opt/homebrew/sbin/smartctl',
  '/usr/local/bin/smartctl',
  '/usr/local/sbin/smartctl',
];

function resolveSmartctlBinary() {
  const smartctlPath = SMARTCTL_CANDIDATE_PATHS.find((candidate) => existsSync(candidate));

  if (!smartctlPath) {
    return null;
  }

  return smartctlPath;
}

function hasExistingBundle() {
  return Object.values(EXISTING_BUNDLE_PATHS).every((candidate) => existsSync(candidate));
}

function getBrewPrefix(smartctlPath) {
  const brewPrefix = path.dirname(path.dirname(smartctlPath));
  return brewPrefix;
}

async function resolveSupplementalFiles(smartctlPath) {
  const brewPrefix = getBrewPrefix(smartctlPath);
  const driveDbCandidates = [
    path.join(brewPrefix, 'share', 'smartmontools', 'drivedb.h'),
    path.join(brewPrefix, 'opt', 'smartmontools', 'share', 'smartmontools', 'drivedb.h'),
  ];
  const licenseCandidates = [
    path.join(brewPrefix, 'opt', 'smartmontools', 'COPYING'),
  ];

  const driveDbPath = driveDbCandidates.find((candidate) => existsSync(candidate));
  const licensePath = licenseCandidates.find((candidate) => existsSync(candidate));

  if (!driveDbPath) {
    throw new Error(`Could not find drivedb.h next to smartctl at ${smartctlPath}`);
  }

  if (!licensePath) {
    throw new Error(`Could not find COPYING for smartmontools under ${brewPrefix}`);
  }

  return { driveDbPath, licensePath };
}

async function main() {
  const smartctlPath = resolveSmartctlBinary();

  if (!smartctlPath) {
    if (hasExistingBundle()) {
      console.log(`[prepare-smartctl-bundle] using existing bundle at ${OUTPUT_DIR}`);
      return;
    }

    throw new Error(
      'smartctl not found on the build machine. Install smartmontools first, for example: brew install smartmontools'
    );
  }

  const { driveDbPath, licensePath } = await resolveSupplementalFiles(smartctlPath);

  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(path.join(OUTPUT_DIR, 'bin'), { recursive: true });
  await mkdir(path.join(OUTPUT_DIR, 'share', 'smartmontools'), { recursive: true });
  await mkdir(path.join(OUTPUT_DIR, 'licenses'), { recursive: true });

  const bundledSmartctlPath = path.join(OUTPUT_DIR, 'bin', 'smartctl');
  const bundledDriveDbPath = path.join(OUTPUT_DIR, 'share', 'smartmontools', 'drivedb.h');
  const bundledLicensePath = path.join(OUTPUT_DIR, 'licenses', 'smartmontools-COPYING.txt');

  await copyFile(smartctlPath, bundledSmartctlPath);
  await copyFile(driveDbPath, bundledDriveDbPath);
  await copyFile(licensePath, bundledLicensePath);

  const smartctlStat = await stat(smartctlPath);
  await chmod(bundledSmartctlPath, smartctlStat.mode);
  await writeFile(
    path.join(OUTPUT_DIR, 'manifest.json'),
    JSON.stringify(
      {
        smartctlSource: smartctlPath,
        driveDbSource: driveDbPath,
        licenseSource: licensePath,
        mode: smartctlStat.mode,
        preparedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error('[prepare-smartctl-bundle] failed');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
