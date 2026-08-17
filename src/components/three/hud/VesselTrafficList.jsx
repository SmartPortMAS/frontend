import { useMemo, useState } from 'react';
import useSensorStore from '../../../stores/useSensorStore';
import { ONSAN_BERTHS } from '../../../utils/geoUtils';
import { FaShip, FaChevronUp, FaChevronDown } from 'react-icons/fa';

// 트윈 상태 어휘 → 화면 표기. status.toUpperCase() 를 그대로 쓰면
// 'UNDERWAY'처럼 영문이 그대로 나가고, 묘박선은 berth 가 null 이라 "null | ANCHORED"
// 로 표시됐다.
const STATUS_LABEL = {
  operating: { text: '하역 중', color: '#39C0A8' },
  mooring: { text: '계류', color: '#E0A83C' },
  anchored: { text: '묘박', color: '#5FC7DC' },
  underway: { text: '항해 중', color: '#7FB3E8' },
};

// 상태 필터 — 이영서 요청(2026-08-17):
// "하역 중/묘박 등으로 가를 수 있으면 더 편하지 않을까"
//
// 관제에서 실제로 나누는 기준이 이 넷이다. '하역 중'과 '계류'를 따로 두는 이유는
// 접안해 있어도 화물을 붙였는지 아닌지가 안전 관제상 다른 상황이기 때문이다
// (useLiveTwinShips.twinStatus 가 화물 유무로 이 둘을 가른다).
const FILTERS = [
  { key: 'ALL', label: '전체' },
  { key: 'operating', label: '하역' },
  { key: 'mooring', label: '계류' },
  { key: 'anchored', label: '묘박' },
  { key: 'underway', label: '항해' },
];

export default function VesselTrafficList() {
  const ships = useSensorStore((s) => s.ships);
  const setSelectedObject = useSensorStore((s) => s.setSelectedObject);
  const [filter, setFilter] = useState('ALL');
  const [collapsed, setCollapsed] = useState(false);

  // 필터 칩에 건수를 같이 적는다 — 눌러보기 전에 어느 상태가 몇 척인지 보여야
  // "지금 하역 중인 배가 있나"를 한눈에 판단할 수 있다.
  const counts = useMemo(() => {
    const c = { ALL: ships.length };
    for (const f of FILTERS) if (f.key !== 'ALL') c[f.key] = 0;
    for (const s of ships) if (c[s.status] !== undefined) c[s.status] += 1;
    return c;
  }, [ships]);

  const shown = useMemo(
    () => (filter === 'ALL' ? ships : ships.filter((s) => s.status === filter)),
    [ships, filter]
  );

  // CCTV 패널 아래에 놓는다. CCTV 가 접히면 그만큼 따라 올라간다 —
  // 예전 top:226 은 CCTV 에 조작줄이 붙기 전 값이라 두 패널이 겹쳤다.
  const cctvCollapsed = useSensorStore((s) => s.hudCctvCollapsed);
  const TOP = cctvCollapsed ? 88 : 264;

  if (collapsed) {
    return (
      <div style={{ position: 'absolute', top: TOP, left: 20, zIndex: 1000 }}>
        <button type="button" className="hud-chip" onClick={() => setCollapsed(false)} title="선박 목록 펼치기">
          <FaShip size={11} /> 온산 AIS 선박 {ships.length}척
          <FaChevronDown size={9} />
        </button>
      </div>
    );
  }

  return (
    <div className="vessel-traffic-list" style={{
      position: 'absolute', top: TOP, left: 20, zIndex: 1000,
      width: '320px',
      background: 'var(--hud-panel)',
      backdropFilter: 'blur(10px)',
      border: '1px solid var(--hud-border)',
      borderRadius: '8px',
      color: 'var(--hud-text)',
      fontFamily: 'ui-monospace, Consolas, monospace',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '9px 12px', borderBottom: '1px solid var(--hud-border)',
        background: 'rgba(255,255,255,0.05)', fontWeight: 'bold',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
      }}>
        <span style={{ fontSize: '12.5px' }}>온산 AIS 선박</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', opacity: 0.8 }}>
            {filter === 'ALL' ? `${ships.length}척` : `${shown.length}/${ships.length}척`}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            title="접기"
            style={{
              background: 'transparent', border: 'none', color: 'var(--hud-dim)',
              cursor: 'pointer', display: 'flex', padding: 0,
            }}
          >
            <FaChevronUp size={11} />
          </button>
        </span>
      </div>

      {/* 상태 필터 */}
      <div style={{
        display: 'flex', gap: '4px', padding: '8px 10px 4px', flexWrap: 'wrap',
      }}>
        {FILTERS.map((f) => {
          const on = filter === f.key;
          const c = STATUS_LABEL[f.key]?.color;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              style={{
                background: on ? 'rgba(255,255,255,0.14)' : 'transparent',
                border: `1px solid ${on ? (c || '#6FD3BE') : 'var(--hud-border)'}`,
                color: on ? (c || 'var(--hud-text)') : 'var(--hud-dim)',
                borderRadius: '999px', padding: '3px 10px',
                fontSize: '10.5px', fontWeight: on ? 800 : 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {f.label} {counts[f.key] ?? 0}
            </button>
          );
        })}
      </div>

      <div style={{ padding: '6px 10px 10px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
        {ships.length === 0 ? (
          <div style={{ color: 'var(--hud-dim)', fontSize: '12px', textAlign: 'center', padding: '12px 4px', lineHeight: 1.6 }}>
            온산 범위 내 AIS 신호 없음
            <div style={{ fontSize: '11px', opacity: 0.8 }}>수집이 멈췄거나 재항 선박이 없습니다</div>
          </div>
        ) : shown.length === 0 ? (
          <div style={{ color: 'var(--hud-dim)', fontSize: '12px', textAlign: 'center', padding: '12px 4px' }}>
            해당 상태의 선박이 없습니다
          </div>
        ) : (
          shown.map((ship) => {
            const st = STATUS_LABEL[ship.status] || { text: ship.status, color: 'var(--hud-dim)' };
            // 선석은 사람이 읽는 이름으로. 없으면 '선석 미배정'(묘박·항해 중)
            const berthName = ship.berth ? (ONSAN_BERTHS[ship.berth]?.name || ship.berth) : '선석 미배정';
            return (
              <div
                key={ship.id}
                onClick={() => setSelectedObject(ship)}
                title="클릭하면 선박 상세가 열립니다"
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px',
                  borderLeft: `3px solid ${st.color}`, cursor: 'pointer',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    color: 'var(--hud-text)', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {ship.id}
                  </div>
                  <div style={{ color: 'var(--hud-dim)', fontSize: '11px' }}>{berthName}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '8px' }}>
                  <div style={{ color: st.color, fontSize: '11.5px', marginBottom: '4px' }}>{st.text}</div>
                  {/* 적재량은 수집 소스가 없다(cargoAmount=null). 예전엔
                      Math.round(null/1000) = 0 이라 실선박이 전부 "0k t"로 떴다 —
                      빈 배라는 틀린 정보였다. 대신 실제로 아는 값(속력)을 보여준다. */}
                  <div style={{ color: '#6FD3BE', fontSize: '11px' }}>
                    {ship.vessel_speed != null ? `${ship.vessel_speed} kn` : '속력 미상'}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
