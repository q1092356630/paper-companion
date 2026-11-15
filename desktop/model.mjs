import {codexCompletion,translationProfile} from './codex.mjs';
export function translationConfig(config){if(config.translationProvider==='qwen-mt')return {...config,provider:'qwen-mt',model:'qwen-mt-flash',baseUrl:config.qwenBaseUrl||'https://dashscope.aliyuncs.com/compatible-mode/v1',apiKey:config.qwenApiKey};return config.provider==='codex'?{...config,...translationProfile}:config}
export function modelURL(base){const url=new URL(base);if(url.username||url.password||url.search||url.hash)throw new Error('API 地址不能包含账号、参数或片段');if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw new Error('API 地址需要 HTTPS，本机服务可以使用 HTTP');url.pathname=url.pathname.replace(/\/$/,'')+'/chat/completions';return url.toString()}
export async function completion(config,messages,{json=false,maxTokens=6000,signal,fetcher=fetch,taskType}={}){
  if(config.provider==='codex')return codexCompletion(messages,{json,taskType,signal});
  if(!config.apiKey)throw new Error('请先在设置中填写 AI API Key');
  let response;try{response=await fetcher(modelURL(config.baseUrl),{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.apiKey}`},body:JSON.stringify({model:config.model,messages,stream:false,max_tokens:maxTokens,...(json?{response_format:{type:'json_object'}}:{})}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(180000)]):AbortSignal.timeout(180000),redirect:'error'});}catch(e){if(signal?.aborted||e.name==='TimeoutError'||e.name==='AbortError')throw e;throw new Error('无法连接 AI 服务，请检查网络、API 地址或系统代理')}
  if(!response.ok)throw new Error(({401:'API Key 无效，请检查设置',403:'AI 服务拒绝了请求',402:'AI 账户余额不足',429:'请求过于频繁，请稍后重试'}[response.status])||`AI 服务暂不可用（${response.status}）`);
  const result=await response.json(),choice=result.choices?.[0],text=choice?.message?.content;
  if(choice?.finish_reason==='length')throw new Error('AI 输出被截断，请缩小范围后重试');
  if(typeof text!=='string'||!text.trim())throw new Error('AI 返回了空内容，请重试');
  if(!json)return text;
  try{return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g,''))}catch{throw new Error('AI 返回格式不完整，请重试；已有记录未被覆盖')}
}
const clean=s=>String(s||'').replace(/\s+/g,'').toLowerCase();
export function verifiedCitations(citations,pages){return (Array.isArray(citations)?citations:[]).filter(c=>Number.isInteger(c.page)&&c.page>0&&c.page<=pages.length&&typeof c.quote==='string'&&clean(c.quote).length>=8&&clean(pages[c.page-1].text).includes(clean(c.quote))).slice(0,8).map(c=>({page:c.page,quote:c.quote.slice(0,600),...(pages[c.page-1].ocr?{ocr:true}:{})}))}
export function selectContext(pages,question,currentPage,maxChars=120000){
 const terms=[...new Set(question.toLowerCase().match(/[a-z]{3,}|[\u4e00-\u9fff]{2}/g)||[])];
 const ranked=pages.map((p,i)=>({page:i+1,text:p.text,score:terms.reduce((n,t)=>n+(p.text.toLowerCase().includes(t)?1:0),0)+(i+1===currentPage?4:0)})).sort((a,b)=>b.score-a.score);
 let size=0;const chosen=[];for(const item of ranked){if(!item.text)continue;if(size+item.text.length>maxChars){if(!chosen.length)chosen.push({...item,text:item.text.slice(0,maxChars)});continue}chosen.push(item);size+=item.text.length}
 return chosen.sort((a,b)=>a.page-b.page);
}
export function cardMarkdown(doc,card){return `# ${doc.title}\n\n${doc.authors||''}${doc.doi?'\nDOI: '+doc.doi:''}\n\n${card.glossary?.trim()?'## 术语与缩写\n'+card.glossary+'\n\n':''}## 一句话结论\n${card.conclusion||''}\n\n## 方法与结果\n${card.findings||''}\n\n## 局限与待验证\n${card.limitations||''}\n\n## 我的想法\n${card.insight||''}\n\n## AI 建议（待确认）\n${card.suggestion||''}\n\n## 尚未解决\n${card.unresolved||''}\n\n## 阅读讨论\n${doc.messages.map(m=>`**${m.role==='user'?'我的问题':'AI 回答'}**\n${m.text}\n${(m.citations||[]).map(c=>`> 第 ${c.page} 页：${c.quote}`).join('\n')}`).join('\n\n')}\n\n## 阅读笔记\n${doc.notes.map(n=>`- 第 ${n.page} 页：${n.text}\n  我的想法：${n.comment||''}`).join('\n')}\n\n## 原文依据\n${(card.citations||[]).map(c=>`- 第 ${c.page} 页：${c.quote}`).join('\n')}\n`}
