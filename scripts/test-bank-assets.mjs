import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {parseMathAnswer} from '../lib/math-answer.ts';
const index=JSON.parse(fs.readFileSync('lib/problem-bank-data.json','utf8'));
const baseline=JSON.parse(fs.readFileSync('scripts/problem-bank-baseline.json','utf8'));
assert.equal(index.length,1000);assert.equal(new Set(index.map(p=>p.id)).size,1000);
const seen=new Set(),families=new Map(),answers=new Map(),entries=[];
for(const p of index){
 assert.ok(!p.answer&&!p.solutionHtml);assert.match(p.asset,/^[a-f0-9]{64}$/);
 const packed=fs.readFileSync(`public/bank-assets/${p.asset}.bin`);
 assert.equal(crypto.createHash('sha256').update(packed).digest('hex'),p.asset);
 const decipher=crypto.createDecipheriv('aes-256-gcm',Buffer.from(p.key,'base64'),packed.subarray(0,12));decipher.setAuthTag(packed.subarray(-16));
 const detail=JSON.parse(zlib.gunzipSync(Buffer.concat([decipher.update(packed.subarray(12,-16)),decipher.final()])));
 assert.equal(detail.id,p.id);assert.doesNotThrow(()=>parseMathAnswer(detail.answer),p.id);
 const image=Buffer.from(detail.image,'base64');assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(image.readUInt32BE(16),960);assert.equal(image.readUInt32BE(20),detail.height);assert.ok(image.length>1000&&image.length<4000000);
 assert.ok(detail.solutionHtml);assert.doesNotMatch(detail.solutionHtml,/<script|javascript:|onerror\s*=/i);
 const prompt=JSON.stringify(detail.blocks);assert.ok(!seen.has(prompt),'duplicate prompt '+p.id);seen.add(prompt);
 const hash=crypto.createHash('sha256').update(JSON.stringify({blocks:detail.blocks,answer:detail.answer})).digest('hex');if(baseline[p.id])assert.equal(hash,baseline[p.id],'original content changed '+p.id);
 if(p.familyId){const variants=families.get(p.familyId)||new Set();assert.ok(!variants.has(p.variant));variants.add(p.variant);families.set(p.familyId,variants);assert.match(detail.source.book,/자체 제작/);}
 entries.push(detail);answers.set(p.id,detail.answer);
 // Public ciphertext must not be a directly readable question or image.
 assert.ok(!packed.includes(Buffer.from('수식로드')));assert.notEqual(packed.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
}
assert.equal(families.size,100);for(const v of families.values())assert.deepEqual([...v].sort(),[1,2,3,4,5,6,7,8,9]);
assert.equal(Object.keys(baseline).length,100);
for(const subject of ['수학Ⅰ','수학Ⅱ','확률과 통계','미적분','기하']){
 const p=entries.filter(p=>p.subject===subject);assert.equal(p.length,200);
 for(const [level,n]of [['기본 응용',80],['심화 응용',80],['도전',40]])assert.equal(p.filter(p=>p.difficulty===level).length,n);
 assert.equal(new Set(p.filter(p=>p.familyId).map(p=>p.familyId)).size,20);
}
console.log('PASS: 1,000 intact protected images, unique prompts, exact-answer syntax, 100 new families × 9 variants, five subjects × 80/80/40, existing 100 unchanged');
