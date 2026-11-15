import {createHash} from 'node:crypto';
import {issn,validateCatalog} from './journal-metrics.mjs';
export const repository='https://github.com/hitfyd/ShowJCR';
const api='https://api.github.com/repos/hitfyd/ShowJCR';
export const journalKey=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function parseCsv(text){
 const rows=[];let row=[],cell='',quoted=false;text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else if(quoted||!cell)quoted=!quoted;else throw Error('CSV 引号无效')}else if(c===','&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell=''}else cell+=c}
 if(quoted)throw Error('CSV 引号未闭合');if(cell||row.length){row.push(cell);rows.push(row)}
 const headers=rows.shift();if(!headers||new Set(headers).size!==headers.length)throw Error('CSV 表头无效');
 return rows.map(r=>{if(r.length!==headers.length)throw Error('CSV 列数不匹配');return Object.fromEntries(headers.map((h,i)=>[h,r[i].trim()]))});
}
const identifiers=(...values)=>[...new Set(values.flatMap(v=>String(v||'').split(/[\/;,\s]+/)).map(issn).filter(Boolean))];
const zone=v=>{const m=String(v||'').match(/^(?:Q)?([1-4])(?:\s|$)/);return m?Number(m[1]):null};
export function convertCommunity({casText,jcrText,casYear,jifYear,commit,now=new Date()}){
 const casRows=parseCsv(casText),jcrRows=parseCsv(jcrText);if(!casRows[0]?.['ISSN/EISSN']||!Object.hasOwn(jcrRows[0]||{},`IF(${jifYear})`))throw Error('上游表结构改变，保留之前的数据');
 const rows=[],byIssn=new Map(),byName=new Map();let skipped=0;
 const add=r=>{rows.push(r);for(const id of r.issns){const set=byIssn.get(id)||new Set();set.add(r);byIssn.set(id,set)}const k=journalKey(r.journal);const set=byName.get(k)||new Set();set.add(r);byName.set(k,set)};
 for(const c of casRows){const ids=identifiers(c['ISSN/EISSN']),majorZone=zone(c['大类分区']);if(!ids.length||!c.Journal||String(c['年份'])!==String(casYear)||!majorZone||!c['大类']){skipped++;continue}const minor=[];for(let n=1;n<=20;n++){const z=zone(c[`小类${n}分区`]);if(z&&c[`小类${n}`])minor.push({name:c[`小类${n}`],zone:z})}add({journal:c.Journal,issns:ids,cas:{year:casYear,major:[{name:c['大类'],zone:majorZone}],minor,top:c.Top==='是'}})}
 for(const j of jcrRows){const ids=identifiers(j.ISSN,j.EISSN);if(!ids.length||!j.Journal){skipped++;continue}const matches=new Set(ids.flatMap(id=>[...(byIssn.get(id)||[])]));let r;if(matches.size===1)r=[...matches][0];else if(matches.size>1){skipped++;continue}
  if(r?.jcr){skipped++;continue}const cats=[];for(let n=1;n<=20;n++){const z=zone(j[`IF Quartile(${jifYear})_${n}`]);if(z&&j[`Category_${n}`])cats.push({name:j[`Category_${n}`],zone:z})}
  const value=j[`IF(${jifYear})`],jif=/^\d+(?:\.\d+)?$/.test(value)?Number(value):null;
  const metrics={year:jifYear+1,jifYear,jif,categories:cats,...(/^<\d+(?:\.\d+)?$/.test(value)?{jifDisplay:value}:{})};
  if(!r){r={journal:j.Journal,issns:ids};add(r)}else{r.aliases=[j.Journal];for(const id of ids){if(!r.issns.includes(id)){r.issns.push(id);const set=byIssn.get(id)||new Set();set.add(r);byIssn.set(id,set)}}}r.jcr=metrics;
 }
 // Ambiguous identifiers are quarantined, never silently assigned to one journal.
 const ambiguous=new Set([...byIssn.values()].filter(s=>s.size>1).flatMap(s=>[...s]));
 const journals=rows.filter(r=>!ambiguous.has(r));skipped+=ambiguous.size;
 const editions={cas:{year:casYear,source:`${repository}/blob/${commit}/中科院分区表及JCR原始数据文件/FQBJCR${casYear}-UTF8.csv`,checkedAt:now.toISOString(),latestConfirmed:true},jcr:{year:jifYear+1,source:`${repository}/blob/${commit}/中科院分区表及JCR原始数据文件/JCR${jifYear}-UTF8.csv`,checkedAt:now.toISOString(),latestConfirmed:true}};
 const clean=validateCatalog({schema:1,editions,journals},now);
 return {...clean,provider:'showjcr',provenance:'ShowJCR 社区数据 · 来源当前可用版本，非官方实时查询',upstream:{repository,commit,checkedAt:now.toISOString(),casYear,jifYear,skipped,casRows:casRows.length,jcrRows:jcrRows.length}};
}
async function request(url,maximum,fetcher){const r=await fetcher(url,{signal:AbortSignal.timeout(45000),headers:{Accept:url.startsWith(api)?'application/vnd.github+json':'text/plain','User-Agent':'PaperCompanion/0.2.10'}});if(!r.ok)throw Error(`GitHub 数据更新失败（${r.status}），已保留本地缓存`);if(Number(r.headers.get('content-length'))>maximum)throw Error('数据文件超出大小限制');const reader=r.body.getReader();let size=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maximum)throw Error('数据文件超出大小限制');chunks.push(value)}}catch(e){await reader.cancel();throw e}finally{reader.releaseLock()}return Buffer.concat(chunks)}
export async function downloadCommunity({fetcher=fetch,now=new Date(),previous=null}={}){
 const commitInfo=JSON.parse(await request(api+'/commits/master',2*1024*1024,fetcher)),commit=commitInfo.sha;if(!/^[a-f0-9]{40}$/.test(commit))throw Error('GitHub 版本号无效');
 const tree=JSON.parse(await request(api+`/git/trees/${commit}?recursive=1`,3*1024*1024,fetcher));if(tree.truncated||!Array.isArray(tree.tree))throw Error('GitHub 数据目录不完整');
 function latest(prefix,maxYear){const entries=tree.tree.map(e=>({...e,match:e.path.match(new RegExp(`^中科院分区表及JCR原始数据文件/${prefix}(20\\d{2})-UTF8\\.csv$`))})).filter(e=>e.type==='blob'&&e.match&&+e.match[1]<=maxYear).sort((a,b)=>+b.match[1]-a.match[1]);const e=entries[0];if(!e||+e.match[1]<2025)throw Error('没有可用的近期指标数据');return e}
 const cas=latest('FQBJCR',now.getFullYear()),jcr=latest('JCR',now.getFullYear()-1),casYear=+cas.match[1],jifYear=+jcr.match[1];
 if(previous&&(casYear<previous.upstream.casYear||jifYear<previous.upstream.jifYear))throw Error('上游版本回退，保留之前的数据');
 async function csv(e){const bytes=await request(`https://raw.githubusercontent.com/hitfyd/ShowJCR/${commit}/`+e.path.split('/').map(encodeURIComponent).join('/'),12*1024*1024,fetcher);const hash=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');if(hash!==e.sha)throw Error('数据校验不一致，保留之前的数据');return bytes.toString('utf8')}
 const [casText,jcrText]=await Promise.all([csv(cas),csv(jcr)]);const result=convertCommunity({casText,jcrText,casYear,jifYear,commit,now});
 if(result.journals.length<10000||result.upstream.skipped>500||previous&&result.journals.length<previous.journals.length*.85)throw Error('上游数据不完整或异常，保留之前的数据');
 return result;
}
