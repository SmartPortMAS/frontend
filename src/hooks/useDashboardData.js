import { useEffect, useReducer } from 'react';
import { API_BASE } from '../utils/constants';
import { fetchBackendDashboard } from '../api/backendAdapter';
import { mockDashboard, advanceMockVessels } from '../mocks/mockDashboard';

// false: GET /api/dashboard 사용 (지금은 mock-server/dashboard_server.py,
// 김동안 백엔드 완성 시 동일 계약으로 자동 대체). true: 브라우저 내장 mock.
const USE_MOCK = false;

// 폴링 주기 3분. 원본 근거 데이터가 조위 10분·파고 30분 주기로만 갱신되고
// (data-pipeline ENVIRONMENTAL_PIPELINE.md) 백엔드 자체 "오래됨" 기준도 3시간이라
// (dashboard.py _OBS_MAX_AGE_HOURS) 30초 폴링은 실제 갱신 속도보다 과했다.
// 급히 최신값이 필요하면 헤더의 수동 새로고침 버튼(refresh())을 쓴다.
const POLL_INTERVAL_MS = 3 * 60_000;

// ── 컴포넌트 11곳이 각자 이 훅을 부른다(Header/PortMap/AgentConsole/...).
// 이전엔 훅 안에 useState로 상태를 뒀는데, 그러면 호출한 컴포넌트 수만큼
// 폴링 루프가 독립적으로 돌아 같은 엔드포인트를 동시에 여러 번 때렸다
// (실측: 대시보드 화면 하나에서 컴포넌트당 1회씩, 총 8~9배 중복 호출).
// 모듈 스코프에 상태를 한 벌만 두고 구독자에게 브로드캐스트하는 방식으로
// 바꿔 폴링/새로고침이 앱 전체에서 정확히 1번만 실행되게 한다.
let sharedData = mockDashboard;
let sharedLoading = !USE_MOCK;
let sharedError = null;
let dataRef = mockDashboard; // mock 모드에서 "이전 상태 기준 이동" 계산용
let inFlight = null; // 동시에 여러 곳에서 refresh()를 불러도 요청은 한 번만
const subscribers = new Set();

function notify() {
  subscribers.forEach((fn) => fn());
}

async function doRefresh() {
  if (inFlight) return inFlight; // 이미 진행 중이면 그 요청 결과를 같이 기다린다

  inFlight = (async () => {
    if (USE_MOCK) {
      dataRef = advanceMockVessels(dataRef);
      sharedData = dataRef;
      notify();
      return;
    }
    try {
      sharedLoading = true;
      notify();
      // mock 서버와 실백엔드(dev 머지본)를 모두 8000에서 병렬 호출해 병합한다.
      // 어느 한쪽이 죽어도 나머지로 화면이 유지된다.
      const [baseRes, backend] = await Promise.allSettled([
        fetch(`${API_BASE}/dashboard`).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }),
        fetchBackendDashboard(),
      ]).then((rs) => rs.map((r) => (r.status === 'fulfilled' ? r.value : null)));

      if (!baseRes && !backend) throw new Error('mock 서버·백엔드 모두 응답 없음');

      const base = baseRes ?? advanceMockVessels(dataRef); // 서버 다운 시 내장 mock 유지
      const merged = {
        ...base,
        // 기상은 백엔드(실 API) 우선 — 단 풍향은 백엔드 미제공이라 기존 값 유지
        weather: backend?.weather
          ? { ...backend.weather, wind_dir_deg: base.weather?.wind_dir_deg ?? null }
          : base.weather,
        real_traffic: backend?.realTraffic ?? [],
        berth_occupancy: backend?.berthOccupancy ?? [],
        anchorage_status: backend?.anchorages ?? [],
        draught_checks: backend?.draughtChecks ?? [],
        // GanttChart가 기다리는 "실제 접안 이력" — base의 데모 작업(is_real_record=false)은
        // 그대로 두고 백엔드 실이력만 얹는다(중복 방지로 base 쪽 실이력이 있었다면 걷어냄).
        operations: [
          ...(base.operations ?? []).filter((o) => !o.is_real_record),
          ...(backend?.history ?? []),
        ],
        // pipeline_health는 헤더 신선도 배지용 — 백엔드 우선, 없으면 mock-server 값 유지.
        // onsan_port_calls/ais_position_rows는 mock-server 전용 필드라 백엔드엔 없다.
        stats: {
          ...(base.stats ?? {}),
          ...(backend?.stats ?? {}),
          pipeline_health: backend?.pipelineHealth ?? base.stats?.pipeline_health ?? null,
        },
        liquid_callsgns: backend?.stats?.liquid_callsgns ?? base.liquid_callsgns ?? [],
        data_source: {
          ...(base.data_source ?? {}),
          backend: backend ? 'CONNECTED' : 'DOWN',
          history: backend?.history?.length ? 'REAL' : (base.data_source?.history ?? null),
        },
      };
      dataRef = merged;
      sharedData = merged;
      sharedError = null;
    } catch (e) {
      sharedError = e.message;
    } finally {
      sharedLoading = false;
      notify();
    }
  })();

  try {
    await inFlight;
  } finally {
    inFlight = null;
  }
}

let pollTimer = null;

/**
 * 대시보드 데이터(선박·기상·경고)를 앱 전체에서 공유하는 훅.
 * 여러 컴포넌트가 동시에 호출해도 폴링·요청은 한 벌만 돈다(모듈 스코프 싱글턴).
 * mock 모드에서는 폴링 시점마다 항해 중 선박을 조금씩 움직여 실시간처럼 보이게 한다.
 *
 * @returns {{ data: object, loading: boolean, error: string|null, refresh: () => void }}
 */
export default function useDashboardData() {
  const [, forceRender] = useReducer((c) => c + 1, 0);

  useEffect(() => {
    subscribers.add(forceRender);
    if (subscribers.size === 1) {
      doRefresh();
      pollTimer = setInterval(doRefresh, POLL_INTERVAL_MS);
    }
    return () => {
      subscribers.delete(forceRender);
      if (subscribers.size === 0 && pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };
  }, []);

  return { data: sharedData, loading: sharedLoading, error: sharedError, refresh: doRefresh };
}
