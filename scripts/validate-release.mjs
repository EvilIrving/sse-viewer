import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const forbidden = [/^\.git\//, /^docs\//, /^scripts\//, /^build\//, /(^|\/)\.DS_Store$/];
for (const target of ['chrome', 'edge']) {
  const filename = `sse-inspector-${target}-v${manifest.version}.zip`;
  const zipPath = path.join(root, 'releases', filename);
  const entries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).split('\n').filter(Boolean).map((file) => file.replace(/^\.\//, ''));
  if (!entries.includes('manifest.json')) throw new Error(`${filename} 缺少 manifest.json`);
  const leaked = entries.find((file) => forbidden.some((pattern) => pattern.test(file)));
  if (leaked) throw new Error(`${filename} 包含不应发布的文件：${leaked}`);
  const packed = JSON.parse(execFileSync('unzip', ['-p', zipPath, 'manifest.json'], { encoding: 'utf8' }));
  if (packed.version !== manifest.version || packed.manifest_version !== 3) throw new Error(`${filename} manifest 无效`);
  console.log(`产物通过：${filename}`);
}
