import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:3000';
const b = await chromium.launch();
const pages = [['/','대시보드'],['/berth-assignments','선석 배정현황'],['/safety','안전/환경'],['/twin','3D 관제'],['/sensors','센서']];
let totalErr = 0;
for (const [path,name] of pages) {
  const p = await b.newPage({ viewport:{width:1600,height:1000} });
  const errs=[]; const fails=[];
  p.on('pageerror',e=>errs.push(e.message.slice(0,100)));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,100))});
  p.on('response',r=>{if(r.status()>=400)fails.push(`${r.status()} ${r.url().split('/').slice(-2).join('/').slice(0,40)}`)});
  const t0=Date.now();
  try {
    await p.goto(BASE+path,{waitUntil:'networkidle',timeout:60000});
    await p.waitForTimeout(6000);
    const loadMs=Date.now()-t0-6000;
    const txt=await p.locator('#root').innerText().catch(()=>'');
    const empty = txt.trim().length<100;
    console.log(`${name.padEnd(10)} ${path.padEnd(20)} 로드 ${String(loadMs).padStart(5)}ms · 에러 ${errs.length} · HTTP실패 ${fails.length}${empty?' · ⚠️빈화면':''}`);
    [...new Set([...errs,...fails])].slice(0,3).forEach(e=>console.log(`    - ${e}`));
    totalErr += errs.length + fails.length;
  } catch(e){ console.log(`${name}: ❌ ${e.message.slice(0,80)}`); totalErr++; }
  await p.close();
}
console.log(`\n합계 오류: ${totalErr}${totalErr===0?' ✅':''}`);
await b.close();
