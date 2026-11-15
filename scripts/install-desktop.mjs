import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {captureWidgetProcesses,refreshWidgetAfterInstall} from './native-widget-upgrade.mjs';
const source=path.resolve('release/文献伴读-darwin-arm64/文献伴读.app');
const destination=path.join(os.homedir(),'Applications/文献伴读.app');
const previousWidgetProcesses=captureWidgetProcesses(destination);
function requireMainClosed(){try{if(execFileSync('pgrep',['-f',destination+'/Contents/MacOS/'],{encoding:'utf8'}).trim())throw new Error('请先退出文献伴读再安装，安装期间请稍后再打开。')}catch(error){if(error.status!==1)throw error}}
requireMainClosed();
execFileSync('codesign',['--verify','--deep','--strict',source]);
const staging=path.resolve('tmp/install-staging/文献伴读.app');
await fs.rm(staging,{recursive:true,force:true});
await fs.cp(source,staging,{recursive:true,verbatimSymlinks:true});
execFileSync('codesign',['--verify','--deep','--strict',staging]);
// A widget click can reopen the old app while the staged copy is prepared.
requireMainClosed();
const backup=path.resolve('tmp/install-backups',Date.now()+'-文献伴读.app.backup');
const lsregister='/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
for(const host of [
 path.join(destination,'Contents/Helpers/文献伴读小组件.app'),
 path.join(source,'Contents/Helpers/文献伴读小组件.app'),
 path.resolve('dist/native-widget/Build/Products/Release/文献伴读小组件.app')
]){
 try{execFileSync('/usr/bin/pluginkit',['-r',path.join(host,'Contents/PlugIns/PaperReadingExtension.appex')],{stdio:'ignore'})}catch{}
 try{execFileSync(lsregister,['-u',host],{stdio:'ignore'})}catch{}
}
let previous=false;
try{
 await fs.access(destination);previous=true;
 const id=execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleIdentifier',path.join(destination,'Contents/Info.plist')],{encoding:'utf8'}).trim();
 if(id!=='com.mw.papercompanion')throw new Error('安装目标不是文献伴读，未替换。');
}catch(error){if(error.code!=='ENOENT')throw error}
await fs.mkdir(path.dirname(destination),{recursive:true});
if(previous){await fs.mkdir(path.dirname(backup),{recursive:true});requireMainClosed();await fs.rename(destination,backup)}
try{await fs.rename(staging,destination)}catch(error){if(previous)await fs.rename(backup,destination);throw error}
execFileSync('codesign',['--verify','--deep','--strict',destination]);
execFileSync(lsregister,['-f',destination]);
const host=path.join(destination,'Contents/Helpers/文献伴读小组件.app');
execFileSync(lsregister,['-f',host]);
execFileSync('/usr/bin/pluginkit',['-a',path.join(host,'Contents/PlugIns/PaperReadingExtension.appex')]);
const restartedWidgetProcesses=refreshWidgetAfterInstall(destination,previousWidgetProcesses);
console.log(JSON.stringify({installed:destination,backup:previous?backup:null,restartedWidgetProcesses}));
