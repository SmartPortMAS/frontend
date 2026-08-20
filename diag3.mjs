import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
await p.goto('http://localhost:3000/', { waitUntil:'networkidle', timeout:60000 });
await p.waitForTimeout(7000);
// 액체화물선 필터
const f = p.getByRole('button', { name: /액체화물선/ });
if (await f.count()) { await f.first().click(); await p.waitForTimeout(2500); }
for (let i=0;i<4;i++){
  await p.locator('table tbody tr').nth(i).click().catch(()=>{});
  await p.waitForTimeout(1500);
  const t = await p.locator('.vessel-detail-panel').innerText().catch(()=> '');
  const lines = t.split('\n').map(s=>s.trim()).filter(Boolean);
  const name = lines[0];
  const idx = lines.findIndex(l=>l.includes('배정 가능 선석'));
  console.log(`${i} ${name.slice(0,16).padEnd(16)} | 조회불가문구: ${lines.slice(idx+1,idx+3).join(' / ').slice(0,70)}`);
}
await b.close();
