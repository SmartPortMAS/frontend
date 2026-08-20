import { useEffect, useState } from 'react';
import useOnsanApi from './useOnsanApi';
import useDashboardData from './useDashboardData';
import { onsanAdjacentBerthNames } from '../utils/geoUtils';

// ─────────────────────────────────────────────
// 선박별 안전 판정 — 백엔드 안전 에이전트(POST /api/v1/safety/assess) 직결.
//
// 이전에는 mocks/mockAssessment.js 가 UN번호 4개짜리 하드코딩 표로 판정을 만들었다.
// 표에 없는 화물은 전부 '안전'을 반환해서, 두 가지 문제가 있었다.
//   1) 위반 케이스(UN1978 프로페인·UN1830 황산 등)가 화면에서 '안전'으로 보였다.
//   2) "모르면 가능하다고 하지 않는다"는 우리 설계 원칙과 정반대였다.
// 이제 판정은 실제 MSDS·IMDG 격리 검사에서 나오고, 모르는 화물은 '판단불가'다.
//
// 인접 선석은 ONSAN_ADJACENCY(좌표거리 500m 임계)로 구하고, 그 선석에 실제로
// 접안해 있는 선박의 화물만 인접 작업으로 넘긴다 — 혼재 판정의 입력이 실제 현황이 된다.
// ─────────────────────────────────────────────

const EMPTY = { risk_level: '안전', gates_hit: [], checklist: [], source: 'NOT_APPLICABLE' };

/** 백엔드 판정 결과 → 화면이 쓰던 계약(risk_level/gates_hit/checklist)으로 변환 */
function toPanelShape(result) {
  return {
    risk_level: result.risk_level,
    gates_hit: (result.gates || []).filter((g) => g.hit).map((g) => ({
      rule: g.rule, severity: g.severity, reason: g.reason,
    })),
    checklist: result.explanation?.checklist || [],
    summary: result.explanation?.summary || '',
    hazards: result.explanation?.reasoning || [],
    basis: result.risk_level_basis,
    msds_sections_used: result.msds_sections_used || [],
    is_local_fallback: Boolean(result.is_local_fallback),
    source: result.source,
  };
}

export default function useVesselSafety(vessel) {
  const { assessSafetyGates } = useOnsanApi();
  const { data } = useDashboardData();
  const [state, setState] = useState({ assessment: null, loading: false });

  const cargoName = vessel?.cargo?.name || null;
  const cargoCasNo = vessel?.cargo?.cas_no || null;
  const berth = vessel?.berth || null;
  const isLiquid = Boolean(vessel?.is_liquid_cargo_vessel);

  // 인접 선석에 실제로 접안 중인 선박의 화물 — 혼재 판정 입력.
  // data.real_traffic(실AIS+실화물 조인)을 써야 한다 — data.vessels는 mock 데모
  // 선박 목록이라 여기서 찾으면 실제로 접안 중인 선박과 거의 겹치지 않아 인접
  // 화물이 항상 빈 배열로 잡히고(=혼재 검사가 사실상 무력화), cas_no도 없다.
  const adjacent = (() => {
    if (!berth) return [];
    const names = onsanAdjacentBerthNames(berth);
    return (data?.real_traffic || [])
      .filter((v) => v.berth && names.includes(v.berth) && v.cargo?.name
        && v.port_call_id !== vessel?.port_call_id)
      .map((v) => ({ berth_name: v.berth, cargo_name: v.cargo.name, cas_no: v.cargo.cas_no }));
  })();

  const adjacentKey = adjacent.map((a) => `${a.berth_name}:${a.cargo_name}`).join('|');

  useEffect(() => {
    if (!isLiquid || !cargoName) {
      setState({ assessment: null, loading: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    // cas_no는 실화물 조인(mart.berth_current_cargo)에서 이미 확정된 값이라
    // 그대로 넘긴다 — 화물명 하드코딩 사전(cargoRef)을 안 거치므로 표기 불일치로
    // 인한 "CAS 매핑 없음" 오탐이 없다.
    assessSafetyGates({ cargo_name: cargoName, cas_no: cargoCasNo, adjacent_operations: adjacent })
      .then((res) => {
        if (!cancelled) setState({ assessment: toPanelShape(res), loading: false });
      })
      .catch(() => {
        // 실패해도 '안전'으로 떨어뜨리지 않는다 — fail-safe
        if (!cancelled) {
          setState({
            assessment: {
              risk_level: '판단불가', gates_hit: [{
                rule: '-', severity: 'HOLD',
                reason: '안전 에이전트 조회 실패 — 판단 보류(fail-safe)',
              }], checklist: [], is_local_fallback: true, source: 'ERROR',
            },
            loading: false,
          });
        }
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargoName, cargoCasNo, berth, isLiquid, adjacentKey]);

  // 액체화물선이 아니거나 화물 정보가 없으면 판정 대상이 아니다
  if (!isLiquid || !cargoName) return { assessment: EMPTY, loading: false };
  return state.assessment
    ? { assessment: state.assessment, loading: state.loading }
    : { assessment: null, loading: true };
}
