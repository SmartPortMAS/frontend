import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, ComposedChart, Bar, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ReferenceDot,
} from 'recharts';
import { fetchUpcomingArrivals } from '../api/backendAdapter';
import { COLORS } from '../utils/constants';

// ─────────────────────────────────────────────
// 입항 예정 · 검증 (SafeBerth 방향 C, 2026-09-17)
//
// 기존 선석 배정(항만공사 선석회의 → PORT-MIS 입항 신고의 계류시설)은 그대로 따른다.
// 이 화면은 두 가지를 보여준다.
//   1) 지금 들어오고 있는 액체화물선 — 사전배정 계류시설과 판정에 쓰일 사실
//   2) 실제로 있었던 날의 재생 — 세 시점(입항 전 · 접안 직전 · 하역 중) 판정과
//      조치안 · 받는 곳. 데이터는 data-pipeline/data_pipeline/checks/
//      export_demo_replays.py 가 만든 public/demo/replays.json (정적 파일이라
//      백엔드가 꺼져 있어도 재생된다)
//
// 판정 등급은 에이전트가 정한다(assessment_history, D1). 목록의 "표 수심 여유"는
// 조위를 더하지 않은 참고값이라 판정처럼 색칠하지 않는다.
// ─────────────────────────────────────────────

const LEVEL_STYLE = {
  적합: { color: COLORS.teal, bg: '#E2F1ED' },
  주의: { color: COLORS.yellow, bg: '#FBEFD9' },
  부적합: { color: COLORS.red, bg: '#F8E2E1' },
  판정불가: { color: COLORS.purple, bg: '#ECE6F6' },
  확인요청: { color: COLORS.purple, bg: '#ECE6F6' },
};
const STAGE_LABEL = { 입항전: '입항 전', 접안직전: '접안 직전', 하역중: '하역 중' };
const RECIPIENT_NOTE = {
  '선석 운영 주체': '선석회의 · 재배정 조정 근거',
  VTS: 'VHF 지시의 근거',
  '터미널 안전관리자': '하역 개시·중단 → 게이트',
};

function kst(iso, withDate = true) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', hour12: false,
    ...(withDate ? { month: '2-digit', day: '2-digit' } : {}),
    hour: '2-digit', minute: '2-digit',
  });
}

function LevelPill({ level }) {
  const s = LEVEL_STYLE[level] || { color: COLORS.textDim, bg: COLORS.cardHover };
  const text = level === '확인요청' ? '확인 요청' : level;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
      color: s.color, background: s.bg, borderRadius: 999, padding: '3px 10px',
      fontSize: 12, fontWeight: 700,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color }} />
      {text}
    </span>
  );
}

const th = { padding: '7px 8px', fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' };
const td = { padding: '7px 8px', verticalAlign: 'top' };

// ── 1. 지금 들어오는 배 ────────────────────────
function UpcomingSection() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [scope, setScope] = useState('berth');

  useEffect(() => {
    let alive = true;
    const load = () => fetchUpcomingArrivals()
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(e.message); });
    load();
    const id = setInterval(load, 10 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const items = data?.items || [];
  const shown = useMemo(() => items.filter((r) => (
    scope === 'all' ? true : scope === 'onsan' ? r.is_onsan : r.facility_type === 'BERTH'
  )), [items, scope]);
  const stageCount = useMemo(() => items.reduce((acc, r) => {
    acc[r.stage] = (acc[r.stage] || 0) + 1; return acc;
  }, {}), [items]);

  const scopes = [
    ['berth', `부두 배정 ${data?.berth_count ?? '-'}`],
    ['onsan', `온산 ${data?.onsan_count ?? '-'}`],
    ['all', `전체 ${data?.count ?? '-'}`],
  ];

  return (
    <div className="glass-card">
      <div className="glass-card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <h3 className="glass-card-title">지금 들어오는 액체화물선 · 72시간</h3>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {scopes.map(([key, label]) => (
            <button
              key={key} type="button" onClick={() => setScope(key)}
              style={{
                border: `1px solid ${scope === key ? COLORS.navy : COLORS.border}`,
                background: scope === key ? COLORS.navy : COLORS.card,
                color: scope === key ? COLORS.white : COLORS.textSecondary,
                borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
              }}
            >{label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
        {['입항전', '접안직전', '하역중'].map((k) => (
          <div key={k} style={{ borderTop: `3px solid ${COLORS.navy}`, background: COLORS.cardHover, padding: '8px 12px' }}>
            <div style={{ fontSize: 12, color: COLORS.textDim }}>{STAGE_LABEL[k]}</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'ui-monospace, Consolas, monospace' }}>
              {data ? (stageCount[k] || 0) : '-'}<span style={{ fontSize: 13, color: COLORS.textDim, marginLeft: 4 }}>척</span>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p style={{ color: COLORS.red, fontSize: 13 }}>
          입항 예정 목록을 불러오지 못했습니다 ({error}). 백엔드(8001)가 켜져 있는지 확인하세요. 아래 사례 재생은 백엔드 없이 동작합니다.
        </p>
      )}
      {!error && data && data.has_assessment_history === false && (
        <p style={{ color: COLORS.textDim, fontSize: 12, margin: '0 0 8px' }}>
          판정 이력 저장이 아직 연결되지 않아 판정 열은 비어 있습니다. 표 수심 여유는 조위를 더하지 않은 참고값입니다.
        </p>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: COLORS.textDim, borderBottom: `1px solid ${COLORS.border}` }}>
              <th style={th}>입항(KST)</th>
              <th style={th}>선박</th>
              <th style={th}>신고</th>
              <th style={th}>사전배정 계류시설</th>
              <th style={th}>수심</th>
              <th style={th}>흘수</th>
              <th style={th}>표 수심 여유</th>
              <th style={th}>시점</th>
              <th style={th}>판정</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={`${r.call_sign}-${r.arrival_at_utc}`} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <td style={{ ...td, fontFamily: 'ui-monospace, Consolas, monospace', whiteSpace: 'nowrap' }}>{kst(r.arrival_at_utc)}</td>
                <td style={td}>
                  <div style={{ fontWeight: 600 }}>{r.vessel_name || '(선명 미상)'}</div>
                  <div style={{ fontSize: 11, color: COLORS.textDim }}>{r.ship_kind} · {r.call_sign}</div>
                </td>
                <td style={{ ...td, color: r.report_type === '최종' ? COLORS.textPrimary : COLORS.textSecondary }}>{r.report_type || '-'}</td>
                <td style={td}>
                  <div>{r.wharf_name || r.facility_name}</div>
                  {r.wharf_name && r.facility_name !== r.wharf_name && (
                    <div style={{ fontSize: 11, color: COLORS.textDim }}>신고 표기 {r.facility_name}</div>
                  )}
                </td>
                <td style={{ ...td, fontFamily: 'ui-monospace, Consolas, monospace' }}>{r.depth_m != null ? `${r.depth_m} m` : '-'}</td>
                <td style={td}>
                  <span style={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>{r.draught_m != null ? `${r.draught_m} m` : '없음'}</span>
                  <div style={{ fontSize: 11, color: COLORS.textDim }}>{r.draught_basis || '판정불가 사유'}</div>
                </td>
                <td style={{ ...td, fontFamily: 'ui-monospace, Consolas, monospace', color: COLORS.textSecondary }}>
                  {r.chart_margin_m != null ? `${r.chart_margin_m >= 0 ? '+' : ''}${r.chart_margin_m.toFixed(2)} m` : '-'}
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{STAGE_LABEL[r.stage]}</td>
                <td style={td}>
                  {r.assessment ? <LevelPill level={r.assessment.level} /> : <span style={{ color: COLORS.textDim, fontSize: 12 }}>판정 대기</span>}
                </td>
              </tr>
            ))}
            {data && shown.length === 0 && (
              <tr><td style={{ ...td, color: COLORS.textDim }} colSpan={9}>이 범위에 입항 예정 선박이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: COLORS.textDim, margin: '8px 0 0' }}>
        출처: PORT-MIS 입항 신고(오늘~+3일, 매시 갱신) · UPA 선박위치(흘수·항해상태) · 선박제원. 신고가 최종이 아니면 입항 시각은 예정입니다.
      </p>
    </div>
  );
}

// ── 2. 실제로 있었던 날 재생 ────────────────────
function StageCard({ stage }) {
  const note = RECIPIENT_NOTE[stage.recipient];
  return (
    <article style={{
      border: `1px solid ${stage.gate === 'LOCKED' ? COLORS.red : COLORS.border}`, borderRadius: 6,
      background: COLORS.card, display: 'grid', gridTemplateRows: 'auto 1fr auto',
    }}>
      <header style={{ padding: '10px 12px', borderBottom: `1px solid ${COLORS.border}`, background: COLORS.cardHover, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700 }}>{stage.label}</div>
          {stage.at && <div style={{ fontSize: 11, color: COLORS.textDim, fontFamily: 'ui-monospace, Consolas, monospace' }}>{kst(stage.at)}</div>}
        </div>
        <span style={{ marginLeft: 'auto' }}><LevelPill level={stage.level} /></span>
      </header>
      <ul style={{ margin: 0, padding: '10px 12px 10px 28px', fontSize: 13, display: 'grid', gap: 4 }}>
        {stage.facts.map((f) => <li key={f}>{f}</li>)}
        {stage.basis_note && <li style={{ color: COLORS.textDim, fontSize: 12 }}>{stage.basis_note}</li>}
      </ul>
      <footer style={{ padding: '10px 12px', borderTop: `1px solid ${COLORS.border}`, fontSize: 13, display: 'grid', gap: 4 }}>
        <div><span style={{ color: COLORS.textDim, fontSize: 11, marginRight: 6 }}>조치안</span>{stage.action || '없음 — 배정대로 진행'}</div>
        <div>
          <span style={{ color: COLORS.textDim, fontSize: 11, marginRight: 6 }}>받는 곳</span>
          <strong>{stage.recipient}</strong>{note && <span style={{ color: COLORS.textDim }}> · {note}</span>}
        </div>
        {stage.gate && (
          <div>
            <span style={{ color: COLORS.textDim, fontSize: 11, marginRight: 6 }}>게이트</span>
            <strong style={{ color: stage.gate === 'LOCKED' ? COLORS.red : stage.gate === 'CAUTION' ? COLORS.yellow : COLORS.teal }}>
              {stage.gate === 'LOCKED' ? '닫힘 (하역 개시 요청 거부)' : stage.gate === 'CAUTION' ? '주의 — 개시 전 확인' : '열림 가능'}
            </strong>
          </div>
        )}
      </footer>
    </article>
  );
}

function VesselReplay({ replay }) {
  const series = replay.tide_series;
  const nearest = (iso) => {
    const target = new Date(iso).getTime();
    return series.reduce((best, p) => (
      Math.abs(new Date(p.t).getTime() - target) < Math.abs(new Date(best.t).getTime() - target) ? p : best
    ), series[0]);
  };
  const arrival = nearest(replay.arrival);
  const low = nearest(replay.stages.find((s) => s.key === 'cargo_ops').at);
  const minY = Math.floor(Math.min(0, ...series.map((p) => p.margin_m)) * 2) / 2;
  const maxY = Math.ceil(Math.max(replay.margin_threshold_m + 0.5, ...series.map((p) => p.margin_m)) * 2) / 2;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', fontSize: 13, color: COLORS.textSecondary }}>
        <span><strong style={{ color: COLORS.textPrimary }}>{replay.vessel.name}</strong> · {replay.vessel.kind}</span>
        <span>{replay.berth.name} · 표 수심 {replay.berth.depth_m} m</span>
        <span>흘수 {replay.draught.m} m ({replay.draught.basis})</span>
        <span>입항 {kst(replay.arrival)} → 출항 {kst(replay.departure)}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {replay.stages.map((s) => <StageCard key={s.key} stage={s} />)}
      </div>
      <figure style={{ margin: 0 }}>
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 16, right: 24, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" />
              <XAxis dataKey="t" tickFormatter={(v) => kst(v)} minTickGap={48} tick={{ fontSize: 11, fill: COLORS.textDim }} />
              <YAxis domain={[minY, maxY]} tickFormatter={(v) => `${v.toFixed(1)}`} tick={{ fontSize: 11, fill: COLORS.textDim }} width={44} unit=" m" />
              <Tooltip
                labelFormatter={(v) => kst(v)}
                formatter={(v, name) => [`${v >= 0 ? '+' : ''}${Number(v).toFixed(2)} m`, name === 'margin_m' ? '흘수 여유' : '조위']}
                contentStyle={{ backgroundColor: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 6, color: COLORS.textPrimary, fontSize: 12 }}
              />
              <ReferenceLine y={replay.margin_threshold_m} stroke={COLORS.yellow} strokeDasharray="6 4"
                label={{ value: `기준 여유 ${replay.margin_threshold_m} m`, position: 'insideTopRight', fill: COLORS.yellow, fontSize: 11 }} />
              <ReferenceLine y={0} stroke={COLORS.red} strokeOpacity={0.5} />
              <Line type="monotone" dataKey="margin_m" stroke={COLORS.navy} strokeWidth={2} dot={false} isAnimationActive={false} />
              <ReferenceDot x={arrival.t} y={arrival.margin_m} r={6} fill={COLORS.teal} stroke="#fff"
                label={{ value: `접안 ${arrival.margin_m >= 0 ? '+' : ''}${arrival.margin_m.toFixed(2)} m`, position: 'top', fill: COLORS.teal, fontSize: 11 }} />
              <ReferenceDot x={low.t} y={low.margin_m} r={6} fill={low.margin_m < 0 ? COLORS.purple : COLORS.yellow} stroke="#fff"
                label={{ value: `최저 ${low.margin_m >= 0 ? '+' : ''}${low.margin_m.toFixed(2)} m`, position: 'bottom', fill: low.margin_m < 0 ? COLORS.purple : COLORS.yellow, fontSize: 11 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <figcaption style={{ fontSize: 11, color: COLORS.textDim }}>
          흘수 여유 = 표 수심 + 조위 − 흘수. {replay.source}
        </figcaption>
      </figure>
    </div>
  );
}

function SwellReplay({ replay }) {
  const { summary } = replay;
  const data = replay.days.map((d) => ({ ...d, label: d.date.slice(5).replace('-', '/') }));
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {[
          ['평상시 하루 입항', summary.normal_avg, `${summary.normal_days}일 평균`, COLORS.textPrimary],
          ['너울 기간 하루 입항', summary.swell_avg, `${summary.swell_days}일 평균 · 외해 파고 ≥ ${replay.threshold_m} m`, COLORS.yellow],
          ['해소 직후', summary.peak_arrivals, `${summary.peak_date.slice(5).replace('-', '/')} · 기간 최대`, COLORS.red],
        ].map(([label, value, sub, color]) => (
          <div key={label} style={{ borderTop: `2px solid ${color}`, padding: '8px 2px' }}>
            <div style={{ fontSize: 12, color: COLORS.textDim }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color, fontFamily: 'ui-monospace, Consolas, monospace' }}>
              {value}<span style={{ fontSize: 13, color: COLORS.textDim, marginLeft: 4 }}>척</span>
            </div>
            <div style={{ fontSize: 11, color: COLORS.textDim }}>{sub}</div>
          </div>
        ))}
      </div>
      <figure style={{ margin: 0 }}>
        <div style={{ height: 250 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: COLORS.textDim }} minTickGap={16} />
              <YAxis yAxisId="n" tick={{ fontSize: 11, fill: COLORS.textDim }} width={36} />
              <YAxis yAxisId="w" orientation="right" domain={[0, 4]} tick={{ fontSize: 11, fill: COLORS.textDim }} width={36} unit=" m" />
              <Tooltip
                formatter={(v, name) => (name === 'arrivals' ? [`${v}척`, '액체화물선 입항'] : [`${v} m`, '외해 유의파고 일평균'])}
                contentStyle={{ backgroundColor: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 6, color: COLORS.textPrimary, fontSize: 12 }}
              />
              <ReferenceLine yAxisId="w" y={replay.threshold_m} stroke={COLORS.yellow} strokeDasharray="6 4" />
              <Bar yAxisId="n" dataKey="arrivals" isAnimationActive={false}>
                {data.map((d) => (
                  <Cell key={d.date} fill={d.swell ? COLORS.yellow : d.date === summary.peak_date ? COLORS.red : '#9CC3DE'} />
                ))}
              </Bar>
              <Line yAxisId="w" type="monotone" dataKey="wave_avg_m" stroke={COLORS.navy} strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <figcaption style={{ fontSize: 11, color: COLORS.textDim }}>
          막대 = 액체화물선 입항 척수(주황: 너울일) · 선 = 외해 부이 유의파고 일평균(오른쪽 축). {replay.caveat}
        </figcaption>
      </figure>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {replay.stages.map((s) => <StageCard key={s.key} stage={s} />)}
      </div>
    </div>
  );
}

function ReplaySection() {
  const [replays, setReplays] = useState(null);
  const [active, setActive] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/demo/replays.json')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { setReplays(d); setActive(d.replays[0]?.id); })
      .catch((e) => setError(e.message));
  }, []);

  const current = replays?.replays.find((r) => r.id === active);
  const tabLabel = (r) => (r.kind === 'swell' ? '외해 너울 9/4~9/11' : `${r.vessel.name} ${r.arrival.slice(5, 10).replace('-', '/')}`);

  return (
    <div className="glass-card">
      <div className="glass-card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <h3 className="glass-card-title">실제로 있었던 날 — 세 시점 판정 재생</h3>
        <div role="tablist" style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {replays?.replays.map((r) => (
            <button
              key={r.id} type="button" role="tab" aria-selected={active === r.id} onClick={() => setActive(r.id)}
              style={{
                border: `1px solid ${active === r.id ? COLORS.navy : COLORS.border}`,
                background: active === r.id ? COLORS.navy : COLORS.card,
                color: active === r.id ? COLORS.white : COLORS.textSecondary,
                borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
              }}
            >{tabLabel(r)}</button>
          ))}
        </div>
      </div>
      {error && <p style={{ color: COLORS.red, fontSize: 13 }}>재생 데이터를 불러오지 못했습니다 ({error}).</p>}
      {current && (
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{current.headline}</p>
          {current.kind === 'swell' ? <SwellReplay replay={current} /> : <VesselReplay replay={current} />}
        </div>
      )}
      {replays && (
        <p style={{ fontSize: 11, color: COLORS.textDim, margin: '10px 0 0' }}>
          재생 데이터 생성 {kst(replays.generated_at)} · 판정 규칙: 조위 반영 흘수 여유 1.0 m, 체류 중 최저 여유 기준
        </p>
      )}
    </div>
  );
}

export default function ArrivalVerificationPage() {
  return (
    <div className="dashboard-page">
      <div className="glass-card dash-section" style={{ display: 'grid', gap: 6 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>입항 예정 · 검증</h2>
        <p style={{ margin: 0, fontSize: 13, color: COLORS.textSecondary, maxWidth: '72ch' }}>
          기존 선석 배정은 그대로 따릅니다. 배가 들어오는 동안 기상·조위·흘수·인접 화물이 기준을 벗어나면,
          조치안을 만들어 그 조치를 할 권한이 있는 곳 — 선석 운영 주체 · VTS · 터미널 — 에 근거와 함께 넘깁니다.
        </p>
      </div>
      <div className="dash-section"><ReplaySection /></div>
      <div className="dash-section"><UpcomingSection /></div>
    </div>
  );
}
