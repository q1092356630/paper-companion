import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {cacheRoot,runtimePython,unpackedPath} from './platform.cjs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createTranslationBridge} from './translation-bridge.mjs';

export const layoutVersion='pdf2zh-next-2.9.0-babeldoc-0.6.2-v5';
export const indexVersion='rapidocr-3.9.2-en-v3';
const directory=path.dirname(fileURLToPath(import.meta.url));
let assetsReady;
export async function layoutRuntime(){
 const worker=unpackedPath(path.join(directory,'pdf-worker.py'));
 const roots=[process.resourcesPath&&path.join(process.resourcesPath,'pdf-runtime'),path.resolve(directory,'../.runtime/pdf-runtime')].filter(Boolean);
 for(const root of roots){const python=runtimePython(root);try{await fs.access(python);await fs.access(worker);return {available:true,python,worker,version:layoutVersion,assets:path.join(path.dirname(root),'pdf-assets')}}catch{}}
 return {available:false,detail:'PDF 排版组件不完整，请重新安装完整版文献伴读。开发环境请运行 pnpm setup:pdf。'};
}

export async function runPDFWorker(request,{signal,notify=()=>{},runtime}={}){
 runtime=runtime||await layoutRuntime();if(!runtime.available)throw new Error(runtime.detail);
 if(signal?.aborted)throw new Error('任务已取消');
 const cache=path.join(cacheRoot(),'PDFEngine');
 const needsEngine=!['card-png','merge-translations','metadata'].includes(request.operation);
 if(runtime.assets&&needsEngine){assetsReady ||= (async()=>{await fs.mkdir(cache,{recursive:true});await fs.cp(runtime.assets,cache,{recursive:true,force:false})})().catch(e=>{assetsReady=null;throw e});await assetsReady}
 await fs.mkdir(request.output,{recursive:true});
 return new Promise((resolve,reject)=>{
  const env={...process.env,PYTHONUNBUFFERED:'1',PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',PYTHONDONTWRITEBYTECODE:'1',NO_PROXY:'127.0.0.1,localhost',...(runtime.assets&&needsEngine?{PAPER_ENGINE_CACHE:cache}:{})};
  if(!needsEngine)delete env.PAPER_ENGINE_CACHE;
  delete env.PYTHONHOME;delete env.PYTHONPATH;
  const child=spawn(runtime.python,['-u',runtime.worker],{stdio:['pipe','pipe','pipe'],env,shell:false,windowsHide:true,detached:process.platform!=='win32'});
  let buffer='',result,problem,ended=false,killTimer;
  const kill=name=>{try{if(process.platform!=='win32'&&child.pid)process.kill(-child.pid,name);else child.kill(name)}catch{}};
  const stop=message=>{problem=message;kill('SIGTERM');killTimer=setTimeout(()=>kill('SIGKILL'),1200);killTimer.unref?.()};
  const abort=()=>stop('任务已取消，已完成的页面已保留');signal?.addEventListener('abort',abort,{once:true});
  const timeout=setTimeout(()=>stop('本次 PDF 处理超过 30 分钟，请分批处理'),30*60000);
  child.stdout.on('data',chunk=>{buffer+=chunk.toString();if(buffer.length>16000000)return stop('PDF 排版输出异常');let n;while((n=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,n);buffer=buffer.slice(n+1);try{const event=JSON.parse(line);if(event.type==='finish')result=event;else if(event.type==='error')problem=event.message;else if(event.type?.startsWith('progress'))notify(event)}catch{problem='PDF 排版返回了无效数据'}}});
  child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
  const finish=error=>{if(ended)return;ended=true;clearTimeout(timeout);clearTimeout(killTimer);signal?.removeEventListener('abort',abort);error?reject(error):result?resolve(result):reject(new Error('PDF 组件未返回结果'))};
  child.on('error',()=>finish(new Error('PDF 排版组件无法启动')));
  child.on('close',code=>finish(problem||code!==0?new Error(problem||'PDF 处理未完成，请重试'):null));
  if(signal?.aborted)abort();else child.stdin.end(JSON.stringify(request)+'\n');
 });
}
export async function translateLayout({input,pages,output,cacheDir,config,signal,notify=()=>{},runtime,ocr=false,bridgeFactory=createTranslationBridge}){
 if(!Array.isArray(pages)||!pages.length||pages.some(n=>!Number.isInteger(n)||n<1))throw new Error('翻译页码无效');
 const bridge=await bridgeFactory(config,{signal,cacheDir,notify});
 try{
  const fingerprint=createHash('sha256').update(JSON.stringify({provider:config.provider,model:config.model,baseUrl:config.baseUrl,layoutVersion})).digest('hex').slice(0,16);
  const result=await runPDFWorker({input,pages,output,ocr,provider:config.provider,model:config.provider==='qwen-mt'?'qwen-mt-flash-'+fingerprint:'paper-layout-'+fingerprint,baseUrl:bridge.baseUrl,key:bridge.key},{signal,notify,runtime});
  bridge.assertComplete?.();
  if(result.pages.length!==pages.length||result.pages.some((p,i)=>p.page!==pages[i]))throw new Error('译文与原文页码未能完整对应');
  for(const page of result.pages){const safe=path.resolve(page.path);if(path.dirname(safe)!==path.resolve(output))throw new Error('译文文件路径异常');const bytes=await fs.readFile(safe);if(bytes.length<100||!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))throw new Error('译文 PDF 文件不完整')}
  return result;
 }finally{await bridge.close()}
}
export async function indexPDF({input,output,signal,notify=()=>{},runtime}){
 const result=await runPDFWorker({operation:'index',input,output},{signal,notify,runtime});
 if(!Array.isArray(result.pages)||!result.pages.length||result.pages.some(p=>typeof p.text!=='string'||!Array.isArray(p.blocks)||!Number.isFinite(p.width)||!Number.isFinite(p.height)))throw new Error('PDF 索引不完整');
 if(result.searchable&&path.dirname(path.resolve(result.searchable))!==path.resolve(output))throw new Error('OCR 文件路径异常');
 return {...result,indexVersion};
}
