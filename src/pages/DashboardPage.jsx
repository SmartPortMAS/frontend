import { useState } from 'react';
import KPICard from '../components/dashboard/KPICard';
import TankGauge from '../components/dashboard/TankGauge';
import GanttChart from '../components/dashboard/GanttChart';
import NegotiationChat from '../components/dashboard/NegotiationChat';
import useSensorStore from '../stores/useSensorStore';
import { FaShip, FaWarehouse, FaTint, FaShieldAlt } from 'react-icons/fa';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

export default function DashboardPage() {
  const { tanks, systemStatus } = useSensorStore();

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
        <KPICard title="접안 선박" value={systemStatus.activeShips} unit="척" icon={<FaShip />} change="+1 (전일 대비)" />
        <KPICard title="가동 탱크" value={tanks.filter(t => t.status === 'active').length} unit="기" icon={<FaWarehouse />} change="정상 가동" trend="neutral" />
        <KPICard title="총 처리량" value="124,500" unit="ton" icon={<FaTint />} change="+5.2%" trend="positive" />
        <KPICard title="안전 지수" value="98" unit="/ 100" icon={<FaShieldAlt />} change="매우 양호" trend="positive" />
      </div>

      {/* Gantt Chart (Full Width) */}
      <div style={{ marginBottom: '20px' }}>
        <GanttChart />
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

        {/* Right Column: Negotiation Chat */}
        <NegotiationChat />
      </div>
    </div>
  );
}
