import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createTranslationBridge} from '../desktop/translation-bridge.mjs';

const config={provider:'codex',model:'fixture',baseUrl:'codex://local'};
const ask=(bridge,text,extra={})=>fetch(bridge.baseUrl+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+bridge.key,'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:text}],...extra})});
test('layout bridge batches isolated requests, resumes after idle and persists valid cache',async()=>{
 const cacheDir=await fs.mkdtemp(path.join(os.tmpdir(),'paper-bridge-test-'));let calls=0;
 const complete=async(_config,messages)=>{calls++;const {requests}=JSON.parse(messages[1].content);return {responses:requests.map(r=>({id:r.id,text:'翻译 '+r.messages[0].content}))}};
 const bridge=await createTranslationBridge(config,{cacheDir,complete,batchDelay:10});
 try{
  const responses=await Promise.all([ask(bridge,'alpha'),ask(bridge,'beta')]);
  assert.equal(calls,1);assert.deepEqual(await Promise.all(responses.map(async r=>(await r.json()).choices[0].message.content)),['翻译 alpha','翻译 beta']);
  await ask(bridge,'alpha');assert.equal(calls,1);
  const third=await ask(bridge,'gamma');assert.equal(third.status,200);assert.equal(calls,2);
  const unauthorized=await fetch(bridge.baseUrl+'/chat/completions',{method:'POST',body:'{}'});assert.equal(unauthorized.status,401);
  assert.equal((await ask(bridge,'stream',{stream:true})).status,400);
 }finally{await bridge.close();await fs.rm(cacheDir,{recursive:true,force:true})}
});
test('layout bridge rejects missing replies and invalid JSON without success or cache',async()=>{
 const cacheDir=await fs.mkdtemp(path.join(os.tmpdir(),'paper-bridge-test-'));
 const bridge=await createTranslationBridge(config,{cacheDir,batchDelay:1,complete:async(_c,m)=>({responses:JSON.parse(m[1].content).requests.map(r=>({id:r.id,text:'not json'}))})});
 try{assert.equal((await ask(bridge,'json',{response_format:{type:'json_object'}})).status,502);assert.deepEqual(await fs.readdir(cacheDir),[])}finally{await bridge.close();await fs.rm(cacheDir,{recursive:true,force:true})}
 const missing=await createTranslationBridge(config,{batchDelay:1,complete:async()=>({responses:[]})});try{assert.equal((await ask(missing,'one')).status,502)}finally{await missing.close()}
});
test('layout cancellation aborts the model and answers waiting callers',async()=>{
 const control=new AbortController();let began;
 const started=new Promise(resolve=>began=resolve);
 const bridge=await createTranslationBridge(config,{signal:control.signal,batchDelay:1,complete:(_c,_m,{signal})=>new Promise((_resolve,reject)=>{began();signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true})})});
 try{const request=ask(bridge,'long');await started;control.abort();assert.equal((await request).status,502)}finally{await bridge.close()}
});
test('an exhausted engine retry cannot be mistaken for complete translation',async()=>{
 let fail=true;
 const bridge=await createTranslationBridge(config,{batchDelay:1,complete:async(_c,m)=>{if(fail)throw Error('offline');return {responses:JSON.parse(m[1].content).requests.map(r=>({id:r.id,text:'译文'}))}}});
 try{assert.equal((await ask(bridge,'paragraph')).status,502);assert.throws(()=>bridge.assertComplete(),/部分段落/);fail=false;assert.equal((await ask(bridge,'paragraph')).status,200);bridge.assertComplete()}finally{await bridge.close()}
});

test('malformed nested JSON retries only the bad request and caches the successful neighbours',async()=>{
 const cacheDir=await fs.mkdtemp(path.join(os.tmpdir(),'paper-bridge-repair-')),calls=[],events=[];
 let release;const repairReady=new Promise(resolve=>release=resolve);
 const complete=async(actualConfig,messages)=>{
  assert.equal(actualConfig,config);const {requests}=JSON.parse(messages[1].content);calls.push(requests.map(r=>r.messages[0].content));
  if(calls.length===2){assert.match(messages[0].content,/上一次/);await repairReady}
  return {responses:requests.map(r=>({id:r.id,text:r.messages[0].content==='bad'&&calls.length===1?'{} trailing data':JSON.stringify({responses:[{id:0,output:'中文 '+r.messages[0].content}]})}))};
 };
 const bridge=await createTranslationBridge(config,{cacheDir,complete,batchDelay:10,notify:e=>events.push(e)});
 try{
  const good=ask(bridge,'good',{response_format:{type:'json_object'}}),bad=ask(bridge,'bad',{response_format:{type:'json_object'}});
  assert.equal((await good).status,200);assert.equal((await fs.readdir(cacheDir)).length,1);
  release();assert.equal((await bad).status,200);assert.deepEqual(calls,[['good','bad'],['bad']]);
  bridge.assertComplete();assert.equal((await fs.readdir(cacheDir)).length,2);assert.ok(events.some(e=>/重试/.test(e.stage)));
  assert.equal((await ask(bridge,'bad',{response_format:{type:'json_object'}})).status,200);assert.equal(calls.length,2);
 }finally{release();await bridge.close();await fs.rm(cacheDir,{recursive:true,force:true})}
});

test('exhausted format repair is bounded and does not discard other completed responses',async()=>{
 let calls=0;const bridge=await createTranslationBridge(config,{batchDelay:10,complete:async(_c,m)=>{
  calls++;return {responses:JSON.parse(m[1].content).requests.filter(r=>r.messages[0].content!=='missing').map(r=>({id:r.id,text:'中文译文'}))};
 }});
 try{
  const [good,bad]=await Promise.all([ask(bridge,'good'),ask(bridge,'missing')]);assert.equal(good.status,200);assert.equal(bad.status,502);
  assert.equal(calls,2);assert.throws(()=>bridge.assertComplete(),/译文回复缺失/);
 }finally{await bridge.close()}
});

test('BabelDOC JSON arrays remain valid even when its transport requests json_object mode',async()=>{
 let calls=0;const text=JSON.stringify([{id:0,output:'中文译文 {v1}'}]);
 const bridge=await createTranslationBridge(config,{batchDelay:1,complete:async(_c,m)=>{calls++;return {responses:JSON.parse(m[1].content).requests.map(r=>({id:r.id,text}))}}});
 try{const response=await ask(bridge,'Return a JSON array',{response_format:{type:'json_object'}});assert.equal(response.status,200);assert.equal((await response.json()).choices[0].message.content,text);assert.equal(calls,1);bridge.assertComplete()}finally{await bridge.close()}
});
