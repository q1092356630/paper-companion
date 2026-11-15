import {normalizeTopics,normalizeTopicOperator} from './topics.mjs';
const local='http://127.0.0.1:23119/api';
function key(value){if(!/^[A-Z0-9]{8}$/.test(value||''))throw new Error('无效的 Zotero 条目');return value}
export async function zoteroFetch(route,options={}){let response;try{response=await fetch(local+route,{...options,headers:{'Zotero-API-Version':'3',...options.headers},signal:options.signal||AbortSignal.timeout(20000),redirect:'manual'})}catch{throw new Error('请打开 Zotero，并在 设置 → 高级 开启“允许其他应用程序与 Zotero 通信”')}if(response.status===403)throw new Error(options.method?'Zotero 未授权此次写回，卡片仍保存在本机':'Zotero 尚未允许本地连接，请在 Zotero 设置 → 高级中开启');if(!response.ok&&response.status!==302)throw new Error(`Zotero 请求失败（${response.status}）`);return response}
export async function listZotero(query='',start=0){const params=new URLSearchParams({format:'json',limit:'60',start:String(Math.max(0,start)),sort:'dateModified',direction:'desc'});if(query)params.set('q',query);const response=await zoteroFetch('/users/0/items/top?'+params);const data=await response.json();return {items:data.filter(i=>!['note','attachment'].includes(i.data?.itemType)).map(i=>({key:i.key,serverId:response.headers.get('Zotero-Server-ID')||null,title:i.data.title||'未命名',doi:i.data.DOI||'',journal:i.data.publicationTitle||'',issns:(i.data.ISSN||'').split(/[ ,;]+/).filter(Boolean),publicationType:({journalArticle:'journal-article',conferencePaper:'proceedings-article',preprint:'posted-content'})[i.data.itemType]||'',authors:(i.data.creators||[]).map(c=>c.lastName||c.name||'').join(', '),year:i.data.date||'',numChildren:i.meta?.numChildren||0})),more:data.length===60,start}}
export async function zoteroAttachments(itemKey){const response=await zoteroFetch(`/users/0/items/${key(itemKey)}/children?format=json`);return (await response.json()).filter(i=>i.data.itemType==='attachment'&&i.data.contentType==='application/pdf').map(i=>({key:i.key,title:i.data.title||i.data.filename||'PDF'}))}
export async function zoteroFile(attachmentKey){const response=await zoteroFetch(`/users/0/items/${key(attachmentKey)}/file/view/url`);const value=(await response.text()).trim();const url=new URL(value);if(url.protocol!=='file:')throw new Error('PDF 尚未下载到本机，请先在 Zotero 打开附件');return url}
const html=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function writeZoteroCard(doc,markdown){if(!doc.zotero?.key)throw new Error('这篇文献没有关联 Zotero 条目');const response=await zoteroFetch('/');const server=response.headers.get('Zotero-Server-ID');if(!server)throw new Error('此版本 Zotero 不支持写回；请复制或导出卡片后粘贴为笔记');if(doc.zotero.serverId&&doc.zotero.serverId!==server)throw new Error('当前 Zotero 资料库与导入时不同，请切换回原资料库');const auth=await zoteroFetch('/local/authorize',{method:'POST',signal:AbortSignal.timeout(300000),headers:{'Content-Type':'application/json','Zotero-Server-ID':server},body:JSON.stringify({appName:'文献伴读'})});const grant=await auth.json();const result=await zoteroFetch('/users/0/items',{method:'POST',headers:{'Content-Type':'application/json','Zotero-Server-ID':server,'Zotero-API-Key':grant.key},body:JSON.stringify([{itemType:'note',parentItem:key(doc.zotero.key),note:`<h1>阅读卡片</h1><pre>${html(markdown)}</pre>`,tags:[{tag:'文献伴读'}]}])});const data=await result.json();if(!data.successful?.['0'])throw new Error('Zotero 未能保存笔记，请重试');return true}
const topicAliases={
 '转移前生态位':{query:'pre-metastatic niche',pattern:/pre[-\s]?metastatic nich|转移前生态位|转移前微环境/i},
 '血管':{query:'vascular',pattern:/vascular|blood vessel|angiogene|endotheli|血管/i},
 '结直肠癌':{query:'colorectal cancer',pattern:/colorectal|rectal|colon cancer|colon carcinoma|结直肠|直肠癌|结肠癌/i},
 '深度学习':{query:'deep learning',pattern:/deep learning|neural network|transformer|深度学习|神经网络/i},
 '概念瓶颈':{query:'concept bottleneck model',pattern:/concept[- ]bottleneck|concept[- ]based|概念瓶颈/i},
 '大语言模型':{query:'large language model',pattern:/large language model|\bLLMs?\b|ChatGPT|GPT[- ]?\d|大语言模型/i},
 '磁共振成像':{query:'magnetic resonance imaging',pattern:/magnetic resonance|\bMRI\b|磁共振/i},
};
export function topicPlan(topics,{operator='or'}={}){
 const keywords=normalizeTopics(topics);operator=normalizeTopicOperator(operator);
 if(!keywords.length)throw new Error('请先在设置中填写研究关键词');
 const concepts=keywords.map(label=>{const alias=Object.entries(topicAliases).find(([name,value])=>name===label||value.query.toLowerCase()===label.toLowerCase());return {label,canonical:alias?.[0]||label,...(alias?.[1]||{query:label})}});
 const queries=operator==='and'?[concepts.map(c=>c.query).join(' ')]:concepts.map(c=>c.query);
 return {keywords,concepts,queries,operator};
}
export function rankCandidate(item,concepts,operator='or'){
 if(/\bretract(?:ion|ed)\b|\berratum\b|\bcorrigendum\b|^correction[: ]|撤稿|勘误/i.test(item.title))return null;
 const text=item.title+' '+item.abstract;
 const matched=concepts.filter(c=>c.pattern?c.pattern.test(text):text.toLowerCase().includes(c.query.toLowerCase())).map(c=>c.label);
 if(!matched.length||(operator==='and'&&matched.length!==concepts.length))return null;
 const isCRC=concepts.some(c=>c.canonical==='结直肠癌'&&matched.includes(c.label));
 const medical=/medic|clinic|cancer|tumou?r|imaging|radiolog|patholog|health|医学|医疗|癌|肿瘤/i.test(text);
 const methodRelated=concepts.some(c=>c.canonical==='概念瓶颈'&&matched.includes(c.label))&&medical;
 const priority=isCRC&&matched.length>1?'研究交叉方向':methodRelated&&!isCRC?'可借鉴的方法':'主题背景';
 const reason=priority==='研究交叉方向'?`标题或摘要同时涉及${matched.join('、')}，优先判断其数据、方法与研究问题是否适用。`:priority==='可借鉴的方法'?'涉及医学中的概念方法，可作为概念瓶颈方向的方法参考；并非结直肠癌直接证据。':`标题或摘要涉及${matched.join('、')}，可作为背景补充。`;
 return {...item,matched,priority,reason,score:(priority==='研究交叉方向'?20:priority==='可借鉴的方法'?12:0)+matched.length};
}
export async function discover(topics,{operator='or',fetcher=fetch,now=new Date(),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const {keywords,concepts,queries}=topicPlan(topics,{operator});
 const localDay=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 const previous=new Date(now);previous.setDate(previous.getDate()-7);
 const to=localDay(now),from=localDay(previous),map=new Map(),warnings=[];
 let successful=0;
 for(const [index,topic] of queries.entries()){
  if(index)await pause(1100);
  try{
   const query=new URLSearchParams({query:topic,filter:`from-pub-date:${from},until-pub-date:${to},type:journal-article`,rows:'20',sort:'relevance'});
   const request=()=>fetcher('https://api.crossref.org/works?'+query,{headers:{'User-Agent':'PaperCompanion/0.1 (desktop literature reader)'},signal:AbortSignal.timeout(45000)});
   let response=await request();
   if(response.status===429){const retry=Number(response.headers.get('Retry-After'));await pause(Math.min(30000,Math.max(1500,(retry||2)*1000)));response=await request()}
   if(!response.ok)throw new Error(`HTTP ${response.status}`);
   const data=await response.json();successful++;
   for(const i of data.message?.items||[]){
    if(!i.DOI||!i.title?.[0])continue;const doi=i.DOI.toLowerCase();if(map.has(doi))continue;
    map.set(doi,{doi,title:i.title[0].replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim(),journal:i['container-title']?.[0]||'',issns:i.ISSN||[],publicationType:i.type||'journal-article',date:(i.published?.['date-parts']?.[0]||[]).join('-'),authors:(i.author||[]).slice(0,3).map(a=>[a.given,a.family].filter(Boolean).join(' ')).join(', '),abstract:(i.abstract||'').replace(/<[^>]*>/g,' ').slice(0,3500),url:'https://doi.org/'+encodeURIComponent(i.DOI)});
   }
  }catch{warnings.push(topic)}
 }
 if(!successful)throw new Error('本次未能连接文献检索服务，请检查网络后重试；上次推荐仍会保留。');
 const items=[...map.values()].map(i=>rankCandidate(i,concepts,operator)).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,30);
 return {from,to,generatedAt:now.toISOString(),topics:keywords,topicOperator:operator,retrieved:map.size,warnings,items};
}

export function filterSavedTopics(result,topics,operator='or'){
 if(!result)return result;const keywords=normalizeTopics(topics);operator=normalizeTopicOperator(operator);
 if(JSON.stringify(keywords)===JSON.stringify(result.topics)&&operator===(result.topicOperator||'or'))return result;
 const concepts=keywords.length?topicPlan(keywords,{operator}).concepts:[];
 const candidates=(result.candidates||result.items||[]).map(({aiRank,aiReason,readingQuestion,...item})=>rankCandidate(item,concepts,operator)).filter(Boolean);
 return {...result,candidates,items:candidates,topics:keywords,topicOperator:operator,topicsChanged:true,aiBrief:'',aiError:''};
}
