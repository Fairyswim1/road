import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseMathAnswer,answersEquivalent as equal} from '../lib/math-answer.ts';
for(const [a,b] of [['2/4','1/2'],['0.5','1/2'],['2√(2)','sqrt(8)'],['√(8/9)','2*sqrt(2)/3'],['1/√(2)','sqrt(2)/2'],['1/(1+sqrt(2))','sqrt(2)-1'],['(sqrt(2)+sqrt(3))^2','5+2sqrt(6)'],['√(2)*√(3)','sqrt(6)'],['-2^2','-4'],['2^-2','1/4'],['2(3+4)','14'],['sqrt(0)','0'],['0.1+0.2','3/10'],['－２÷４','-1/2'],['  정답  ','정답']])assert.equal(equal(a,b),true,`${a} = ${b}`);
for(const [a,b]of [['0.333333','1/3'],['1.414214','sqrt(2)'],['1/0','0'],['sqrt(-1)','1'],['2+2','5'],['','0'],['0^0','1/2'],['process.exit()','0'],['sqrt(sqrt(2))','sqrt(2)'],['2**3','8']])assert.equal(equal(a,b),false,`${a} != ${b}`);
for(const v of ['1/0','0/0','sqrt(-2)','9'.repeat(101),'2^1000','sqrt(10000000001)','eval(1)','(1+2','1+'])assert.throws(()=>parseMathAnswer(v),v);
const bank=JSON.parse(fs.readFileSync(new URL('../lib/problem-bank-data.json',import.meta.url),'utf8'));
assert.equal(bank.length,100);assert.equal(new Set(bank.map(p=>p.id)).size,100);
for(const subject of ['수학Ⅰ','수학Ⅱ','확률과 통계','미적분','기하']){
 const p=bank.filter(p=>p.subject===subject);assert.equal(p.length,20);
 for(const [level,n]of [['기본 응용',8],['심화 응용',8],['도전',4]])assert.equal(p.filter(p=>p.difficulty===level).length,n);
}
for(const p of bank){assert.doesNotThrow(()=>parseMathAnswer(p.answer),p.id);assert.ok(p.source.code);assert.ok(p.solutionHtml);}
console.log('PASS: exact fraction/radical equivalence, safe invalid-input handling, 100 answers parse, 5 subjects × 8/8/4 balance');
