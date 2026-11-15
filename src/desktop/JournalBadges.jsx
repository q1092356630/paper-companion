export function JournalBadges({paper}){
 const m=paper?.journalMetrics;
 if(m?.status==='not-applicable')return <span className="journal-badges" title={m.reason}><span>中科院 / IF / JCR：不适用</span></span>;
 const cas=m?.cas,jcr=m?.jcr;
 const casText=cas?`${cas.year} 中科院 ${cas.major.map(c=>c.zone+'区').join('/')||'大类待核实'}${cas.minor.some(c=>c.zone===1)?' · 小类1区':''}${!cas.current?'（待更新）':''}`:'中科院：待核实';
 const jifText=jcr?`IF ${jcr.jifDisplay??jcr.jif??'未公布'} · ${jcr.jifYear}${!jcr.current?'（待更新）':''}`:'IF：待核实';
 const quartiles=jcr?[...new Set(jcr.categories.map(c=>'Q'+c.zone))].join('/') :'';
 const jcrText=jcr?`JCR ${quartiles||'待核实'} · ${jcr.year}${!jcr.current?'（待更新）':''}`:'JCR：待核实';
 const detail=[m?.journal||paper?.journal||'期刊待识别',m?.reason||'等待有来源的期刊指标',cas&&`中科院 ${cas.year}：大类 ${cas.major.map(c=>c.name+' '+c.zone+'区').join('；')||'未提供'}；小类 ${cas.minor.map(c=>c.name+' '+c.zone+'区').join('；')||'未提供'}`,cas&&`分区来源 ${cas.source}；核对 ${cas.checkedAt}`,jcr&&`JCR ${jcr.year}：${jcr.categories.map(c=>c.name+' Q'+c.zone).join('；')}`,jcr&&`JCR 来源 ${jcr.source}；核对 ${jcr.checkedAt}`,m?.provenance,'IF = 期刊影响因子（Journal Impact Factor）；JCR = 期刊引证报告（Journal Citation Reports）。期刊指标不代表单篇文章质量。'].filter(Boolean).join('\n');
 return <span className="journal-badges" title={detail} aria-label={detail}>{(m?.journal||paper?.journal)&&<span className="journal-name">{m?.journal||paper.journal}</span>}<span className={m?.eligible?'journal-zone-one':''}>{casText}</span><span>{jifText}</span><span>{jcrText}</span>{m?.provider==='showjcr'&&<span>社区数据</span>}{cas?.top&&<span>中科院 Top</span>}</span>;
}
