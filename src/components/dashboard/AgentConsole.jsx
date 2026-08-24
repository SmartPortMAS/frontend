import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  FaCloudSun, FaRoute, FaShieldAlt, FaRobot, FaComments, FaTimes, FaPlay, FaSpinner,
  FaSearch, FaPaperPlane, FaBookOpen, FaUser,
} from 'react-icons/fa';
import useOnsanApi, { namesAnyCargo } from '../../hooks/useOnsanApi';
import useSensorStore from '../../stores/useSensorStore';
import useDashboardData from '../../hooks/useDashboardData';
import { fetchPendingApprovals, postApprovalDecision } from '../../api/backendAdapter';
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

  // 1) 기상 — 오케스트레이터 결과 우선, 없으면 패널에서 본 판정 사용.
  // 상태·근거·선석 이름 셋 다 반드시 같은 출처에서 함께 가져온다. 예전엔
  // 상태·근거는 출처를 맞췄는데 선석 이름만 항상 vessel.berth(AIS 실측 "지금
  // 있는 자리")를 썼다 — 이 콘솔은 항상 탐색모드라(위 run() 참고) 오케스트레이터가
  // 그 자리와 무관하게 새로 top-3를 탐색해 다른 선석을 추천할 수 있는데, 그 경우
  // "SK5부두 기상 판정: 정상"처럼 실제로는 추천 선석(예: 현대오일터미널 신항1부두)의
  // 기상 판정인데 라벨만 배가 지금 있는 선석으로 잘못 찍혔다(실측 확인, 2026-08-19).
  const usingOrchestrationWeather = Boolean(orchestration.weather_grade);
  const wStatus = orchestration.weather_grade || berthWeather?.status;
  if (wStatus) {
    const obs = usingOrchestrationWeather ? null : berthWeather?.observed;
    const reasons = usingOrchestrationWeather ? orchestration.weather_reasons : berthWeather?.reasons;
    const wBerthName = usingOrchestrationWeather
      ? (orchestration.berth_assigned || '추천 선석')
      : (vessel?.berth || '대상 선석');
    msgs.push({
      agent: 'weather', time: at(9),
      text: `${wBerthName} 기상 판정: ${wStatus}` +
        (obs ? ` (실측 풍속 ${obs.wind ?? '-'} m/s · 파고 ${obs.wave ?? '-'} m)` : ''),
      detail: reasons || [],
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
    // [2026-08-23] 판정 근거를 먼저, 참고 정보는 맨 뒤에 접두사를 붙여 싣는다.
    // 예전엔 IMDG 격리코드가 목록 맨 위에 선석 이름과 붙어 나와, 부두 간 배치가
    // 규정을 위반한 것처럼 읽혔다(IMDG는 단일 선박 내 적부 기준이라 부두 간에는
    // 적용 대상이 아니다 — useOnsanApi.safety_imdg_reference 주석 참고).
    const detail = [
      ...(orchestration.safety_conflicts || []),
      ...(orchestration.safety_bulk || []),
      ...(orchestration.safety_unassessed || []),
      ...(orchestration.safety_reasoning ? [orchestration.safety_reasoning] : []),
      ...(orchestration.safety_hazards?.length
        ? [`주요 위험성: ${orchestration.safety_hazards.join(' · ')}`] : []),
      ...(orchestration.safety_imdg_reference || []).map(
        (t) => `[참고 · 판정 미반영] ${t} — 선내 적부 기준이라 부두 간 배치에는 적용되지 않습니다`
      ),
    ];
    msgs.push({
      agent: 'safety', time: at(3),
      text: `안전 판정: ${orchestration.risk_level}`,
      detail: detail.length ? detail : ['인접·동시 작업 화물과 혼재금지·IMDG 격리 충돌 없음'],
    });
  }

  // 3.5) 후보가 없어 안전 심사까지 가지 못한 경우.
  //
  // 안전 에이전트가 "왜 조용한지"를 화면이 말하지 않으면, 관제사에게는 세 에이전트
  // 협업이라는 구조 자체가 보이지 않는다("안전은 안 돌았나?"는 질문이 실제로 나왔다,
  // 2026-08-21). 안전 심사는 구체적 선석이 정해진 뒤에야 그 선석의 인접 화물로
  // 실행되므로, 생략된 이유를 안전 에이전트의 발화로 남긴다.
  if (!orchestration.risk_level && (trace.length || rejected.length)) {
    msgs.push({
      agent: 'safety', time: at(2),
      text: '안전 심사 생략 — 배정할 선석이 확보되지 않았습니다',
      detail: ['안전 심사는 선석이 정해진 뒤 그 선석의 인접 화물 기준으로 실행됩니다.'],
    });
  }

  // 4) 종합
  msgs.push({
    agent: 'orchestrator', time: at(1),
    text: orchestration.summary || `${orchestration.decision_label || orchestration.status}`,
    // assignment_changed는 검증모드(assigned_wharf_name 지정) 호출에서만 True가
    // 될 수 있다 — 이 콘솔은 항상 탐색모드로 부르므로(위 run() 참고) 여기서는
    // 항상 false다. 필드 자체는 다른 검증모드 호출자(anchorage_promoter 등)를
    // 위해 백엔드가 계속 채워 주므로 렌더링 분기는 그대로 둔다.
    detail: orchestration.assignment_changed
      ? [`⚠ 원래 위치가 아닌 대체 선석으로 배정되었습니다 (${orchestration.berth_assigned || '-'})`]
      : [],
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
  // 3D 관제 화면에서는 띄우지 않는다 — 전체화면 연출과 HUD 를 가린다
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('negotiation'); // negotiation | qa
  const [loading, setLoading] = useState(false);
  // 관제사 최종 결정 — null(미결정) | 'APPROVED' | 'REJECTED'.
  //
  // 예전엔 boolean 이라 "반려" 버튼이 setApproved(false) 였는데, 그 버튼이 보이는
  // 조건 자체가 approved === false 여서 눌러도 아무 변화가 없었다(이미 false).
  // 결정은 세 상태다 — 아직 안 정함 / 승인 / 반려.
  //
  // [2026-08-19] 이 값은 이제 실제 승인 API 호출 결과다. 예전엔 버튼을 누르면
  // 로컬 상태만 바뀌고 berth_assignment는 그대로 REQUESTED로 남아, 관제사가
  // 여기서 "승인"을 눌러도 /berth-assignments 화면에는 계속 승인 대기로 떠
  // 있었다(실사용 중 발견). 세 경로가 있다 — approvalId(arrival_watcher가 이미
  // 만들어 둔 REQUESTED 행)가 있으면 그 행을 승인/반려하고(/approvals/{id}/decision),
  // 없으면 승인은 commitAssignment로 판정과 확정을 한 번에 하고(/assess-and-commit),
  // 반려는 rejectAssignment로 그 자리에서 REJECTED 행만 남긴다(/orchestrator/reject).
  //
  // [2026-08-20] 반려 버튼이 approvalId가 있을 때만 보였던 게 실사용 중 문제로
  // 지적됐다 — "판정을 보고 승인할지 반려할지 정한다"는 이 콘솔의 목적상
  // REQUESTED 행의 유무는 반려 가능 여부와 무관해야 한다. 이제 반려도 즉석
  // 경로가 있어 항상 두 버튼을 같이 보여준다.
  const [decision, setDecision] = useState(null);
  const [approvalId, setApprovalId] = useState(null);
  const [approvalChecked, setApprovalChecked] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState(null);
  // 조회 전용(공개 배포본) 때문에 막힌 것인지 — 문구 색을 가르는 근거
  const [decisionReadOnly, setDecisionReadOnly] = useState(false);
  const { orchestrate, commitAssignment, rejectAssignment, assessBerthWeather, ragQuery } = useOnsanApi();
  const setOrchestration = useSensorStore((s) => s.setOrchestration);
  const setBerthWeather = useSensorStore((s) => s.setBerthWeather);

  // 질의응답 탭 상태
  const [question, setQuestion] = useState('');
  const [qaLog, setQaLog] = useState([]);
  const [qaLoading, setQaLoading] = useState(false);
  const qaEndRef = useRef(null);
  const orchestration = useSensorStore((s) => s.orchestration);
  const berthWeather = useSensorStore((s) => s.berthWeather);
  const selectedVessel = useSensorStore((s) => s.selectedVessel);
  const { data } = useDashboardData();
  // VesselDetailPanel(선박 목록/지도 클릭 시 뜨는 우측 상세 패널, width 390px)도
  // 이 콘솔처럼 항상 화면 오른쪽에 고정이라, 배를 하나 고르면 그 패널이 이 콘솔의
  // 플로팅 버튼 위에 그대로 겹쳐 떴다(실사용 중 발견, 2026-08-20). 왼쪽으로
  // 비키는 대신 — 콘솔이 접혀 있을 때(!open)는 상세 패널이 열려 있는 동안 버튼
  // 자체를 숨긴다. 이미 펼쳐서 보던 중이면(open) 유지한다 — 관제사가 협상 로그를
  // 보면서 배 상세도 같이 보고 싶을 수 있어, 그건 강제로 닫지 않는다.
  const hideFloatingButton = !open && Boolean(selectedVessel);

  // 이 콘솔 안에서만 쓰는 선택 상태. 전역 selectedVessel(지도/입항목록 클릭)을
  // setSelectedVessel로 되돌려 쓰지 않는다 — 그러면 VesselDetailPanel이 selectedVessel
  // 하나만 보고 뜨는 조건이라, 콘솔 드롭박스에서 선박만 골라도 그 큰 상세 패널이
  // 뒤에서 같이 열려버렸다(지도/목록 클릭 때와 똑같은 조건을 공유해서 생긴 부작용).
  const [localTarget, setLocalTarget] = useState(null);
  const consoleRequest = useSensorStore((st) => st.consoleRequest);
  const clearConsoleRequest = useSensorStore((st) => st.clearConsoleRequest);

  // 판정 대상: 실AIS + berth-cargo(실 신고 위험물) 조인 결과를 우선 쓰고,
  // DB에 재항 위험물 신고가 하나도 없을 때만(로컬 mock-server 등) 데모 시나리오로 대체한다.
  const realCargoVessels = useMemo(
    // 실신고 화물 + 선종 추정 화물(assumed_cargo) 모두 판정 대상 —
    // "모든 액체화물선을 판정한다"(2026-08-21). 추정은 목록·결과에 표식.
    () => (data?.real_traffic ?? []).filter((v) => v.is_liquid_cargo_vessel && (v.cargo || v.assumed_cargo)),
    [data]
  );
  // 폴백 없음 — 실화물이 확인된 배만 판정 대상으로 둔다.
  // mock 데모 선박으로 대체하면 실제로 없는 배를 판정하게 된다.
  const vessels = realCargoVessels;
  // 승인 대기 건이 지목한 배가 화면 목록에 없을 수 있다(AIS 신호 끊김 —
  // 어댑터 offscreenJudgeable 주석 참고). 그 배만 예외로 찾아 쓴다.
  const offscreen = data?.offscreen_judgeable ?? [];
  // 우선순위: 콘솔에서 직접 고른 선박 > 지도/목록에서 클릭한 선박(전역) > 첫 번째 후보
  // localTarget 이 화면 목록에 없어도(신호 끊긴 승인 대기 배) 유효한 대상으로 둔다 —
  // 예전엔 목록 멤버십을 요구해서, 그런 배를 지목하면 조용히 첫 배로 되돌아갔다.
  const target = localTarget
    ? localTarget
    : selectedVessel && vessels.some((v) => v.port_call_id === selectedVessel.port_call_id)
      ? selectedVessel
      : vessels[0];

  // 배정현황의 "협상 로그 →" 클릭을 받는다 — 그 배를 대상으로 콘솔을 연다.
  // 실제 판정 대상 목록(vessels)에서 호출부호로 찾은 실선박만 지정한다.
  // 목록에 없으면(화물·선종 모두 미확인) 대상 지정 없이 열기만 한다 —
  // 가짜 항목을 만들어 채우지 않는다.
  useEffect(() => {
    if (!consoleRequest) return;
    const want = (consoleRequest.callsgn || '').trim().toUpperCase();
    const match = (v) => v.callsgn && v.callsgn.trim().toUpperCase() === want;
    // 화면 목록 우선, 없으면 신호 끊긴 판정 대상에서 찾는다.
    const hit = vessels.find(match) || offscreen.find(match);
    if (hit) setLocalTarget(hit);
    setTab('negotiation');
    setOpen(true);
    clearConsoleRequest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consoleRequest, vessels]);

  // [2026-08-23] 대상 선박이 바뀌면 이전 배의 판정 로그를 비운다.
  // 드롭다운에서 다른 배를 고르면 화면의 배 이름만 바뀌고 아래 판정 내용은
  // 이전 배 것이 그대로 남아 있었다 — 판정을 다시 누르기 전까지 둘이 섞여 보인다.
  const shownTargetId = useRef(null);
  useEffect(() => {
    const id = target?.port_call_id ?? null;
    if (shownTargetId.current !== null && shownTargetId.current !== id) {
      setOrchestration(null);
      setBerthWeather(null);
      setDecision(null);
      setApprovalId(null);
      setApprovalChecked(false);
      setDecisionError(null);
    }
    shownTargetId.current = id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.port_call_id]);

  const messages = useMemo(
    () => toMessages({ orchestration, berthWeather, vessel: target }),
    [orchestration, berthWeather, target]
  );

  // 한 번의 실행으로 기상 → 스케줄링 → 안전 → 종합을 순차 수행.
  //
  // 항상 탐색모드로 호출한다(assignedWharfName 안 넘김) — 예전엔 target.berth
  // (실데이터 기준 지금 있는 자리)가 있으면 검증모드로 보내 그 선석 하나만
  // 확인했지만, 그러면 trace가 "전용 선석 OOO 사용 가능" 한 줄뿐이라 왜 다른
  // 후보보다 이 선석이 나은지 비교 근거가 안 나온다(2026-08-19 지적). 이
  // 콘솔은 "지금 이 화물이면 시스템이 top-3 중 뭘 고르는가"를 보여주는 게
  // 목적이라 항상 탐색모드가 맞다 — 검증모드 자체는 여전히 유효한 기능이고
  // anchorage_promoter.py(§5.4, "방금 빈 슬롯이 이 배에 안전한가"만 확인)가
  // 계속 쓴다.
  const run = async () => {
    if (!target) return;
    setLoading(true);
    setDecision(null);   // 새로 판정하면 이전 결정은 무효다
    setApprovalId(null);
    setApprovalChecked(false);
    setDecisionError(null);
    // [2026-08-23] 이전 판정 로그도 함께 비운다.
    //
    // 예전엔 decision/approvalId만 지우고 orchestration·berthWeather는 그대로
    // 뒀다. messages는 orchestration에서 만들어지므로, 판정이 도는 5~8초 동안
    // **직전 결과가 그대로 떠 있었다**. 게다가 toMessages는 vessel로 지금 선택된
    // 배를 받으므로, 배를 바꾸고 판정을 누르면 "새 배 이름 + 이전 배의 판정"이
    // 섞여 보였다 — 관제사가 그걸 새 결과로 읽으면 잘못된 배에 승인을 누른다.
    setOrchestration(null);
    setBerthWeather(null);
    try {
      const berthId = findBerthIdByName(target.berth);
      const group = berthId ? ONSAN_WEATHER_GROUP[berthId] : null;
      if (group) await assessBerthWeather({ berthGroup: group });
      await orchestrate({
        cargoName: (target.cargo ?? target.assumed_cargo)?.name,
        casNo: (target.cargo ?? target.assumed_cargo)?.cas_no, // 실신고 우선, 없으면 선종 추정
        dwt: null, // 실AIS 위치 데이터엔 DWT가 없음 — 미상으로 보내 오케스트레이터가 보수적으로 판단하게 함
        draught: target.draught_m ?? undefined,
        vesselName: target.vessel_name,
        // 이 배가 이미 받아 둔 추천을 자기 점유로 세지 않도록 호출부호를 넘긴다
        callSign: target.callsgn,
      });
      // 이 콘솔의 orchestrate()는 매번 새로 계산하는 상태없는 판단이라 배정 id를
      // 돌려주지 않는다 — arrival_watcher(10분 주기 배경 잡)가 같은 배로 이미
      // REQUESTED 행을 만들어 뒀는지 먼저 찾는다. 있으면 그 행을 승인하고, 없으면
      // decide()가 commitAssignment로 판정과 확정을 한 번에 한다(아직 그 잡이
      // 이 배를 처리하기 전이라는 뜻이지, 승인이 불가능하다는 뜻이 아니다).
      try {
        const pending = await fetchPendingApprovals();
        const match = pending.find((p) => p.kind === '선석배정' && p.call_sign === target.callsgn);
        setApprovalId(match ? match.id : null);
      } catch {
        setApprovalId(null);
      } finally {
        setApprovalChecked(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const decide = async (verdict) => {
    if (decisionBusy || !target) return;
    setDecisionBusy(true);
    setDecisionError(null);
    setDecisionReadOnly(false);
    try {
      if (approvalId) {
        // arrival_watcher가 이미 만들어 둔 REQUESTED 행이 있다 — 그 행을 승인/반려한다.
        await postApprovalDecision(approvalId, { verdict, approvedBy: OPERATOR_NAME });
        setDecision(verdict === 'APPROVE' ? 'APPROVED' : 'REJECTED');
        return;
      }
      if (verdict === 'REJECT') {
        // REQUESTED 행이 없어도 반려는 그 자리에서 기록한다(§5.3) — REQUESTED
        // 행의 유무는 "이 판정을 승인할지 반려할지"라는 관제사의 판단과
        // 무관하다(2026-08-20). berth_id 없는 REJECTED 행만 남기므로 자원을
        // 점유한 적 없는 반려이고, 다음 arrival_watcher 주기에 이 배는 다시
        // 후보로 잡힌다(영구 배제 아님).
        const { assignmentId } = await rejectAssignment({
          vesselName: target.vessel_name,
          callSign: target.callsgn,
          chemId: (target.cargo ?? target.assumed_cargo)?.chem_id,
          rejectedBy: OPERATOR_NAME,
          reason: orchestration?.summary,
        });
        setApprovalId(assignmentId);
        setDecision('REJECTED');
        return;
      }
      // 승인만 판정과 확정을 한 번에 한다.
      // 판정에 쓴 화물과 확정에 쓰는 화물이 같아야 한다.
      //
      // 종합 판정은 실신고 화물이 없으면 선종 추정 화물(assumed_cargo)로 판단하는데,
      // 확정은 target.cargo 만 보고 있었다. 그래서 선종 추정 선박은 '승인가능'
      // 판정을 받고 승인 버튼까지 떠 놓고, 누르면 "화물 'undefined' 식별 불가"로
      // 실패했다 — 판정과 확정이 서로 다른 입력을 본 것이다(2026-08-24 실측:
      // 판정 대상 60척 중 선종 추정이 다수라 시연 흐름이 통째로 막혔다).
      const commitCargo = target.cargo ?? target.assumed_cargo;
      const outcome = await commitAssignment({
        cargoName: commitCargo?.name,
        chemId: commitCargo?.chem_id,
        casNo: commitCargo?.cas_no,
        dwt: null,
        draught: target.draught_m ?? undefined,
        vesselName: target.vessel_name,
        callSign: target.callsgn,
        approvedBy: OPERATOR_NAME,
      });
      // 판정과 확정 사이에 상황이 바뀌었을 수 있다(다른 배가 먼저 그 슬롯을
      // 가져감 등) — 콘솔에 보이던 판단을 재검증 결과로 갱신해 화면과 실제
      // 확정 내용이 어긋나지 않게 한다.
      setOrchestration(outcome.orchestration);
      if (outcome.committed) {
        setApprovalId(outcome.assignmentId);
        setDecision('APPROVED');
      } else {
        setDecisionError(outcome.notCommittedReason || '확정할 수 없는 판정입니다.');
      }
    } catch (e) {
      setDecisionError(e.message);
      setDecisionReadOnly(Boolean(e.readOnly));
    } finally {
      setDecisionBusy(false);
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

  if (pathname.startsWith('/twin')) return null;

  if (!open) {
    if (hideFloatingButton) return null;
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
      // 라이트 통일 — 어두운 바탕은 라이트 팔레트 글자색과 만나 글자가 안 보였다
      background: COLORS.panel, border: `1px solid ${COLORS.border}`,
      borderRadius: 14, boxShadow: '0 10px 40px rgba(18,53,79,0.22)', overflow: 'hidden',
    }}>
      {/* 헤더 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '11px 14px', borderBottom: `1px solid ${COLORS.glassBorder}`,
        background: COLORS.cardHover,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: COLORS.textPrimary, fontWeight: 700 }}>
          <FaComments color={COLORS.teal} /> 에이전트 협상 로그
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
            flex: 1, minWidth: 0, background: COLORS.card, color: COLORS.textPrimary,
            border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '7px 9px', fontSize: 12.5,
          }}
        >
          {target && !vessels.some((v) => v.port_call_id === target.port_call_id) && (
            /* 신호가 끊겨 목록에 없는 배를 승인 대기에서 지목한 경우 —
               선택된 사실이 보이도록 이 항목만 임시로 띄운다 */
            <option key={target.port_call_id} value={target.port_call_id}>
              {target.vessel_name} · {(target.cargo ?? target.assumed_cargo)?.name} (AIS 신호 없음)
            </option>
          )}
          {vessels.map((v) => (
            <option key={v.port_call_id} value={v.port_call_id}>
              {/* 부두 이름은 안 보여준다 — 이 콘솔은 항상 탐색모드로 새로 추천받는다(위
                  run() 참고). 지금 있는 자리를 먼저 보여주면 "이미 정해진 자리를
                  확인하는 화면"처럼 보여 탐색모드로 바꾼 의도와 어긋난다. */}
              {v.vessel_name} · {v.cargo?.name ?? `${v.assumed_cargo?.name} (선종 추정)`}
            </option>
          ))}
        </select>
        <button onClick={run} disabled={loading || !target} style={{
          background: loading ? COLORS.card : `linear-gradient(135deg, ${COLORS.teal}, ${COLORS.tealDark})`,
          color: loading ? COLORS.textDim : '#FFFFFF', border: 'none', borderRadius: 8,
          padding: '7px 14px', fontWeight: 800, fontSize: 12.5, cursor: loading ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0,
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
                  background: m.verdict ? `${VERDICT_COLOR[m.verdict] || COLORS.info}1f` : COLORS.cardHover,
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
                  {/* 근거가 길면 접는다 — 스케줄링 trace 는 후보·대체 탐색이 전부 실려
                      십수 줄이 되는데, 관제사가 매번 읽을 글이 아니다(정보 과부하 피드백,
                      2026-08-21). 첫 2건으로 결론의 근거를 보이고 나머지는 펼침으로. */}
                  {m.detail?.length > 0 && (m.detail.length <= 3 ? (
                    <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 12, color: COLORS.textSecondary }}>
                      {m.detail.map((d, j) => <li key={j}>{d}</li>)}
                    </ul>
                  ) : (
                    <>
                      <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 12, color: COLORS.textSecondary }}>
                        {m.detail.slice(0, 2).map((d, j) => <li key={j}>{d}</li>)}
                      </ul>
                      <details style={{ marginTop: 3 }}>
                        <summary style={{ cursor: 'pointer', fontSize: 11.5, color: COLORS.info, fontWeight: 600 }}>
                          판단 과정 {m.detail.length - 2}건 더 보기
                        </summary>
                        <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 12, color: COLORS.textSecondary }}>
                          {m.detail.slice(2).map((d, j) => <li key={j}>{d}</li>)}
                        </ul>
                      </details>
                    </>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 관제사 승인 (Human-in-the-loop) — 실제 배정을 만드는 유일한 지점(§5.3).
          /berth-assignments 페이지는 읽기전용으로 뺐다 — 승인 액션은 여기 하나뿐이다.
          판정이 '승인가능'일 때만 보여준다 — 정박지대기/배정불가는 승인할 대상이
          없다(위 협상 로그에 이미 그 사유가 나와 있다). */}
      {orchestration && orchestration.status === 'APPROVED' && (
        <div style={{
          padding: '10px 14px', borderTop: `1px solid ${COLORS.glassBorder}`,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
                {/* "닫기"는 배너가 아니라 콘솔 전체를 닫는다(2026-08-20 — 배너만 닫히고
                    콘솔은 열려 있는 게 오히려 헷갈린다는 지적). 백엔드 결정을 되돌리는
                    게 아니다 — 되돌리려면(반려 취소 등) 새 배로 다시 판정을 돌려야 한다. */}
                <button onClick={() => setOpen(false)} style={{
                  background: 'transparent', color: COLORS.textDim, border: `1px solid ${COLORS.border}`,
                  borderRadius: 8, padding: '5px 10px', fontWeight: 700, fontSize: 11.5, cursor: 'pointer',
                }}>닫기</button>
              </>
            ) : !approvalChecked ? (
              <span style={{ flex: 1, fontSize: 11.5, color: COLORS.textDim }}>
                승인 대상 확인 중…
              </span>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: 11.5, color: COLORS.textDim }}>
                  {approvalId
                    ? '자동추천 대기열에 있는 건입니다 — 최종 결정은 관제사가 합니다'
                    : '승인 시 선석이 배정 됩니다.'}
                </span>
                <button onClick={() => decide('APPROVE')} disabled={decisionBusy} style={{
                  background: COLORS.teal, color: '#FFFFFF', border: 'none', borderRadius: 8,
                  padding: '7px 14px', fontWeight: 800, fontSize: 12.5,
                  cursor: decisionBusy ? 'wait' : 'pointer', opacity: decisionBusy ? 0.6 : 1,
                }}>승인</button>
                <button onClick={() => decide('REJECT')} disabled={decisionBusy} style={{
                  background: 'transparent', color: COLORS.red, border: `1px solid ${COLORS.red}`,
                  borderRadius: 8, padding: '7px 12px', fontWeight: 700, fontSize: 12.5,
                  cursor: decisionBusy ? 'wait' : 'pointer', opacity: decisionBusy ? 0.6 : 1,
                }}>반려</button>
              </>
            )}
          </div>
          {decisionError && (
            /* 조회 전용 배포본에서 누른 것은 고장이 아니다 — 빨간 "처리 실패"로
               그리면 심사자가 오류로 읽는다. 안내와 실패를 색으로 구분한다.
               (판정 결과 자체는 실제 서버가 낸 것이라 그대로 남는다) */
            <span style={{
              fontSize: 11,
              color: decisionReadOnly ? COLORS.textDim : COLORS.red,
            }}>
              {decisionReadOnly ? decisionError : `처리 실패: ${decisionError}`}
            </span>
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
                  textAlign: 'left', background: COLORS.cardHover, cursor: 'pointer',
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
                background: COLORS.cardHover, borderRadius: 10, padding: '9px 12px',
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
                      {/* [2026-08-23] "(LLM이 낮출 수 없음)"을 뺐다 — 이제 LLM은
                          등급을 낮추지도 올리지도 않는다. 규칙엔진 값이 그대로
                          최종 등급이고(risk_level == rule_engine_floor), LLM은
                          근거 서술만 만든다. */}
                      {' '}· 규칙엔진 확정
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
                  {/* [2026-08-23] "MSDS DB에 없습니다"는 관제사에게 시스템 용어다.
                      무엇이 문제이고 무엇을 확인하면 되는지로 바꿨다. */}
                  ⚠ <strong>판정하지 못했습니다</strong> — {m.unresolved.join(', ')}은(는)
                  {' '}울산항 화물 목록에 없습니다.
                  <div style={{ color: COLORS.textSecondary, fontSize: 11.5 }}>
                    “위험이 없다”는 뜻이 아니라 <strong>확인 자체를 못 했다</strong>는 뜻입니다.
                    화물명 표기를 다시 확인하시고, 맞다면 관제사가 직접 판단해 주세요.
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
          // 어두운 배경 잔재 — 콘솔을 라이트로 전환할 때(2026-08-21) 이 오버레이만
          // 남아, 어두운 바탕 위에 라이트 팔레트 잉크색 글자가 얹혀 읽을 수 없었다
          // (2026-08-22 실발견, /safety 인용 원문). 표면 규칙은 하나여야 한다.
          background: COLORS.panel, display: 'flex', flexDirection: 'column',
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
