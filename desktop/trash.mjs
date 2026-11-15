import fs from 'node:fs/promises';
import path from 'node:path';
import {atomicJson,validId} from './store.mjs';

async function ownedFolder(folder){
 try{
  const stat=await fs.lstat(folder);
  if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('文献存储目录异常，未执行永久清除');
  return folder;
 }catch(error){if(error.code==='ENOENT')return null;throw error}
}

async function assets(root,id,previewCache){
 const targets=[];
 for(const [folder,name] of [['papers',id+'.pdf'],['indexes',id],['translations',id]]){
  const parent=await ownedFolder(path.join(root,folder));if(parent)targets.push(path.join(parent,name));
 }
 const thumbnails=await ownedFolder(path.join(root,'widget-snapshot'));
 if(thumbnails){for(const name of await fs.readdir(thumbnails))if(new RegExp('^'+id+'-[a-f0-9]{16}\\.png$').test(name))targets.push(path.join(thumbnails,name))}
 if(previewCache){const parent=await ownedFolder(previewCache);if(parent)targets.push(path.join(parent,id))}
 return targets;
}

export function purgeTrashedDocuments({store,ids,previewCache,isBusy=()=>false,remove=fs.rm}){
 if(!Array.isArray(ids)||!ids.length||ids.length>5000)throw new Error('请选择要永久删除的回收站文献');
 const selected=[...new Set(ids.map(validId))];
 return store.transaction(async()=>{
  const documents=[];
  // Revalidate every item after confirmation. A restored item must never be
  // deleted just because it appeared in an earlier trash-list snapshot.
  for(const id of selected){
   const doc=await store.get(id);
   if(!doc.deletedAt)throw new Error('文献状态已改变，请刷新回收站后重试');
   if(isBusy(id))throw new Error('文献正在处理中，请完成后再永久删除');
   documents.push({id,doc,targets:await assets(store.root,id,previewCache)});
  }
  const deleted=[],failed=[];
  for(const {id,doc,targets} of documents){
   try{
    // If a disk error interrupts deletion, retain a visible retryable record;
    // restoring it would misleadingly restore an incomplete document.
    await atomicJson(store.record(id),{...doc,purgePending:true});
    for(const file of targets)await remove(file,{recursive:true,force:true});
    await remove(store.record(id),{force:true});
    deleted.push(id);
   }catch(error){failed.push({id,title:doc.title,error:error.message||'本地文件清除失败'})}
   store.onChange(id);
  }
  return {deleted,failed};
 });
}
