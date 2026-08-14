import { useCallback, useEffect, useState } from 'react';
import { BACKEND_BASE } from '../api/backendAdapter';
import { ONSAN_WEATHER_GROUP } from '../utils/geoUtils';
import useSensorStore from '../stores/useSensorStore';

// ─────────────────────────────────────────────
// 온산 에이전트 API 어댑터 (실백엔드 ↔ 화면 계약 변환)
//
// 백엔드(dev 머지본)는 POST + 본문 방식이고, 관측치는 서버가 DB에서 직접 읽는다.
// 화면 컴포넌트는 기존 프로토타입 응답 형태를 그대로 쓰므로, 변환은 이 훅에서만 한다.
//   POST /api/v1/weather/assess      { berth_group }                  → 4단계 판정
//   POST /api/v1/safety/assess       { target_cargo, adjacent_cargos } → 혼재/IMDG/LLM 판정
//   POST /api/v1/orchestrator/assess { vessel, cargo, window_* }       → 전용→대체→정박지
// 백엔드가 없거나 실패하면 로컬 폴백으로 화면은 계속 동작한다(플래그로 구분 표시).
// ─────────────────────────────────────────────

// 화물명 → CAS 번호. 백엔드가 CAS로 KOSHA MSDS를 lazy-fetch 한다.
// (처음 조회하는 물질은 응답이 1~2분 걸리고, 이후에는 DB 캐시로 즉시 응답)
const CARGO_CAS = {
  '에탄올': '64-17-5', '메탄올': '67-56-1', '톨루엔': '108-88-3', '벤젠': '71-43-2',
  '자일렌': '1330-20-7', '스티렌': '100-42-5', '황산': '7664-93-9', '부타디엔': '106-99-0',
  '휘발유': '86290-81-5', '가솔린': '86290-81-5', '경유': '68334-30-5',
  '등유': '8008-20-6', '나프타': '64742-49-0',
  // 위반 시나리오 7종 화물 (violation_scenarios.csv) — 시나리오 ① 판정 대상
  '프로페인': '74-98-6', '프로판': '74-98-6', 'LPG': '74-98-6',
  '원유': '8002-05-9', 'LNG': '74-82-8', '메테인': '74-82-8',
};

const cargoRef = (name) => (CARGO_CAS[name] ? { cas_no: CARGO_CAS[name], name_hint: name } : null);

// chem_id/cas_no를 이미 아는 호출자(화물 마스터 목록에서 고르거나, 실화물 조인 결과에서
// 온 경우)는 그걸 그대로 CargoRef로 쓴다 — CARGO_CAS 이름 사전을 안 거치므로 표기
// 불일치로 인한 매핑 실패가 없다. target/adjacent 양쪽에서 같은 우선순위로 써서 하나로 뺐다.
const resolveCargoRef = ({ chem_id, cas_no, cargo_name }) => {
  if (chem_id) return { chem_id, name_hint: cargo_name };
  if (cas_no) return { cas_no, name_hint: cargo_name };
  return cargoRef(cargo_name);
};

/** 질문 문장이 화물명을 스스로 지목하는가 — cargo_hint 를 붙일지 판단하는 데 쓴다 */
export const namesAnyCargo = (text) =>
  Object.keys(CARGO_CAS).some((name) => text.includes(name));

// ─── 화물 마스터 목록 (GET /chatbot/chemicals) ───
// 위 CARGO_CAS는 채팅 자유 텍스트에서 화물명을 스스로 찾아낼 때 쓰는 소규모 사전이고,
// 이거는 지식그래프에 실제 등재된 전체 화물 목록이다(현재 36종) — "판정까지 가능한
// 화물"의 정본. 신규 입항 안전 심사(SafetyGatesPanel) 같은 화면은 하드코딩된 목록
// 대신 이걸 써야 한다: 화면 목록이 실제 DB/그래프와 어긋나면(이름 표기 불일치,
// 새로 추가된 화물 누락 등) 골라도 "CAS 매핑 없음"으로 항상 실패하는 문제가 있었다.
// 여러 컴포넌트가 같은 요청을 반복하지 않도록 모듈 스코프에 한 번만 캐시한다.
let _chemicalsPromise = null;
function fetchChemicalList() {
  if (!_chemicalsPromise) {
    _chemicalsPromise = fetch(`${BACKEND_BASE}/chatbot/chemicals`)
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
  }
  return _chemicalsPromise;
}

/** @returns {Array<{chem_id:string, name_ko:string, name_en:string, cas_no:string, un_no:string}>} */
export function useChemicalList() {
  const [chemicals, setChemicals] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetchChemicalList().then((list) => { if (!cancelled) setChemicals(list); });
    return () => { cancelled = true; };
  }, []);
  return chemicals;
}

// KOSHA MSDS 16개 섹션. 백엔드 kosha_client.DETAIL_ENDPOINTS 와 같은 이름을 쓴다.
const MSDS_SECTIONS = {
  detail01: '화학제품과 회사에 관한 정보', detail02: '유해성·위험성',
  detail03: '구성성분의 명칭 및 함유량', detail04: '응급조치요령',
  detail05: '폭발·화재시 대처방법', detail06: '누출사고시 대처방법',
  detail07: '취급 및 저장방법', detail08: '노출방지 및 개인보호구',
  detail09: '물리화학적 특성', detail10: '안정성 및 반응성',
  detail11: '독성에 관한 정보', detail12: '환경에 미치는 영향',
  detail13: '폐기시 주의사항', detail14: '운송에 필요한 정보',
  detail15: '법적 규제현황', detail16: '그 밖의 참고사항',
};

// 질문 키워드 → 우선 조회 섹션. 벡터 검색이 없을 때 쓰는 규칙 기반 라우팅이다.
const SECTION_KEYWORDS = [
  [['불', '화재', '소화', '폭발', '연소'], 'detail05'],
  [['응급', '흡입', '삼켰', '눈에', '피부에', '구조', '응급조치'], 'detail04'],
  [['누출', '유출', '엎질', '방제'], 'detail06'],
  [['보관', '저장', '취급', '적재', '보관법'], 'detail07'],
  [['보호구', '마스크', '장갑', '방독', '보호복', '환기'], 'detail08'],
  [['인화점', '끓는점', '비점', '증기압', '비중', '밀도', '물성', '녹는점'], 'detail09'],
  [['반응', '안정성', '금지', '피해야', '혼촉'], 'detail10'],
  [['독성', '급성', '발암', '유해성 분류'], 'detail11'],
  [['환경', '수생', '생분해', '오염'], 'detail12'],
  [['폐기', '처리', '처분'], 'detail13'],
  [['운송', 'un', '포장등급', '해상운송', 'imdg'], 'detail14'],
  [['규제', '법규', '법적', '허가', '신고'], 'detail15'],
  [['위험성', '유해성', 'ghs', '경고표지', '그림문자'], 'detail02'],
];

const _NULL_VALUES = new Set(['자료없음', '해당없음', '-', '', 'N/A', '없음']);

/** 질문에서 화물명을 찾는다 (등록된 CAS 매핑 기준). */
function detectCargo(question) {
  const q = String(question || '');
  return Object.keys(CARGO_CAS).find((name) => q.includes(name)) || null;
}

/** 질문 키워드로 조회할 섹션 순서를 정한다. 매칭 없으면 안전관제 기본 5종. */
function rankSections(question) {
  const q = String(question || '').toLowerCase();
  const hits = SECTION_KEYWORDS
    .filter(([words]) => words.some((w) => q.includes(w)))
    .map(([, section]) => section);
  const fallback = ['detail02', 'detail07', 'detail08', 'detail04', 'detail10'];
  return [...new Set([...hits, ...fallback])];
}

/**
 * 규칙 기반 근거 인용 — MSDS 원문 섹션을 그대로 인용해 답한다.
 * WBS 리스크 대응의 "RAG 미완 시 폴백"을 실제로 구현한 경로다.
 * 문장을 생성하지 않으므로 환각이 원천적으로 없다(대신 요약은 못 한다).
 */
async function localMsdsAnswer({ question, cargoHint }) {
  const cargoName = cargoHint || detectCargo(question);
  const cas = cargoName ? CARGO_CAS[cargoName] : null;

  if (!cas) {
    return {
      answer: '어떤 화물에 대한 질문인지 확인하지 못했습니다. 화물명을 함께 적어주세요. '
        + `(조회 가능: ${Object.keys(CARGO_CAS).slice(0, 8).join(', ')} 등)`,
      citations: [], is_local_fallback: true, source: 'NO_CARGO',
    };
  }

  let payload = null;
  try {
    const res = await fetch(`${BACKEND_BASE}/msds/${encodeURIComponent(cas)}`);
    if (res.ok) payload = (await res.json())?.msds_payload;
  } catch {
    payload = null;
  }
  if (!payload) {
    return {
      answer: `'${cargoName}'의 MSDS를 조회하지 못했습니다. 백엔드(8000)가 떠 있는지 확인해주세요.`,
      citations: [], is_local_fallback: true, source: 'MSDS_UNAVAILABLE',
    };
  }

  const citations = [];
  for (const section of rankSections(question)) {
    const data = payload[section]?.data;
    if (!Array.isArray(data)) continue;
    for (const item of data) {
      const text = String(item?.itemDetail || '').trim();
      if (text && !_NULL_VALUES.has(text)) {
        citations.push({
          chem_name: cargoName, cas_no: cas, section,
          section_name: MSDS_SECTIONS[section], text, score: null,
        });
      }
      if (citations.length >= 6) break;
    }
    if (citations.length >= 6) break;
  }

  return {
    answer: citations.length
      ? `'${cargoName}' MSDS에서 관련 섹션 ${new Set(citations.map((c) => c.section)).size}개를 찾았습니다. 원문을 그대로 인용합니다.`
      : `'${cargoName}' MSDS에 해당 내용이 없습니다. (모르는 것은 만들어내지 않습니다)`,
    citations, is_local_fallback: true, source: 'MSDS_RULE_CITATION',
  };
}

// ─── 로컬 폴백 임계 (백엔드 미가동 시에도 데모 가능하게) ───
// 실측 임계는 berth_weather_thresholds.csv 기준, 미등록 선석군은 기본값.
const LOCAL_THRESHOLDS = {
  '정일1/2부두(산암리)': {
    stop: { wind: 17, wave: 1.0 }, unberth: { wind: 19, wave: null },
    disconnect: { wind: 21, wave: 2.0 }, source: '정일_입항정보_9.8',
  },
  'OTK1/2부두(처용리)': {
    stop: { wind: 14, wave: 2.0 }, unberth: { wind: 18, wave: 2.5 },
    disconnect: { wind: 21, wave: 3.0 }, source: 'OTK_입항정보_9.8',
  },
  default: {
    stop: { wind: 14, wave: 1.5 }, unberth: { wind: 17, wave: null },
    disconnect: { wind: 20, wave: 2.0 }, source: '기본 임계',
  },
};

function localAssessWeather({ berthGroup, windSpeed, waveHeight, isStale, precipObserved = false, extraCondition = false }) {
  const th = LOCAL_THRESHOLDS[berthGroup] || LOCAL_THRESHOLDS.default;
  if (isStale) {
    return {
      berth_group: berthGroup, status: '판단불가',
      reasons: ['관측값 유효기간 초과(stale) → fail-safe 판단불가'],
      thresholds_used: th, is_local_fallback: true,
    };
  }
  const w = parseFloat(windSpeed) || 0;
  const h = parseFloat(waveHeight) || 0;
  const reasons = [];
  let status = '정상';
  const over = (v, lim) => lim != null && v >= lim;
  if (over(w, th.disconnect.wind) || over(h, th.disconnect.wave)) {
    status = '호스분리';
    if (over(w, th.disconnect.wind)) reasons.push(`풍속 ${w} m/s >= ${th.disconnect.wind} m/s -> 호스분리`);
    if (over(h, th.disconnect.wave)) reasons.push(`파고 ${h} m >= ${th.disconnect.wave} m -> 호스분리`);
  } else if (over(w, th.unberth.wind) || over(h, th.unberth.wave)) {
    status = '이안';
    if (over(w, th.unberth.wind)) reasons.push(`풍속 ${w} m/s >= ${th.unberth.wind} m/s -> 이안`);
    if (over(h, th.unberth.wave)) reasons.push(`파고 ${h} m >= ${th.unberth.wave} m -> 이안`);
  } else if (over(w, th.stop.wind) || over(h, th.stop.wave)) {
    status = '하역중단';
    if (over(w, th.stop.wind)) reasons.push(`풍속 ${w} m/s >= ${th.stop.wind} m/s -> 하역중단`);
    if (over(h, th.stop.wave)) reasons.push(`파고 ${h} m >= ${th.stop.wave} m -> 하역중단`);
  } else {
    reasons.push(`풍속 ${w} m/s · 파고 ${h} m — 모든 임계 미만`);
  }
  // 강수·특별조건 — 백엔드 rule_engine 과 같은 순서로 풍속/파고 판정 위에 얹는다
  const RANK = { '정상': 0, '하역중단': 1, '이안': 2, '호스분리': 3 };
  if (precipObserved && RANK[status] < RANK['하역중단']) {
    status = '하역중단';
    reasons.push('강수 육안 확인 → 하역중단 (산업안전보건기준 규칙 제383조 제2호 준용: 강우 1mm/h 이상 작업중지)');
  } else if (precipObserved) {
    reasons.push('강수 육안 확인 — 이미 상위 단계 판정 적용 중');
  }
  if (extraCondition && RANK[status] < RANK['하역중단']) {
    // 백엔드 rule_engine 과 동일: 정성조건 발효 시 최소 '하역중단'으로 상향
    status = '하역중단';
    reasons.push('정성조건 발효(대기정체/심한뇌우/태풍경로) -> 최소 하역중단');
  } else if (extraCondition) {
    reasons.push('정성조건 발효 — 이미 상위 단계 판정 적용 중');
  }
  return { berth_group: berthGroup, status, reasons, thresholds_used: th, is_local_fallback: true };
}

const LOCAL_BERTH_GROUPS = [...new Set(Object.values(ONSAN_WEATHER_GROUP))];

// ─── 응답 변환기 ──────────────────────────────────────
function fmtForecastWarning(fw) {
  if (!fw) return null;
  if (typeof fw === 'string') return fw;
  const at = fw.expected_completion_at || fw.at_utc || fw.forecast_at_utc;
  const when = at ? new Date(at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) : '';
  return `예보 경고: ${fw.status || fw.level || '주의'}${when ? ` (${when} 기준)` : ''}` +
    (fw.reasons?.length ? ` — ${fw.reasons.join(', ')}` : '');
}

function mapWeather(r, berthGroup) {
  return {
    berth_group: berthGroup,
    status: r.status,
    reasons: r.reasons || [],
    // 백엔드는 임계값 자체를 응답에 싣지 않는다 → 표시용으로 로컬 표를 함께 보여준다.
    thresholds_used: LOCAL_THRESHOLDS[berthGroup] || LOCAL_THRESHOLDS.default,
    observed: {
      wind: r.wind?.value ?? null, wave: r.wave?.value ?? null,
      station: r.wind?.station_name || r.wave?.station_name || null,
      observed_at_utc: r.wind?.observed_at_utc || r.wave?.observed_at_utc || null,
      is_stale: Boolean(r.wind?.is_stale || r.wave?.is_stale),
    },
    forecast_warning: fmtForecastWarning(r.forecast_warning),
    assessed_at_utc: r.assessed_at_utc,
    is_local_fallback: false,
    source: 'BACKEND_AGENT',
  };
}

function mapSafety(r) {
  const conflicts = r.conflicts || [];
  const imdg = r.imdg_conflicts || [];
  const gates = [
    ...conflicts.map((c, i) => ({
      rule: `MSDS-${i + 1}`, name: '혼재금지 (MSDS 반응성)', hit: true, severity: 'BLOCK',
      reason: `${c.adjacent_berth} ${c.adjacent_name} — ${c.shared_category} 충돌`,
    })),
    ...imdg.map((c) => ({
      rule: `IMDG-${c.segregation_code}`, name: 'IMDG 격리 요구', hit: true, severity: 'HOLD',
      reason: `${c.adjacent_berth} ${c.adjacent_name} (${c.target_imdg_class} ↔ ${c.adjacent_imdg_class}) 격리코드 ${c.segregation_code}`,
    })),
  ];
  if (gates.length === 0) {
    gates.push({
      rule: 'MSDS/IMDG', name: '인접 화물 혼재 검사', hit: false, severity: 'INFO',
      reason: '인접 선석 화물과 혼재금지·격리 충돌 없음',
    });
  }
  const flam = (r.key_hazards || []).find((h) => h.includes('인화')) || '정보 없음';
  return {
    risk_level: r.risk_level,
    risk_level_basis: {
      rule_engine_floor: r.rule_engine_floor,
      imdg_segregation_code: imdg[0]?.segregation_code ?? null,
      flammability_grade: flam,
      gate_hits: gates.filter((g) => g.hit).map((g) => g.rule),
    },
    gates,
    explanation: {
      summary: r.reasoning,
      reasoning: r.key_hazards || [],
      checklist: r.checklist || [],
    },
    target_cargo_name: r.target_cargo_name,
    msds_sections_used: r.msds_sections_used || [],
    is_local_fallback: false,
    source: 'BACKEND_LLM',
  };
}

function mapOrchestration(r) {
  const d = r.overall_decision || '';
  const status = d.includes('승인') ? 'APPROVED'
    : d.includes('정박지') ? 'WAITING_ANCHORAGE'
      : 'REJECTED';
  const trace = r.assignment_trace || [];
  const path = r.anchorage_assignment ? '정박지대기'
    : trace.some((t) => t.includes('대체')) ? '대체' : '전용';
  return {
    status,
    decision_label: d,
    berth_assigned: r.selected_berth?.wharf_name || null,
    anchorage: r.anchorage_assignment?.name || null,
    berth_decision: { path, trace, anchorage: r.anchorage_assignment?.name || null },
    risk_level: r.safety_assessment?.risk_level || null,
    weather_grade: r.weather_assessment?.status || null,
    summary: r.summary,
    rejected_candidates: r.rejected_candidates || [],
    is_local_fallback: false,
    source: 'BACKEND_ORCHESTRATOR',
  };
}

export default function useOnsanApi() {
  const setBerthGroups = useSensorStore((s) => s.setBerthGroups);
  const setBerthWeather = useSensorStore((s) => s.setBerthWeather);
  const setOrchestration = useSensorStore((s) => s.setOrchestration);

  const postJson = useCallback(async (path, body) => {
    try {
      const res = await fetch(`${BACKEND_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`[OnsanAPI] ${path} 실패 → 로컬 폴백:`, err.message);
      return null;
    }
  }, []);

  // 선석군 목록 — 백엔드에 조회 엔드포인트가 없어 로컬 매핑을 쓴다
  // (berth_weather_threshold 시드와 동일한 문자열)
  const fetchBerthGroups = useCallback(async () => {
    setBerthGroups(LOCAL_BERTH_GROUPS);
    return { berth_groups: LOCAL_BERTH_GROUPS };
  }, [setBerthGroups]);

  // 선석별 4단계 기상 판정 — 백엔드 기상 에이전트가 DB 관측치로 직접 판정
  const assessBerthWeather = useCallback(
    async ({ berthGroup, windSpeed, waveHeight, isStale = false, precipObserved = false, extraCondition = false }) => {
      const data = await postJson('/weather/assess', {
        berth_group: berthGroup,
        precip_observed: Boolean(precipObserved),
        extra_condition_active: Boolean(extraCondition),
      });
      const verdict = data ? mapWeather(data, berthGroup)
        : localAssessWeather({ berthGroup, windSpeed, waveHeight, isStale, precipObserved, extraCondition });
      setBerthWeather(verdict);
      return verdict;
    },
    [postJson, setBerthWeather]
  );

  // 안전 판정 — MSDS 혼재금지 + IMDG 격리 + LLM 근거 생성.
  // 스토어에 결과를 쓰지 않는다(순수 fetch) — SafetyGatesPanel(수동 R1~R15 심사)과
  // useVesselSafety(선박 선택 시 자동 판정)가 둘 다 이 함수를 쓰는데, 예전엔 여기서
  // 바로 setGateAssessment 하는 바람에 지도/목록에서 선박만 클릭해도 SafetyGatesPanel·
  // DashboardPage KPI에 표시되던 "최근 안전 심사" 결과가 다른 선박 값으로 조용히
  // 덮어써졌다. 이제 전역 상태에 반영할지는 호출자가 결정한다
  // (SafetyGatesPanel만 반영 — useVesselSafety는 자기 로컬 state만 씀).
  const assessSafetyGates = useCallback(
    async (req) => {
      const target = resolveCargoRef(req);
      const adj = (req.adjacent_operations || [])
        .map((o) => {
          const c = resolveCargoRef(o);
          return c ? { berth_name: o.berth_name, cargo: c } : null;
        })
        .filter(Boolean);

      const data = target
        ? await postJson('/safety/assess', { target_cargo: target, adjacent_cargos: adj })
        : null;

      const result = data ? mapSafety(data) : {
        risk_level: '판단불가',
        risk_level_basis: { rule_engine_floor: '판단불가', imdg_segregation_code: null, flammability_grade: '정보 없음', gate_hits: [] },
        gates: [{
          rule: '-', name: '안전 판정', hit: true, severity: 'HOLD',
          reason: target ? '백엔드 안전 에이전트 응답 없음 — 판단 보류(fail-safe)'
            : `화물 '${req.cargo_name}' CAS 매핑 없음 — MSDS 조회 불가`,
        }],
        explanation: { summary: '판정을 확정할 수 없어 보류합니다. (모르면 가능하다고 하지 않는다)', reasoning: [], checklist: [] },
        is_local_fallback: true,
        source: 'LOCAL_FALLBACK',
      };
      return result;
    },
    [postJson]
  );

  // 오케스트레이터 — 기상 → 스케줄링(전용/대체/정박지) → 안전 순차 판단
  // casNo가 오면(실AIS+berth-cargo 조인으로 이미 CAS를 아는 경우) 데모용 이름사전
  // cargoRef()를 거치지 않고 그대로 쓴다 — 실물질명은 사전 12종 밖일 수 있어서다.
  const orchestrate = useCallback(
    async ({ cargoName, casNo, dwt, draught, vesselName = '신규 입항선' }) => {
      const cargo = resolveCargoRef({ cas_no: casNo, cargo_name: cargoName });
      const now = Date.now();
      const data = cargo
        ? await postJson('/orchestrator/assess', {
          vessel: {
            draught_m: Number(draught) || 7.5,
            dwt_t: dwt ? Number(dwt) : null,
            name_hint: vesselName,
          },
          cargo,
          window_start: new Date(now).toISOString(),
          window_end: new Date(now + 8 * 3600 * 1000).toISOString(),
        })
        : null;

      const result = data ? mapOrchestration(data) : {
        status: 'PENDING',
        decision_label: '판단 보류',
        berth_assigned: null, anchorage: null,
        berth_decision: { path: null, trace: ['백엔드 오케스트레이터 응답 없음 — 판단 보류'], anchorage: null },
        risk_level: null, weather_grade: null,
        summary: cargo ? '백엔드 응답이 없어 배정 판단을 보류합니다.' : `화물 '${cargoName}' CAS 매핑이 없어 조회할 수 없습니다.`,
        is_local_fallback: true, source: 'LOCAL_FALLBACK',
      };
      setOrchestration(result);
      return result;
    },
    [postJson, setOrchestration]
  );

  // ─── 관제사 질의응답 (RAG) ───
  // 백엔드 /rag/query 가 준비되면 그대로 쓰고, 없으면 MSDS 섹션 직접 인용으로 답한다.
  // 폴백이라도 "근거 없는 문장"은 만들지 않는다 — 원문 문장을 그대로 인용한다.
  // 요청 계약 주의 3가지 (backend app/agents/chatbot/schemas.py)
  //  - top_k 는 보내지 않는다. extra="forbid" 라 422로 거절되고, 애초에 근거 청크 수는
  //    intent별로 서버가 튜닝한다(일반 8 / 혼재판정 4 / 그 외 6). 더 보여주는 건 UI 문제다.
  //  - cargo_hint 는 화면이 화물을 이미 특정한 경우에만. 자유 채팅에선 생략한다
  //    (사용자는 CAS번호를 모르고, LLM 플래너가 질문에서 물질명을 뽑는다).
  //  - cargo_hint 를 보낼 땐 chem_id 우선. cas_no 는 msds_chemical 에서 nullable 이다.
  const ragQuery = useCallback(
    async ({ question, cargoHint = null }) => {
      const hint = cargoHint ? cargoRef(cargoHint) : null;
      const body = { question };
      if (hint?.chem_id) body.cargo_hint = { chem_id: hint.chem_id };
      else if (hint?.cas_no) body.cargo_hint = { cas_no: hint.cas_no };

      const data = await postJson('/rag/query', body);
      if (data) {
        return {
          answer: data.answer,
          citations: (data.citations || []).map((c) => ({
            chem_name: c.chem_name, cas_no: c.cas_no,
            section: c.section, section_name: c.section_name || MSDS_SECTIONS[c.section],
            text: c.text,
            // score === null 은 유사도가 낮은 게 아니라 '확정값'(정형 컬럼·그래프 관계)이다.
            // 벡터 발췌보다 신뢰도가 높으므로 화면에서 유사도 뱃지와 구분해야 한다.
            score: c.score ?? null,
            is_exact: c.score === null || c.score === undefined,
          })),
          confidence: data.confidence || null,
          // 비어 있지 않으면 "혼재금지 관계 없음(안전)"이 아니라 "판정 불가"다 — 경고 대상
          unresolved: data.unresolved || [],
          assessment: data.assessment || null,
          is_local_fallback: false,
          source: 'BACKEND_RAG',
        };
      }
      return localMsdsAnswer({ question, cargoHint });
    },
    [postJson]
  );

  return { fetchBerthGroups, assessBerthWeather, assessSafetyGates, orchestrate, ragQuery };
}
