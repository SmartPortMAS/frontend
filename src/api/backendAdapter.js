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
// 로컬: uvicorn 8001 (mock 서버 8000과 공존). 배포: nginx가 /api/v1 프록시.
export const BACKEND_BASE = isDev ? 'http://localhost:8001/api/v1' : '/api/v1';

// AIS 항해상태 코드(ITU-R M.1371) → UI 카테고리
const NAV_CODE_TO_CATEGORY = {
  0: 'UNDER_WAY', 1: 'AT_ANCHOR', 2: 'UNKNOWN', 3: 'UNDER_WAY', 4: 'UNDER_WAY',
  5: 'MOORED', 6: 'AT_ANCHOR', 7: 'UNDER_WAY', 8: 'UNDER_WAY',
};

function navCategory(row) {
  const byCode = NAV_CODE_TO_CATEGORY[row.nav_status_code];
  if (byCode) return byCode;
  // 코드 결측 시 속력으로 추정: 1kn 미만이면 정박/계류로 본다
  const sog = row.sog ?? 0;
  return sog < 1 ? 'AT_ANCHOR' : 'UNDER_WAY';
}

function inUlsanBbox(row) {
  return (
    row.latitude >= ULSAN_BBOX.minLat && row.latitude <= ULSAN_BBOX.maxLat &&
    row.longitude >= ULSAN_BBOX.minLon && row.longitude <= ULSAN_BBOX.maxLon
  );
}

/** upa_vessel_position 행 → 기존 vessels 계약 필드 (+ is_real_ais 플래그) */
function mapVessel(row) {
  return {
    port_call_id: `AIS_${row.callsgn || row.mmsi}`,
    callsgn: row.callsgn,
    vessel_name: row.vessel_name,
    mmsi: row.mmsi,
    is_liquid_cargo_vessel: false, // 위치 API에는 화물 정보가 없다 (manifest 확보 시 연계)
    latitude: row.latitude,
    longitude: row.longitude,
    sog: row.sog,
    vessel_heading: row.heading || row.cog || 0,
    nav_status_category: navCategory(row),
    received_at_utc: row.received_at_utc,
    is_real_ais: true,
  };
}

/** /dashboard/weather 응답 → 기존 weather 계약 (wind_dir_deg는 백엔드 미제공 — 호출측에서 병합) */
function mapWeather(w) {
  return {
    wind_speed_ms: w.wind?.value ?? null,
    wind_dir_deg: null,
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
 * 백엔드 4개 엔드포인트를 병렬 호출해 대시보드 보강 데이터로 변환.
 * 기상+선박 둘 다 실패하면 null (백엔드 다운으로 간주 — 호출측이 기존 소스 유지).
 */
export async function fetchBackendDashboard() {
  const [weather, vessels, berths, anchorages] = await Promise.allSettled([
    getJson('/dashboard/weather'),
    getJson('/dashboard/vessels'),
    getJson('/dashboard/berths'),
    getJson('/dashboard/anchorages'),
  ]).then((rs) => rs.map((r) => (r.status === 'fulfilled' ? r.value : null)));

  if (!weather && !vessels) return null;

  return {
    weather: weather ? mapWeather(weather) : null,
    // 울산 bbox 내 + 최신 수신 순으로 상한 200척 (지도 성능 보호)
    realTraffic: (vessels ?? [])
      .filter((r) => r.latitude != null && r.longitude != null)
      .filter(inUlsanBbox)
      .sort((a, b) => new Date(b.received_at_utc) - new Date(a.received_at_utc))
      .slice(0, 200)
      .map(mapVessel),
    berthOccupancy: berths ?? [],
    anchorages: anchorages ?? [],
  };
}
