import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
export {pdfjs};
export function openPdf(bytes){return pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:true,cMapUrl:new URL('./pdf-assets/cmaps/',window.location.href).href,cMapPacked:true,standardFontDataUrl:new URL('./pdf-assets/standard_fonts/',window.location.href).href})}
export async function extractPages(pdf,onProgress){const result=[];for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n),viewport=page.getViewport({scale:1}),content=await page.getTextContent();const lines=[];let line=null;
 for(const item of content.items){if(!item.str?.trim())continue;const tx=pdfjs.Util.transform(viewport.transform,item.transform),font=Math.max(5,Math.hypot(tx[2],tx[3])),x=tx[4],y=tx[5]-font*.82,w=item.width;
 if(line&&Math.abs(line.y-y)<font*.35&&x>=line.x&&x-(line.x+line.w)<font*2.5){line.text+=(x>line.x+line.w+font*.12?' ':'')+item.str;line.w=Math.max(line.w,x+w-line.x);line.h=Math.max(line.h,font*1.08)}else{line={text:item.str,x,y,w:Math.max(w,font),h:font*1.08,font};lines.push(line)}if(item.hasEOL)line=null;
 }
 const blocks=[];for(const ln of lines){const last=blocks.at(-1);if(last&&Math.abs(last.x-ln.x)<ln.font*1.5&&ln.y>=last.y+last.h*.5&&ln.y-last.y-last.h<ln.font*.95&&Math.abs(last.font-ln.font)<1.5&&Math.abs(last.w-ln.w)<viewport.width*.25){last.text+=' '+ln.text;last.h=ln.y+ln.h-last.y;last.w=Math.max(last.w,ln.w)}else blocks.push({...ln,id:'b'+blocks.length})}
 result.push({width:viewport.width,height:viewport.height,text:blocks.map(b=>b.text).join('\n'),blocks});onProgress?.(n,pdf.numPages)
 }return result}
