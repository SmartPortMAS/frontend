import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1600,height:1000} });
const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,120)));
// /safety 에서 콘솔 접근 + 인용 오버레이 라이트 확인
await p.goto('http://localhost:3000/safety',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(6000);
const btn=p.getByRole('button',{name:/에이전트 협상 로그/});
console.log('safety 에서 콘솔 버튼:', await btn.count()?'✅':'❌');
await btn.click(); await p.waitForTimeout(1500);
await p.getByRole('button',{name:'질의응답'}).click(); await p.waitForTimeout(1200);
await p.getByText('벤젠 취급 시 착용해야 할 보호구는?').first().click();
await p.waitForTimeout(16000);
const cit=p.locator('text=/노출방지|주요 유해성|근거/').first();
if(await cit.count()){ await cit.click(); await p.waitForTimeout(1500); }
await p.screenshot({path:'shots/45-citation-light.png',clip:{x:1130,y:60,width:470,height:940}});
// 배정현황·트윈 가드
await p.goto('http://localhost:3000/berth-assignments',{waitUntil:'networkidle'}); await p.waitForTimeout(4000);
console.log('배정현황 콘솔:', await p.getByRole('button',{name:/에이전트 협상 로그/}).count()?'✅':'❌');
await p.goto('http://localhost:3000/twin',{waitUntil:'networkidle'}); await p.waitForTimeout(5000);
console.log('트윈 콘솔 숨김:', await p.getByRole('button',{name:/에이전트 협상 로그/}).count()===0?'✅':'❌');
console.log('ERRORS:',errs.length?errs.slice(0,3):'0');
await b.close();
