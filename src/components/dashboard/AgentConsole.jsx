import { useMemo, useRef, useState } from 'react';
import {
  FaCloudSun, FaRoute, FaShieldAlt, FaRobot, FaComments, FaTimes, FaPlay, FaSpinner,
  FaSearch, FaPaperPlane, FaBookOpen, FaUser,
} from 'react-icons/fa';
import useOnsanApi, { namesAnyCargo } from '../../hooks/useOnsanApi';
import useSensorStore from '../../stores/useSensorStore';
import useDashboardData from '../../hooks/useDashboardData';
import { COLORS, OPERATOR_NAME } from '../../utils/constants';
import { ONSAN_WEATHER_GROUP, findBerthIdByName } from '../../utils/geoUtils';

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
  weather: { name: '기상분석 에이전트', icon: FaCloudSun, color: '#1E6FA8' },
  scheduling: { name: '스케줄링 에이전트', icon: FaRoute, color: '#5B3E9B' },
  safety: { name: '안전관제 에이전트', icon: FaShieldAlt, color: '#B26A00' },
  orchestrator: { name: '종합 오케스트레이터', icon: FaRobot, color: COLORS.teal },
};

// 근거 신뢰도 — LLM이 아니라 근거 종류로 백엔드 코드가 산정한 값
const CONFIDENCE_LABEL = { high: '높음', medium: '보통', low: '낮음 (근거 부족)' };

const RISK_COLOR = (lv) => ({
  '안전': COLORS.teal, '주의': COLORS.yellow, '위험': COLORS.red, '배정불가': COLORS.red,
}[lv] || COLORS.textDim);

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
  //
  // 근거를 반드시 함께 싣는다. 예전엔 detail: [] 고정이라 "안전 판정: 위험" 한 줄로
  // 끝났다 — 기상·스케줄링 발화는 근거를 보여주는데 안전만 비어 있어서, 정작 이
  // 시스템의 핵심인 "왜 위험한가"를 협상 로그에서 확인할 수 없었다.
  if (orchestration.risk_level) {
    const detail = [
      ...(orchestration.safety_imdg || []),
      ...(orchestration.safety_conflicts || []),
      ...(orchestration.safety_reasoning ? [orchestration.safety_reasoning] : []),
      ...(orchestration.safety_hazards?.length
        ? [`주요 위험성: ${orchestration.safety_hazards.join(' · ')}`] : []),
    ];
    msgs.push({
      agent: 'safety', time: at(3),
      text: `안전 판정: ${orchestration.risk_level}`,
      detail: detail.length ? detail : ['인접·동시 작업 화물과 혼재금지·IMDG 격리 충돌 없음'],
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

// 관제사가 자주 묻는 질문 — 빈 화면 대신 바로 눌러볼 수 있게 둔다
const SUGGESTED = [
  '벤젠 취급 시 착용해야 할 보호구는?',
  '메탄올이 누출되면 어떻게 대처하나요?',
  '황산은 어떤 물질과 함께 두면 안 되나요?',
  '톨루엔 인화점이 몇 도인가요?',
];

export default function AgentConsole() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('negotiation'); // negotiation | qa
  const [loading, setLoading] = useState(false);
  // 관제사 최종 결정 — null(미결정) | 'APPROVED' | 'REJECTED'.
  //
  // 예전엔 boolean 이라 "반려" 버튼이 setApproved(false) 였는데, 그 버튼이 보이는
  // 조건 자체가 approved === false 여서 눌러도 아무 변화가 없었다(이미 false).
  // 결정은 세 상태다 — 아직 안 정함 / 승인 / 반려.
  const [decision, setDecision] = useState(null);
  const { orchestrate, assessBerthWeather, ragQuery } = useOnsanApi();

  // 질의응답 탭 상태
  const [question, setQuestion] = useState('');
  const [qaLog, setQaLog] = useState([]);
  const [qaLoading, setQaLoading] = useState(false);
  const qaEndRef = useRef(null);
  const orchestration = useSensorStore((s) => s.orchestration);
  const berthWeather = useSensorStore((s) => s.berthWeather);
  const selectedVessel = useSensorStore((s) => s.selectedVessel);
  const { data } = useDashboardData();

  // 이 콘솔 안에서만 쓰는 선택 상태. 전역 selectedVessel(지도/입항목록 클릭)을
  // setSelectedVessel로 되돌려 쓰지 않는다 — 그러면 VesselDetailPanel이 selectedVessel
  // 하나만 보고 뜨는 조건이라, 콘솔 드롭박스에서 선박만 골라도 그 큰 상세 패널이
  // 뒤에서 같이 열려버렸다(지도/목록 클릭 때와 똑같은 조건을 공유해서 생긴 부작용).
  const [localTarget, setLocalTarget] = useState(null);

  // 판정 대상: 실AIS + berth-cargo(실 신고 위험물) 조인 결과를 우선 쓰고,
  // DB에 재항 위험물 신고가 하나도 없을 때만(로컬 mock-server 등) 데모 시나리오로 대체한다.
  const realCargoVessels = useMemo(
    () => (data?.real_traffic ?? []).filter((v) => v.is_liquid_cargo_vessel && v.cargo),
    [data]
  );
  // 폴백 없음 — 실화물이 확인된 배만 판정 대상으로 둔다.
  // mock 데모 선박으로 대체하면 실제로 없는 배를 판정하게 된다.
  const vessels = realCargoVessels;
  // 우선순위: 콘솔에서 직접 고른 선박 > 지도/목록에서 클릭한 선박(전역) > 첫 번째 후보
  const target = localTarget && vessels.some((v) => v.port_call_id === localTarget.port_call_id)
    ? localTarget
    : selectedVessel && vessels.some((v) => v.port_call_id === selectedVessel.port_call_id)
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
    setDecision(null);   // 새로 판정하면 이전 결정은 무효다
    try {
      const berthId = findBerthIdByName(target.berth);
      const group = berthId ? ONSAN_WEATHER_GROUP[berthId] : null;
      if (group) await assessBerthWeather({ berthGroup: group });
      await orchestrate({
        cargoName: target.cargo?.name,
        casNo: target.cargo?.cas_no, // 실 신고 화물이면 CAS를 이미 알고 있음 — 데모 이름사전 우회
        dwt: null, // 실AIS 위치 데이터엔 DWT가 없음 — 미상으로 보내 오케스트레이터가 보수적으로 판단하게 함
        draught: target.draught_m ?? undefined,
        vesselName: target.vessel_name,
      });
    } finally {
      setLoading(false);
    }
  };

  const ask = async (text) => {
    const q = (text ?? question).trim();
    if (!q || qaLoading) return;
    setQuestion('');
    setQaLog((prev) => [...prev, { role: 'user', text: q }]);
    setQaLoading(true);
    try {
      // cargo_hint 는 질문이 물질을 스스로 지목하지 않을 때만 붙인다.
      // "이 선박 화물의 보호구는?" 처럼 화면 맥락에 기대는 질문에는 도움이 되지만,
      // "황산과 벤젠을 같이 둬도 되나?" 처럼 물질이 문장에 있는 질문에 선택 선박의
      // 화물을 끼워 넣으면 엉뚱한 물질로 해석될 수 있다.
      const mentionsChemical = /[가-힣A-Za-z]{2,}/.test(q) && namesAnyCargo(q);
      const res = await ragQuery({
        question: q,
        cargoHint: mentionsChemical ? null : target?.cargo?.name,
      });
      setQaLog((prev) => [...prev, { role: 'agent', ...res }]);
    } catch (err) {
      setQaLog((prev) => [...prev, {
        role: 'agent', answer: `조회 중 오류가 발생했습니다: ${err.message}`,
        citations: [], is_local_fallback: true,
      }]);
    } finally {
      setQaLoading(false);
      setTimeout(() => qaEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
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
          color: '#FFFFFF', border: 'none', fontWeight: 800, fontSize: 14,
          boxShadow: '0 6px 22px rgba(0,0,0,0.45)',
        }}
      >
        <FaComments /> 에이전트 협상 로그
        {orchestration && (
          <span style={{
            background: '#FFFFFF', color: COLORS.teal, borderRadius: 10,
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
          <FaComments color={COLORS.teal} /> 관제 에이전트 콘솔
        </div>
        <button onClick={() => setOpen(false)} style={{
          background: 'none', border: 'none', color: COLORS.textDim, cursor: 'pointer', fontSize: 15,
        }}><FaTimes /></button>
      </div>

      {/* 탭 — 협상 로그 / 질의응답 */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${COLORS.glassBorder}` }}>
        {[
          { key: 'negotiation', label: '협상 로그', icon: FaRobot },
          { key: 'qa', label: '질의응답', icon: FaSearch },
        ].map((t) => {
          const Icon = t.icon;
          const on = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '9px 0', cursor: 'pointer', background: 'none', border: 'none',
              borderBottom: `2px solid ${on ? COLORS.teal : 'transparent'}`,
              color: on ? COLORS.teal : COLORS.textDim, fontWeight: on ? 800 : 600, fontSize: 12.5,
            }}><Icon /> {t.label}</button>
          );
        })}
      </div>

      {tab === 'qa' ? (
        <QaPanel
          log={qaLog} loading={qaLoading} question={question}
          setQuestion={setQuestion} ask={ask} endRef={qaEndRef}
          cargoHint={target?.cargo?.name}
        />
      ) : (
      <>
      {/* 대상 선박 선택 + 실행 (판정 진입점을 하나로) */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${COLORS.glassBorder}`, display: 'flex', gap: 8 }}>
        <select
          value={target?.port_call_id || ''}
          onChange={(e) => setLocalTarget(vessels.find((v) => v.port_call_id === e.target.value))}
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
          color: loading ? COLORS.textDim : '#FFFFFF', border: 'none', borderRadius: 8,
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
          {decision ? (
            <>
              <span style={{
                flex: 1, fontSize: 12.5, fontWeight: 700,
                color: decision === 'APPROVED' ? COLORS.teal : COLORS.red,
              }}>
                {decision === 'APPROVED'
                  ? `✓ ${OPERATOR_NAME} 승인 — 하역 개시`
                  : `✕ ${OPERATOR_NAME} 반려 — 배정 취소`}
              </span>
              {/* 결정을 되돌릴 수 없으면 잘못 눌렀을 때 화면을 다시 열 수밖에 없다 */}
              <button onClick={() => setDecision(null)} style={{
                background: 'transparent', color: COLORS.textDim, border: `1px solid ${COLORS.border}`,
                borderRadius: 8, padding: '5px 10px', fontWeight: 700, fontSize: 11.5, cursor: 'pointer',
              }}>결정 취소</button>
            </>
          ) : (
            <>
              <span style={{ flex: 1, fontSize: 11.5, color: COLORS.textDim }}>
                최종 결정은 관제사가 합니다 (기록은 세션 내 보존)
              </span>
              <button onClick={() => setDecision('APPROVED')} style={{
                background: COLORS.teal, color: '#FFFFFF', border: 'none', borderRadius: 8,
                padding: '7px 14px', fontWeight: 800, fontSize: 12.5, cursor: 'pointer',
              }}>승인</button>
              <button onClick={() => setDecision('REJECTED')} style={{
                background: 'transparent', color: COLORS.red, border: `1px solid ${COLORS.red}`,
                borderRadius: 8, padding: '7px 12px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
              }}>반려</button>
            </>
          )}
        </div>
      )}
      </>
      )}

      <style>{`
        .spin { animation: agentspin 1s linear infinite; }
        @keyframes agentspin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// LLM 답변이 "1. **소제목**: 내용 2. **소제목**: ..." 처럼 줄바꿈 없이 번호매김만
// 있는 경우가 많아, 그대로 찍으면 별표가 글자 그대로 보이고 목록이 한 문단으로
// 뭉친다. 번호 항목 앞에 줄바꿈을 넣고 **굵게**만 최소 파싱해서 표시한다
// (전체 마크다운 라이브러리를 새로 추가하지 않고 이 정도만 처리).
function formatAnswer(text) {
  if (!text) return null;
  const withBreaks = text.replace(/(\d+)\.\s*(?=\*\*)/g, (match, _num, offset) => (offset === 0 ? match : `\n${match}`));
  return withBreaks.split('\n').map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    const parts = trimmed.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return (
      <div key={i} style={{ marginTop: i === 0 ? 0 : 6 }}>
        {parts.map((p, j) => (p.startsWith('**') && p.endsWith('**')
          ? <strong key={j}>{p.slice(2, -2)}</strong>
          : <span key={j}>{p}</span>))}
      </div>
    );
  });
}

// 근거 본문이 "[화학물질명 - 섹션명] 내용" 형태로 오는 경우가 있는데, 그 화학물질명·
// 섹션명은 이미 칩/헤더에 표시하므로 본문에서는 중복 제거한다.
function stripCitationPrefix(text) {
  return (text || '').replace(/^\[[^\]]*\]\s*/, '');
}

// KOSHA MSDS 원문은 "인체를 보호하기 위해 필요한 조치사항 및 보호구: ..." 같은 항목별
// 라벨이 개행 없이 항목마다 반복되며 그대로 이어붙어 온다(항목 하나하나가 원래는
// 별도 행이었는데 citation.text 하나로 합쳐져서 온 것으로 보임). 첫 콜론 앞부분을
// 라벨로 보고, 그 라벨이 2번 이상 반복되면 라벨 기준으로 다시 잘라 항목마다 줄을
// 나눈다 — 라벨이 없거나 한 번만 나오는 일반 문장은 손대지 않는다.
function splitRepeatedLabel(text) {
  const colonIdx = text.indexOf(':');
  if (colonIdx < 0 || colonIdx > 40) return [text];
  const label = text.slice(0, colonIdx + 1);
  const chunks = text.split(label).filter((c) => c.trim());
  if (chunks.length < 2) return [text];
  return chunks.map((c) => `${label}${c}`.trim());
}

// 확정값(score 없음 — 정형 컬럼·그래프 관계)이 벡터 발췌보다 신뢰도가 높으므로 항상
// 우선하고, 그다음 유사도 높은 순으로 정렬해 상위 limit개만 남긴다.
function pickTopCitations(citations, limit = 2) {
  const sorted = [...citations].sort((a, b) => {
    if (a.is_exact !== b.is_exact) return a.is_exact ? -1 : 1;
    return (b.score ?? 0) - (a.score ?? 0);
  });
  return { shown: sorted.slice(0, limit), hiddenCount: Math.max(0, sorted.length - limit) };
}

// 근거를 전부 나열하면 답변 아래에 카드가 줄줄이 쌓여 가독성이 떨어졌다 — 한 줄 칩만
// 보여주고, 눌렀을 때 원문을 어떻게 보여줄지는 호출부(onOpen)가 결정한다.
function CitationList({ citations, onOpen }) {
  const { shown, hiddenCount } = pickTopCitations(citations);
  return (
    <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {shown.map((c, j) => (
        <button key={j} onClick={() => onOpen(c)} style={{
          display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left', cursor: 'pointer',
          background: COLORS.card, border: `1px solid ${COLORS.border}`,
          borderLeft: `3px solid ${c.is_exact ? COLORS.teal : COLORS.info}`,
          borderRadius: 8, padding: '6px 10px', fontSize: 11.5, color: COLORS.textSecondary,
        }}>
          <FaBookOpen size={10} style={{ flexShrink: 0, color: c.is_exact ? COLORS.teal : COLORS.info }} />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <strong style={{ color: c.is_exact ? COLORS.teal : COLORS.info }}>{c.chem_name}</strong> · {c.section_name}
            {c.cas_no && ` (CAS ${c.cas_no})`}
          </span>
          {c.is_exact ? (
            <span style={{
              flexShrink: 0, padding: '1px 6px', borderRadius: 5, fontSize: 10,
              background: `${COLORS.teal}2e`, color: COLORS.teal, fontWeight: 700,
            }}>확정값</span>
          ) : (
            <span style={{ flexShrink: 0, color: COLORS.textDim }}>유사도 {c.score.toFixed(2)}</span>
          )}
        </button>
      ))}
      {hiddenCount > 0 && (
        <div style={{ fontSize: 10.5, color: COLORS.textDim }}>
          근거 {shown.length + hiddenCount}개 중 상위 {shown.length}개만 표시 (나머지 {hiddenCount}개 생략)
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 질의응답 패널 — 관제사가 규정·MSDS를 자연어로 묻는다.
//
// 답변은 반드시 근거(citation)와 함께 나온다. 백엔드 RAG(/rag/query)가 준비되면
// 그 결과를, 아직이면 MSDS 원문 섹션을 그대로 인용한다. 어느 쪽인지 화면에 표시해
// "무엇을 근거로 답했는지"를 관제사가 항상 알 수 있게 한다.
//
// 근거는 채팅 안에서 아코디언으로 펼치지 않는다 — 로그가 계속 쌓이는 채팅에서는
// 펼친 뒤 다시 접으려면 스크롤을 거슬러 올라가야 해서 번거롭다. 대신 한 줄 칩만
// 보여주고 클릭하면 콘솔 위에 오버레이로 띄운다 — 닫아도 채팅 스크롤 위치가 그대로다.
// ─────────────────────────────────────────────
function QaPanel({ log, loading, question, setQuestion, ask, endRef, cargoHint }) {
  const [activeCitation, setActiveCitation] = useState(null);
  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {log.length === 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ color: COLORS.textDim, fontSize: 13, lineHeight: 1.75, textAlign: 'center', marginBottom: 14 }}>
              화물 안전 규정을 물어보세요.<br />
              답변은 <strong style={{ color: COLORS.teal }}>MSDS 원문 근거</strong>와 함께 제공됩니다.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {SUGGESTED.map((s) => (
                <button key={s} onClick={() => ask(s)} style={{
                  textAlign: 'left', background: 'rgba(255,255,255,0.05)', cursor: 'pointer',
                  border: `1px solid ${COLORS.glassBorder}`, borderRadius: 9, padding: '9px 12px',
                  color: COLORS.textSecondary, fontSize: 12.5, lineHeight: 1.5,
                }}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {log.map((m, i) => m.role === 'user' ? (
          <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', flexDirection: 'row-reverse' }}>
            <div style={{
              background: `${COLORS.teal}22`, color: COLORS.teal, borderRadius: '50%',
              width: 30, height: 30, display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexShrink: 0, fontSize: 12,
            }}><FaUser /></div>
            <div style={{
              background: `${COLORS.teal}1a`, border: `1px solid ${COLORS.teal}44`,
              borderRadius: 10, padding: '9px 12px', fontSize: 13,
              color: COLORS.textPrimary, lineHeight: 1.55, maxWidth: '80%',
            }}>{m.text}</div>
          </div>
        ) : (
          <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
            <div style={{
              background: `${COLORS.teal}22`, color: COLORS.teal, borderRadius: '50%',
              width: 30, height: 30, display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexShrink: 0, fontSize: 13,
            }}><FaBookOpen /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '9px 12px',
                fontSize: 13, color: COLORS.textPrimary, lineHeight: 1.55,
              }}>
                {formatAnswer(m.answer)}
              </div>

              {/* 혼재 판정 결과 — 답변 문장이 아니라 이 등급이 결론이다 (규칙엔진 하한 보정본) */}
              {m.assessment && (
                <div style={{
                  marginTop: 7, padding: '8px 11px', borderRadius: 8,
                  background: `${RISK_COLOR(m.assessment.risk_level)}1a`,
                  border: `1px solid ${RISK_COLOR(m.assessment.risk_level)}66`,
                }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: RISK_COLOR(m.assessment.risk_level) }}>
                    판정: {m.assessment.risk_level}
                    <span style={{ fontSize: 10.5, fontWeight: 400, color: COLORS.textDim }}>
                      {' '}· 규칙엔진 하한 {m.assessment.rule_engine_floor} (LLM이 낮출 수 없음)
                    </span>
                  </div>
                  {m.assessment.reasoning && (
                    <div style={{ fontSize: 11.5, color: COLORS.textSecondary, marginTop: 3, lineHeight: 1.55 }}>
                      {m.assessment.reasoning}
                    </div>
                  )}
                </div>
              )}

              {/* DB 미등재 — "혼재금지 관계 없음(안전)"이 아니라 "판정 불가"다 */}
              {m.unresolved?.length > 0 && (
                <div style={{
                  marginTop: 7, padding: '8px 11px', borderRadius: 8, fontSize: 12,
                  background: `${COLORS.yellow}14`, border: `1px solid ${COLORS.yellow}55`,
                  color: COLORS.yellow, lineHeight: 1.6,
                }}>
                  ⚠ <strong>판정 불가</strong> — {m.unresolved.join(', ')}는 MSDS DB에 없습니다.
                  <div style={{ color: COLORS.textSecondary, fontSize: 11.5 }}>
                    “혼재금지 관계가 없다(안전)”는 뜻이 아닙니다. 관제사 확인이 필요합니다.
                  </div>
                </div>
              )}

              {m.citations?.length > 0 && (
                <CitationList citations={m.citations} onOpen={setActiveCitation} />
              )}

              <div style={{ fontSize: 10.5, color: COLORS.textDim, marginTop: 5 }}>
                {m.is_local_fallback
                  ? '※ 규칙 기반 인용 — MSDS 원문 섹션을 그대로 표시합니다 (벡터 검색 미연결)'
                  : `※ GraphRAG 근거 — MSDS 원문·지식그래프·정형값${
                      m.confidence ? ` · 신뢰도 ${CONFIDENCE_LABEL[m.confidence] || m.confidence}` : ''
                    }`}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', gap: 9, alignItems: 'center', color: COLORS.textDim, fontSize: 12.5 }}>
            <FaSpinner className="spin" /> MSDS 근거를 찾는 중…
            <span style={{ fontSize: 11 }}>(처음 조회하는 물질은 1~2분 걸릴 수 있습니다)</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div style={{
        padding: '10px 14px', borderTop: `1px solid ${COLORS.glassBorder}`,
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') ask(); }}
          placeholder={cargoHint ? `${cargoHint} 관련 질문…` : '화물 안전 규정을 물어보세요…'}
          style={{
            flex: 1, minWidth: 0, background: COLORS.card, color: COLORS.textPrimary,
            border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 12.5,
          }}
        />
        <button onClick={() => ask()} disabled={loading || !question.trim()} style={{
          background: loading || !question.trim() ? COLORS.card : `linear-gradient(135deg, ${COLORS.teal}, ${COLORS.tealDark})`,
          color: loading || !question.trim() ? COLORS.textDim : '#FFFFFF',
          border: 'none', borderRadius: 8, padding: '9px 13px', fontSize: 13,
          cursor: loading || !question.trim() ? 'default' : 'pointer',
        }}><FaPaperPlane /></button>
      </div>

      {/* 근거 원문 오버레이 — 채팅 스크롤과 분리되어 있어 닫아도 로그 위치가 안 흔들린다 */}
      {activeCitation && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          background: 'rgba(8,15,24,0.98)', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            padding: '11px 14px', borderBottom: `1px solid ${COLORS.glassBorder}`,
          }}>
            <div>
              <div style={{
                fontSize: 12.5, fontWeight: 800,
                color: activeCitation.is_exact ? COLORS.teal : COLORS.info,
              }}>
                {activeCitation.chem_name} · {activeCitation.section_name}
              </div>
              <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>
                {activeCitation.cas_no && `CAS ${activeCitation.cas_no} · `}
                {activeCitation.is_exact ? '확정값' : `유사도 ${activeCitation.score.toFixed(2)}`}
              </div>
            </div>
            <button onClick={() => setActiveCitation(null)} style={{
              background: 'none', border: 'none', color: COLORS.textDim, cursor: 'pointer', fontSize: 16, flexShrink: 0,
            }}><FaTimes /></button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.7 }}>
            {splitRepeatedLabel(stripCitationPrefix(activeCitation.text)).map((para, i) => (
              <p key={i} style={{ margin: i === 0 ? 0 : '10px 0 0' }}>{para}</p>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
