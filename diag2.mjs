import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
await p.goto('http://localhost:3000/', { waitUntil:'networkidle', timeout:60000 });
await p.waitForTimeout(7000);
let hit=0;
for (let i=0;i<12;i++){
  await p.locator('table tbody tr').nth(i).click().catch(()=>{});
  await p.waitForTimeout(1200);
  const t = await p.locator('.vessel-detail-panel').innerText().catch(()=> '');
  const name=(t.split('\n')[0]||'').trim();
  const seg=t.split('배정 가능 선석')[1]||'';
  const line=seg.split('\n').filter(Boolean).slice(0,2).join(' ');
  const btn=await p.getByRole('button',{name:/접안 가능한 선석 조회/}).count();
  if(btn) hit++;
  console.log(`${i} ${name.slice(0,18).padEnd(18)} 버튼${btn} | ${line.slice(0,60)}`);
}
console.log('버튼 있는 행:', hit, '/12');
await b.close();
