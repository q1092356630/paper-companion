import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {readingCardHtml} from './card-view.mjs';
import {runPDFWorker} from './layout.mjs';

const printCSS=`@media print {
 .card-module{break-inside:auto}.card-module-heading{break-after:avoid}
 .card-question,.card-glossary dl>div{break-inside:avoid}
 .card-module-grid{break-inside:avoid}.card-disclosure{display:none}
 .card-paper-header{padding:20px 24px}.card-paper-header h1{font-size:27px}
 .card-glossary{padding:20px 24px}.card-glossary dd{font-size:11px}
 .card-takeaway{padding:20px 24px}.card-takeaway p{font-size:17px}
 .card-module{padding:20px}.finding-tile{padding:15px}
 .finding-tile p,.card-module p,.card-question summary strong{font-size:12px}
 .card-answer{padding:18px}.card-module-heading h2{font-size:15px}
 .finding-grid,.card-module-grid{gap:14px}
}`;
const imageCSS=`@media print {
 body.shared-card{padding:32px 24px;background:#f4f6fa}
 .modular-card{max-width:1120px}
 .card-module,.finding-tile,.card-note,.card-evidence-item{break-inside:auto}
 .card-disclosure{display:none}
}`;

// Render the saved document, not the current scroll position or collapsed UI.
export async function exportCardFile({BrowserWindow,doc,css,format,destination,runtime}){
 if(!['pdf','png'].includes(format))throw new Error('不支持的卡片格式');
 if(!doc.card)throw new Error('请先保存阅读卡片');
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'paper-card-export-'));
 let renderer,timer;
 const controller=new AbortController();
 try{
  const html=path.join(folder,'card.html');
  await fs.writeFile(html,readingCardHtml(doc,css+(format==='pdf'?printCSS:imageCSS),{expanded:true}));
  renderer=new BrowserWindow({show:false,width:1120,height:900,backgroundColor:'#ffffff',webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,partition:'card-export-'+randomUUID()}});
  renderer.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  renderer.webContents.on('will-navigate',e=>e.preventDefault());
  const work=async()=>{
   await renderer.loadFile(html);
   const height=await renderer.webContents.executeJavaScript('document.fonts.ready.then(()=>Math.ceil(document.documentElement.scrollHeight))');
   if(!Number.isFinite(height)||height<1)throw new Error('卡片排版未完成，请重试');
   if(format==='png'&&height>18000)throw new Error('这张卡片过长，请使用分页 PDF 导出，内容不会截断。');
   const options=format==='pdf'?{pageSize:'A4',margins:{top:.4,bottom:.5,left:.4,right:.4},displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="width:100%;text-align:center;font-size:9px;color:#8290a4"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'}:{pageSize:{width:1120/96,height:(height+4)/96},margins:{top:0,bottom:0,left:0,right:0}};
   const pdf=await renderer.webContents.printToPDF({...options,printBackground:true,preferCSSPageSize:false});
   if(format==='pdf'){await fs.writeFile(destination,pdf);return}
   const intermediate=path.join(folder,'long-card.pdf');await fs.writeFile(intermediate,pdf);
   const rendered=await runPDFWorker({operation:'card-png',input:intermediate,output:folder},{runtime,signal:controller.signal});
   await fs.copyFile(rendered.image,destination);
  };
  await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>{reject(new Error('卡片导出超时，请重试'));controller.abort()},90000)})]);
  return true;
 }finally{clearTimeout(timer);if(renderer&&!renderer.isDestroyed())renderer.destroy();await fs.rm(folder,{recursive:true,force:true})}
}
