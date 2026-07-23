import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import useSensorStore from '../../stores/useSensorStore';
import { COLORS } from '../../utils/constants';

// 온산 액체부두 선석 스케줄 mock (입항 목록의 배정과 일치)
const BASE_SCHEDULE = [
  { berth: 'OTK 1부두', ship: 'HMM GOODWILL (에탄올)', start: 0, duration: 5, fill: '#38bdf8' },
  { berth: 'OTK 2부두', ship: 'GAS UTOPIA (부타디엔)', start: 6, duration: 4, fill: '#10b981' },
  { berth: '정일 1부두', ship: 'WOOYANG CHEMI (자일렌)', start: 1, duration: 6, fill: '#f59e0b' },
  { berth: 'S-Oil 1부두', ship: 'PACIFIC GLORY (등유)', start: 2, duration: 7, fill: '#8b5cf6' },
  { berth: 'S-Oil 2부두', ship: 'ULSAN PIONEER (가솔린)', start: 5, duration: 5, fill: '#4ecdc4' },
];

export default function GanttChart() {
  const orchestration = useSensorStore((s) => s.orchestration);

  // 배정 시뮬레이션에서 승인된 건을 스케줄 맨 위에 반영 (같은 선석 mock 행은 대체)
  const scheduleData = useMemo(() => {
    if (orchestration?.status !== 'APPROVED' || !orchestration.berth_assigned) return BASE_SCHEDULE;
    const simRow = {
      berth: orchestration.berth_assigned,
      ship: `${orchestration.vessel_name} (${orchestration.cargo_name}) — 시뮬레이션 배정`,
      start: 8,
      duration: 5,
      fill: COLORS.teal,
      sim: true,
    };
    return [simRow, ...BASE_SCHEDULE.filter((r) => r.berth !== simRow.berth)];
  }, [orchestration]);

  return (
    <div className="glass-card full-width">
      <div className="glass-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="glass-card-title">AI 에이전트 자동 할당 선석 스케줄 (Gantt Chart)</h3>
        {scheduleData[0]?.sim && (
          <span style={{ fontSize: '12px', color: COLORS.teal }}>
            ● 시뮬레이션 배정 반영: {scheduleData[0].berth}
          </span>
        )}
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
              labelFormatter={(label, payload) =>
                payload?.[0]?.payload ? `${label} · ${payload[0].payload.ship}` : label}
              formatter={(value, name) => [`${value}h`, name === 'duration' ? '작업시간' : '시작(+h)']}
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
