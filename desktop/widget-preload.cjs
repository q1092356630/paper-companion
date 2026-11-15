const {contextBridge,ipcRenderer}=require('electron');
const methods=['widgetData','widgetHide','widgetPin','widgetNavigate','openTranslatedPdf'];
const api=Object.fromEntries(methods.map(name=>[name,async(...args)=>{const result=await ipcRenderer.invoke('paper:'+name,...args);if(!result.ok)throw new Error(result.error);return result.value}]));
api.onUpdate=callback=>{const listener=(_event,data)=>callback(data);ipcRenderer.on('paper:dashboard',listener);return()=>ipcRenderer.removeListener('paper:dashboard',listener)};
contextBridge.exposeInMainWorld('paperWidget',api);
