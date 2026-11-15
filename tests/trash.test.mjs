import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {LibraryStore} from '../desktop/store.mjs';
import {purgeTrashedDocuments} from '../desktop/trash.mjs';

async function setup(t){
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'paper-purge-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));
 const root=path.join(folder,'Library'),previewCache=path.join(folder,'TranslatedPDFs'),store=new LibraryStore(root);await store.init();
 async function paper(name){const original=path.join(folder,name+'.pdf');await fs.writeFile(original,'%PDF-1.4\n'+name);const doc=await store.importPdf(original);return {...doc,original}}
 const a=await paper('A'),b=await paper('B'),exported=path.join(folder,'exported-card.md');await fs.writeFile(exported,'User export');
 for(const relative of ['indexes/'+a.id+'/searchable.pdf','translations/'+a.id+'/page-1.pdf','widget-snapshot/'+a.id+'-0123456789abcdef.png']){const file=path.join(root,relative);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'generated')}
 await fs.mkdir(path.join(previewCache,a.id),{recursive:true});await fs.writeFile(path.join(previewCache,a.id,'preview.pdf'),'generated');
 await store.patch(a.id,{pages:[{text:'Source text'}],notes:[{text:'Notes'}],messages:[{role:'user',text:'Why'}],card:{conclusion:'Summary'},translations:{1:{file:'../../'+path.basename(b.original)}},zotero:{key:'LINKED'}});
 return {folder,root,store,a,b,previewCache,exported};
}

test('permanent clearing removes only selected trashed paper assets and keeps source files, other papers and exports',async t=>{
 const {root,store,a,b,previewCache,exported}=await setup(t);await store.trash(a.id);
 const events=[];store.onChange=id=>events.push(id);
 const result=await purgeTrashedDocuments({store,ids:[a.id,a.id],previewCache});
 assert.deepEqual(result,{deleted:[a.id],failed:[]});assert.deepEqual(events,[a.id]);
 for(const target of [store.record(a.id),store.file(a.id),path.join(root,'indexes',a.id),path.join(root,'translations',a.id),path.join(root,'widget-snapshot',a.id+'-0123456789abcdef.png'),path.join(previewCache,a.id)])await assert.rejects(fs.access(target));
 for(const file of [a.original,b.original,store.file(b.id),exported])assert.ok((await fs.stat(file)).size);
 assert.equal((await store.list({deleted:true})).length,0);assert.equal((await store.list()).length,1);
 await assert.rejects(store.get(a.id),/找不到/);
});

test('active/restored or busy papers abort an entire batch before any deletion',async t=>{
 const {store,a,b,previewCache}=await setup(t);await store.trash(a.id);
 await assert.rejects(purgeTrashedDocuments({store,ids:[a.id,b.id],previewCache}),/状态已改变/);
 await assert.rejects(purgeTrashedDocuments({store,ids:[a.id],previewCache,isBusy:()=>true}),/处理中/);
 assert.ok(await fs.stat(store.file(a.id)));assert.equal((await store.get(a.id)).purgePending,undefined);
 await store.trash(b.id);await store.restore(b.id);
 await assert.rejects(purgeTrashedDocuments({store,ids:[a.id,b.id],previewCache}),/状态已改变/);
 assert.ok(await fs.stat(store.file(a.id)));assert.ok(await fs.stat(store.file(b.id)));
 assert.throws(()=>purgeTrashedDocuments({store,ids:['../outside'],previewCache}),/无效/);
});

test('emptying a captured trash list clears all its items and leaves the active library intact',async t=>{
 const {folder,store,a,b,previewCache}=await setup(t);
 const thirdFile=path.join(folder,'C.pdf');await fs.writeFile(thirdFile,'%PDF-1.4\nC');const active=await store.importPdf(thirdFile);
 await store.trash(a.id);await store.trash(b.id);
 const ids=(await store.list({deleted:true})).map(doc=>doc.id);
 const result=await purgeTrashedDocuments({store,ids,previewCache});
 assert.equal(result.failed.length,0);assert.equal(result.deleted.length,2);
 assert.deepEqual((await store.list()).map(doc=>doc.id),[active.id]);assert.deepEqual(await store.list({deleted:true}),[]);
 assert.ok((await fs.stat(store.file(active.id))).size);
});

test('failed disk cleanup remains visible and retryable; incomplete papers cannot be restored',async t=>{
 const {store,a,previewCache}=await setup(t);await store.trash(a.id);
 const result=await purgeTrashedDocuments({store,ids:[a.id],previewCache,remove:async(file,options)=>{if(file.includes(path.sep+'indexes'+path.sep))throw new Error('Disk is busy');await fs.rm(file,options)}});
 assert.deepEqual(result.deleted,[]);assert.equal(result.failed[0].id,a.id);
 assert.equal((await store.list({deleted:true}))[0].purgePending,true);
 await assert.rejects(store.restore(a.id),/永久清除尚未完成/);
 await assert.rejects(store.importPdf(a.original),/永久清除尚未完成/);
 const retry=await purgeTrashedDocuments({store,ids:[a.id],previewCache});assert.deepEqual(retry,{deleted:[a.id],failed:[]});
});

test('a linked storage parent is refused and a linked leaf never deletes its outside target',async t=>{
 const {folder,root,store,a,previewCache}=await setup(t);await store.trash(a.id);
 const outside=path.join(folder,'outside');await fs.mkdir(outside);const protectedFile=path.join(outside,'keep.pdf');await fs.writeFile(protectedFile,'External original');
 await fs.rm(store.file(a.id));await fs.symlink(protectedFile,store.file(a.id));
 await fs.rm(path.join(root,'indexes'),{recursive:true});await fs.symlink(outside,path.join(root,'indexes'));
 await assert.rejects(purgeTrashedDocuments({store,ids:[a.id],previewCache}),/存储目录异常/);
 assert.equal((await store.get(a.id)).purgePending,undefined);
 await fs.unlink(path.join(root,'indexes'));
 assert.deepEqual((await purgeTrashedDocuments({store,ids:[a.id],previewCache})).deleted,[a.id]);
 assert.equal(await fs.readFile(protectedFile,'utf8'),'External original');
});
