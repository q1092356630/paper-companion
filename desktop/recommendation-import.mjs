import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';

export function normalizedDoi(value){return String(value||'').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').toLowerCase()}
export async function publicPdfUrl(value,resolve=lookup){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||!url.hostname.includes('.')||isIP(url.hostname)||url.hostname.endsWith('.local'))throw new Error('文献下载地址无效');
 const addresses=await resolve(url.hostname,{all:true});
 if(!addresses.length||addresses.some(({address})=>address.includes(':')?/^(::|fc|fd|fe[89ab])/i.test(address):/^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|22[4-9]\.|23\d\.)/.test(address)))throw new Error('文献下载地址不能指向本机或内网');
 return url.toString();
}
async function boundedBytes(response,maximum){
 if(Number(response.headers.get('content-length'))>maximum){await response.body?.cancel();throw new Error('文献文件过大')}
 const reader=response.body?.getReader();if(!reader)throw new Error('下载内容为空');
 const chunks=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>maximum)throw new Error('文献文件过大');chunks.push(value)}}catch(error){await reader.cancel();throw error}finally{reader.releaseLock()}
 return Buffer.concat(chunks,size);
}
export async function fetchPublic(value,{fetcher=fetch,validate=publicPdfUrl,signal,maximum=100*1024*1024}={}){
 let next=value;
 for(let redirects=0;redirects<6;redirects++){
  next=await validate(next);
  const response=await fetcher(next,{redirect:'manual',credentials:'omit',signal:signal||AbortSignal.timeout(25000),headers:{Accept:'application/pdf,application/json,text/html;q=0.8','User-Agent':'PaperCompanion/0.2 desktop literature reader'}});
  if([301,302,303,307,308].includes(response.status)){const target=response.headers.get('location');await response.body?.cancel();if(!target)throw new Error('下载地址重定向无效');next=new URL(target,next).toString();continue}
  if(!response.ok){await response.body?.cancel();throw new Error(`下载服务返回 ${response.status}`)}
  return {bytes:await boundedBytes(response,maximum),url:next};
 }
 throw new Error('下载地址重定向过多');
}
export function landingPdfLinks(bytes,base){
 const html=bytes.toString('utf8'),links=[];
 const decode=value=>value.replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));
 for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){
  const attrs=Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(m=>[m[1].toLowerCase(),m[2]]));
  if(['citation_pdf_url','wkhealth_pdf_url'].includes((attrs.name||'').toLowerCase())&&attrs.content){try{links.push(new URL(decode(attrs.content),base).toString())}catch{}}
 }
 return [...new Set(links)].slice(0,3);
}
export async function downloadRecommendation(item,{fetcher=fetch,validate=publicPdfUrl,signal=AbortSignal.timeout(90000)}={}){
 const doi=normalizedDoi(item.doi);if(!/^10\.\d{4,9}\/\S+$/.test(doi))throw new Error('推荐文献的 DOI 无效');
 const options={fetcher,validate,signal},candidates=[];
 const arxiv=doi.match(/^10\.48550\/arxiv\.(\d{4}\.\d{4,5}(?:v\d+)?)$/i);
 if(arxiv)candidates.push('https://arxiv.org/pdf/'+arxiv[1]);
 const lookupResults=await Promise.allSettled([
  fetchPublic('https://api.crossref.org/works/'+encodeURIComponent(doi),{...options,maximum:3*1024*1024}).then(r=>{const item=JSON.parse(r.bytes).message;return (item?.link||[]).filter(l=>l['content-type']==='application/pdf').map(l=>l.URL)}),
  fetchPublic('https://www.ebi.ac.uk/europepmc/webservices/rest/search?'+new URLSearchParams({query:'DOI:"'+doi+'"',format:'json',resultType:'core',pageSize:'1'}),{...options,maximum:3*1024*1024}).then(r=>{const match=JSON.parse(r.bytes).resultList?.result?.[0];if(!match||normalizedDoi(match.doi)!==doi)return [];return (match.fullTextUrlList?.fullTextUrl||[]).filter(u=>u.documentStyle==='pdf'&&/^(oa|free)$/i.test(u.availabilityCode||'')).map(u=>u.url)})
 ]);
 for(const result of lookupResults)if(result.status==='fulfilled')candidates.push(...result.value);
 const landing='https://doi.org/'+encodeURIComponent(doi);candidates.push(landing);
 const seen=new Set();let reason='未找到可直接下载的公开 PDF';
 while(candidates.length&&seen.size<8){
  const url=candidates.shift();if(!url||seen.has(url))continue;seen.add(url);
  try{
   const result=await fetchPublic(url,options);
   if(result.bytes.length>100&&result.bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))return {...result,doi};
   candidates.push(...landingPdfLinks(result.bytes,result.url));
  }catch(error){reason=error.message;if(signal.aborted)break}
 }
 const error=new Error('未能取得可直接阅读的 PDF。可能需要机构权限，或下载服务暂不可用。');error.code='PDF_UNAVAILABLE';error.detail=reason;throw error;
}
export async function importRecommendedPdf(store,item,file){
 const doc=await store.importPdf(file,{title:item.title,doi:normalizedDoi(item.doi),authors:item.authors||'',journal:item.journal||'',issns:item.issns||[],publicationType:item.publicationType||'',recommendation:{doi:normalizedDoi(item.doi),addedAt:new Date().toISOString()}});
 // Identical local PDFs keep their notes and card; fill only missing metadata.
 if(!doc.doi)return store.patch(doc.id,{doi:normalizedDoi(item.doi),recommendation:{doi:normalizedDoi(item.doi),addedAt:new Date().toISOString()}});
 return doc;
}
export async function addRecommendation(store,item,options={}){
 const doi=normalizedDoi(item.doi),existing=(await store.list()).find(d=>normalizedDoi(d.doi)===doi);
 if(existing)return store.get(existing.id);
 const downloaded=await downloadRecommendation(item,options),folder=await fs.mkdtemp(path.join(os.tmpdir(),'paper-recommendation-'));
 try{const file=path.join(folder,'paper.pdf');await fs.writeFile(file,downloaded.bytes);return await importRecommendedPdf(store,item,file)}finally{await fs.rm(folder,{recursive:true,force:true})}
}
