import { useState, useEffect, useMemo } from 'react';
import useSensorStore from '../../../stores/useSensorStore';
import useDashboardData from '../../../hooks/useDashboardData';
import { ONSAN_BERTHS_3D } from '../../../utils/geoUtils';

const BERTH_IDS = Object.keys(ONSAN_BERTHS_3D);

// 시간대별 화면 톤: 주간(컬러) / 일몰·일출(웜톤) / 야간(IR 그린)
const PALETTES = {
  DAY: {
    label: '주간', sky1: '#39546e', sky2: '#5b7c99', sea1: '#28536e', sea2: '#153048',
    deck: '#3a4a58', deckTop: '#52667a', struct: '#5a7086', hull: '#22303c', hullLine: '#48607a',
    glow: '#eaf4ff', text: '#eaf4ff', sub: '#a8c8e0', noise: 'rgba(220,235,255,0.07)',
  },
  DUSK: {
    label: '일몰', sky1: '#5a3448', sky2: '#8a5a42', sea1: '#4a3450', sea2: '#221830',
    deck: '#3c3040', deckTop: '#5a4456', struct: '#6a4e58', hull: '#241c2c', hullLine: '#584458',
    glow: '#ffd9a8', text: '#ffe9d0', sub: '#d8aa88', noise: 'rgba(255,220,180,0.07)',
  },
  NIGHT: {
    label: '야간·IR', sky1: '#0a1410', sky2: '#12241c', sea1: '#16302a', sea2: '#0a1a16',
    deck: '#1c2e26', deckTop: '#2c443a', struct: '#31503f', hull: '#0e1d18', hullLine: '#28453a',
    glow: '#d8f5c8', text: '#d8f5c8', sub: '#8fd9b8', noise: 'rgba(190,255,220,0.09)',
  },
};

function phaseOf(hour) {
  if (hour >= 7 && hour <= 16) return 'DAY';
  if (hour >= 17 && hour <= 19) return 'DUSK';
  if (hour >= 5 && hour <= 6) return 'DUSK';
  return 'NIGHT';
}

/**
 * 가상 부두 CCTV — 실시간 연동:
 * - 현재 시각에 따라 주간/일몰/야간(IR) 화면 톤이 바뀐다
 * - 표시 부두의 하역 작업(공용 API operations)의 실제 진행률을 오버레이
 * - 3D에서 잔교/선박 클릭 시 해당 부두로 전환, 무선택 시 6초 자동 순찰
 */
export default function CCTVPanel() {
  const [time, setTime] = useState(new Date());
  const [cycleIdx, setCycleIdx] = useState(0);
  const selectedObject = useSensorStore((s) => s.selectedObject);
  const ships = useSensorStore((s) => s.ships);
  const { data } = useDashboardData();

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCycleIdx((i) => (i + 1) % BERTH_IDS.length), 6000);
    return () => clearInterval(timer);
  }, []);

  const berthId = useMemo(() => {
    if (selectedObject?.type === 'Berth' && ONSAN_BERTHS_3D[selectedObject.id]) return selectedObject.id;
    if (selectedObject?.type === 'Ship' && ONSAN_BERTHS_3D[selectedObject.berth]) return selectedObject.berth;
    return BERTH_IDS[cycleIdx];
  }, [selectedObject, cycleIdx]);

  const berth = ONSAN_BERTHS_3D[berthId];
  const camNo = BERTH_IDS.indexOf(berthId) + 1;
  const P = PALETTES[phaseOf(time.getHours())];
  const lightsOn = P !== PALETTES.DAY;

  const mooredShip = ships.find(
    (s) => s.berth === berthId && ['operating', 'mooring', 'docked'].includes(s.status)
  );
  // 이 부두의 실시간 하역 작업 (공용 API — React/Omniverse와 동일 소스)
  const op = (data?.operations || []).find(
    (o) => !o.is_real_record && o.berth === berth?.name && o.status !== 'COMPLETED'
  );
  const loading = op?.status === 'IN_PROGRESS' || mooredShip?.status === 'operating';
  const isManual = selectedObject?.type === 'Berth' || (selectedObject?.type === 'Ship' && selectedObject.berth);

  const footer = mooredShip
    ? op
      ? op.status === 'IN_PROGRESS'
        ? `${mooredShip.id} · ${op.cargo} ${Math.round(op.progress_pct)}% (${(op.done_tons ?? 0).toLocaleString()}/${op.planned_tons?.toLocaleString()}t)`
        : `${mooredShip.id} · ${op.cargo} 하역 대기`
      : `${mooredShip.id} · 계류`
    : '공석';

  return (
    <div className="cctv-panel" key={`${berthId}-${P.label}`} style={{
      position: 'absolute', top: 44, left: 20, zIndex: 1000,
      width: '280px', height: '168px',
      background: P.sky1,
      border: '1px solid rgba(255, 255, 255, 0.2)',
      borderRadius: '4px',
      overflow: 'hidden',
      pointerEvents: 'none',
      fontFamily: 'monospace',
      animation: 'camswitch 0.35s ease-out',
    }}>
      {/* 가상 부두 장면 */}
      <svg width="280" height="168" viewBox="0 0 280 168" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="cctv-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={P.sky1} />
            <stop offset="100%" stopColor={P.sky2} />
          </linearGradient>
          <linearGradient id="cctv-sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={P.sea1} />
            <stop offset="100%" stopColor={P.sea2} />
          </linearGradient>
        </defs>

        <rect width="280" height="96" fill="url(#cctv-sky)" />
        {/* 일몰이면 태양 */}
        {P === PALETTES.DUSK && <circle cx="60" cy="60" r="12" fill="#ffb46a" opacity="0.85" />}
        <rect y="96" width="280" height="72" fill="url(#cctv-sea)" />
        {[108, 122, 140, 155].map((y, i) => (
          <line key={y} x1={20 + i * 30} y1={y} x2={70 + i * 40} y2={y}
            stroke={P.sub} strokeWidth="1" opacity="0.4">
            <animate attributeName="opacity" values="0.15;0.5;0.15" dur={`${2.4 + i * 0.7}s`} repeatCount="indefinite" />
          </line>
        ))}

        {/* 잔교 데크 */}
        <rect x="150" y="118" width="130" height="16" fill={P.deck} />
        <rect x="150" y="114" width="130" height="4" fill={P.deckTop} />
        {/* 야드등 (야간·일몰에만 점등) */}
        {[175, 245].map((x) => (
          <g key={x}>
            <rect x={x} y="78" width="2.5" height="38" fill={P.deckTop} />
            {lightsOn ? (
              <>
                <circle cx={x + 1} cy="76" r="3.4" fill={P.glow}>
                  <animate attributeName="opacity" values="0.85;1;0.85" dur="2.1s" repeatCount="indefinite" />
                </circle>
                <circle cx={x + 1} cy="76" r="8" fill={P.glow} opacity="0.15" />
              </>
            ) : (
              <circle cx={x + 1} cy="76" r="3" fill={P.struct} />
            )}
          </g>
        ))}
        {/* 로딩암 타워 */}
        <rect x="206" y="88" width="9" height="30" fill={P.struct} />
        <rect x="203" y="84" width="15" height="6" fill={P.deckTop} />

        {mooredShip ? (
          <g>
            <rect x="26" y="92" width="150" height="26" rx="3" fill={P.hull} stroke={P.hullLine} strokeWidth="1" />
            <rect x="36" y="76" width="26" height="18" rx="2" fill={P.deck} stroke={P.hullLine} strokeWidth="1" />
            <line x1="70" y1="90" x2="168" y2="90" stroke={P.hullLine} strokeWidth="2.5" />
            {lightsOn && (
              <circle cx="40" cy="72" r="2" fill="#ffe9a8">
                <animate attributeName="opacity" values="1;0.4;1" dur="1.6s" repeatCount="indefinite" />
              </circle>
            )}
            {/* 로딩암 연결 + 하역 중 유체 흐름 */}
            <line x1="207" y1="92" x2="170" y2="98" stroke={loading ? '#6fe8c0' : P.struct} strokeWidth="3" strokeLinecap="round" />
            {loading && (
              <line x1="207" y1="92" x2="170" y2="98" stroke="#c8ffe8" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="5 6">
                <animate attributeName="stroke-dashoffset" values="22;0" dur="0.9s" repeatCount="indefinite" />
              </line>
            )}
          </g>
        ) : (
          <g>
            {[40, 75, 110].map((x) => (
              <circle key={x} cx={x} cy="116" r="4.5" fill={P.hull} stroke={P.hullLine} strokeWidth="1" />
            ))}
            <text x="70" y="90" fill={P.sub} fontSize="9" fontFamily="monospace">-- BERTH VACANT --</text>
          </g>
        )}
      </svg>

      {/* 노이즈 + 스캔라인 */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `radial-gradient(${P.noise} 1px, transparent 1px)`,
        backgroundSize: '3px 3px',
      }} />
      <div className="cctv-scanline" style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '10px',
        background: 'rgba(255,255,255,0.05)',
        boxShadow: '0 0 10px rgba(255,255,255,0.08)',
      }} />

      {/* 오버레이 */}
      <div style={{ position: 'absolute', top: 8, left: 10, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 'bold' }}>
        <div style={{ width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%', animation: 'pulse 1s infinite' }} />
        REC
      </div>
      <div style={{ position: 'absolute', top: 8, right: 10, color: P.text, fontSize: '11.5px', fontWeight: 700 }}>
        CAM-{String(camNo).padStart(2, '0')} · {berth?.name}
      </div>
      <div style={{ position: 'absolute', top: 24, right: 10, color: P.sub, fontSize: '10px' }}>
        {P.label} 모드 {isManual ? '· 수동 선택' : '· 자동 순찰'}
      </div>
      <div style={{ position: 'absolute', bottom: 8, left: 10, color: P.sub, fontSize: '10.5px', maxWidth: '190px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {footer}
      </div>
      <div style={{ position: 'absolute', bottom: 8, right: 10, color: P.text, fontSize: '11px' }}>
        {time.toLocaleTimeString('ko-KR', { hour12: false })}
      </div>

      <style>{`
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 1; } }
        .cctv-scanline { animation: scan 4s linear infinite; }
        @keyframes scan { 0% { top: -10%; } 100% { top: 110%; } }
        @keyframes camswitch {
          0% { filter: brightness(3) contrast(0.2); }
          40% { filter: brightness(0.6) contrast(1.6); }
          100% { filter: none; }
        }
      `}</style>
    </div>
  );
}
