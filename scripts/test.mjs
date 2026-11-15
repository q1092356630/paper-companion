import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const desktopOnly = process.argv.includes('--desktop');
const files = (await fs.readdir('tests')).filter(name => name.endsWith('.test.mjs') && (!desktopOnly || name !== 'sites-worker.test.mjs')).sort();
const result = spawnSync(process.execPath, ['--test', ...files.map(name => 'tests/' + name)], {stdio: 'inherit'});
process.exit(result.status ?? 1);
