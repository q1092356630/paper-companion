export function widgetJournal(metrics){
 if(metrics?.status==='not-applicable')return {zoneLabel:'非期刊 · 分区不适用',metricLabel:'',zoneDetail:metrics.reason};
 if(!metrics?.cas)return {zoneLabel:'中科院分区待核实',metricLabel:'IF / JCR 待核实',zoneDetail:'尚未获得有来源的中科院分区'};
 const c=metrics.cas,summary=values=>[...new Set(values.map(v=>v.zone))].sort().join('/');
 const zoneLabel=c.current?`中科院 ${c.major.length?'大类'+summary(c.major)+'区':''}${c.major.length&&c.minor.length?' · ':''}${c.minor.length?'小类'+summary(c.minor)+'区':''} · ${c.year}`:'中科院分区待更新';
 const j=metrics.jcr,metricLabel=j?.current?`IF ${j.jifDisplay??j.jif??'未公布'} (${j.jifYear}) · JCR ${[...new Set(j.categories.map(v=>'Q'+v.zone))].join('/')||'待核实'} (${j.year})`:'IF / JCR 待核实';
 return {zoneLabel,metricLabel,zoneValidUntil:(Date.parse(c.checkedAt)+30*86400000)/1000,zoneDetail:[`中科院 ${c.year}`, ...c.major.map(v=>'大类 '+v.name+' '+v.zone+'区'),...c.minor.map(v=>'小类 '+v.name+' '+v.zone+'区'),metricLabel,metrics.provenance].filter(Boolean).join('；')};
}
export function readingDashboard(documents,weekly,now=new Date()){
 const start=new Date(now);start.setHours(0,0,0,0);start.setDate(start.getDate()-((start.getDay()+6)%7));
 const end=new Date(start);end.setDate(end.getDate()+7);
 const inWeek=value=>{const time=Date.parse(value);return time>=start.getTime()&&time<end.getTime()&&time<=now.getTime()};
 const active=documents.filter(doc=>!doc.deletedAt);
 const completed=active.filter(doc=>doc.status==='complete'&&doc.card?.savedAt);
 const current=weekly&&inWeek(weekly.generatedAt),items=current?(weekly.items||[]):[];
 const ranked=items.filter(item=>Number.isInteger(item.aiRank)&&item.aiRank>0);
 const papers=[...active].sort((a,b)=>String(b.lastReadAt||b.updatedAt||'').localeCompare(String(a.lastReadAt||a.updatedAt||''))).slice(0,5).map(doc=>{
  const total=doc.pages?.length||0;
  const translated=Array.from({length:total},(_,i)=>doc.translations?.[i+1]?.file).filter(Boolean).length;
  return {...widgetJournal(doc.journalMetrics),id:doc.id,title:doc.title,page:Math.max(1,Math.min(doc.page||1,total||1)),total,translated,hasCard:!!doc.card,complete:doc.status==='complete'&&!!doc.card,pdfReady:total>0&&translated===total,lastReadAt:doc.lastReadAt||null};
 });
 return {recommended:ranked.length||items.length,candidates:items.length,ranked:ranked.length>0,readThisWeek:completed.filter(doc=>inWeek(doc.card.savedAt)).length,totalRead:completed.length,inProgress:active.length-completed.length,papers,weekStart:start.toISOString(),generatedAt:weekly?.generatedAt||null,weeklyCurrent:!!current,updatedAt:now.toISOString()};
}
