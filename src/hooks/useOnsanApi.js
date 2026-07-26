import { useCallback } from 'react';
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
  '자일렌': '1330-20-7', '황산': '7664-93-9', '부타디엔': '106-99-0',
  '휘발유': '86290-81-5', '가솔린': '86290-81-5', '경유': '68334-30-5',
  '등유': '8008-20-6', '나프타': '64742-49-0',
};

const cargoRef = (name) => (CARGO_CAS[name] ? { cas_no: CARGO_CAS[name], name_hint: name } : null);

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

function localAssessWeather({ berthGroup, windSpeed, waveHeight, isStale }) {
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
  const setGateAssessment = useSensorStore((s) => s.setGateAssessment);
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
        : localAssessWeather({ berthGroup, windSpeed, waveHeight, isStale });
      setBerthWeather(verdict);
      return verdict;
    },
    [postJson, setBerthWeather]
  );

  // 안전 판정 — MSDS 혼재금지 + IMDG 격리 + LLM 근거 생성
  const assessSafetyGates = useCallback(
    async (req) => {
      const target = cargoRef(req.cargo_name);
      const adj = (req.adjacent_operations || [])
        .map((o) => {
          const c = cargoRef(o.cargo_name);
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
      setGateAssessment(result);
      return result;
    },
    [postJson, setGateAssessment]
  );

  // 오케스트레이터 — 기상 → 스케줄링(전용/대체/정박지) → 안전 순차 판단
  const orchestrate = useCallback(
    async ({ cargoName, dwt, draught, vesselName = '신규 입항선' }) => {
      const cargo = cargoRef(cargoName);
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

  return { fetchBerthGroups, assessBerthWeather, assessSafetyGates, orchestrate };
}
