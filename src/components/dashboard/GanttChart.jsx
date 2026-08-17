import { useMemo } from 'react';
import useDashboardData from '../../hooks/useDashboardData';
import useSensorStore from '../../stores/useSensorStore';
import { COLORS } from '../../utils/constants';

const STATUS_META = {
  IN_PROGRESS: { label: '하역 중', color: COLORS.teal },
  PLANNED: { label: '대기', color: COLORS.yellow },
  COMPLETED: { label: '완료', color: COLORS.textDim },
};

const fmtKST = (utc, withDate = true) =>
  utc
    ? new Date(utc).toLocaleString('ko-KR', {
        ...(withDate ? { month: '2-digit', day: '2-digit' } : {}),
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul',
      })
    : '-';

// 진행 중/예정 하역 작업 행 (진행률 바)
function JobRow({ op }) {
  const meta = STATUS_META[op.status] || STATUS_META.PLANNED;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: `1px solid rgba(78,205,196,0.06)` }}>
      <div style={{ width: '240px', flexShrink: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 700 }}>{op.vessel_name}</div>
        <div style={{ fontSize: '11.5px', color: COLORS.textSecondary }}>
          {op.berth} · {op.cargo} {op.un_no && `(${op.un_no})`}
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: COLORS.textSecondary, marginBottom: '3px' }}>
          <span>{fmtKST(op.begin_utc, false)} → {fmtKST(op.end_utc, false)} (KST)</span>
          <span>
            {op.planned_tons != null && (
              <>{(op.done_tons ?? 0).toLocaleString()} / {op.planned_tons.toLocaleString()} t</>
            )}
          </span>
        </div>
        <div style={{ height: '13px', background: COLORS.card, borderRadius: '7px', overflow: 'hidden' }}>
          <div style={{
            width: `${op.progress_pct}%`, height: '100%',
            background: `linear-gradient(90deg, ${meta.color}, ${meta.color}cc)`,
            transition: 'width 1s', borderRadius: '5px',
          }} />
        </div>
      </div>
      <span style={{
        flexShrink: 0, fontSize: '12px', fontWeight: 800, color: meta.color,
        border: `1px solid ${meta.color}`, borderRadius: '999px', padding: '2px 10px', minWidth: '70px', textAlign: 'center',
      }}>
        {meta.label} {op.status === 'IN_PROGRESS' && `${Math.round(op.progress_pct)}%`}
      </span>
    </div>
  );
}

// 실데이터 접안 이력 간트 (upa_port_call 실기록) — 부두별 그룹
//
// 이영서 요청(2026-08-17): "부두 별로 그룹화하면 현황이 더 잘 드러나지 않을까"
//
// 예전에는 선박 한 척이 한 줄이라 같은 부두 기록이 목록 곳곳에 흩어졌다. 그러면
// "이 부두가 얼마나 붐비나 / 언제 비나"가 안 보인다 — 선석 배정을 판단하려면
// 부두가 축이어야 한다. 이제 부두 한 줄에 그 부두의 접안 구간을 모두 겹쳐 그리고,
// 접안 건수가 많은 부두를 위로 올린다.
function HistoryGantt({ records }) {
  const { t0, span, groups } = useMemo(() => {
    const begins = records.map((r) => new Date(r.begin_utc).getTime());
    const ends = records.map((r) => new Date(r.end_utc).getTime());
    const min = Math.min(...begins);
    const max = Math.max(...ends);

    const byBerth = new Map();
    for (const r of records) {
      const key = r.berth || '(부두 미상)';
      if (!byBerth.has(key)) byBerth.set(key, []);
      byBerth.get(key).push(r);
    }
    // 접안 건수 많은 부두 먼저 — 붐비는 곳이 위로 온다
    const sorted = [...byBerth.entries()]
      .map(([berth, rows]) => ({
        berth,
        rows,
        totalHours: rows.reduce((s, r) => s + (new Date(r.end_utc) - new Date(r.begin_utc)) / 3600000, 0),
      }))
      .sort((a, b) => b.rows.length - a.rows.length || b.totalHours - a.totalHours);

    return { t0: min, span: Math.max(1, max - min), groups: sorted, t1: max };
  }, [records]);

  const t1 = t0 + span;

  return (
    <div>
      {groups.map((g) => (
        <div key={g.berth} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0' }}>
          <div style={{ width: '210px', flexShrink: 0, fontSize: '12px' }}>
            <span style={{ fontWeight: 700 }}>{g.berth}</span>
            <span style={{ color: COLORS.textSecondary }}> · {g.rows.length}건</span>
          </div>
          {/* 한 줄 = 한 부두. 그 부두의 접안 구간을 모두 이 트랙 위에 얹는다. */}
          <div style={{
            flex: 1, position: 'relative', height: '18px',
            background: 'rgba(11, 74, 143, 0.05)', borderRadius: '4px',
          }}>
            {g.rows.map((r) => {
              const b = new Date(r.begin_utc).getTime();
              const e = new Date(r.end_utc).getTime();
              const left = ((b - t0) / span) * 100;
              const width = Math.max(1.2, ((e - b) / span) * 100);
              const hours = ((e - b) / 3600000).toFixed(1);
              return (
                <div
                  key={r.job_id}
                  title={`${r.vessel_name}\n${fmtKST(r.begin_utc)} → ${fmtKST(r.end_utc)} (KST) · ${hours}시간 접안`}
                  style={{
                    position: 'absolute', left: `${left}%`, width: `${width}%`,
                    top: 3, height: 12,
                    background: COLORS.info, opacity: 0.8, borderRadius: '3px',
                  }}
                />
              );
            })}
          </div>
          <span style={{ flexShrink: 0, fontSize: '11px', color: COLORS.textDim, width: '58px', textAlign: 'right' }}>
            {g.totalHours.toFixed(0)}h
          </span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: COLORS.textDim, marginTop: '4px', paddingLeft: '220px' }}>
        <span>{fmtKST(new Date(t0).toISOString())}</span>
        <span>{fmtKST(new Date(t1).toISOString())} (KST)</span>
      </div>
    </div>
  );
}

export default function GanttChart() {
  const { data } = useDashboardData();
  const orchestration = useSensorStore((s) => s.orchestration);

  const ops = data?.operations ?? [];
  const stats = data?.stats;
  const isRealHistory = data?.data_source?.history === 'REAL';

  // 배정 시뮬레이션 승인 건을 예정 작업으로 반영
  const jobs = useMemo(() => {
    const base = ops.filter((o) => !o.is_real_record);
    if (orchestration?.status === 'APPROVED' && orchestration.berth_assigned) {
      return [
        {
          job_id: 'SIM', vessel_name: `${orchestration.vessel_name} (시뮬레이션 배정)`,
          berth: orchestration.berth_assigned, cargo: orchestration.cargo_name, un_no: null,
          planned_tons: null, done_tons: null, progress_pct: 0, status: 'PLANNED',
          begin_utc: null, end_utc: null, is_real_record: false,
        },
        ...base,
      ];
    }
    return base;
  }, [ops, orchestration]);

  const history = ops.filter((o) => o.is_real_record);

  return (
    <div className="glass-card full-width">
      <div className="glass-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <h3 className="glass-card-title">하역 작업 현황 (선석 스케줄)</h3>
        {/* onsan_port_calls·ais_position_rows 는 구 mock-server 전용 필드라 백엔드에
            대응 개념이 없다(항상 undefined → 렌더 안 됨). 지금 백엔드가 실제로 주는
            분류(port_calls_by_facility_type)로 바꿔 적는다 — "선석으로 확정된 접안이
            몇 건인가"는 선석 특정 안전지수 축의 근거이기도 하다. */}
        {stats?.total_port_calls != null && (
          <span style={{ fontSize: '12px', color: COLORS.textSecondary }}>
            실수집 기반: 입출항 <strong style={{ color: COLORS.teal }}>{stats.total_port_calls.toLocaleString()}</strong>건
            {stats.port_calls_by_facility_type?.BERTH != null && (
              <> · 선석 확정 <strong style={{ color: COLORS.teal }}>{stats.port_calls_by_facility_type.BERTH.toLocaleString()}</strong>건</>
            )}
          </span>
        )}
      </div>

      <div style={{ fontSize: '13px', fontWeight: 700, color: COLORS.textSecondary, margin: '6px 0' }}>
        진행 중 / 예정 작업
        <span style={{ fontWeight: 400, color: COLORS.textDim }}> — 진행률은 데모값 (실시간 유량 센서 미수집)</span>
      </div>
      {jobs.map((op) => <JobRow key={op.job_id} op={op} />)}

      {history.length > 0 && (
        <>
          <div style={{ fontSize: '12px', fontWeight: 700, color: COLORS.textSecondary, margin: '16px 0 6px' }}>
            온산 선석 실제 접안 이력 (부두별)
            <span style={{ fontWeight: 400, color: isRealHistory ? COLORS.teal : COLORS.textDim }}>
              {' '}— upa_port_call 실수집 데이터 {isRealHistory && '●'}
            </span>
          </div>
          <HistoryGantt records={history} />
        </>
      )}
    </div>
  );
}
