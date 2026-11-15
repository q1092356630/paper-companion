import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {LibraryStore} from '../desktop/store.mjs';
import {PaperService} from '../desktop/service.mjs';
import {layoutVersion} from '../desktop/layout.mjs';

async function setup(){const root=await fs.mkdtemp(path.join(os.tmpdir(),'paper-layout-test-'));const store=new LibraryStore(root);await store.init();const source=path.join(root,'source.pdf');await fs.writeFile(source,'%PDF-1.4\nfixture');const doc=await store.importPdf(source);await store.patch(doc.id,{pages:[1,2,3,4].map(n=>({text:'Evidence on page '+n,blocks:[],width:612,height:792}))});return {root,store,id:doc.id}}
const config=async()=>({provider:'codex',model:'fixture',baseUrl:'codex://local'});
async function produce({pages,output}){await fs.mkdir(output,{recursive:true});return {pages:await Promise.all(pages.map(async page=>{const file=path.join(output,'page-'+page+'.pdf');await fs.writeFile(file,'%PDF-1.4\ntranslated');return {page,path:file,width:612,height:792,text:'中文译文',blocks:[],protectedRegions:1}}))}}

test('PDF translation preserves explicit source mapping and reuses persisted pages',async()=>{
 const {root,store,id}=await setup();let calls=0;const events=[];
 const service=new PaperService(store,config,e=>events.push(e),fetch,async request=>{calls++;return produce(request)});
 try{await service.translatePDF(id,[3,1,3]);const doc=await store.get(id);assert.equal(calls,1);assert.equal(doc.translations[1].engine,layoutVersion);assert.match(doc.translations[3].file,/page-3.pdf$/);assert.equal(doc.translations[2],undefined);assert.equal(doc.status,'reading');await service.translatePDF(id,[1,3]);assert.equal(calls,1);await fs.rm(path.join(root,doc.translations[1].file));await service.translatePDF(id,[1]);assert.equal(calls,2);assert.equal(events.at(-1).done,1)}finally{await fs.rm(root,{recursive:true,force:true})}
});
test('failure in a later PDF batch keeps earlier pages and retry only fills missing pages',async()=>{
 const {root,store,id}=await setup();let fail=true;const requested=[];
 const service=new PaperService(store,config,()=>{},fetch,async request=>{requested.push(request.pages);if(fail&&request.pages[0]===4)throw new Error('network offline');return produce(request)});
 try{await assert.rejects(service.translatePDF(id,[1,2,3,4]),/offline/);const doc=await store.get(id);assert.deepEqual(Object.keys(doc.translations),['1','2','3']);assert.equal(service.tasks.size,0);fail=false;await service.translatePDF(id,[1,2,3,4]);assert.deepEqual(requested,[[1,2,3],[4],[4]]);assert.equal((await store.get(id)).card,null)}finally{await fs.rm(root,{recursive:true,force:true})}
});
test('cancelling PDF translation does not commit partial outputs or mark reading complete',async()=>{
 const {root,store,id}=await setup();let start;const started=new Promise(resolve=>start=resolve);
 const service=new PaperService(store,config,()=>{},fetch,request=>new Promise((_resolve,reject)=>{start();request.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})}));
 try{const work=service.translatePDF(id,[1]);await started;service.cancel(id);await assert.rejects(work,/取消/);const doc=await store.get(id);assert.deepEqual(doc.translations,{});assert.equal(doc.status,'reading');assert.equal(service.tasks.size,0)}finally{await fs.rm(root,{recursive:true,force:true})}
});
test('Luna migration retains paid-for legacy translations and uses the explicit model only for missing pages',async()=>{
 const {root,store,id}=await setup();const calls=[];
 try{
  const file=path.join('translations',id,'legacy.pdf');await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),'%PDF-1.4\nlegacy');
  const original={engine:layoutVersion,model:'codex-default',baseUrl:'codex://local',file,text:'已有中文'};
  await store.patch(id,{translations:{1:original}});
  const service=new PaperService(store,async()=>({provider:'codex',model:'codex-default',baseUrl:'codex://local'}),()=>{},fetch,async request=>{calls.push({pages:request.pages,model:request.config.model});return produce(request)});
  await service.translatePDF(id,[1,2]);const doc=await store.get(id);
  assert.deepEqual(calls,[{pages:[2],model:'gpt-6-luna'}]);assert.deepEqual(doc.translations[1],original);assert.equal(doc.translations[2].model,'gpt-6-luna');
 }finally{await fs.rm(root,{recursive:true,force:true})}
});

test('translation failure details survive reopening and resume counts include saved pages',async()=>{
 const {root,store,id}=await setup();const events=[];
 try{
  const service=new PaperService(store,config,e=>events.push(e),fetch,async request=>{if(request.pages.includes(4))throw new Error('model temporarily unavailable');return produce(request)});
  await assert.rejects(service.translatePDF(id,[1,2,3,4]),/temporarily/);
  const reopened=new LibraryStore(root),failed=await reopened.get(id);
  assert.equal(failed.translationJob.status,'failed');assert.equal(failed.translationJob.done,3);assert.equal(failed.translationJob.total,4);
  assert.deepEqual(failed.translationJob.currentPages,[4]);assert.match(failed.translationJob.error,/temporarily/);
  assert.equal(events.at(-1).persisted,true);
  const requested=[];const resumed=new PaperService(reopened,config,e=>events.push(e),fetch,async request=>{requested.push(request.pages);return produce(request)});
  const complete=await resumed.translatePDF(id,failed.translationJob.requestedPages);
  assert.deepEqual(requested,[[4]]);assert.equal(complete.translationJob.status,'complete');assert.equal(complete.translationJob.done,4);
  assert.equal(complete.translationJob.error,'');assert.deepEqual(complete.translationJob.currentPages,[]);
  assert.equal(events.at(-1).done,4);assert.equal(events.at(-1).total,4);assert.equal(complete.card,null);
  const reused=await resumed.translatePDF(id,[1,2,3,4]);assert.equal(requested.length,1);assert.equal(reused.translationJob.done,4);
 }finally{await fs.rm(root,{recursive:true,force:true})}
});

test('cancelled or interrupted PDF jobs remain resumable after application restart',async()=>{
 const {root,store,id}=await setup();let start;const started=new Promise(resolve=>start=resolve);
 const service=new PaperService(store,config,()=>{},fetch,request=>new Promise((_resolve,reject)=>{start();request.signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true})}));
 try{
  const work=service.translatePDF(id,[1,2,3,4]);await started;
  const running=await store.get(id);assert.equal(running.translationJob.status,'running');assert.deepEqual(running.translationJob.currentPages,[1,2,3]);
  service.cancel(id);await assert.rejects(work,/取消/);
  const cancelled=await store.get(id);assert.equal(cancelled.translationJob.status,'cancelled');assert.equal(cancelled.translationJob.done,0);
  const resumed=new PaperService(store,config,()=>{},fetch,produce);await resumed.translatePDF(id,running.translationJob.requestedPages);
  assert.equal((await store.get(id)).translationJob.status,'complete');
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
