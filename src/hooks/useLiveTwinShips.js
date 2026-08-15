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
const TWIN_SHIP_LIMIT = 12;

/** AIS 카테고리 + 접안 선석 유무 → 트윈 상태 어휘 */
function twinStatus(vessel, berthId) {
  const cat = vessel.nav_status_category;
  if (cat === 'MOORED') {
    // 화물을 싣고 접안해 있으면 하역 중으로 본다. 화물을 모르면 계류까지만.
    return vessel.cargo ? 'operating' : 'mooring';
  }
  if (cat === 'AT_ANCHOR') return 'anchored';
  // 항해 중인데 접안 선석이 확인되면 그 선석으로 들어오는 중으로 본다
  if (berthId) return 'arriving';
  return 'approaching';
}

/**
 * 실 AIS + 재항 화물을 트윈 선박 목록으로 바꿔 스토어에 넣는다.
 * 디지털트윈 페이지에서 한 번만 호출한다.
 */
export default function useLiveTwinShips() {
  const { data } = useDashboardData();
  const setShips = useSensorStore((s) => s.setShips);

  useEffect(() => {
    const traffic = data?.real_traffic ?? [];
    if (!traffic.length || !setShips) return;

    // 온산 선석이 확인된 배를 먼저 세운다 — 트윈은 온산 부두를 그린 화면이라
    // 선석을 모르는 배만 잔뜩 띄우면 부두가 비어 보인다.
    const ranked = [...traffic].sort((a, b) => {
      const aB = a.berth ? 0 : 1;
      const bB = b.berth ? 0 : 1;
      if (aB !== bB) return aB - bB;
      return (b.cargo ? 1 : 0) - (a.cargo ? 1 : 0);
    });

    const ships = ranked.slice(0, TWIN_SHIP_LIMIT).map((v) => {
      const berthId = v.berth ? findBerthIdByName(v.berth) : null;
      return {
        id: v.vessel_name || v.callsgn || `MMSI ${v.mmsi}`,
        type: 'Ship',
        status: twinStatus(v, berthId),
        berth: berthId,
        anchorage: null,
        // 실좌표가 있으면 Ship 컴포넌트가 계산 경로 대신 이 값을 그대로 쓴다
        vessel_lat: v.latitude,
        vessel_lon: v.longitude,
        vessel_heading: v.vessel_heading,
        vessel_speed: v.sog,
        cargoType: v.cargo?.name || null,
        cargoAmount: null, // 적재량은 수집 소스가 없다 — 지어내지 않고 비운다
        callsgn: v.callsgn,
        mmsi: v.mmsi,
        is_liquid_cargo_vessel: v.is_liquid_cargo_vessel,
        is_real: true,
      };
    });

    setShips(ships);
  }, [data, setShips]);
}
