import {useEffect,useRef,useState} from 'react';
import {pdfjs,openPdf} from './pdf';
import {normalizedRects} from './selection-geometry.mjs';
import 'pdfjs-dist/web/pdf_viewer.css';

export function PdfPane({pdf,docId,number,metadata,translation,zh,zoom,scrollRef,onScroll,onSelect,flow=false,notes=[],immersive=false}){
 const canvas=useRef(),textLayer=useRef(),box=useRef();
 const [width,setWidth]=useState(500),[error,setError]=useState(''),[translated,setTranslated]=useState(null),[loading,setLoading]=useState(false);
 useEffect(()=>{if(!box.current)return;const observer=new ResizeObserver(entries=>setWidth(Math.max(160,entries[0].contentRect.width-(immersive?12:44))));observer.observe(box.current);return()=>observer.disconnect()},[immersive]);
 useEffect(()=>{
  if(!zh||!translation?.file){setTranslated(null);return}
  let dead=false,task;setTranslated(null);setLoading(true);setError('');
  (async()=>{const bytes=await window.paperDesk.translatedPdf(docId,number);if(dead)return;if(!bytes)throw new Error('译文文件暂不可用，请重新翻译');task=openPdf(bytes);const opened=await task.promise;if(!dead)setTranslated(opened)})().catch(e=>{if(!dead)setError(e.message)}).finally(()=>{if(!dead)setLoading(false)});
  return()=>{dead=true;task?.destroy()};
 },[zh,docId,number,translation?.file]);
 const document=zh?translated:pdf;
 const dimensions=zh&&translation?.file?translation:metadata;
 const scale=width/(dimensions?.width||612)*(zoom/100),height=(dimensions?.height||792)*scale;
 const textMode=zh&&flow&&translation;
 function selectText(event){const selection=window.getSelection();if(!selection?.rangeCount||selection.isCollapsed)return;const range=selection.getRangeAt(0),host=event.currentTarget;if(!host.contains(range.commonAncestorContainer))return;const text=selection.toString().trim();if(text.length<2)return;const bounds=range.getBoundingClientRect();onSelect({language:zh?'zh':'en',text:text.slice(0,4000),rects:textMode?[]:normalizedRects([...range.getClientRects()],host.getBoundingClientRect()),anchor:{x:bounds.left,y:bounds.bottom}})}
 const highlights=notes.filter(n=>n.page===number&&n.color&&n.rects?.length&&(n.language||'en')===(zh?'zh':'en')&&(!zh||n.translationFile===translation?.file));
 useEffect(()=>{
  if(!document||!canvas.current||textMode)return;
  let dead=false,render,layer;setError('');
  (async()=>{
   const page=await document.getPage(zh?1:number);if(dead)return;
   const viewport=page.getViewport({scale}),ratio=Math.min(devicePixelRatio||1,2);
   canvas.current.width=Math.floor(viewport.width*ratio);canvas.current.height=Math.floor(viewport.height*ratio);
   render=page.render({canvasContext:canvas.current.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0]});await render.promise;if(dead)return;
   const target=textLayer.current;target.replaceChildren();target.style.setProperty('--scale-factor',scale);target.style.setProperty('--total-scale-factor',scale);
   const content=await page.getTextContent();if(dead)return;layer=new pdfjs.TextLayer({textContentSource:content,container:target,viewport});await layer.render();
  })().catch(e=>{if(!dead&&e.name!=='RenderingCancelledException')setError('这一页无法显示：'+e.message)});
  return()=>{dead=true;render?.cancel();layer?.cancel()};
 },[document,number,scale,zh,textMode]);
 return <section className="document-pane actual-document" ref={box} aria-label={zh?'中文译文':'英文原文'}>
  <div className="document-label"><strong title={zh?'正文与图注为 AI 译文，图表、公式和代码请结合原文核对。':undefined}>{zh?'中文译文':'英文原文'}</strong><span>第 {number} 页 / 共 {pdf?.numPages||'—'} 页</span></div>
  <div className="document-scroll" ref={scrollRef} onScroll={onScroll}>
   {error&&<p className="inline-error" role="alert">{error}</p>}
   {textMode?<article className="flow-translation" style={{fontSize:18*zoom/100}} onMouseUp={selectText}><p className="flow-mode-note">文字阅读 · 图表请切换“保留版式”查看</p>{translation.blocks.map(b=><p key={b.id}>{b.text.replace(/[\u0000-\u0008]/g,' ')}</p>)}</article>
    :document?<div className="pdf-sheet" style={{width:(dimensions?.width||612)*scale,height}} onMouseUp={selectText}><canvas ref={canvas} style={{width:'100%',height:'100%'}}/><div className="pdf-highlights" aria-hidden="true">{highlights.flatMap(n=>n.rects.map((r,i)=><span key={n.id+'-'+i} className={'pdf-highlight highlight-'+n.color} style={{left:r.x*100+'%',top:r.y*100+'%',width:r.width*100+'%',height:r.height*100+'%'}}/>))}</div><div ref={textLayer} className="textLayer"/></div>
    :<div className="translation-empty">{loading?'正在打开中文页面…':translation?'点击“翻译本页”，生成保留版式的新版译文。':'此页尚未翻译 · 点击“翻译本页”开始'}</div>}
  </div>
 </section>
}
