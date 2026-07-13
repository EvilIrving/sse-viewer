import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const packageMeta = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('仅支持 Manifest V3');
if (manifest.version !== packageMeta.version) throw new Error('manifest 与 package 版本不一致');
for (const file of [manifest.devtools_page, manifest.background?.service_worker, ...Object.values(manifest.icons || {}), 'bridge.js', 'inject.js', 'panel.html', 'panel.js', 'icons/devtools-icon.svg']) {
  if (file) await access(path.join(root, file));
}
for (const locale of ['en', 'zh_CN', 'ja', 'fr']) {
  const messages = JSON.parse(await readFile(path.join(root, '_locales', locale, 'messages.json'), 'utf8'));
  for (const key of ['extName', 'extDescription']) if (!messages[key]?.message) throw new Error(`${locale} 缺少 ${key}`);
}
console.log(`校验通过：MV3 v${manifest.version}`);
