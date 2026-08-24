/**
 * 시연 영상 자동 촬영 (2분) — 실제 브라우저를 조작하며 녹화한다.
 *
 * 무음 영상이다. 내레이션은 편집에서 얹으면 된다.
 * 대본: ../시연촬영_대본_2분.md 와 장면 구성이 같다.
 *
 * 실행: node scripts/record_demo.mjs [선박명]
 *       기본 GULF BAYNUNAH — 표와 콘솔이 같은 화물을 보는 배만 쓴다.
 */
import { chromium } from 'playwright';

const VESSEL = process.argv[2] || 'GULF BAYNUNAH';
const OUT = 'C:/Users/hwham/Documents/멀티 에이전트 기반 액체화물 하역 스케줄링 및 관제 시스템/울산항만_프로젝트_최종본/시연영상';
const W = 1920, H = 1080;

const browser = await chromium.launch({ args: ['--force-device-scale-factor=1'] });
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: OUT, size: { width: W, height: H } },
});

// 커서 시각화 — Playwright 영상에는 마우스가 찍히지 않는다.
// 어디를 누르는지 보이지 않으면 조작 영상으로 읽히지 않으므로 직접 그린다.
await ctx.addInitScript(() => {
  const draw = () => {
    if (!document.body || document.getElementById('__cur')) return;
    const d = document.createElement('div');
    d.id = '__cur';
    d.style.cssText = 'position:fixed;left:-99px;top:-99px;width:20px;height:20px;'
      + 'border-radius:50%;background:rgba(220,38,38,.35);border:2px solid rgba(255,255,255,.95);'
      + 'box-shadow:0 2px 10px rgba(0,0,0,.4);z-index:2147483647;pointer-events:none;'
      + 'transform:translate(-50%,-50%);transition:width .1s,height .1s';
    document.body.appendChild(d);
    addEventListener('mousemove', (e) => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => { d.style.width = '34px'; d.style.height = '34px'; }, true);
    addEventListener('mouseup', () => { d.style.width = '20px'; d.style.height = '20px'; }, true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', draw);
  else draw();
  setTimeout(draw, 1200);
});

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));

let cx = W / 2, cy = H / 2;
/** 사람처럼 부드럽게 이동 — 순간이동하면 영상이 튄다. */
async function glide(x, y, steps = 26) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, e = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);  // ease-in-out
    await page.mouse.move(cx + (x - cx) * e, cy + (y - cy) * e);
    await page.waitForTimeout(12);
  }
  cx = x; cy = y;
}
async function clickAt(loc) {
  const b = await loc.boundingBox();
  if (!b) throw new Error('대상을 찾지 못했습니다');
  await glide(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(320);
  await loc.click();
}
const beat = (ms) => page.waitForTimeout(ms);
const mark = (s) => console.log(`  [${((Date.now() - T0) / 1000).toFixed(1).padStart(5)}s] ${s}`);

const T0 = Date.now();
console.log(`촬영 시작 — 대상 ${VESSEL}`);

// ── 장면 1 · 대시보드 (0:00–0:25) ─────────────────────────────────────
await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle', timeout: 90000 });
await beat(3200);
mark('장면1 대시보드');
await glide(1280, 75);                 // 헤더의 기상·수집 상태로 시선 유도
await beat(1800);
await glide(1700, 75);
await beat(1500);
await glide(960, 480, 34);             // 지도 중앙
await beat(1100);
await page.mouse.wheel(0, 300);        // 아주 천천히 훑는다
await beat(1900);
await page.mouse.wheel(0, 300);
await beat(1900);
await page.mouse.wheel(0, -600);
await beat(1500);

// ── 장면 2 · 협상 로그 (0:25–1:05) ───────────────────────────────────
mark('장면2 선석 배정현황');
await clickAt(page.getByRole('link', { name: /선석|배정/ }).first());
await beat(3200);
await page.mouse.wheel(0, 420);        // 선석 점유 목록이 보이게
await beat(2200);

const row = page.locator('tr', { hasText: VESSEL });
await row.scrollIntoViewIfNeeded();
await beat(1200);
mark(`${VESSEL} 행 → 협상 로그`);
await clickAt(row.locator('button', { hasText: '협상 로그' }));
await beat(1800);

mark('종합 판정 실행');
await clickAt(page.getByRole('button', { name: /종합 판정/ }).first());
await page.waitForSelector('text=최종 판단', { timeout: 120000 });
mark('판정 완료 — 3개 에이전트 로그');
await beat(3200);

// 에이전트 로그를 차례로 읽히도록 패널만 스크롤
const panel = page.locator('text=에이전트 협상 로그').locator('xpath=ancestor::div[3]');
const pb = await panel.boundingBox().catch(() => null);
if (pb) {
  await glide(pb.x + pb.width / 2, pb.y + pb.height * 0.6, 30);
  for (let i = 0; i < 2; i++) { await page.mouse.wheel(0, 240); await beat(1700); }
}
await beat(900);

// ── 장면 3 · 승인 (1:05–1:35) ────────────────────────────────────────
mark('승인');
const ok = page.getByRole('button', { name: /^승인$/ }).first();
if (await ok.count()) {
  await clickAt(ok);
  await beat(3800);
  mark('배정현황 반영 확인');
  await glide(700, 700, 30);           // 왼쪽 목록으로 시선 이동
  await beat(2600);
  await page.mouse.wheel(0, -300);
  await beat(2200);
} else {
  console.log('  [경고] 승인 버튼 없음 — 다른 배로 재촬영 필요');
}

// ── 장면 4 · 확장 (1:35–2:00) ────────────────────────────────────────
mark('장면4 안전/환경 관제');
await clickAt(page.getByRole('link', { name: /안전|환경/ }).first());
await beat(4500);
await page.mouse.wheel(0, 300);
await beat(2400);

const twin = page.getByRole('link', { name: /3D|관제 화면/ }).first();
if (await twin.count()) {
  mark('3D 관제 화면');
  await clickAt(twin);
  await beat(6000);
}
mark('대시보드로 복귀');
await clickAt(page.getByRole('link', { name: /^대시보드$/ }).first());
await beat(2500);

console.log(`\n총 길이 약 ${((Date.now() - T0) / 1000).toFixed(0)}초 · 페이지 오류 ${errs.length}건`);
errs.slice(0, 3).forEach((e) => console.log('  !', e));
await ctx.close();          // 여기서 영상 파일이 저장된다
await browser.close();
const vp = await page.video()?.path().catch(() => null);
console.log('영상:', vp || OUT);
