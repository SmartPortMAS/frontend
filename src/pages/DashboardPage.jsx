import GanttChart from '../components/dashboard/GanttChart';
import KPICard from '../components/dashboard/KPICard';
import AgentConsole from '../components/dashboard/AgentConsole';
import WeatherPanel from '../components/dashboard/WeatherPanel';
import BerthWeatherPanel from '../components/dashboard/BerthWeatherPanel';
import PortMap from '../components/dashboard/PortMap';
import PortCallTable from '../components/dashboard/PortCallTable';
import VesselDetailPanel from '../components/dashboard/VesselDetailPanel';
import useSensorStore from '../stores/useSensorStore';
import useDashboardData from '../hooks/useDashboardData';
import { FaShip, FaWarehouse, FaAnchor, FaShieldAlt } from 'react-icons/fa';

export default function DashboardPage() {
  const gateAssessment = useSensorStore((s) => s.gateAssessment);
  const { data } = useDashboardData();

  // KPI는 실AIS(+실화물 조인) 기준으로 센다 — data.vessels는 데모 시나리오 선박이라
  // 실제 재항 척수와 무관하다.
  //
  // 지도는 성능 때문에 200척만 그리지만(MAP_VESSEL_LIMIT) KPI 는 전체를 센다.
  // 상한이 KPI 까지 잘라버리면 "관제 선박이 항상 200척"으로 보여 사실과 어긋난다.
  const vessels = data?.real_traffic ?? [];
  const vesselTotal = data?.real_traffic_total ?? vessels.length;
  const liquidCount = data?.real_traffic_liquid_total
    ?? vessels.filter((v) => v.is_liquid_cargo_vessel).length;
  // "액체화물선 66척"의 나머지를 일반화물선으로 읽으면 안 된다 — 대부분은 PORT-MIS
  // 대조가 안 돼 선종을 모르는 배다. 그 수를 KPI 부제에 같이 적어 오해를 막는다.
  const unknownCount = data?.real_traffic_unknown_total ?? 0;
  const mooredCount = vessels.filter((v) => v.nav_status_category === 'MOORED').length;
  // 정박지 대기 = AIS 가 '정박(앵커링)'이라고 명시한 배만 센다.
  // 항해상태 코드가 없는 배(대부분 Class B 소형 작업선)는 예전에 여기 섞여 있었다 —
  // 예선·급유선은 선석을 기다리는 배가 아니라 대기 척수를 부풀린다(backendAdapter 주석 참고).
  const anchorCount = vessels.filter((v) => v.nav_status_category === 'AT_ANCHOR').length;
  const unknownNavCount = vessels.filter((v) => v.nav_status_category === 'UNKNOWN').length;
  const gateHits = gateAssessment?.risk_level_basis?.gate_hits?.length ?? 0;

  // 온산 선석 점유 — 백엔드 /dashboard/berths(upa_port_call 실측 재항 기준).
  // 예전 "가동 탱크"는 useSensorStore의 하드코딩 탱크 4기를 세던 값이라
  // 실데이터 화면에 mock 숫자가 섞여 있었다.
  const onsanBerths = (data?.berth_occupancy ?? []).filter((b) => b.port_name === '온산항');
  const occupiedBerths = onsanBerths.filter((b) => b.occupancy_status === '점유').length;

  return (
    <div className="dashboard-page">
      <div className="kpi-grid">
        <KPICard title="관제 선박" value={vesselTotal} unit="척" icon={<FaShip />} change={`액체화물선 ${liquidCount}척 · 선종 미확인 ${unknownCount}척`} trend={liquidCount > 0 ? 'negative' : 'neutral'} />
        <KPICard title="접안 중" value={mooredCount} unit="척" icon={<FaAnchor />} change={`정박지 대기 ${anchorCount}척 · 항내 소형선 ${unknownNavCount}척`} trend="neutral" />
        <KPICard title="온산 선석 점유" value={occupiedBerths} unit="개" icon={<FaWarehouse />} change={`온산 선석 ${onsanBerths.length}개 중 재항 중`} trend="neutral" />
        <KPICard
          title="최근 안전 심사"
          value={gateAssessment?.risk_level ?? '심사 전'}
          unit=""
          icon={<FaShieldAlt />}
          change={gateAssessment ? (gateHits > 0 ? `혼재·격리 위반 ${gateHits}건` : '위반 없음') : '안전 관제 탭에서 실행'}
          trend={gateAssessment ? (gateHits > 0 ? 'negative' : 'positive') : 'neutral'}
        />
      </div>

      {/* 경고 센터는 헤더 알림 벨(AlertBell)로 옮겼다 — 재항 전수 판정으로 경고가
          36건까지 늘면서 첫 화면을 통째로 덮어, 지도·기상·선석 판정이 스크롤 아래로
          밀렸기 때문. 미확인 건수는 벨 배지에 항상 떠 있어 놓치지 않는다. */}

      {/* 온산 관제 지도 — 이 화면에서 가장 많이 들여다보는 패널이라 크게 잡는다.
          뷰포트에 맞춰 늘리되(62vh) 작은 화면에서도 지도 구실을 하도록 하한을 둔다. */}
      <div className="glass-card dash-section">
        <div className="glass-card-header">
          <h3 className="glass-card-title">온산항 관제 지도</h3>
        </div>
        <div style={{ height: 'clamp(460px, 62vh, 760px)' }}>
          <PortMap />
        </div>
      </div>

      {/* 기상 패널 (Full Width) */}
      <div className="dash-section">
        <WeatherPanel />
      </div>

      {/* 선석별 하역 판정 (온산 MVP, Full Width) */}
      <div className="dash-section">
        <BerthWeatherPanel />
      </div>

      {/* 선석 배정 시뮬레이션 패널은 내렸다(2026-08-21) — 협상 로그(우하단 콘솔)의
          스케줄링 발화가 같은 배정 경로(전용/대체/정박지)를 이미 보여준다. 같은
          판정을 두 곳에 그리면 어느 쪽이 정본인지 화면만 봐서는 알 수 없다.
          판정 실행과 결과 표시는 협상 로그 하나로 단일화. */}
      {/* Gantt Chart (Full Width) */}
      <div className="dash-section">
        <GanttChart />
      </div>

      {/* 입항 선박 목록 (Full Width) */}
      <div className="dash-section">
        <PortCallTable />
      </div>

      {/* 화면에서 내린 것들 —
          · 탱크 저장 현황: 센서 데이터 탭의 탱크 센서와 같은 값을 두 번 그리고 있었다.
          · 시간대별 처리량/안전지수 차트: chartData가 코드에 박힌 고정 배열이었다.
            유량계가 없어 처리량 실측 소스가 없는데 그럴듯한 곡선을 그리면,
            실데이터로 채운 나머지 화면까지 같이 의심받는다.
          · 협상 로그(NegotiationChat): 하드코딩 대화 — 우하단 AgentConsole로 대체. */}

      {/* 선박 상세 패널 (지도 마커/입항 목록/경고 벨에서 선박 클릭 시) */}
      <VesselDetailPanel />

      {/* 멀티 에이전트 협상 콘솔 — 판정 진입점 단일화 (우하단 고정 탭) */}
      <AgentConsole />
    </div>
  );
}
