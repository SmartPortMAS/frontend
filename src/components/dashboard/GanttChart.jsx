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

// 실데이터 접안 이력 간트 (upa_port_call 실기록)
function HistoryGantt({ records }) {
  const { t0, t1 } = useMemo(() => {
    const begins = records.map((r) => new Date(r.begin_utc).getTime());
    const ends = records.map((r) => new Date(r.end_utc).getTime());
    return { t0: Math.min(...begins), t1: Math.max(...ends) };
  }, [records]);
  const span = Math.max(1, t1 - t0);

  return (
    <div>
      {records.map((r) => {
        const b = new Date(r.begin_utc).getTime();
        const e = new Date(r.end_utc).getTime();
        const left = ((b - t0) / span) * 100;
        const width = Math.max(1.2, ((e - b) / span) * 100);
        const hours = ((e - b) / 3600000).toFixed(1);
        return (
          <div key={r.job_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0' }}>
            <div style={{ width: '210px', flexShrink: 0, fontSize: '12px' }}>
              <span style={{ fontWeight: 700 }}>{r.vessel_name}</span>
              <span style={{ color: COLORS.textSecondary }}> · {r.berth}</span>
            </div>
            <div style={{ flex: 1, position: 'relative', height: '14px', background: 'rgba(78,205,196,0.05)', borderRadius: '4px' }}>
              <div
                title={`${fmtKST(r.begin_utc)} → ${fmtKST(r.end_utc)} (KST) · ${hours}시간 접안`}
                style={{
                  position: 'absolute', left: `${left}%`, width: `${width}%`, height: '100%',
                  background: COLORS.info, opacity: 0.75, borderRadius: '4px',
                }}
              />
            </div>
            <span style={{ flexShrink: 0, fontSize: '11px', color: COLORS.textDim, width: '58px', textAlign: 'right' }}>
              {hours}h
            </span>
          </div>
        );
      })}
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
            온산 선석 실제 접안 이력
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
