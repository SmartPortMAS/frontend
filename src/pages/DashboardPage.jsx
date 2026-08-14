import { useState } from 'react';
import KPICard from '../components/dashboard/KPICard';
import TankGauge from '../components/dashboard/TankGauge';
import GanttChart from '../components/dashboard/GanttChart';
import AgentConsole from '../components/dashboard/AgentConsole';
import WeatherPanel from '../components/dashboard/WeatherPanel';
import BerthWeatherPanel from '../components/dashboard/BerthWeatherPanel';
import BerthDecisionPanel from '../components/dashboard/BerthDecisionPanel';
import PortMap from '../components/dashboard/PortMap';
import PortCallTable from '../components/dashboard/PortCallTable';
import AlertCenter from '../components/dashboard/AlertCenter';
import VesselDetailPanel from '../components/dashboard/VesselDetailPanel';
import useSensorStore from '../stores/useSensorStore';
import useDashboardData from '../hooks/useDashboardData';
import { FaShip, FaWarehouse, FaAnchor, FaShieldAlt } from 'react-icons/fa';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

export default function DashboardPage() {
  const { tanks } = useSensorStore();
  const gateAssessment = useSensorStore((s) => s.gateAssessment);
  const { data } = useDashboardData();

  // KPI는 실AIS(+실화물 조인) 기준으로 센다 — data.vessels는 데모 시나리오 선박(mock-server
  // 전용, 지금 꺼져있어 항상 브라우저 내장 mock으로 폴백)이라 실제 재항 척수와 무관하다.
  const vessels = data?.real_traffic ?? [];
  const liquidCount = vessels.filter((v) => v.is_liquid_cargo_vessel).length;
  const mooredCount = vessels.filter((v) => v.nav_status_category === 'MOORED').length;
  const anchorCount = vessels.filter((v) => v.nav_status_category === 'AT_ANCHOR').length;
  const gateHits = gateAssessment?.risk_level_basis?.gate_hits?.length ?? 0;

  const chartData = [
    { time: '10:00', load: 45, safe: 100 },
    { time: '11:00', load: 52, safe: 98 },
    { time: '12:00', load: 60, safe: 95 },
    { time: '13:00', load: 78, safe: 85 },
    { time: '14:00', load: 65, safe: 90 },
    { time: '15:00', load: 55, safe: 95 },
    { time: '16:00', load: 82, safe: 80 },
  ];

  return (
    <div className="dashboard-page">
      <div className="kpi-grid">
        <KPICard title="관제 선박" value={vessels.length} unit="척" icon={<FaShip />} change={`위험물선 ${liquidCount}척`} trend={liquidCount > 0 ? 'negative' : 'neutral'} />
        <KPICard title="접안 중" value={mooredCount} unit="척" icon={<FaAnchor />} change={`묘박/정박지 대기 ${anchorCount}척`} trend="neutral" />
        <KPICard title="가동 탱크" value={tanks.filter(t => t.status === 'active').length} unit="기" icon={<FaWarehouse />} change="정상 가동" trend="neutral" />
        <KPICard
          title="최근 안전 심사"
          value={gateAssessment?.risk_level ?? '심사 전'}
          unit=""
          icon={<FaShieldAlt />}
          change={gateAssessment ? `게이트 15개 중 ${gateHits}건 히트` : '안전 관제 탭에서 실행'}
          trend={gateAssessment ? (gateHits > 0 ? 'negative' : 'positive') : 'neutral'}
        />
      </div>

      {/* 경고 센터: 확인(ACK) 워크플로 (Full Width) */}
      <div style={{ marginBottom: '20px' }}>
        <AlertCenter />
      </div>

      {/* 기상 패널 (Full Width) */}
      <div style={{ marginBottom: '20px' }}>
        <WeatherPanel />
      </div>

      {/* 선석별 하역 판정 (온산 MVP, Full Width) */}
      <div style={{ marginBottom: '20px' }}>
        <BerthWeatherPanel />
      </div>

      {/* 온산 관제 지도: 선석 + ADJACENT_TO + 선박 (Full Width) */}
      <div className="glass-card" style={{ marginBottom: '20px', padding: '12px' }}>
        <div className="glass-card-header">
          <h3 className="glass-card-title">온산항 관제 지도</h3>
        </div>
        <div style={{ height: '440px' }}>
          <PortMap />
        </div>
      </div>

      {/* 선석 배정 시뮬레이션 (Full Width) */}
      <div style={{ marginBottom: '20px' }}>
        <BerthDecisionPanel />
      </div>

      {/* Gantt Chart (Full Width) */}
      <div style={{ marginBottom: '20px' }}>
        <GanttChart />
      </div>

      {/* 입항 선박 목록 (Full Width) */}
      <div style={{ marginBottom: '20px' }}>
        <PortCallTable />
      </div>

      <div className="dashboard-grid">
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="glass-card">
            <div className="glass-card-header">
              <h3 className="glass-card-title">탱크 저장 현황 (Level %)</h3>
            </div>
            <div className="tank-gauge-grid">
              {tanks.slice(0, 4).map(tank => (
                <TankGauge key={tank.id} tank={tank} />
              ))}
            </div>
          </div>
          
          <div className="glass-card">
            <div className="glass-card-header">
              <h3 className="glass-card-title">시간대별 처리량 및 안전 지수</h3>
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorLoad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00d4aa" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#00d4aa" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(78, 205, 196, 0.1)" />
                  <XAxis dataKey="time" stroke="#8ba3b8" fontSize={12} tickLine={false} />
                  <YAxis stroke="#8ba3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'rgba(13, 27, 42, 0.9)', border: '1px solid rgba(78, 205, 196, 0.2)', borderRadius: '8px' }}
                    itemStyle={{ color: '#e8f0f2', fontSize: '13px' }}
                  />
                  <Area type="monotone" dataKey="load" stroke="#00d4aa" fillOpacity={1} fill="url(#colorLoad)" strokeWidth={2} name="처리량 (ton)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* 협상 로그는 우하단 플로팅 콘솔(AgentConsole)로 이동했다.
            기존 NegotiationChat 은 하드코딩 대화라 화면에서 내린다. */}
      </div>

      {/* 선박 상세 패널 (지도 마커/입항 목록/경고 센터에서 선박 클릭 시) */}
      <VesselDetailPanel />

      {/* 멀티 에이전트 협상 콘솔 — 판정 진입점 단일화 (우하단 고정 탭) */}
      <AgentConsole />
    </div>
  );
}
