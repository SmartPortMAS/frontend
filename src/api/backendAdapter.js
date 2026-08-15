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
// 로컬: uvicorn 8001 (관제시스템_시작.bat 이 띄우는 포트).
// 배포: nginx 가 /api/v1 을 백엔드로 프록시한다.
export const BACKEND_BASE = isDev ? 'http://localhost:8001/api/v1' : '/api/v1';

// 지도에 동시에 그리는 선박 수 상한. 마커가 많아지면 지도가 눈에 띄게 무거워진다.
// KPI 숫자는 이 상한과 무관하게 전체를 센다(realTrafficTotal) — 상한이 KPI 까지
// 잘라버리면 "관제 선박이 항상 200척"이라는 잘못된 인상을 준다.
export const MAP_VESSEL_LIMIT = 200;

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

// PORT-MIS 선종 대조 결과는 3상태다 — true(액체화물선)/false(비액체)/null(대조 실패).
// null 을 false 로 접으면 "선종을 모르는 배"가 화면에서 "일반화물선"으로 둔갑한다.
// 실측(2026-08-15, 재항 356척): true 66 / false 19 / null 271.
// null 이 압도적인 이유는 조인 키 문제다 — PORT-MIS 에는 MMSI 컬럼이 없어 호출부호로만
// 붙일 수 있는데, AIS 호출부호는 선택 필드라 74척이 아예 빈 값이다.
function liquidByShipType(row) {
  return row.is_liquid_cargo_vessel == null ? null : Boolean(row.is_liquid_cargo_vessel);
}

/** upa_vessel_position 행 → 기존 vessels 계약 필드 (+ is_real_ais 플래그)
 * cargoByCallsgn: /dashboard/berth-cargo (mart.berth_current_cargo, 실 신고 위험물)를
 * callsgn으로 조인 — 위치 API 자체엔 화물 정보가 없어 이걸로 보강한다.
 * ambiguousCallsgns: 재항 선박 중 둘 이상이 같은 호출부호를 쓰는 값들(아래 설명). */
function mapVessel(row, cargoByCallsgn, ambiguousCallsgns) {
  // 호출부호가 여러 배에 걸리면 화물을 붙이지 않는다. 붙이면 옆 배 위험물이
  // 엉뚱한 배에 표시되고, 그 배가 혼재·흘수 판정 입력으로까지 들어간다.
  // 모르는 것을 아는 척하느니 비워 두는 편이 맞다.
  const ambiguous = row.callsgn ? ambiguousCallsgns.has(row.callsgn) : false;
  const cargo = (!ambiguous && cargoByCallsgn?.get(row.callsgn)) || null;
  const byShipType = ambiguous ? null : liquidByShipType(row);
  return {
    // 식별자는 MMSI 우선(vessel_key = mart.vessel_identity 의 MMSI-First vessel_uid).
    //
    // 예전엔 `AIS_{호출부호||MMSI}` 였는데, AIS 호출부호에는 '500'·'301'·'ABCD'
    // 같은 쓰레기값이 있어 서로 다른 배가 같은 id 를 받았다(실측 4쌍). 그 결과
    // 입항 목록에서 React key 가 충돌해 같은 배가 두 줄로 보였다
    // (예: DAESU HO / 500 — 실제로는 EOHANG DONGHAE 3HO 와 다른 배다).
    port_call_id: `AIS_${row.vessel_key ?? row.mmsi ?? row.callsgn}`,
    vessel_key: row.vessel_key ?? null,
    callsgn: row.callsgn,
    // 이 호출부호로는 선종·화물을 붙일 수 없다는 사실 자체를 화면이 알게 한다
    callsgn_ambiguous: ambiguous,
    vessel_name: row.vessel_name,
    mmsi: row.mmsi,
    // 선종명(PORT-MIS 공식 51개 코드) — "석유제품 운반선"처럼 근거를 그대로 보여준다
    ship_kind_nm: row.ship_kind_nm ?? null,
    // 근거를 두 개로 나눠 보존한다. 예전엔 두 개를 is_liquid_cargo_vessel 하나에
    // 눌러 담아, 같은 이름이 화면마다 다른 뜻이었다(KPI는 선종 기준 66척, 목록은
    // 화물 매칭 기준 58척 — 둘 다 "위험물선"이라고 적혀 있었다).
    liquid_by_ship_type: byShipType,          // PORT-MIS 선종 기준 (true/false/null)
    has_dg_cargo: Boolean(cargo),             // 재항 위험물 신고가 실제로 붙었는가
    // 액체화물 하역 대상 = 선종이 액체화물선이거나, 위험물 화물이 확인된 배.
    // (2026-08-15 결정: 액체화물을 싣는 배는 전부 하역 대상으로 본다)
    is_liquid_cargo_vessel: Boolean(cargo) || byShipType === true,
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

  // 지도에 그릴 수 있는 선박(좌표 있음 + bbox 내 + 최근 신호). 상한을 걸기 전 전체.
  const presentVessels = (vessels ?? [])
    .filter((r) => r.latitude != null && r.longitude != null)
    .filter(inUlsanBbox)
    .filter(isRecentlyPresent)
    .sort((a, b) => new Date(b.received_at_utc) - new Date(a.received_at_utc));

  // 호출부호는 AIS 에서 선택 입력이라 '500'·'301'·'1263'·'ABCD' 같은 값이 실제로
  // 들어온다(실측 4쌍이 서로 다른 배끼리 겹쳤다). 화물·선종을 이 키로 붙이므로,
  // 겹치는 호출부호를 먼저 찾아 두고 그런 배에는 아무것도 붙이지 않는다.
  const callsgnCount = new Map();
  for (const r of presentVessels) {
    const cs = r.callsgn;
    if (cs) callsgnCount.set(cs, (callsgnCount.get(cs) ?? 0) + 1);
  }
  const ambiguousCallsgns = new Set(
    [...callsgnCount.entries()].filter(([, n]) => n > 1).map(([cs]) => cs)
  );

  // KPI 분류 — mapVessel 과 같은 판정을 쓴다. 두 곳이 갈리면 KPI 와 목록 숫자가
  // 어긋나고, 어느 쪽이 맞는지 화면만 봐서는 알 수 없게 된다.
  const isAmbiguous = (r) => Boolean(r.callsgn) && ambiguousCallsgns.has(r.callsgn);
  const hasCargo = (r) => !isAmbiguous(r) && cargoByCallsgn.has(r.callsgn);
  const shipType = (r) => (isAmbiguous(r) ? null : liquidByShipType(r));

  return {
    weather: weather ? mapWeather(weather) : null,
    // 지도 성능 때문에 200척만 그린다. 다만 KPI 까지 200 으로 보이면 "관제 선박이
    // 항상 200척"이라는 잘못된 인상을 준다 — 실제 수는 realTrafficTotal 로 따로 넘겨
    // 화면이 "몇 척 중 몇 척을 그리는 중"인지 정직하게 말할 수 있게 한다.
    realTraffic: presentVessels
      .slice(0, MAP_VESSEL_LIMIT)
      .map((row) => mapVessel(row, cargoByCallsgn, ambiguousCallsgns)),
    realTrafficTotal: presentVessels.length,
    // 선석별 재항 위험물 화물 원본 — 안전 심사 폼이 "재항 선박에서 불러오기"에 쓴다.
    // (화물을 수기로 고르는 대신 지금 실제로 붙어 있는 배를 선택하게 하기 위함)
    berthCargo: berthCargo ?? [],
    // KPI 는 지도 상한(200척)과 무관하게 전체를 세야 하므로 매핑 전 원본에서 센다.
    realTrafficLiquidTotal: presentVessels.filter(
      (r) => shipType(r) === true || hasCargo(r)
    ).length,
    // 선종을 "모르는" 배 — 나머지를 일반화물선으로 읽는 오해를 막으려고 따로 센다.
    realTrafficUnknownTotal: presentVessels.filter(
      (r) => shipType(r) === null && !hasCargo(r)
    ).length,
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
