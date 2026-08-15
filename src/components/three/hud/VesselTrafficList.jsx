import useSensorStore from '../../../stores/useSensorStore';
import { ONSAN_BERTHS } from '../../../utils/geoUtils';

// 트윈 상태 어휘 → 화면 표기. status.toUpperCase() 를 그대로 쓰면
// 'UNDERWAY'처럼 영문이 그대로 나가고, 묘박선은 berth 가 null 이라 "null | ANCHORED"
// 로 표시됐다.
const STATUS_LABEL = {
  operating: { text: '하역 중', color: '#10b981' },
  mooring: { text: '계류', color: '#f59e0b' },
  anchored: { text: '묘박', color: '#4ecdc4' },
  underway: { text: '항해 중', color: '#38bdf8' },
};

export default function VesselTrafficList() {
  const ships = useSensorStore((s) => s.ships);
  const setSelectedObject = useSensorStore((s) => s.setSelectedObject);

  return (
    <div className="vessel-traffic-list" style={{
      position: 'absolute', top: 226, left: 20, zIndex: 1000,
      width: '320px',
      background: 'rgba(5, 8, 17, 0.85)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(0, 212, 170, 0.3)',
      borderRadius: '8px',
      color: '#00d4aa',
      fontFamily: 'monospace',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 15px', borderBottom: '1px solid rgba(0, 212, 170, 0.3)',
        background: 'rgba(0, 212, 170, 0.1)', fontWeight: 'bold', letterSpacing: '1px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>온산 AIS 선박</span>
        <span style={{ fontSize: '11px', opacity: 0.8 }}>{ships.length}척</span>
      </div>

      <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
        {ships.length === 0 ? (
          <div style={{ color: '#8ba3b8', fontSize: '12px', textAlign: 'center', padding: '12px 4px', lineHeight: 1.6 }}>
            온산 범위 내 AIS 신호 없음
            <div style={{ fontSize: '11px', opacity: 0.8 }}>수집이 멈췄거나 재항 선박이 없습니다</div>
          </div>
        ) : (
          ships.map((ship) => {
            const st = STATUS_LABEL[ship.status] || { text: ship.status, color: '#8ba3b8' };
            // 선석은 사람이 읽는 이름으로. 없으면 '선석 미배정'(묘박·항해 중)
            const berthName = ship.berth ? (ONSAN_BERTHS[ship.berth]?.name || ship.berth) : '선석 미배정';
            return (
              <div
                key={ship.id}
                onClick={() => setSelectedObject(ship)}
                title="클릭하면 선박 상세가 열립니다"
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px',
                  borderLeft: `3px solid ${st.color}`, cursor: 'pointer',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    color: '#fff', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {ship.id}
                  </div>
                  <div style={{ color: '#8ba3b8', fontSize: '11px' }}>{berthName}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '8px' }}>
                  <div style={{ color: st.color, fontSize: '11.5px', marginBottom: '4px' }}>{st.text}</div>
                  {/* 적재량은 수집 소스가 없다(cargoAmount=null). 예전엔
                      Math.round(null/1000) = 0 이라 실선박이 전부 "0k t"로 떴다 —
                      빈 배라는 틀린 정보였다. 대신 실제로 아는 값(속력)을 보여준다. */}
                  <div style={{ color: '#10b981', fontSize: '11px' }}>
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
