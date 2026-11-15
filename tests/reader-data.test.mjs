import test from 'node:test';
import assert from 'node:assert/strict';
import {createCard,cardMarkdown,initialMessages,demoAnswer} from '../src/demo.js';

test('card keeps unanswered questions separate from evidence and retains personal notes in export',()=>{
  const unknown={id:'q',role:'user',text:'训练耗时是多少？'};
  const answer={id:'a',role:'assistant',...demoAnswer(unknown.text,5)};
  const notes=[{id:1,page:5,text:'重复评估',comment:'需要独立验证。'}];
  const card=createCard([...initialMessages,unknown,answer],notes,null);
  assert.equal(card.qa[1].resolved,false);
  assert.deepEqual(card.sources,[5]);
  const text=cardMarkdown(card);
  assert.match(text,/## 尚未解决\n- 训练耗时是多少？/);
  assert.match(text,/我的想法：需要独立验证。/);
});

test('updating a card preserves manual edits and original save time',()=>{
  const card=createCard(initialMessages,[],null);
  card.insight='我的研究需要补充跨数据集验证。';
  card.conclusion='自己的结论。';
  const next=createCard([...initialMessages,{role:'user',text:'局限？'},{role:'assistant',...demoAnswer('局限？',5)}],[],card);
  assert.equal(next.insight,card.insight);
  assert.equal(next.conclusion,card.conclusion);
  assert.equal(next.savedAt,card.savedAt);
  assert.equal(next.qa.length,2);
  assert.deepEqual(next.sources,[5,9]);
});
