import { useEffect } from 'react';
import useDashboardData from './useDashboardData';
import useSensorStore from '../stores/useSensorStore';
import { findBerthIdByName } from '../utils/geoUtils';

// ─────────────────────────────────────────────────────────────────────────────
// 디지털 트윈 선박을 실데이터로 채운다.
//
// 여태 트윈의 선박 6척은 useSensorStore 에 상태까지 박혀 있는 고정값이었다
// ("HMM GOODWILL 하역 중" 같은). 갱신 경로(updateFromSensor)는 있었지만 부르는
// 곳이 없었다 — 백엔드에 웹소켓이 없어서다.
//
// 그런데 트윈이 필요로 하는 값은 이미 전부 수집돼 있다:
//   위치·침로·속력·항해상태 → AIS (upa_vessel_position)
//   접안 선석·화물          → mart.berth_current_cargo
// 그래서 웹소켓 없이도 대시보드와 같은 폴링 데이터로 트윈을 채울 수 있다.
//
// [상태를 어떻게 정하나]
// AIS 항해상태(nav_status_code)를 그대로 쓰되, 트윈이 아는 어휘로 옮긴다.
// 상태를 지어내지 않는다 — 판단 근거가 없으면 '항해 중'으로 두고, 접안 선석을
// 아는 배만 계류로 본다(선석을 모르면 3D 상에 세울 자리도 없다).
// ─────────────────────────────────────────────────────────────────────────────

// 트윈에 세울 선박 수 상한. 3D 오브젝트가 많아지면 프레임이 떨어진다.
const TWIN_SHIP_LIMIT = 14;

// 트윈이 그리는 범위는 온산 일대뿐이다. 울산 전역의 배를 그대로 투영하면
// 대부분이 화면 밖 먼 곳에 놓여 "배가 하나도 없는" 것처럼 보인다(실측: 신호가
// 살아있는 368척 중 온산 근접은 103척). 이 사각형 밖은 트윈 대상이 아니다.
const ONSAN_BOX = { minLat: 35.40, maxLat: 35.50, minLon: 129.32, maxLon: 129.42 };

function inOnsan(v) {
  return v.latitude != null && v.longitude != null
    && v.latitude >= ONSAN_BOX.minLat && v.latitude <= ONSAN_BOX.maxLat
    && v.longitude >= ONSAN_BOX.minLon && v.longitude <= ONSAN_BOX.maxLon;
}

/** AIS 카테고리 + 접안 선석 유무 → 트윈 상태 어휘 */
function twinStatus(vessel, berthId) {
  const cat = vessel.nav_status_category;
  if (cat === 'MOORED') {
    // 접안까지만 안다. '하역 중'은 유량계·작업 개시 기록이 없어 알 수 없으므로
    // 지어내지 않는다(2026-09-24 — 예전엔 화물 신고만 있으면 전부 '하역 중'으로 떠
    // 14척이 모두 하역 중으로 보였다). 하역 여부는 게이트(센서 데이터)가 말한다.
    return 'mooring';
  }
  if (cat === 'AT_ANCHOR') return 'anchored';
  // 항해상태 필드가 없는 배(Class B 소형 작업선)는 묘박으로 세지 않는다 —
  // 예선·급유선을 정박지 대기로 세면 선석을 기다리는 본선 수가 부풀려진다.
  if (cat === 'UNKNOWN') return 'service';
  // 항해 중인 배는 '입항 중'으로 단정하지 않는다 — 나가는 배일 수도, 지나가는
  // 배일 수도 있다. AIS 항해상태만으로는 방향을 알 수 없으므로 '항해 중'으로 둔다.
  // (예전에는 접안 선석이 확인되면 arriving 으로 단정했는데, 그 배가 이미 항만
  //  안쪽에 떠 있으면 "입항 중인데 부두 안에 있는" 모순으로 보였다.)
  return 'underway';
}

/**
 * 실 AIS + 재항 화물을 트윈 선박 목록으로 바꿔 스토어에 넣는다.
 * 디지털트윈 페이지에서 한 번만 호출한다.
 */
export default function useLiveTwinShips() {
  const { data } = useDashboardData();
  const setShips = useSensorStore((s) => s.setShips);

  useEffect(() => {
    if (!setShips) return;
    const traffic = (data?.real_traffic ?? []).filter(inOnsan);
    // 온산 범위에 배가 없으면 빈 목록을 그대로 넣는다 — 직전 목록을 남겨 두면
    // 수집이 끊긴 화면이 "배가 있다"고 말하게 된다.
    if (!traffic.length) { setShips([]); return; }

    // 선석은 위치 판정(presence_berth_name — 멈춰서 선석에 붙은 배)을 먼저 쓴다.
    // v.berth 는 재항 화물 신고에서 온 값이라 화물이 안 붙은 배는 선석에 붙어 있어도
    // 비어 있었다(2026-09-21: 장면 선석 11곳에 붙은 10척 중 화물 없는 배는 바다에 떴다).
    const berthOf = (v) => v.presence_berth_name || v.berth || null;

    // 온산 선석이 확인된 배를 먼저 세운다 — 트윈은 온산 부두를 그린 화면이라
    // 선석을 모르는 배만 잔뜩 띄우면 부두가 비어 보인다.
    const ranked = [...traffic].sort((a, b) => {
      const aB = berthOf(a) ? 0 : 1;
      const bB = berthOf(b) ? 0 : 1;
      if (aB !== bB) return aB - bB;
      return (b.cargo ? 1 : 0) - (a.cargo ? 1 : 0);
    });

    const ships = ranked.slice(0, TWIN_SHIP_LIMIT).map((v) => {
      const berthName = berthOf(v);
      const berthId = berthName ? findBerthIdByName(berthName) : null;
      return {
        id: v.vessel_name || v.callsgn || `MMSI ${v.mmsi}`,
        type: 'Ship',
        status: twinStatus(v, berthId),
        berth: berthId,
        anchorage: null,
        // 접안한 배는 실좌표 대신 그 선석의 3D 위치에 세운다.
        //
        // 3D 부두는 실측 좌표를 옮겨 그린 것이지만 잔교·안벽은 보기 좋게 이격해
        // 배치했다. 접안선을 AIS 좌표 그대로 찍으면 몇십 미터 오차로도 안벽을
        // 파고들거나 육지 위에 뜬다. "어느 선석에 붙었나"는 이미 아는 정보이므로
        // 그 선석 자리에 세우는 편이 정확하고 보기에도 맞다.
        // 항해·묘박 중인 배만 실좌표를 쓴다(있어야 할 자리가 바다라서 문제없다).
        vessel_lat: berthId ? null : v.latitude,
        vessel_lon: berthId ? null : v.longitude,
        vessel_heading: v.vessel_heading,
        vessel_speed: v.sog,
        cargoType: v.cargo?.name || null,
        cargoAmount: null, // 적재량은 수집 소스가 없다 — 지어내지 않고 비운다
        callsgn: v.callsgn,
        mmsi: v.mmsi,
        is_liquid_cargo_vessel: v.is_liquid_cargo_vessel,
        is_real: true,
        // 정밀 검토(Omniverse) 지목에 쓰는 마스터 표기 선석명 — 3D 선석 id 와 별도로 둔다
        berth_name: berthName,
      };
    });

    setShips(ships);
  }, [data, setShips]);
}
