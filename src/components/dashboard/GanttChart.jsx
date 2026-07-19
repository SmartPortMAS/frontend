import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

export default function GanttChart() {
  // Dummy data representing AI Agent scheduling
  const scheduleData = [
    { berth: 'B001 (OTK)', ship: 'S-BlueWhale', start: 0, duration: 4, fill: '#38bdf8' },
    { berth: 'B002 (OTK)', ship: 'S-OceanStar', start: 2, duration: 5, fill: '#10b981' },
    { berth: 'B004 (정일)', ship: 'S-Titan', start: 1, duration: 6, fill: '#f59e0b' },
    { berth: 'B006 (현대)', ship: 'S-Pioneer', start: 5, duration: 4, fill: '#8b5cf6' },
  ];

  return (
    <div className="glass-card full-width">
      <div className="glass-card-header">
        <h3 className="glass-card-title">AI 에이전트 자동 할당 선석 스케줄 (Gantt Chart)</h3>
      </div>
      <div style={{ width: '100%', height: '250px' }}>
        <ResponsiveContainer>
          <BarChart
            data={scheduleData}
            layout="vertical"
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" horizontal={true} vertical={true} />
            <XAxis type="number" domain={[0, 12]} tickFormatter={(val) => `+${val}h`} stroke="#8ba3b8" />
            <YAxis dataKey="berth" type="category" width={100} stroke="#8ba3b8" />
            <RechartsTooltip 
              cursor={{fill: 'rgba(255,255,255,0.05)'}}
              contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
            {/* Start offset (transparent) */}
            <Bar dataKey="start" stackId="a" fill="transparent" />
            {/* Duration */}
            <Bar dataKey="duration" stackId="a" radius={[4, 4, 4, 4]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
