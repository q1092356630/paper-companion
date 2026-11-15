import {posix as path} from 'node:path';
import {execFileSync} from 'node:child_process';

const extensionPath=app=>path.join(app,'Contents/Helpers/文献伴读小组件.app/Contents/PlugIns/PaperReadingExtension.appex/Contents/MacOS/PaperReadingExtension');

export function captureWidgetProcesses(app,{exec=execFileSync}={}){
 const executable=extensionPath(app);
 const rows=exec('/bin/ps',['-ww','-axo','pid=,comm='],{encoding:'utf8'}).split('\n');
 return rows.flatMap(row=>{const match=row.match(/^\s*(\d+)\s+(.+?)\s*$/);return match&&match[2]===executable?[{pid:Number(match[1]),executable}]:[]});
}

export function refreshWidgetAfterInstall(app,previous,{exec=execFileSync,kill=process.kill}={}){
 const restarted=[];
 for(const item of previous){
  if(item.executable!==extensionPath(app)||!Number.isSafeInteger(item.pid)||item.pid<=1)continue;
  // Re-check the PID after copying: never signal an unrelated/reused process.
  let current;
  try{current=exec('/bin/ps',['-ww','-p',String(item.pid),'-o','comm='],{encoding:'utf8'}).trim()}catch{continue}
  if(current!==item.executable)continue;
  try{kill(item.pid,'SIGTERM');restarted.push(item.pid)}catch(error){if(error.code!=='ESRCH')throw error}
 }
 // Re-registering a bundle does not unload its old executable. End only our
 // pre-install extension, then ask WidgetKit to render using the installed code.
 exec(path.join(app,'Contents/Helpers/文献伴读小组件.app/Contents/MacOS/PaperWidgetHost'),['--reload'],{timeout:8000});
 return restarted;
}
