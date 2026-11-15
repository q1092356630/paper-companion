import {useEffect,useRef,useState} from 'react';
import {BookOpen,CalendarDots,CheckCircle,FilePdf,ArrowSquareOut,NotePencil,PushPin,X,SpinnerGap} from '@phosphor-icons/react';
import './widget.css';
const api=window.paperWidget;
export function DesktopWidget(){
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(''),[selected,setSelected]=useState(null);
 const actions=useRef();
 async function run(key,fn){if(busy)return;setBusy(key);setError('');try{await fn()}catch(e){setError(e.message)}finally{setBusy('')}}
 const paper=data?.papers.find(p=>p.id===selected)||data?.papers[0];
 const navigate=(view,id)=>run(view,()=>api.widgetNavigate(view,id));
 const openPdf=id=>run('pdf:'+id,()=>api.openTranslatedPdf(id));
 actions.current={paper,navigate,openPdf};
 useEffect(()=>{
  let alive=true;const refresh=()=>api.widgetData().then(value=>{if(alive){setData(value);setError('')}}).catch(e=>{if(alive)setError(e.message)});
  refresh();const off=api.onUpdate(value=>setData(value));const timer=setInterval(refresh,60000);
  function key(e){if(!e.metaKey||e.altKey||e.shiftKey)return;const {paper,navigate,openPdf}=actions.current;if(e.key.toLowerCase()==='k'){e.preventDefault();if(paper?.hasCard)navigate('card',paper.id)}if(e.key.toLowerCase()==='o'){e.preventDefault();if(paper?.pdfReady)openPdf(paper.id)}}
  window.addEventListener('keydown',key);window.addEventListener('focus',refresh);
  return()=>{alive=false;off();clearInterval(timer);window.removeEventListener('keydown',key);window.removeEventListener('focus',refresh)};
 },[]);
 return <main className="desktop-widget">
  <header className="widget-heading"><div><BookOpen size={18}/><strong>阅读伴侣</strong><span>本周</span></div><nav><button title={data?.pinned?'取消置顶':'置顶小组件'} aria-label={data?.pinned?'取消置顶':'置顶小组件'} aria-pressed={!!data?.pinned} onClick={()=>run('pin',async()=>setData(await api.widgetPin(!data?.pinned)))}><PushPin size={16} weight={data?.pinned?'fill':'regular'}/></button><button title="隐藏小组件 · 可从主软件重新打开" aria-label="隐藏小组件" onClick={()=>api.widgetHide()}><X size={16}/></button></nav></header>
  <section className="widget-stats" aria-label="每周阅读统计"><button onClick={()=>navigate('weekly')}><span>本周推荐</span><strong>{data?.recommended??'—'}</strong><small>{data?(data.weeklyCurrent?(data.ranked?`优先 · ${data.candidates} 篇候选`:`${data.candidates} 篇候选`):'本周尚未更新'):'读取中'}</small></button><div><span>本周读完</span><strong>{data?.readThisWeek??'—'}<i>篇</i></strong><small>已保存阅读卡片</small></div><div><span>累计已读</span><strong>{data?.totalRead??'—'}<i>篇</i></strong><small>{data?`${data.inProgress} 篇阅读中`:'读取中'}</small></div></section>
  <div className="widget-section-title"><h1>最近阅读</h1><button onClick={()=>navigate('library')}>文献库 <ArrowSquareOut size={13}/></button></div>
  <section className="widget-paper-list" aria-label="最近阅读的文献">
   {data?.papers.length===0&&<div className="widget-empty"><BookOpen size={28}/><p>从一篇论文开始</p><button onClick={()=>navigate('library')}>打开文献库</button></div>}
   {data?.papers.map(item=><article key={item.id} className={'widget-paper '+(paper?.id===item.id?'current':'')} onFocusCapture={()=>setSelected(item.id)} onClick={()=>setSelected(item.id)}>
    <button className="widget-paper-title" title={item.title} disabled={!!busy} onClick={()=>navigate('reader',item.id)}>{item.title}</button>
    <div className="widget-journal" title={item.zoneDetail}><span>{item.zoneLabel||'中科院分区待核实'}</span><small>{item.metricLabel}</small></div><div className="widget-paper-meta"><span>{item.complete?<><CheckCircle size={12}/>已读完</>:<>阅读中</>}</span><span>{item.total?`上次第 ${item.page} / ${item.total} 页`:'待解析'}</span></div>
    <div className="widget-position" role="meter" aria-label={item.title+'的上次阅读位置'} aria-valuemin={0} aria-valuemax={item.total||1} aria-valuenow={item.total?item.page:0}><span style={{width:`${item.total?item.page/item.total*100:0}%`}}/></div>
    <div className="widget-paper-actions"><button disabled={!!busy} onClick={()=>navigate('reader',item.id)}><BookOpen size={14}/>{item.complete?'再次阅读':'继续阅读'}</button><button title={item.hasCard?'查看阅读卡片 · Ctrl/⌘+K':'保存阅读卡片后可查看'} aria-label={'查看卡片：'+item.title} disabled={!!busy||!item.hasCard} onClick={()=>navigate('card',item.id)}><NotePencil size={16}/><span>卡片</span></button><button title={item.pdfReady?'打开中文 PDF · Ctrl/⌘+O':`译文 ${item.translated}/${item.total} 页，请先完成全文翻译`} aria-label={'打开译文 PDF：'+item.title} disabled={!!busy||!item.pdfReady} onClick={()=>openPdf(item.id)}>{busy==='pdf:'+item.id?<SpinnerGap className="widget-spin" size={16}/>:<FilePdf size={16}/>}<span>译文</span></button></div>
   </article>)}
  </section>
  {error&&<p className="widget-error" role="alert">{error}<button aria-label="关闭提示" onClick={()=>setError('')}><X size={13}/></button></p>}
  <footer className="widget-footer"><button disabled={!!busy} onClick={()=>navigate('weekly')}><CalendarDots size={15}/>每周推荐</button><span title="小组件获得焦点时，作用于最近选中的文献">Ctrl/⌘+K 卡片 · Ctrl/⌘+O 译文</span><small><span className="widget-live"/>进度自动同步 · Ctrl/⌘+Shift+W 唤出</small></footer>
 </main>
}
