import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {LibraryStore} from '../desktop/store.mjs';
import {completion,modelURL,verifiedCitations,selectContext,cardMarkdown} from '../desktop/model.mjs';
import {PaperService} from '../desktop/service.mjs';
import {discover} from '../desktop/research.mjs';

test('managed PDF import deduplicates and concurrent updates survive reopen',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'paper-store-test-'));try{const file=path.join(root,'input.pdf');await fs.writeFile(file,'%PDF-1.4\nfixture');const store=new LibraryStore(path.join(root,'library'));await store.init();const doc=await store.importPdf(file);const same=await store.importPdf(file);assert.equal(same.id,doc.id);await Promise.all([store.update(doc.id,d=>({notes:[...d.notes,{id:'1',text:'mine'}]})),store.update(doc.id,d=>({messages:[...d.messages,{id:'2',role:'user',text:'why'}]}))]);const reopened=new LibraryStore(store.root);assert.equal((await reopened.get(doc.id)).notes.length,1);assert.equal((await reopened.get(doc.id)).messages.length,1);assert.equal((await reopened.list()).length,1);assert.throws(()=>store.file('../secret'));await fs.writeFile(path.join(root,'bad.pdf'),'not pdf');await assert.rejects(store.importPdf(path.join(root,'bad.pdf')),/不是有效/)}finally{await fs.rm(root,{recursive:true,force:true})}
});
test('model endpoint validation prevents plaintext remote credentials and URL credentials',()=>{assert.equal(modelURL('https://api.deepseek.com'),'https://api.deepseek.com/chat/completions');assert.equal(modelURL('http://127.0.0.1:8181/v1'),'http://127.0.0.1:8181/v1/chat/completions');assert.throws(()=>modelURL('http://example.com'));assert.throws(()=>modelURL('https://user:password@example.com'))});
test('citations require exact supporting text and valid PDF page',()=>{const pages=[{text:'The sample size was 120 patients.'}];assert.deepEqual(verifiedCitations([{page:1,quote:'sample size was 120 patients'},{page:2,quote:'sample size was 120 patients'},{page:1,quote:'3000 patients'}],pages),[{page:1,quote:'sample size was 120 patients'}]);assert.equal(selectContext(pages,'sample',1)[0].page,1)});
test('model requests use JSON mode and handle failures without fabricated output',async()=>{let payload;const config={baseUrl:'https://api.deepseek.com',model:'test-model',apiKey:'test-key'};const result=await completion(config,[{role:'user',content:'json'}],{json:true,fetcher:async(_u,o)=>{payload=JSON.parse(o.body);return new Response(JSON.stringify({choices:[{message:{content:'{"answer":"ok"}'},finish_reason:'stop'}]}))}});assert.equal(result.answer,'ok');assert.equal(payload.response_format.type,'json_object');await assert.rejects(completion(config,[],{fetcher:async()=>new Response('',{status:401})}),/Key 无效/);await assert.rejects(completion(config,[],{json:true,fetcher:async()=>new Response(JSON.stringify({choices:[{message:{content:'bad json'}}]}))}),/格式不完整/)});
test('missing credentials do not overwrite reading history',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'paper-service-test-'));try{const store=new LibraryStore(root);await store.init();const file=path.join(root,'a.pdf');await fs.writeFile(file,'%PDF-1.4');const doc=await store.importPdf(file);await store.patch(doc.id,{pages:[{text:'A real scientific sentence with evidence.',blocks:[]}]});const service=new PaperService(store,async()=>({}));await assert.rejects(service.chat(doc.id,'What?',1),/API Key/);assert.equal((await store.get(doc.id)).messages.length,0);assert.equal(service.tasks.size,0)}finally{await fs.rm(root,{recursive:true,force:true})}});
test('weekly retrieval deduplicates DOI and uses a seven-day publication window',async()=>{const urls=[];const result=await discover('colorectal cancer;deep learning',{pause:async()=>{},now:new Date('2026-09-28T00:00:00Z'),fetcher:async url=>{urls.push(url);return new Response(JSON.stringify({message:{items:[{DOI:'10.1/X',title:['Deep learning for colorectal cancer'],published:{'date-parts':[[2026,9,25]]}}]}}))}});assert.equal(result.items.length,1);assert.equal(result.items[0].matched.length,2);assert.equal(result.from,'2026-09-21');assert.match(urls[0],/from-pub-date/)});
test('Markdown keeps both personal insight and notes independently of AI suggestions',()=>{const doc={title:'Paper',authors:'Author',doi:'10.1/a',messages:[],notes:[{page:3,text:'Evidence',comment:'My note'}]};const text=cardMarkdown(doc,{conclusion:'Summary',insight:'My insight',suggestion:'AI suggestion',citations:[{page:3,quote:'Evidence'}]});assert.match(text,/My note/);assert.match(text,/## 我的想法\nMy insight/);assert.match(text,/AI 建议（待确认）/)});

test('translation, question and summary use the model while preserving evidence and manual completion',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'paper-workflow-test-'));
 try{
  const store=new LibraryStore(root);await store.init();const file=path.join(root,'a.pdf');await fs.writeFile(file,'%PDF-1.4');const doc=await store.importPdf(file);
  await store.patch(doc.id,{pages:[{text:'The study included 120 patients.',blocks:[{id:'b0',text:'The study included 120 patients.'}]}]});
  let requests=0;const responses=[{translations:[{id:'b0',text:'该研究纳入了 120 名患者。'}]},{answer:'共有 120 名患者。',citations:[{page:1,quote:'The study included 120 patients.'},{page:1,quote:'There were 300 patients.'}]},{glossary:'n：样本量；本研究为 120 人。',conclusion:'研究纳入 120 人。',findings:'统计样本量',citations:[{page:1,quote:'The study included 120 patients.'}]}];
  const service=new PaperService(store,async()=>({apiKey:'fixture',baseUrl:'https://example.test',model:'fixture'}),()=>{},async(_url,opts)=>{requests++;const payload=JSON.parse(opts.body);assert.equal(payload.response_format.type,'json_object');return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(responses.shift())},finish_reason:'stop'}]}))});
  await service.translate(doc.id,[1]);await service.translate(doc.id,[1]);assert.equal(requests,1);assert.equal((await store.get(doc.id)).translations[1].blocks[0].text,'该研究纳入了 120 名患者。');
  const discussed=await service.chat(doc.id,'纳入多少人？',1);assert.equal(discussed.messages.length,2);assert.equal(discussed.messages[1].citations.length,1);
  const draft=await service.summarize(doc.id);assert.equal(draft.conclusion,'研究纳入 120 人。');assert.equal(draft.glossary,'n：样本量；本研究为 120 人。');assert.equal(draft.insight,'');assert.equal((await store.get(doc.id)).status,'reading');assert.equal((await store.get(doc.id)).card,null);
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
test('translation failure retains completed pages for retry and never invents missing paragraphs',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'paper-translation-test-'));
 try{const store=new LibraryStore(root);await store.init();const file=path.join(root,'a.pdf');await fs.writeFile(file,'%PDF-1.4');const doc=await store.importPdf(file);await store.patch(doc.id,{pages:[1,2].map(n=>({text:'Page '+n,blocks:[{id:'b0',text:'Page '+n}]}))});let calls=0;const service=new PaperService(store,async()=>({apiKey:'fixture',baseUrl:'https://example.test',model:'fixture'}),()=>{},async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({translations:++calls===1?[{id:'b0',text:'第一页'}]:[]})}}]})));await assert.rejects(service.translate(doc.id,[1,2]),/遗漏/);const result=await store.get(doc.id);assert.ok(result.translations[1]);assert.equal(result.translations[2],undefined);assert.equal(service.tasks.size,0)}finally{await fs.rm(root,{recursive:true,force:true})}
});
test('weekly OR ranking prioritizes colorectal overlap while retaining other matching topics',async()=>{
 const titles=['Deep learning for rectal cancer MRI','Concept bottleneck models for medical imaging','Large language models for stock market analysis'];
 const result=await discover('结直肠癌；深度学习；概念瓶颈；大语言模型；磁共振成像',{pause:async()=>{},fetcher:async()=>new Response(JSON.stringify({message:{items:titles.map((title,i)=>({DOI:'10.1/'+i,title:[title]}))}}))});
 assert.equal(result.retrieved,3);assert.equal(result.items.length,3);assert.equal(result.items[0].priority,'研究交叉方向');assert.equal(result.items[1].priority,'可借鉴的方法');assert.match(result.items[1].reason,/并非结直肠癌直接证据/);
});
test('weekly retrieval retains partial results but fails if every request fails',async()=>{
 let calls=0;const fetcher=async()=>{if(calls++===0)throw Error('offline');return new Response(JSON.stringify({message:{items:[{DOI:'10.1/a',title:['Deep learning in colorectal cancer']}]}}))};
 const result=await discover('结直肠癌；深度学习；磁共振成像',{pause:async()=>{},fetcher});assert.equal(result.items.length,1);assert.equal(result.warnings.length,1);
 await assert.rejects(discover('结直肠癌',{fetcher:async()=>{throw Error('offline')}}),/上次推荐仍会保留/);
});

test('weekly discovery respects throttling and retries rate limits',async()=>{let calls=0;const pauses=[];const result=await discover('深度学习',{pause:async ms=>pauses.push(ms),fetcher:async()=>++calls===1?new Response('',{status:429,headers:{'Retry-After':'3'}}):new Response(JSON.stringify({message:{items:[{DOI:'10.1/a',title:['Deep learning in medicine']}]}}))});assert.equal(calls,2);assert.deepEqual(pauses,[3000]);assert.equal(result.items.length,1)});

test('weekly candidates exclude retraction and correction notices',async()=>{const result=await discover('结直肠癌',{fetcher:async()=>new Response(JSON.stringify({message:{items:[{DOI:'10.1/retracted',title:['RETRACTION: Deep learning in colorectal cancer']},{DOI:'10.1/correction',title:['Correction: Rectal cancer MRI']},{DOI:'10.1/valid',title:['Rectal cancer MRI']}]}}))});assert.deepEqual(result.items.map(i=>i.doi),['10.1/valid'])});
