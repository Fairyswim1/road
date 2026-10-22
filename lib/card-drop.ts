// A drop moves one owned card. A replaced card returns to the inventory.
export function dropCard(board:(string|null)[],id:string,target:number|"inventory"){
 if(board.length!==36||!id||(target!=="inventory"&&(!Number.isInteger(target)||target<0||target>=36)))throw Error("잘못된 카드 배치입니다.");
 const next=board.map(x=>x===id?null:x);if(target!=="inventory")next[target]=id;return next;
}
