import useSensorStore from '../../stores/useSensorStore';
import useVesselThread from '../../hooks/useVesselThread';
import { VERDICT_COLOR, VERDICT_RANK, berthKey, verdictColor } from '../../utils/verdict';
import { sortOnsan, shortBerth } from '../../utils/onsanBerths';

// ─────────────────────────────────────────────────────────────────────────────
// 선석 현황판 (2026-09-29 밤)
//
// 온산 15개 부두를 해안선 순서로 칸에 놓고, 칸마다 선석 수만큼 줄을 그어 접안 선박과 그 판정 색을 채운다.
// "온산 선석 점유 N개" 타일의 자세한 모습이고, 칸을 누르면 그 부두의 서랍(접안 · 기상 · 최근 접안 · 재항 시간)이 열린다.
// 자료는 선박 판정 화면의 '하역 중'과 같은 /dashboard/berth-assignments(항만공사 선박위치로 본 접안)다.
// ─────────────────────────────────────────────────────────────────────────────

const LEGEND = ['부적합', '주의', '판정불가', '적합'];

export default function BerthBoard() {
  const { berths, thread, loaded } = useVesselThread();
  const selectedBerth = useSensorStore((s) => s.selectedBerth);
  const setSelectedBerth = useSensorStore((s) => s.setSelectedBerth);
  const tracked = useSensorStore((s) => s.trackedVessel);

  const onsan = sortOnsan(berths.filter((b) => b.port_name === '온산항'));
  const occupied = onsan.filter((b) => (b.slots || []).some((s) => s.call_sign)).length;
  const trackedKey = tracked ? berthKey(tracked.callsgn) : null;

  return (
    <div className="glass-card berth-board" id="berth-board">
      <div className="glass-card-header">
        <h3 className="glass-card-title">
          선석 현황
          {loaded && <span className="bb-count">{occupied}<small>/{onsan.length}</small></span>}
        </h3>
        <div className="bb-legend" aria-label="판정 색">
          {LEGEND.map((lv) => (
            <span key={lv}><i style={{ background: VERDICT_COLOR[lv] }} />{lv}</span>
          ))}
        </div>
      </div>
      {!loaded ? (
        <div className="bb-grid" aria-busy="true">
          {Array.from({ length: 15 }).map((_, i) => <div key={i} className="bb-cell bb-skeleton" />)}
        </div>
      ) : (
        <div className="bb-grid">
          {onsan.map((b) => {
            const ships = (b.slots || []).filter((s) => s.call_sign);
            const cap = Math.max(b.max_concurrent_vessels || 0, (b.slots || []).length, ships.length, 1);
            const worst = ships
              .map((s) => s.status)
              .filter(Boolean)
              .sort((x, y) => (VERDICT_RANK[x] ?? 9) - (VERDICT_RANK[y] ?? 9))[0];
            const here = thread && thread.berth && berthKey(thread.berth) === berthKey(b.wharf_name);
            const sel = selectedBerth && berthKey(selectedBerth) === berthKey(b.wharf_name);
            return (
              <button
                key={b.wharf_name}
                type="button"
                className={`bb-cell${ships.length ? ' busy' : ''}${here ? ' tracked' : ''}${sel ? ' selected' : ''}`}
                style={worst ? { '--bb-tone': verdictColor(worst) } : undefined}
                onClick={() => setSelectedBerth(b.wharf_name)}
                aria-label={`${b.wharf_name} — 접안 ${ships.length}척`}
              >
                <span className="bb-top">
                  <strong>{shortBerth(b.wharf_name)}</strong>
                  <span className="bb-cap">{ships.length}/{cap}</span>
                </span>
                <span className="bb-slots">
                  {Array.from({ length: cap }).map((_, i) => {
                    const s = ships[i];
                    if (!s) return <span key={i} className="bb-free" />;
                    const mine = trackedKey && berthKey(s.call_sign) === trackedKey;
                    return (
                      <span
                        key={s.call_sign}
                        className={`bb-ship${s.status ? '' : ' none'}${mine ? ' mine' : ''}`}
                        style={{ '--ship-tone': s.status ? verdictColor(s.status) : undefined }}
                        title={`${s.vessel_name || s.call_sign} · ${s.status || '판정 전'}`}
                      >
                        {s.vessel_name || s.call_sign}
                      </span>
                    );
                  })}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
