import path from 'node:path';
import {cacheRoot} from './platform.cjs';
import {fileURLToPath} from 'node:url';
import {readingDashboard} from './widget-data.mjs';
import {translatedPreview} from './translated-preview.mjs';
import {atomicJson,readJson} from './store.mjs';
import {nativeWidgetPublisher} from './native-widget.mjs';
const directory=path.dirname(fileURLToPath(import.meta.url));
const allowed=new Set(['widgetData','widgetHide','widgetPin','widgetNavigate','openTranslatedPdf']);

export async function createWidgetController({electron,store,service,root,showMain}){
 const {app,BrowserWindow,screen,shell}=electron;
 const prefsFile=path.join(root,'widget.json');
 let prefs={enabled:true,pinned:false,...await readJson(prefsFile,{})},widget,quitting=false,timer,moveTimer,sequence=0,saveQueue=Promise.resolve(),snapshotQueue=Promise.resolve();
 const pdfJobs=new Map();
 const native=nativeWidgetPublisher({root,resources:process.resourcesPath||path.join(directory,'../resources')});
 const refreshTimer=setInterval(()=>changed(),60000);refreshTimer.unref?.();
 const save=()=>{const value={...prefs};saveQueue=saveQueue.catch(()=>{}).then(()=>atomicJson(prefsFile,value));return saveQueue};
 function snapshot(){
  const work=snapshotQueue.catch(()=>{}).then(async()=>{
  const listed=await store.list();const docs=await Promise.all(listed.map(async doc=>service.journals.decorate(await store.get(doc.id))));
  const value={...readingDashboard(docs,await service.lastRecommendations()),pinned:!!prefs.pinned};
  await native.publish(value);return value;
  });snapshotQueue=work;return work;
 }
 async function broadcast(){const turn=++sequence;try{const data=await snapshot();if(turn===sequence&&widget&&!widget.isDestroyed())widget.webContents.send('paper:dashboard',data)}catch{/* The next explicit refresh exposes the read error. */}}
 function changed(){clearTimeout(timer);timer=setTimeout(broadcast,150)}
 function bounds(){
  const old=prefs.bounds,display=old&&Number.isFinite(old.x)&&Number.isFinite(old.y)?screen.getDisplayNearestPoint({x:Math.round(old.x),y:Math.round(old.y)}):screen.getPrimaryDisplay();
  const area=display.workArea,width=Math.min(360,area.width),height=Math.min(540,area.height);
  return {width,height,x:Math.round(Math.max(area.x,Math.min(old?.x??area.x+area.width-width-22,area.x+area.width-width))),y:Math.round(Math.max(area.y,Math.min(old?.y??area.y+40,area.y+area.height-height)))};
 }
 async function show(){
  prefs.enabled=true;await save();
  if(widget&&!widget.isDestroyed()){widget.show();widget.focus();await broadcast();return true}
  widget=new BrowserWindow({...bounds(),title:'阅读伴侣 · 桌面组件',frame:false,resizable:false,minimizable:false,maximizable:false,fullscreenable:false,show:false,skipTaskbar:true,alwaysOnTop:!!prefs.pinned,backgroundColor:'#f9fbff',webPreferences:{preload:path.join(directory,'widget-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  widget.webContents.setWindowOpenHandler(()=>({action:'deny'}));widget.webContents.on('will-navigate',e=>e.preventDefault());widget.on('page-title-updated',event=>event.preventDefault());
  widget.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:false});
  widget.on('move',()=>{clearTimeout(moveTimer);moveTimer=setTimeout(()=>{if(widget&&!widget.isDestroyed()){prefs.bounds=widget.getBounds();save().catch(()=>{})}},300)});
  widget.on('close',event=>{if(!quitting){event.preventDefault();hide().catch(()=>{})}});
  widget.on('closed',()=>{widget=null});widget.on('focus',changed);
  await widget.loadFile(path.join(directory,'../dist/client/index.html'));widget.showInactive();await broadcast();return true;
 }
 async function hide(){prefs.enabled=false;await save();widget?.hide();return true}
 async function toggle(){if(widget?.isVisible())return hide();return show()}
 async function pin(value){prefs.pinned=!!value;widget?.setAlwaysOnTop(prefs.pinned);await save();return snapshot()}
 async function navigate(view,id){
  if(!['library','weekly','reader','card'].includes(view))throw new Error('无效的页面');
  if(['reader','card'].includes(view)){const doc=await store.get(id);if(doc.deletedAt)throw new Error('这篇文献已移入回收站');if(view==='card'&&!doc.card)throw new Error('这篇文献尚未保存阅读卡片')}
  await showMain({view,id});return true;
 }
 async function openPdf(id){
  if(pdfJobs.has(id))return pdfJobs.get(id);
  const work=(async()=>{const doc=await store.get(id);if(doc.deletedAt)throw new Error('这篇文献已移入回收站');const file=await translatedPreview({root,doc,cache:path.join(cacheRoot(),'TranslatedPDFs')});const error=await shell.openPath(file);if(error)throw new Error('译文已生成，但系统无法打开 PDF：'+error);return true})();
  pdfJobs.set(id,work);try{return await work}finally{pdfJobs.delete(id)}
 }
 return {show,hide,toggle,pin,navigate,openPdf,snapshot,changed,isPdfBusy:id=>pdfJobs.has(id),
  accepts:(sender,name)=>!!widget&&!widget.isDestroyed()&&sender===widget.webContents&&allowed.has(name),
  start:async()=>{await snapshot();if(prefs.enabled)await show()},
  latestCard:async()=>{const paper=(await store.list()).find(p=>p.hasCard);if(paper)return navigate('card',paper.id);return navigate('library')},
  dispose:()=>{quitting=true;clearTimeout(timer);clearTimeout(moveTimer);clearInterval(refreshTimer);native.dispose()}
 };
}
