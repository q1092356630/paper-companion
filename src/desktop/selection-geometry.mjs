export function normalizedRects(rects,box){
 if(!box.width||!box.height)return [];
 const unique=new Map();
 for(const r of rects){const left=Math.max(box.left,r.left),top=Math.max(box.top,r.top),right=Math.min(box.left+box.width,r.right),bottom=Math.min(box.top+box.height,r.bottom);if(right-left<1||bottom-top<1)continue;const item={x:(left-box.left)/box.width,y:(top-box.top)/box.height,width:(right-left)/box.width,height:(bottom-top)/box.height};const key=Object.values(item).map(n=>n.toFixed(4)).join(':');unique.set(key,item)}
 return [...unique.values()].slice(0,300);
}
