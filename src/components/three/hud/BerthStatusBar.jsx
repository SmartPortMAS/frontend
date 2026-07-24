import useSensorStore from '../../../stores/useSensorStore';
import { ONSAN_BERTHS_3D, ONSAN_WEATHER_GROUP } from '../../../utils/geoUtils';
import { COLORS, WEATHER_STATUS_COLORS } from '../../../utils/constants';

// 선박 상태 → 점유 표시 색
const OCCUPY_COLOR = {
  operating: COLORS.teal,
  mooring: COLORS.yellow,
  docked: COLORS.yellow,
};

/**
 * 선석 점유 현황판 (관제용 HUD)
 * 잔교 11기의 점유 선박·하역 상태·기상 판정을 한 줄로 보여준다.
 */
export default function BerthStatusBar() {
  const ships = useSensorStore((s) => s.ships);
  const berthWeather = useSensorStore((s) => s.berthWeather);

  return (
    <div style={{
      // CCTV(좌, ~300px)와 우측 버튼(~390px) 사이 구간에만 배치 — 어느 쪽도 가리지 않음
      position: 'absolute', top: 44, left: 320, right: 400,
      zIndex: 1000, display: 'flex', gap: '6px', alignItems: 'center',
      background: 'rgba(13, 27, 42, 0.8)', backdropFilter: 'blur(8px)',
      border: `1px solid ${COLORS.glassBorder}`, borderRadius: '10px',
      padding: '7px 12px', overflowX: 'auto',
    }}>
      <span style={{ fontSize: '11px', fontWeight: 800, color: COLORS.textSecondary, whiteSpace: 'nowrap', marginRight: '4px' }}>
        선석 현황
      </span>
      {Object.entries(ONSAN_BERTHS_3D).map(([id, b]) => {
        const ship = ships.find(
          (s) => s.berth === id && ['operating', 'mooring', 'docked'].includes(s.status)
        );
        const verdict =
          berthWeather && ONSAN_WEATHER_GROUP[id] === berthWeather.berth_group
            ? berthWeather.status
            : null;
        const escalated = verdict && verdict !== '정상';
        const dotColor = ship ? OCCUPY_COLOR[ship.status] || COLORS.teal : COLORS.textDim;
        return (
          <div
            key={id}
            title={`${b.name}${ship ? ` — ${ship.id} (${ship.cargoType})` : ' — 공석'}${verdict ? ` · 판정: ${verdict}` : ''}`}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap',
              padding: '3px 8px', borderRadius: '6px', fontSize: '11px',
              color: ship ? COLORS.textPrimary : COLORS.textDim,
              border: `1px solid ${escalated ? WEATHER_STATUS_COLORS[verdict] : 'transparent'}`,
              background: escalated ? `${'#0d1b2a'}` : 'transparent',
            }}
          >
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
              background: dotColor,
              boxShadow: ship ? `0 0 6px ${dotColor}` : 'none',
            }} />
            {b.name.replace(' 부두', '').replace('터미널', '')}
            {escalated && (
              <span style={{ color: WEATHER_STATUS_COLORS[verdict], fontWeight: 800 }}>{verdict}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
