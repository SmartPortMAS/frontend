import { useMemo } from 'react';
import useDashboardData from '../../hooks/useDashboardData';
import useSensorStore from '../../stores/useSensorStore';
import { COLORS, NAV_STATUS } from '../../utils/constants';

const formatKST = (utcString) => {
  if (!utcString) return '-';
  return new Date(utcString).toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Asia/Seoul',
  });
};

const cellStyle = { padding: '10px 12px', fontSize: '13px', whiteSpace: 'nowrap' };
const headStyle = {
  ...cellStyle,
  color: COLORS.textSecondary,
  fontWeight: 'bold',
  textAlign: 'left',
  borderBottom: `1px solid ${COLORS.border}`,
};

export default function PortCallTable() {
  const { data } = useDashboardData();
  const setSelectedVessel = useSensorStore((s) => s.setSelectedVessel);

  // 최근 입항 순으로 정렬
  const vessels = useMemo(
    () => [...(data?.vessels ?? [])].sort(
      (a, b) => new Date(b.arrival_at_utc) - new Date(a.arrival_at_utc)
    ),
    [data]
  );

  return (
    <div className="glass-card">
      <div className="glass-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="glass-card-title">입항 선박 목록</h3>
        <span style={{ fontSize: '12px', color: COLORS.textDim }}>
          총 {vessels.length}척 · 위험물선 {vessels.filter((v) => v.is_liquid_cargo_vessel).length}척
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', color: COLORS.textPrimary }}>
          <thead>
            <tr>
              <th style={headStyle}>선박명</th>
              <th style={headStyle}>호출부호</th>
              <th style={headStyle}>상태</th>
              <th style={headStyle}>화물</th>
              <th style={headStyle}>배정 선석</th>
              <th style={headStyle}>속력</th>
              <th style={headStyle}>입항시각 (KST)</th>
            </tr>
          </thead>
          <tbody>
            {vessels.map((v) => {
              const status = NAV_STATUS[v.nav_status_category] || NAV_STATUS.UNKNOWN;
              return (
                <tr
                  key={v.port_call_id}
                  onClick={() => setSelectedVessel(v)}
                  style={{ borderBottom: `1px solid rgba(78, 205, 196, 0.06)`, cursor: 'pointer' }}
                  title="클릭하면 선박 상세 패널이 열립니다"
                >
                  <td style={{ ...cellStyle, fontWeight: 'bold' }}>
                    {v.vessel_name}
                    {v.is_liquid_cargo_vessel && (
                      <span style={{
                        marginLeft: '8px', background: COLORS.red, color: '#fff',
                        borderRadius: '4px', padding: '1px 6px', fontSize: '11px',
                      }}>위험물</span>
                    )}
                  </td>
                  <td style={{ ...cellStyle, color: COLORS.textSecondary }}>{v.callsgn}</td>
                  <td style={cellStyle}>
                    <span style={{
                      color: status.color, border: `1px solid ${status.color}`,
                      borderRadius: '999px', padding: '2px 10px', fontSize: '12px',
                    }}>
                      {status.label}
                    </span>
                  </td>
                  <td style={cellStyle}>
                    {v.cargo ? `${v.cargo.name} (${v.cargo.un_no})` : '일반화물'}
                  </td>
                  <td style={cellStyle}>
                    {v.berth
                      ? v.berth
                      : v.anchorage
                        ? <span style={{ color: COLORS.yellow }}>정박지 {v.anchorage} 대기</span>
                        : <span style={{ color: COLORS.textDim }}>-</span>}
                  </td>
                  <td style={{ ...cellStyle, color: COLORS.textSecondary }}>{v.sog} kn</td>
                  <td style={{ ...cellStyle, color: COLORS.textSecondary }}>{formatKST(v.arrival_at_utc)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
