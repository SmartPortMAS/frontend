import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1600,height:1000} });
await p.goto('http://localhost:4599/',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(6000);
await p.getByRole('button',{name:/에이전트 협상 로그/}).click();
await p.waitForTimeout(1500);
await p.getByRole('button',{name:'질의응답'}).click();
await p.waitForTimeout(1500);
// 추천 질문 클릭
const sug = p.getByText('벤젠 취급 시 착용해야 할 보호구는?').first();
if (await sug.count()) {
  await sug.click(); await p.waitForTimeout(4000);
  const t = await p.locator('#root').innerText();
  const ans = t.split('\n').filter(l=>/보호|장갑|보안경|호흡|추천 질문에만/.test(l)).slice(0,3);
  console.log('배포본 챗봇 응답:', ans.join(' | ').slice(0,150) || '(응답 없음)');
  await p.screenshot({path:'shots/36-snapshot-qa.png',clip:{x:1130,y:60,width:470,height:940}});
} else console.log('추천 질문 버튼 없음');
// 자유 질문도 확인
const input = p.locator('input[type="text"], textarea').last();
if (await input.count()){
  await input.fill('아세톤은 어떻게 보관하나요?');
  await input.press('Enter'); await p.waitForTimeout(3500);
  const t2 = await p.locator('#root').innerText();
  const lim = t2.split('\n').find(l=>l.includes('추천 질문에만')||l.includes('저장된'));
  console.log('자유 질문 안내:', (lim||'(안내 없음)').slice(0,100));
}
await b.close();
