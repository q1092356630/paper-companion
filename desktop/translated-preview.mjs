import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {translatedPdfSources,exportTranslationPdf} from './translation-export.mjs';

export async function translatedPreview({root,doc,cache,runtime,exporter=exportTranslationPdf}){
 const files=await translatedPdfSources(root,doc);
 const signatures=await Promise.all(files.map(async file=>{const stat=await fs.stat(file);return [file,stat.size,stat.mtimeMs]}));
 const hash=createHash('sha256').update(JSON.stringify({title:doc.title,pages:doc.pages.map(p=>[p.width,p.height]),signatures})).digest('hex').slice(0,24);
 const folder=path.join(cache,doc.id,hash);await fs.mkdir(folder,{recursive:true});
 const title=String(doc.title||'文献').replace(/[\x00-\x1f\\/:*?"<>|]/g,'-').slice(0,100);
 const destination=path.join(folder,title+' - 中文译文.pdf');
 try{const file=await fs.open(destination,'r');try{const bytes=Buffer.alloc(5);await file.read(bytes,0,5,0);if(bytes.toString()==='%PDF-')return destination}finally{await file.close()}}catch(error){if(error.code!=='ENOENT')throw error}
 await exporter({root,doc,destination,runtime});return destination;
}
