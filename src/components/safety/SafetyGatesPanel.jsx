import { useEffect, useRef, useState } from 'react';
import useOnsanApi, { useChemicalList } from '../../hooks/useOnsanApi';
import useDashboardData from '../../hooks/useDashboardData';
import useSensorStore from '../../stores/useSensorStore';
import { COLORS } from '../../utils/constants';
import { ONSAN_BERTHS, onsanAdjacentBerthNames } from '../../utils/geoUtils';
import ReasoningGraph from './ReasoningGraph';
import { FaShieldAlt, FaCheckCircle, FaTimesCircle, FaQuestionCircle } from 'react-icons/fa';

// risk_level 4등급 (결정론: 같은 입력 = 같은 등급)
const RISK_STYLE = {
  '안전': { color: COLORS.teal },
  '주의': { color: COLORS.yellow },
  '위험': { color: '#D2601A' },
  '배정불가': { color: COLORS.red },
};

// 선석 목록은 ONSAN_BERTHS(지도·인접판정과 같은 정본) 하나만 쓴다.
//
// 예전엔 여기 14개가 따로 박혀 있었고 그 안에 'S-Oil 부이'·'오일허브 부이'가
// 있었다. 두 부이는 공공데이터에 좌표가 없어 ONSAN_BERTHS 에 없는 선석이라,
// 폼에서 고를 수는 있는데 지도에도 없고 onsanAdjacentBerthNames() 가 항상 빈
// 배열을 돌려줘 인접 혼재 판정이 통째로 빠졌다 — 고를수록 판정이 허술해지는
// 선택지였다.
const BERTHS = Object.values(ONSAN_BERTHS).map((b) => b.name);

export default function SafetyGatesPanel() {
  const { assessSafetyVerdict, assessSafetyGates } = useOnsanApi();
  // 이 패널의 판정 결과는 DashboardPage "최근 안전 심사" KPI가 참조하므로
  // 여기서만 전역 스토어(gateAssessment)에 반영한다 — 다른 화면에서 선박을
  // 클릭할 때 자동으로 도는 useVesselSafety는 이 스토어를 건드리지 않는다.
  const result = useSensorStore((s) => s.gateAssessment);
  const setGateAssessment = useSensorStore((s) => s.setGateAssessment);

  // 지식그래프 등재 화물 전체(현재 36종) — 하드코딩 목록 대신 DB/그래프에서 직접 불러온다.
  const chemicals = useChemicalList();

  // [입력 항목이 왜 이것뿐인가]
  // 예전 폼에는 DWT·GT·흘수·전장·작업시각·SIRE·CDI 입력이 있었다 — 온산 MVP 로컬
  // 프로토타입의 15개 게이트(R1~R15)용 입력이었는데, 정식 백엔드(설계문서 v1)로
  // 넘어오면서 안전 에이전트의 입력 계약은 "대상 화물 + 인접 선석 화물"로 확정됐다
  // (혼재금지 MSDS + IMDG 격리표 + 포장등급, POST /safety/assess).
  // 그 뒤로도 입력창들은 남아 있었지만 값이 요청에 실리지 않았다 — 숫자를 바꿔도
  // 판정이 같은, 사실상 관제사를 속이는 UI라 걷어냈다. 흘수·DWT는 스케줄링/종합
  // 판정(협상 콘솔)이 실제로 사용한다.
  const [form, setForm] = useState({
    cargo_chem_id: '', berth_name: 'OTK 1부두',
    adjacent_berth: '', adjacent_chem_id: '', // 인접 선석 동시작업 (ADJACENT_TO 기반)
  });
  // 목록이 로드되면 첫 화물을 기본 선택값으로 채운다 (로딩 전엔 빈 값)
  useEffect(() => {
    if (chemicals.length && !form.cargo_chem_id) {
      setForm((f) => ({ ...f, cargo_chem_id: chemicals[0].chem_id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chemicals]);
  const [showAllGates, setShowAllGates] = useState(false);

  // ── 재항 선박에서 불러오기 ────────────────────────────────────────────────
  // 지금까지는 화물·선석을 사람이 골라 넣어야 했다. 실제 관제는 "지금 저 배가
  // 붙어도 되나"를 묻는 일이므로, 실제로 재항 중인 배를 고르면 그 배의 화물과
  // 선석이 폼에 그대로 들어오게 한다.
  //
  // [이 목록의 기준 — mart.berth_current_cargo]
  //   ① upa_port_call 에서 departure_at_utc IS NULL  = 아직 출항 신고가 없는 배
  //      (전체 32,656건 중 3,534건이 재항 상태)
  //   ② 그중 위험물 신고가 있는 건만 (cargo_msds ⋈ dg_un_no IS NOT NULL)
  //   → 실측 581행 / 선박 179척 / 선석 28곳 (2026-08-15)
  //
  // 입출항 기록·선박·선석은 PORT-MIS 실수집이다. 다만 "어느 배가 무엇을 실었나"의
  // 화물 배정은 합성이다 — 화물 신고 원문은 공공데이터로 열리지 않아, PORT-MIS
  // 실선종(석유제품운반선·케미칼운반선 등)에 맞는 화물을 규칙으로 배정했다
  // (cargo_basis = 'PORT-MIS 실선종 기반', 581행 전량 is_synthetic).
  // 그래서 아래 select 에 "화물 배정은 합성"이라고 적어 둔다.
  const { data: dash } = useDashboardData();
  const berthedVessels = (dash?.berth_cargo ?? [])
    .filter((r) => r.callsgn && r.facility_name)
    .slice(0, 60);
  const berthedTotal = (dash?.berth_cargo ?? []).filter((r) => r.callsgn && r.facility_name).length;

  /** 재항 화물 1건(berth_current_cargo 행)을 폼에 옮긴다 */
  const applyBerthedRow = (row) => {
    if (!row) return;
    // 인접 선석에 실제로 있는 화물을 같이 채운다 — 혼재 판정의 상대편이다.
    const adjNames = onsanAdjacentBerthNames(row.facility_name);
    const adjRow = (dash?.berth_cargo ?? []).find(
      (r) => adjNames.includes(r.facility_name) && r.chem_id && r.callsgn !== row.callsgn
    );
    setForm((f) => ({
      ...f,
      // chem_id 가 없는 행(위험물인데 물질 미확인)은 화물을 바꾸지 않는다 —
      // 임의의 물질로 채우면 없는 위험을 지어내는 셈이다.
      cargo_chem_id: row.chem_id || f.cargo_chem_id,
      berth_name: row.facility_name,
      adjacent_berth: adjRow?.facility_name || '',
      adjacent_chem_id: adjRow?.chem_id || '',
    }));
  };

  const loadFromBerthed = (idx) => applyBerthedRow(berthedVessels[Number(idx)]);

  // ── 경고에서 넘어온 선석 자동 채움 ────────────────────────────────────────
  // 오른쪽 "현재 위험 선석" 카드나 헤더 경고 벨에서 선석을 누르면 여기로 온다.
  // 경고를 본 사람이 다음에 하려는 일은 "그 선석을 심사한다"이므로, 화면을 옮겨
  // 선석을 손으로 다시 고르게 하지 않는다.
  const prefill = useSensorStore((s) => s.safetyPrefill);
  const rootRef = useRef(null);
  const [flash, setFlash] = useState(false);
  const [prefillNote, setPrefillNote] = useState(null);

  useEffect(() => {
    if (!prefill?.berth_name) return undefined;
    const rows = dash?.berth_cargo ?? [];
    const atBerth = rows.filter((r) => r.facility_name === prefill.berth_name);
    const [flaggedA, flaggedB] = prefill.chem_ids ?? [];

    // 경고가 지목한 두 물질이 있으면 그대로 재현한다. 없으면(흘수 경고 등)
    // 그 선석의 화물 중 판정 가능한 첫 건으로 채운다.
    if (flaggedA) {
      const nameOf = (id) => atBerth.find((r) => r.chem_id === id)?.cargo_name || id;
      setForm((f) => ({
        ...f,
        cargo_chem_id: flaggedA,
        berth_name: prefill.berth_name,
        // 혼재 경고는 '같은 선석에 함께 있는' 두 화물 이야기다. 판정 엔진은 물질끼리
        // 비교하므로 상대 물질을 같은 선석 이름으로 넘겨 경고와 같은 결론을 낸다.
        adjacent_berth: flaggedB ? prefill.berth_name : '',
        adjacent_chem_id: flaggedB || '',
      }));
      setPrefillNote(flaggedB
        ? `경고에서 넘어옴 — ${prefill.berth_name}: ${nameOf(flaggedA)} ↔ ${nameOf(flaggedB)} 조합을 그대로 채웠습니다.`
        : `경고에서 넘어옴 — ${prefill.berth_name}: ${nameOf(flaggedA)} 로 채웠습니다.`);
    } else if (atBerth.length) {
      // 화물까지 확인된 행을 먼저 쓴다(chem_id 가 있어야 MSDS 판정이 된다).
      const row = atBerth.find((r) => r.chem_id) || atBerth[0];
      applyBerthedRow(row);
      setPrefillNote(row.chem_id
        ? `경고에서 넘어옴 — ${prefill.berth_name} 재항 화물 '${row.cargo_name || row.chem_id}' 로 채웠습니다.`
        : `${prefill.berth_name} 재항 화물이 물질 미확인(chem_id 없음)이라 화물은 그대로 두었습니다 — 직접 고르세요.`);
    } else {
      // 흘수 경고처럼 화물 신고가 없는 선석도 있다. 선석만 옮기고 사실대로 알린다.
      setForm((f) => ({ ...f, berth_name: prefill.berth_name }));
      setPrefillNote(`${prefill.berth_name} 에 신고된 재항 화물이 없습니다 — 선석만 선택했습니다.`);
    }

    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const selectedCargo = chemicals.find((c) => c.chem_id === form.cargo_chem_id);
  const adjacentCargo = chemicals.find((c) => c.chem_id === form.adjacent_chem_id);

  // 선택한 선석의 실제 ADJACENT_TO 인접 선석만 후보로 제시
  // 혼재 위험은 두 갈래다 —
//   ① 같은 선석에 함께 재항 중인 화물 (경고 센터가 잡아내는 것이 대부분 이쪽이다)
//   ② 500m 이내 인접 선석에서 동시 작업 중인 화물 (ADJACENT_TO)
// 예전엔 ②만 고를 수 있어서, 경고를 그대로 재현하려 해도 상대 화물을 넣을 자리가
// 없었다. 자기 선석을 목록 맨 앞에 둔다.
  const adjacentOptions = [form.berth_name, ...onsanAdjacentBerthNames(form.berth_name)]
    .filter((b, i, arr) => b && arr.indexOf(b) === i);
  const adjacentBerth = adjacentOptions.includes(form.adjacent_berth)
    ? form.adjacent_berth
    : (adjacentOptions[0] || '');

  // 심사는 LLM + MSDS 조회라 수 초~1분이 걸린다(처음 보는 물질은 MSDS 수집까지 한다).
  // 로딩 표시가 없으면 눌러도 아무 반응이 없어 "먹통"으로 보인다 — 실제로 그랬다.
  const [running, setRunning] = useState(false);
  // 등급은 확정됐고 체크리스트/근거문장만 아직 오는 중 — 그 자리에만 스켈레톤을 띄운다.
  const [narrativeLoading, setNarrativeLoading] = useState(false);

  const run = async () => {
    if (running) return;
    const adjacent_operations = adjacentBerth && adjacentCargo
      ? [{ berth_name: adjacentBerth, chem_id: adjacentCargo.chem_id, cargo_name: adjacentCargo.name_ko, activity: '하역중' }]
      : [];
    setRunning(true);
    // 백엔드 입력 계약 그대로만 보낸다 (대상 화물 + 인접 화물). 쓰이지 않는 값을
    // 같이 보내면 "저 입력도 판정에 들어가나 보다"라는 오해가 코드에도 남는다.
    const req = {
      cargo_name: selectedCargo?.name_ko,
      chem_id: form.cargo_chem_id,
      berth_name: form.berth_name,
      adjacent_operations,
    };

    // [2026-08-23] 2단계 표시 — 등급·충돌근거를 먼저 그리고(실측 0.07초) 체크리스트를
    // 이어서 채운다(약 2.5초). 두 응답의 risk_level은 백엔드가 같은 규칙엔진 값을
    // 쓰므로 항상 같다 — 먼저 그린 뱃지가 나중에 바뀌지 않는다.
    //
    // ★ setGateAssessment는 (v) => set({ gateAssessment: v }) 형태라 함수
    //   업데이터를 지원하지 않는다. 함수를 넘기면 그게 그대로 스토어에 들어가
    //   화면이 통째로 빈다(뱃지 공백 · "인화성 undefined"). 역전 방지는
    //   지역 플래그로 처리한다.
    let narrativeArrived = false;
    setNarrativeLoading(true);

    assessSafetyVerdict(req)
      .then((verdict) => {
        // 서술이 이미 도착했으면 늦게 온 판정으로 되돌리지 않는다.
        if (verdict && !narrativeArrived) setGateAssessment(verdict);
      })
      .catch(() => { /* 판정 실패는 아래 최종 조회의 catch가 처리 */ });

    try {
      const res = await assessSafetyGates(req);
      narrativeArrived = true;
      setGateAssessment(res);
    } finally {
      setRunning(false);
      setNarrativeLoading(false);
    }
  };

  const style = RISK_STYLE[result?.risk_level] || { color: COLORS.textDim };
  const hits = (result?.gates || []).filter((g) => g.hit);
  const passes = (result?.gates || []).filter((g) => !g.hit);

  // 추론 그래프 펼침 상태 — 심사를 새로 돌릴 때마다 초기화한다. 히트가 하나뿐이면
  // 굳이 눌러보게 하지 않고 바로 펼쳐 둔다("이게 그래프로 나온 판정이다"를 한눈에
  // 보여주는 게 목적이라, 유일한 근거를 클릭 한 번 더 시켜 숨길 이유가 없다).
  // 히트가 여럿이면 각자 근거 그래프가 달라 다 펼치면 화면이 길어지므로 접어 둔다.
  const [expandedGraphs, setExpandedGraphs] = useState(() => new Set());
  useEffect(() => {
    const graphable = (result?.gates || []).filter((g) => g.hit && g.detail);
    setExpandedGraphs(graphable.length === 1 ? new Set([graphable[0].rule]) : new Set());
  }, [result]);
  const toggleGraph = (rule) => setExpandedGraphs((prev) => {
    const next = new Set(prev);
    if (next.has(rule)) next.delete(rule); else next.add(rule);
    return next;
  });

  const inputStyle = {
    width: '100%', background: COLORS.card, color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`, borderRadius: '8px', padding: '7px 10px', fontSize: '13px',
  };
  const labelStyle = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: COLORS.textSecondary };

  // 선석 목록은 온산 12부두 + 부이가 기본이지만, 경고/재항 데이터에서 넘어온 선석은
  // 표기가 다르거나(띄어쓰기) 목록 밖일 수 있다. 그런 선석도 고를 수 있게 합쳐 둔다 —
  // 안 그러면 select 가 빈 값으로 보여 "선석이 안 채워졌다"고 오해한다.
  const berthOptions = BERTHS.includes(form.berth_name) || !form.berth_name
    ? BERTHS
    : [form.berth_name, ...BERTHS];

  return (
    <div
      ref={rootRef}
      className="glass-card"
      style={{
        transition: 'box-shadow 0.4s',
        ...(flash ? { boxShadow: `0 0 0 2px ${COLORS.teal}, 0 0 18px ${COLORS.teal}55` } : {}),
      }}
    >
      <div className="glass-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="glass-card-title">
          <FaShieldAlt style={{ marginRight: '8px', color: COLORS.teal }} />신규 입항 안전 심사 — 혼재금지 · IMDG 격리 · 포장등급
        </h3>
        <span style={{ fontSize: '12px', color: COLORS.textDim }}>화물 조합의 혼재 위험을 봅니다</span>
      </div>

      {/* 경고에서 넘어왔을 때 무엇이 채워졌는지 밝힌다 — 조용히 바뀌면 뭘 심사하는지 모른다 */}
      {prefillNote && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px',
          fontSize: '12px', color: COLORS.teal, background: 'rgba(0, 212, 170, 0.08)',
          border: `1px solid ${COLORS.teal}44`, borderRadius: '8px', padding: '8px 12px',
        }}>
          <span style={{ flex: 1 }}>{prefillNote}</span>
          <button
            type="button"
            onClick={() => setPrefillNote(null)}
            style={{ background: 'none', border: 'none', color: COLORS.textDim, cursor: 'pointer', fontSize: '13px' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 재항 선박에서 불러오기 — 수기 입력 대신 실제 붙어 있는 배를 고른다.
          목록 기준(PORT-MIS 재항 + 위험물 신고, 화물은 선종 기반 합성) 설명은
          화면에서 뺐다 — 관제사에게는 소음이고, 데이터 계보는 설계문서 몫이다
          (2026-08-21 피드백). */}
      {berthedVessels.length > 0 && (
        <div style={{
          marginBottom: '12px', background: COLORS.card,
          border: `1px solid ${COLORS.border}`, borderRadius: '8px', padding: '10px 12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>
              재항 선박에서 불러오기
            </span>
            <select
              defaultValue=""
              onChange={(e) => { loadFromBerthed(e.target.value); e.target.value = ''; }}
              style={{ ...inputStyle, flex: 1 }}
            >
              <option value="">선박 선택 — 화물·선석·인접 화물이 자동으로 채워집니다</option>
              {berthedVessels.map((r, i) => (
                <option key={`${r.callsgn}-${i}`} value={i}>
                  {r.facility_name} · {r.callsgn} · {r.cargo_name || '물질 미확인'}
                  {r.chem_id ? '' : ' (판정 불가)'}
                </option>
              ))}
            </select>
            <span style={{ fontSize: '11px', color: COLORS.textDim, whiteSpace: 'nowrap' }}>
              {berthedVessels.length} / {berthedTotal}건
            </span>
          </div>
        </div>
      )}

      {/* 입항 정보 폼 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px', marginBottom: '12px' }}>
        <label style={labelStyle}>화물
          <select value={form.cargo_chem_id} onChange={set('cargo_chem_id')} style={inputStyle} disabled={chemicals.length === 0}>
            {chemicals.length === 0 && <option value="">불러오는 중…</option>}
            {chemicals.map((c) => <option key={c.chem_id} value={c.chem_id}>{c.name_ko}</option>)}
          </select>
        </label>
        <label style={labelStyle}>선석
          <select value={form.berth_name} onChange={set('berth_name')} style={inputStyle}>
            {berthOptions.map((b) => <option key={b}>{b}</option>)}
          </select>
        </label>
        <label style={labelStyle}>동시 작업 선석 (동일 · 인접)
          {adjacentOptions.length > 0 ? (
            <select value={adjacentBerth} onChange={set('adjacent_berth')} style={inputStyle}>
              {adjacentOptions.map((b) => (
                <option key={b} value={b}>
                  {b === form.berth_name ? `${b} (동일 선석)` : b}
                </option>
              ))}
            </select>
          ) : (
            <span style={{ ...inputStyle, color: COLORS.textDim, display: 'inline-block', boxSizing: 'border-box' }}>인접 선석 없음</span>
          )}
        </label>
        <label style={labelStyle}>그쪽 하역화물 (없으면 비움)
          <select value={form.adjacent_chem_id} onChange={set('adjacent_chem_id')} style={inputStyle}
            disabled={adjacentOptions.length === 0}>
            <option value="">작업 없음</option>
            {chemicals.map((c) => <option key={c.chem_id} value={c.chem_id}>{c.name_ko}</option>)}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11.5px', color: COLORS.textDim, lineHeight: 1.5 }}>
          선체 제원(흘수·DWT)에 따른 접안 가능성은 우하단 <strong style={{ color: COLORS.teal }}>협상 콘솔의 종합 판정</strong>이
          스케줄링 에이전트로 검토합니다 — 이 심사는 화물 조합의 위험만 봅니다.
        </span>
        <button
          onClick={run}
          disabled={running || !form.cargo_chem_id}
          style={{
            marginLeft: 'auto',
            background: running ? COLORS.card : `linear-gradient(135deg, ${COLORS.teal}, ${COLORS.tealDark})`,
            color: running ? COLORS.textSecondary : '#FFFFFF',
            border: running ? `1px solid ${COLORS.border}` : 'none',
            borderRadius: '8px', padding: '9px 22px', fontWeight: 700,
            cursor: running ? 'progress' : 'pointer', fontSize: '14px',
          }}
        >
          {running ? '판정 중…' : '안전 심사 실행'}
        </button>
      </div>
      {/* [2026-08-23] 판정이 뜨기 "전"에만 보여준다.
          2단계 표시로 바뀌면서 등급 뱃지가 0.07초에 먼저 뜨는데, 이 문구가
          그 위에 남아 있으면 "생성하는 중"이라는 안내가 이미 나온 판정보다
          위에 놓여 순서가 거꾸로 읽힌다. 판정 이후의 진행 상황은 뱃지 바로
          아래 문구가 이어받는다. */}
      {running && !result && (
        <div style={{ fontSize: '12px', color: COLORS.info, marginBottom: '12px' }}>
          규칙엔진(Neo4j 혼재금지 + IMDG 격리)을 조회하는 중입니다 —
          처음 조회하는 물질은 MSDS 수집까지 하느라 1~2분 걸릴 수 있습니다.
        </div>
      )}

      {/* 판정 결과 */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{
              padding: '10px 22px', borderRadius: '10px', border: `2px solid ${style.color}`,
              color: style.color, fontSize: '22px', fontWeight: 800, background: COLORS.card,
            }}>
              {result.risk_level}
            </div>
            {/* [2026-08-23] "혼재 룰엔진 하한 OO · 인화성 OO" 줄을 뺐다.
                · 하한: 등급을 규칙엔진이 확정하게 바뀌면서(risk_level ==
                  rule_engine_floor) 왼쪽 뱃지와 항상 같은 값이 됐다. 예전엔
                  LLM이 하한 위로 올릴 수 있어 둘을 나란히 보여줄 이유가 있었다.
                · 인화성: key_hazards에서 '인화'가 든 문장을 뽑아 앞에 "인화성"을
                  또 붙이는 구조라 "인화성 인화성 가스 폭발 위험"으로 찍혔다.
                  등급값(고인화성 등)이 오던 자리에 문장이 들어오면서 깨진 것.
                · IMDG 격리코드: 부두 간 판정 근거가 아니라 참고 정보라 제거됨. */}
            <div style={{ fontSize: '12px', color: COLORS.textSecondary, lineHeight: 1.6 }}>
              {result.explanation?.summary}
            </div>
          </div>

          {/* 등급은 확정됐고 LLM 서술만 오는 중 — 뱃지 바로 아래에 둬야
              "무엇이 끝났고 무엇이 남았는지"가 순서대로 읽힌다. */}
          {narrativeLoading && (
            <div style={{ fontSize: '12px', color: COLORS.info }}>
              위험등급은 규칙엔진으로 확정됐습니다. LLM 근거(체크리스트·판단 사유)를 생성하는 중입니다…
            </div>
          )}

          {hits.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {hits.map((g) => (
                <div key={g.rule} style={{
                  display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 12px',
                  background: 'rgba(255, 75, 110, 0.08)', border: '1px solid rgba(255, 75, 110, 0.3)', borderRadius: '8px',
                }}>
                  <FaTimesCircle color={COLORS.red} style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div style={{ fontSize: '13px', color: COLORS.textPrimary }}>
                    <b>[{g.rule}] {g.name}</b>
                    <span style={{
                      marginLeft: '8px', fontSize: '11px', color: COLORS.red,
                      border: `1px solid ${COLORS.red}`, borderRadius: '4px', padding: '1px 6px',
                    }}>{g.severity}</span>
                    <div style={{ color: COLORS.textSecondary, marginTop: '2px' }}>{g.reason}</div>
                    {g.detail && (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleGraph(g.rule)}
                          style={{
                            display: 'block', background: 'none', border: 'none', color: COLORS.info,
                            cursor: 'pointer', fontSize: '11.5px', fontWeight: 600, padding: '8px 0 0', fontFamily: 'inherit',
                          }}
                        >
                          {expandedGraphs.has(g.rule) ? '▲ 추론 그래프 접기' : '▼ 추론 그래프 보기'}
                        </button>
                        {expandedGraphs.has(g.rule) && (
                          <ReasoningGraph
                            targetBerth={form.berth_name}
                            targetCargo={result.target_cargo_name || selectedCargo?.name_ko}
                            gate={g}
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <button onClick={() => setShowAllGates((v) => !v)} style={{
            alignSelf: 'flex-start', background: 'none', border: 'none', color: COLORS.info,
            cursor: 'pointer', fontSize: '12px', padding: 0,
          }}>
            {showAllGates ? '▲ 통과 게이트 접기' : `▼ 통과 게이트 ${passes.length}개 펼치기`}
          </button>
          {showAllGates && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {passes.map((g) => (
                <div key={g.rule} style={{ fontSize: '12px', color: COLORS.textSecondary, display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                  {g.severity === 'UNKNOWN'
                    ? <FaQuestionCircle color={COLORS.yellow} style={{ marginTop: '2px', flexShrink: 0 }} />
                    : <FaCheckCircle color={COLORS.teal} style={{ marginTop: '2px', flexShrink: 0, opacity: 0.6 }} />}
                  <div style={{ flex: 1 }}>
                    <span><b>{g.rule}</b> {g.name} — {g.reason}</span>
                    {g.detail && (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleGraph(g.rule)}
                          style={{
                            display: 'block', background: 'none', border: 'none', color: COLORS.info,
                            cursor: 'pointer', fontSize: '11.5px', fontWeight: 600, padding: '6px 0 0', fontFamily: 'inherit',
                          }}
                        >
                          {expandedGraphs.has(g.rule) ? '▲ 추론 그래프 접기' : '▼ 추론 그래프 보기'}
                        </button>
                        {expandedGraphs.has(g.rule) && (
                          <ReasoningGraph
                            targetBerth={form.berth_name}
                            targetCargo={result.target_cargo_name || selectedCargo?.name_ko}
                            gate={g}
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {result.explanation?.checklist?.length > 0 && (
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: COLORS.textPrimary, marginBottom: '6px' }}>
                MSDS 안전 체크리스트
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: COLORS.textSecondary, lineHeight: 1.8 }}>
                {result.explanation.checklist.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
