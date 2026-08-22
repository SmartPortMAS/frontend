import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1600,height:1000} });
await p.goto('http://localhost:3000/safety',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(6000);
await p.getByRole('button',{name:/에이전트 협상 로그/}).click({timeout:15000});
await p.waitForTimeout(1500);
await p.getByRole('button',{name:'질의응답'}).click();
await p.waitForTimeout(1200);
await p.getByText('벤젠 취급 시 착용해야 할 보호구는?').first().click();
await p.waitForTimeout(14000);
const cit = p.locator('text=/노출방지|유사도|확정값/').first();
if (await cit.count()) { await cit.click(); await p.waitForTimeout(1800); }
await p.screenshot({path:'shots/44-citation-light.png',clip:{x:1130,y:60,width:470,height:940}});
console.log('캡처 완료');
await b.close();
