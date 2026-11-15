import path from 'node:path';
import fs from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {atomicJson} from './store.mjs';

export async function registerNativeWidget(resources){
 if(process.platform!=='darwin'||!resources)return false;
 const host=path.resolve(resources,'../Helpers/文献伴读小组件.app');
 try{await fs.access(host)}catch{return false}
 const exec=promisify(execFile);
 await exec('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',['-f',host]);
 await exec('/usr/bin/pluginkit',['-a',path.join(host,'Contents/PlugIns/PaperReadingExtension.appex')]);
 return true;
}

// Only dashboard metadata and small first-page previews are shared. The original
// PDFs, notes, discussions and model configuration stay outside this directory.
export function nativeWidgetPublisher({root,resources,run=execFile,renderThumbnail}) {
 const file=path.join(root,'widget-snapshot','dashboard.json');
 const binary=path.resolve(resources,'../Helpers/文献伴读小组件.app/Contents/MacOS/PaperWidgetHost');
 const render=renderThumbnail||((input,output)=>promisify(execFile)(binary,['--thumbnail',input,output],{timeout:15000}));
 const coverPattern=/^[a-f0-9]{24}-[a-f0-9]{16}\.png$/;
 let queue=Promise.resolve(),last='',reloadTimer,closed=false;
 async function cover(id){
  if(!/^[a-f0-9]{24}$/.test(id))return null;
  try{
   const input=path.join(root,'papers',id+'.pdf'),stat=await fs.stat(input);
   const revision=createHash('sha256').update(`first-page-v1:${stat.size}:${stat.mtimeMs}`).digest('hex').slice(0,16);
   const name=`${id}-${revision}.png`,output=path.join(path.dirname(file),name);
   try{if((await fs.stat(output)).size>0)return name}catch{}
   await fs.mkdir(path.dirname(file),{recursive:true});
   await render(input,output);
   if(!(await fs.stat(output)).size)throw new Error('缩略图为空');
   await fs.chmod(output,0o600);return name;
  }catch(error){if(error.code!=='ENOENT')console.error('文献首页预览暂不可用:',error.message);return null}
 }
 async function publish(value){
  const {updatedAt,pinned,...payload}=value;
  payload.papers=await Promise.all(payload.papers.map(async(paper,index)=>({...paper,cover:index<5?await cover(paper.id):null})));
  const signature=JSON.stringify(payload);
  if(signature===last)return;
  await atomicJson(file,{...payload,updatedAt});last=signature;
  const active=new Set(payload.papers.map(paper=>paper.cover).filter(Boolean));
  for(const name of await fs.readdir(path.dirname(file))){if(coverPattern.test(name)&&!active.has(name))await fs.rm(path.join(path.dirname(file),name),{force:true})}
  clearTimeout(reloadTimer);
  reloadTimer=setTimeout(async()=>{if(closed)return;try{await fs.access(binary);run(binary,['--reload'],{timeout:8000},error=>{if(error)console.error('系统小组件刷新请求失败:',error.message)})}catch{/* Native companion is only included in packaged macOS builds. */}},700);
  reloadTimer.unref?.();
 }
 return {publish:value=>{queue=queue.catch(()=>{}).then(()=>publish(value));return queue},dispose:()=>{closed=true;clearTimeout(reloadTimer)}};
}
