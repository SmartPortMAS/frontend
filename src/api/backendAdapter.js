// ─────────────────────────────────────────────
// 김동안 백엔드(FastAPI, dev 머지본) → 대시보드 계약 어댑터
//
// 백엔드는 GET /api/v1/dashboard/{weather,vessels,berths,anchorages}
// 4개 읽기 엔드포인트로 나뉘어 있다 (2026-07-25 dev 머지 기준).
// 프론트 화면은 기존 GET /api/dashboard 한 덩어리 계약을 쓰므로,
// 여기서 4개를 병렬 호출해 그 모양으로 합쳐준다 (팀 합의: 백엔드 수정 없이
// 프론트 어댑터로 흡수).
//
// 필드 매핑 (AIS 표준 → 기존 UI 필드):
//   sog(대지속력) → sog 그대로 / cog·heading → vessel_heading
//   nav_status_code(AIS 항해상태 코드) → nav_status_category
// ─────────────────────────────────────────────
import { ULSAN_BBOX } from '../utils/constants';

const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost';
// 로컬: uvicorn 8001. 8000은 mock-server(GET /api/dashboard) 가 이미 쓰고 있어서
// 백엔드를 8000으로 잡으면 /api/v1/* 이 전부 mock-server 로 가 404 가 된다
// (관제시스템_시작.bat 이 띄우는 구성: mock 8000 + 백엔드 8001).
// 배포: nginx가 /api/v1은 backend, /api는 mockserver로 프록시(deploy/nginx.cloud.conf).
export const BACKEND_BASE = isDev ? 'http://localhost:8001/api/v1' : '/api/v1';

// AIS 항해상태 코드(ITU-R M.1371 숫자) → UI 카테고리 — ais_vessel_position(레거시 소스) 행에서만 옴
const NAV_CODE_TO_CATEGORY = {
  0: 'UNDER_WAY', 1: 'AT_ANCHOR', 2: 'UNKNOWN', 3: 'UNDER_WAY', 4: 'UNDER_WAY',
  5: 'MOORED', 6: 'AT_ANCHOR', 7: 'UNDER_WAY', 8: 'UNDER_WAY',
};

// upa_vessel_position(주 소스, 실측 918척 중 900척 이상)의 nav_status_code는 숫자가 아니라
// 이 한글 텍스트로 온다(2026-08-11 실측). 이 매핑이 없으면 전부 byCode 미스로 SOG 추정
// 폴백을 타서 "정박(계류)"(실제 접안 180척)까지 전부 AT_ANCHOR로 잘못 잡힌다 — MOORED가
// 항상 0으로 보이던 원인.
const NAV_TEXT_TO_CATEGORY = {
  '항해(동력)': 'UNDER_WAY',
  '항해(비동력)': 'UNDER_WAY',
  '정박(계류)': 'MOORED',
  '정박(앵커링)': 'AT_ANCHOR',
  '낚시': 'UNDER_WAY',
  '기동 제한': 'UNKNOWN',
  '흘수에 의한 제한': 'UNKNOWN',
  '조종 불가': 'UNKNOWN',
  '후방 예인': 'UNDER_WAY',
};

function navCategory(row) {
  const code = row.nav_status_code;
  const byText = NAV_TEXT_TO_CATEGORY[code];
  if (byText) return byText;
  const byCode = NAV_CODE_TO_CATEGORY[code];
  if (byCode) return byCode;
  // 코드 결측 시 속력으로 추정: 1kn 미만이면 정박/계류로 본다(MOORED·AT_ANCHOR 구분 불가 —
  // 보수적으로 AT_ANCHOR)
  const sog = row.sog ?? 0;
  return sog < 1 ? 'AT_ANCHOR' : 'UNDER_WAY';
}

function inUlsanBbox(row) {
  return (
    row.latitude >= ULSAN_BBOX.minLat && row.latitude <= ULSAN_BBOX.maxLat &&
    row.longitude >= ULSAN_BBOX.minLon && row.longitude <= ULSAN_BBOX.maxLon
  );
}

// mart.dashboard_current 설계 의도(dashboard.py 주석): "프론트 기본 필터: presence_state
// = PRESENT". 지금까지 이 필터를 안 걸어서 신호 끊긴 지 오래된 선박(NO_SIGNAL)·출항
// 확정 선박(DEPARTED)까지 전부 "관제 선박"으로 잡혔다(실측: bbox 내 918척 중 PRESENT는
// 0척, 나머지는 STALE/NO_SIGNAL/DEPARTED). PRESENT만 쓰면 수집 주기(현재 10분)상 거의
// 항상 0척으로 보여 오히려 "죽은 화면"처럼 느껴지므로, 화면에 아직 회색 처리를 안 붙인
// 지금 단계에서는 STALE(30분~6시간 침묵)까지는 포함하고 NO_SIGNAL·DEPARTED만 제외한다.
function isRecentlyPresent(row) {
  return row.presence_state === 'PRESENT' || row.presence_state === 'STALE';
}

/** upa_vessel_position 행 → 기존 vessels 계약 필드 (+ is_real_ais 플래그)
 * cargoByCallsgn: /dashboard/berth-cargo (mart.berth_current_cargo, 실 신고 위험물)를
 * callsgn으로 조인 — 위치 API 자체엔 화물 정보가 없어 이걸로 보강한다. */
function mapVessel(row, cargoByCallsgn) {
  const cargo = cargoByCallsgn?.get(row.callsgn) || null;
  return {
    port_call_id: `AIS_${row.callsgn || row.mmsi}`,
    callsgn: row.callsgn,
    vessel_name: row.vessel_name,
    mmsi: row.mmsi,
    is_liquid_cargo_vessel: Boolean(cargo), // berth_current_cargo는 위험물(dg_un_no NOT NULL)만 담고 있어 매칭=위험물선 확정
    latitude: row.latitude,
    longitude: row.longitude,
    sog: row.sog,
    draught_m: row.draught ?? null, // dwt는 파이프라인 미수집 — null 유지(오케스트레이터가 "미상"으로 보수적 처리)
    vessel_heading: row.heading || row.cog || 0,
    nav_status_category: navCategory(row),
    received_at_utc: row.received_at_utc,
    is_real_ais: true,
    presence_state: row.presence_state,
    position_age_min: row.position_age_min,
    berth: cargo?.facility_name || null,
    cargo: cargo ? {
      name: cargo.cargo_name, un_no: cargo.dg_un_no, cas_no: cargo.cas_no,
      imdg_class: cargo.imdg_class, is_synthetic: cargo.is_synthetic,
    } : null,
  };
}

/** /dashboard/history 행 → GanttChart의 HistoryGantt 계약(job_id/vessel_name/berth/begin_utc/end_utc).
 * GanttChart.jsx는 이미 ops.filter(is_real_record) 로 이 모양을 기다리고 있었다 — 지금까지
 * 채워주는 API 호출이 없어 항상 빈 배열이었다. */
function mapHistoryRecord(row) {
  return {
    job_id: `HIST_${row.callsgn || row.vessel_name}_${row.arrival_at_utc}`,
    vessel_name: row.vessel_name,
    callsgn: row.callsgn,
    berth: row.facility_name,
    begin_utc: row.arrival_at_utc,
    end_utc: row.departure_at_utc,
    is_real_record: true,
  };
}

/** /dashboard/weather 응답 → 기존 weather 계약 (wind_dir_deg는 백엔드 미제공 — 호출측에서 병합) */
function mapWeather(w) {
  return {
    wind_speed_ms: w.wind?.value ?? null,
    // 예전 백엔드는 풍향을 안 줘서 null 고정이었다. mart.weather_now 전환 후
    // 풍향·돌풍이 응답에 생겼는데 여기서 버리면 mock-server 가 죽은 구성(클라우드
    // 배포 등)에서 풍향이 영영 비게 된다 — 그대로 통과시킨다.
    wind_dir_deg: w.wind_dir_deg ?? null,
    gust_ms: w.gust_ms ?? null,
    wave_height_sig_m: w.wave?.value ?? null,
    tide_level_cm: w.tide?.value ?? null,
    visibility_m: w.visibility_m ?? null,
    observed_at_utc: w.wind?.observed_at_utc ?? w.wave?.observed_at_utc ?? null,
    is_stale: Boolean(w.wind?.is_stale || w.wave?.is_stale),
  };
}

async function getJson(path) {
  const res = await fetch(`${BACKEND_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * 백엔드 9개 엔드포인트를 병렬 호출해 대시보드 보강 데이터로 변환.
 * 기상+선박 둘 다 실패하면 null (백엔드 다운으로 간주 — 호출측이 기존 소스 유지).
 */
export async function fetchBackendDashboard() {
  const [weather, vessels, berths, anchorages, berthCargo, draughtCheck, history, pipelineHealth, stats, alerts] =
    await Promise.allSettled([
      getJson('/dashboard/weather'),
      getJson('/dashboard/vessels'),
      getJson('/dashboard/berths'),
      getJson('/dashboard/anchorages'),
      getJson('/dashboard/berth-cargo'),
      getJson('/dashboard/draught-check'),
      getJson('/dashboard/history'),
      getJson('/dashboard/pipeline-health'),
      getJson('/dashboard/stats'),
      getJson('/dashboard/alerts'),
    ]).then((rs) => rs.map((r) => (r.status === 'fulfilled' ? r.value : null)));

  if (!weather && !vessels) return null;

  // callsgn당 여러 위험물을 신고했을 수 있어 첫 건만 대표로 쓴다(선박 카드엔 1개만 표시).
  const cargoByCallsgn = new Map();
  for (const row of berthCargo ?? []) {
    if (row.callsgn && !cargoByCallsgn.has(row.callsgn)) cargoByCallsgn.set(row.callsgn, row);
  }

  return {
    weather: weather ? mapWeather(weather) : null,
    // 온산 bbox 내 + 최근 신호(PRESENT/STALE, NO_SIGNAL·DEPARTED 제외) + 최신 수신 순 상한 200척
    realTraffic: (vessels ?? [])
      .filter((r) => r.latitude != null && r.longitude != null)
      .filter(inUlsanBbox)
      .filter(isRecentlyPresent)
      .sort((a, b) => new Date(b.received_at_utc) - new Date(a.received_at_utc))
      .slice(0, 200)
      .map((row) => mapVessel(row, cargoByCallsgn)),
    berthOccupancy: berths ?? [],
    anchorages: anchorages ?? [],
    // 조위 반영 흘수·UKC 판정 (mart.berth_draught_check) — callsgn별 원본 그대로 노출,
    // NOT_ALLOWED/MARGINAL/UNKNOWN 판정은 뷰 안에서 이미 끝나 있어 여기선 가공하지 않는다.
    draughtChecks: draughtCheck ?? [],
    // 완료된 접안 이력 — GanttChart의 "온산 선석 실제 접안 이력" 섹션용
    history: (history ?? []).map(mapHistoryRecord),
    // 수집기 생존 신호 — Header 신선도 배지(mart.pipeline_health)
    pipelineHealth: pipelineHealth ?? null,
    // total_port_calls/port_calls_by_facility_type/liquid_callsgns
    // (mock-server 전용이던 onsan_port_calls/ais_position_rows는 백엔드에 없음 — 그대로 없이 둔다)
    stats: stats ?? null,
    // 관제 경고 — 백엔드가 safety 규칙엔진(Neo4j 혼재금지 + IMDG 격리표)을 재항 화물에
    // 돌려 만든 실판정. 응답이 빈 배열([])인 것과 호출 실패(null)는 다르다:
    // 전자는 "위험 없음"이고 후자는 "모름"이라, 호출측이 구분할 수 있게 그대로 넘긴다.
    alerts: alerts ?? null,
  };
}
