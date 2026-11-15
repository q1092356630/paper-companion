import test from 'node:test';
import assert from 'node:assert/strict';
import {enrichWeekly} from '../desktop/weekly-brief.mjs';
const source={topics:['结直肠癌'],items:[{doi:'10.1/a',title:'A',abstract:''},{doi:'10.1/b',title:'B',abstract:'Study abstract'}]};
test('weekly AI can rank supplied sources without dropping other candidates',async()=>{
 const value=await enrichWeekly({},source,{complete:async()=>({brief:'基于元数据的简报',picks:[{doi:'10.1/b',reason:'方法相关',question:'是否独立验证？'}]})});
 assert.deepEqual(value.items.map(i=>i.doi),['10.1/b','10.1/a']);assert.equal(value.items[0].readingQuestion,'是否独立验证？');assert.equal(source.items[0].doi,'10.1/a');
});
test('invented or duplicate DOI recommendations cannot be saved as verified sources',async()=>{
 const pick={doi:'10.1/a',reason:'相关',question:'需要核对什么？'};
 for(const picks of [[{...pick,doi:'10.9/invented'}],[pick,pick]])await assert.rejects(enrichWeekly({},source,{complete:async()=>({brief:'简报',picks})}),/来源核验/);
});
