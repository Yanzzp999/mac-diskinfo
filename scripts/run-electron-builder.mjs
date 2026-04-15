import { spawnSync } from 'node:child_process';
import { readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const appVersion = process.env.APP_VERSION?.trim();
const packageJson = require(path.resolve(process.cwd(), 'package.json'));
const outputDir = path.resolve(process.cwd(), packageJson.build?.directories?.output ?? 'release');

function isValidSemver(version) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version);
}

async function removeBlockmapFiles(dir) {
  let entries;

  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return;
    }

    throw error;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await removeBlockmapFiles(fullPath);
        return;
      }

      if (entry.isFile() && entry.name.endsWith('.blockmap')) {
        await rm(fullPath, { force: true });
        console.log(`[build] removed blockmap ${path.relative(process.cwd(), fullPath)}`);
      }
    })
  );
}

const args = [];

if (appVersion) {
  if (!isValidSemver(appVersion)) {
    console.error(
      `[build] Invalid APP_VERSION "${appVersion}". Expected a semantic version like 1.0.13.`
    );
    process.exit(1);
  }

  console.log(`[build] packaging app with injected version ${appVersion}`);
  args.push(`-c.extraMetadata.version=${appVersion}`);
} else {
  console.log('[build] packaging app with package.json version');
}

const electronBuilderCliPath = require.resolve('electron-builder/out/cli/cli.js');
const result = spawnSync(process.execPath, [electronBuilderCliPath, ...args], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

await removeBlockmapFiles(outputDir);
process.exit(0);
