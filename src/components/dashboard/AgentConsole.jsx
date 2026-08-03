import { useMemo, useState } from 'react';
import {
  FaCloudSun, FaRoute, FaShieldAlt, FaRobot, FaComments, FaTimes, FaPlay, FaSpinner,
} from 'react-icons/fa';
import useOnsanApi from '../../hooks/useOnsanApi';
import useSensorStore from '../../stores/useSensorStore';
import useDashboardData from '../../hooks/useDashboardData';
import { COLORS } from '../../utils/constants';
import { ONSAN_WEATHER_GROUP, ONSAN_BERTHS } from '../../utils/geoUtils';

// ─────────────────────────────────────────────
// 멀티 에이전트 협상 콘솔 (우하단 플로팅 탭)
//
// "그래서 멀티 에이전트가 어떻게 연동되나?" 에 대한 화면상의 답.
// 기상 → 스케줄링 → 안전 → 종합 순으로 각 에이전트가 낸 판단과 근거를
// 메신저 대화처럼 시간순으로 보여준다.
//
// 데이터는 새로 만들지 않는다 — 백엔드 오케스트레이터 응답에 이미 들어 있는
// weather_assessment / assignment_trace / rejected_candidates /
// safety_assessment / summary 를 발화로 옮길 뿐이다.
// ─────────────────────────────────────────────

const AGENTS = {
  weather: { name: '기상분석 에이전트', icon: FaCloudSun, color: '#38bdf8' },
  scheduling: { name: '스케줄링 에이전트', icon: FaRoute, color: '#a78bfa' },
  safety: { name: '안전관제 에이전트', icon: FaShieldAlt, color: '#f59e0b' },
  orchestrator: { name: '종합 오케스트레이터', icon: FaRobot, color: COLORS.teal },
};

const VERDICT_COLOR = {
  APPROVED: COLORS.teal, WAITING_ANCHORAGE: COLORS.yellow,
  REJECTED: COLORS.red, PENDING: COLORS.info,
};

/** 오케스트레이터 결과 → 에이전트별 발화 목록 */
function toMessages({ orchestration, berthWeather, vessel }) {
  if (!orchestration) return [];
  const msgs = [];
  const at = (s) => new Date(Date.now() - s * 1000).toLocaleTimeString('ko-KR', { hour12: false });

  // 1) 기상 — 오케스트레이터가 실은 결과 우선, 없으면 패널에서 본 판정 사용
  const wStatus = orchestration.weather_grade || berthWeather?.status;
  if (wStatus) {
    const obs = berthWeather?.observed;
    msgs.push({
      agent: 'weather', time: at(9),
      text: `${vessel?.berth || '대상 선석'} 기상 판정: ${wStatus}` +
        (obs ? ` (실측 풍속 ${obs.wind ?? '-'} m/s · 파고 ${obs.wave ?? '-'} m)` : ''),
      detail: berthWeather?.reasons || [],
    });
  }

  // 2) 스케줄링 — 전용/대체/정박지 판단 경로
  const trace = orchestration.berth_decision?.trace || [];
  if (trace.length) {
    msgs.push({
      agent: 'scheduling', time: at(6),
      text: orchestration.berth_assigned
        ? `선석 배정: ${orchestration.berth_assigned} (경로: ${orchestration.berth_decision?.path || '-'})`
        : orchestration.anchorage
          ? `접안 불가 → 정박지 대기 배정: ${orchestration.anchorage}`
          : '배정 가능한 선석을 찾지 못했습니다.',
      detail: trace,
    });
  }
  const rejected = orchestration.rejected_candidates || [];
  if (rejected.length) {
    msgs.push({
      agent: 'scheduling', time: at(5),
      text: `탈락 후보 ${rejected.length}건 — 재탐색했습니다.`,
      detail: rejected.map((r) => `${r.berth_id} (${r.rank}순위): ${r.reason}`),
    });
  }

  // 3) 안전 — 혼재/IMDG/LLM 근거
  if (orchestration.risk_level) {
    msgs.push({
      agent: 'safety', time: at(3),
      text: `안전 판정: ${orchestration.risk_level}`,
      detail: [],
    });
  }

  // 4) 종합
  msgs.push({
    agent: 'orchestrator', time: at(1),
    text: orchestration.summary || `${orchestration.decision_label || orchestration.status}`,
    detail: [],
    verdict: orchestration.status,
    verdictLabel: orchestration.decision_label,
  });
  return msgs;
}

export default function AgentConsole() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [approved, setApproved] = useState(false);
  const { orchestrate, assessBerthWeather } = useOnsanApi();
  const orchestration = useSensorStore((s) => s.orchestration);
  const berthWeather = useSensorStore((s) => s.berthWeather);
  const selectedVessel = useSensorStore((s) => s.selectedVessel);
  const setSelectedVessel = useSensorStore((s) => s.setSelectedVessel);
  const { data } = useDashboardData();

  // 지도에 떠 있는 실 AIS 기반 시나리오 선박이 판정 대상
  const vessels = useMemo(
    () => (data?.vessels ?? []).filter((v) => v.is_liquid_cargo_vessel),
    [data]
  );
  const target = selectedVessel && vessels.some((v) => v.port_call_id === selectedVessel.port_call_id)
    ? selectedVessel
    : vessels[0];

  const messages = useMemo(
    () => toMessages({ orchestration, berthWeather, vessel: target }),
    [orchestration, berthWeather, target]
  );

  // 한 번의 실행으로 기상 → 스케줄링 → 안전 → 종합을 순차 수행
  const run = async () => {
    if (!target) return;
    setLoading(true);
    setApproved(false);
    try {
      const berthId = Object.keys(ONSAN_BERTHS).find((k) => ONSAN_BERTHS[k].name === target.berth);
      const group = berthId ? ONSAN_WEATHER_GROUP[berthId] : null;
      if (group) await assessBerthWeather({ berthGroup: group });
      await orchestrate({
        cargoName: target.cargo?.name,
        dwt: 20000,
        draught: 7.5,
        vesselName: target.vessel_name,
      });
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', right: 22, bottom: 22, zIndex: 3000,
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '12px 18px', borderRadius: 26, cursor: 'pointer',
          background: `linear-gradient(135deg, ${COLORS.teal}, ${COLORS.tealDark})`,
          color: '#04222b', border: 'none', fontWeight: 800, fontSize: 14,
          boxShadow: '0 6px 22px rgba(0,0,0,0.45)',
        }}
      >
        <FaComments /> 에이전트 협상 로그
        {orchestration && (
          <span style={{
            background: '#04222b', color: COLORS.teal, borderRadius: 10,
            padding: '1px 8px', fontSize: 11,
          }}>
            {orchestration.decision_label || orchestration.status}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', right: 22, bottom: 22, zIndex: 3000,
      width: 420, maxWidth: 'calc(100vw - 44px)', height: 560, maxHeight: 'calc(100vh - 120px)',
      display: 'flex', flexDirection: 'column',
      background: 'rgba(11,20,32,0.97)', border: `1px solid ${COLORS.glassBorder}`,
      borderRadius: 14, boxShadow: '0 10px 40px rgba(0,0,0,0.55)', overflow: 'hidden',
    }}>
      {/* 헤더 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '11px 14px', borderBottom: `1px solid ${COLORS.glassBorder}`,
        background: 'rgba(255,255,255,0.03)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: COLORS.textPrimary, fontWeight: 700 }}>
          <FaComments color={COLORS.teal} /> 멀티 에이전트 협상 로그
        </div>
        <button onClick={() => setOpen(false)} style={{
          background: 'none', border: 'none', color: COLORS.textDim, cursor: 'pointer', fontSize: 15,
        }}><FaTimes /></button>
      </div>

      {/* 대상 선박 선택 + 실행 (판정 진입점을 하나로) */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${COLORS.glassBorder}`, display: 'flex', gap: 8 }}>
        <select
          value={target?.port_call_id || ''}
          onChange={(e) => setSelectedVessel(vessels.find((v) => v.port_call_id === e.target.value))}
          style={{
            flex: 1, background: COLORS.card, color: COLORS.textPrimary,
            border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '7px 9px', fontSize: 12.5,
          }}
        >
          {vessels.map((v) => (
            <option key={v.port_call_id} value={v.port_call_id}>
              {v.vessel_name} · {v.cargo?.name} · {v.berth || v.anchorage || '미배정'}
            </option>
          ))}
        </select>
        <button onClick={run} disabled={loading || !target} style={{
          background: loading ? COLORS.card : `linear-gradient(135deg, ${COLORS.teal}, ${COLORS.tealDark})`,
          color: loading ? COLORS.textDim : '#04222b', border: 'none', borderRadius: 8,
          padding: '7px 14px', fontWeight: 800, fontSize: 12.5, cursor: loading ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
        }}>
          {loading ? <><FaSpinner className="spin" /> 판단 중</> : <><FaPlay /> 종합 판정</>}
        </button>
      </div>

      {/* 대화 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ color: COLORS.textDim, fontSize: 13, lineHeight: 1.8, textAlign: 'center', marginTop: 40 }}>
            선박을 고르고 <strong style={{ color: COLORS.teal }}>종합 판정</strong>을 누르면<br />
            기상 → 스케줄링 → 안전 에이전트가 차례로 판단하고<br />
            종합 오케스트레이터가 하역 적합성을 결정합니다.
          </div>
        )}
        {messages.map((m, i) => {
          const a = AGENTS[m.agent];
          const Icon = a.icon;
          return (
            <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <div style={{
                background: `${a.color}22`, color: a.color, borderRadius: '50%',
                width: 30, height: 30, display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0, fontSize: 13,
              }}><Icon /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 3 }}>
                  {a.name} · {m.time}
                </div>
                <div style={{
                  background: m.verdict ? `${VERDICT_COLOR[m.verdict] || COLORS.info}1f` : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${m.verdict ? (VERDICT_COLOR[m.verdict] || COLORS.info) : 'transparent'}`,
                  borderRadius: 10, padding: '9px 12px',
                  fontSize: 13, color: COLORS.textPrimary, lineHeight: 1.55,
                }}>
                  {m.verdict && (
                    <div style={{
                      fontWeight: 800, marginBottom: 4,
                      color: VERDICT_COLOR[m.verdict] || COLORS.info,
                    }}>
                      최종 판단: {m.verdictLabel || m.verdict}
                    </div>
                  )}
                  {m.text}
                  {m.detail?.length > 0 && (
                    <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 12, color: COLORS.textSecondary }}>
                      {m.detail.map((d, j) => <li key={j}>{d}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 관제사 승인 (Human-in-the-loop) */}
      {orchestration && (
        <div style={{
          padding: '10px 14px', borderTop: `1px solid ${COLORS.glassBorder}`,
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          {approved ? (
            <span style={{ color: COLORS.teal, fontSize: 12.5, fontWeight: 700 }}>
              ✓ 관제사(함현우) 승인 완료 — 하역 개시 지시됨
            </span>
          ) : (
            <>
              <span style={{ flex: 1, fontSize: 11.5, color: COLORS.textDim }}>
                최종 결정은 관제사가 합니다
              </span>
              <button onClick={() => setApproved(true)} style={{
                background: COLORS.teal, color: '#04222b', border: 'none', borderRadius: 8,
                padding: '7px 14px', fontWeight: 800, fontSize: 12.5, cursor: 'pointer',
              }}>승인</button>
              <button onClick={() => setApproved(false)} style={{
                background: 'transparent', color: COLORS.red, border: `1px solid ${COLORS.red}`,
                borderRadius: 8, padding: '7px 12px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
              }}>반려</button>
            </>
          )}
        </div>
      )}

      <style>{`
        .spin { animation: agentspin 1s linear infinite; }
        @keyframes agentspin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
