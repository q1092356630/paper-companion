export const maximumTopics=12;
export function normalizeTopics(value){
 const raw=Array.isArray(value)?value:typeof value==='string'?value.split(/[;；\n,，]/):[];
 if(raw.length>maximumTopics)throw new Error(`最多添加 ${maximumTopics} 个关键词`);
 const seen=new Set(),topics=[];for(const entry of raw){if(typeof entry!=='string')throw new Error('关键词必须为文字');const word=entry.trim();if(word.length>120)throw new Error('每个关键词请控制在 120 个字符以内');if(word&&!seen.has(word.toLocaleLowerCase())){topics.push(word);seen.add(word.toLocaleLowerCase())}}return topics;
}
export function normalizeTopicOperator(value){if(value==null)return 'or';if(value!=='or'&&value!=='and')throw new Error('关键词匹配方式必须为 OR 或 AND');return value}
