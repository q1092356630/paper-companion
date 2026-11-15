import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {readingDashboard} from '../desktop/widget-data.mjs';
import {translatedPreview} from '../desktop/translated-preview.mjs';
import {LibraryStore} from '../desktop/store.mjs';

test('dashboard distinguishes weekly recommendations, saved completions and reading positions',()=>{
 const now=new Date(2026,8,28,12),week=new Date(2026,8,28,9).toISOString(),old=new Date(2026,8,27,12).toISOString();
 const docs=[{id:'a',title:'A',status:'complete',card:{savedAt:week},page:2,pages:[{},{}],translations:{1:{file:'a'},2:{file:'b'}},lastReadAt:week},{id:'b',status:'complete',card:{savedAt:old},pages:[],updatedAt:old},{id:'c',status:'complete',card:null,pages:[{}],page:99},{id:'d',status:'complete',card:{savedAt:week},deletedAt:week}];
 const value=readingDashboard(docs,{generatedAt:week,items:[{aiRank:1},{aiRank:2},{}]},now);
 assert.equal(value.recommended,2);assert.equal(value.candidates,3);assert.equal(value.readThisWeek,1);assert.equal(value.totalRead,2);assert.equal(value.inProgress,1);
 assert.equal(value.papers[0].id,'a');assert.equal(value.papers[0].page,2);assert.equal(value.papers[0].pdfReady,true);assert.equal(value.papers[2].page,1);
 const stale=readingDashboard(docs,{generatedAt:old,items:[{aiRank:1}]},now);assert.equal(stale.recommended,0);assert.equal(stale.weeklyCurrent,false);
 assert.equal(readingDashboard(docs,{generatedAt:week,items:[{},{}]},now).recommended,2);
});
test('committed reading changes trigger dashboard refresh, failed writes do not',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'widget-store-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const store=new LibraryStore(root);await store.init();const file=path.join(root,'fixture.pdf');await fs.writeFile(file,'%PDF-1.4 fixture');const events=[];store.onChange=id=>events.push(id);
 const doc=await store.importPdf(file);await store.patch(doc.id,{page:2});await store.trash(doc.id);await store.restore(doc.id);
 await assert.rejects(store.update(doc.id,()=>{throw new Error('failed')}));assert.equal(events.length,4);assert.ok(events.every(id=>id===doc.id));
 assert.equal((await store.get(doc.id)).page,2);
});
test('PDF shortcut reuses a complete translation and invalidates cache when pages change',async t=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'widget-preview-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));
 const root=path.join(folder,'library'),cache=path.join(folder,'cache'),id='0123456789abcdef01234567';await fs.mkdir(path.join(root,'translations',id),{recursive:true});
 const file=`translations/${id}/page-1.pdf`;await fs.writeFile(path.join(root,file),'%PDF-1.4 first');
 const doc={id,title:'测试',pages:[{width:612,height:792}],translations:{1:{file}}};let calls=0;
 const exporter=async({destination})=>{calls++;await fs.writeFile(destination,'%PDF-1.4 complete')};
 const first=await translatedPreview({root,doc,cache,exporter});assert.equal(await translatedPreview({root,doc,cache,exporter}),first);assert.equal(calls,1);
 await fs.writeFile(path.join(root,file),'%PDF-1.4 updated page');const second=await translatedPreview({root,doc,cache,exporter});assert.notEqual(second,first);assert.equal(calls,2);
 await fs.rm(path.join(root,file));await assert.rejects(translatedPreview({root,doc,cache,exporter}),/缺少第 1 页/);assert.equal(calls,2);
});

test('imports, metadata, reading and trash automatically publish a fresh native snapshot without AI keys',async t=>{
 const {createWidgetController}=await import('../desktop/widget.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'widget-live-events-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const store=new LibraryStore(root);await store.init();await fs.writeFile(path.join(root,'widget.json'),JSON.stringify({enabled:false}));
 const {PaperService}=await import('../desktop/service.mjs');
 const service=new PaperService(store,async purpose=>{assert.equal(purpose,false);return {topics:[],topicOperator:'or'}},()=>{},()=>{throw Error('No network')});
 const controller=await createWidgetController({electron:{app:{}},store,service,root,showMain:()=>{}});t.after(()=>controller.dispose());store.onChange=controller.changed;
 const snapshotFile=path.join(root,'widget-snapshot/dashboard.json');
 const until=async predicate=>{for(let i=0;i<60;i++){const data=JSON.parse(await fs.readFile(snapshotFile));if(predicate(data))return data;await new Promise(r=>setTimeout(r,50))}assert.fail('dashboard did not update')};
 await controller.start();const file=path.join(root,'import.pdf');await fs.writeFile(file,'%PDF-1.4 new paper');const doc=await store.importPdf(file);
 await until(d=>d.papers[0]?.id===doc.id);
 await store.patch(doc.id,{title:'Automatically identified journal paper',pages:[{},{}],page:2});
 await until(d=>d.papers[0]?.title==='Automatically identified journal paper'&&d.papers[0]?.page===2&&d.papers[0]?.total===2);
 await store.patch(doc.id,{status:'complete',card:{savedAt:new Date().toISOString()}});await until(d=>d.totalRead===1&&d.papers[0]?.hasCard);
 await store.trash(doc.id);await until(d=>d.papers.length===0&&d.totalRead===0);
});
