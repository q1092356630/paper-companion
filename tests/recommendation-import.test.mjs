import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {addRecommendation,downloadRecommendation,fetchPublic,publicPdfUrl,landingPdfLinks} from '../desktop/recommendation-import.mjs';
import {LibraryStore} from '../desktop/store.mjs';
const item={doi:'10.1234/example',title:'推荐论文',authors:'Author'};
const pdf=Buffer.from('%PDF-1.4\n'+'public paper '.repeat(50));
const validate=async value=>value;
test('recommended public PDF imports with metadata and repeated clicks reuse the same record',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'recommended-import-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new LibraryStore(root);await store.init();let downloads=0;
 const fetcher=async url=>{if(url.includes('api.crossref.org'))return Response.json({message:{link:[{'content-type':'application/pdf',URL:'https://publisher.example/paper.pdf'}]}});if(url.includes('europepmc'))return Response.json({resultList:{result:[]}});downloads++;return new Response(pdf)};
 const doc=await addRecommendation(store,item,{fetcher,validate});assert.equal(doc.doi,item.doi);assert.equal(doc.title,item.title);assert.equal(doc.recommendation.doi,item.doi);assert.ok(doc.recommendation.addedAt);assert.deepEqual(await fs.readFile(store.file(doc.id)),pdf);
 await store.patch(doc.id,{notes:[{comment:'my note'}],card:{savedAt:'2026-09-28'},status:'complete'});
 const again=await addRecommendation(store,item,{fetcher,validate});assert.equal(downloads,1);assert.equal(again.id,doc.id);assert.equal(again.notes[0].comment,'my note');assert.equal(again.status,'complete');
});
test('publisher landing metadata follows the actual PDF link; HTML is never imported as PDF',async()=>{
 assert.deepEqual(landingPdfLinks(Buffer.from('<meta content="/paper.pdf?a=1&amp;b=2" name="citation_pdf_url">'),'https://publisher.example/a'),['https://publisher.example/paper.pdf?a=1&b=2']);
 const fetcher=async url=>url.includes('api.crossref.org')?Response.json({message:{}}):url.includes('europepmc')?Response.json({resultList:{result:[]}}):url.includes('/paper.pdf')?new Response(pdf):new Response('<meta name="citation_pdf_url" content="https://publisher.example/paper.pdf">');
 const downloaded=await downloadRecommendation(item,{fetcher,validate});assert.deepEqual(downloaded.bytes,pdf);
 await assert.rejects(downloadRecommendation(item,{fetcher:async()=>new Response('<html>Institutional access required</html>'),validate}),e=>e.code==='PDF_UNAVAILABLE');
});
test('download rejects private addresses and validates redirects before fetching',async()=>{
 for(const url of ['http://publisher.example/a','https://127.0.0.1/a','https://localhost/a','https://name:secret@publisher.example/a'])await assert.rejects(publicPdfUrl(url,async()=>[{address:'8.8.8.8'}]),/无效/);
 await assert.rejects(publicPdfUrl('https://publisher.example/a',async()=>[{address:'192.168.0.2'}]),/内网/);
 let calls=0;await assert.rejects(fetchPublic('https://publisher.example/a',{fetcher:async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://127.0.0.1/internal'}})},validate:value=>publicPdfUrl(value,async()=>[{address:'8.8.8.8'}])}),/无效/);assert.equal(calls,1);
 await assert.rejects(fetchPublic('https://publisher.example/a',{fetcher:async()=>new Response('too large',{headers:{'content-length':'1000'}}),validate,maximum:20}),/过大/);
});
