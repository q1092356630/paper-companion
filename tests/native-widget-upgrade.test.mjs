import test from 'node:test';
import assert from 'node:assert/strict';
import {captureWidgetProcesses,refreshWidgetAfterInstall} from '../scripts/native-widget-upgrade.mjs';

test('widget upgrade replaces only the old installed extension, leaving the main app and other widgets alone',()=>{
 const app='/Users/reader/Applications/文献伴读.app';
 const executable=app+'/Contents/Helpers/文献伴读小组件.app/Contents/PlugIns/PaperReadingExtension.appex/Contents/MacOS/PaperReadingExtension';
 const rows=` 90 /System/NotificationCenter\n91 ${app}/Contents/MacOS/文献伴读\n92 ${executable}\n93 /build${executable}\n94 ${executable}\n95 ${executable}.other\n`;
 const before=captureWidgetProcesses(app,{exec:()=>rows});
 assert.deepEqual(before.map(item=>item.pid),[92,94]);
 const events=[];
 const restarted=refreshWidgetAfterInstall(app,before,{exec:(file,args)=>{
  if(file==='/bin/ps')return args.includes('94')?'/System/UnrelatedReusedPID':executable;
  events.push({file,args});return '';
 },kill:(pid,signal)=>events.push({pid,signal})});
 assert.deepEqual(restarted,[92]);assert.deepEqual(events,[{pid:92,signal:'SIGTERM'},{file:app+'/Contents/Helpers/文献伴读小组件.app/Contents/MacOS/PaperWidgetHost',args:['--reload']}]);
});
