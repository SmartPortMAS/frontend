import { Html } from '@react-three/drei';
import useSensorStore from '../../stores/useSensorStore';
import { ONSAN_BERTHS_3D, MOOR_HEADING, bayShift } from '../../utils/geoUtils';

// ─────────────────────────────────────────────
// 입항 예정 선박 — 72시간 판정 흐름의 시간축 위치에서만 보인다 (2026-09-28)
//
// PORT-MIS 입항 신고의 입항 예정 시각 · 사전배정 계류시설 · 출항 예정 시각으로, 시간축이
// 입항 예정 시각에 닿으면 그 선석에 반투명 선체가 서고 출항 예정 시각에 사라진다.
// 신고 기준이지 실제 위치가 아니므로 실선박(불투명)과 구분해 반투명 · "입항 예정(신고)"
// 표지를 단다. 정박지에서 선석까지의 이동 경로는 근거가 없어 그리지 않는다.
// ─────────────────────────────────────────────

const LEVEL_TINT = { 적합: '#60a5fa', 주의: '#f59e0b', 부적합: '#ef4444', 판정불가: '#a78bfa' };

const labelStyle = {
  background: 'rgba(13, 27, 42, 0.85)', border: '1px dashed rgba(96, 165, 250, 0.8)', borderRadius: 6,
  padding: '2px 7px', color: '#dbeafe', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', pointerEvents: 'none',
};

export default function ScheduledShips() {
  const preview = useSensorStore((s) => s.outlookPreview);
  const ships = useSensorStore((s) => s.ships);
  const ghosts = preview?.ghosts || [];
  if (!ghosts.length) return null;
  const departed = new Set(preview?.departed || []);
  // 그 선석에 아직 실선박이 붙어 있으면(출항 예정 전) 바다 쪽으로 비켜 세운다 — 겹쳐 그리지 않는다
  const occupied = new Set(
    ships.filter((s) => s.berth && s.status === 'mooring' && !departed.has(s.callsgn)).map((s) => s.berth),
  );
  return (
    <group>
      {ghosts.map((g, i) => {
        const b = ONSAN_BERTHS_3D[g.berthId];
        if (!b) return null;
        const [x, z] = bayShift(b.moor, occupied.has(g.berthId) ? 30 + i * 4 : 0);
        const tint = LEVEL_TINT[g.level] || LEVEL_TINT.적합;
        return (
          <group key={`${g.call_sign}-${g.eta}`} position={[x, 0, z]} rotation={[0, MOOR_HEADING, 0]}>
            <mesh position={[0, 3, 0]}>
              <boxGeometry args={[16, 6, 60]} />
              <meshStandardMaterial color={tint} transparent opacity={0.35} depthWrite={false} />
            </mesh>
            <mesh position={[0, 3, 0]}>
              <boxGeometry args={[16.2, 6.2, 60.2]} />
              <meshBasicMaterial color={tint} wireframe transparent opacity={0.7} />
            </mesh>
            <mesh position={[0, 8, -20]}>
              <boxGeometry args={[12, 6, 10]} />
              <meshStandardMaterial color="#e2e8f0" transparent opacity={0.3} depthWrite={false} />
            </mesh>
            <Html position={[0, 42, 0]} center zIndexRange={[20, 0]} distanceFactor={320}>
              <div style={labelStyle}>
                입항 예정(신고) · {g.vessel_name || g.call_sign}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
