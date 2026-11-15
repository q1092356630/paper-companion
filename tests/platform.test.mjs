import test from 'node:test';
import assert from 'node:assert/strict';
import {cacheRoot,runtimePython,unpackedPath} from '../desktop/platform.cjs';
import {codexCandidates} from '../desktop/codex.mjs';
test('Windows runtime and caches use Windows paths and support Unicode profiles',()=>{
 assert.equal(runtimePython('C:\\应用\\resources\\pdf-runtime','win32'),'C:\\应用\\resources\\pdf-runtime\\python.exe');
 assert.equal(cacheRoot({platform:'win32',home:'C:\\Users\\读者',env:{LOCALAPPDATA:'D:\\缓存'}}),'D:\\缓存\\文献伴读\\Cache');
 assert.equal(unpackedPath('C:\\应用\\resources\\app.asar\\desktop\\pdf-worker.py'),'C:\\应用\\resources\\app.asar.unpacked\\desktop\\pdf-worker.py');
});
test('macOS retains existing cache location and Python executable',()=>{
 assert.equal(cacheRoot({platform:'darwin',home:'/Users/reader',env:{}}),'/Users/reader/Library/Caches/文献伴读');
 assert.equal(runtimePython('/app/pdf-runtime','darwin'),'/app/pdf-runtime/bin/python3');
 assert.equal(unpackedPath('/app/app.asar/desktop/pdf-worker.py'),'/app/app.asar.unpacked/desktop/pdf-worker.py');
});
test('Windows Codex discovers native executables without executing cmd shell wrappers',()=>{
 const files=codexCandidates({platform:'win32',arch:'x64',home:'C:\\Users\\Reader',env:{PATH:'C:\\Tools',APPDATA:'C:\\Users\\Reader\\AppData\\Roaming'}});
 assert.ok(files.includes('C:\\Tools\\codex.exe'));
 assert.ok(files.some(file=>file.includes('codex-win32-x64\\vendor\\x86_64-pc-windows-msvc')));
 assert.ok(files.every(file=>file.endsWith('.exe')));
});
