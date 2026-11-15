const path = require('node:path');
const os = require('node:os');

function cacheRoot({platform = process.platform, home = os.homedir(), env = process.env} = {}) {
  const p = platform === 'win32' ? path.win32 : path.posix;
  if (platform === 'win32') return p.join(env.LOCALAPPDATA || p.join(home, 'AppData', 'Local'), '文献伴读', 'Cache');
  if (platform === 'darwin') return p.join(home, 'Library', 'Caches', '文献伴读');
  return p.join(env.XDG_CACHE_HOME || p.join(home, '.cache'), 'paper-companion');
}

function runtimePython(root, platform = process.platform) {
  return platform === 'win32' ? path.win32.join(root, 'python.exe') : path.posix.join(root, 'bin', 'python3');
}

function unpackedPath(file) {
  return file.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}

module.exports = {cacheRoot, runtimePython, unpackedPath};
