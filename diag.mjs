import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
await p.goto('http://localhost:3000/', { waitUntil:'networkidle', timeout:60000 });
await p.waitForTimeout(7000);
console.log('표 행 수(필터 전):', await p.locator('table tbody tr').count());
const f = p.getByRole('button', { name: /액체화물선/ });
console.log('액체화물선 버튼:', await f.count());
if (await f.count()) { await f.first().click(); await p.waitForTimeout(2500); }
console.log('표 행 수(필터 후):', await p.locator('table tbody tr').count());
const r0 = p.locator('table tbody tr').first();
if (await r0.count()) {
  await r0.click(); await p.waitForTimeout(8000);
  const t = await p.locator('.vessel-detail-panel').innerText().catch(()=> '(패널 없음)');
  console.log('패널 첫 줄:', t.split('\n').slice(0,3).join(' | '));
  console.log('후보 조회 버튼:', await p.getByRole('button',{name:/접안 가능한 선석 조회/}).count());
}
await b.close();
