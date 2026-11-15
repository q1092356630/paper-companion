import path from 'node:path';
import fs from 'node:fs/promises';
import {atomicJson,readJson} from './store.mjs';
const DAY=86400000;
export function issn(value){const s=String(value||'').toUpperCase().replace(/[^0-9X]/g,'');if(!/^\d{7}[\dX]$/.test(s))return '';const sum=[...s].reduce((n,c,i)=>n+(c==='X'?10:Number(c))*(8-i),0);return sum%11?'':s.slice(0,4)+'-'+s.slice(4)}
const titleKey=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const source=s=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password?u.toString():''}catch{return ''}};
const fresh=(date,now)=>Number.isFinite(Date.parse(date))&&Date.parse(date)<=+now&&+now-Date.parse(date)<30*DAY;
function categories(values){if(!Array.isArray(values)||values.length>100)throw new Error('学科分区必须为数组');return values.map(v=>{if(!v.name||![1,2,3,4].includes(v.zone))throw new Error('学科名称或分区无效');return {name:String(v.name).slice(0,200),zone:v.zone}})}
export function validateCatalog(input,now=new Date()){
 if(input?.schema!==1||!Array.isArray(input.journals)||!input.journals.length||input.journals.length>50000)throw new Error('指标文件格式不正确，请先导出模板');
 const editions={};for(const key of ['cas','jcr']){const e=input.editions?.[key];if(!e)continue;if(!Number.isInteger(e.year)||e.year<2000||e.year>now.getFullYear()||!source(e.source)||!fresh(e.checkedAt,now)||e.latestConfirmed!==true)throw new Error(`${key.toUpperCase()} 版本须注明年份、HTTPS 来源及最近 30 天核对日期，并确认是当前最新版`);editions[key]={year:e.year,source:source(e.source),checkedAt:e.checkedAt,latestConfirmed:true}}
 const seen=new Set();const journals=input.journals.map(j=>{
  const identifiers=[...new Set((j.issns||[]).map(issn))];if(!j.journal?.trim()||!identifiers.length||identifiers.includes(''))throw new Error('每本期刊须填写全名及有效 ISSN（含校验位）');
  for(const id of identifiers){if(seen.has(id))throw new Error('指标文件含重复 ISSN：'+id);seen.add(id)}
  const row={journal:j.journal.trim().slice(0,500),issns:identifiers,...(Array.isArray(j.aliases)?{aliases:j.aliases.filter(a=>typeof a==='string').slice(0,10).map(a=>a.slice(0,500))}:{})};
  if(j.cas){if(!editions.cas||j.cas.year!==editions.cas.year)throw new Error('中科院分区年份与声明版本不一致');row.cas={year:j.cas.year,major:categories(j.cas.major||[]),minor:categories(j.cas.minor||[]),top:j.cas.top===true}}
  if(j.jcr){if(!editions.jcr||j.jcr.year!==editions.jcr.year||!Number.isInteger(j.jcr.jifYear)||j.jcr.jifYear<2000||j.jcr.jifYear>j.jcr.year||j.jcr.jif!==null&&(!Number.isFinite(j.jcr.jif)||j.jcr.jif<0))throw new Error('JCR 年份或影响因子无效');row.jcr={year:j.jcr.year,jifYear:j.jcr.jifYear,jif:j.jcr.jif,...(/^<\d+(?:\.\d+)?$/.test(j.jcr.jifDisplay||'')?{jifDisplay:j.jcr.jifDisplay}:{}),categories:categories(j.jcr.categories||[])}}
  if(!row.cas&&!row.jcr)throw new Error('期刊至少要有一类指标');return row;
 });return {schema:1,editions,journals,importedAt:now.toISOString()};
}
export function metricsFor(paper,catalog,now=new Date()){
 if(['posted-content','proceedings-article','book-chapter'].includes(paper.publicationType)||/^10\.48550\/arxiv\./i.test(paper.doi||''))return {status:'not-applicable',eligible:false,journal:paper.journal||'',reason:'当前记录为预印本、会议论文或书章，无期刊分区；正式期刊版本需单独核对。'};
 const ids=(paper.issns||[]).map(issn).filter(Boolean),rows=catalog?.journals||[];
 // With an ISSN present, never fall back to a similarly named but different journal.
 const matches=rows.filter(r=>ids.length?r.issns.some(i=>ids.includes(i)):titleKey(paper.journal)&&[r.journal,...(r.aliases||[])].some(name=>titleKey(name)===titleKey(paper.journal)));
 if(matches.length!==1)return {status:'unknown',eligible:false,journal:paper.journal||'',reason:matches.length>1?'期刊身份存在歧义，待核实':'尚无经核对的期刊指标数据'};
 const r=matches[0],casCurrent=!!r.cas&&fresh(catalog.editions.cas?.checkedAt,now)&&r.cas.year===catalog.editions.cas?.year&&catalog.editions.cas?.latestConfirmed===true,jcrCurrent=!!r.jcr&&fresh(catalog.editions.jcr?.checkedAt,now)&&r.jcr.year===catalog.editions.jcr?.year&&catalog.editions.jcr?.latestConfirmed===true;
 const eligible=casCurrent&&[...r.cas.major,...r.cas.minor].some(c=>c.zone===1);
 return {status:'matched',journal:r.journal,issns:r.issns,cas:r.cas?{...r.cas,...catalog.editions.cas,current:casCurrent}:null,jcr:r.jcr?{...r.jcr,...catalog.editions.jcr,current:jcrCurrent}:null,eligible,reason:!r.cas?'中科院分区待核实':!casCurrent?'中科院版本核对已超过 30 天，待更新':eligible?'中科院大类或小类 1 区':'中科院大类及小类均非 1 区',provenance:catalog.provenance||'用户导入的来源数据',provider:catalog.provider||'manual'};
}
export function filterWeekly(result,catalog,now=new Date()){
 if(!result)return result;const candidates=result.candidates||result.items||[];const all=candidates.map(p=>({...p,journalMetrics:metricsFor(p,catalog,now)})),items=all.filter(p=>p.journalMetrics.eligible);
 const excluded=all.length-items.length;const unknown=all.filter(p=>!p.journalMetrics.eligible&&(!p.journalMetrics.cas?.current)).length;
 return {...result,items,candidates:undefined,aiBrief:excluded?'':result.aiBrief,brief:`仅推荐中科院大类或任一小类 1 区：${all.length} 篇主题候选中，${items.length} 篇通过；${excluded} 篇未通过，其中 ${unknown} 篇分区缺失、待更新或不适用。`,journalFilter:{policy:'cas-major-or-minor-zone-1',excluded,unknown,checkedAt:now.toISOString()}};
}
export class JournalMetrics{
 constructor(root,fetcher=fetch){this.root=root;this.fetcher=fetcher;this.pending=new Map();this.catalogCache=new Map();this.syncing=null;this.lastAttempt=0;this.lastError=''}
 async cachedCatalog(name){const file=path.join(this.root,name);let stat;try{stat=await fs.stat(file)}catch(e){if(e.code==='ENOENT')return null;throw e}const cached=this.catalogCache.get(file);if(cached?.mtime===stat.mtimeMs)return cached.value;const value=await readJson(file,null);this.catalogCache.set(file,{mtime:stat.mtimeMs,value});return value}
 async catalog(){return await this.cachedCatalog('journal-metrics.json')||await this.cachedCatalog('journal-community.json')}
 async sync(force=false){
  if(this.syncing)return this.syncing;const previous=await this.cachedCatalog('journal-community.json');
  if(!force&&(previous&&Date.now()-Date.parse(previous.upstream.checkedAt)<7*DAY||Date.now()-this.lastAttempt<3600000))return this.status();
  this.lastAttempt=Date.now();this.syncing=(async()=>{try{const {downloadCommunity}=await import('./journal-community.mjs');const next=await downloadCommunity({fetcher:this.fetcher,previous});await atomicJson(path.join(this.root,'journal-community.json'),next);this.catalogCache.clear();this.lastError='';return await this.status()}catch(e){this.lastError=e.message;throw e}})();try{return await this.syncing}finally{this.syncing=null}
 }
 async import(input){const catalog=validateCatalog(input);await atomicJson(path.join(this.root,'journal-metrics.json'),catalog);return {count:catalog.journals.length,editions:catalog.editions}}
 async status(){const c=await this.catalog();return {count:c?.journals.length||0,editions:c?.editions||{},provider:c?.provider||'manual',upstream:c?.upstream||null,error:this.lastError,stale:!!c&&Object.values(c.editions).some(e=>!fresh(e.checkedAt,new Date()))}}
 async identity(paper){
  if(!/^10\.\d{4,9}\/\S+$/i.test(paper.doi||'')||/^10\.48550\/arxiv\./i.test(paper.doi)||paper.issns?.length)return paper;
  const doi=paper.doi.toLowerCase();if(!this.pending.has(doi))this.pending.set(doi,this.lookup(doi));return {...paper,...await this.pending.get(doi)};
 }
 async lookup(doi){
  const {createHash}=await import('node:crypto');const file=path.join(this.root,'journal-identities',createHash('sha256').update(doi).digest('hex')+'.json');const cached=await readJson(file,null);const weekly=await readJson(path.join(this.root,'weekly.json'),null);const known=(weekly?.candidates||weekly?.items||[]).find(p=>p.doi?.toLowerCase()===doi);const fallback=cached?.metadata||(known?{journal:known.journal||'',issns:known.issns||[],publicationType:known.publicationType||'journal-article'}:{});if(cached&&fresh(cached.checkedAt,new Date()))return cached.metadata;
  try{const response=await this.fetcher('https://api.crossref.org/works/'+encodeURIComponent(doi),{signal:AbortSignal.timeout(8000)});if(!response.ok)return fallback;const m=(await response.json()).message;if(m?.DOI?.toLowerCase()!==doi)return {};const metadata={journal:m['container-title']?.[0]||'',issns:(m.ISSN||[]).map(issn).filter(Boolean),publicationType:m.type||''};await atomicJson(file,{checkedAt:new Date().toISOString(),metadata});return metadata}catch{return fallback}
 }
 async decorate(paper){const p=await this.identity(paper);return {...p,journalMetrics:metricsFor(p,await this.catalog())}}
 async weekly(result){if(!result)return result;const candidates=await Promise.all((result.candidates||result.items||[]).map(p=>this.identity(p)));return filterWeekly({...result,candidates},await this.catalog())}
}
export const catalogTemplate={schema:1,instructions:'填写有权使用的数据。editions 分别记录中科院版本年和 JCR 发布年，checkedAt 是核对当前最新版的日期（ISO 8601，含时区）。核对后将 latestConfirmed 改为 true；每 30 天重新核对。JCR.categories 填 Q1–Q4 对应数字，切勿填写中科院小类分区。缺失指标请删除对应 cas/jcr 字段，不能填 0 代替缺失。示例为占位符，不代表真实指标。导入会替换整个指标表。',editions:{cas:{year:null,source:'https://www.fenqubiao.com/',checkedAt:'',latestConfirmed:false},jcr:{year:null,source:'https://jcr.clarivate.com/',checkedAt:'',latestConfirmed:false}},journals:[{journal:'填写期刊全名',issns:['填写 ISSN'],cas:{year:null,major:[{name:'大类学科',zone:null}],minor:[{name:'小类学科',zone:null}],top:false},jcr:{year:null,jifYear:null,jif:null,categories:[{name:'JCR 学科',zone:null}]}}]};
