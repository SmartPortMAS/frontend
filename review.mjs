import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1600,height:1000} });
const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,100)));
// 1 대시보드 상단(KPI+지도)
await p.goto('http://localhost:3000/',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(7000);
await p.screenshot({path:'shots/r1-dashboard.png'});
// 2 협상 로그 — 판정 대상 수 확인
await p.getByRole('button',{name:/에이전트 협상 로그/}).click();
await p.waitForTimeout(2500);
const opts=await p.locator('select').last().locator('option').allInnerTexts();
const assumed=opts.filter(o=>o.includes('선종 추정')).length;
console.log(`콘솔 판정 대상: ${opts.length}척 (실신고 ${opts.length-assumed} + 선종추정 ${assumed})`);
await p.screenshot({path:'shots/r2-console.png',clip:{x:1130,y:380,width:470,height:620}});
await p.keyboard.press('Escape'); await p.locator('.alert-bell').first().click().catch(()=>{});
// 3 선석 배정현황
await p.goto('http://localhost:3000/berth-assignments',{waitUntil:'networkidle'});
await p.waitForTimeout(7000);
await p.screenshot({path:'shots/r3-assignments.png'});
// 4 안전 탭
await p.goto('http://localhost:3000/safety',{waitUntil:'networkidle'});
await p.waitForTimeout(8000);
await p.screenshot({path:'shots/r4-safety.png'});
console.log('ERRORS:',errs.length?errs.slice(0,3):'0');
await b.close();
