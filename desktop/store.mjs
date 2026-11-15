import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

export async function atomicJson(file,value){
  await fs.mkdir(path.dirname(file),{recursive:true});
  const tmp=`${file}.${randomUUID()}.tmp`;
  try{await fs.writeFile(tmp,JSON.stringify(value,null,2),{mode:0o600});await fs.rename(tmp,file)}catch(e){await fs.rm(tmp,{force:true});throw e}
}
export async function readJson(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'))}catch(e){if(e.code==='ENOENT')return fallback;throw new Error('本地记录读取失败，请保留资料库并检查磁盘文件。')}}
export function validId(id){if(typeof id!=='string'||!/^[a-f0-9]{24}$/.test(id))throw new Error('无效的文献编号');return id}
export class LibraryStore{
  constructor(root){this.root=root;this.queue=Promise.resolve();this.onChange=()=>{}}
  transaction(fn){const work=this.queue.then(fn);this.queue=work.catch(()=>{});return work}
  async init(){await fs.mkdir(path.join(this.root,'papers'),{recursive:true})}
  file(id){return path.join(this.root,'papers',validId(id)+'.pdf')}
  record(id){return path.join(this.root,'papers',validId(id)+'.json')}
  async list({deleted=false}={}){const names=await fs.readdir(path.join(this.root,'papers'));const docs=await Promise.all(names.filter(n=>/^[a-f0-9]{24}\.json$/.test(n)).map(n=>readJson(path.join(this.root,'papers',n),null)));return docs.filter(d=>d&&!!d.deletedAt===deleted).map(({pages,translations,messages,notes,card,...rest})=>({...rest,hasCard:!!card,questions:messages?.filter(m=>m.role==='user').length||0})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))}
  async get(id){const doc=await readJson(this.record(id),null);if(!doc)throw new Error('找不到这篇文献');return doc}
  async trash(id){return this.update(id,doc=>({deletedAt:doc.deletedAt||new Date().toISOString()}))}
  async restore(id){return this.update(id,doc=>{if(doc.purgePending)throw new Error('这篇文献的永久清除尚未完成，请在回收站重试清除');return {deletedAt:null}})}
  async addNote(id,note){return this.update(id,doc=>{
    if(!Number.isInteger(note.page)||note.page<1||note.page>doc.pages.length)throw new Error('来源页码无效');
    const text=String(note.text||'').slice(0,8000),comment=String(note.comment||'').slice(0,8000);
    if(!text.trim()&&!comment.trim())throw new Error('标注或笔记不能为空');
    const entry={id:randomUUID(),page:note.page,text,comment,language:note.language==='zh'?'zh':'en'};
    if(note.color){
      if(!['yellow','green','blue','pink'].includes(note.color))throw new Error('标注颜色无效');
      if(!Array.isArray(note.rects)||!note.rects.length||note.rects.length>300||note.rects.some(r=>!['x','y','width','height'].every(k=>Number.isFinite(r[k])&&r[k]>=0&&r[k]<=1)||r.width<=0||r.height<=0||r.x+r.width>1.002||r.y+r.height>1.002))throw new Error('标注位置无效，请重新选中文字');
      entry.color=note.color;entry.rects=note.rects.map(({x,y,width,height})=>({x,y,width,height}));
      if(entry.language==='zh')entry.translationFile=doc.translations[note.page]?.file||null;
    }
    return {notes:[...doc.notes,entry]};
  })}
  async removeNote(id,noteId){return this.update(id,doc=>{if(!doc.notes.some(n=>n.id===noteId))throw new Error('找不到这条标注');return {notes:doc.notes.filter(n=>n.id!==noteId)}})}
  async importPdf(file,metadata={}){
    const stat=await fs.stat(file);if(stat.size>100*1024*1024)throw new Error('单个 PDF 请小于 100 MB');
    const bytes=await fs.readFile(file);if(!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))throw new Error('文件不是有效的 PDF');
    const id=createHash('sha256').update(bytes).digest('hex').slice(0,24);
    return this.transaction(async()=>{const existing=await readJson(this.record(id),null);if(existing){if(existing.purgePending)throw new Error('这篇文献的永久清除尚未完成，请先在回收站重试清除');if(existing.deletedAt||(metadata.zotero&&!existing.zotero)){const linked={...existing,...(metadata.zotero&&!existing.zotero?metadata:{}),deletedAt:null,updatedAt:new Date().toISOString()};await atomicJson(this.record(id),linked);this.onChange(id);return linked}return existing;}await fs.writeFile(this.file(id),bytes,{mode:0o600});const now=new Date().toISOString();const doc={id,title:metadata.title||path.basename(file,'.pdf'),doi:metadata.doi||'',authors:metadata.authors||'',journal:metadata.journal||'',issns:metadata.issns||[],publicationType:metadata.publicationType||'',zotero:metadata.zotero||null,recommendation:metadata.recommendation||null,addedAt:now,updatedAt:now,page:1,status:'reading',pages:[],translations:{},messages:[],notes:[],card:null};await atomicJson(this.record(id),doc);this.onChange(id);return doc})
  }
  async patch(id,patch){return this.transaction(async()=>{const doc=await this.get(id);const next={...doc,...patch,id:doc.id,updatedAt:new Date().toISOString()};await atomicJson(this.record(id),next);this.onChange(id);return next})}
  async update(id,fn){return this.transaction(async()=>{const doc=await this.get(id);const next={...doc,...await fn(doc),id:doc.id,updatedAt:new Date().toISOString()};await atomicJson(this.record(id),next);this.onChange(id);return next})}
}
