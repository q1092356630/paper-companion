import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runtimePython} from '../desktop/platform.cjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, '.runtime/pdf-runtime');
const assets = path.join(root, '.runtime/pdf-assets');
const managed = path.join(root, '.runtime/managed-python');
const uv = process.env.UV_BIN || 'uv';
const env = {...process.env, UV_PYTHON_INSTALL_DIR: managed, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1'};
delete env.PYTHONHOME; delete env.PYTHONPATH;
const run = (exe, args, capture = false) => execFileSync(exe, args, {cwd: root, env, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', windowsHide: true});
// Python wheels must be built on the destination OS and CPU.
if (!['darwin', 'win32'].includes(process.platform)) throw new Error('Build on Windows or macOS.');
await fs.mkdir(managed, {recursive: true});
run(uv, ['python', 'install', '3.12', '--no-bin']);
const python = run(uv, ['python', 'find', '3.12', '--managed-python'], true).trim();
const base = run(python, ['-c', 'import sys; print(sys.base_prefix)'], true).trim();
await fs.rm(runtime, {recursive: true, force: true});
await fs.cp(base, runtime, {recursive: true, dereference: true});
const bundled = runtimePython(runtime);
run(uv, ['pip', 'install', '--python', bundled, '--break-system-packages', '-r', 'scripts/pdf-runtime-lock.txt']);
await fs.mkdir(assets, {recursive: true});
run(bundled, ['scripts/prepare-pdf-assets.py', assets]);
const relocated = path.join(root, '.runtime/relocation check 中文');
await fs.rm(relocated, {recursive: true, force: true});
await fs.rename(runtime, relocated);
try {run(runtimePython(relocated), ['-c', 'import sys,pymupdf,rapidocr,pdf2zh_next,onnxruntime; print("PDF runtime relocation OK:",sys.prefix)']);}
finally {await fs.rename(relocated, runtime);}
const versions = JSON.parse(run(bundled, ['-c', 'import importlib.metadata as m,json; print(json.dumps({d.metadata["Name"]:d.version for d in m.distributions()}))'], true));
await fs.writeFile(path.join(runtime, 'manifest.json'), JSON.stringify({platform: process.platform, arch: process.arch, python: run(bundled, ['--version'], true).trim(), packages: versions}, null, 2));
console.log('Standalone PDF/OCR runtime ready.');
