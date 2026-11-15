import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
const build = JSON.parse(await fs.readFile('dist/package-result.json', 'utf8'));
const os = build.platform === 'darwin' ? 'mac' : 'windows';
const target = path.resolve(`release/PaperCompanion-${build.version}-${os}-${build.arch}.zip`);
if (build.platform === 'darwin') {
  execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', path.join(build.folder, build.name + '.app'), target], {stdio: 'inherit'});
} else {
  execFileSync(build.python, ['-c', 'import shutil,sys; shutil.make_archive(sys.argv[1],"zip",sys.argv[2])', target.slice(0, -4), build.folder], {stdio: 'inherit'});
}
const hash = createHash('sha256');
for await (const chunk of createReadStream(target)) hash.update(chunk);
await fs.writeFile(target + '.sha256', `${hash.digest('hex')}  ${path.basename(target)}\n`);
console.log(target);
