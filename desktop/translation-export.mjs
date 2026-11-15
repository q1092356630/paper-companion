import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {runPDFWorker} from './layout.mjs';

const inside=(file,directory)=>file.startsWith(directory+path.sep);
function pageRanges(pages){
 const ranges=[];
 for(let i=0;i<pages.length;i++){const first=pages[i];while(pages[i+1]===pages[i]+1)i++;ranges.push(first===pages[i]?String(first):`${first}–${pages[i]}`)}
 return ranges.join('、');
}

export async function translatedPdfSources(root,doc){
 if(!/^[a-f0-9]{24}$/.test(doc.id)||!Array.isArray(doc.pages)||!doc.pages.length)throw new Error('请先完成 PDF 解析和全文翻译');
 const library=await fs.realpath(root),allowed=path.join(library,'translations',doc.id),inputs=[],missing=[];
 for(let number=1;number<=doc.pages.length;number++){
  const relative=doc.translations?.[number]?.file;
  if(!relative){missing.push(number);continue}
  const file=path.resolve(library,relative);
  if(!inside(file,allowed))throw new Error(`第 ${number} 页的译文路径无效`);
  try{
   const actual=await fs.realpath(file);
   if(!inside(actual,allowed))throw new Error(`第 ${number} 页的译文路径无效`);
   const info=await fs.stat(actual);
   if(!info.isFile()||info.size===0){missing.push(number);continue}
   inputs.push(actual);
  }catch(error){if(error.code==='ENOENT')missing.push(number);else throw error}
 }
 if(missing.length)throw new Error(`译文尚不完整（${doc.pages.length-missing.length}/${doc.pages.length} 页），缺少第 ${pageRanges(missing)} 页。请先点击「翻译全文」补齐后再导出。`);
 return inputs;
}

export async function exportTranslationPdf({root,doc,destination,runtime,worker=runPDFWorker}){
 const inputs=await translatedPdfSources(root,doc);
 const library=await fs.realpath(root),folder=await fs.realpath(path.dirname(destination));
 let existing;
 try{existing=await fs.realpath(destination)}catch(error){if(error.code!=='ENOENT')throw error}
 if(folder===library||inside(folder,library)||existing&&(existing===library||inside(existing,library)))throw new Error('请导出到文库数据文件夹以外的位置，以免覆盖原文或译文');
 const output=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'paper-translation-export-')));
 const pending=path.join(folder,`.paper-export-${randomUUID()}.pdf`);
 try{
  const result=await worker({operation:'merge-translations',inputs,output,title:doc.title,pages:doc.pages.map(p=>({width:p.width,height:p.height}))},{runtime});
  if(result.pageCount!==inputs.length||typeof result.pdf!=='string'||path.resolve(result.pdf)!==path.join(output,'translated.pdf'))throw new Error('译文 PDF 导出结果不完整');
  const bytes=await fs.readFile(result.pdf);
  if(bytes.length<100||!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))throw new Error('译文 PDF 文件无效');
  await fs.writeFile(pending,bytes,{flag:'wx'});
  await fs.rename(pending,path.join(folder,path.basename(destination)));
  return {pageCount:inputs.length};
 }finally{await fs.rm(pending,{force:true});await fs.rm(output,{recursive:true,force:true})}
}
