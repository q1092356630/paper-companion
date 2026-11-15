// Qwen-MT is translation-only: one user message, no system prompt or JSON mode.
export const qwenDefaultURL='https://dashscope.aliyuncs.com/compatible-mode/v1';
export const qwenModel='qwen-mt-flash';
export function qwenURL(value=qwenDefaultURL){
 let url;try{url=new URL(value)}catch{throw new Error('请填写有效的百炼 API 地址')}
 const legacy=['dashscope.aliyuncs.com','dashscope-intl.aliyuncs.com','dashscope-us.aliyuncs.com'];
 const workspace=/^[a-z0-9-]+\.(cn-beijing|ap-southeast-1|us-east-1)\.maas\.aliyuncs\.com$/;
 if(url.protocol!=='https:'||url.port||url.username||url.password||url.search||url.hash||(!legacy.includes(url.hostname)&&!workspace.test(url.hostname))||url.pathname.replace(/\/$/,'')!=='/compatible-mode/v1')throw new Error('请使用阿里云百炼官方的 HTTPS OpenAI 兼容地址（以 /compatible-mode/v1 结尾）');
 return url.origin+'/compatible-mode/v1';
}
export function publicTranslationSettings(saved){return {translationProvider:saved.translationProvider==='qwen-mt'?'qwen-mt':'follow',qwenBaseUrl:saved.qwenBaseUrl||qwenDefaultURL,hasQwenKey:!!saved.encryptedQwenKey}}
export function saveTranslationSettings(value,old,storage){
 const translationProvider=value.translationProvider??old.translationProvider??'follow';
 if(!['follow','qwen-mt'].includes(translationProvider))throw new Error('不支持的翻译引擎');
 if(translationProvider==='qwen-mt'&&value.qwenBaseUrl!==undefined&&!String(value.qwenBaseUrl).trim())throw new Error('请填写百炼 API 地址');
 const qwenBaseUrl=qwenURL(value.qwenBaseUrl||old.qwenBaseUrl||qwenDefaultURL);
 const key=String(value.qwenApiKey||'').trim();
 if(old.encryptedQwenKey&&qwenBaseUrl!==(old.qwenBaseUrl||qwenDefaultURL)&&!key&&!value.clearQwenKey)throw new Error('更换百炼地址时，请同时填写对应地域的密钥，或勾选移除旧密钥');
 let encryptedQwenKey=old.encryptedQwenKey;
 if(value.clearQwenKey)encryptedQwenKey=undefined;
 if(key){if(key.length>4096)throw new Error('百炼 API Key 长度异常');if(!storage.isEncryptionAvailable())throw new Error('系统钥匙串暂不可用，百炼密钥没有保存');encryptedQwenKey=storage.encryptString(key).toString('base64')}
 return {translationProvider,qwenBaseUrl,...(encryptedQwenKey?{encryptedQwenKey}:{})};
}
const queues=new Map();
// Pace starts to stay under the documented 60 RPM; short segments also bound TPM.
async function paced(key,signal){
 const prior=queues.get(key)||Promise.resolve(0);
 const next=prior.catch(()=>0).then(async last=>{const wait=Math.max(0,last+1100-Date.now());if(wait)await new Promise(resolve=>setTimeout(resolve,wait));signal?.throwIfAborted();return Date.now()});
 queues.set(key,next);return next;
}
export async function qwenTranslate(config,text,{signal,fetcher=fetch}={}){
 if(typeof text!=='string'||!text.trim())throw new Error('没有可翻译的文本');
 if(!config.apiKey)throw new Error('请先在设置中填写百炼 API Key');
 const base=qwenURL(config.baseUrl);
 // Bound long paragraphs while preserving all characters and break opportunities.
 const chunks=[];let rest=text;while(rest.length>2500){let end=rest.lastIndexOf('\n',2500);if(end<1000)end=rest.lastIndexOf(' ',2500);if(end<1000)end=2500;else end++;chunks.push(rest.slice(0,end));rest=rest.slice(end)}if(rest)chunks.push(rest);
 const translated=[];
 for(const chunk of chunks){
  signal?.throwIfAborted();await paced(base+'\n'+config.apiKey,signal);
  let response;try{response=await fetcher(base+'/chat/completions',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.apiKey}`},body:JSON.stringify({model:qwenModel,messages:[{role:'user',content:chunk}],stream:false,translation_options:{source_lang:'English',target_lang:'Chinese',domains:'Academic research papers. Translate into Simplified Chinese. Preserve numbers, units, citations, equations, XML tags and formula placeholders.'}}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000)})}catch(error){if(signal?.aborted||['AbortError','TimeoutError'].includes(error.name))throw error;throw new Error('无法连接百炼翻译服务，请检查网络和 API 地址')}
  if(!response.ok)throw new Error(({401:'百炼 API Key 无效，请检查密钥和地域',403:'百炼拒绝访问，请检查模型权限与地域',402:'百炼账户余额不足',429:'百炼翻译限流，请稍后继续；已有译文已保留'}[response.status])||`百炼翻译服务错误（${response.status}）`);
  let data;try{data=await response.json()}catch{throw new Error('百炼返回格式异常，请稍后重试')}const choice=data.choices?.[0],value=choice?.message?.content;
  if(choice?.finish_reason==='length')throw new Error('百炼译文被截断，请缩小范围后重试');
  if(typeof value!=='string'||!value.trim())throw new Error('百炼返回空译文，请重试');
  translated.push(value.trim());
 }
 return translated.join('\n');
}
