import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const files = ['background.js', 'bridge.js', 'devtools.html', 'devtools.js', 'inject.js', 'panel.html', 'panel.js', 'icon16.png', 'icon32.png', 'icon48.png', 'icon128.png', 'icons', '_locales'];
const buildRoot = path.join(root, 'build', 'package');
const releaseRoot = path.join(root, 'releases');
await rm(buildRoot, { recursive: true, force: true });
await mkdir(buildRoot, { recursive: true });
await mkdir(releaseRoot, { recursive: true });
for (const target of ['chrome', 'edge']) {
  const stage = path.join(buildRoot, target);
  await mkdir(stage, { recursive: true });
  for (const file of files) await cp(path.join(root, file), path.join(stage, file), { recursive: true });
  await cp(path.join(root, 'manifest.json'), path.join(stage, 'manifest.json'));
  const zipPath = path.join(releaseRoot, `sse-inspector-${target}-v${manifest.version}.zip`);
  await rm(zipPath, { force: true });
  execFileSync('zip', ['-X', '-q', '-r', zipPath, '.'], { cwd: stage });
  console.log(`已生成 releases/${path.basename(zipPath)}`);
}
