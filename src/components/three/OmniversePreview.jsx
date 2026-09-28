import { useEffect, useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import useSensorStore from '../../stores/useSensorStore';

// ─────────────────────────────────────────────
// Omniverse 정밀 검토 미리보기 (2026-09-28)
//
// 시연 PC 에서는 Omniverse(Isaac Sim)를 켜지 않는다(발열로 꺼짐, 9/27). 그래도 "같은 배가 정밀
// 검토 장면에서 어떻게 바뀌는가"는 보여 줘야 해서, 9/17 고사양 PC 에서 실측 조위로 재생한 장면의
// **캡처 두 장**을 나란히 비교한다 — 가운데 손잡이를 끌면 접안 직전(적합)과 저조(주의)가 겹쳐 보인다.
//
// 만든 장면이 아니라 기록 캡처다. 시연장에서 실시간으로 도는 것처럼 보이면 안 되므로
// "캡처 · 2026-09-17" 을 화면에 적는다.
// ─────────────────────────────────────────────

const SCENES = [
  {
    id: 'ginga',
    title: 'GINGA MARGAY → OTK1부두 · 2026-08-18 실측 조위 재생',
    before: { src: '/omniverse/ginga_margay_1000_fit.jpg', label: '접안 직전 10:00 · 적합 · 흘수 여유 +1.08 m', tone: '#2dd4bf' },
    after: { src: '/omniverse/ginga_margay_1640_caution.jpg', label: '하역 중 16:40 저조 · 주의 · 흘수 여유 +0.75 m', tone: '#fbbf24' },
    note: '같은 배·같은 선석. 조위가 +0.78 m 에서 +0.45 m 로 내려가자 흘수 여유 게이지(세로 막대, 1 m = 8 유닛)와 선석·게이트 램프 색이 바뀌고 정보판에 조치안(저조 전후 흘수·하역량 확인)과 받는 곳(터미널 안전관리자 → 하역 개시 게이트)이 붙는다.',
  },
];

export default function OmniversePreview() {
  const open = useSensorStore((s) => s.omniPreviewOpen);
  const setOpen = useSensorStore((s) => s.setOmniPreviewOpen);
  const [pos, setPos] = useState(50);
  const scene = SCENES[0];

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Omniverse 정밀 검토 미리보기"
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 6000, background: 'rgba(2, 8, 20, 0.82)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(1100px, 96vw)', background: '#0f172a', color: '#e8f0f2', borderRadius: 14,
          border: '1px solid rgba(56,189,248,0.4)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)', overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <strong style={{ fontSize: 14 }}>Omniverse 정밀 검토 — 같은 배가 어떻게 바뀌나</strong>
          <span style={{ fontSize: 11.5, color: '#94a3b8' }}>Isaac Sim 캡처 · 2026-09-17 · 고사양 PC 에서 재생한 장면. 시연 PC 에서는 켜지 않습니다.</span>
          <button
            type="button" onClick={() => setOpen(false)} title="닫기 (Esc)"
            style={{ marginLeft: 'auto', background: 'rgba(232,240,242,0.08)', color: '#e8f0f2', border: '1px solid rgba(232,240,242,0.25)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}
          >
            <FaTimes />
          </button>
        </div>

        <div style={{ padding: '10px 16px 0', fontSize: 12.5, color: '#cbd5e1' }}>{scene.title}</div>

        {/* 비교 슬라이더 — 왼쪽이 접안 직전(적합), 오른쪽이 저조(주의) */}
        <div style={{ position: 'relative', margin: '8px 16px 0', aspectRatio: '1280 / 768', background: '#000', borderRadius: 8, overflow: 'hidden', userSelect: 'none' }}>
          <img src={scene.after.src} alt={scene.after.label} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, width: `${pos}%`, overflow: 'hidden' }}>
            <img src={scene.before.src} alt={scene.before.label} style={{ width: `${10000 / pos}%`, maxWidth: 'none', height: '100%', objectFit: 'cover' }} />
          </div>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos}%`, width: 2, background: '#38bdf8', transform: 'translateX(-1px)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: 10, left: 10, padding: '4px 8px', borderRadius: 6, background: 'rgba(2,8,20,0.7)', fontSize: 12, fontWeight: 700, color: scene.before.tone }}>{scene.before.label}</div>
          <div style={{ position: 'absolute', top: 10, right: 10, padding: '4px 8px', borderRadius: 6, background: 'rgba(2,8,20,0.7)', fontSize: 12, fontWeight: 700, color: scene.after.tone }}>{scene.after.label}</div>
          <input
            type="range" min="0" max="100" value={pos} onChange={(e) => setPos(Number(e.target.value))}
            aria-label="접안 직전과 저조 장면 비교"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'ew-resize', margin: 0 }}
          />
        </div>
        <div style={{ padding: '8px 16px 14px', fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
          가운데를 좌우로 끌어 두 시점을 겹쳐 보세요. {scene.note}
        </div>
      </div>
    </div>
  );
}
