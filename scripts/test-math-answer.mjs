import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseMathAnswer,answersEquivalent as equal} from '../lib/math-answer.ts';
for(const [a,b] of [['2/4','1/2'],['0.5','1/2'],['2√(2)','sqrt(8)'],['√(8/9)','2*sqrt(2)/3'],['1/√(2)','sqrt(2)/2'],['1/(1+sqrt(2))','sqrt(2)-1'],['(sqrt(2)+sqrt(3))^2','5+2sqrt(6)'],['√(2)*√(3)','sqrt(6)'],['-2^2','-4'],['2^-2','1/4'],['2(3+4)','14'],['sqrt(0)','0'],['0.1+0.2','3/10'],['－２÷４','-1/2'],['  정답  ','정답']])assert.equal(equal(a,b),true,`${a} = ${b}`);
for(const [a,b]of [['0.333333','1/3'],['1.414214','sqrt(2)'],['1/0','0'],['sqrt(-1)','1'],['2+2','5'],['','0'],['0^0','1/2'],['process.exit()','0'],['sqrt(sqrt(2))','sqrt(2)'],['2**3','8']])assert.equal(equal(a,b),false,`${a} != ${b}`);
for(const v of ['1/0','0/0','sqrt(-2)','9'.repeat(101),'2^1000','sqrt(10000000001)','eval(1)','(1+2','1+'])assert.throws(()=>parseMathAnswer(v),v);
console.log('PASS: exact fraction/radical equivalence and bounded invalid-input handling');
