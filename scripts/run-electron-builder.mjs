import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);
const appVersion = process.env.APP_VERSION?.trim();

function isValidSemver(version) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version);
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

process.exit(result.status ?? 1);
