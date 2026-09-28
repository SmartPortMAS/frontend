import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, ComposedChart, Bar, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ReferenceDot,
} from 'recharts';
import { fetchUpcomingArrivals, postAssessAndRecord } from '../api/backendAdapter';
import useSensorStore from '../stores/useSensorStore';
import { COLORS } from '../utils/constants';
import { cargoNames, cargoSummary } from '../utils/cargoText';
import HelpTip from '../components/common/HelpTip';
import BerthAssignmentMap from '../components/dashboard/BerthAssignmentMap';
import BerthOccupiedList from '../components/dashboard/BerthOccupiedList';
import AgentConsole from '../components/dashboard/AgentConsole';
import GanttChart from '../components/dashboard/GanttChart';

// ─────────────────────────────────────────────
// 선박 판정 (SafeBerth 방향 C, 2026-09-17 · 2026-09-27 선석 현황 통합)
//
// 기존 선석 배정(항만공사 선석회의 → PORT-MIS 입항 신고의 계류시설)은 그대로 따른다.
// 배 한 척을 입항 전 → 접안 직전 → 하역 중 순서로 따라가는 화면이다.
//   1) 입항 선박 판정 — 사전배정 계류시설과 판정에 쓰일 사실, 판정 요청
//   2) 접안 선박 · 선석 점유 — 선석 슬롯 지도(판정 근거 팝업)와 점유 목록. 9/27 까지 '선석 현황' 메뉴였다.
//   [2026-09-28] '들어오는 배/붙어 있는 배' 같은 입말을 입항·접안 같은 항만 용어로 바꾸고(현우 지적),
//   범위 단추를 PORT-MIS 계류시설 기준 이름으로, 시점 척수를 고른 범위와 같게, 판정 칸은 결론 대신 이유를 보이게 했다.
//      하역 중인 배가 1)에도 나와 같은 배가 두 화면에 보였고 판정 칸도 두 곳이라 합쳤다.
//   3) 부두별 접안 이력(실측) — 대시보드에 있던 간트. 선석이 축인 정보라 이 화면 몫이다.
//   4) 실제로 있었던 날의 재생 — 세 시점(입항 전 · 접안 직전 · 하역 중) 판정과
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
// 시점은 판정이 아니라 사실이다(백엔드 arrivals._stage) — 카드 부제로 기준을 적는다.
const STAGE_NOTE = {
  입항전: '입항 예정 시각 전',
  접안직전: '입항 시각 지남 · 묘박 대기',
  하역중: '선석 계류(항만공사 선박위치)',
};
// 판정 이유의 첫 줄은 대개 결론을 되풀이한다("배정된 선석이 이 선박·화물 조건에 맞습니다/맞지 않습니다").
// 표에는 그 다음의 구체적인 이유 한 줄을 보인다. 전체 이유는 칩에 마우스를 올리면 보인다.
const GENERIC_REASON = /^배정된 선석이 이 선박·화물 조건에 맞/;
function keyReason(reasons) {
  const list = (reasons || []).map(String).filter(Boolean);
  return list.find((t) => !GENERIC_REASON.test(t)) || list[0] || null;
}
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
  const [scope, setScope] = useState('onsan');
  // 화면에서 바로 요청한 판정의 진행 상태 — { [call_sign]: 'busy' | { error } }
  const [judging, setJudging] = useState({});
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => fetchUpcomingArrivals()
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(e.message); });
    load();
    const id = setInterval(load, 10 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, [reloadKey]);

  const requestConsole = useSensorStore((st) => st.requestConsole);
  // 판정 감시 작업은 10분마다 "지금 항내에 있는 배"만 훑는다. 아직 오지 않은 배는 관제사가
  // 여기서 직접 판정을 요청한다 — 결과는 판정 이력에 남고 표가 다시 읽는다.
  const setJudgeBusy = useSensorStore((st) => st.setJudgeBusy);
  const focus = useSensorStore((st) => st.reasoningFocus);
  const judge = async (r) => {
    const key = r.call_sign;
    setJudging((m) => ({ ...m, [key]: 'busy' }));
    setJudgeBusy(key, true);
    try {
      await postAssessAndRecord({
        callSign: r.call_sign, vesselName: r.vessel_name, draughtM: r.draught_m,
        chemId: r.chem_id, casNo: r.cas_no, cargoName: r.cargo_name,
        wharfName: r.wharf_name || r.facility_name,
      });
      setJudging((m) => { const n = { ...m }; delete n[key]; return n; });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setJudging((m) => ({ ...m, [key]: { error: e.message } }));
    } finally {
      setJudgeBusy(key, false);
    }
  };
  // 판정을 요청할 수 없는 이유 — 지어내지 않고 무엇이 없는지 말한다
  const cannotJudge = (r) => {
    if (!(r.wharf_name || r.facility_name)) return '계류시설 없음';
    if (!(Number(r.draught_m) > 0)) return '흘수 없음';
    if (!(r.chem_id || r.cas_no)) return '화물 미확인';
    return null;
  };

  const items = data?.items || [];
  // 범위 = PORT-MIS 입항 신고의 계류시설 기준(백엔드 arrivals: facility_type · is_onsan).
  //   berth  울산항 계류시설 — 부두·돌핀·부이로 신고한 배(정박지·미확인 신고 제외)
  //   onsan  그중 온산항 계류시설
  //   all    정박지 포함 전체 — 액체화물선 입항 신고 전부
  const inScope = useMemo(() => items.filter((r) => (
    scope === 'all' ? true : scope === 'onsan' ? r.is_onsan : r.facility_type === 'BERTH'
  )), [items, scope]);
  // [2026-09-28] 시점 척수를 고른 범위로 센다 — 예전엔 늘 전체로 세어 표와 숫자가 달랐다.
  const stageCount = useMemo(() => inScope.reduce((acc, r) => {
    acc[r.stage] = (acc[r.stage] || 0) + 1; return acc;
  }, {}), [inScope]);
  // 시점 카드를 누르면 그 시점만 본다(다시 누르면 전체)
  const [stageFilter, setStageFilter] = useState(null);
  const shown = useMemo(
    () => (stageFilter ? inScope.filter((r) => r.stage === stageFilter) : inScope),
    [inScope, stageFilter],
  );

  const scopes = [
    ['onsan', `온산 계류시설 ${data?.onsan_count ?? '-'}`],
    ['berth', `울산항 계류시설 ${data?.berth_count ?? '-'}`],
    ['all', `정박지 포함 전체 ${data?.count ?? '-'}`],
  ];

  return (
    <div className="glass-card">
      <div className="glass-card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <h3 className="glass-card-title" style={{ display: 'flex', alignItems: 'center' }}>
          입항 선박 판정 · 72시간 이내 입항
          <HelpTip title="입항 선박 판정">
            <div>액체화물선 입항 신고(PORT-MIS, 12시간 전 ~ 72시간 뒤 입항)와 판정입니다. 흘수·항해상태는 항만공사 선박위치, 없으면 선박제원을 씁니다.
            신고 구분이 최종이 아니면 입항 시각은 예정입니다.</div>
            <div style={{ marginTop: 4 }}>시점은 사실로 정합니다 — 입항 전(입항 예정 시각 전) · 접안 직전(입항 시각이 지났거나 묘박 대기) · 하역 중(선석 계류).
            카드를 누르면 그 시점만 봅니다.</div>
            <div style={{ marginTop: 4 }}>판정이 없는 선박은 [판정 요청]으로 그 자리에서 판정하고 결과는 판정 이력에 남습니다. 벗어난 선박은 이유와 조치안 → 받는 곳을 보입니다.</div>
          </HelpTip>
        </h3>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', alignItems: 'center' }}>
          <HelpTip title="범위 — 계류시설 기준">
            <div>PORT-MIS 입항 신고의 계류시설로 나눕니다.</div>
            <div>· 울산항 계류시설: 부두·돌핀·부이로 신고한 선박(정박지·미확인 신고 제외)</div>
            <div>· 온산 계류시설: 그중 온산항</div>
            <div>· 정박지 포함 전체: 액체화물선 입항 신고 전부</div>
          </HelpTip>
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
        {['입항전', '접안직전', '하역중'].map((k) => {
          const on = stageFilter === k;
          const live = items.some((r) => r.stage === k && (judging[r.call_sign] === 'busy' || focus?.callsgn === r.call_sign));
          return (
            <button
              key={k} type="button" aria-pressed={on}
              className={live ? 'stage-live' : undefined}
              onClick={() => setStageFilter((cur) => (cur === k ? null : k))}
              title={on ? '다시 누르면 모든 시점을 봅니다' : `${STAGE_LABEL[k]} 선박만 봅니다`}
              style={{
                textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit',
                border: `1px solid ${on ? COLORS.navy : 'transparent'}`, borderTop: `3px solid ${COLORS.navy}`,
                background: on ? '#E6EDF5' : COLORS.cardHover, padding: '8px 12px', borderRadius: 0,
              }}
            >
              <div style={{ fontSize: 12.5, color: COLORS.textSecondary, fontWeight: 600 }}>{STAGE_LABEL[k]}</div>
              <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'ui-monospace, Consolas, monospace' }}>
                {data ? (stageCount[k] || 0) : '-'}<span style={{ fontSize: 13, color: COLORS.textDim, marginLeft: 4 }}>척</span>
              </div>
              <div style={{ fontSize: 11, color: COLORS.textDim }}>{STAGE_NOTE[k]}</div>
            </button>
          );
        })}
      </div>

      {error && (
        <p style={{ color: COLORS.red, fontSize: 13 }}>
          입항 예정 목록을 불러오지 못했습니다 — 관제 서버에 연결할 수 없습니다.
        </p>
      )}
      {!error && data && data.has_assessment_history === false && (
        <p style={{ color: COLORS.textDim, fontSize: 12, margin: '0 0 8px' }}>
          판정 이력 저장이 아직 연결되지 않아 판정 열은 비어 있습니다. 표 수심 여유는 조위를 더하지 않은 참고값입니다.
        </p>
      )}

      <div style={{ overflowX: 'auto' }} id="arrival-table">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: COLORS.textDim, borderBottom: `1px solid ${COLORS.border}` }}>
              <th style={th}>입항(KST)</th>
              <th style={th}>선박</th>
              <th style={th}>신고</th>
              <th style={th}>화물</th>
              <th style={th}>사전배정 계류시설</th>
              <th style={th}>수심</th>
              <th style={th}>흘수</th>
              <th style={th}>표 수심 여유</th>
              <th style={th}>시점</th>
              <th style={th}>판정 · 조치안</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr
                key={`${r.call_sign}-${r.arrival_at_utc}`}
                className={[
                  focus?.callsgn === r.call_sign ? 'row-focus' : '',
                  judging[r.call_sign] === 'busy' || (focus?.callsgn === r.call_sign && focus.loading) ? 'row-busy' : '',
                ].join(' ').trim() || undefined}
                style={{ borderBottom: `1px solid ${COLORS.border}` }}
              >
                <td style={{ ...td, fontFamily: 'ui-monospace, Consolas, monospace', whiteSpace: 'nowrap' }}>{kst(r.arrival_at_utc)}</td>
                <td style={td}>
                  <div style={{ fontWeight: 600 }}>{r.vessel_name || '(선명 미상)'}</div>
                  <div style={{ fontSize: 11, color: COLORS.textDim }}>{r.ship_kind} · {r.call_sign}</div>
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap', color: r.report_type === '최종' ? COLORS.textPrimary : COLORS.textSecondary }}>{r.report_type || '-'}</td>
                {/* 이 입항 건에 단 화물 전부 — 입항 후 위치 화면과 같은 키(입항 건)라 같은 화물이다 */}
                <td style={td} title={cargoNames(r.cargos).join(', ')}>
                  {r.cargos?.length ? cargoSummary(r.cargos, 3) : <span style={{ color: COLORS.textDim }}>미확인</span>}
                </td>
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
                  {/부이/.test(r.wharf_name || r.facility_name || '')
                    ? <span style={{ fontFamily: 'inherit', color: COLORS.textDim }}>해당 없음(부이)</span>
                    : r.chart_margin_m != null ? `${r.chart_margin_m >= 0 ? '+' : ''}${r.chart_margin_m.toFixed(2)} m` : '-'}
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{STAGE_LABEL[r.stage]}</td>
                <td style={td}>
                  {r.assessment ? (
                    <div title={(r.assessment.reasons || []).join('\n')}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <LevelPill level={r.assessment.level} />
                        <button
                          type="button"
                          onClick={() => requestConsole(r.call_sign, r.chem_id ? { chem_id: r.chem_id, name: r.cargo_name } : null, {
                            subject: {
                              vessel_name: r.vessel_name, wharf: r.wharf_name || r.facility_name, draught_m: r.draught_m,
                              cargo: r.chem_id || r.cas_no ? { chem_id: r.chem_id, cas_no: r.cas_no, name: r.cargo_name } : null,
                              cargos: r.cargos || [],
                            },
                            record: r.assessment,
                          })}
                          title="왜 이 판정인지 선석 → 기상 → 혼재 순서로 봅니다"
                          style={{ border: 'none', background: 'transparent', color: COLORS.navy, padding: 0, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          근거
                        </button>
                      </span>
                      {/* 적합은 칩만 — 같은 문장이 줄마다 반복되던 것을 없앴다. 벗어난 배만 이유와 조치안을 보인다. */}
                      {r.assessment.level !== '적합' && keyReason(r.assessment.reasons) && (
                        <div style={{ fontSize: 11.5, color: COLORS.textSecondary, marginTop: 3, maxWidth: 280 }}>
                          {keyReason(r.assessment.reasons).slice(0, 90)}
                        </div>
                      )}
                      {r.assessment.level !== '적합' && r.assessment.action && (
                        <div style={{ fontSize: 11.5, marginTop: 2, maxWidth: 280 }}>
                          <span style={{ color: COLORS.textDim }}>조치안</span> {r.assessment.action}
                          {r.assessment.recipient && <> → <strong>{r.assessment.recipient}</strong></>}
                        </div>
                      )}
                    </div>
                  ) : judging[r.call_sign] === 'busy' ? (
                    <span style={{ color: COLORS.info, fontSize: 12 }}>판정 중… (10~20초)</span>
                  ) : cannotJudge(r) ? (
                    <span style={{ color: COLORS.textDim, fontSize: 12 }} title="판정에 필요한 값이 없습니다 — 판정불가">
                      판정불가 · {cannotJudge(r)}
                    </span>
                  ) : (
                    <div>
                      <button
                        type="button" onClick={() => judge(r)}
                        style={{ border: `1px solid ${COLORS.navy}`, background: COLORS.card, color: COLORS.navy, borderRadius: 4, padding: '3px 9px', fontSize: 12, cursor: 'pointer' }}
                        title="지금 이 배를 판정합니다 — 결과는 판정 이력에 남습니다"
                      >
                        판정 요청
                      </button>
                      {judging[r.call_sign]?.error && (
                        <div style={{ fontSize: 11, color: COLORS.red, marginTop: 3, maxWidth: 260 }}>{judging[r.call_sign].error}</div>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {data && shown.length === 0 && (
              <tr><td style={{ ...td, color: COLORS.textDim }} colSpan={10}>이 범위·시점에 입항 신고 선박이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
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
        <figcaption style={{ fontSize: 11.5, color: COLORS.textDim }}>
          흘수 여유 (m) · 점선 = 기준 1 m
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
        <figcaption style={{ fontSize: 11.5, color: COLORS.textDim }}>
          막대 입항 척수(주황 = 너울일) · 선 외해 파고(오른쪽 축)
        </figcaption>
      </figure>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {replay.stages.map((s) => <StageCard key={s.key} stage={s} />)}
      </div>
    </div>
  );
}

// ── 3. 지금 선석에 붙어 있는 배 ────────────────
// 선석 슬롯 지도(클릭 → 슬롯별 배·판정 근거) + 점유 목록. 두 부품은 같은 범위(온산/전체)를 본다.
// [2026-09-28] 지도를 뺐다 — 목록과 같은 자료를 두 번 보여줬다(현우 D8). 판정·확인자·[근거]가 한눈에 보이는 목록만 둔다.
function BerthedSection() {
  return <div className="dash-section" id="berthed"><BerthOccupiedList scope="onsan" /></div>;
}

// eslint-disable-next-line no-unused-vars
function BerthedMapSection() {
  const [scope, setScope] = useState('onsan');
  return (
    <>
      <div className="glass-card dash-section">
        <div className="glass-card-header">
          <h3 className="glass-card-title" style={{ display: 'flex', alignItems: 'center' }}>
            접안 선박 · 선석 점유
            <HelpTip title="접안 선박 · 선석 점유">
              항만공사 선박위치로 판정한 "지금 선석에 접안한 선박"입니다. 입항 신고가 아니라 실제 위치로 정합니다.
              지도의 선석을 누르면 슬롯마다 접안 선박 · 판정 · 위치 근거가 뜹니다.
              아래 목록은 같은 선박을 선석·화물·입출항·확인자·판정 순으로 보여 줍니다. 위 표의 "하역 중"과 같은 선박을 선석 기준으로 본 것입니다.
            </HelpTip>
          </h3>
        </div>
        <div style={{ height: 'clamp(380px, 48vh, 600px)' }}>
          <BerthAssignmentMap scope={scope} onScopeChange={setScope} />
        </div>
      </div>
      <div className="dash-section"><BerthOccupiedList scope={scope} /></div>
    </>
  );
}

function ReplaySection() {
  // 실무 화면이 아니라 교육·사후 검토용(9/27 현우 결정) — 아래에 접어 두고, 펼칠 때만 자료를 읽는다.
  const [open, setOpen] = useState(false);
  const [replays, setReplays] = useState(null);
  const [active, setActive] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || replays) return;
    fetch('/demo/replays.json')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { setReplays(d); setActive(d.replays[0]?.id); })
      .catch((e) => setError(e.message));
  }, [open, replays]);

  const current = replays?.replays.find((r) => r.id === active);
  const tabLabel = (r) => (r.kind === 'swell' ? '외해 너울 9/4~9/11' : `${r.vessel.name} ${r.arrival.slice(5, 10).replace('-', '/')}`);

  return (
    <div className="glass-card">
      <div className="glass-card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <h3 className="glass-card-title" style={{ display: 'flex', alignItems: 'center' }}>
          <button
            type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
            style={{ background: 'transparent', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <span style={{ display: 'inline-block', width: 12, color: COLORS.textDim }}>{open ? '▾' : '▸'}</span>
            사후 검토 — 지난 입항 건 판정 재생
            <span style={{ fontSize: 12, fontWeight: 400, color: COLORS.textDim }}>(실측 기록 · 접어 둠)</span>
          </button>
          <HelpTip title="사후 검토">
            <div>지난 입항 건을 그날의 실측 조위·기상으로 되돌려 입항 전 → 접안 직전 → 하역 중 세 시점 판정과 조치안이 어떻게 달라졌는지 봅니다.</div>
            <div style={{ marginTop: 4 }}>쓰는 때: 사고·이의 제기가 있을 때 "그 시각에 무엇을 근거로 어떤 판정이 났는가"를 되짚을 때, 그리고 새 관제사 교육. 평소 관제에는 쓰지 않아 접어 둡니다.</div>
            <div>흘수 여유 = 표 수심 + 조위 − 흘수. 판정 기준은 조위를 반영한 흘수 여유 1.0 m(체류 중 최저 여유)입니다.</div>
            {current?.source && <div style={{ marginTop: 4 }}>{current.source}</div>}
            {current?.caveat && <div style={{ marginTop: 4 }}>{current.caveat}</div>}
            {replays && (
              <div style={{ marginTop: 4, color: COLORS.textSecondary }}>
                재생 자료 기준일 {new Date(replays.generated_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' })}
              </div>
            )}
          </HelpTip>
        </h3>
        {open && <div role="tablist" style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
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
        </div>}
      </div>
      {open && error && <p style={{ color: COLORS.red, fontSize: 13 }}>재생 데이터를 불러오지 못했습니다 ({error}).</p>}
      {open && current && (
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{current.headline}</p>
          {current.kind === 'swell' ? <SwellReplay replay={current} /> : <VesselReplay replay={current} />}
        </div>
      )}
    </div>
  );
}

export default function ArrivalVerificationPage() {
  const review = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('review') === '1';
  const judgingAny = useSensorStore((st) => Object.keys(st.judgeBusy).length > 0);
  const reasoningLive = useSensorStore((st) => Boolean(st.reasoningFocus));
  return (
    <div className="dashboard-page">
      <div className="glass-card dash-section" style={{ display: 'grid', gap: 6 }}>
        <h2 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center' }}>
          선박 판정
          <HelpTip title="선박 판정">
            <div>기존 선석 배정(선석회의 · PORT-MIS 신고)은 그대로 따릅니다. 선박 한 척을 <strong>입항 전 → 접안 직전 → 하역 중</strong> 순서로 다시 판정하고,
            기상·조위·흘수·인접 화물이 기준을 벗어나면 조치안을 만들어 권한 있는 곳 — 선석 운영 주체 · VTS · 터미널 — 에 근거와 함께 넘깁니다.</div>
            <div style={{ marginTop: 4 }}>위는 <strong>입항 선박 판정</strong>(입항 신고 기준), 아래는 <strong>접안 선박</strong>(실제 위치 기준)입니다.
            판정 옆 [근거]를 누르면 오른쪽 서랍에 선석 → 기상 → 혼재 → 종합 순서로 에이전트 판단 과정이 열립니다.
            대시보드의 "확인 대기 판정"을 누르면 이 화면으로 옵니다.</div>
          </HelpTip>
        </h2>
        {/* 사용 순서 — 번호는 실제로 따라가는 순서다. 누르면 그 자리로 간다. */}
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 13 }}>
          {[
            ['arrival-table', '입항 선박', '시점별 판정 보기'],
            ['arrival-table', '판정 요청', '판정 없는 선박'],
            ['arrival-table', '근거 · 조치안', '벗어난 선박'],
            ['berthed', '접안 선박', '선석별 점유 확인'],
          ].map(([id, head, sub], i) => (
            <li key={head} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && <span aria-hidden="true" style={{ color: COLORS.textDim }}>→</span>}
              <a
                className={(i === 1 && judgingAny) || (i === 2 && reasoningLive) ? 'step-live' : undefined}
                href={`#${id}`}
                onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                style={{
                  display: 'inline-flex', alignItems: 'baseline', gap: 6, padding: '5px 10px',
                  border: `1px solid ${COLORS.border}`, background: COLORS.cardHover, color: COLORS.textPrimary,
                  textDecoration: 'none', borderRadius: 4,
                }}
              >
                <span style={{ fontFamily: 'ui-monospace, Consolas, monospace', color: COLORS.navy, fontWeight: 700 }}>{i + 1}</span>
                <strong>{head}</strong>
                <span style={{ color: COLORS.textDim, fontSize: 12 }}>{sub}</span>
              </a>
            </li>
          ))}
        </ol>
      </div>
      <div className="dash-section"><UpcomingSection /></div>
      <BerthedSection />
      {/* 사후 검토·부두별 접안 이력은 관제 흐름에 없어 화면에서 뺐다(현우 D3) — 보고서·영상 촬영용으로만 ?review=1 */}
      {review && <div className="dash-section"><GanttChart /></div>}
      {review && <div className="dash-section"><ReplaySection /></div>}
      {/* 판단 과정 서랍 — 판정 옆 [근거]로 연다(2026-09-28: 전 화면 떠 있는 창에서 이 화면으로 옮겼다) */}
      <AgentConsole mode="reasoning" />
    </div>
  );
}
