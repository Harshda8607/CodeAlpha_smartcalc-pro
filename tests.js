// Run: node tests.js   (tests engine + state machine; UI items are manual)
const { S, run, view } = require('./script.js');
const K = { '+':['op','+'],'-':['op','−'],'*':['op','×'],'/':['op','÷'],'^':['op','^'],'.':['dot'],'=':['eq'],'%':['pct'],
  '<':['bs'],'C':['ac'],'E':['ce'],'n':['neg'],'q':['sq'],'r':['sqrt'],'i':['inv'],'a':['ms'],'b':['mp'],'c':['mm'],'d':['mr'],'e':['mc'],'(':['lp'],')':['rp'] };
const press = s => [...s].forEach(c => run(...(/\d/.test(c) ? ['d', c] : K[c])));
const T = [
 ['5 + 3','5+3=','main','8'],['10 − 4','10-4=','main','6'],['6 × 7','6*7=','main','42'],['20 ÷ 4','20/4=','main','5'],
 ['2 + 3 × 4 (precedence)','2+3*4=','main','14'],['0.1 + 0.2','.1+.2=','main','0.3'],['0.1 × 3','.1*3=','main','0.3'],
 ['5 − 9 (negative result)','5-9=','main','−4'],['1.5 × 2.5','1.5*2.5=','main','3.75'],['−3 × −2 via ± ','3n*2n=','main','6'],
 ['50%','50%=','main','0.5'],['200 × 10%','200*10%=','main','20'],['200 + 10%','200+10%=','main','220'],['200 − 10%','200-10%=','main','180'],
 ['5 ÷ 0','5/0=','main','Error'],['5 ÷ 0 message','5/0=','line','Cannot divide by zero'],
 ['Backspace on 12','12<','main','1'],['AC after 5+3','5+3C','expr',''],['CE on 5+37','5+37E','expr','5+'],
 ['Leading zero 007','007','main','7'],['Double decimal 7.7.7','7.7.7','main','7.77'],['Operator replace 5+*','5+*','expr','5×'],
 ['Incomplete 5+ =','5+=','main','5'],['Empty =','=','main','0'],['Repeated = 2+3==','2+3==','main','8'],['Repeated = 2+3===','2+3===','main','11'],
 ['Repeated = 2×3==','2*3==','main','18'],['Live preview 2+3×4','2+3*4','preview','= 14'],
 ['Memory MS/M+/MR','5aC3bCd','main','8'],['Memory M−','9aC4cCd','main','5'],['Memory MC','5aCeCd','main','0'],
 ['√9','9r=','main','3'],['5²','5q=','main','25'],['1/4','4i=','main','0.25'],['2^10','2^10=','main','1024'],['2^0.5','2^.5=','main','1.41421356237'],
 ['Brackets (2+3)×4','(2+3)*4=','main','20'],['Unclosed bracket (2+3 =','(2+3=','main','5'],['Overflow 9^999','9^999=','main','Error'],
 ['5 ± + 3','5n+3=','main','−2'],['Continue after = (8 × 2)','5+3=*2=','main','16'],
];
let pass = 0;
console.log('| Test | Input | Expected | Actual | Result |\n|---|---|---|---|---|');
for (const [name, keys, f, exp] of T) {
  run('reset'); S.history = []; press(keys);
  const act = f === 'expr' ? S.expr : view()[f];
  const ok = act === exp; pass += ok;
  console.log(`| ${name} | \`${keys}\` | ${exp || '(empty)'} | ${act || '(empty)'} | ${ok ? 'PASS' : 'FAIL'} |`);
}
run('reset'); S.history = []; press('1+1=C2*2=');
const h = S.history.map(x => x.e + '=' + x.r).join(';');
const hOk = h === '2×2=4;1+1=2'; pass += hOk;
console.log(`| History saved (newest first) | \`1+1=C2*2=\` | 2×2=4;1+1=2 | ${h} | ${hOk ? 'PASS' : 'FAIL'} |`);
run('hexp', 1); const rOk = S.expr === '1+1'; pass += rOk;
console.log(`| History recall expression | click 1+1 | 1+1 | ${S.expr} | ${rOk ? 'PASS' : 'FAIL'} |`);
run('hclear'); const cOk = S.history.length === 0; pass += cOk;
console.log(`| History clear | Clear | 0 items | ${S.history.length} | ${cOk ? 'PASS' : 'FAIL'} |`);
console.log(`\n${pass}/${T.length + 3} passed`);
process.exit(pass === T.length + 3 ? 0 : 1);
