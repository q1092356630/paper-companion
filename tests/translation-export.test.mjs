import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {translatedPdfSources,exportTranslationPdf} from '../desktop/translation-export.mjs';
import {layoutRuntime} from '../desktop/layout.mjs';

const exec=promisify(execFile);
async function setup(t){
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'translation-export-test-'));
 t.after(()=>fs.rm(folder,{recursive:true,force:true}));
 const root=path.join(folder,'Library'),id='1234567890abcdef12345678';
 await fs.mkdir(path.join(root,'translations',id),{recursive:true});
 const doc={id,title:'中文译文测试',pages:[{width:612,height:792},{width:842,height:595}],translations:{}};
 for(const n of [2,1]){const file=`translations/${id}/page-${n}.pdf`;doc.translations[n]={file};await fs.writeFile(path.join(root,file),'placeholder')}
 return {root,doc,folder,destination:path.join(folder,'中文译文.pdf')};
}

test('export requires every saved PDF page and reports missing or text-only pages',async t=>{
 const {root,doc}=await setup(t);
 assert.deepEqual((await translatedPdfSources(root,doc)).map(p=>path.basename(p)),['page-1.pdf','page-2.pdf']);
 doc.pages.push({width:612,height:792});doc.translations[2]={text:'流畅译文'};
 await assert.rejects(translatedPdfSources(root,doc),/1\/3 页.*第 2–3 页/);
 await fs.rm(path.join(root,doc.translations[1].file));
 await assert.rejects(translatedPdfSources(root,doc),/0\/3 页.*第 1–3 页/);
});

test('export rejects escaped translation paths and protects library PDFs from overwrite',async t=>{
 const {root,doc,folder}=await setup(t);
 const original=doc.translations[1].file;
 doc.translations[1].file='../outside.pdf';
 await assert.rejects(translatedPdfSources(root,doc),/路径无效/);
 const external=path.join(folder,'outside.pdf');await fs.writeFile(external,'source');
 await fs.rm(path.join(root,original));await fs.symlink(external,path.join(root,original));doc.translations[1].file=original;
 await assert.rejects(translatedPdfSources(root,doc),/路径无效/);
 await fs.rm(path.join(root,original));await fs.writeFile(path.join(root,original),'saved');
 await assert.rejects(exportTranslationPdf({root,doc,destination:path.join(root,original)}),/以免覆盖/);
 assert.equal(await fs.readFile(path.join(root,original),'utf8'),'saved');
});

test('failed or incomplete export preserves an existing destination and cleans temporary files',async t=>{
 const {root,doc,destination,folder}=await setup(t);await fs.writeFile(destination,'existing export');
 let temporary;
 await assert.rejects(exportTranslationPdf({root,doc,destination,worker:async request=>{temporary=request.output;return {pdf:path.join(temporary,'translated.pdf'),pageCount:1}}}),/不完整/);
 assert.equal(await fs.readFile(destination,'utf8'),'existing export');
 await assert.rejects(fs.access(temporary));
 assert.deepEqual((await fs.readdir(folder)).sort(),['Library','中文译文.pdf']);
});

test('real PDF merge retains page order, dimensions, selectable text and exact rendered content',async t=>{
 const runtime=await layoutRuntime();if(!runtime.available)return t.skip('Packaged PDF runtime not available');
 const {root,doc,destination}=await setup(t),inputs=await translatedPdfSources(root,doc);
 await exec(runtime.python,['-c',`import pymupdf,sys
for n,file in enumerate(sys.argv[1:],1):
    with pymupdf.open() as doc:
        p=doc.new_page(width=612 if n==1 else 842,height=792 if n==1 else 595)
        p.insert_text((50,70),'Page %s: alpha = 42'%n)
        p.insert_text((50,95),'中文翻译保留公式和图表',fontname='china-s')
        p.draw_rect(pymupdf.Rect(50,120,200,220),color=(0.1,0.3,0.8),fill=(0.8,0.9,1))
        doc.save(file)
`,...inputs]);
 const snapshot=JSON.stringify(doc);
 assert.deepEqual(await exportTranslationPdf({root,doc,destination,runtime}),{pageCount:2});
 assert.equal(JSON.stringify(doc),snapshot);
 const result=await exec(runtime.python,['-c',`import pymupdf,sys
with pymupdf.open(sys.argv[1]) as merged:
    assert len(merged)==2
    for i,file in enumerate(sys.argv[2:]):
        with pymupdf.open(file) as source:
            assert merged[i].rect==source[0].rect
            assert merged[i].get_text()==source[0].get_text()
            assert merged[i].get_pixmap().samples==source[0].get_pixmap().samples
print('exact match')
`,destination,...inputs]);assert.match(result.stdout,/exact match/);
 // A corrupt source must never replace the successfully exported file.
 const before=await fs.readFile(destination);await fs.writeFile(inputs[1],'broken PDF');
 await assert.rejects(exportTranslationPdf({root,doc,destination,runtime}),/第 2 页/);
 assert.deepEqual(await fs.readFile(destination),before);
});
