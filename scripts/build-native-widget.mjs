import path from 'node:path';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import os from 'node:os';
import {execFileSync} from 'node:child_process';

export async function buildNativeWidget(){
 const developer=process.env.DEVELOPER_DIR||'/Applications/Xcode.app/Contents/Developer';
 const binary=path.join(developer,'usr/bin/xcodebuild');
 await fs.access(binary);
 execFileSync(binary,['-project','native/PaperWidgets.xcodeproj','-scheme','PaperWidgetHost','-configuration','Release','-derivedDataPath','dist/native-widget','-destination','platform=macOS','build',`PAPER_SNAPSHOT_DIRECTORY=${path.join(os.homedir(),'Library/Application Support/文献伴读/Library/widget-snapshot')}`,'-quiet'],{stdio:'inherit',env:{...process.env,DEVELOPER_DIR:developer}});
 const host=path.resolve('dist/native-widget/Build/Products/Release/文献伴读小组件.app');
 // Xcode registers Products as well. Keep its transient copy out of the
 // user's widget gallery; the installed app registers the shipped copy.
 for(const [command,args] of [
  ['/usr/bin/pluginkit',['-r',path.join(host,'Contents/PlugIns/PaperReadingExtension.appex')]],
  ['/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',['-u',host]]
 ]){try{execFileSync(command,args,{stdio:'ignore'})}catch{}}
 return host;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await buildNativeWidget());
