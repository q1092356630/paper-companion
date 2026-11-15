import {createHash} from 'node:crypto';
import {issn} from './journal-metrics.mjs';
const plain=v=>String(v||'').replace(/<[^>]+>/g,'').normalize('NFKC').replace(/\u00ad/g,'');
const key=v=>plain(v).toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function normalizedDOI(value){let d=String(value||'').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').replace(/^doi\s*:\s*/i,'').replace(/[.,;:]+$/,'');while(d.endsWith(')')&&(d.match(/\(/g)||[]).length<(d.match(/\)/g)||[]).length)d=d.slice(0,-1);return /^10\.\d{4,9}\/[^\s<>"?#]+$/i.test(d)&&d.length<250?d.toLowerCase():''}
export function doiCandidates(text){
 // Only the first-page header, never later-page references.
 const header=plain(text).split(/\n\s*(?:references|bibliography)\s*\n/i)[0].slice(0,6500);
 return [...new Set((header.match(/10\.\d{4,9}\/[A-Za-z0-9._;()/:+-]+/g)||[]).map(normalizedDOI).filter(Boolean))].slice(0,4);
}
function metadata(m){return {doi:normalizedDOI(m.DOI),title:plain(m.title?.[0]).trim(),journal:plain(m['container-title']?.[0]).trim(),issns:[...new Set((m.ISSN||[]).map(issn).filter(Boolean))],publicationType:m.type||'',authors:(m.author||[]).slice(0,12).map(a=>[a.given,a.family].filter(Boolean).join(' ')).filter(Boolean).join(', ')}}
function titleInPage(title,text){const a=key(title);return a.length>=25&&key(text.slice(0,6500)).includes(a)}
export function metadataFingerprint(paper,text,title){return createHash('sha256').update(JSON.stringify({doi:paper.doi||'',text:text.slice(0,6500),title})).digest('hex')}
export async function resolvePaperMetadata(paper,{text='',title='',catalog,fetcher=fetch}={}){
 const candidates=paper.doi?[normalizedDOI(paper.doi)].filter(Boolean):doiCandidates(text),matches=[];
 async function get(url){try{const r=await fetcher(url,{signal:AbortSignal.timeout(10000),redirect:'error'});return r.ok?(await r.json()).message:null}catch{return null}}
 for(const doi of candidates){const m=await get('https://api.crossref.org/works/'+encodeURIComponent(doi));if(!m||normalizedDOI(m.DOI)!==doi)continue;const data=metadata(m);if(paper.doi||titleInPage(data.title,text))matches.push(data)}
 if(matches.length===1)return {...matches[0],metadataSource:'Crossref · DOI 核对',metadataSourceUrl:'https://api.crossref.org/works/'+encodeURIComponent(matches[0].doi)};
 if(matches.length>1)return null;
 // A bibliographic lookup is accepted only for an exact printed title and a unique DOI.
 const searchTitle=title||paper.title;
 if(!candidates.length&&key(searchTitle).length>=25&&titleInPage(searchTitle,text)){
  const result=await get('https://api.crossref.org/works?'+new URLSearchParams({'query.title':searchTitle,rows:'3'}));
  const exact=(result?.items||[]).map(metadata).filter(m=>m.doi&&key(m.title)===key(searchTitle)&&titleInPage(m.title,text));
  if(new Set(exact.map(m=>m.doi)).size===1)return {...exact[0],metadataSource:'Crossref · 首页标题精确核对',metadataSourceUrl:'https://api.crossref.org/works/'+encodeURIComponent(exact[0].doi)};
 }
 // Offline journal-only fallback: exact complete header line, never a fuzzy name.
 const lines=plain(text).split('\n').slice(0,8).map(key).filter(v=>v.length>=8);
 const journals=(catalog?.journals||[]).filter(j=>[j.journal,...(j.aliases||[])].some(name=>lines.includes(key(name))));
 if(journals.length===1&&!paper.doi)return {journal:journals[0].journal,issns:journals[0].issns,metadataSource:'PDF 首页期刊名与本地指标库精确匹配'};
 return null;
}
