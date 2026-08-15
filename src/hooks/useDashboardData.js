import { useEffect, useReducer } from 'react';
import { fetchBackendDashboard } from '../api/backendAdapter';
import { mockDashboard, advanceMockVessels } from '../mocks/mockDashboard';

// true 로 두면 서버를 전혀 부르지 않고 브라우저 내장 mock 만 쓴다(오프라인 확인용).
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
      // 실데이터는 전부 백엔드(8001)에서 온다.
      //
      // 예전에는 mock-server(8000)도 함께 호출해 병합했다. 백엔드가 대시보드용
      // 조회를 갖추기 전에 DB 를 직접 읽어 화면을 채우던 임시 서버였는데,
      // 2026-08-15 기준 그쪽이 주던 실데이터(선박·기상·통계·경고·이력·수집상태)를
      // 백엔드가 전부 제공한다(실측 대조 완료). 두 서버를 병합하면 같은 값이
      // 서로 다른 시점·다른 관측소에서 와 짝이 어긋날 수 있어 하나로 정리한다.
      //
      // 내장 mock(mockDashboard)은 시연용 스토리 선박과 하역 진행률에만 쓴다 —
      // 둘 다 실데이터 소스가 없는 항목이다(진행률은 유량 센서 미설치).
      // 실선박이 하나라도 잡히면 화면은 그쪽을 쓰므로 평상시엔 보이지 않는다.
      const backend = await fetchBackendDashboard();
      if (!backend) throw new Error('백엔드 응답 없음 (8001)');

      const base = advanceMockVessels(dataRef); // 시연용 선박·하역작업 (실소스 없음)
      const merged = {
        ...base,
        // 기상은 전부 백엔드(mart.weather_now) — 풍속·풍향·돌풍이 같은 관측에서 온다
        weather: backend.weather,
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
        // 통계·수집상태 모두 백엔드. 예전 mock-server 전용 필드
        // (onsan_port_calls/ais_position_rows)는 백엔드에 대응 개념이 없어 사라진다 —
        // 화면에서 쓰지 않던 값이라 영향 없다.
        stats: {
          ...(backend.stats ?? {}),
          pipeline_health: backend.pipelineHealth ?? null,
        },
        liquid_callsgns: backend.stats?.liquid_callsgns ?? [],
        // 경고는 safety 규칙엔진 실판정. 0건도 그대로 쓴다 —
        // "위험 없음"을 mock 경고로 덮으면 없는 위험을 지어내는 셈이다.
        alerts: backend.alerts ?? [],
        data_source: {
          backend: 'CONNECTED',
          weather: 'REAL', stats: 'REAL',
          history: backend.history?.length ? 'REAL' : 'NONE',
          alerts: 'REAL_RULE_ENGINE',
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
