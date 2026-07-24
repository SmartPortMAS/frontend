import { useState, useEffect, useMemo } from 'react';
import useSensorStore from '../../../stores/useSensorStore';
import { ONSAN_BERTHS_3D } from '../../../utils/geoUtils';

const BERTH_IDS = Object.keys(ONSAN_BERTHS_3D);

/**
 * 가상 부두 CCTV — 3D에서 잔교/선박을 클릭하면 해당 부두 화면으로 전환.
 * 선택이 없으면 6초마다 부두를 자동 순환한다.
 * (실물 CCTV 미연동 — 부두 점유 상태를 반영한 가상 화면)
 */
export default function CCTVPanel() {
  const [time, setTime] = useState(new Date());
  const [cycleIdx, setCycleIdx] = useState(0);
  const selectedObject = useSensorStore((s) => s.selectedObject);
  const ships = useSensorStore((s) => s.ships);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 선택 없을 때 자동 순환
  useEffect(() => {
    const timer = setInterval(() => setCycleIdx((i) => (i + 1) % BERTH_IDS.length), 6000);
    return () => clearInterval(timer);
  }, []);

  // 표시할 부두 결정: 잔교 클릭 > 선박 클릭(배정 선석) > 자동 순환
  const berthId = useMemo(() => {
    if (selectedObject?.type === 'Berth' && ONSAN_BERTHS_3D[selectedObject.id]) return selectedObject.id;
    if (selectedObject?.type === 'Ship' && ONSAN_BERTHS_3D[selectedObject.berth]) return selectedObject.berth;
    return BERTH_IDS[cycleIdx];
  }, [selectedObject, cycleIdx]);

  const berth = ONSAN_BERTHS_3D[berthId];
  const camNo = BERTH_IDS.indexOf(berthId) + 1;
  const mooredShip = ships.find(
    (s) => s.berth === berthId && ['operating', 'mooring', 'docked'].includes(s.status)
  );
  const operating = mooredShip?.status === 'operating';
  const isManual = selectedObject?.type === 'Berth' || (selectedObject?.type === 'Ship' && selectedObject.berth);

  return (
    <div className="cctv-panel" key={berthId} style={{
      position: 'absolute', top: 20, left: 20, zIndex: 1000,
      width: '280px', height: '168px',
      background: '#050a08',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      borderRadius: '4px',
      overflow: 'hidden',
      pointerEvents: 'none',
      fontFamily: 'monospace',
      animation: 'camswitch 0.35s ease-out',
    }}>
      {/* 가상 부두 장면 (야간 CCTV 그린 톤) */}
      <svg width="280" height="168" viewBox="0 0 280 168" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="cctv-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a1410" />
            <stop offset="100%" stopColor="#12241c" />
          </linearGradient>
          <linearGradient id="cctv-sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16302a" />
            <stop offset="100%" stopColor="#0a1a16" />
          </linearGradient>
        </defs>

        {/* 하늘 / 바다 */}
        <rect width="280" height="96" fill="url(#cctv-sky)" />
        <rect y="96" width="280" height="72" fill="url(#cctv-sea)" />
        {/* 수면 반짝임 */}
        {[108, 122, 140, 155].map((y, i) => (
          <line key={y} x1={20 + i * 30} y1={y} x2={70 + i * 40} y2={y}
            stroke="#3f6f5f" strokeWidth="1" opacity="0.4">
            <animate attributeName="opacity" values="0.15;0.5;0.15" dur={`${2.4 + i * 0.7}s`} repeatCount="indefinite" />
          </line>
        ))}

        {/* 잔교 데크 (전경 우측) */}
        <rect x="150" y="118" width="130" height="16" fill="#1c2e26" />
        <rect x="150" y="114" width="130" height="4" fill="#2c443a" />
        {/* 야드등 2기 */}
        {[175, 245].map((x) => (
          <g key={x}>
            <rect x={x} y="78" width="2.5" height="38" fill="#2c443a" />
            <circle cx={x + 1} cy="76" r="3.4" fill="#d8f5c8">
              <animate attributeName="opacity" values="0.85;1;0.85" dur="2.1s" repeatCount="indefinite" />
            </circle>
            <circle cx={x + 1} cy="76" r="8" fill="#d8f5c8" opacity="0.15" />
          </g>
        ))}
        {/* 로딩암 타워 */}
        <rect x="206" y="88" width="9" height="30" fill="#31503f" />
        <rect x="203" y="84" width="15" height="6" fill="#3c5f4a" />

        {mooredShip ? (
          <g>
            {/* 계류 선박 실루엣 */}
            <rect x="26" y="92" width="150" height="26" rx="3" fill="#0e1d18" stroke="#28453a" strokeWidth="1" />
            <rect x="36" y="76" width="26" height="18" rx="2" fill="#15281f" stroke="#28453a" strokeWidth="1" />
            {/* 갑판 배관 */}
            <line x1="70" y1="90" x2="168" y2="90" stroke="#28453a" strokeWidth="2.5" />
            {/* 선등 */}
            <circle cx="40" cy="72" r="2" fill="#ffe9a8">
              <animate attributeName="opacity" values="1;0.4;1" dur="1.6s" repeatCount="indefinite" />
            </circle>
            {/* 로딩암 → 선박 연결 */}
            <line x1="207" y1="92" x2="170" y2="98" stroke={operating ? '#6fe8c0' : '#3c5f4a'} strokeWidth="3" strokeLinecap="round" />
            {operating && (
              <line x1="207" y1="92" x2="170" y2="98" stroke="#a8ffe0" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="5 6">
                <animate attributeName="stroke-dashoffset" values="22;0" dur="0.9s" repeatCount="indefinite" />
              </line>
            )}
          </g>
        ) : (
          /* 공석: 빈 안벽 + 펜더 */
          <g>
            {[40, 75, 110].map((x) => (
              <circle key={x} cx={x} cy="116" r="4.5" fill="#16281f" stroke="#28453a" strokeWidth="1" />
            ))}
            <text x="70" y="90" fill="#3f6f5f" fontSize="9" fontFamily="monospace">-- BERTH VACANT --</text>
          </g>
        )}
      </svg>

      {/* 노이즈 + 스캔라인 */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(rgba(190,255,220,0.09) 1px, transparent 1px)',
        backgroundSize: '3px 3px',
      }} />
      <div className="cctv-scanline" style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '10px',
        background: 'rgba(190,255,220,0.06)',
        boxShadow: '0 0 10px rgba(190,255,220,0.12)',
      }} />

      {/* 오버레이 텍스트 */}
      <div style={{ position: 'absolute', top: 8, left: 10, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 'bold' }}>
        <div style={{ width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%', animation: 'pulse 1s infinite' }} />
        REC
      </div>
      <div style={{ position: 'absolute', top: 8, right: 10, color: '#d8f5c8', fontSize: '11.5px', fontWeight: 700 }}>
        CAM-{String(camNo).padStart(2, '0')} · {berth?.name}
      </div>
      <div style={{ position: 'absolute', bottom: 8, left: 10, color: '#8fd9b8', fontSize: '10.5px' }}>
        {mooredShip ? `${mooredShip.id} ${operating ? '· 하역 중' : '· 계류'}` : '공석'}
        {isManual ? '  [수동 선택]' : '  [자동 순찰]'}
      </div>
      <div style={{ position: 'absolute', bottom: 8, right: 10, color: '#d8f5c8', fontSize: '11px' }}>
        {time.toISOString().replace('T', ' ').substring(0, 19)}
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
