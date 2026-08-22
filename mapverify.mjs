import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1600,height:1000} });
const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,120)));
await p.goto('http://localhost:3000/',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(6500);
await p.screenshot({path:'shots/42-map-final.png',clip:{x:290,y:320,width:1290,height:680}});
const t=await p.locator('#root').innerText();
console.log('부이 버튼 제거:', t.includes('원유부이 포함')?'❌':'✅');
console.log('범례 축약:', t.includes('클릭 시 기상 판정')?'❌ 옛 문구':'✅');
// 빈 배(추정) 클릭 → 판정 흐름
const lite = p.locator('.vessel-marker--lite').first();
console.log('작은 배 마커 수:', await p.locator('.vessel-marker--lite').count());
// 추정 화물 배 찾기: 전체 마커 순회 대신 목록에서 '선종 미확인' 아닌 액체화물선
await p.getByRole('button',{name:/액체화물선/}).first().click().catch(()=>{});
await p.waitForTimeout(1500);
const rows=p.locator('table tbody tr'); const n=await rows.count();
let found=false;
for(let i=0;i<n&&!found;i++){
  const txt=await rows.nth(i).innerText();
  if(!/에탄올|자일렌|등유|가솔린|톨루엔|벤젠|케로젠|프로페인|부탄|메틸|스티렌|크실렌|황산|디젤|나프타|솔벤트/.test(txt)){
    await rows.nth(i).click(); await p.waitForTimeout(1500);
    const pt=await p.locator('.vessel-detail-panel').innerText().catch(()=>'');
    if(pt.includes('선종 추정')){
      found=true;
      console.log('추정 표식:', '✅', '|', pt.split('\n').find(l=>l.includes('선종 추정'))?.slice(0,50));
      const btn=p.getByRole('button',{name:/접안 가능한 선석 조회/});
      console.log('추정 배 후보조회 버튼:', await btn.count()?'✅':'❌');
      if(await btn.count()){
        await btn.click(); await p.waitForTimeout(10000);
        const pt2=await p.locator('.vessel-detail-panel').innerText().catch(()=>'');
        const c=pt2.match(/(\d)순위 ([^\n]+)/);
        console.log('추정 판정 결과:', c?`✅ ${c[0].slice(0,40)}`:'(후보 없음/오류)');
      }
    }
  }
}
if(!found) console.log('추정 화물 배를 목록에서 못 찾음(선종값 없는 배들일 수 있음)');
await p.screenshot({path:'shots/43-assumed-judge.png',clip:{x:1210,y:0,width:390,height:1000}});
console.log('ERRORS:',errs.length?errs.slice(0,3):'0 ✅');
await b.close();
