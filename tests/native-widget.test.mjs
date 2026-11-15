import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {nativeWidgetPublisher} from '../desktop/native-widget.mjs';
import {readingDashboard} from '../desktop/widget-data.mjs';
const {parseWidgetUrl}=createRequire(import.meta.url)('../desktop/widget-url.cjs');

test('system widget links accept only supported local views and document IDs',()=>{
 const id='0123456789abcdef01234567';
 for(const view of ['reader','card','pdf'])assert.deepEqual(parseWidgetUrl(`papercompanion://${view}/${id}`),{view,id});
 for(const view of ['library','weekly'])assert.deepEqual(parseWidgetUrl(`papercompanion://${view}`),{view});
 for(const value of ['file:///tmp/test.pdf',`papercompanion://pdf/../../etc/passwd`,`papercompanion://reader/${id}?file=/tmp/a`,`papercompanion://card/${id}#x`,`papercompanion://reader/${id}/`, 'papercompanion://delete/'+id, 'papercompanion://weekly/extra', 'papercompanion://user@weekly', 'papercompanion://pdf/invalid'])assert.equal(parseWidgetUrl(value),null,value);
});

test('published widget snapshot excludes private library content and reflects committed changes',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'native-widget-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const publisher=nativeWidgetPublisher({root,resources:root});t.after(()=>publisher.dispose());
 const now=new Date(),docs=[{id:'0123456789abcdef01234567',title:'Test paper',pages:[{},{}],page:1,notes:[{text:'PRIVATE NOTE'}],messages:[{text:'PRIVATE DISCUSSION'}],card:null,translations:{1:{file:'private/pdf/path'}}}];
 await publisher.publish(readingDashboard(docs,null,now));
 const file=path.join(root,'widget-snapshot/dashboard.json'),first=await fs.readFile(file,'utf8');
 assert.equal(JSON.parse(first).papers[0].page,1);assert.doesNotMatch(first,/PRIVATE|private\/pdf|notes|messages|translations/);
 docs[0].page=2;await publisher.publish(readingDashboard(docs,null,now));assert.equal(JSON.parse(await fs.readFile(file,'utf8')).papers[0].page,2);
 docs[0].deletedAt=now.toISOString();await publisher.publish(readingDashboard(docs,null,now));assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')).papers,[]);
 if(process.platform!=='win32')assert.equal((await fs.stat(file)).mode&0o777,0o600);
});

test('first-page previews are cached, invalidated on PDF changes and removed when papers leave the widget',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'widget-covers-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const id='0123456789abcdef01234567',input=path.join(root,'papers',id+'.pdf');
 await fs.mkdir(path.dirname(input));await fs.writeFile(input,'%PDF-first');
 let renders=0;
 const publisher=nativeWidgetPublisher({root,resources:root,renderThumbnail:async(source,output)=>{assert.equal(source,input);renders++;await fs.writeFile(output,'thumbnail')}});t.after(()=>publisher.dispose());
 const docs=[{id,title:'Cover test',pages:[{},{}],page:1}],snapshot=()=>readingDashboard(docs,null);
 const file=path.join(root,'widget-snapshot/dashboard.json'),read=async()=>JSON.parse(await fs.readFile(file,'utf8'));
 await publisher.publish(snapshot());const first=(await read()).papers[0].cover;
 assert.match(first,/^[a-f0-9]{24}-[a-f0-9]{16}\.png$/);assert.equal(renders,1);
 docs[0].page=2;await publisher.publish(snapshot());assert.equal(renders,1);assert.equal((await read()).papers[0].page,2);
 await fs.writeFile(input,'%PDF-updated-content');await publisher.publish(snapshot());
 const second=(await read()).papers[0].cover;assert.notEqual(first,second);assert.equal(renders,2);
 await assert.rejects(fs.access(path.join(path.dirname(file),first)));
 if(process.platform!=='win32')assert.equal((await fs.stat(path.join(path.dirname(file),second))).mode&0o777,0o600);
 docs[0].deletedAt=new Date().toISOString();await publisher.publish(snapshot());
 assert.deepEqual((await read()).papers,[]);await assert.rejects(fs.access(path.join(path.dirname(file),second)));
});

test('unavailable cover rendering does not block progress or shortcuts, and can recover later',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'widget-cover-retry-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const id='0123456789abcdef01234567';await fs.mkdir(path.join(root,'papers'));await fs.writeFile(path.join(root,'papers',id+'.pdf'),'%PDF');
 let available=false;
 const publisher=nativeWidgetPublisher({root,resources:root,renderThumbnail:async(_,output)=>{if(!available)throw Object.assign(new Error('renderer unavailable'),{code:'ENOENT'});await fs.writeFile(output,'thumbnail')}});t.after(()=>publisher.dispose());
 const value=readingDashboard([{id,title:'Test',page:1,pages:[{}],card:{savedAt:new Date().toISOString()},translations:{1:{file:'private.pdf'}}}],null);
 const read=async()=>JSON.parse(await fs.readFile(path.join(root,'widget-snapshot/dashboard.json'),'utf8')).papers[0];
 await publisher.publish(value);assert.equal((await read()).cover,null);assert.equal((await read()).hasCard,true);assert.equal((await read()).pdfReady,true);
 available=true;await publisher.publish(value);assert.ok((await read()).cover);
});

test('all five recent papers receive cached covers and newest imports enter the dashboard',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'widget-five-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'papers'));
 const docs=Array.from({length:6},(_,i)=>({id:String(i+1).padStart(24,'0'),title:'Paper '+(i+1),updatedAt:new Date(2026,8,28,12,i).toISOString(),pages:[{}]}));
 for(const doc of docs)await fs.writeFile(path.join(root,'papers',doc.id+'.pdf'),'%PDF-1.4 '+doc.id);
 let rendered=0;const publisher=nativeWidgetPublisher({root,resources:root,renderThumbnail:async(_,output)=>{rendered++;await fs.writeFile(output,'preview')}});t.after(()=>publisher.dispose());
 await publisher.publish(readingDashboard(docs,null));const data=JSON.parse(await fs.readFile(path.join(root,'widget-snapshot/dashboard.json')));
 assert.equal(data.papers.length,5);assert.equal(data.papers[0].id,docs[5].id);assert.ok(data.papers.every(p=>p.cover));assert.equal(rendered,5);assert.ok(!data.papers.some(p=>p.id===docs[0].id));
});
