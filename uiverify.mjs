import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1600,height:1050} });
const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,120)));
// 1) 대시보드 — 배정 시뮬레이션 패널 사라졌는지
await p.goto('http://localhost:3000/',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(6000);
const dash=await p.locator('#root').innerText();
console.log('배정 시뮬레이션 패널:', dash.includes('선석 배정 시뮬레이션')?'❌ 아직 있음':'제거됨 ✅');
// 2) 콘솔 — BLUE KINGDOM(배정불가 케이스) 종합판정 → 안전 스킵 발화 + 접힘
await p.getByRole('button',{name:/에이전트 협상 로그/}).click();
await p.waitForTimeout(2000);
const sel=p.locator('select').last();
const opts=await sel.locator('option').allInnerTexts();
const bk=opts.find(o=>o.includes('BLUE KINGDOM'));
if(bk){ await sel.selectOption({label:bk}); await p.waitForTimeout(1500); }
await p.getByRole('button',{name:/종합 판정/}).click();
await p.waitForTimeout(30000);
const con=await p.locator('#root').innerText();
console.log('안전 스킵 발화:', con.includes('안전 심사 생략')?'표시됨 ✅':'❌ 없음');
console.log('근거 접힘:', con.includes('더 보기')?'접힘 ✅':'(3건 이하라 펼침일 수 있음)');
await p.screenshot({path:'shots/40-console-skip.png',clip:{x:1130,y:60,width:470,height:940}});
// 3) 안전 탭 — 신선도 축·출처 문단·접힌 카드
await p.goto('http://localhost:3000/safety',{waitUntil:'networkidle'});
await p.waitForTimeout(8000);
const saf=await p.locator('#root').innerText();
console.log('신선도 축:', saf.includes('데이터 신선도')?'❌ 남음':'제거됨 ✅');
console.log('출처 문단:', saf.includes('mart.berth_current_cargo')?'❌ 남음':'제거됨 ✅');
console.log('위험 카드 접기:', (await p.getByText('상세 설명').count())>0?'접힘 ✅':'❌');
const m=saf.match(/종합 ([\d.]+)/); console.log('종합 점수(신선도 제외 재계산):', m?m[1]:'?');
await p.screenshot({path:'shots/41-safety-clean.png'});
// 4) 센서 탭
await p.goto('http://localhost:3000/sensors',{waitUntil:'networkidle'});
await p.waitForTimeout(4000);
const sen=await p.locator('#root').innerText();
console.log('센서 장문 안내:', sen.includes('이 화면의 값은 실측이 아닙니다')?'❌ 남음':'제거됨 ✅');
console.log('배지 유지:', sen.includes('시뮬레이션 모드')?'유지 ✅':'❌ 사라짐');
console.log('ERRORS:',errs.length? errs.slice(0,3):'0 ✅');
await b.close();
