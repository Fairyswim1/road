export function attachMathKeypad(input,mount){
 input.inputMode='none';input.readOnly=true;input.setAttribute('aria-describedby','math-answer-help');
 const help=document.createElement('p');help.id='math-answer-help';help.className='math-answer-help';help.textContent='분수는 /, 루트는 √( )로 입력해요. 예: 2/3, 3√(2)/2';
 const bar=document.createElement('div');bar.className='math-input-bar';
 const preview=document.createElement('output');preview.className='math-preview';preview.setAttribute('aria-live','polite');
 const toggle=document.createElement('button');toggle.type='button';toggle.className='secondary';toggle.textContent='기기 키보드';
 toggle.onclick=()=>{input.readOnly=!input.readOnly;input.inputMode=input.readOnly?'none':'text';toggle.textContent=input.readOnly?'기기 키보드':'수식 키패드';input.focus();};bar.append(preview,toggle);
 const keypad=document.createElement('div');keypad.className='math-keypad';keypad.setAttribute('aria-label','수학 답안 키패드');
 const update=()=>{preview.textContent=input.value?input.value.replace(/sqrt/g,'√').replace(/\*/g,'×'):'답을 입력하세요';};
 function insert(value){if(input.disabled)return;const a=input.selectionStart??input.value.length,b=input.selectionEnd??a;
  let replacement=value,start=a,end=b,caret;
  if(value==='back'){if(a===b)start=Math.max(0,a-1);replacement='';}
  if(value==='clear'){start=0;end=input.value.length;replacement='';}
  if(value==='left'||value==='right'){input.focus();const p=Math.max(0,Math.min(input.value.length,a+(value==='left'?-1:1)));input.setSelectionRange(p,p);return;}
  if(input.value.length-(end-start)+replacement.length>input.maxLength)return;
  input.setRangeText(replacement,start,end,'end');caret=start+replacement.length;input.focus();input.setSelectionRange(caret,caret);input.dispatchEvent(new Event('input',{bubbles:true}));
 }
 for(const[label,value]of [['7','7'],['8','8'],['9','9'],['/','/'],['√(','√('],['⌫','back'],['4','4'],['5','5'],['6','6'],['×','*'],['(','('],[')',')'],['1','1'],['2','2'],['3','3'],['−','-'],['←','left'],['→','right'],['0','0'],['.','.'],['+','+'],['제곱','^2'],['지우기','clear']]){
  const b=document.createElement('button');b.type='button';b.textContent=label;b.className='math-key';b.setAttribute('aria-label',value==='back'?'한 글자 지우기':label);b.onpointerdown=e=>e.preventDefault();b.onclick=()=>insert(value);keypad.append(b);
 }
 input.addEventListener('input',update);mount.append(help,bar,keypad);update();
 return {reset:update,setDisabled(disabled){for(const b of keypad.querySelectorAll('button'))b.disabled=disabled;toggle.disabled=disabled;}};
}
