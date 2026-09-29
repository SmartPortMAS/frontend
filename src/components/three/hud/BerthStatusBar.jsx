import useSensorStore from '../../../stores/useSensorStore';
import useVesselThread from '../../../hooks/useVesselThread';
import { ONSAN_BERTHS_3D, ONSAN_WEATHER_GROUP } from '../../../utils/geoUtils';
import { COLORS, WEATHER_STATUS_COLORS } from '../../../utils/constants';
import { VERDICT_RANK, berthKey } from '../../../utils/verdict';

// 어두운 3D 바탕용 판정 색 — 관제 화면(utils/verdict)과 뜻은 같고 밝기만 다르다(OutlookTimeline LEVEL_COLOR 와 같음)
const DOT = { 적합: '#10b981', 주의: '#f59e0b', 부적합: '#ef4444', 판정불가: '#a78bfa' };

/**
 * 선석 현황 띠 (관제용 HUD)
 * 잔교 11기의 접안 선박 수와 판정 색, 부두 기상 판정을 보여준다. 누르면 그 선석 정보창(→ 앞으로 72시간).
 * [2026-09-30] 11곳이 한 번에 보이게 두 줄로 접는다(예전엔 가로 스크롤에 정일 2가 잘렸다 — 현우).
 *   점 색은 그 선석 접안 선박의 판정 색 — 대시보드 선석 현황판 · 지도 고리와 같은 규칙.
 */
export default function BerthStatusBar() {
  const berthWeather = useSensorStore((s) => s.berthWeather);
  const setSelectedObject = useSensorStore((s) => s.setSelectedObject);
  const cctvCollapsed = useSensorStore((s) => s.hudCctvCollapsed);
  const { berths } = useVesselThread();

  return (
    <div style={{
      // CCTV(좌)와 머리 단추(우, [정밀 검토] 하나) 사이 — 어느 쪽도 가리지 않음
      position: 'absolute', top: 44, left: cctvCollapsed ? 190 : 440, right: 290,
      zIndex: 1000, display: 'flex', flexWrap: 'wrap', gap: '4px 4px', alignItems: 'center',
      background: 'rgba(13, 27, 42, 0.8)', backdropFilter: 'blur(8px)',
      border: `1px solid ${COLORS.glassBorder}`, borderRadius: '10px',
      padding: '6px 10px',
    }}>
      <span style={{ fontSize: '11px', fontWeight: 800, color: '#AFC2CC', whiteSpace: 'nowrap', marginRight: '4px' }}>
        선석 현황
      </span>
      {Object.entries(ONSAN_BERTHS_3D).map(([id, b]) => {
        const row = berths.find((r) => berthKey(r.wharf_name) === berthKey(b.name));
        const ships = (row?.slots || []).filter((s) => s.call_sign);
        const cap = Math.max(row?.max_concurrent_vessels || 0, (row?.slots || []).length, ships.length, 1);
        const worst = ships.map((s) => s.status).filter(Boolean)
          .sort((x, y) => (VERDICT_RANK[x] ?? 9) - (VERDICT_RANK[y] ?? 9))[0];
        const verdict =
          berthWeather && ONSAN_WEATHER_GROUP[id] === berthWeather.berth_group
            ? berthWeather.status
            : null;
        const escalated = verdict && verdict !== '정상';
        const dotColor = worst ? DOT[worst] : ships.length ? '#8FA3B0' : 'transparent';
        const names = ships.map((s) => `${s.vessel_name || s.call_sign}${s.status ? ` ${s.status}` : ''}`).join(', ');
        return (
          <div
            key={id}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedObject({
              type: 'Berth', id, name: b.name, status: ships.length ? 'active' : 'idle',
              mooredShip: ships.length ? names : null,
            })}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.click(); }}
            title={`${b.name} — ${names || '공석'}${verdict ? ` · 부두 기상 ${verdict}` : ''}`}
            style={{
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap',
              padding: '2px 7px', borderRadius: '6px', fontSize: '11px',
              // 어두운 HUD 위라 라이트 화면용 글자색(COLORS.textPrimary, 짙은 남색)을 쓰면 점유 선석 이름이 사라졌다
              color: ships.length ? '#E8F0F2' : '#8FA3B0',
              border: `1px solid ${escalated ? WEATHER_STATUS_COLORS[verdict] : 'rgba(255,255,255,0.08)'}`,
              background: escalated ? '#0d1b2a' : 'rgba(255,255,255,0.03)',
            }}
          >
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
              background: dotColor, border: ships.length ? 'none' : '1px solid #5B6B76',
              boxShadow: worst ? `0 0 6px ${dotColor}` : 'none',
            }} />
            {b.name.replace(/\s*부두$/, '').replace('터미널', '')}
            {ships.length > 0 && <span style={{ fontSize: '10px', color: '#8FA3B0', fontFamily: 'ui-monospace, Consolas, monospace' }}>{ships.length}/{cap}</span>}
            {escalated && (
              <span style={{ color: WEATHER_STATUS_COLORS[verdict], fontWeight: 800 }}>{verdict}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
