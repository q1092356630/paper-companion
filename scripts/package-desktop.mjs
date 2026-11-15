import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {packager} from '@electron/packager';
import {createRequire} from 'node:module';
import {runtimePython} from '../desktop/platform.cjs';
const require = createRequire(import.meta.url);
const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (!['darwin', 'win32'].includes(process.platform)) throw new Error('Package on macOS or Windows.');
const manifest = JSON.parse(await fs.readFile('.runtime/pdf-runtime/manifest.json', 'utf8').catch(() => {throw new Error('Run pnpm setup:pdf first.');}));
if (manifest.platform !== process.platform || manifest.arch !== process.arch) throw new Error('PDF runtime OS/CPU does not match this build.');
await import('./build-desktop.mjs');
const stage = 'dist/desktop-stage';
await fs.rm(stage, {recursive: true, force: true});
await fs.mkdir(stage, {recursive: true});
await fs.cp('desktop', stage + '/desktop', {recursive: true, filter: source => !source.includes('__pycache__')});
await fs.cp('dist/client', stage + '/dist/client', {recursive: true});
await fs.writeFile(stage + '/package.json', JSON.stringify({name: pkg.name, productName: '文献伴读', version: pkg.version, main: pkg.main, description: pkg.description, author: pkg.author, license: pkg.license}, null, 2));
const name = process.platform === 'darwin' ? '文献伴读' : 'PaperCompanion';
const paths = await packager({dir: stage, out: 'release', name, appBundleId: 'com.mw.papercompanion', appCategoryType: 'public.app-category.productivity', platform: process.platform, arch: process.arch, electronVersion: require('electron/package.json').version, overwrite: true, prune: false, asar: {unpack: '**/*.py'}, extraResource: ['.runtime/pdf-runtime', '.runtime/pdf-assets', 'THIRD_PARTY_NOTICES.md', 'LICENSE', 'README.md'], win32metadata: {ProductName: '文献伴读', FileDescription: 'Paper Companion'}});
for (const folder of paths) {
  const app = path.join(folder, name + '.app');
  const resources = process.platform === 'darwin' ? path.join(app, 'Contents/Resources') : path.join(folder, 'resources');
  execFileSync(process.execPath, ['scripts/smoke-runtime.mjs', resources], {stdio: 'inherit'});
  if (process.platform === 'darwin') {
    // Ad-hoc signing does not replace Apple notarization.
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], {stdio: 'inherit'});
    execFileSync('codesign', ['--verify', '--deep', '--strict', app], {stdio: 'inherit'});
  }
  await fs.writeFile('dist/package-result.json', JSON.stringify({folder: path.resolve(folder), name, version: pkg.version, platform: process.platform, arch: process.arch, python: runtimePython(path.join(resources, 'pdf-runtime'))}, null, 2));
}
console.log(paths.join('\n'));
