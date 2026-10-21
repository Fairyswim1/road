// Small, bounded exact arithmetic for classroom answers. Never executes input.
type Q={n:bigint;d:bigint};
type A=Map<bigint,Q>;
const B=BigInt,Z=B(0),O=B(1),LIMIT=B('10000000000');
const abs=(x:bigint)=>x<Z?-x:x;
function gcd(a:bigint,b:bigint):bigint{a=abs(a);b=abs(b);while(b){const c=a%b;a=b;b=c;}return a||O;}
function q(n:bigint,d=O):Q{if(!d)throw Error('zero');if(d<Z){n=-n;d=-d;}const g=gcd(n,d);n/=g;d/=g;if(n.toString().length>100||d.toString().length>100)throw Error('large');return {n,d};}
const addQ=(a:Q,b:Q)=>q(a.n*b.d+b.n*a.d,a.d*b.d);
const mulQ=(a:Q,b:Q)=>q(a.n*b.n,a.d*b.d);
function scalar(n:bigint,d=O):A{return n?new Map([[O,q(n,d)]]):new Map();}
function add(a:A,b:A,sign=O):A{const out=new Map(a);for(const[r,c]of b){const v=addQ(out.get(r)||q(Z),q(c.n*sign,c.d));if(v.n)out.set(r,v);else out.delete(r);}if(out.size>32)throw Error('complex');return out;}
function mul(a:A,b:A):A{let out:A=new Map();for(const[r,c]of a)for(const[s,d]of b){const g=gcd(r,s),rad=(r/g)*(s/g);if(rad>LIMIT)throw Error('radical large');out=add(out,new Map([[rad,mulQ(mulQ(c,d),q(g))]]));}return out;}
function firstPrime(n:bigint){if(n%B(2)===Z)return B(2);for(let p=B(3);p*p<=n;p+=B(2)){if(n%p===Z)return p;}return n;}
function inverse(a:A,depth=0):A{
 if(!a.size)throw Error('zero');if(depth>10)throw Error('complex');
 if(a.size===1&&a.has(O)){const c=a.get(O)!;return scalar(c.d,c.n);}
 const r=[...a.keys()].find(r=>r!==O)!;const p=firstPrime(r);
 const conjugate=new Map([...a].map(([r,c])=>[r,q(r%p===Z?-c.n:c.n,c.d)]));
 return mul(conjugate,inverse(mul(a,conjugate),depth+1));
}
function squarePart(n:bigint){if(n<Z||n>LIMIT)throw Error('root range');let outside=O,inside=O;for(let p=B(2);p*p<=n;p+=p===B(2)?O:B(2)){let count=0;while(n%p===Z){n/=p;count++;}for(let i=0;i<Math.floor(count/2);i++)outside*=p;if(count%2)inside*=p;}inside*=n;return {outside,inside};}
function root(a:A):A{if(!a.size)return scalar(Z);if(a.size!==1||!a.has(O))throw Error('nested root');const c=a.get(O)!;if(c.n<Z)throw Error('negative root');const n=squarePart(c.n),d=squarePart(c.d);const rad=n.inside*d.inside;if(rad>LIMIT)throw Error('root range');return new Map([[rad,q(n.outside,d.outside*d.inside)]]);}
export function normalizeAnswer(value:string){return value.normalize('NFKC').replace(/\s/g,'').replace(/[−–]/g,'-').replace(/[×·]/g,'*').replace(/÷/g,'/').toLowerCase();}
export function parseMathAnswer(value:string):A{
 const source=normalizeAnswer(value).replace(/√/g,'sqrt');if(!source||source.length>100)throw Error('length');
 const tokens=source.match(/sqrt|\d+(?:\.\d+)?|[()+\-*/^]/g)||[];
 if(tokens.join('')!==source||tokens.length>80)throw Error('syntax');let pos=0,operations=0;
 const tick=()=>{if(++operations>150)throw Error('complex');};
 function atom():A{tick();const t=tokens[pos++];if(t==='('){const a=sum();if(tokens[pos++]!==')')throw Error('parenthesis');return a;}if(t==='sqrt')return root(atom());if(!t||!/^\d/.test(t)||t.replace('.','').length>10)throw Error('number');const[a,b='']=t.split('.');return scalar(B(a+b),B(10)**B(b.length));}
 function power():A{let a=atom();if(tokens[pos]==='^'){pos++;let negative=false;if(tokens[pos]==='-'){negative=true;pos++;}const t=tokens[pos++];if(!/^\d+$/.test(t||'')||Number(t)>10)throw Error('exponent');let v=scalar(O);for(let i=0;i<Number(t);i++){tick();v=mul(v,a);}a=negative?inverse(v):v;}return a;}
 function unary():A{if(tokens[pos]==='+'||tokens[pos]==='-'){const sign=tokens[pos++];return mul(scalar(sign==='-'?-O:O),unary());}return power();}
 function product():A{let a=unary();while(pos<tokens.length){const t=tokens[pos];if(t==='*'||t==='/'){pos++;tick();const b=unary();a=mul(a,t==='/'?inverse(b):b);}else if(t==='('||t==='sqrt'){tick();a=mul(a,unary());}else break;}return a;}
 function sum():A{let a=product();while(tokens[pos]==='+'||tokens[pos]==='-'){const t=tokens[pos++];tick();a=add(a,product(),t==='-'?-O:O);}return a;}
 const result=sum();if(pos!==tokens.length)throw Error('trailing');return result;
}
export function answersEquivalent(input:string,expected:string):boolean{
 try{const a=parseMathAnswer(input),b=parseMathAnswer(expected);return add(a,b,-O).size===0;}catch{
  // Preserve existing lessons whose teacher intentionally used a non-math answer.
  try{parseMathAnswer(expected);return false;}catch{return !!normalizeAnswer(input)&&normalizeAnswer(input)===normalizeAnswer(expected);}
 }
}
